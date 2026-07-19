//! The system-wide capture hotkey and the pipeline it drives.

use std::str::FromStr;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::core::state::PendingSource;

use super::{frontmost, input, window};

/// Register the capture hotkey (⌘⇧B / Ctrl+Shift+B). When pressed it records the
/// source app/window, copies the current selection, then opens the quick-capture
/// panel — the input simulation and window ops run on the main thread (macOS),
/// while the delays run on a background thread so the UI never blocks.
pub fn register_capture_shortcut(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let capture_shortcut = Shortcut::from_str("CommandOrControl+Shift+B")?;

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut != &capture_shortcut || event.state() != ShortcutState::Pressed {
                    return;
                }
                let app = app.clone();
                thread::spawn(move || {
                    // Let the user release the hotkey keys before we send ⌘C.
                    thread::sleep(Duration::from_millis(60));
                    // Record the source app/window while it's still frontmost, then
                    // copy its selection — both must happen before our panel shows.
                    let capture_handle = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        stash_frontmost_source(&capture_handle);
                        input::copy_selection();
                    });
                    // Give the copy a moment to reach the clipboard.
                    thread::sleep(Duration::from_millis(140));
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || window::open_capture_panel(&handle));
                });
            })
            .build(),
    )?;

    // Don't crash if the combo is already taken by another app — just log it.
    if let Err(err) = app.global_shortcut().register(capture_shortcut) {
        eprintln!("Blink: could not register capture shortcut: {err}");
    }

    Ok(())
}

/// Record the frontmost app/window as the pending capture source, before our panel
/// takes focus.
fn stash_frontmost_source(app: &AppHandle) {
    if let Some(state) = app.try_state::<PendingSource>() {
        state.set(frontmost::detect());
    }
}
