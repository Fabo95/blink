//! Sync IPC: drive the sync engine from the webview. The bearer token never crosses
//! this boundary — it stays in the keychain and the native layer.

use std::sync::Arc;

use tauri::State;

use crate::services::sync_service::SyncService;

/// Ask for a sync cycle now (the manual trigger behind the header's sync indicator).
/// Signals the background loop rather than syncing inline, so the cycle still emits the
/// `sync-state` events the indicator renders and still resets the pull backoff.
#[tauri::command]
pub fn sync_now(sync_service: State<'_, Arc<SyncService>>) {
    sync_service.request_sync();
}
