//! OS integration. Native primitives live in the `os` module (which selects its
//! implementation by target at compile time); `shortcut` (the capture hotkey) and
//! `window` (capture-panel placement) are the cross-platform glue built on top.
//! Callers reach OS ops as `platform::os::…`.

pub mod os;
pub mod shortcut;
pub mod window;

/// Register the capture-shortcut listener and bind every method's saved (or default)
/// hotkey. A bad saved value is logged per method inside `bind_all`, never fatal.
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    shortcut::register_listener(app)?;
    shortcut::bind_all(app.handle());
    Ok(())
}
