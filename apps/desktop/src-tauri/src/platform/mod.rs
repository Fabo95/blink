//! OS integration. The OS-specific source detection, copy simulation, and run-event
//! handling live in `macos` (with `fallback` for other systems); the capture hotkey
//! lives in `shortcut`.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as os;

#[cfg(not(target_os = "macos"))]
mod fallback;
#[cfg(not(target_os = "macos"))]
use fallback as os;

pub mod shortcut;
mod window;

/// React to a Tauri run-loop event (e.g. dock-icon reopen on macOS).
pub use os::on_run_event;

/// Register the capture-shortcut listener and bind every method's saved (or default)
/// hotkey. A bad saved value is logged per method inside `bind_all`, never fatal.
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    shortcut::register_listener(app)?;
    shortcut::bind_all(app.handle());
    Ok(())
}
