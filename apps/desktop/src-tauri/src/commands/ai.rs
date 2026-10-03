use tauri::{AppHandle, State};

use crate::core::error::AppResult;
use crate::core::models::EgressKind;
use crate::services::ai_service::AiService;
use crate::services::egress_service::{EgressService, AI_DESTINATION};
use crate::services::policy_service::PolicyService;
use crate::services::task_group_service::TaskGroupService;
use crate::services::task_service::TaskService;

/// A masked preview of the stored key (`sk-…YxkA`), or `None` when none is set. The
/// webview gates the AI features on this being present and shows it in settings.
#[tauri::command]
pub fn ai_status(ai_service: State<'_, AiService>) -> AppResult<Option<String>> {
    ai_service.key_hint()
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
pub async fn improve_text(
    ai_service: State<'_, AiService>,
    egress_service: State<'_, EgressService>,
    text: String,
) -> AppResult<String> {
    egress_service.record(EgressKind::AiImprove, AI_DESTINATION, None, text.len())?;
    ai_service.improve(text).await
}

/// Improve a note's text with AI. Unlike `improve_text` it takes the note's topic, because
/// the topic's sensitivity decides whether the text may leave the device at all.
#[tauri::command]
pub async fn improve_note_text(
    ai_service: State<'_, AiService>,
    policy_service: State<'_, PolicyService>,
    egress_service: State<'_, EgressService>,
    text: String,
    topic_id: Option<String>,
) -> AppResult<String> {
    policy_service.ensure_ai_allowed(topic_id.as_deref())?;
    egress_service.record(EgressKind::AiImprove, AI_DESTINATION, None, text.len())?;
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
    egress_service: State<'_, EgressService>,
    id: String,
) -> AppResult<String> {
    let task = task_service.get(&id)?;
    egress_service.record(
        EgressKind::AiPrompt,
        AI_DESTINATION,
        None,
        task.text.len() + task.raw_text.len(),
    )?;
    let group_context = match task.task_group_id.as_deref() {
        Some(group_id) => task_group_service.get(group_id)?.and_then(|group| group.context),
        None => None,
    };
    let prompt = ai_service.generate_prompt(&task, group_context.as_deref()).await?;
    crate::platform::clipboard::write_text(&app, &prompt)?;
    Ok(prompt)
}
