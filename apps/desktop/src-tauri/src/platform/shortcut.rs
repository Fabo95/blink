//! Capture hotkeys, end to end. Each capture *method* owns a global shortcut
//! (persisted via the [`Repository`]) and a window. A single handler is registered
//! for all of them; because it fires for every bound hotkey, it resolves which method
//! the pressed shortcut belongs to and starts that flow. This module owns the feature.

use std::str::FromStr;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::core::error::{AppError, AppResult};
use crate::repository::Repository;

use super::{os, window};

/// A way to start a capture. Each variant owns a global hotkey and a window; adding a
/// method (voice, …) is a variant here plus its `start`/window wiring. Deserialized
/// from the frontend as a lowercase string (`"copy"` / `"manual"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMethod {
    Copy,
    Manual,
}

impl CaptureMethod {
    /// Every method — the set bound at startup and dispatched over on a keypress.
    const ALL: [CaptureMethod; 2] = [CaptureMethod::Copy, CaptureMethod::Manual];

    /// The `settings` key this method's hotkey is persisted under.
    fn setting_key(self) -> &'static str {
        match self {
            CaptureMethod::Copy => "copy_capture_shortcut",
            CaptureMethod::Manual => "manual_capture_shortcut",
        }
    }

    /// The out-of-the-box hotkey, used until the user changes it.
    fn default_shortcut(self) -> &'static str {
        match self {
            CaptureMethod::Copy => "CommandOrControl+Shift+B",
            CaptureMethod::Manual => "CommandOrControl+Shift+M",
        }
    }

    /// This method's current hotkey: the user's saved one, or the default.
    fn shortcut(self, app: &AppHandle) -> AppResult<String> {
        Ok(app
            .state::<Repository>()
            .settings
            .get(self.setting_key())?
            .unwrap_or_else(|| self.default_shortcut().to_string()))
    }

    /// Run this method's flow (on the shortcut-handler thread).
    fn start(self, app: AppHandle) {
        match self {
            CaptureMethod::Copy => start_copy_capture(app),
            CaptureMethod::Manual => start_manual_capture(app),
        }
    }
}

/// Register the single global-shortcut handler. It fires for *every* bound hotkey, so
/// it resolves which method the pressed shortcut is bound to and starts that flow.
pub fn register_listener(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if let Some(method) = method_of(app, shortcut) {
                    method.start(app.clone());
                }
            })
            .build(),
    )?;
    Ok(())
}

/// Bind every method's configured hotkey — called once at startup, after the handler.
/// A bad saved value for one method is logged and skipped, never fatal.
pub fn bind_all(app: &AppHandle) {
    for method in CaptureMethod::ALL {
        let shortcut = match method.shortcut(app) {
            Ok(shortcut) => shortcut,
            Err(err) => {
                eprintln!("Blink: {err}");
                continue;
            }
        };
        if let Err(err) = bind(app, &shortcut) {
            eprintln!("Blink: {err}");
        }
    }
}

/// A method's current hotkey (for the settings UI).
pub fn current(app: &AppHandle, method: CaptureMethod) -> AppResult<String> {
    method.shortcut(app)
}

/// Change a method's hotkey: free its old binding, bind the new one, then persist.
/// Binds first, so an invalid or already-taken shortcut errors before it's saved.
pub fn set(app: &AppHandle, method: CaptureMethod, shortcut: &str) -> AppResult<()> {
    let parsed = Shortcut::from_str(shortcut)
        .map_err(|e| AppError::Shortcut(format!("invalid shortcut '{shortcut}': {e}")))?;
    // Reject a hotkey already owned by a *different* method (re-binding a method to its
    // own current combo is a no-op, not a conflict).
    if let Some(other) = method_of(app, &parsed) {
        if other != method {
            return Err(AppError::Shortcut(format!("'{shortcut}' is already in use")));
        }
    }
    // Release this method's previous hotkey so it stops firing.
    if let Ok(old) = method.shortcut(app) {
        if let Ok(old_parsed) = Shortcut::from_str(&old) {
            let _ = app.global_shortcut().unregister(old_parsed);
        }
    }
    bind(app, shortcut)?;
    app.state::<Repository>()
        .settings
        .set(method.setting_key(), shortcut)
}

/// Register a Tauri accelerator string with the OS. Idempotent: a hotkey already
/// registered is left as-is rather than erroring.
fn bind(app: &AppHandle, shortcut: &str) -> AppResult<()> {
    let parsed = Shortcut::from_str(shortcut)
        .map_err(|e| AppError::Shortcut(format!("invalid shortcut '{shortcut}': {e}")))?;
    let manager = app.global_shortcut();
    if manager.is_registered(parsed) {
        return Ok(());
    }
    manager
        .register(parsed)
        .map_err(|e| AppError::Shortcut(format!("could not register '{shortcut}': {e}")))?;
    Ok(())
}

/// Which capture method (if any) a shortcut is bound to — found by matching it against
/// each method's current hotkey.
fn method_of(app: &AppHandle, pressed: &Shortcut) -> Option<CaptureMethod> {
    CaptureMethod::ALL.into_iter().find(|method| {
        method
            .shortcut(app)
            .ok()
            .and_then(|shortcut| Shortcut::from_str(&shortcut).ok())
            .as_ref()
            == Some(pressed)
    })
}

/// Copy-capture: record the source + copy the selection, then open the panel. Input/
/// window ops run on the main thread (macOS); the delays run on a worker thread so the
/// UI never blocks.
fn start_copy_capture(app: AppHandle) {
    thread::spawn(move || {
        // Let the user release the hotkey keys before we send ⌘C.
        thread::sleep(Duration::from_millis(60));
        let capture_handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            os::record_source(&capture_handle);
            os::copy_selection();
        });
        // Give the copy a moment to reach the clipboard.
        thread::sleep(Duration::from_millis(140));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || window::open_copy_capture_window(&handle));
    });
}

/// Manual capture: no clipboard, no source — just open the panel to type into. Window
/// ops run on the main thread (macOS).
fn start_manual_capture(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || window::open_manual_capture_window(&handle));
}
