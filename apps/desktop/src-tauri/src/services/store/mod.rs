//! Task persistence — step 4 of the capture data flow.
//!
//! [`TaskStore`] is the seam between the commands and storage. Phase-1 ships
//! [`sqlite::SqliteTaskStore`] (SQLCipher, AES-256 at rest); any future store
//! (e.g. a synced one) implements the same trait, so the commands never change.
//! Methods return [`AppResult`](crate::core::error::AppResult) because a real database
//! can fail.

pub mod sqlite;

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};

pub trait TaskStore: Send + Sync {
    fn list(&self) -> AppResult<Vec<Task>>;
    fn insert(&self, new: NewTask) -> AppResult<Task>;
    fn delete(&self, id: &str) -> AppResult<()>;
    /// Replace a task's text and mark it as AI-improved; returns the updated task.
    fn mark_improved(&self, id: &str, text: &str) -> AppResult<Task>;
}
