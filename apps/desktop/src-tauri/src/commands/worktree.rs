//! IPC surface for worktrees — thin wrappers over [`WorktreeService`]. Worktree ops take
//! a `repoPath` and resolve it to a [`ManagedRepo`] via [`RepoService`], keeping worktree
//! logic independent of the managed-repo list.

use tauri::{AppHandle, State};

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::{PruneCandidate, Worktree, WorktreeAttentionUpdate};
use crate::platform::dialog;
use crate::services::attention_service::AttentionService;
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

/// Remove a worktree + its session + its local branch. `force` removes a dirty/untracked
/// worktree. The remote branch is untouched (see `delete_remote_branch`).
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

/// Delete the branch on the remote (GitHub). Async — it reaches the network — so the UI
/// stays responsive while it runs. A no-op when the branch was never pushed.
#[tauri::command]
pub async fn delete_remote_branch(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    repo_path: String,
    branch: String,
) -> AppResult<()> {
    worktree_service.delete_remote_branch(&repo_service.find(&repo_path)?, &branch)
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

/// The current attention snapshot across every managed repo's live sessions. The webview
/// loads this once for initial state, then keeps it live via the `worktree-attention` event.
#[tauri::command]
pub fn get_worktree_attention(
    attention_service: State<'_, Arc<AttentionService>>,
) -> AppResult<Vec<WorktreeAttentionUpdate>> {
    Ok(attention_service.snapshot())
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
