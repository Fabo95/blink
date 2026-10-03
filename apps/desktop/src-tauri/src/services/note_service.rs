//! Note business logic. [`NoteService`] fronts the [`NoteRepository`] and the
//! [`NoteRevisionRepository`]: every text edit first keeps the previous text as a revision,
//! and every mutation is stamped through [`HlcService`] so it syncs.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{
    Enrichment, Evidence, NewNote, Note, NoteRevision, NoteStatus, NoteType, RevisionReason,
};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{
    JobRepository, NoteLinkRepository, NoteRepository, NoteReviewRepository, NoteRevisionRepository,
};
use crate::services::hlc_service::HlcService;
use crate::services::review_service::{first_revisit, with_reviews};

/// The job kind for a source's background page fetch + summary.
pub const ENRICH_JOB: &str = "enrich";

pub use crate::repository::NotePatch;

pub struct NoteService {
    note_repository: NoteRepository,
    note_revision_repository: NoteRevisionRepository,
    note_review_repository: NoteReviewRepository,
    note_link_repository: NoteLinkRepository,
    // Saving a source with a link queues its background enrichment.
    job_repository: JobRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl NoteService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        note_repository: NoteRepository,
        note_revision_repository: NoteRevisionRepository,
        note_review_repository: NoteReviewRepository,
        note_link_repository: NoteLinkRepository,
        job_repository: JobRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            note_repository,
            note_revision_repository,
            note_review_repository,
            note_link_repository,
            job_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<Note>> {
        self.decorate(self.note_repository.list()?)
    }

    pub fn search(&self, query: &str) -> AppResult<Vec<Note>> {
        self.decorate(self.note_repository.search(query)?)
    }

    /// Save a captured note and schedule its first review (ideas and thoughts only).
    pub fn save(&self, new: NewNote) -> AppResult<Note> {
        let revisit_at = first_revisit(new.note_type, Utc::now()).map(|at| at.to_rfc3339());
        let note = self.note_repository.insert(new, revisit_at)?;
        self.queue_enrichment_if_needed(&note)?;
        self.stamp_note(&note.id)?;
        self.sync_signal.send();
        self.note_repository.get(&note.id)
    }

    /// Apply a patch. A text change keeps the previous text as an `edit` revision first, so
    /// nothing the user wrote is ever lost to an edit.
    pub fn update(&self, id: &str, patch: NotePatch) -> AppResult<Note> {
        if let Some(text) = patch.text.as_deref() {
            let current = self.note_repository.get(id)?;
            if current.text != text {
                self.keep_revision(id, &current.text, RevisionReason::Edit)?;
            }
        }
        let type_changed = patch.note_type.is_some();
        let link_changed = patch.link.is_some();
        let mut note = self.note_repository.update(id, patch)?;
        // A source turned into an idea or thought starts its review cycle now.
        if type_changed && note.revisit_at.is_none() && note.status == NoteStatus::Open {
            if let Some(at) = first_revisit(note.note_type, Utc::now()) {
                note = self.note_repository.set_review_state(
                    id,
                    NoteStatus::Open,
                    Some(&at.to_rfc3339()),
                )?;
            }
        }
        // A new link (or a note that just became a source) needs a fresh fetch.
        if type_changed || link_changed {
            self.queue_enrichment_if_needed(&note)?;
        }
        self.stamp_note(id)?;
        self.sync_signal.send();
        let note = self.note_repository.get(id)?;
        Ok(self.decorate(vec![note])?.remove(0))
    }

    /// Fetch and summarize a source again (after a failure, or to refresh it).
    pub fn request_enrichment(&self, id: &str) -> AppResult<Note> {
        let note = self.note_repository.get(id)?;
        if !self.queue_enrichment_if_needed(&note)? {
            return Err(AppError::Store(
                "only a source with a link can be fetched".to_string(),
            ));
        }
        self.stamp_note(id)?;
        self.sync_signal.send();
        let note = self.note_repository.get(id)?;
        Ok(self.decorate(vec![note])?.remove(0))
    }

    /// Queue the background fetch for a source with a link and mark it pending. The job
    /// itself re-checks the topic's sensitivity when it runs. Returns whether it queued.
    fn queue_enrichment_if_needed(&self, note: &Note) -> AppResult<bool> {
        if note.note_type != NoteType::Source || note.link.is_none() {
            return Ok(false);
        }
        self.job_repository
            .enqueue(ENRICH_JOB, &note.id, &Utc::now().to_rfc3339())?;
        self.note_repository
            .set_enrichment(&note.id, Enrichment::Pending, None, None, None)?;
        Ok(true)
    }

    /// Tombstone a note with its revisions, reviews, and links.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.note_repository.delete(id)?;
        let revision_ids = self.note_revision_repository.delete_for_note(id)?;
        let review_ids = self.note_review_repository.delete_for_note(id)?;
        let link_ids = self.note_link_repository.delete_for_note(id)?;
        let hlc = self.hlc_service.next()?;
        self.note_repository
            .record_change(id, hlc.physical, hlc.counter, &hlc.node_id)?;
        for revision_id in &revision_ids {
            self.note_revision_repository.record_change(
                revision_id,
                hlc.physical,
                hlc.counter,
                &hlc.node_id,
            )?;
        }
        for review_id in &review_ids {
            self.note_review_repository.record_change(
                review_id,
                hlc.physical,
                hlc.counter,
                &hlc.node_id,
            )?;
        }
        for link_id in &link_ids {
            self.note_link_repository.record_change(
                link_id,
                hlc.physical,
                hlc.counter,
                &hlc.node_id,
            )?;
        }
        self.sync_signal.send();
        Ok(())
    }

    /// A note's revisions, newest first. Opening the history counts as seeing a conflict,
    /// so it clears the note's device-local conflict marker.
    pub fn history(&self, id: &str) -> AppResult<Vec<NoteRevision>> {
        self.note_repository.clear_conflict(id)?;
        self.note_revision_repository.list_for_note(id)
    }

    /// Put a revision's text back. Goes through [`update`](Self::update), so the text being
    /// replaced becomes a revision itself and restoring is never destructive.
    pub fn restore_revision(&self, note_id: &str, revision_id: &str) -> AppResult<Note> {
        let revisions = self.note_revision_repository.list_for_note(note_id)?;
        let Some(revision) = revisions.into_iter().find(|r| r.id == revision_id) else {
            return Err(AppError::Store(format!("revision {revision_id} not found")));
        };
        self.update(
            note_id,
            NotePatch {
                text: Some(revision.text),
                ..NotePatch::default()
            },
        )
    }

    fn keep_revision(&self, note_id: &str, text: &str, reason: RevisionReason) -> AppResult<()> {
        let revision_id = self
            .note_revision_repository
            .insert(note_id, text, reason)?;
        let hlc = self.hlc_service.next()?;
        self.note_revision_repository.record_change(
            &revision_id,
            hlc.physical,
            hlc.counter,
            &hlc.node_id,
        )
    }

    fn decorate(&self, notes: Vec<Note>) -> AppResult<Vec<Note>> {
        Ok(decorate(
            notes,
            self.note_review_repository.convictions_by_note()?,
            &self.note_link_repository.evidence_by_note()?,
        ))
    }

    fn stamp_note(&self, id: &str) -> AppResult<()> {
        let hlc = self.hlc_service.next()?;
        self.note_repository
            .record_change(id, hlc.physical, hlc.counter, &hlc.node_id)
    }
}

/// Attach what's derived from other tables (conviction history, review nudge, evidence)
/// to notes. Shared by every service that hands notes to the UI or an export, so a note
/// reads the same everywhere.
pub fn decorate(
    notes: Vec<Note>,
    mut convictions: HashMap<String, Vec<i64>>,
    evidence: &HashMap<String, Evidence>,
) -> Vec<Note> {
    notes
        .into_iter()
        .map(|note| {
            let history = convictions.remove(&note.id).unwrap_or_default();
            let mut note = with_reviews(note, history);
            note.evidence = evidence.get(&note.id).copied().unwrap_or_default();
            note
        })
        .collect()
}
