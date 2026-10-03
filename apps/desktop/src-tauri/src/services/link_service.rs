//! Note-link business logic. [`LinkService`] fronts the [`NoteLinksRepository`]: it refuses
//! self-links and duplicates, and stamps every change for sync.

use std::sync::Arc;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{NoteLink, NoteRelation};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{NoteLinksRepository, NotesRepository};
use crate::services::hlc_service::HlcService;

pub struct LinkService {
    note_links_repository: NoteLinksRepository,
    // Only to check both ends exist before linking them.
    notes_repository: NotesRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl LinkService {
    pub fn new(
        note_links_repository: NoteLinksRepository,
        notes_repository: NotesRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            note_links_repository,
            notes_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn links(&self, note_id: &str) -> AppResult<Vec<NoteLink>> {
        self.note_links_repository.list_for_note(note_id)
    }

    /// Link `from` to `to`: `from` supports, contradicts, or relates to `to`. Two notes are
    /// linked at most once (in either direction), so evidence never double counts.
    pub fn link(&self, from: &str, to: &str, relation: NoteRelation) -> AppResult<NoteLink> {
        if from == to {
            return Err(AppError::Store(
                "a note can't be linked to itself".to_string(),
            ));
        }
        self.notes_repository.get(from)?;
        self.notes_repository.get(to)?;
        if self.note_links_repository.exists_between(from, to)? {
            return Err(AppError::Store(
                "these notes are already linked".to_string(),
            ));
        }
        let link = self.note_links_repository.insert(from, to, relation)?;
        self.stamp(&link.id)?;
        Ok(link)
    }

    pub fn unlink(&self, id: &str) -> AppResult<()> {
        self.note_links_repository.delete(id)?;
        self.stamp(id)
    }

    fn stamp(&self, id: &str) -> AppResult<()> {
        self.hlc_service.stamp(&self.note_links_repository, [id])?;
        self.sync_signal.send();
        Ok(())
    }
}
