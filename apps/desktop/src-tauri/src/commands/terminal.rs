//! IPC surface for the terminal feature — the terminal-launch command setting and opening a
//! worktree in a terminal. The open flow composes services: the worktree service resolves the
//! path + session name, then [`TerminalService`] does the tmux/terminal mechanics.

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::TerminalOption;
use crate::services::repo_service::RepoService;
use crate::services::terminal_service::TerminalService;
use crate::services::worktree_service::WorktreeService;

/// Open a terminal attached to the worktree's tmux/Claude session (creating it if needed).
#[tauri::command]
pub fn open_worktree_in_terminal(
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    terminal_service: State<'_, TerminalService>,
    repo_path: String,
    branch: String,
) -> AppResult<()> {
    let repo = repo_service.find(&repo_path)?;
    let path = worktree_service.existing_worktree_path(&repo, &branch)?;
    let session = worktree_service.session_name(&repo, &branch);
    terminal_service.open(&session, std::path::Path::new(&path))
}

/// The terminal launch command (`{session}` = the tmux session name).
#[tauri::command]
pub fn get_worktree_terminal(terminal_service: State<'_, TerminalService>) -> AppResult<String> {
    terminal_service.command()
}

/// The installed terminals Blink can offer as one-click choices in Settings.
#[tauri::command]
pub fn list_terminals(
    terminal_service: State<'_, TerminalService>,
) -> AppResult<Vec<TerminalOption>> {
    Ok(terminal_service.list_terminals())
}

/// Set (or clear, back to the default) the terminal launch command.
#[tauri::command]
pub fn set_worktree_terminal(
    terminal_service: State<'_, TerminalService>,
    command: Option<String>,
) -> AppResult<()> {
    terminal_service.set_command(command)
}
