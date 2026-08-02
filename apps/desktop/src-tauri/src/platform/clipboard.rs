//! Clipboard writes. Services never import `tauri`, and `platform` is the one layer
//! that touches the runtime, so a service-driven action (the prompt-to-clipboard
//! command) routes its clipboard write through here.

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::core::error::{AppError, AppResult};

/// Put `text` on the system clipboard.
pub fn write_text(app: &AppHandle, text: &str) -> AppResult<()> {
    app.clipboard()
        .write_text(text.to_string())
        .map_err(|e| AppError::Clipboard(format!("could not write to clipboard: {e}")))
}
