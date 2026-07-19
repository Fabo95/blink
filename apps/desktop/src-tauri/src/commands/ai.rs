use crate::core::error::AppResult;

/// Improve raw text with AI and return the cleaned-up result (no persistence).
#[tauri::command]
pub async fn improve_text(text: String) -> AppResult<String> {
    crate::services::ai::improve(text).await
}
