//! Topic persistence: the [`TopicRepository`] over the shared [`Db`](super::Db). Topics are
//! listed in creation order. Names are unique among live topics, checked here rather than
//! by a UNIQUE constraint so a sync merge of two same-named topics can't fail the pull.

use std::sync::Arc;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_rusqlite::from_rows;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{NewTopic, Sensitivity, Topic, TopicStatus};
use crate::core::wire::{Clock, LocalChange, RecordBody, TopicBody};

use super::db::{serde_err, store_err, Db};

/// A patch over a topic's mutable fields. `None` leaves a field untouched; an empty
/// `question` clears it (stored NULL), the same convention as `TaskGroupPatch::context`.
#[derive(Default)]
pub struct TopicPatch {
    pub name: Option<String>,
    pub question: Option<String>,
    pub status: Option<TopicStatus>,
    pub sensitivity: Option<Sensitivity>,
}

#[derive(Clone)]
pub struct TopicRepository {
    db: Arc<Db>,
}

impl TopicRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn list(&self) -> AppResult<Vec<Topic>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM topics WHERE deleted = 0 ORDER BY created_at ASC, name ASC")
            .map_err(store_err)?;
        let rows = stmt.query([]).map_err(store_err)?;
        from_rows::<TopicRow>(rows)
            .map(|row| row.map(Topic::from).map_err(serde_err))
            .collect()
    }

    pub fn get(&self, id: &str) -> AppResult<Option<Topic>> {
        let conn = self.db.lock()?;
        fetch_optional(&conn, id)
    }

    pub fn create(&self, new: NewTopic) -> AppResult<Topic> {
        let name = validated_name(&new.name)?;
        let now = Utc::now().to_rfc3339();
        let topic = Topic {
            id: Uuid::new_v4().to_string(),
            name,
            question: non_empty(new.question.as_deref()),
            status: TopicStatus::default(),
            sensitivity: new.sensitivity,
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = self.db.lock()?;
        ensure_name_free(&conn, &topic.name, None)?;
        conn.execute(
            "INSERT INTO topics (id, name, question, status, sensitivity, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                topic.id,
                topic.name,
                topic.question,
                topic.status.as_str(),
                topic.sensitivity.as_str(),
                topic.created_at,
                topic.updated_at
            ],
        )
        .map_err(store_err)?;
        Ok(topic)
    }

    pub fn update(&self, id: &str, patch: TopicPatch) -> AppResult<Topic> {
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;
        if fetch_optional(&conn, id)?.is_none() {
            return Err(AppError::Store(format!("topic {id} not found")));
        }

        if let Some(name) = patch.name {
            let name = validated_name(&name)?;
            ensure_name_free(&conn, &name, Some(id))?;
            conn.execute(
                "UPDATE topics SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(question) = patch.question {
            conn.execute(
                "UPDATE topics SET question = ?1, updated_at = ?2 WHERE id = ?3",
                params![non_empty(Some(&question)), now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(status) = patch.status {
            conn.execute(
                "UPDATE topics SET status = ?1, updated_at = ?2 WHERE id = ?3",
                params![status.as_str(), now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(sensitivity) = patch.sensitivity {
            conn.execute(
                "UPDATE topics SET sensitivity = ?1, updated_at = ?2 WHERE id = ?3",
                params![sensitivity.as_str(), now, id],
            )
            .map_err(store_err)?;
        }

        fetch_optional(&conn, id)?.ok_or_else(|| AppError::Store(format!("topic {id} not found")))
    }

    /// Tombstone a topic so the deletion syncs. What happens to its notes is the note
    /// repository's job; the service decides (unfile vs delete) and stamps them.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("UPDATE topics SET deleted = 1 WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }

    pub fn record_change(
        &self,
        id: &str,
        physical: i64,
        counter: i64,
        node_id: &str,
    ) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "UPDATE topics SET hlc_physical = ?1, hlc_counter = ?2, hlc_node_id = ?3, \
             dirty = 1 WHERE id = ?4",
            params![physical, counter, node_id, id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn list_dirty(&self) -> AppResult<Vec<LocalChange>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM topics WHERE dirty = 1")
            .map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok(LocalChange {
                    id: row.get("id")?,
                    clock: Clock {
                        physical: row.get("hlc_physical")?,
                        counter: row.get("hlc_counter")?,
                        node_id: row.get("hlc_node_id")?,
                    },
                    body: RecordBody::Topic(TopicBody {
                        name: row.get("name")?,
                        question: row.get("question")?,
                        status: row.get("status")?,
                        sensitivity: row.get("sensitivity")?,
                        created_at: row.get("created_at")?,
                        updated_at: row.get("updated_at")?,
                        deleted: row.get("deleted")?,
                    }),
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(store_err)
    }

    /// Merge a pulled topic: insert, or overwrite only if the incoming clock is newer (LWW).
    pub fn merge(&self, id: &str, clock: &Clock, body: &TopicBody) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO topics (id, name, question, status, sensitivity, created_at, \
             updated_at, deleted, hlc_physical, hlc_counter, hlc_node_id, dirty) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0) \
             ON CONFLICT(id) DO UPDATE SET \
             name = excluded.name, question = excluded.question, status = excluded.status, \
             sensitivity = excluded.sensitivity, created_at = excluded.created_at, \
             updated_at = excluded.updated_at, deleted = excluded.deleted, \
             hlc_physical = excluded.hlc_physical, hlc_counter = excluded.hlc_counter, \
             hlc_node_id = excluded.hlc_node_id, dirty = 0 \
             WHERE (topics.hlc_physical, topics.hlc_counter, topics.hlc_node_id) \
             < (excluded.hlc_physical, excluded.hlc_counter, excluded.hlc_node_id)",
            params![
                id,
                body.name,
                body.question,
                body.status,
                body.sensitivity,
                body.created_at,
                body.updated_at,
                body.deleted,
                clock.physical,
                clock.counter,
                clock.node_id
            ],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn clear_dirty(&self, changes: &[LocalChange]) -> AppResult<()> {
        let conn = self.db.lock()?;
        for change in changes {
            conn.execute(
                "UPDATE topics SET dirty = 0 WHERE id = ?1 AND hlc_physical = ?2 \
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
        return Err(AppError::Store("topic name cannot be empty".to_string()));
    }
    Ok(trimmed.to_string())
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

/// Names are unique among live topics (case-insensitive), ignoring `except` when renaming.
fn ensure_name_free(conn: &Connection, name: &str, except: Option<&str>) -> AppResult<()> {
    let taken: Option<String> = conn
        .query_row(
            "SELECT id FROM topics WHERE deleted = 0 AND name = ?1 COLLATE NOCASE \
             AND id != COALESCE(?2, '')",
            params![name, except],
            |row| row.get(0),
        )
        .optional()
        .map_err(store_err)?;
    match taken {
        Some(_) => Err(AppError::Store(
            "a topic with this name already exists".to_string(),
        )),
        None => Ok(()),
    }
}

fn fetch_optional(conn: &Connection, id: &str) -> AppResult<Option<Topic>> {
    let mut stmt = conn
        .prepare("SELECT * FROM topics WHERE id = ?1 AND deleted = 0")
        .map_err(store_err)?;
    let rows = stmt.query([id]).map_err(store_err)?;
    let row = from_rows::<TopicRow>(rows)
        .next()
        .transpose()
        .map_err(serde_err)?;
    Ok(row.map(Topic::from))
}

/// The storage-shaped mirror of [`Topic`]: enums as their stored strings, field names
/// matching the snake_case columns for serde_rusqlite.
#[derive(Serialize, Deserialize)]
struct TopicRow {
    id: String,
    name: String,
    question: Option<String>,
    status: String,
    sensitivity: String,
    created_at: String,
    updated_at: String,
}

impl From<TopicRow> for Topic {
    fn from(row: TopicRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            question: row.question,
            status: TopicStatus::from_stored(&row.status),
            sensitivity: Sensitivity::from_stored(&row.sensitivity),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
