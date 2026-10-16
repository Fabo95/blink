//! Note business logic. [`NoteService`] fronts the [`NotesRepository`] and the
//! [`NoteRevisionsRepository`]: every text edit first keeps the previous text as a revision,
//! and every mutation is stamped through [`HlcService`] so it syncs.

use std::sync::Arc;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{NewNote, Note, NoteRevision, RevisionReason};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{NoteRevisionsRepository, NotesRepository};
use crate::services::hlc_service::HlcService;

pub use crate::repository::NotePatch;

pub struct NoteService {
    notes_repository: NotesRepository,
    note_revisions_repository: NoteRevisionsRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl NoteService {
    pub fn new(
        notes_repository: NotesRepository,
        note_revisions_repository: NoteRevisionsRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            notes_repository,
            note_revisions_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<Note>> {
        self.notes_repository.list()
    }

    pub fn search(&self, query: &str) -> AppResult<Vec<Note>> {
        self.notes_repository.search(query)
    }

    pub fn save(&self, new: NewNote) -> AppResult<Note> {
        let note = self.notes_repository.insert(new)?;
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
        self.notes_repository.update(id, patch)?;
        self.hlc_service.stamp(&self.notes_repository, [id])?;
        self.sync_signal.send();
        self.notes_repository.get(id)
    }

    /// Tombstone a note with its revisions.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.notes_repository.delete(id)?;
        self.hlc_service.stamp(&self.notes_repository, [id])?;
        delete_note_children(id, &self.note_revisions_repository, &self.hlc_service)?;
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
}

/// Tombstone everything that hangs off a note (its revisions) and stamp it for sync. The
/// one place that knows a note's child tables, shared by deleting a note and by deleting a
/// topic together with its notes, so a new child table is added here once.
pub fn delete_note_children(
    note_id: &str,
    note_revisions_repository: &NoteRevisionsRepository,
    hlc_service: &HlcService,
) -> AppResult<()> {
    let revision_ids = note_revisions_repository.delete_for_note(note_id)?;
    hlc_service.stamp(note_revisions_repository, &revision_ids)?;
    Ok(())
}
