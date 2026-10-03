//! Topic business logic. [`TopicService`] fronts the [`TopicRepository`], owns the Ideas
//! page's active topic filter (a `settings` entry the capture windows read), and decides
//! what deleting a topic does to its notes.

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::{NewTopic, Topic};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{
    NoteRepository, NoteReviewRepository, NoteRevisionRepository, SettingsRepository,
    TopicRepository,
};
use crate::services::hlc_service::HlcService;

pub use crate::repository::TopicPatch;

/// The settings key holding the Ideas page's active topic filter, so a note captured from
/// anywhere defaults to the topic the user is currently working in.
const ACTIVE_TOPIC_KEY: &str = "active_topic";

pub struct TopicService {
    topic_repository: TopicRepository,
    // Deleting a topic unfiles or deletes its notes (and their revisions); those rows change
    // and must be stamped for sync, so the topic service reaches both repositories.
    note_repository: NoteRepository,
    note_revision_repository: NoteRevisionRepository,
    note_review_repository: NoteReviewRepository,
    settings_repository: SettingsRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl TopicService {
    pub fn new(
        topic_repository: TopicRepository,
        note_repository: NoteRepository,
        note_revision_repository: NoteRevisionRepository,
        note_review_repository: NoteReviewRepository,
        settings_repository: SettingsRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            topic_repository,
            note_repository,
            note_revision_repository,
            note_review_repository,
            settings_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<Topic>> {
        self.topic_repository.list()
    }

    pub fn create(&self, new: NewTopic) -> AppResult<Topic> {
        let topic = self.topic_repository.create(new)?;
        self.mark_dirty(&topic.id)?;
        Ok(topic)
    }

    pub fn update(&self, id: &str, patch: TopicPatch) -> AppResult<Topic> {
        let topic = self.topic_repository.update(id, patch)?;
        self.mark_dirty(id)?;
        Ok(topic)
    }

    /// Delete a topic. `delete_notes` tombstones its notes with their revisions and
    /// reviews; otherwise the notes move back to unfiled. One clock stamp covers every
    /// touched row (they're distinct records, so a shared stamp is fine), like
    /// `TaskGroupService::delete`.
    pub fn delete(&self, id: &str, delete_notes: bool) -> AppResult<()> {
        self.topic_repository.delete(id)?;
        let (note_ids, revision_ids, review_ids) = if delete_notes {
            let note_ids = self.note_repository.delete_in_topic(id)?;
            let mut revision_ids = Vec::new();
            let mut review_ids = Vec::new();
            for note_id in &note_ids {
                revision_ids.extend(self.note_revision_repository.delete_for_note(note_id)?);
                review_ids.extend(self.note_review_repository.delete_for_note(note_id)?);
            }
            (note_ids, revision_ids, review_ids)
        } else {
            (self.note_repository.unfile_topic(id)?, Vec::new(), Vec::new())
        };

        let hlc = self.hlc_service.next()?;
        self.topic_repository
            .record_change(id, hlc.physical, hlc.counter, &hlc.node_id)?;
        for note_id in &note_ids {
            self.note_repository
                .record_change(note_id, hlc.physical, hlc.counter, &hlc.node_id)?;
        }
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

        if self.settings_repository.get(ACTIVE_TOPIC_KEY)?.as_deref() == Some(id) {
            self.settings_repository.remove(ACTIVE_TOPIC_KEY)?;
        }
        self.sync_signal.send();
        Ok(())
    }

    pub fn active_topic(&self) -> AppResult<Option<String>> {
        self.settings_repository.get(ACTIVE_TOPIC_KEY)
    }

    pub fn set_active_topic(&self, topic_id: Option<String>) -> AppResult<()> {
        match topic_id {
            Some(id) => self.settings_repository.set(ACTIVE_TOPIC_KEY, &id),
            None => self.settings_repository.remove(ACTIVE_TOPIC_KEY),
        }
    }

    fn mark_dirty(&self, id: &str) -> AppResult<()> {
        let hlc = self.hlc_service.next()?;
        self.topic_repository
            .record_change(id, hlc.physical, hlc.counter, &hlc.node_id)?;
        self.sync_signal.send();
        Ok(())
    }
}
