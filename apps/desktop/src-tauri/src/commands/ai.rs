use tauri::State;

use crate::core::error::AppResult;
use crate::services::ai::AiService;

/// Improve raw text with AI and return the cleaned-up result (no persistence).
#[tauri::command]
pub async fn improve_text(ai_service: State<'_, AiService>, text: String) -> AppResult<String> {
    ai_service.improve(text).await
}
