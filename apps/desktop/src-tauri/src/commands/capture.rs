use chrono::Utc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::core::models::{CaptureDraft, CaptureSource, SanitizeResult};
use crate::core::state::{FrontmostSource, PendingSource};
use crate::services::security::SecurityFilter;

/// Step 1–3: read the system clipboard, run the DLP filter, return a review-ready
/// draft. Nothing is persisted or transmitted here.
#[tauri::command]
pub fn capture_from_clipboard(
    app: AppHandle,
    filter: State<'_, SecurityFilter>,
    source: State<'_, PendingSource>,
) -> CaptureDraft {
    // The real clipboard. Empty / non-text clipboard → empty capture.
    let raw = app.clipboard().read_text().unwrap_or_default();
    let result = filter.sanitize(&raw);

    CaptureDraft {
        text: result.clean,
        original_length: raw.chars().count(),
        redaction_count: result.redaction_count,
        // Set by the ⌘⇧B handler while the source app was still frontmost. The
        // main-window "Read clipboard" button has no source app → the fallback.
        source: source.peek().map(into_capture_source).unwrap_or_else(clipboard_source),
    }
}

fn into_capture_source(front: FrontmostSource) -> CaptureSource {
    CaptureSource {
        app_id: front.app_id,
        app_name: front.app_name,
        window_title: front.window_title,
        captured_at: Utc::now().to_rfc3339(),
    }
}

fn clipboard_source() -> CaptureSource {
    CaptureSource {
        app_id: "clipboard".to_string(),
        app_name: "Clipboard".to_string(),
        window_title: String::new(),
        captured_at: Utc::now().to_rfc3339(),
    }
}

#[tauri::command]
pub fn sanitize(filter: State<'_, SecurityFilter>, text: String) -> SanitizeResult {
    filter.sanitize(&text)
}

/// Dismiss the quick-capture panel. Hides its window, then hides the whole app on
/// macOS so focus returns to whatever the user was in — the main window never
/// surfaces just because the panel closed.
#[tauri::command]
pub fn dismiss_capture(app: AppHandle, source: State<'_, PendingSource>) {
    // Drop the captured source so the next unrelated capture doesn't inherit it.
    source.clear();
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.hide();
}
