//! Background jobs — the app's long-lived, off-main-thread loops, started once after the
//! services are managed and running for the app's lifetime. One entry point ([`start`])
//! spins up every loop: the write-path **sync** loop ([`sync`]) and the worktree
//! **attention** loop ([`attention`]).
//!
//! Lives in `platform` (not `services`) because these loops drive the Tauri runtime — they
//! emit window events, read window focus, and show OS notifications — which `services/`
//! must not touch.

use std::sync::Arc;

use tauri::AppHandle;

use crate::core::sync_channel::SyncSignalReceiver;
use crate::services::attention_service::AttentionService;
use crate::services::sync_service::SyncService;

mod attention;
mod sync;

/// Start every background loop. Fire-and-forget for the app's lifetime.
pub fn start(
    app: AppHandle,
    sync_service: Arc<SyncService>,
    sync_receiver: SyncSignalReceiver,
    attention_service: Arc<AttentionService>,
) {
    sync::start(app.clone(), sync_service, sync_receiver);
    attention::start(app, attention_service);
}
