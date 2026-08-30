//! IPC surface for the worktree manager — thin wrappers over [`WorktreeService`].

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{ManagedRepo, PruneCandidate, Worktree};
use crate::services::worktree_service::WorktreeService;

#[tauri::command]
pub fn list_managed_repos(
    worktree_service: State<'_, WorktreeService>,
) -> AppResult<Vec<ManagedRepo>> {
    worktree_service.list_repos()
}

/// Validate `path` is a git repo and add it to the managed list. Returns the updated list.
#[tauri::command]
pub fn add_managed_repo(
    worktree_service: State<'_, WorktreeService>,
    path: String,
) -> AppResult<Vec<ManagedRepo>> {
    worktree_service.add_repo(path)
}

#[tauri::command]
pub fn remove_managed_repo(
    worktree_service: State<'_, WorktreeService>,
    path: String,
) -> AppResult<Vec<ManagedRepo>> {
    worktree_service.remove_repo(path)
}

#[tauri::command]
pub fn list_worktrees(
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
) -> AppResult<Vec<Worktree>> {
    worktree_service.list(repo_path)
}

/// Create (or attach) a worktree for `branch` and ensure its tmux/Claude session.
#[tauri::command]
pub fn add_worktree(
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
) -> AppResult<Worktree> {
    worktree_service.add(repo_path, branch)
}

/// Remove a worktree + its session. `force` removes a dirty/untracked worktree.
#[tauri::command]
pub fn remove_worktree(
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
    force: bool,
) -> AppResult<()> {
    worktree_service.remove(repo_path, branch, force)
}

/// Preview (`apply = false`) or perform (`apply = true`) a prune of merged/gone worktrees.
#[tauri::command]
pub fn prune_worktrees(
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    apply: bool,
) -> AppResult<Vec<PruneCandidate>> {
    worktree_service.prune(repo_path, apply)
}

/// Open a terminal attached to the worktree's tmux/Claude session (creating it if needed).
#[tauri::command]
pub fn open_worktree(
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
) -> AppResult<()> {
    worktree_service.open(repo_path, branch)
}
