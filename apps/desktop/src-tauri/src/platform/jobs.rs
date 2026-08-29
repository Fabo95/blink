//! Recurring background work that runs off the main thread — currently the periodic
//! sync cycle. Lives in `platform` (not `services`) because it drives the Tauri async
//! runtime via `tauri::async_runtime` and emits window events, which `services/` must
//! not touch. Started once from `platform::init`; the loops run for the app's lifetime.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::services::sync_service::SyncService;

/// How often a sync cycle runs. Push latency is bounded by this until a
/// debounce-on-edit trigger lands.
const SYNC_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStateEvent {
    state: &'static str,
    message: Option<String>,
}

/// Start every background loop. Fire-and-forget for the app's lifetime.
pub fn start(app: AppHandle, sync_service: Arc<SyncService>) {
    spawn_sync_loop(app, sync_service);
}

fn spawn_sync_loop(app: AppHandle, sync_service: Arc<SyncService>) {
    thread::spawn(move || loop {
        thread::sleep(SYNC_INTERVAL);
        // Only signal a cycle when there's actually something to do (signed in + vault
        // unlocked), so the indicator stays dark before sync is set up.
        if !sync_service.is_ready() {
            continue;
        }

        let _ = app.emit("sync-state", SyncStateEvent { state: "syncing", message: None });

        let done = match tauri::async_runtime::block_on(sync_service.sync()) {
            Ok(()) => SyncStateEvent { state: "idle", message: None },
            Err(err) => {
                eprintln!("[sync] cycle failed: {err}");
                SyncStateEvent { state: "error", message: Some(err.to_string()) }
            }
        };

        let _ = app.emit("sync-state", done);
    });
}
