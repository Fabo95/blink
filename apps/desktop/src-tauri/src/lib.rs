mod commands;
mod models;
mod security_filter;
mod store;

use store::Store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Store::default())
        .invoke_handler(tauri::generate_handler![
            commands::capture_from_clipboard,
            commands::sanitize,
            commands::list_tasks,
            commands::save_task,
            commands::delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blink");
}
