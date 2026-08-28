//! Task business logic. [`TaskService`] fronts the [`TaskRepository`] so the IPC
//! layer never touches persistence directly; the AI call that produces improved
//! text lives in [`crate::services::ai_service`]. After each mutation it stamps the
//! row through [`HlcService`] so the change is tracked for sync.

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};
use crate::repository::TaskRepository;
use crate::services::hlc_service::HlcService;

pub use crate::repository::TaskPatch;

pub struct TaskService {
    task_repository: TaskRepository,
    hlc_service: Arc<HlcService>,
}

impl TaskService {
    pub fn new(task_repository: TaskRepository, hlc_service: Arc<HlcService>) -> Self {
        Self { task_repository, hlc_service }
    }

    pub fn list(&self) -> AppResult<Vec<Task>> {
        self.task_repository.list()
    }

    pub fn get(&self, id: &str) -> AppResult<Task> {
        self.task_repository.get(id)
    }

    pub fn save(&self, task: NewTask) -> AppResult<Task> {
        let task = self.task_repository.insert(task)?;
        self.mark_dirty(&task.id)?;
        Ok(task)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.task_repository.delete(id)?;
        self.mark_dirty(id)
    }

    /// Swap the inbox order of two tasks (moving `first` and `second` past each other).
    /// Order is part of the synced record, so both rows are stamped.
    pub fn reorder(&self, first: &str, second: &str) -> AppResult<()> {
        self.task_repository.swap_positions(first, second)?;
        self.mark_dirty(first)?;
        self.mark_dirty(second)?;
        Ok(())
    }

    pub fn update(&self, id: &str, patch: TaskPatch) -> AppResult<Task> {
        let task = self.task_repository.update(id, patch)?;
        self.mark_dirty(id)?;
        Ok(task)
    }

    /// Record a task as locally changed: mint a clock stamp and write it onto the row,
    /// so the sync loop finds and pushes the edit. Called after each mutation.
    fn mark_dirty(&self, id: &str) -> AppResult<()> {
        let hlc = self.hlc_service.next()?;
        self.task_repository.record_change(id, hlc.physical, hlc.counter, &hlc.node_id)
    }
}
