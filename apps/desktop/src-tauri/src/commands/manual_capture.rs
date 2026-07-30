use tauri::AppHandle;

/// Dismiss the manual-capture panel. Manual capture has no clipboard/source step, so
/// there's nothing to clear — this only hides the panel, then hides the whole app on
/// macOS so focus returns to wherever the user was.
#[tauri::command]
pub fn dismiss_manual_capture(app: AppHandle) {
    crate::platform::window::hide_capture_panel(&app, "manual-capture");
}
