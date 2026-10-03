//! Note-revision persistence: the [`NoteRevisionsRepository`]. Revisions are append-only
//! rows (never updated, only tombstoned with their note), which is what lets them sync
//! without last-write-wins ever dropping one.

use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_rusqlite::from_rows;
use uuid::Uuid;

use crate::core::error::AppResult;
use crate::core::models::{NoteRevision, RevisionReason};
use crate::core::wire::{Clock, LocalChange, NoteRevisionBody, RecordBody};

use crate::database::{serde_err, store_err, Db};
use crate::core::synced_repository::SyncedRepository;

#[derive(Clone)]
pub struct NoteRevisionsRepository {
    db: Arc<Db>,
}

impl NoteRevisionsRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// A note's revisions, newest first.
    pub fn list_for_note(&self, note_id: &str) -> AppResult<Vec<NoteRevision>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT * FROM note_revisions WHERE note_id = ?1 AND deleted = 0 \
                 ORDER BY created_at DESC",
            )
            .map_err(store_err)?;
        let rows = stmt.query([note_id]).map_err(store_err)?;
        from_rows::<NoteRevisionRow>(rows)
            .map(|row| row.map(NoteRevision::from).map_err(serde_err))
            .collect()
    }

    pub fn insert(&self, note_id: &str, text: &str, reason: RevisionReason) -> AppResult<String> {
        let id = Uuid::new_v4().to_string();
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO note_revisions (id, note_id, text, reason, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, note_id, text, reason.as_str(), Utc::now().to_rfc3339()],
        )
        .map_err(store_err)?;
        Ok(id)
    }

    /// Tombstone every live revision of a note. Returns the affected ids for stamping.
    pub fn delete_for_note(&self, note_id: &str) -> AppResult<Vec<String>> {
        let conn = self.db.lock()?;
        let ids = {
            let mut stmt = conn
                .prepare("SELECT id FROM note_revisions WHERE note_id = ?1 AND deleted = 0")
                .map_err(store_err)?;
            let rows = stmt
                .query_map([note_id], |row| row.get::<_, String>(0))
                .map_err(store_err)?;
            rows.collect::<Result<Vec<String>, _>>()
                .map_err(store_err)?
        };
        conn.execute(
            "UPDATE note_revisions SET deleted = 1 WHERE note_id = ?1 AND deleted = 0",
            [note_id],
        )
        .map_err(store_err)?;
        Ok(ids)
    }

    pub fn merge(&self, id: &str, clock: &Clock, body: &NoteRevisionBody) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO note_revisions (id, note_id, text, reason, created_at, deleted, \
             hlc_physical, hlc_counter, hlc_node_id, dirty) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0) \
             ON CONFLICT(id) DO UPDATE SET \
             note_id = excluded.note_id, text = excluded.text, reason = excluded.reason, \
             created_at = excluded.created_at, deleted = excluded.deleted, \
             hlc_physical = excluded.hlc_physical, hlc_counter = excluded.hlc_counter, \
             hlc_node_id = excluded.hlc_node_id, dirty = 0 \
             WHERE (note_revisions.hlc_physical, note_revisions.hlc_counter, \
             note_revisions.hlc_node_id) \
             < (excluded.hlc_physical, excluded.hlc_counter, excluded.hlc_node_id)",
            params![
                id,
                body.note_id,
                body.text,
                body.reason,
                body.created_at,
                body.deleted,
                clock.physical,
                clock.counter,
                clock.node_id
            ],
        )
        .map_err(store_err)?;
        Ok(())
    }
}

impl SyncedRepository for NoteRevisionsRepository {
    fn list_dirty(&self) -> AppResult<Vec<LocalChange>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM note_revisions WHERE dirty = 1")
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
                    body: RecordBody::NoteRevision(NoteRevisionBody {
                        note_id: row.get("note_id")?,
                        text: row.get("text")?,
                        reason: row.get("reason")?,
                        created_at: row.get("created_at")?,
                        deleted: row.get("deleted")?,
                    }),
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(store_err)
    }

    fn clear_dirty(&self, changes: &[LocalChange]) -> AppResult<()> {
        let conn = self.db.lock()?;
        for change in changes {
            conn.execute(
                "UPDATE note_revisions SET dirty = 0 WHERE id = ?1 AND hlc_physical = ?2 \
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

    fn record_change(&self, id: &str, physical: i64, counter: i64, node_id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "UPDATE note_revisions SET hlc_physical = ?1, hlc_counter = ?2, hlc_node_id = ?3, \
             dirty = 1 WHERE id = ?4",
            params![physical, counter, node_id, id],
        )
        .map_err(store_err)?;
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
struct NoteRevisionRow {
    id: String,
    note_id: String,
    text: String,
    reason: String,
    created_at: String,
}

impl From<NoteRevisionRow> for NoteRevision {
    fn from(row: NoteRevisionRow) -> Self {
        Self {
            id: row.id,
            note_id: row.note_id,
            text: row.text,
            reason: RevisionReason::from_stored(&row.reason),
            created_at: row.created_at,
        }
    }
}
