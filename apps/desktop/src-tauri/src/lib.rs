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
    // Load a `.env` (e.g. OPENAI_API_KEY) if present — dev convenience so the key
    // doesn't have to be exported in every shell. Real env vars still win.
    #[cfg(desktop)]
    let _ = dotenvy::dotenv();

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
            commands::ai::optimize_capture,
            commands::tasks::list_tasks,
            commands::tasks::save_task,
            commands::tasks::delete_task,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Blink")
        .run(|_app, _event| {
            // Dock-icon click re-opens the inbox — the capture flow keeps the main
            // window hidden, so this is how the user brings it back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                use tauri::Manager;
                if let Some(main) = _app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
        });
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

/// Show the capture panel by the cursor and tell it to read the clipboard. The
/// position is clamped so the whole panel stays on the monitor under the cursor.
#[cfg(desktop)]
fn open_capture_panel(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

    let Some(window) = app.get_webview_window("capture") else {
        return;
    };

    if let Ok(cursor) = app.cursor_position() {
        let (mut x, mut y) = (cursor.x + 5.0, cursor.y + 5.0);
        let size = window.outer_size().unwrap_or(PhysicalSize::new(480, 300));
        if let Ok(Some(monitor)) = window.monitor_from_point(cursor.x, cursor.y) {
            let m = monitor.position();
            let s = monitor.size();
            const MARGIN: f64 = 8.0;
            let min_x = m.x as f64 + MARGIN;
            let min_y = m.y as f64 + MARGIN;
            let max_x = (m.x as f64 + s.width as f64 - size.width as f64 - MARGIN).max(min_x);
            let max_y = (m.y as f64 + s.height as f64 - size.height as f64 - MARGIN).max(min_y);
            x = x.clamp(min_x, max_x);
            y = y.clamp(min_y, max_y);
        }
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }

    let _ = window.show();
    let _ = window.set_focus();
    // The shortcut shows only the panel — keep the inbox out of the way.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    let _ = app.emit_to("capture", "capture-open", ());
}
