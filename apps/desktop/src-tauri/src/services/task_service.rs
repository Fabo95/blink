//! Task business logic. [`TaskService`] fronts the [`TasksRepository`] so the IPC
//! layer never touches persistence directly; the AI call that produces improved
//! text lives in [`crate::services::ai_service`]. After each mutation it stamps the
//! row through [`HlcService`] so the change is tracked for sync.

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::TasksRepository;
use crate::services::hlc_service::HlcService;

pub use crate::repository::TaskPatch;

pub struct TaskService {
    tasks_repository: TasksRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl TaskService {
    pub fn new(
        tasks_repository: TasksRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self { tasks_repository, hlc_service, sync_signal }
    }

    pub fn list(&self) -> AppResult<Vec<Task>> {
        self.tasks_repository.list()
    }

    pub fn get(&self, id: &str) -> AppResult<Task> {
        self.tasks_repository.get(id)
    }

    pub fn save(&self, task: NewTask) -> AppResult<Task> {
        let task = self.tasks_repository.insert(task)?;
        self.mark_dirty(&task.id)?;
        Ok(task)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.tasks_repository.delete(id)?;
        self.mark_dirty(id)
    }

    /// Swap the inbox order of two tasks (moving `first` and `second` past each other).
    /// Order is part of the synced record, so both rows are stamped.
    pub fn reorder(&self, first: &str, second: &str) -> AppResult<()> {
        self.tasks_repository.swap_positions(first, second)?;
        self.mark_dirty(first)?;
        self.mark_dirty(second)?;
        Ok(())
    }

    pub fn update(&self, id: &str, patch: TaskPatch) -> AppResult<Task> {
        let task = self.tasks_repository.update(id, patch)?;
        self.mark_dirty(id)?;
        Ok(task)
    }

    /// Record a task as locally changed: mint a clock stamp, write it onto the row, and
    /// wake the sync loop for a debounced push. Called after each mutation.
    fn mark_dirty(&self, id: &str) -> AppResult<()> {
        self.hlc_service.stamp(&self.tasks_repository, [id])?;
        self.sync_signal.send();
        Ok(())
    }
}
