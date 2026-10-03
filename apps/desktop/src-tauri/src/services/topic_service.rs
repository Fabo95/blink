//! Topic business logic. [`TopicService`] fronts the [`TopicsRepository`], owns the Ideas
//! page's active topic filter (a `settings` entry the capture windows read), and decides
//! what deleting a topic does to its notes.

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::{NewTopic, Topic};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{
    NoteLinksRepository, NotesRepository, NoteReviewsRepository, NoteRevisionsRepository,
    SettingsRepository, TopicsRepository,
};
use crate::services::hlc_service::HlcService;
use crate::services::note_service::delete_note_children;

pub use crate::repository::TopicPatch;

/// The settings key holding the Ideas page's active topic filter, so a note captured from
/// anywhere defaults to the topic the user is currently working in.
const ACTIVE_TOPIC_KEY: &str = "active_topic";

pub struct TopicService {
    topics_repository: TopicsRepository,
    // Deleting a topic unfiles or deletes its notes (and their revisions); those rows change
    // and must be stamped for sync, so the topic service reaches both repositories.
    notes_repository: NotesRepository,
    note_revisions_repository: NoteRevisionsRepository,
    note_reviews_repository: NoteReviewsRepository,
    note_links_repository: NoteLinksRepository,
    settings_repository: SettingsRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl TopicService {
    pub fn new(
        topics_repository: TopicsRepository,
        notes_repository: NotesRepository,
        note_revisions_repository: NoteRevisionsRepository,
        note_reviews_repository: NoteReviewsRepository,
        note_links_repository: NoteLinksRepository,
        settings_repository: SettingsRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            topics_repository,
            notes_repository,
            note_revisions_repository,
            note_reviews_repository,
            note_links_repository,
            settings_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<Topic>> {
        self.topics_repository.list()
    }

    pub fn create(&self, new: NewTopic) -> AppResult<Topic> {
        let topic = self.topics_repository.create(new)?;
        self.mark_dirty(&topic.id)?;
        Ok(topic)
    }

    pub fn update(&self, id: &str, patch: TopicPatch) -> AppResult<Topic> {
        let topic = self.topics_repository.update(id, patch)?;
        self.mark_dirty(id)?;
        Ok(topic)
    }

    /// Delete a topic. `delete_notes` tombstones its notes with everything that hangs off
    /// them (revisions, reviews, links); otherwise the notes move back to unfiled. Every
    /// touched row is stamped for sync.
    pub fn delete(&self, id: &str, delete_notes: bool) -> AppResult<()> {
        self.topics_repository.delete(id)?;
        self.hlc_service.stamp(&self.topics_repository, [id])?;
        let note_ids = if delete_notes {
            self.notes_repository.delete_in_topic(id)?
        } else {
            self.notes_repository.unfile_topic(id)?
        };
        self.hlc_service.stamp(&self.notes_repository, &note_ids)?;
        if delete_notes {
            for note_id in &note_ids {
                delete_note_children(
                    note_id,
                    &self.note_revisions_repository,
                    &self.note_reviews_repository,
                    &self.note_links_repository,
                    &self.hlc_service,
                )?;
            }
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
        self.hlc_service.stamp(&self.topics_repository, [id])?;
        self.sync_signal.send();
        Ok(())
    }
}
