//! Managed application state shared across the Tauri IPC boundary.

use std::sync::Mutex;

/// The frontmost app + window at the instant the capture hotkey fired.
#[derive(Clone)]
pub struct FrontmostSource {
    pub app_id: String,
    pub app_name: String,
    pub window_title: String,
    /// The current page URL, when the frontmost app is a browser — used to pre-fill the
    /// capture's link field. `None` for non-browsers or if it couldn't be read.
    pub url: Option<String>,
}

/// Set by the capture-hotkey handler *before* our panel steals focus, then read by
/// the `read_copy_capture` command. Reads are non-destructive (`peek`) because
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

/// The raw copied text for the pending copy-capture. The hotkey handler snapshots the
/// selection off the clipboard (then restores the user's clipboard) and stashes it here,
/// so `read_copy_capture` reads *this* rather than the live clipboard. Same lifecycle as
/// [`PendingSource`]: `peek`ed (the panel may query more than once) and `clear`ed on dismiss.
#[derive(Default)]
pub struct PendingCapture(Mutex<Option<String>>);

impl PendingCapture {
    pub fn set(&self, text: Option<String>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = text;
        }
    }

    pub fn peek(&self) -> Option<String> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = None;
        }
    }
}
