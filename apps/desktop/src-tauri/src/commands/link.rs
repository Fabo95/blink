use crate::core::error::{AppError, AppResult};

/// Open a task's link in the user's default browser. Only `http(s)` URLs are allowed —
/// we won't hand arbitrary schemes (`file:`, `javascript:`, …) or flag-like strings to
/// the OS opener.
#[tauri::command]
pub fn open_link(url: String) -> AppResult<()> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err(AppError::Link(format!("refusing to open non-web link '{url}'")));
    }
    crate::platform::os::open_url(trimmed)
        .map_err(|e| AppError::Link(format!("could not open '{url}': {e}")))
}
