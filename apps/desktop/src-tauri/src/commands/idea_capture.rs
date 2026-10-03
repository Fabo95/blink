use tauri::AppHandle;

/// Dismiss the idea-capture panel. Like manual capture there's no clipboard or source step,
/// so this only hides the panel and returns focus to wherever the user was.
#[tauri::command]
pub fn dismiss_idea_capture(app: AppHandle) {
    crate::platform::window::hide_capture_panel(&app, "idea-capture");
}
