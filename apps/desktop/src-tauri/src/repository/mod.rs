//! Persistence: one repository per table, each named after its table and touching only that
//! table (`tasks` → [`TasksRepository`]). Work that spans tables is composed in a service.
//! The [`Repository`] facade opens them all on the shared database connection.

mod egress_events_repository;
mod incoming_dismissals_repository;
mod note_revisions_repository;
mod notes_repository;
mod settings_repository;
mod sync_state_repository;
mod task_groups_repository;
mod task_worktrees_repository;
mod tasks_repository;
mod topics_repository;

use std::sync::Arc;

use crate::database::Db;

pub use egress_events_repository::EgressEventsRepository;
pub use incoming_dismissals_repository::IncomingDismissalsRepository;
pub use note_revisions_repository::NoteRevisionsRepository;
pub use notes_repository::{NotePatch, NotesRepository};
pub use settings_repository::SettingsRepository;
pub use sync_state_repository::SyncStateRepository;
pub use task_groups_repository::{TaskGroupPatch, TaskGroupsRepository};
pub use task_worktrees_repository::TaskWorktreesRepository;
pub use tasks_repository::{TaskPatch, TasksRepository};
pub use topics_repository::{TopicPatch, TopicsRepository};

/// The data-access facade: one field per table, named after it, each holding that table's
/// repository on the shared [`Db`]. Adding a table = a field here + its `*Repository`.
pub struct Repository {
    pub tasks: TasksRepository,
    pub task_groups: TaskGroupsRepository,
    pub task_worktrees: TaskWorktreesRepository,
    pub topics: TopicsRepository,
    pub notes: NotesRepository,
    pub note_revisions: NoteRevisionsRepository,
    pub egress_events: EgressEventsRepository,
    pub incoming_dismissals: IncomingDismissalsRepository,
    pub settings: SettingsRepository,
    pub sync_state: SyncStateRepository,
}

impl Repository {
    pub fn new(db: Arc<Db>) -> Self {
        Self {
            tasks: TasksRepository::new(db.clone()),
            task_groups: TaskGroupsRepository::new(db.clone()),
            task_worktrees: TaskWorktreesRepository::new(db.clone()),
            topics: TopicsRepository::new(db.clone()),
            notes: NotesRepository::new(db.clone()),
            note_revisions: NoteRevisionsRepository::new(db.clone()),
            egress_events: EgressEventsRepository::new(db.clone()),
            incoming_dismissals: IncomingDismissalsRepository::new(db.clone()),
            settings: SettingsRepository::new(db.clone()),
            sync_state: SyncStateRepository::new(db.clone()),
        }
    }
}
