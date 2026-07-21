//! Capture-window placement (cross-platform) — shared by every capture method's panel.

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

/// Show the copy-capture panel and tell it to read the clipboard.
pub fn open_copy_capture_window(app: &AppHandle) {
    if show_centered(app, "copy-capture") {
        let _ = app.emit_to("copy-capture", "copy-capture-open", ());
    }
}

/// Show the manual-capture panel and tell it to reset for a fresh entry.
pub fn open_manual_capture_window(app: &AppHandle) {
    if show_centered(app, "manual-capture") {
        let _ = app.emit_to("manual-capture", "manual-capture-open", ());
    }
}

/// Center the labelled capture window on the active screen, show + focus it, and hide
/// the inbox so only the panel is up. Returns whether the window exists.
fn show_centered(app: &AppHandle, label: &str) -> bool {
    let Some(window) = app.get_webview_window(label) else {
        return false;
    };

    let size = window.outer_size().unwrap_or(PhysicalSize::new(480, 300));

    // Center on the monitor under the cursor (the active screen), falling back to the
    // primary monitor.
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|c| window.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let m = monitor.position();
        let s = monitor.size();
        let x = m.x + (s.width as i32 - size.width as i32) / 2;
        let y = m.y + (s.height as i32 - size.height as i32) / 2;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }

    let _ = window.show();
    let _ = window.set_focus();
    // The shortcut shows only the panel — keep the inbox out of the way.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    true
}
