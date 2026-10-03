use tauri::{AppHandle, State};

use crate::core::error::AppResult;
use crate::core::models::ExportFormat;
use crate::services::export_service::ExportService;

/// Export one topic (`topic_id`) or everything exportable to a file the user picks in the
/// native save dialog. Returns the written path, or `None` if the user cancelled.
#[tauri::command]
pub async fn export_notes(
    app: AppHandle,
    export_service: State<'_, ExportService>,
    topic_id: Option<String>,
    format: ExportFormat,
) -> AppResult<Option<String>> {
    let export = export_service.render(topic_id.as_deref(), format)?;
    let Some(path) =
        crate::platform::dialog::pick_save_path(&app, "Export ideas", &export.file_name).await
    else {
        return Ok(None);
    };
    export_service.write(&path, &export.content)?;
    Ok(Some(path.to_string_lossy().to_string()))
}
