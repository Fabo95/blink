//! Sync IPC: drive the sync engine from the webview. The bearer token never crosses
//! this boundary — it stays in the keychain and the native layer.

use std::sync::Arc;

use tauri::State;

use crate::core::error::AppResult;
use crate::services::sync_service::SyncService;

/// Run one sync cycle (pull remote changes, then push local ones). A no-op until the
/// user is signed in.
#[tauri::command]
pub async fn sync_now(sync_service: State<'_, Arc<SyncService>>) -> AppResult<()> {
    sync_service.sync().await
}
