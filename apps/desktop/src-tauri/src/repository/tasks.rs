//! Task persistence — the [`TaskRepository`] and its SQLCipher-backed queries over
//! the shared [`Db`](super::Db). Methods return
//! [`AppResult`](crate::core::error::AppResult) because a real database can fail.

use std::sync::Arc;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_rusqlite::{from_rows, to_params_named};
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{CaptureSource, NewTask, Task};

use super::db::{serde_err, store_err, Db};

/// The task repository — task-specific queries over the shared [`Db`]. Constructed
/// by [`super::Repository`], which hands every repository the same connection.
pub struct TaskRepository {
    db: Arc<Db>,
}

impl TaskRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn list(&self) -> AppResult<Vec<Task>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM tasks ORDER BY status = 'done', created_at DESC")
            .map_err(store_err)?;
        let rows = stmt.query([]).map_err(store_err)?;
        from_rows::<TaskRow>(rows)
            .map(|row| row.map(Task::from).map_err(serde_err))
            .collect()
    }

    pub fn insert(&self, new: NewTask) -> AppResult<Task> {
        let now = Utc::now().to_rfc3339();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            text: new.text,
            status: "inbox".to_string(),
            improved: new.improved,
            source: new.source,
            created_at: now.clone(),
            updated_at: now,
        };
        let params = to_params_named(TaskRow::from(&task)).map_err(serde_err)?;
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO tasks (id, text, status, app_id, app_name, window_title, \
             captured_at, created_at, updated_at, improved) \
             VALUES (:id, :text, :status, :app_id, :app_name, :window_title, \
             :captured_at, :created_at, :updated_at, :improved)",
            params.to_slice().as_slice(),
        )
        .map_err(store_err)?;
        Ok(task)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }

    pub fn mark_improved(&self, id: &str, text: &str) -> AppResult<Task> {
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;
        let changed = conn
            .execute(
                "UPDATE tasks SET text = ?1, improved = 1, updated_at = ?2 WHERE id = ?3",
                params![text, now, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store(format!("task {id} not found")));
        }
        fetch_one(&conn, id)
    }

    /// Mark a task done (or move it back to the inbox); returns the updated task.
    pub fn set_completed(&self, id: &str, completed: bool) -> AppResult<Task> {
        let status = if completed { "done" } else { "inbox" };
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;
        let changed = conn
            .execute(
                "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
                params![status, now, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store(format!("task {id} not found")));
        }
        fetch_one(&conn, id)
    }
}

/// Fetch a single task by id — used after an update to return the fresh row.
fn fetch_one(conn: &Connection, id: &str) -> AppResult<Task> {
    let mut stmt = conn
        .prepare("SELECT * FROM tasks WHERE id = ?1")
        .map_err(store_err)?;
    let rows = stmt.query([id]).map_err(store_err)?;
    let row = from_rows::<TaskRow>(rows)
        .next()
        .ok_or_else(|| AppError::Store(format!("task {id} not found")))?
        .map_err(serde_err)?;
    Ok(Task::from(row))
}

/// The flat, storage-shaped mirror of [`Task`] (the nested `source` fanned out into
/// columns). serde_rusqlite maps columns ↔ fields by name, so these field names
/// must match the table's column names exactly.
#[derive(Serialize, Deserialize)]
struct TaskRow {
    id: String,
    text: String,
    status: String,
    app_id: String,
    app_name: String,
    window_title: String,
    captured_at: String,
    created_at: String,
    updated_at: String,
    improved: bool,
}

impl From<&Task> for TaskRow {
    fn from(task: &Task) -> Self {
        Self {
            id: task.id.clone(),
            text: task.text.clone(),
            status: task.status.clone(),
            app_id: task.source.app_id.clone(),
            app_name: task.source.app_name.clone(),
            window_title: task.source.window_title.clone(),
            captured_at: task.source.captured_at.clone(),
            created_at: task.created_at.clone(),
            updated_at: task.updated_at.clone(),
            improved: task.improved,
        }
    }
}

impl From<TaskRow> for Task {
    fn from(row: TaskRow) -> Self {
        Self {
            id: row.id,
            text: row.text,
            status: row.status,
            improved: row.improved,
            source: CaptureSource {
                app_id: row.app_id,
                app_name: row.app_name,
                window_title: row.window_title,
                captured_at: row.captured_at,
            },
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
