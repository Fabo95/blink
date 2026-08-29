//! Sync IPC: drive the encrypted sync engine from the webview. No key ever crosses
//! this boundary in readable form — the master password and Secret Key the user types
//! go straight into the native vault, and the VMK stays in the keychain + native
//! layer, out of the JS heap.

use std::sync::Arc;

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::VaultStatus;
use crate::services::sync_service::SyncService;
use crate::services::vault_service::VaultService;

/// Which vault screen the post-login gate should show (unlocked / needs-setup /
/// needs-unlock). Checks the server for an existing keyset when locked.
#[tauri::command]
pub async fn vault_status(sync_service: State<'_, Arc<SyncService>>) -> AppResult<VaultStatus> {
    sync_service.vault_status().await
}

/// First-time setup: create the vault and upload the keyset. Returns the Secret Key to
/// show the user **once** — they must save it (it's never sent to the server).
#[tauri::command]
pub async fn setup_vault(
    sync_service: State<'_, Arc<SyncService>>,
    master_password: String,
) -> AppResult<String> {
    sync_service.setup_vault(&master_password).await
}

/// Unlock the vault on this device from the server-stored keyset. Errors if the master
/// password or Secret Key is wrong, or the account hasn't been set up.
#[tauri::command]
pub async fn unlock_vault(
    sync_service: State<'_, Arc<SyncService>>,
    master_password: String,
    secret_key: String,
) -> AppResult<()> {
    sync_service.unlock_vault(&master_password, &secret_key).await
}

/// Run one sync cycle (pull remote changes, then push local ones). Requires the vault
/// unlocked.
#[tauri::command]
pub async fn sync_now(sync_service: State<'_, Arc<SyncService>>) -> AppResult<()> {
    sync_service.sync().await
}

/// Whether the vault is unlocked on this device (the VMK is available).
#[tauri::command]
pub fn is_vault_unlocked(vault_service: State<'_, Arc<VaultService>>) -> bool {
    vault_service.is_unlocked()
}

/// Lock the vault (sign out of sync) — forgets the cached VMK.
#[tauri::command]
pub fn lock_vault(vault_service: State<'_, Arc<VaultService>>) -> AppResult<()> {
    vault_service.lock()
}
