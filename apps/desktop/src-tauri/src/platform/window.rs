//! Copy-capture window placement (cross-platform).

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

/// Show the copy-capture panel centered on the active screen and tell it to read the
/// clipboard.
pub fn open_copy_capture_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("copy-capture") else {
        return;
    };

    let size = window.outer_size().unwrap_or(PhysicalSize::new(480, 300));

    // Center on the monitor under the cursor (the active screen), falling back to
    // the primary monitor.
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
    let _ = app.emit_to("copy-capture", "copy-capture-open", ());
}
