use std::sync::Mutex;

use chrono::Utc;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{NewTask, Task};
use crate::store::TaskStore;

/// In-memory task store (Phase-1). Implements the same [`TaskStore`] contract the
/// SQLCipher store will.
///
/// TODO(phase-1-hardening): back this with `rusqlite` + the `sqlcipher` feature,
/// keying the DB from the OS keychain.
#[derive(Default)]
pub struct MemoryTaskStore {
    tasks: Mutex<Vec<Task>>,
}

impl MemoryTaskStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl TaskStore for MemoryTaskStore {
    fn list(&self) -> AppResult<Vec<Task>> {
        let tasks = self
            .tasks
            .lock()
            .map_err(|e| AppError::Store(e.to_string()))?;
        Ok(tasks.clone())
    }

    fn insert(&self, new: NewTask) -> AppResult<Task> {
        let now = Utc::now().to_rfc3339();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            title: new.title,
            body: new.body,
            status: "inbox".to_string(),
            source: new.source,
            created_at: now.clone(),
            updated_at: now,
        };
        self.tasks
            .lock()
            .map_err(|e| AppError::Store(e.to_string()))?
            .insert(0, task.clone());
        Ok(task)
    }

    fn delete(&self, id: &str) -> AppResult<()> {
        self.tasks
            .lock()
            .map_err(|e| AppError::Store(e.to_string()))?
            .retain(|task| task.id != id);
        Ok(())
    }
}
