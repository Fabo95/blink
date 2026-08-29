use tauri::{AppHandle, State};

use crate::core::error::AppResult;
use crate::services::ai_service::AiService;
use crate::services::task_group_service::TaskGroupService;
use crate::services::task_service::TaskService;

/// Improve raw text with AI and return the cleaned-up result (no persistence).
#[tauri::command]
pub async fn improve_text(ai_service: State<'_, AiService>, text: String) -> AppResult<String> {
    ai_service.improve(text).await
}

/// Generate a ready-to-paste assistant prompt from a task's raw captured text and copy
/// it to the system clipboard. Returns the prompt (also used to confirm in the UI).
#[tauri::command]
pub async fn generate_task_prompt(
    app: AppHandle,
    ai_service: State<'_, AiService>,
    task_service: State<'_, TaskService>,
    task_group_service: State<'_, TaskGroupService>,
    id: String,
) -> AppResult<String> {
    let task = task_service.get(&id)?;
    let group_context = match task.task_group_id.as_deref() {
        Some(group_id) => task_group_service.get(group_id)?.and_then(|group| group.context),
        None => None,
    };
    let prompt = ai_service.generate_prompt(&task, group_context.as_deref()).await?;
    crate::platform::clipboard::write_text(&app, &prompt)?;
    Ok(prompt)
}
