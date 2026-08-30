//! IPC surface for worktrees — thin wrappers over [`WorktreeService`]. Worktree ops take
//! a `repoPath` and resolve it to a [`ManagedRepo`] via [`RepoService`], keeping worktree
//! logic independent of the managed-repo list.

use tauri::{AppHandle, State};

use crate::core::error::AppResult;
use crate::core::models::{PruneCandidate, Worktree};
use crate::platform::dialog;
use crate::services::repo_service::RepoService;
use crate::services::worktree_service::WorktreeService;

#[tauri::command]
pub fn list_worktrees(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
) -> AppResult<Vec<Worktree>> {
    worktree_service.list(&repo_service.find(&repo_path)?)
}

/// Create (or attach) a worktree for `branch` and ensure its tmux/Claude session.
#[tauri::command]
pub fn add_worktree(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
) -> AppResult<Worktree> {
    worktree_service.add(&repo_service.find(&repo_path)?, branch)
}

/// Remove a worktree + its session. `force` removes a dirty/untracked worktree.
#[tauri::command]
pub fn remove_worktree(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
    force: bool,
) -> AppResult<()> {
    worktree_service.remove(&repo_service.find(&repo_path)?, branch, force)
}

/// Preview (`apply = false`) or perform (`apply = true`) a prune of merged/gone worktrees.
#[tauri::command]
pub fn prune_worktrees(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    apply: bool,
) -> AppResult<Vec<PruneCandidate>> {
    worktree_service.prune(&repo_service.find(&repo_path)?, apply)
}

/// Open a terminal attached to the worktree's tmux/Claude session (creating it if needed).
#[tauri::command]
pub fn open_worktree(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
) -> AppResult<()> {
    worktree_service.open(&repo_service.find(&repo_path)?, branch)
}

// ── worktree settings ───────────────────────────────────────────────────────────────────

/// The configured global worktree base directory, or `None` for the derived default.
#[tauri::command]
pub fn get_worktree_base_dir(
    worktree_service: State<'_, WorktreeService>,
) -> AppResult<Option<String>> {
    worktree_service.base_dir()
}

/// Set (or clear, with `null`/empty) the global worktree base directory.
#[tauri::command]
pub fn set_worktree_base_dir(
    worktree_service: State<'_, WorktreeService>,
    path: Option<String>,
) -> AppResult<()> {
    worktree_service.set_base_dir(path)
}

/// Open the native folder picker; if a directory is chosen, save it as the worktree base
/// dir and return it. Returns `None` when the user cancels (nothing changes). The blocking
/// picker runs off the main thread so the app stays responsive.
#[tauri::command]
pub async fn pick_worktree_base_dir(
    app: AppHandle,
    worktree_service: State<'_, WorktreeService>,
) -> AppResult<Option<String>> {
    let picked = dialog::pick_folder(&app, "Choose the worktree base directory").await;
    worktree_service.set_base_dir_if_provided(picked)
}

/// The terminal launch command (`{session}` = the tmux session name).
#[tauri::command]
pub fn get_worktree_terminal(worktree_service: State<'_, WorktreeService>) -> AppResult<String> {
    worktree_service.terminal_command()
}

/// Set (or clear, back to the default) the terminal launch command.
#[tauri::command]
pub fn set_worktree_terminal(
    worktree_service: State<'_, WorktreeService>,
    command: Option<String>,
) -> AppResult<()> {
    worktree_service.set_terminal_command(command)
}
