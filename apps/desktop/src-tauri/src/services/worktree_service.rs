//! Git-worktree business logic — the desktop replacement for the user's `wt`/`rmwt`
//! scripts. Composes the [`GitCli`] client (git bookkeeping) and the [`TmuxCli`] client
//! (sessions) plus the OS-specific terminal launch in [`crate::platform::os`], and
//! persists the user-curated list of managed repos as JSON in `settings` (via
//! [`SettingsRepository`]) — no dedicated table.
//!
//! Conventions match the scripts so both interoperate: worktrees live in a `worktrees/`
//! directory beside the repo (`<repo-parent>/worktrees/<repo>/<branch>`) and each gets a
//! tmux session named `<repo>-<branch>` whose first window runs `claude`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::clients::git_cli::GitCli;
use crate::clients::tmux_cli::TmuxCli;
use crate::core::error::{AppError, AppResult};
use crate::core::models::{ManagedRepo, PruneCandidate, Worktree};
use crate::platform::os;
use crate::repository::SettingsRepository;

/// `settings` key holding the JSON-encoded `Vec<ManagedRepo>` the user curates.
const MANAGED_REPOS_KEY: &str = "worktree_managed_repos";

/// The name of the tmux window Claude runs in.
const CLAUDE_WINDOW: &str = "claude";

pub struct WorktreeService {
    git_cli: GitCli,
    tmux_cli: TmuxCli,
    settings_repository: SettingsRepository,
}

impl WorktreeService {
    pub fn new(git_cli: GitCli, tmux_cli: TmuxCli, settings_repository: SettingsRepository) -> Self {
        Self {
            git_cli,
            tmux_cli,
            settings_repository,
        }
    }

    /// Ensure the worktree's tmux session exists, creating it (with Claude launched in its
    /// first window) if it doesn't. The `send_line` (rather than a `new-session` command
    /// arg) means the window falls back to a shell when Claude exits instead of ending the
    /// session.
    fn ensure_tmux_session(&self, tmux_session: &str, cwd: &Path) -> AppResult<()> {
        if self.tmux_cli.session_exists(tmux_session) {
            return Ok(());
        }
        self.tmux_cli.new_session(tmux_session, CLAUDE_WINDOW, cwd)?;
        self.tmux_cli.send_line(&format!("{tmux_session}:{CLAUDE_WINDOW}"), "claude")
    }

    // ── managed repos ───────────────────────────────────────────────────────────────

    pub fn list_repos(&self) -> AppResult<Vec<ManagedRepo>> {
        match self.settings_repository.get(MANAGED_REPOS_KEY)? {
            Some(json) => serde_json::from_str(&json)
                .map_err(|e| AppError::Worktree(format!("corrupt managed-repo list: {e}"))),
            None => Ok(Vec::new()),
        }
    }

    fn save_repos(&self, repos: &[ManagedRepo]) -> AppResult<()> {
        let json = serde_json::to_string(repos)
            .map_err(|e| AppError::Worktree(format!("could not serialize repos: {e}")))?;
        self.settings_repository.set(MANAGED_REPOS_KEY, &json)
    }

    /// Add a repo to the managed list after validating it's a git repository. The path
    /// is tilde-expanded and canonicalized; the display name is its basename. Idempotent.
    pub fn add_repo(&self, path: String) -> AppResult<Vec<ManagedRepo>> {
        let expanded = expand_tilde(&path);
        let candidate = Path::new(&expanded);
        if !self.git_cli.is_git_repo(candidate) {
            return Err(AppError::Worktree(format!("not a git repository: {expanded}")));
        }
        let canonical = std::fs::canonicalize(candidate)
            .map_err(|e| AppError::Worktree(format!("cannot resolve {expanded}: {e}")))?;
        let path = canonical.to_string_lossy().to_string();
        let name = canonical
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        let mut repos = self.list_repos()?;
        if !repos.iter().any(|r| r.path == path) {
            repos.push(ManagedRepo {
                name,
                path,
                base_branch: None,
            });
            self.save_repos(&repos)?;
        }
        Ok(repos)
    }

    pub fn remove_repo(&self, path: String) -> AppResult<Vec<ManagedRepo>> {
        let mut repos = self.list_repos()?;
        repos.retain(|r| r.path != path);
        self.save_repos(&repos)?;
        Ok(repos)
    }

    fn find_repo(&self, repo_path: &str) -> AppResult<ManagedRepo> {
        self.list_repos()?
            .into_iter()
            .find(|r| r.path == repo_path)
            .ok_or_else(|| AppError::Worktree(format!("repo not managed: {repo_path}")))
    }

    // ── worktrees ───────────────────────────────────────────────────────────────────

    pub fn list(&self, repo_path: String) -> AppResult<Vec<Worktree>> {
        let repo = self.find_repo(&repo_path)?;
        let root = Path::new(&repo.path);
        let mut worktrees = Vec::new();
        for entry in self.git_cli.list_worktrees(root)? {
            let branch = entry.branch.unwrap_or_else(|| "(detached)".to_string());
            let tmux_session = tmux_session_name(&repo.name, &branch);
            worktrees.push(Worktree {
                repo: repo.path.clone(),
                is_dirty: self.git_cli.worktree_has_changes(Path::new(&entry.path)),
                session_live: self.tmux_cli.session_exists(&tmux_session),
                is_main: entry.is_main,
                branch,
                path: entry.path,
            });
        }
        Ok(worktrees)
    }

    /// Create the worktree if missing (existing local branch → checkout; origin branch →
    /// tracking branch; else new branch off the repo's base) and ensure its tmux/Claude
    /// session. Idempotent per branch.
    pub fn add(&self, repo_path: String, branch: String) -> AppResult<Worktree> {
        let repo = self.find_repo(&repo_path)?;
        let root = Path::new(&repo.path);
        let wt_path = worktree_dir(&repo, &branch)?;
        let wt_path_str = wt_path.to_string_lossy().to_string();

        if !wt_path.exists() {
            if let Some(parent) = wt_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    AppError::Worktree(format!("could not create {}: {e}", parent.display()))
                })?;
            }
            // Best effort: an offline fetch failure shouldn't block creating from a local ref.
            let _ = self.git_cli.fetch_from_origin(root);

            if self.git_cli.has_local_branch(root, &branch) {
                self.git_cli.add_worktree_checkout(root, &wt_path_str, &branch)?;
            } else if self.git_cli.has_remote_branch(root, &branch) {
                self.git_cli.add_worktree_tracking(root, &wt_path_str, &branch)?;
            } else {
                let base = repo
                    .base_branch
                    .clone()
                    .unwrap_or_else(|| self.git_cli.default_base_branch(root));
                self.git_cli.add_worktree_new_branch(root, &wt_path_str, &branch, &base)?;
            }
        }

        let tmux_session = tmux_session_name(&repo.name, &branch);
        self.ensure_tmux_session(&tmux_session, &wt_path)?;

        Ok(Worktree {
            repo: repo.path.clone(),
            is_dirty: self.git_cli.worktree_has_changes(&wt_path),
            session_live: self.tmux_cli.session_exists(&tmux_session),
            is_main: false,
            branch,
            path: wt_path_str,
        })
    }

    /// Remove a worktree + its tmux session. Without `force`, a git refusal (dirty /
    /// untracked worktree) is surfaced so the UI can re-confirm — never silently `rm`ed.
    pub fn remove(&self, repo_path: String, branch: String, force: bool) -> AppResult<()> {
        let repo = self.find_repo(&repo_path)?;
        let root = Path::new(&repo.path);
        let wt_path = worktree_dir(&repo, &branch)?;
        let wt_path_str = wt_path.to_string_lossy().to_string();

        if let Err(err) = self.git_cli.remove_worktree(root, &wt_path_str, force) {
            if !force {
                return Err(err);
            }
            // force: fall through to the filesystem removal below.
        }
        if wt_path.exists() {
            if !force {
                return Err(AppError::Worktree(format!(
                    "worktree '{branch}' could not be removed cleanly"
                )));
            }
            std::fs::remove_dir_all(&wt_path)
                .map_err(|e| AppError::Worktree(format!("could not remove {wt_path_str}: {e}")))?;
        }
        let _ = self.git_cli.prune_worktrees(root);
        self.tmux_cli.kill_session(&tmux_session_name(&repo.name, &branch));
        Ok(())
    }

    /// The worktrees a prune would remove — branches merged into base or with a gone
    /// upstream, excluding the base branch and any with uncommitted work. When `apply`,
    /// remove them (they're all clean, so no force needed). Returns the candidate list
    /// either way, so the UI can preview a dry run before applying.
    pub fn prune(&self, repo_path: String, apply: bool) -> AppResult<Vec<PruneCandidate>> {
        let repo = self.find_repo(&repo_path)?;
        let root = Path::new(&repo.path);
        let _ = self.git_cli.fetch_from_origin(root);

        let base = repo
            .base_branch
            .clone()
            .unwrap_or_else(|| self.git_cli.default_base_branch(root));
        let base_local = base.strip_prefix("origin/").unwrap_or(base.as_str()).to_string();

        let merged: HashSet<String> =
            self.git_cli.branches_merged_into(root, &base).into_iter().collect();
        let gone: HashSet<String> =
            self.git_cli.branches_with_gone_upstream(root).into_iter().collect();

        let mut candidates = Vec::new();
        for entry in self.git_cli.list_worktrees(root)? {
            if entry.is_main {
                continue;
            }
            let Some(branch) = entry.branch else { continue };
            if branch == base_local {
                continue;
            }
            let mut reasons = Vec::new();
            if merged.contains(&branch) {
                reasons.push(format!("merged into {base}"));
            }
            if gone.contains(&branch) {
                reasons.push("upstream gone".to_string());
            }
            if reasons.is_empty() {
                continue;
            }
            // Never auto-remove uncommitted work — leave dirty worktrees to explicit removal.
            if self.git_cli.worktree_has_changes(Path::new(&entry.path)) {
                continue;
            }
            candidates.push((branch, reasons.join(", "), entry.path));
        }

        if apply {
            for (branch, _reason, path) in &candidates {
                let _ = self.git_cli.remove_worktree(root, path, false);
                if Path::new(path).exists() {
                    let _ = std::fs::remove_dir_all(path);
                }
                self.tmux_cli.kill_session(&tmux_session_name(&repo.name, branch));
            }
            let _ = self.git_cli.prune_worktrees(root);
        }

        Ok(candidates
            .into_iter()
            .map(|(branch, reason, _)| PruneCandidate { branch, reason })
            .collect())
    }

    /// Ensure the worktree's tmux/Claude session and open a terminal attached to it.
    pub fn open(&self, repo_path: String, branch: String) -> AppResult<()> {
        let repo = self.find_repo(&repo_path)?;
        let wt_path = worktree_dir(&repo, &branch)?;
        if !wt_path.exists() {
            return Err(AppError::Worktree(format!(
                "no worktree at {}",
                wt_path.display()
            )));
        }
        let tmux_session = tmux_session_name(&repo.name, &branch);
        self.ensure_tmux_session(&tmux_session, &wt_path)?;
        os::open_terminal(&tmux_session)
            .map_err(|e| AppError::Worktree(format!("could not open terminal: {e}")))?;
        Ok(())
    }
}

/// Where a worktree lives: a `worktrees/` directory beside the repo, namespaced by repo
/// name — `<repo-parent>/worktrees/<repo-name>/<branch>`. Derived from the repo's own
/// location, so it works wherever the repo is (no assumed home/layout).
fn worktree_dir(repo: &ManagedRepo, branch: &str) -> AppResult<PathBuf> {
    let parent = Path::new(&repo.path).parent().ok_or_else(|| {
        AppError::Worktree(format!("repo has no parent directory: {}", repo.path))
    })?;
    Ok(parent.join("worktrees").join(&repo.name).join(branch))
}

fn tmux_session_name(repo_name: &str, branch: &str) -> String {
    format!("{repo_name}-{}", branch.replace('/', "-"))
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}
