//! Worktree business logic — the desktop replacement for the user's `wt`/`rmwt` scripts.
//! Owns the git bookkeeping (via [`GitCli`]), the worktree layout settings (base dir), and
//! the `<repo>-<branch>` tmux **session naming** convention. Session mechanics themselves
//! (creating/attaching/killing tmux, launching the terminal) live in the decoupled
//! [`TerminalService`], which this service composes for the worktree lifecycle
//! (create → ensure session, remove/prune → close session, list → session liveness).
//! Opening a worktree in a terminal or editor is composed at the command layer, which
//! resolves the path/session here and hands off to the terminal/editor service.
//!
//! It operates on a [`ManagedRepo`] handed to it — it has **no** knowledge of the managed
//! list itself (that's [`crate::services::repo_service::RepoService`]); the command layer
//! resolves a repo and passes it in. Conventions match the scripts so both interoperate:
//! by default worktrees live in a `worktrees/` directory beside the repo
//! (`<repo-parent>/worktrees/<repo>/<branch>`), or under a configurable base dir
//! (`<base>/<repo>/<branch>`); each gets a tmux session `<repo>-<branch>` running `claude`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::clients::git_cli::GitCli;
use crate::core::error::{AppError, AppResult};
use crate::core::models::{ManagedRepo, PruneCandidate, Worktree};
use crate::core::paths::expand_tilde;
use crate::repository::SettingsRepository;
use crate::services::terminal_service::TerminalService;

/// `settings` key holding the optional base directory all worktrees go under. Unset =
/// the derived default (a `worktrees/` dir beside each repo).
const WORKTREE_BASE_DIR_KEY: &str = "worktree_base_dir";

#[derive(Clone)]
pub struct WorktreeService {
    git_cli: GitCli,
    settings_repository: SettingsRepository,
    /// Session mechanics for the worktree lifecycle — decoupled from worktrees, keyed by the
    /// session name this service mints (see [`Self::session_name`]).
    terminal_service: TerminalService,
}

impl WorktreeService {
    pub fn new(
        git_cli: GitCli,
        settings_repository: SettingsRepository,
        terminal_service: TerminalService,
    ) -> Self {
        Self {
            git_cli,
            settings_repository,
            terminal_service,
        }
    }

    // ── settings ──────────────────────────────────────────────────────────────────────

    /// The configured base directory all worktrees go under, or `None` for the derived
    /// default (a `worktrees/` dir beside each repo).
    pub fn base_dir(&self) -> AppResult<Option<String>> {
        self.settings_repository.get(WORKTREE_BASE_DIR_KEY)
    }

    /// Set (or clear, with an empty/`None` value) the global worktree base directory.
    pub fn set_base_dir(&self, dir: Option<String>) -> AppResult<()> {
        match dir.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()) {
            Some(dir) => self.settings_repository.set(WORKTREE_BASE_DIR_KEY, &dir),
            None => self.settings_repository.remove(WORKTREE_BASE_DIR_KEY),
        }
    }

    /// Save `dir` as the base directory only when it's `Some` (e.g. a folder was picked);
    /// `None` (a cancelled pick) leaves the setting untouched. Returns `dir` so the caller
    /// can reflect the new value. Note this differs from [`set_base_dir`], where `None`
    /// clears the setting.
    pub fn set_base_dir_if_provided(&self, dir: Option<String>) -> AppResult<Option<String>> {
        if let Some(dir) = &dir {
            self.set_base_dir(Some(dir.clone()))?;
        }
        Ok(dir)
    }

    // ── worktrees ─────────────────────────────────────────────────────────────────────

    pub fn list(&self, repo: &ManagedRepo) -> AppResult<Vec<Worktree>> {
        let root = Path::new(&repo.path);
        let mut worktrees = Vec::new();
        for entry in self.git_cli.list_worktrees(root)? {
            let branch = entry.branch.unwrap_or_else(|| "(detached)".to_string());
            let session = tmux_session_name(&repo.name, &branch);
            worktrees.push(Worktree {
                repo: repo.path.clone(),
                is_dirty: self.git_cli.worktree_has_changes(Path::new(&entry.path)),
                session_live: self.terminal_service.session_exists(&session),
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
    pub fn add(&self, repo: &ManagedRepo, branch: String) -> AppResult<Worktree> {
        let root = Path::new(&repo.path);
        let wt_path = self.worktree_dir(repo, &branch)?;
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

        let session = tmux_session_name(&repo.name, &branch);
        self.terminal_service.ensure_session(&session, &wt_path)?;

        Ok(Worktree {
            repo: repo.path.clone(),
            is_dirty: self.git_cli.worktree_has_changes(&wt_path),
            session_live: self.terminal_service.session_exists(&session),
            is_main: false,
            branch,
            path: wt_path_str,
        })
    }

    /// Remove a worktree + its tmux session + its **local** branch, using the path git
    /// actually recorded. Handles a worktree whose working-tree folder is already gone
    /// (prune clears the stale entry). Without `force`, a git refusal on a still-present
    /// dirty worktree is surfaced so the UI can re-confirm — never silently `rm`ed. The
    /// remote branch is left alone (see [`delete_remote_branch`]).
    pub fn remove(&self, repo: &ManagedRepo, branch: String, force: bool) -> AppResult<()> {
        let root = Path::new(&repo.path);
        let session = tmux_session_name(&repo.name, &branch);

        if let Some(path) = self.worktree_path_for(root, &branch)? {
            if let Err(err) = self.git_cli.remove_worktree(root, &path, force) {
                let folder_present = Path::new(&path).exists();
                if folder_present && !force {
                    // Present but git refused (dirty/untracked) — let the UI re-confirm.
                    return Err(err);
                }
                if folder_present {
                    std::fs::remove_dir_all(&path)
                        .map_err(|e| AppError::Worktree(format!("could not remove {path}: {e}")))?;
                }
                // Folder missing → the entry is stale; the prune below clears its bookkeeping.
            }
        }
        // Clears stale entries whose working tree is gone (this one, and any other orphans).
        let _ = self.git_cli.prune_worktrees(root);
        self.terminal_service.close_session(&session);
        // The worktree is gone, so the branch is no longer checked out — delete it. Guard on
        // existence so a detached worktree (no branch) isn't an error.
        if self.git_cli.has_local_branch(root, &branch) {
            self.git_cli.delete_branch(root, &branch)?;
        }
        Ok(())
    }

    /// Delete the branch on the remote (GitHub) — an explicit, destructive opt-in, separate
    /// from removing the worktree. A no-op when the branch was never pushed.
    pub fn delete_remote_branch(&self, repo: &ManagedRepo, branch: &str) -> AppResult<()> {
        let root = Path::new(&repo.path);
        if self.git_cli.has_remote_branch(root, branch) {
            self.git_cli.delete_remote_branch(root, branch)?;
        }
        Ok(())
    }

    /// The worktrees a prune would remove — branches merged into base or with a gone
    /// upstream, excluding the base branch and any with uncommitted work. When `apply`,
    /// remove them (they're all clean, so no force needed). Returns the candidate list
    /// either way, so the UI can preview a dry run before applying.
    pub fn prune(&self, repo: &ManagedRepo, apply: bool) -> AppResult<Vec<PruneCandidate>> {
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
                let session = tmux_session_name(&repo.name, branch);
                self.terminal_service.close_session(&session);
            }
            let _ = self.git_cli.prune_worktrees(root);
        }

        Ok(candidates
            .into_iter()
            .map(|(branch, reason, _)| PruneCandidate { branch, reason })
            .collect())
    }

    // ── resolution (used by the open-in-terminal / open-in-editor commands) ─────────────

    /// The tmux/Claude session name for a worktree — the `<repo>-<branch>` convention. The
    /// naming lives here (a worktree concept); [`TerminalService`] treats it as opaque.
    pub fn session_name(&self, repo: &ManagedRepo, branch: &str) -> String {
        tmux_session_name(&repo.name, branch)
    }

    /// The on-disk path of an **existing** worktree for `branch`, erroring if none is linked
    /// or the folder is missing. Shared by the open-in-terminal / open-in-editor flows, which
    /// resolve here and hand the path to the terminal/editor service.
    pub fn existing_worktree_path(&self, repo: &ManagedRepo, branch: &str) -> AppResult<String> {
        let root = Path::new(&repo.path);
        let path = self
            .worktree_path_for(root, branch)?
            .ok_or_else(|| AppError::Worktree(format!("no worktree found for branch '{branch}'")))?;
        if !Path::new(&path).exists() {
            return Err(AppError::Worktree(format!(
                "the worktree folder is missing ({path}) — remove it and recreate the worktree"
            )));
        }
        Ok(path)
    }

    // ── internals ─────────────────────────────────────────────────────────────────────

    /// Where a worktree lives: `<base>/<repo-name>/<branch>` if a base directory is
    /// configured, else the derived default beside the repo
    /// (`<repo-parent>/worktrees/<repo-name>/<branch>`).
    fn worktree_dir(&self, repo: &ManagedRepo, branch: &str) -> AppResult<PathBuf> {
        if let Some(base) = self.base_dir()? {
            let base = expand_tilde(&base);
            return Ok(Path::new(&base).join(&repo.name).join(branch));
        }
        let parent = Path::new(&repo.path).parent().ok_or_else(|| {
            AppError::Worktree(format!("repo has no parent directory: {}", repo.path))
        })?;
        Ok(parent.join("worktrees").join(&repo.name).join(branch))
    }

    /// The path git records for the linked worktree on `branch`, if any. Using git's own
    /// record (not a recomputed path) means a changed base-dir setting or a worktree made
    /// under a different scheme still resolves correctly.
    fn worktree_path_for(&self, root: &Path, branch: &str) -> AppResult<Option<String>> {
        Ok(self
            .git_cli
            .list_worktrees(root)?
            .into_iter()
            .find(|entry| !entry.is_main && entry.branch.as_deref() == Some(branch))
            .map(|entry| entry.path))
    }
}

fn tmux_session_name(repo_name: &str, branch: &str) -> String {
    format!("{repo_name}-{}", branch.replace('/', "-"))
}
