use chrono::Utc;
use tauri::{AppHandle, Manager, State};

use crate::core::models::{CaptureDraft, CaptureSource};
use crate::core::state::{FrontmostSource, PendingCapture, PendingSource};
use crate::services::security::SecurityService;

/// Step 1–3 of copy-capture: take the snapshotted selection, run the DLP filter, return a
/// review-ready draft. Nothing is persisted or transmitted here. The text was already
/// lifted off the clipboard by the hotkey handler (which restored the user's clipboard),
/// so this reads the stash rather than the live clipboard.
#[tauri::command]
pub fn read_copy_capture(
    security_service: State<'_, SecurityService>,
    source: State<'_, PendingSource>,
    capture: State<'_, PendingCapture>,
) -> CaptureDraft {
    // Empty stash (nothing selected, or a non-text clipboard) → empty capture.
    let raw = capture.peek().unwrap_or_default();
    let result = security_service.sanitize(&raw);

    // Both set by the copy-capture hotkey while the source app was still frontmost.
    let front = source.peek();
    let link = front.as_ref().and_then(|f| f.url.clone());

    CaptureDraft {
        text: result.clean,
        original_length: raw.chars().count(),
        redaction_count: result.redaction_count,
        source: front.map(capture_source_from).unwrap_or_else(fallback_capture_source),
        link,
    }
}

fn capture_source_from(front: FrontmostSource) -> CaptureSource {
    CaptureSource {
        app_id: front.app_id,
        app_name: front.app_name,
        window_title: front.window_title,
        captured_at: Utc::now().to_rfc3339(),
    }
}

fn fallback_capture_source() -> CaptureSource {
    CaptureSource {
        app_id: "clipboard".to_string(),
        app_name: "Clipboard".to_string(),
        window_title: String::new(),
        captured_at: Utc::now().to_rfc3339(),
    }
}

/// Dismiss the copy-capture panel. Hides its window, then hides the whole app on
/// macOS so focus returns to whatever the user was in — the main window never
/// surfaces just because the panel closed.
#[tauri::command]
pub fn dismiss_copy_capture(
    app: AppHandle,
    source: State<'_, PendingSource>,
    capture: State<'_, PendingCapture>,
) {
    // Drop the captured source + text so the next unrelated capture doesn't inherit them.
    source.clear();
    capture.clear();
    if let Some(window) = app.get_webview_window("copy-capture") {
        let _ = window.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.hide();
}
