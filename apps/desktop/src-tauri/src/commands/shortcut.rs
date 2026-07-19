use tauri::AppHandle;

use crate::core::error::AppResult;

#[tauri::command]
pub fn get_capture_shortcut(app: AppHandle) -> AppResult<String> {
    crate::platform::shortcut::current(&app)
}

#[tauri::command]
pub fn set_capture_shortcut(app: AppHandle, shortcut: String) -> AppResult<()> {
    crate::platform::shortcut::set(&app, &shortcut)
}
