//! The capture hotkey, end to end: its persisted setting (via the [`Repository`]),
//! OS registration, and the pipeline it drives. This module owns the whole feature.

use std::str::FromStr;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::core::error::{AppError, AppResult};
use crate::repository::Repository;

use super::{os, window};

const SETTING_KEY: &str = "capture_shortcut";
const DEFAULT: &str = "CommandOrControl+Shift+B";

/// Register the global-shortcut listener: a handler that starts the copy-capture flow
/// on any pressed shortcut. Only the capture hotkey is ever bound, so it needn't match
/// a specific one.
pub fn register_listener(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    start_copy_capture(app.clone());
                }
            })
            .build(),
    )?;
    Ok(())
}

/// Bind the configured hotkey (the saved one, or the default) — called once at
/// startup, after the handler.
pub fn bind_current(app: &AppHandle) -> AppResult<()> {
    bind(app, &current(app)?)
}

/// The current capture hotkey: the user's saved one, or the default.
pub fn current(app: &AppHandle) -> AppResult<String> {
    Ok(app
        .state::<Repository>()
        .settings
        .get(SETTING_KEY)?
        .unwrap_or_else(|| DEFAULT.to_string()))
}

/// Change the hotkey: bind the new shortcut and persist it. Binds first, so an
/// invalid or already-taken shortcut errors before it's saved.
pub fn set(app: &AppHandle, shortcut: &str) -> AppResult<()> {
    bind(app, shortcut)?;
    app.state::<Repository>().settings.set(SETTING_KEY, shortcut)
}

/// Register `shortcut` (a Tauri accelerator string) with the OS as the one and only
/// capture hotkey, replacing any previous binding.
fn bind(app: &AppHandle, shortcut: &str) -> AppResult<()> {
    let parsed = Shortcut::from_str(shortcut)
        .map_err(|e| AppError::Shortcut(format!("invalid shortcut '{shortcut}': {e}")))?;
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    manager
        .register(parsed)
        .map_err(|e| AppError::Shortcut(format!("could not register '{shortcut}': {e}")))?;
    Ok(())
}

/// Run the copy-capture flow: record the source + copy the selection, then open the
/// panel. Input/window ops run on the main thread (macOS); the delays run on a
/// worker thread so the UI never blocks.
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
