use tauri::{AppHandle, Manager};

/// Dismiss the manual-capture panel. Manual capture has no clipboard/source step, so
/// there's nothing to clear — this only hides the panel, then hides the whole app on
/// macOS so focus returns to wherever the user was.
#[tauri::command]
pub fn dismiss_manual_capture(app: AppHandle) {
    if let Some(window) = app.get_webview_window("manual-capture") {
        let _ = window.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.hide();
}
