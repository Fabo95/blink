//! Persistence layer — the encrypted database ([`Db`]) and the [`Repository`]
//! facade, which shares the connection across one entity repository per table.

mod db;
mod migrations;
mod note_repository;
mod note_revision_repository;
mod settings_repository;
mod sync_state_repository;
mod task_group_repository;
mod task_repository;
mod topic_repository;

use std::sync::Arc;

pub use db::Db;
pub use note_repository::{NotePatch, NoteRepository};
pub use note_revision_repository::NoteRevisionRepository;
pub use settings_repository::SettingsRepository;
pub use sync_state_repository::SyncStateRepository;
pub use task_group_repository::{TaskGroupPatch, TaskGroupRepository};
pub use task_repository::{TaskPatch, TaskRepository};
pub use topic_repository::{TopicPatch, TopicRepository};

/// The data-access facade: hands the shared [`Db`] to an entity repository per
/// table. Adding a table = add a field here + its `*Repository`.
pub struct Repository {
    pub tasks: TaskRepository,
    pub task_groups: TaskGroupRepository,
    pub topics: TopicRepository,
    pub notes: NoteRepository,
    pub note_revisions: NoteRevisionRepository,
    pub settings: SettingsRepository,
    pub sync_state: SyncStateRepository,
}

impl Repository {
    pub fn new(db: Arc<Db>) -> Self {
        Self {
            tasks: TaskRepository::new(db.clone()),
            task_groups: TaskGroupRepository::new(db.clone()),
            topics: TopicRepository::new(db.clone()),
            notes: NoteRepository::new(db.clone()),
            note_revisions: NoteRevisionRepository::new(db.clone()),
            settings: SettingsRepository::new(db.clone()),
            sync_state: SyncStateRepository::new(db.clone()),
        }
    }
}
