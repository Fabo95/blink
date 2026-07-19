//! OS integration. Cross-platform orchestration — the capture hotkey and its
//! pipeline, capture-window placement — lives here at the root. The OS-specific
//! pieces (source detection, copy simulation, run-event handling) live in per-OS
//! modules selected at compile time. To support a new platform, add a `windows` /
//! `ios` module exposing the same functions and one `cfg` line below.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as os;

#[cfg(not(target_os = "macos"))]
mod fallback;
#[cfg(not(target_os = "macos"))]
use fallback as os;

#[cfg(desktop)]
mod shortcut;
#[cfg(desktop)]
mod window;

use tauri::{AppHandle, RunEvent};

use crate::core::error::AppResult;

/// Wire up platform features during app setup: on desktop, register the capture-
/// shortcut handler and bind the saved (or default) hotkey.
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(desktop)]
    {
        shortcut::register_listener(app)?;
        // Non-fatal: a bad saved value shouldn't stop the app from starting.
        if let Err(err) = shortcut::bind_current(app.handle()) {
            eprintln!("Blink: {err}");
        }
    }
    #[cfg(not(desktop))]
    let _ = app;
    Ok(())
}

/// The current capture hotkey (saved or default). Empty on non-desktop.
pub fn capture_shortcut(app: &AppHandle) -> AppResult<String> {
    #[cfg(desktop)]
    {
        shortcut::current(app)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(String::new())
    }
}

/// Bind + persist a new capture hotkey. No-op on non-desktop.
pub fn set_capture_shortcut(app: &AppHandle, shortcut: &str) -> AppResult<()> {
    #[cfg(desktop)]
    {
        shortcut::set(app, shortcut)
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, shortcut);
        Ok(())
    }
}

/// React to a Tauri run-loop event (e.g. dock-icon reopen on macOS).
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    os::on_run_event(app, event);
}
