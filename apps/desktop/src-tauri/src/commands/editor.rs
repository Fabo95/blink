//! IPC surface for the editor feature — the editor-launch command setting, detecting
//! installed editors, and opening a worktree's folder in the editor. The open flow composes
//! services: the worktree service resolves the path, then [`EditorService`] launches it.

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::EditorOption;
use crate::services::editor_service::EditorService;
use crate::services::repo_service::RepoService;
use crate::services::worktree_service::WorktreeService;

/// Open the worktree's folder in the configured editor (it must already exist).
#[tauri::command]
pub fn open_worktree_in_editor(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    editor_service: State<'_, EditorService>,
    repo_path: String,
    branch: String,
) -> AppResult<()> {
    let repo = repo_service.find(&repo_path)?;
    let path = worktree_service.existing_worktree_path(&repo, &branch)?;
    editor_service.open(std::path::Path::new(&path))
}

/// The editor launch command (`{path}` = the worktree path).
#[tauri::command]
pub fn get_worktree_editor(editor_service: State<'_, EditorService>) -> AppResult<String> {
    editor_service.command()
}

/// The installed editors Blink can offer as one-click choices in Settings.
#[tauri::command]
pub fn list_editors(editor_service: State<'_, EditorService>) -> AppResult<Vec<EditorOption>> {
    Ok(editor_service.list_editors())
}

/// Set (or clear, back to the default) the editor launch command.
#[tauri::command]
pub fn set_worktree_editor(
    editor_service: State<'_, EditorService>,
    command: Option<String>,
) -> AppResult<()> {
    editor_service.set_command(command)
}
