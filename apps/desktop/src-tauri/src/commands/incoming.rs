//! IPC surface for the Incoming feed and its sources — thin wrappers over
//! [`IncomingService`]. Turning an item into a task composes it with [`TaskService`].

use std::sync::Arc;

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{IncomingFeed, IncomingSource, SourceConnection, Task};
use crate::services::incoming_service::IncomingService;
use crate::services::task_service::TaskService;

/// The feed as of the last poll (the `incoming` event keeps it live afterwards).
#[tauri::command]
pub fn get_incoming(incoming_service: State<'_, Arc<IncomingService>>) -> AppResult<IncomingFeed> {
    incoming_service.current()
}

/// Poll every source now. Async: it reaches the network.
#[tauri::command]
pub async fn refresh_incoming(
    incoming_service: State<'_, Arc<IncomingService>>,
) -> AppResult<IncomingFeed> {
    incoming_service.refresh().await
}

/// Hide an item in Blink until it changes at the source.
#[tauri::command]
pub fn archive_incoming(
    incoming_service: State<'_, Arc<IncomingService>>,
    id: String,
) -> AppResult<IncomingFeed> {
    incoming_service.archive(&id)
}

/// Turn an item into an inbox task (title + link back) and archive it.
#[tauri::command]
pub fn incoming_to_task(
    incoming_service: State<'_, Arc<IncomingService>>,
    task_service: State<'_, TaskService>,
    id: String,
) -> AppResult<Task> {
    let task = task_service.save(incoming_service.task_for(&id)?)?;
    incoming_service.archive(&id)?;
    Ok(task)
}

// ── sources ─────────────────────────────────────────────────────────────────────────────

/// Every source's live connection — who it's signed in as, how, and any problem. Async: each
/// source is asked over the network / its CLI.
#[tauri::command]
pub async fn list_source_connections(
    incoming_service: State<'_, Arc<IncomingService>>,
) -> AppResult<Vec<SourceConnection>> {
    Ok(incoming_service.connections().await)
}

/// Connect a source with a pasted key (or replace its key); checked before it's kept.
#[tauri::command]
pub async fn connect_source(
    incoming_service: State<'_, Arc<IncomingService>>,
    source: IncomingSource,
    key: String,
) -> AppResult<()> {
    incoming_service.connect_with_key(source, key).await
}

/// Forget the key Blink keeps for a source. Its items leave Incoming on the next poll.
#[tauri::command]
pub fn disconnect_source(
    incoming_service: State<'_, Arc<IncomingService>>,
    source: IncomingSource,
) -> AppResult<()> {
    incoming_service.disconnect(source)
}
