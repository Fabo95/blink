use std::sync::Arc;

use tauri::State;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{UsageRange, UsageReport};
use crate::services::usage_service::UsageService;

/// Claude Code usage for `range`. Reading the transcripts is disk-bound (hundreds of MB on
/// the first call), so it runs off the async runtime.
#[tauri::command]
pub async fn get_usage_report(
    range: UsageRange,
    usage_service: State<'_, Arc<UsageService>>,
) -> AppResult<UsageReport> {
    let usage_service = Arc::clone(&usage_service);
    tauri::async_runtime::spawn_blocking(move || usage_service.report(range))
        .await
        .map_err(|e| AppError::Usage(format!("usage report task failed: {e}")))?
}
