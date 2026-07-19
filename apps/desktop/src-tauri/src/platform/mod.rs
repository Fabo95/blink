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

/// Register the capture-shortcut listener and bind the saved (or default) hotkey.
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    shortcut::register_listener(app)?;
    // Non-fatal: a bad saved value shouldn't stop the app from starting.
    if let Err(err) = shortcut::bind_current(app.handle()) {
        eprintln!("Blink: {err}");
    }
    Ok(())
}
