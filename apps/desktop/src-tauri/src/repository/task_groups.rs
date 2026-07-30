//! Task-group persistence — the [`TaskGroupRepository`] and its queries over the
//! shared [`Db`](super::Db). Groups are listed in creation order; deleting one
//! un-groups its tasks rather than deleting them.

use std::sync::Arc;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_rusqlite::from_rows;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::TaskGroup;

use super::db::{serde_err, store_err, Db};

#[derive(Clone)]
pub struct TaskGroupRepository {
    db: Arc<Db>,
}

impl TaskGroupRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn list(&self) -> AppResult<Vec<TaskGroup>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM task_groups ORDER BY created_at ASC, name ASC")
            .map_err(store_err)?;
        let rows = stmt.query([]).map_err(store_err)?;
        from_rows::<TaskGroupRow>(rows)
            .map(|row| row.map(TaskGroup::from).map_err(serde_err))
            .collect()
    }

    pub fn create(&self, name: &str) -> AppResult<TaskGroup> {
        let name = validated_name(name)?;
        let now = Utc::now().to_rfc3339();
        let group = TaskGroup {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO task_groups (id, name, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4)",
            params![group.id, group.name, group.created_at, group.updated_at],
        )
        .map_err(name_taken_err)?;
        Ok(group)
    }

    pub fn rename(&self, id: &str, name: &str) -> AppResult<TaskGroup> {
        let name = validated_name(name)?;
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;
        let changed = conn
            .execute(
                "UPDATE task_groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, now, id],
            )
            .map_err(name_taken_err)?;
        if changed == 0 {
            return Err(AppError::Store(format!("task group {id} not found")));
        }
        fetch_one(&conn, id)
    }

    /// Delete a group; its tasks fall back to ungrouped. The explicit UPDATE (rather
    /// than relying on the FK's ON DELETE SET NULL alone) keeps the behavior
    /// independent of pragma state and both statements under one lock.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "UPDATE tasks SET task_group_id = NULL WHERE task_group_id = ?1",
            [id],
        )
        .map_err(store_err)?;
        conn.execute("DELETE FROM task_groups WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }
}

fn validated_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Store("group name cannot be empty".to_string()));
    }
    Ok(trimmed.to_string())
}

/// Surface the `name` UNIQUE constraint as a readable message instead of raw SQL.
fn name_taken_err(e: rusqlite::Error) -> AppError {
    if e.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) {
        AppError::Store("a group with this name already exists".to_string())
    } else {
        store_err(e)
    }
}

fn fetch_one(conn: &Connection, id: &str) -> AppResult<TaskGroup> {
    let mut stmt = conn
        .prepare("SELECT * FROM task_groups WHERE id = ?1")
        .map_err(store_err)?;
    let rows = stmt.query([id]).map_err(store_err)?;
    let row = from_rows::<TaskGroupRow>(rows)
        .next()
        .ok_or_else(|| AppError::Store(format!("task group {id} not found")))?
        .map_err(serde_err)?;
    Ok(TaskGroup::from(row))
}

/// The storage-shaped mirror of [`TaskGroup`] — same fields, but without the
/// camelCase rename so serde_rusqlite maps them to the snake_case column names.
#[derive(Serialize, Deserialize)]
struct TaskGroupRow {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
}

impl From<TaskGroupRow> for TaskGroup {
    fn from(row: TaskGroupRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
