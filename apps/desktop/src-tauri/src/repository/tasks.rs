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

/// A partial task edit — every `Some` field is written, `None` leaves it untouched.
/// An empty `link` or `task_group_id` clears the stored value; `source_name` sets the
/// displayed source (the `app_name` column). The caller owns the `improved` flag (a
/// manual edit clears it, an AI improve sets it), so it's passed explicitly rather
/// than inferred from `text`.
#[derive(Default)]
pub struct TaskPatch {
    pub text: Option<String>,
    pub completed: Option<bool>,
    pub link: Option<String>,
    pub source_name: Option<String>,
    pub improved: Option<bool>,
    pub task_group_id: Option<String>,
}

/// The task repository — task-specific queries over the shared [`Db`]. Constructed
/// by [`super::Repository`], which hands every repository the same connection.
#[derive(Clone)]
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
            .prepare("SELECT * FROM tasks ORDER BY position DESC")
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
            link: new.link,
            task_group_id: new.task_group_id,
            source: new.source,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
        };
        let params = to_params_named(TaskRow::from(&task)).map_err(serde_err)?;
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO tasks (id, text, status, app_id, app_name, window_title, \
             captured_at, created_at, updated_at, improved, link, completed_at, \
             task_group_id) \
             VALUES (:id, :text, :status, :app_id, :app_name, :window_title, \
             :captured_at, :created_at, :updated_at, :improved, :link, :completed_at, \
             :task_group_id)",
            params.to_slice().as_slice(),
        )
        .map_err(store_err)?;
        // New tasks land at the top of the inbox (the highest position so far, + 1).
        conn.execute(
            "UPDATE tasks SET position = \
             (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE id != ?1) WHERE id = ?1",
            [&task.id],
        )
        .map_err(store_err)?;
        Ok(task)
    }

    /// Swap the ordering of two tasks — used to nudge a task up or down the inbox.
    pub fn swap_positions(&self, a: &str, b: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        let read = |id: &str| -> AppResult<i64> {
            conn.query_row("SELECT position FROM tasks WHERE id = ?1", [id], |row| row.get(0))
                .map_err(store_err)
        };
        let (pa, pb) = (read(a)?, read(b)?);
        conn.execute("UPDATE tasks SET position = ?1 WHERE id = ?2", params![pb, a])
            .map_err(store_err)?;
        conn.execute("UPDATE tasks SET position = ?1 WHERE id = ?2", params![pa, b])
            .map_err(store_err)?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }

    /// Apply a [`TaskPatch`], writing each `Some` field. Returns the updated task (or a
    /// not-found error, surfaced by the final fetch).
    pub fn update(&self, id: &str, patch: TaskPatch) -> AppResult<Task> {
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;

        if let Some(text) = patch.text {
            conn.execute(
                "UPDATE tasks SET text = ?1, updated_at = ?2 WHERE id = ?3",
                params![text, now, id],
            )
            .map_err(store_err)?;
        }

        if let Some(improved) = patch.improved {
            conn.execute(
                "UPDATE tasks SET improved = ?1, updated_at = ?2 WHERE id = ?3",
                params![improved, now, id],
            )
            .map_err(store_err)?;
        }

        if let Some(completed) = patch.completed {
            let status = if completed { "done" } else { "inbox" };
            // Stamp the completion time (cleared when moved back to the inbox).
            let completed_at = completed.then_some(now.as_str());
            conn.execute(
                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                params![status, completed_at, now, id],
            )
            .map_err(store_err)?;
        }

        if let Some(link) = patch.link {
            // Empty input clears the link (stored NULL).
            let trimmed = link.trim();
            let value = if trimmed.is_empty() { None } else { Some(trimmed) };
            conn.execute(
                "UPDATE tasks SET link = ?1, updated_at = ?2 WHERE id = ?3",
                params![value, now, id],
            )
            .map_err(store_err)?;
        }

        if let Some(task_group_id) = patch.task_group_id {
            // Empty input un-groups the task (stored NULL).
            let trimmed = task_group_id.trim();
            let value = if trimmed.is_empty() { None } else { Some(trimmed) };
            conn.execute(
                "UPDATE tasks SET task_group_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![value, now, id],
            )
            .map_err(store_err)?;
        }

        if let Some(source_name) = patch.source_name {
            conn.execute(
                "UPDATE tasks SET app_name = ?1, updated_at = ?2 WHERE id = ?3",
                params![source_name, now, id],
            )
            .map_err(store_err)?;
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
    link: Option<String>,
    completed_at: Option<String>,
    task_group_id: Option<String>,
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
            link: task.link.clone(),
            completed_at: task.completed_at.clone(),
            task_group_id: task.task_group_id.clone(),
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
            link: row.link,
            task_group_id: row.task_group_id,
            source: CaptureSource {
                app_id: row.app_id,
                app_name: row.app_name,
                window_title: row.window_title,
                captured_at: row.captured_at,
            },
            created_at: row.created_at,
            updated_at: row.updated_at,
            completed_at: row.completed_at,
        }
    }
}
