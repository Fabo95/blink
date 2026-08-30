//! Managed-repo business logic — the curated list of git repositories the worktree
//! manager operates on. Deliberately independent of worktree operations: it only knows
//! how to validate, store, and look up repos. The list is persisted as JSON in `settings`
//! (via [`SettingsRepository`]) — no dedicated table.

use std::path::Path;

use crate::clients::git_cli::GitCli;
use crate::core::error::{AppError, AppResult};
use crate::core::models::ManagedRepo;
use crate::core::paths::expand_tilde;
use crate::repository::SettingsRepository;

/// `settings` key holding the JSON-encoded `Vec<ManagedRepo>` the user curates.
const MANAGED_REPOS_KEY: &str = "worktree_managed_repos";

#[derive(Clone)]
pub struct RepoService {
    git_cli: GitCli,
    settings_repository: SettingsRepository,
}

impl RepoService {
    pub fn new(git_cli: GitCli, settings_repository: SettingsRepository) -> Self {
        Self {
            git_cli,
            settings_repository,
        }
    }

    pub fn list(&self) -> AppResult<Vec<ManagedRepo>> {
        match self.settings_repository.get(MANAGED_REPOS_KEY)? {
            Some(json) => serde_json::from_str(&json)
                .map_err(|e| AppError::Repo(format!("corrupt managed-repo list: {e}"))),
            None => Ok(Vec::new()),
        }
    }

    /// Look up a managed repo by its (canonical) path.
    pub fn find(&self, repo_path: &str) -> AppResult<ManagedRepo> {
        self.list()?
            .into_iter()
            .find(|r| r.path == repo_path)
            .ok_or_else(|| AppError::Repo(format!("repo not managed: {repo_path}")))
    }

    /// Add a repo after validating it's a git repository. The path is tilde-expanded and
    /// canonicalized; the display name is its basename. Idempotent. Returns the new list.
    pub fn add(&self, path: String) -> AppResult<Vec<ManagedRepo>> {
        let expanded = expand_tilde(&path);
        let candidate = Path::new(&expanded);
        if !self.git_cli.is_git_repo(candidate) {
            return Err(AppError::Repo(format!("not a git repository: {expanded}")));
        }
        let canonical = std::fs::canonicalize(candidate)
            .map_err(|e| AppError::Repo(format!("cannot resolve {expanded}: {e}")))?;
        let path = canonical.to_string_lossy().to_string();
        let name = canonical
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        let mut repos = self.list()?;
        if !repos.iter().any(|r| r.path == path) {
            repos.push(ManagedRepo {
                name,
                path,
                base_branch: None,
            });
            self.save(&repos)?;
        }
        Ok(repos)
    }

    /// Add `dir` as a repo, or — when it's `None` (e.g. the folder picker was cancelled) —
    /// just return the current list unchanged.
    pub fn add_or_list(&self, dir: Option<String>) -> AppResult<Vec<ManagedRepo>> {
        match dir {
            Some(dir) => self.add(dir),
            None => self.list(),
        }
    }

    /// Stop tracking a repo (does not touch git). Returns the new list.
    pub fn remove(&self, path: String) -> AppResult<Vec<ManagedRepo>> {
        let mut repos = self.list()?;
        repos.retain(|r| r.path != path);
        self.save(&repos)?;
        Ok(repos)
    }

    fn save(&self, repos: &[ManagedRepo]) -> AppResult<()> {
        let json = serde_json::to_string(repos)
            .map_err(|e| AppError::Repo(format!("could not serialize repos: {e}")))?;
        self.settings_repository.set(MANAGED_REPOS_KEY, &json)
    }
}
