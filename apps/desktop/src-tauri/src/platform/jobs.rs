//! Recurring background work that runs off the main thread — currently the periodic
//! sync cycle. Lives in `platform` (not `services`) because it drives the Tauri async
//! runtime via `tauri::async_runtime`, which `services/` must not import. Started once
//! from `platform::init`; the loops run for the app's lifetime.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use crate::services::sync_service::SyncService;

/// How often a sync cycle runs. Push latency is bounded by this until a
/// debounce-on-edit trigger lands.
const SYNC_INTERVAL: Duration = Duration::from_secs(15);

/// Start every background loop. Fire-and-forget for the app's lifetime.
pub fn start(sync_service: Arc<SyncService>) {
    spawn_sync_loop(sync_service);
}

fn spawn_sync_loop(sync_service: Arc<SyncService>) {
    thread::spawn(move || loop {
        thread::sleep(SYNC_INTERVAL);
        // `sync()` no-ops until signed in + the vault is unlocked, so this stays quiet
        // before the user has set sync up.
        if let Err(err) = tauri::async_runtime::block_on(sync_service.sync()) {
            eprintln!("[sync] cycle failed: {err}");
        }
    });
}
