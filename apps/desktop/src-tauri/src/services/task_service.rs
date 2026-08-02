//! Task business logic. [`TaskService`] fronts the [`TaskRepository`] so the IPC
//! layer never touches persistence directly; the AI call that produces improved
//! text lives in [`crate::services::ai_service`].

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};
use crate::repository::TaskRepository;

pub use crate::repository::TaskPatch;

pub struct TaskService {
    task_repository: TaskRepository,
}

impl TaskService {
    pub fn new(task_repository: TaskRepository) -> Self {
        Self { task_repository }
    }

    pub fn list(&self) -> AppResult<Vec<Task>> {
        self.task_repository.list()
    }

    pub fn get(&self, id: &str) -> AppResult<Task> {
        self.task_repository.get(id)
    }

    pub fn save(&self, task: NewTask) -> AppResult<Task> {
        self.task_repository.insert(task)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        self.task_repository.delete(id)
    }

    /// Swap the inbox order of two tasks (moving `first` and `second` past each other).
    pub fn reorder(&self, first: &str, second: &str) -> AppResult<()> {
        self.task_repository.swap_positions(first, second)
    }

    pub fn update(&self, id: &str, patch: TaskPatch) -> AppResult<Task> {
        self.task_repository.update(id, patch)
    }
}
