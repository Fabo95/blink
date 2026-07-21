use tauri::AppHandle;

use crate::core::error::AppResult;
use crate::platform::shortcut::CaptureMethod;

#[tauri::command]
pub fn get_capture_shortcut(app: AppHandle, method: CaptureMethod) -> AppResult<String> {
    crate::platform::shortcut::current(&app, method)
}

#[tauri::command]
pub fn set_capture_shortcut(
    app: AppHandle,
    method: CaptureMethod,
    shortcut: String,
) -> AppResult<()> {
    crate::platform::shortcut::set(&app, method, &shortcut)
}
