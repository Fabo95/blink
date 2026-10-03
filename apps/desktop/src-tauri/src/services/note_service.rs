//! Note business logic. [`NoteService`] fronts the [`NoteRepository`] and the
//! [`NoteRevisionRepository`]: every text edit first keeps the previous text as a revision,
//! and every mutation is stamped through [`HlcService`] so it syncs.

use std::sync::Arc;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{NewNote, Note, NoteRevision, RevisionReason};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{NoteRepository, NoteRevisionRepository};
use crate::services::hlc_service::HlcService;

pub use crate::repository::NotePatch;

pub struct NoteService {
    note_repository: NoteRepository,
    note_revision_repository: NoteRevisionRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl NoteService {
    pub fn new(
        note_repository: NoteRepository,
        note_revision_repository: NoteRevisionRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            note_repository,
            note_revision_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<Note>> {
        self.note_repository.list()
    }

    pub fn search(&self, query: &str) -> AppResult<Vec<Note>> {
        self.note_repository.search(query)
    }

    pub fn save(&self, new: NewNote) -> AppResult<Note> {
        let note = self.note_repository.insert(new)?;
        self.stamp_note(&note.id)?;
        self.sync_signal.send();
        Ok(note)
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
        let note = self.note_repository.update(id, patch)?;
        self.stamp_note(id)?;
        self.sync_signal.send();
        Ok(note)
    }

    /// Tombstone a note and its revisions.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.note_repository.delete(id)?;
        let revision_ids = self.note_revision_repository.delete_for_note(id)?;
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

    fn stamp_note(&self, id: &str) -> AppResult<()> {
        let hlc = self.hlc_service.next()?;
        self.note_repository
            .record_change(id, hlc.physical, hlc.counter, &hlc.node_id)
    }
}
