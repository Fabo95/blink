//! Managed application state shared across the Tauri IPC boundary.

use std::sync::Mutex;

/// The frontmost app + window at the instant the capture hotkey fired.
#[derive(Clone)]
pub struct FrontmostSource {
    pub app_id: String,
    pub app_name: String,
    pub window_title: String,
}

/// Set by the capture-hotkey handler *before* our panel steals focus, then read by
/// the `capture_from_clipboard` command. Reads are non-destructive (`peek`) because
/// the panel may query more than once per open; the stash is `clear`ed on dismiss so
/// a stale source can't leak into a later, unrelated capture.
#[derive(Default)]
pub struct PendingSource(Mutex<Option<FrontmostSource>>);

impl PendingSource {
    pub fn set(&self, source: Option<FrontmostSource>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = source;
        }
    }

    pub fn peek(&self) -> Option<FrontmostSource> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = None;
        }
    }
}
