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
use crate::core::synced_repository::SyncedRepository;
use crate::repository::{
    JobsRepository, NoteLinksRepository, NotesRepository, NoteReviewsRepository, NoteRevisionsRepository,
    SyncStateRepository, TaskGroupsRepository, TasksRepository, TopicsRepository,
};
use crate::services::hlc_service::HlcService;
use crate::services::note_service::ENRICH_JOB;
use crate::services::session_token_service::SessionTokenService;

const LAST_PULLED_SEQ_KEY: &str = "last_pulled_seq";

pub struct SyncService {
    server_client: ServerClient,
    session_token_service: SessionTokenService,
    tasks_repository: TasksRepository,
    task_groups_repository: TaskGroupsRepository,
    topics_repository: TopicsRepository,
    notes_repository: NotesRepository,
    note_revisions_repository: NoteRevisionsRepository,
    note_reviews_repository: NoteReviewsRepository,
    note_links_repository: NoteLinksRepository,
    sync_state_repository: SyncStateRepository,
    // A pulled source still waiting for its preview (captured remotely, or on a device that
    // hasn't fetched it) is queued here, so every device can finish it.
    jobs_repository: JobsRepository,
    // Stamps the conflict revisions a pull creates, so they push like any local write.
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl SyncService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        server_client: ServerClient,
        session_token_service: SessionTokenService,
        tasks_repository: TasksRepository,
        task_groups_repository: TaskGroupsRepository,
        topics_repository: TopicsRepository,
        notes_repository: NotesRepository,
        note_revisions_repository: NoteRevisionsRepository,
        note_reviews_repository: NoteReviewsRepository,
        note_links_repository: NoteLinksRepository,
        sync_state_repository: SyncStateRepository,
        jobs_repository: JobsRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            server_client,
            session_token_service,
            tasks_repository,
            task_groups_repository,
            topics_repository,
            notes_repository,
            note_revisions_repository,
            note_reviews_repository,
            note_links_repository,
            sync_state_repository,
            jobs_repository,
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
        let tables = self.synced_tables();
        let changes = tables
            .iter()
            .map(|table| table.list_dirty())
            .collect::<AppResult<Vec<_>>>()?;
        let packets: Vec<SyncPacket> = changes
            .iter()
            .flatten()
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
        for (table, pushed) in tables.iter().zip(&changes) {
            table.clear_dirty(pushed)?;
        }
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
                    self.tasks_repository.merge(&record.id, &record.clock, task)?;
                }
                RecordBody::Group(group) => {
                    self.task_groups_repository.merge(&record.id, &record.clock, group)?;
                }
                RecordBody::Topic(topic) => {
                    self.topics_repository.merge(&record.id, &record.clock, topic)?;
                }
                RecordBody::Note(note) => {
                    if let Some(lost_text) =
                        self.notes_repository.merge(&record.id, &record.clock, note)?
                    {
                        self.keep_conflict(&record.id, &lost_text)?;
                    }
                    if note.note_type == "source"
                        && note.link.is_some()
                        && note.enrichment == "pending"
                        && !note.deleted
                    {
                        self.jobs_repository.enqueue(
                            ENRICH_JOB,
                            &record.id,
                            &chrono::Utc::now().to_rfc3339(),
                        )?;
                    }
                }
                RecordBody::NoteLink(link) => {
                    self.note_links_repository.merge(&record.id, &record.clock, link)?;
                }
                RecordBody::NoteReview(review) => {
                    self.note_reviews_repository.merge(&record.id, &record.clock, review)?;
                }
                RecordBody::NoteRevision(revision) => {
                    self.note_revisions_repository.merge(&record.id, &record.clock, revision)?;
                }
            }
            max_seq = max_seq.max(record.seq);
        }

        if max_seq > since {
            self.sync_state_repository.set(LAST_PULLED_SEQ_KEY, &max_seq.to_string())?;
        }
        Ok(records.len())
    }

    /// Every synced table, in push order. Topics before notes before what hangs off notes:
    /// pull applies records in `seq` order, so a receiving device sees a topic before the
    /// notes filed under it. A new synced table is one more entry here (plus its merge arm).
    fn synced_tables(&self) -> [&dyn SyncedRepository; 7] {
        [
            &self.tasks_repository,
            &self.task_groups_repository,
            &self.topics_repository,
            &self.notes_repository,
            &self.note_revisions_repository,
            &self.note_reviews_repository,
            &self.note_links_repository,
        ]
    }

    /// A pulled note overwrote an unsynced local edit: keep the lost text as a `conflict`
    /// revision. It's a new local row, stamped dirty, so this cycle's push syncs it and the
    /// other device sees the conflict too.
    fn keep_conflict(&self, note_id: &str, lost_text: &str) -> AppResult<()> {
        let revision_id =
            self.note_revisions_repository.insert(note_id, lost_text, RevisionReason::Conflict)?;
        self.hlc_service.stamp(&self.note_revisions_repository, [revision_id])
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
