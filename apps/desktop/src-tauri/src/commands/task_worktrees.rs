//! IPC surface for task → worktree: start a task in its own worktree with Claude briefed, and
//! list which tasks live where. Composes the task, group, AI, repo, worktree, and terminal
//! services — the brief comes from the AI when a key is set, else from the task itself.

use std::path::Path;

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{EgressKind, TaskWorktree};
use crate::services::ai_service::AiService;
use crate::services::egress_service::{EgressService, AI_DESTINATION};
use crate::services::repo_service::RepoService;
use crate::services::task_group_service::TaskGroupService;
use crate::services::task_service::TaskService;
use crate::services::task_worktree_service::{plain_brief, TaskWorktreeService};
use crate::services::terminal_service::TerminalService;
use crate::services::worktree_service::WorktreeService;

/// Every task that lives in a worktree, with its repo + branch.
#[tauri::command]
pub fn list_task_worktrees(
    task_worktree_service: State<'_, TaskWorktreeService>,
) -> AppResult<Vec<TaskWorktree>> {
    task_worktree_service.links()
}

/// Start `task_id` in a worktree on `branch` of `repo_path`: write its brief, create the
/// worktree (running the repo's setup), start Claude with the brief, link the two, and open
/// the terminal on it. Async: the AI brief and git reach the network.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_task_worktree(
    task_service: State<'_, TaskService>,
    task_group_service: State<'_, TaskGroupService>,
    ai_service: State<'_, AiService>,
    egress_service: State<'_, EgressService>,
    repo_service: State<'_, RepoService>,
    worktree_service: State<'_, WorktreeService>,
    terminal_service: State<'_, TerminalService>,
    task_worktree_service: State<'_, TaskWorktreeService>,
    task_id: String,
    repo_path: String,
    branch: String,
) -> AppResult<TaskWorktree> {
    let task = task_service.get(&task_id)?;
    let repo = repo_service.find(&repo_path)?;
    let group_context = match task.task_group_id.as_deref() {
        Some(group_id) => task_group_service
            .get(group_id)?
            .and_then(|group| group.context),
        None => None,
    };
    let brief = if ai_service.key_hint()?.is_some() {
        egress_service.record(
            EgressKind::AiPrompt,
            AI_DESTINATION,
            None,
            task.text.len() + task.raw_text.len(),
        )?;
        ai_service
            .generate_prompt(&task, group_context.as_deref())
            .await?
    } else {
        plain_brief(&task, group_context.as_deref())
    };
    let worktree = task_worktree_service.start(&task, &repo, branch, &brief)?;
    let session = worktree_service.session_name(&repo, &worktree.branch);
    terminal_service.open(&session, Path::new(&worktree.path))?;
    Ok(TaskWorktree {
        task_id: task.id,
        task_text: task.text,
        repo_path: repo.path,
        branch: worktree.branch,
    })
}
