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
    os::on_run_event(app, event);
}
