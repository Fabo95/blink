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
use crate::core::models::{NewTaskGroup, TaskGroup};
use crate::core::wire::{Clock, GroupBody, LocalChange, RecordBody};

use super::db::{serde_err, store_err, Db};

/// A patch over a group's mutable fields. `None` leaves a field untouched; for `context`
/// an empty string clears it (stored NULL) — the same convention as [`TaskPatch`].
///
/// [`TaskPatch`]: crate::repository::TaskPatch
#[derive(Default)]
pub struct TaskGroupPatch {
    pub name: Option<String>,
    pub context: Option<String>,
}

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
            .prepare("SELECT * FROM task_groups WHERE deleted = 0 ORDER BY created_at ASC, name ASC")
            .map_err(store_err)?;
        let rows = stmt.query([]).map_err(store_err)?;
        from_rows::<TaskGroupRow>(rows)
            .map(|row| row.map(TaskGroup::from).map_err(serde_err))
            .collect()
    }

    pub fn create(&self, new: NewTaskGroup) -> AppResult<TaskGroup> {
        let name = validated_name(&new.name)?;
        let context =
            new.context.as_deref().map(str::trim).filter(|c| !c.is_empty()).map(str::to_string);
        let now = Utc::now().to_rfc3339();
        let group = TaskGroup {
            id: Uuid::new_v4().to_string(),
            name,
            context,
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO task_groups (id, name, context, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![group.id, group.name, group.context, group.created_at, group.updated_at],
        )
        .map_err(name_taken_err)?;
        Ok(group)
    }

    /// Fetch a single (non-deleted) group by id, or `None` if it's gone. Used by the
    /// prompt-generation command to read the group's context.
    pub fn get(&self, id: &str) -> AppResult<Option<TaskGroup>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM task_groups WHERE id = ?1 AND deleted = 0")
            .map_err(store_err)?;
        let rows = stmt.query([id]).map_err(store_err)?;
        let row = from_rows::<TaskGroupRow>(rows).next().transpose().map_err(serde_err)?;
        Ok(row.map(TaskGroup::from))
    }

    /// Patch a group's name and/or context. Each field is applied only when present; an
    /// empty `context` clears it (stored NULL).
    pub fn update(&self, id: &str, patch: TaskGroupPatch) -> AppResult<TaskGroup> {
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;

        if let Some(name) = patch.name {
            let name = validated_name(&name)?;
            let changed = conn
                .execute(
                    "UPDATE task_groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
                    params![name, now, id],
                )
                .map_err(name_taken_err)?;
            if changed == 0 {
                return Err(AppError::Store(format!("task group {id} not found")));
            }
        }

        if let Some(context) = patch.context {
            // Empty input clears the context (stored NULL).
            let trimmed = context.trim();
            let value = if trimmed.is_empty() { None } else { Some(trimmed) };
            conn.execute(
                "UPDATE task_groups SET context = ?1, updated_at = ?2 WHERE id = ?3",
                params![value, now, id],
            )
            .map_err(store_err)?;
        }

        fetch_one(&conn, id)
    }

    /// Record that a group changed locally: write its Hybrid Logical Clock version
    /// (`physical`/`counter`/`node_id`) + `dirty = 1`, so the sync loop finds and pushes
    /// the change. The group service calls this (with a fresh clock stamp) after each
    /// mutation.
    pub fn record_change(
        &self,
        id: &str,
        physical: i64,
        counter: i64,
        node_id: &str,
    ) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "UPDATE task_groups SET hlc_physical = ?1, hlc_counter = ?2, hlc_node_id = ?3, \
             dirty = 1 WHERE id = ?4",
            params![physical, counter, node_id, id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    /// Soft-delete a group (tombstone, so the deletion syncs) and un-group its tasks.
    /// Returns the ids of the un-grouped tasks so the service can stamp them (their
    /// `task_group_id` changed and must sync too). The group's unique `name` is freed
    /// (set to its `id`) so the same name can be reused.
    pub fn delete(&self, id: &str) -> AppResult<Vec<String>> {
        let conn = self.db.lock()?;
        let affected = {
            let mut stmt = conn
                .prepare("SELECT id FROM tasks WHERE task_group_id = ?1")
                .map_err(store_err)?;
            let rows = stmt
                .query_map([id], |row| row.get::<_, String>(0))
                .map_err(store_err)?;
            rows.collect::<Result<Vec<String>, _>>().map_err(store_err)?
        };
        conn.execute(
            "UPDATE tasks SET task_group_id = NULL WHERE task_group_id = ?1",
            [id],
        )
        .map_err(store_err)?;
        conn.execute("UPDATE task_groups SET deleted = 1, name = id WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(affected)
    }

    /// Every group with unsynced local changes (tombstones included), for the push.
    pub fn list_dirty(&self) -> AppResult<Vec<LocalChange>> {
        let conn = self.db.lock()?;
        let mut stmt =
            conn.prepare("SELECT * FROM task_groups WHERE dirty = 1").map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok(LocalChange {
                    id: row.get("id")?,
                    clock: Clock {
                        physical: row.get("hlc_physical")?,
                        counter: row.get("hlc_counter")?,
                        node_id: row.get("hlc_node_id")?,
                    },
                    body: RecordBody::Group(GroupBody {
                        name: row.get("name")?,
                        context: row.get("context")?,
                        created_at: row.get("created_at")?,
                        updated_at: row.get("updated_at")?,
                        deleted: row.get("deleted")?,
                    }),
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(store_err)
    }

    /// Merge a pulled group: insert, or overwrite only if the incoming clock is newer
    /// (LWW). Stored `dirty = 0`.
    pub fn merge(&self, id: &str, clock: &Clock, body: &GroupBody) -> AppResult<()> {
        let conn = self.db.lock()?;
        let result = conn.execute(
            "INSERT INTO task_groups (id, name, context, created_at, updated_at, deleted, \
             hlc_physical, hlc_counter, hlc_node_id, dirty) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0) \
             ON CONFLICT(id) DO UPDATE SET \
             name = excluded.name, context = excluded.context, created_at = excluded.created_at, \
             updated_at = excluded.updated_at, deleted = excluded.deleted, \
             hlc_physical = excluded.hlc_physical, hlc_counter = excluded.hlc_counter, \
             hlc_node_id = excluded.hlc_node_id, dirty = 0 \
             WHERE (task_groups.hlc_physical, task_groups.hlc_counter, task_groups.hlc_node_id) \
             < (excluded.hlc_physical, excluded.hlc_counter, excluded.hlc_node_id)",
            params![
                id, body.name, body.context, body.created_at, body.updated_at, body.deleted,
                clock.physical, clock.counter, clock.node_id
            ],
        );
        match result {
            Ok(_) => Ok(()),
            // TODO(root-cause): the legacy `UNIQUE(name)` constraint (migration 6) can't
            // coexist with sync — two devices independently creating a same-named group
            // collide here. Proper fix: drop the UNIQUE via a table-rebuild migration and
            // move the name-uniqueness check to app-level create/rename. Until then, skip the
            // rare colliding merge rather than failing the whole pull.
            Err(e) if e.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) => {
                Ok(())
            }
            Err(e) => Err(store_err(e)),
        }
    }

    /// Clear the dirty flag on rows that were just pushed — only if the clock still
    /// matches, so a local edit made mid-push isn't lost.
    pub fn clear_dirty(&self, changes: &[LocalChange]) -> AppResult<()> {
        let conn = self.db.lock()?;
        for change in changes {
            conn.execute(
                "UPDATE task_groups SET dirty = 0 WHERE id = ?1 AND hlc_physical = ?2 \
                 AND hlc_counter = ?3 AND hlc_node_id = ?4",
                params![
                    change.id,
                    change.clock.physical,
                    change.clock.counter,
                    change.clock.node_id
                ],
            )
            .map_err(store_err)?;
        }
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
        .prepare("SELECT * FROM task_groups WHERE id = ?1 AND deleted = 0")
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
    context: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<TaskGroupRow> for TaskGroup {
    fn from(row: TaskGroupRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            context: row.context,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
