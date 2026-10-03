//! The source-enrichment loop: works the device-local job queue (page fetch + summary) on a
//! short interval for the app's lifetime. Fetching is network-bound and best-effort, so it
//! runs on its own thread and never blocks a capture or the sync loop.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::services::enrichment_service::EnrichmentService;

/// How often the queue is checked. A new source waits at most this long for its preview.
const INTERVAL: Duration = Duration::from_secs(10);

/// Re-uses the capture panel's event: the Ideas page already re-reads its notes on it.
const NOTE_SAVED: &str = "note-saved";

pub(super) fn start(app: AppHandle, enrichment_service: Arc<EnrichmentService>) {
    thread::spawn(move || loop {
        match tauri::async_runtime::block_on(enrichment_service.run_due()) {
            Ok(changed) if changed > 0 => {
                let _ = app.emit(NOTE_SAVED, ());
            }
            Ok(_) => {}
            Err(err) => eprintln!("[enrich] run failed: {err}"),
        }
        thread::sleep(INTERVAL);
    });
}
