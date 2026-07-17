//! Task persistence — step 4 of the capture data flow.
//!
//! [`TaskStore`] is the seam: Phase-1 ships [`memory::MemoryTaskStore`]; the
//! SQLCipher (AES-256) store will implement the same trait, so the commands never
//! change. Methods return [`AppResult`](crate::error::AppResult) because a real
//! database can fail.

pub mod memory;

use crate::error::AppResult;
use crate::models::{NewTask, Task};

pub trait TaskStore: Send + Sync {
    fn list(&self) -> AppResult<Vec<Task>>;
    fn insert(&self, new: NewTask) -> AppResult<Task>;
    fn delete(&self, id: &str) -> AppResult<()>;
}
