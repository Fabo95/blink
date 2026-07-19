mod commands;
mod core;
mod platform;
mod services;

use tauri::Manager;

use crate::core::state::PendingSource;
use crate::services::security::SecurityFilter;
use crate::services::store::sqlite::SqliteTaskStore;
use crate::services::store::TaskStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load a `.env` (e.g. OPENAI_API_KEY) — dev convenience so the key doesn't have
    // to be exported in every shell. In dev, load the one next to the crate
    // regardless of the working directory. Real env vars still win.
    #[cfg(all(desktop, debug_assertions))]
    let _ = dotenvy::from_filename(concat!(env!("CARGO_MANIFEST_DIR"), "/.env"));
    #[cfg(desktop)]
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(SecurityFilter::with_defaults())
        .manage(PendingSource::default())
        .setup(|app| {
            // The encrypted DB lives in the per-user app data dir; create it on
            // first run. The store is a trait object, so swapping SQLCipher for a
            // synced store later touches only this block.
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("no app data dir: {e}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("could not create data dir: {e}"))?;
            let store: Box<dyn TaskStore> =
                Box::new(SqliteTaskStore::open(&data_dir.join("blink.db"))?);
            app.manage(store);

            platform::init(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture::capture_from_clipboard,
            commands::capture::sanitize,
            commands::capture::dismiss_capture,
            commands::ai::optimize_text,
            commands::tasks::list_tasks,
            commands::tasks::save_task,
            commands::tasks::delete_task,
            commands::tasks::improve_task,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Blink")
        .run(|app, event| platform::on_run_event(app, &event));
}
