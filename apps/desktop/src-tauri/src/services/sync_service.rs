//! Bidirectional sync orchestration. Push uploads locally-changed rows; pull
//! downloads remote changes and merges them last-write-wins. It ties together the
//! server client (transport), the entity repos (dirty rows + merge), and `sync_state`
//! (the pull cursor).
//!
//! The server keeps a readable replica of these rows rather than opaque ciphertext —
//! the payload it stores is the local row itself, as JSON.

use std::sync::Arc;

use serde::Deserialize;

use crate::clients::server_client::ServerClient;
use crate::core::error::{AppError, AppResult};
use crate::core::models::RevisionReason;
use crate::core::sync_channel::SyncSignalSender;
use crate::core::wire::{RecordBody, SyncPacket, SyncRecord};
use crate::repository::{
    NoteRepository, NoteRevisionRepository, SyncStateRepository, TaskGroupRepository,
    TaskRepository, TopicRepository,
};
use crate::services::hlc_service::HlcService;
use crate::services::session_token_service::SessionTokenService;

const LAST_PULLED_SEQ_KEY: &str = "last_pulled_seq";

pub struct SyncService {
    server_client: ServerClient,
    session_token_service: SessionTokenService,
    task_repository: TaskRepository,
    task_group_repository: TaskGroupRepository,
    topic_repository: TopicRepository,
    note_repository: NoteRepository,
    note_revision_repository: NoteRevisionRepository,
    sync_state_repository: SyncStateRepository,
    // Stamps the conflict revisions a pull creates, so they push like any local write.
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl SyncService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        server_client: ServerClient,
        session_token_service: SessionTokenService,
        task_repository: TaskRepository,
        task_group_repository: TaskGroupRepository,
        topic_repository: TopicRepository,
        note_repository: NoteRepository,
        note_revision_repository: NoteRevisionRepository,
        sync_state_repository: SyncStateRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            server_client,
            session_token_service,
            task_repository,
            task_group_repository,
            topic_repository,
            note_repository,
            note_revision_repository,
            sync_state_repository,
            hlc_service,
            sync_signal,
        }
    }

    /// Ask the background loop to run a cycle now. Deliberately goes through the loop
    /// rather than calling [`sync`](Self::sync) directly: the loop owns the `sync-state`
    /// events the UI indicator reads, coalesces bursts through its debounce, and resets
    /// its pull backoff to the floor — none of which a direct call would do.
    pub fn request_sync(&self) {
        self.sync_signal.send();
    }

    /// Whether a sync cycle would actually do anything: signed in. The background loop
    /// checks this before signalling activity, so the UI indicator doesn't flicker
    /// every cycle before the user has signed in.
    pub fn is_ready(&self) -> bool {
        self.session_token_service.read().ok().flatten().is_some()
    }

    /// One sync cycle: pull remote changes first (so a fresh device fills in), then
    /// push local ones. A no-op when not [`is_ready`](Self::is_ready), so callers can
    /// invoke it freely before the user has signed in. Returns how many records the
    /// pull merged, so the caller can tell the webview to re-read the DB.
    pub async fn sync(&self) -> AppResult<usize> {
        if !self.is_ready() {
            return Ok(0);
        }
        let merged = self.pull().await?;
        self.push().await?;
        Ok(merged)
    }

    /// Upload every locally-changed row, then clear their dirty flags.
    pub async fn push(&self) -> AppResult<usize> {
        let token = self.token()?;
        let task_changes = self.task_repository.list_dirty()?;
        let group_changes = self.task_group_repository.list_dirty()?;
        // Topics before notes before revisions: pull applies records in `seq` order, so a
        // receiving device sees a topic before the notes filed under it.
        let topic_changes = self.topic_repository.list_dirty()?;
        let note_changes = self.note_repository.list_dirty()?;
        let revision_changes = self.note_revision_repository.list_dirty()?;
        let packets: Vec<SyncPacket> = task_changes
            .iter()
            .chain(group_changes.iter())
            .chain(topic_changes.iter())
            .chain(note_changes.iter())
            .chain(revision_changes.iter())
            .map(|change| SyncPacket {
                id: change.id.clone(),
                clock: change.clock.clone(),
                body: change.body.clone(),
            })
            .collect();
        if packets.is_empty() {
            return Ok(0);
        }

        let resp = self.server_client.push_records(&token, &packets).await.map_err(net_err)?;
        ensure_ok(&resp)?;

        // Clear the flags only after the server confirms the writes landed.
        self.task_repository.clear_dirty(&task_changes)?;
        self.task_group_repository.clear_dirty(&group_changes)?;
        self.topic_repository.clear_dirty(&topic_changes)?;
        self.note_repository.clear_dirty(&note_changes)?;
        self.note_revision_repository.clear_dirty(&revision_changes)?;
        Ok(packets.len())
    }

    /// Pull remote changes since the cursor and LWW-merge them, then advance the
    /// cursor. Records arrive in `seq` order, so a referenced group always precedes
    /// its tasks.
    pub async fn pull(&self) -> AppResult<usize> {
        let token = self.token()?;
        let since = self.last_pulled_seq()?;

        let resp = self.server_client.pull_records(&token, since).await.map_err(net_err)?;
        ensure_ok(&resp)?;
        let records =
            resp.json::<ApiResponse<PullData>>().await.map_err(net_err)?.data.records;

        let mut max_seq = since;
        for record in &records {
            match &record.body {
                RecordBody::Task(task) => {
                    self.task_repository.merge(&record.id, &record.clock, task)?;
                }
                RecordBody::Group(group) => {
                    self.task_group_repository.merge(&record.id, &record.clock, group)?;
                }
                RecordBody::Topic(topic) => {
                    self.topic_repository.merge(&record.id, &record.clock, topic)?;
                }
                RecordBody::Note(note) => {
                    if let Some(lost_text) =
                        self.note_repository.merge(&record.id, &record.clock, note)?
                    {
                        self.keep_conflict(&record.id, &lost_text)?;
                    }
                }
                RecordBody::NoteRevision(revision) => {
                    self.note_revision_repository.merge(&record.id, &record.clock, revision)?;
                }
            }
            max_seq = max_seq.max(record.seq);
        }

        if max_seq > since {
            self.sync_state_repository.set(LAST_PULLED_SEQ_KEY, &max_seq.to_string())?;
        }
        Ok(records.len())
    }

    /// A pulled note overwrote an unsynced local edit: keep the lost text as a `conflict`
    /// revision. It's a new local row, stamped dirty, so this cycle's push syncs it and the
    /// other device sees the conflict too.
    fn keep_conflict(&self, note_id: &str, lost_text: &str) -> AppResult<()> {
        let revision_id =
            self.note_revision_repository.insert(note_id, lost_text, RevisionReason::Conflict)?;
        let hlc = self.hlc_service.next()?;
        self.note_revision_repository.record_change(
            &revision_id,
            hlc.physical,
            hlc.counter,
            &hlc.node_id,
        )
    }

    fn token(&self) -> AppResult<String> {
        self.session_token_service.read()?.ok_or_else(|| AppError::Sync("not signed in".into()))
    }

    fn last_pulled_seq(&self) -> AppResult<i64> {
        Ok(self
            .sync_state_repository
            .get(LAST_PULLED_SEQ_KEY)?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0))
    }
}

/// The server wraps every success as `{ data, reqId }`; we only need `data`.
#[derive(Deserialize)]
struct ApiResponse<T> {
    data: T,
}

#[derive(Deserialize)]
struct PullData {
    records: Vec<SyncRecord>,
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError::Sync(format!("sync request failed: {e}"))
}

fn ensure_ok(resp: &reqwest::Response) -> AppResult<()> {
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Sync(format!("server returned {}", resp.status())))
    }
}
