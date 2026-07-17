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
            commands::tasks::list_tasks,
            commands::tasks::save_task,
            commands::tasks::delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blink");
}

/// Register the system-wide capture hotkey (⌘⇧B / Ctrl+Shift+B). When pressed
/// from any app, it brings Blink to the front and emits `capture-shortcut`, which
/// the frontend listens for to run the capture flow.
#[cfg(desktop)]
fn register_capture_shortcut(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use std::str::FromStr;

    use tauri::{Emitter, Manager};
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let capture_shortcut = Shortcut::from_str("CommandOrControl+Shift+B")?;

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut == &capture_shortcut && event.state() == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("capture-shortcut", ());
                }
            })
            .build(),
    )?;

    // Don't crash if the combo is already taken by another app — just log it.
    if let Err(err) = app.global_shortcut().register(capture_shortcut) {
        eprintln!("Blink: could not register capture shortcut: {err}");
    }

    Ok(())
}
