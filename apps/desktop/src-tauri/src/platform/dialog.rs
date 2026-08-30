//! Native file dialogs, via the tauri dialog plugin (`NSOpenPanel` on macOS). Cross-
//! platform glue over the plugin, like `session`/`window` are over their primitives.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Show the native folder picker and return the chosen directory path, or `None` if the
/// user cancelled. The picker blocks until the user responds, so it runs off the main
/// thread (`spawn_blocking`) to keep the app responsive.
pub async fn pick_folder(app: &AppHandle, title: &str) -> Option<String> {
    let dialog = app.dialog().clone();
    let title = title.to_string();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog.file().set_title(title).blocking_pick_folder()
    })
    .await
    .ok() // a JoinError means the picker task panicked — treat as "no selection"
    .flatten();
    picked
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string())
}
