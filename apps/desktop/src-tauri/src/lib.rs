mod commands;
mod error;
mod models;
mod security;
mod store;

use security::SecurityFilter;
use store::memory::MemoryTaskStore;
use store::TaskStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The store is injected as a trait object, so swapping MemoryTaskStore for a
    // SQLCipher-backed store later touches only this line.
    let store: Box<dyn TaskStore> = Box::new(MemoryTaskStore::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(store)
        .manage(SecurityFilter::with_defaults())
        .setup(|app| {
            #[cfg(desktop)]
            register_capture_shortcut(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture::capture_from_clipboard,
            commands::capture::sanitize,
            commands::capture::dismiss_capture,
            commands::tasks::list_tasks,
            commands::tasks::save_task,
            commands::tasks::delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blink");
}

/// Register the system-wide capture hotkey (⌘⇧B / Ctrl+Shift+B). When pressed it
/// copies the current selection, then opens the quick-capture panel by the cursor.
#[cfg(desktop)]
fn register_capture_shortcut(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use std::str::FromStr;

    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let capture_shortcut = Shortcut::from_str("CommandOrControl+Shift+B")?;

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut != &capture_shortcut || event.state() != ShortcutState::Pressed {
                    return;
                }
                let app = app.clone();
                // Input simulation and window ops must run on the main thread (macOS).
                // The delays run on this background thread so the UI thread never blocks.
                std::thread::spawn(move || {
                    // Let the user release the hotkey keys before we send ⌘C.
                    std::thread::sleep(std::time::Duration::from_millis(60));
                    let _ = app.run_on_main_thread(copy_selection);
                    // Give the copy a moment to reach the clipboard.
                    std::thread::sleep(std::time::Duration::from_millis(140));
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || open_capture_panel(&handle));
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

/// Simulate ⌘C to copy the current selection in the frontmost app. Needs macOS
/// Accessibility permission; without it the key events are dropped (a no-op) and
/// capture falls back to whatever is already on the clipboard.
#[cfg(desktop)]
fn copy_selection() {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    let Ok(mut enigo) = Enigo::new(&Settings::default()) else {
        return;
    };
    let _ = enigo.key(Key::Meta, Direction::Press);
    let _ = enigo.key(Key::Unicode('c'), Direction::Click);
    let _ = enigo.key(Key::Meta, Direction::Release);
}

/// Show the capture panel by the cursor and tell it to read the clipboard.
#[cfg(desktop)]
fn open_capture_panel(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};

    if let Some(window) = app.get_webview_window("capture") {
        if let Ok(pos) = app.cursor_position() {
            let _ = window.set_position(tauri::PhysicalPosition::new(pos.x + 12.0, pos.y + 12.0));
        }
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit_to("capture", "capture-open", ());
    }
}
