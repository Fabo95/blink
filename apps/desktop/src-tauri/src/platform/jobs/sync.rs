//! The write-path sync loop. Started once from [`super::start`]; runs for the app's
//! lifetime.
//!
//! Two triggers, combined via `recv_timeout`:
//!   - a local change (or setup/unlock) wakes the loop → **debounced full sync**;
//!   - otherwise the timeout fires → a background **pull** with adaptive backoff
//!     (tighten after activity, widen when idle), so we don't poll a quiet server.

use std::sync::mpsc::RecvTimeoutError;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::core::sync_channel::SyncSignalReceiver;
use crate::services::sync_service::SyncService;

/// Coalesce a burst of edits before pushing.
const DEBOUNCE: Duration = Duration::from_millis(1200);
/// Pull cadence after recent activity, and the floor for backoff.
const MIN_PULL: Duration = Duration::from_secs(15);
/// Pull cadence when nothing's changing — the backoff ceiling.
const MAX_PULL: Duration = Duration::from_secs(120);

/// The webview event carrying sync activity for the UI indicator. `state` is
/// `syncing` | `idle` | `error`; `message` is set only on error (for a tooltip).
#[derive(Clone, Serialize)]
struct SyncStateEvent {
    state: &'static str,
    message: Option<String>,
}

/// Start the sync loop. Fire-and-forget for the app's lifetime.
pub(super) fn start(app: AppHandle, sync_service: Arc<SyncService>, signalReceiver: SyncSignalReceiver) {
    thread::spawn(move || {
        // An initial cycle so a fresh launch pulls (and pushes anything already dirty).
        run_sync(&app, &sync_service);

        let mut pull_in = MIN_PULL;
        loop {
            match signalReceiver.recv_timeout(pull_in) {
                // A local change (or setup/unlock) — coalesce the burst, then full-sync.
                Ok(()) => {
                    thread::sleep(DEBOUNCE);
                    while signalReceiver.try_recv().is_ok() {}
                    run_sync(&app, &sync_service);
                    pull_in = MIN_PULL;
                }
                // Quiet window elapsed — background pull, then adapt the cadence.
                Err(RecvTimeoutError::Timeout) => match run_pull(&app, &sync_service) {
                    Some(n) if n > 0 => pull_in = MIN_PULL,
                    Some(_) => pull_in = (pull_in * 2).min(MAX_PULL),
                    None => {}
                },
                // Every sender dropped (app shutting down).
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

/// Pull + push, with the UI activity events around it. No-op (and silent) until ready.
fn run_sync(app: &AppHandle, sync_service: &Arc<SyncService>) {
    if !sync_service.is_ready() {
        return;
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
}

/// Pull only (for the background cadence). Returns the number of records merged, or
/// `None` when not ready or the pull failed — the caller uses it to adapt the backoff.
fn run_pull(app: &AppHandle, sync_service: &Arc<SyncService>) -> Option<usize> {
    if !sync_service.is_ready() {
        return None;
    }
    let _ = app.emit("sync-state", SyncStateEvent { state: "syncing", message: None });
    match tauri::async_runtime::block_on(sync_service.pull()) {
        Ok(n) => {
            let _ = app.emit("sync-state", SyncStateEvent { state: "idle", message: None });
            Some(n)
        }
        Err(err) => {
            eprintln!("[sync] pull failed: {err}");
            let _ = app.emit(
                "sync-state",
                SyncStateEvent { state: "error", message: Some(err.to_string()) },
            );
            None
        }
    }
}
