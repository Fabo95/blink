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
