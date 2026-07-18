use chrono::Utc;
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::models::{CaptureDraft, CaptureSource, SanitizeResult};
use crate::security::SecurityFilter;

/// Step 1–3: read the system clipboard, run the DLP filter, return a review-ready
/// draft. Nothing is persisted or transmitted here.
#[tauri::command]
pub fn capture_from_clipboard(app: AppHandle, filter: State<'_, SecurityFilter>) -> CaptureDraft {
    // The real clipboard. Empty / non-text clipboard → empty capture.
    let raw = app.clipboard().read_text().unwrap_or_default();
    let result = filter.sanitize(&raw);

    CaptureDraft {
        text: result.clean,
        original_length: raw.chars().count(),
        redaction_count: result.redaction_count,
        // TODO(phase-1): the frontmost app/window isn't knowable from the
        // clipboard alone — real source detection needs a platform API.
        source: CaptureSource {
            app_id: "clipboard".to_string(),
            window_title: "Copied text".to_string(),
            captured_at: Utc::now().to_rfc3339(),
        },
    }
}

#[tauri::command]
pub fn sanitize(filter: State<'_, SecurityFilter>, text: String) -> SanitizeResult {
    filter.sanitize(&text)
}
