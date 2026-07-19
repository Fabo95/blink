use crate::core::error::AppResult;

/// Ask OpenAI to clean up the captured text into a single action item.
#[tauri::command]
pub async fn optimize_text(text: String) -> AppResult<String> {
    crate::services::ai::optimize(text).await
}
