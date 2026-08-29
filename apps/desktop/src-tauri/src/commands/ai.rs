use tauri::{AppHandle, State};

use crate::core::error::AppResult;
use crate::services::ai_service::AiService;
use crate::services::task_group_service::TaskGroupService;
use crate::services::task_service::TaskService;

/// Whether a stored API key enables the AI features (gates the UI).
#[tauri::command]
pub fn ai_status(ai_service: State<'_, AiService>) -> AppResult<bool> {
    ai_service.is_enabled()
}

/// Validate an API key and, only if it works, store it in the keychain. Errors when
/// the connection test fails, so the UI never saves a bad key.
#[tauri::command]
pub async fn set_ai_api_key(ai_service: State<'_, AiService>, key: String) -> AppResult<()> {
    ai_service.save_key(key).await
}

/// Forget the stored API key — disables the AI features.
#[tauri::command]
pub fn clear_ai_api_key(ai_service: State<'_, AiService>) -> AppResult<()> {
    ai_service.clear_key()
}

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
