use tauri::AppHandle;

use crate::core::error::AppResult;

#[tauri::command]
pub fn get_capture_shortcut(app: AppHandle) -> AppResult<String> {
    crate::platform::capture_shortcut(&app)
}

#[tauri::command]
pub fn set_capture_shortcut(app: AppHandle, shortcut: String) -> AppResult<()> {
    crate::platform::set_capture_shortcut(&app, &shortcut)
}
