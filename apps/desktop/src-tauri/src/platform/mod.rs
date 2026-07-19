//! OS-specific integration: the global capture hotkey, input simulation, capture
//! window placement, and frontmost-source detection. The public entry points are
//! no-ops on platforms without a desktop shell.

pub mod frontmost;

#[cfg(desktop)]
mod input;
#[cfg(desktop)]
mod shortcut;
#[cfg(desktop)]
mod window;

use tauri::{AppHandle, RunEvent};

/// Wire up platform features during app setup. Registers the capture hotkey on
/// desktop; a no-op elsewhere.
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(desktop)]
    shortcut::register_capture_shortcut(app)?;
    #[cfg(not(desktop))]
    let _ = app;
    Ok(())
}

/// React to a Tauri run-loop event (e.g. dock-icon reopen on macOS).
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    #[cfg(desktop)]
    window::on_run_event(app, event);
    #[cfg(not(desktop))]
    let _ = (app, event);
}
