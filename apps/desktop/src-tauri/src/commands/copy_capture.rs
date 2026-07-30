use tauri::{AppHandle, State};

use crate::core::models::CaptureDraft;
use crate::core::state::{PendingCapture, PendingSource};
use crate::services::capture_service::CaptureService;

/// Step 1–3 of copy-capture: take the snapshotted selection, run the DLP filter, return a
/// review-ready draft. Nothing is persisted or transmitted here. The text was already
/// lifted off the clipboard by the hotkey handler (which restored the user's clipboard),
/// so this reads the stash rather than the live clipboard.
#[tauri::command]
pub fn read_copy_capture(
    capture_service: State<'_, CaptureService>,
    source: State<'_, PendingSource>,
    capture: State<'_, PendingCapture>,
) -> CaptureDraft {
    capture_service.draft(capture.peek(), source.peek())
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
    crate::platform::window::hide_capture_panel(&app, "copy-capture");
}
