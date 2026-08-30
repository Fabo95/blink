//! IPC surface for managed repos — thin wrappers over [`RepoService`].

use tauri::{AppHandle, State};

use crate::core::error::AppResult;
use crate::core::models::ManagedRepo;
use crate::platform::dialog;
use crate::services::repo_service::RepoService;

#[tauri::command]
pub fn list_managed_repos(repo_service: State<'_, RepoService>) -> AppResult<Vec<ManagedRepo>> {
    repo_service.list()
}

#[tauri::command]
pub fn remove_managed_repo(
    repo_service: State<'_, RepoService>,
    path: String,
) -> AppResult<Vec<ManagedRepo>> {
    repo_service.remove(path)
}

/// Open the native folder picker; if a directory is chosen, add it as a managed repo
/// (after the git-repo check) and return the updated list. Unchanged list when the user
/// cancels. The blocking picker runs off the main thread so the app stays responsive.
#[tauri::command]
pub async fn pick_managed_repo(
    app: AppHandle,
    repo_service: State<'_, RepoService>,
) -> AppResult<Vec<ManagedRepo>> {
    repo_service.add_or_list(dialog::pick_folder(&app, "Choose a git repository to manage").await)
}
