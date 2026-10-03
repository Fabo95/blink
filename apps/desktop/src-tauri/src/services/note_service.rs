//! Note business logic. [`NoteService`] fronts the [`NotesRepository`] and the
//! [`NoteRevisionsRepository`]: every text edit first keeps the previous text as a revision,
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
    JobsRepository, NoteLinksRepository, NotesRepository, NoteReviewsRepository, NoteRevisionsRepository,
};
use crate::services::hlc_service::HlcService;
use crate::services::review_service::{first_revisit, with_reviews};

/// The job kind for a source's background page fetch + summary.
pub const ENRICH_JOB: &str = "enrich";

pub use crate::repository::NotePatch;

pub struct NoteService {
    notes_repository: NotesRepository,
    note_revisions_repository: NoteRevisionsRepository,
    note_reviews_repository: NoteReviewsRepository,
    note_links_repository: NoteLinksRepository,
    // Saving a source with a link queues its background enrichment.
    jobs_repository: JobsRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl NoteService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        notes_repository: NotesRepository,
        note_revisions_repository: NoteRevisionsRepository,
        note_reviews_repository: NoteReviewsRepository,
        note_links_repository: NoteLinksRepository,
        jobs_repository: JobsRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            notes_repository,
            note_revisions_repository,
            note_reviews_repository,
            note_links_repository,
            jobs_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<Note>> {
        self.decorate(self.notes_repository.list()?)
    }

    pub fn search(&self, query: &str) -> AppResult<Vec<Note>> {
        self.decorate(self.notes_repository.search(query)?)
    }

    /// Save a captured note and schedule its first review (ideas and thoughts only).
    pub fn save(&self, new: NewNote) -> AppResult<Note> {
        let revisit_at = first_revisit(new.note_type, Utc::now()).map(|at| at.to_rfc3339());
        let note = self.notes_repository.insert(new, revisit_at)?;
        self.queue_enrichment_if_needed(&note)?;
        self.hlc_service.stamp(&self.notes_repository, [&note.id])?;
        self.sync_signal.send();
        self.notes_repository.get(&note.id)
    }

    /// Apply a patch. A text change keeps the previous text as an `edit` revision first, so
    /// nothing the user wrote is ever lost to an edit.
    pub fn update(&self, id: &str, patch: NotePatch) -> AppResult<Note> {
        if let Some(text) = patch.text.as_deref() {
            let current = self.notes_repository.get(id)?;
            if current.text != text {
                self.keep_revision(id, &current.text, RevisionReason::Edit)?;
            }
        }
        let type_changed = patch.note_type.is_some();
        let link_changed = patch.link.is_some();
        let mut note = self.notes_repository.update(id, patch)?;
        // A source turned into an idea or thought starts its review cycle now.
        if type_changed && note.revisit_at.is_none() && note.status == NoteStatus::Open {
            if let Some(at) = first_revisit(note.note_type, Utc::now()) {
                note = self.notes_repository.set_review_state(
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
        self.hlc_service.stamp(&self.notes_repository, [id])?;
        self.sync_signal.send();
        let note = self.notes_repository.get(id)?;
        Ok(self.decorate(vec![note])?.remove(0))
    }

    /// Fetch and summarize a source again (after a failure, or to refresh it).
    pub fn request_enrichment(&self, id: &str) -> AppResult<Note> {
        let note = self.notes_repository.get(id)?;
        if !self.queue_enrichment_if_needed(&note)? {
            return Err(AppError::Store(
                "only a source with a link can be fetched".to_string(),
            ));
        }
        self.hlc_service.stamp(&self.notes_repository, [id])?;
        self.sync_signal.send();
        let note = self.notes_repository.get(id)?;
        Ok(self.decorate(vec![note])?.remove(0))
    }

    /// Queue the background fetch for a source with a link and mark it pending. The job
    /// itself re-checks the topic's sensitivity when it runs. Returns whether it queued.
    fn queue_enrichment_if_needed(&self, note: &Note) -> AppResult<bool> {
        if note.note_type != NoteType::Source || note.link.is_none() {
            return Ok(false);
        }
        self.jobs_repository
            .enqueue(ENRICH_JOB, &note.id, &Utc::now().to_rfc3339())?;
        self.notes_repository
            .set_enrichment(&note.id, Enrichment::Pending, None, None, None)?;
        Ok(true)
    }

    /// Tombstone a note with its revisions, reviews, and links.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.notes_repository.delete(id)?;
        self.hlc_service.stamp(&self.notes_repository, [id])?;
        delete_note_children(
            id,
            &self.note_revisions_repository,
            &self.note_reviews_repository,
            &self.note_links_repository,
            &self.hlc_service,
        )?;
        self.sync_signal.send();
        Ok(())
    }

    /// A note's revisions, newest first. Opening the history counts as seeing a conflict,
    /// so it clears the note's device-local conflict marker.
    pub fn history(&self, id: &str) -> AppResult<Vec<NoteRevision>> {
        self.notes_repository.clear_conflict(id)?;
        self.note_revisions_repository.list_for_note(id)
    }

    /// Put a revision's text back. Goes through [`update`](Self::update), so the text being
    /// replaced becomes a revision itself and restoring is never destructive.
    pub fn restore_revision(&self, note_id: &str, revision_id: &str) -> AppResult<Note> {
        let revisions = self.note_revisions_repository.list_for_note(note_id)?;
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
            .note_revisions_repository
            .insert(note_id, text, reason)?;
        self.hlc_service
            .stamp(&self.note_revisions_repository, [revision_id])
    }

    fn decorate(&self, notes: Vec<Note>) -> AppResult<Vec<Note>> {
        Ok(decorate(
            notes,
            self.note_reviews_repository.convictions_by_note()?,
            &self.note_links_repository.evidence_by_note()?,
        ))
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

/// Tombstone everything that hangs off a note (revisions, reviews, links) and stamp it for
/// sync. The one place that knows a note's child tables, shared by deleting a note and by
/// deleting a topic together with its notes, so a new child table is added here once.
pub fn delete_note_children(
    note_id: &str,
    note_revisions_repository: &NoteRevisionsRepository,
    note_reviews_repository: &NoteReviewsRepository,
    note_links_repository: &NoteLinksRepository,
    hlc_service: &HlcService,
) -> AppResult<()> {
    let revision_ids = note_revisions_repository.delete_for_note(note_id)?;
    hlc_service.stamp(note_revisions_repository, &revision_ids)?;
    let review_ids = note_reviews_repository.delete_for_note(note_id)?;
    hlc_service.stamp(note_reviews_repository, &review_ids)?;
    let link_ids = note_links_repository.delete_for_note(note_id)?;
    hlc_service.stamp(note_links_repository, &link_ids)?;
    Ok(())
}
