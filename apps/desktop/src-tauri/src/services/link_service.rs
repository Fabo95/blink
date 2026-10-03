//! Note-link business logic. [`LinkService`] fronts the [`NoteLinkRepository`]: it refuses
//! self-links and duplicates, and stamps every change for sync.

use std::sync::Arc;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{NoteLink, NoteRelation};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{NoteLinkRepository, NoteRepository};
use crate::services::hlc_service::HlcService;

pub struct LinkService {
    note_link_repository: NoteLinkRepository,
    // Only to check both ends exist before linking them.
    note_repository: NoteRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl LinkService {
    pub fn new(
        note_link_repository: NoteLinkRepository,
        note_repository: NoteRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            note_link_repository,
            note_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn links(&self, note_id: &str) -> AppResult<Vec<NoteLink>> {
        self.note_link_repository.list_for_note(note_id)
    }

    /// Link `from` to `to`: `from` supports, contradicts, or relates to `to`. Two notes are
    /// linked at most once (in either direction), so evidence never double counts.
    pub fn link(&self, from: &str, to: &str, relation: NoteRelation) -> AppResult<NoteLink> {
        if from == to {
            return Err(AppError::Store(
                "a note can't be linked to itself".to_string(),
            ));
        }
        self.note_repository.get(from)?;
        self.note_repository.get(to)?;
        if self.note_link_repository.exists_between(from, to)? {
            return Err(AppError::Store(
                "these notes are already linked".to_string(),
            ));
        }
        let link = self.note_link_repository.insert(from, to, relation)?;
        self.stamp(&link.id)?;
        Ok(link)
    }

    pub fn unlink(&self, id: &str) -> AppResult<()> {
        self.note_link_repository.delete(id)?;
        self.stamp(id)
    }

    fn stamp(&self, id: &str) -> AppResult<()> {
        let hlc = self.hlc_service.next()?;
        self.note_link_repository
            .record_change(id, hlc.physical, hlc.counter, &hlc.node_id)?;
        self.sync_signal.send();
        Ok(())
    }
}
