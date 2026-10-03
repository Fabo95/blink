//! Note-review persistence: the [`NoteReviewsRepository`]. Reviews are append-only rows,
//! like revisions: never updated, only tombstoned with their note, so two devices rating the
//! same note can't overwrite each other's judgement.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_rusqlite::from_rows;
use uuid::Uuid;

use crate::core::error::AppResult;
use crate::core::models::NoteReview;
use crate::core::wire::{Clock, LocalChange, NoteReviewBody, RecordBody};

use crate::database::{serde_err, store_err, Db};
use crate::core::synced_repository::SyncedRepository;

#[derive(Clone)]
pub struct NoteReviewsRepository {
    db: Arc<Db>,
}

impl NoteReviewsRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// A note's reviews, oldest first (the order a conviction trend reads in).
    pub fn list_for_note(&self, note_id: &str) -> AppResult<Vec<NoteReview>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT * FROM note_reviews WHERE note_id = ?1 AND deleted = 0 \
                 ORDER BY reviewed_at ASC",
            )
            .map_err(store_err)?;
        let rows = stmt.query([note_id]).map_err(store_err)?;
        from_rows::<NoteReviewRow>(rows)
            .map(|row| row.map(NoteReview::from).map_err(serde_err))
            .collect()
    }

    /// Every note's convictions, oldest first, in one query for the list view.
    pub fn convictions_by_note(&self) -> AppResult<HashMap<String, Vec<i64>>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT note_id, conviction FROM note_reviews WHERE deleted = 0 \
                 ORDER BY reviewed_at ASC",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(store_err)?;
        let mut by_note: HashMap<String, Vec<i64>> = HashMap::new();
        for row in rows {
            let (note_id, conviction) = row.map_err(store_err)?;
            by_note.entry(note_id).or_default().push(conviction);
        }
        Ok(by_note)
    }

    pub fn insert(
        &self,
        note_id: &str,
        conviction: i64,
        comment: Option<&str>,
    ) -> AppResult<NoteReview> {
        let review = NoteReview {
            id: Uuid::new_v4().to_string(),
            note_id: note_id.to_string(),
            conviction,
            comment: comment.map(str::to_string),
            reviewed_at: Utc::now().to_rfc3339(),
        };
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO note_reviews (id, note_id, conviction, comment, reviewed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                review.id,
                review.note_id,
                review.conviction,
                review.comment,
                review.reviewed_at
            ],
        )
        .map_err(store_err)?;
        Ok(review)
    }

    /// Tombstone every live review of a note. Returns the affected ids for stamping.
    pub fn delete_for_note(&self, note_id: &str) -> AppResult<Vec<String>> {
        let conn = self.db.lock()?;
        let ids = {
            let mut stmt = conn
                .prepare("SELECT id FROM note_reviews WHERE note_id = ?1 AND deleted = 0")
                .map_err(store_err)?;
            let rows = stmt
                .query_map([note_id], |row| row.get::<_, String>(0))
                .map_err(store_err)?;
            rows.collect::<Result<Vec<String>, _>>()
                .map_err(store_err)?
        };
        conn.execute(
            "UPDATE note_reviews SET deleted = 1 WHERE note_id = ?1 AND deleted = 0",
            [note_id],
        )
        .map_err(store_err)?;
        Ok(ids)
    }

    pub fn merge(&self, id: &str, clock: &Clock, body: &NoteReviewBody) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO note_reviews (id, note_id, conviction, comment, reviewed_at, deleted, \
             hlc_physical, hlc_counter, hlc_node_id, dirty) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0) \
             ON CONFLICT(id) DO UPDATE SET \
             note_id = excluded.note_id, conviction = excluded.conviction, \
             comment = excluded.comment, reviewed_at = excluded.reviewed_at, \
             deleted = excluded.deleted, hlc_physical = excluded.hlc_physical, \
             hlc_counter = excluded.hlc_counter, hlc_node_id = excluded.hlc_node_id, dirty = 0 \
             WHERE (note_reviews.hlc_physical, note_reviews.hlc_counter, \
             note_reviews.hlc_node_id) \
             < (excluded.hlc_physical, excluded.hlc_counter, excluded.hlc_node_id)",
            params![
                id,
                body.note_id,
                body.conviction,
                body.comment,
                body.reviewed_at,
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

impl SyncedRepository for NoteReviewsRepository {
    fn list_dirty(&self) -> AppResult<Vec<LocalChange>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM note_reviews WHERE dirty = 1")
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
                    body: RecordBody::NoteReview(NoteReviewBody {
                        note_id: row.get("note_id")?,
                        conviction: row.get("conviction")?,
                        comment: row.get("comment")?,
                        reviewed_at: row.get("reviewed_at")?,
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
                "UPDATE note_reviews SET dirty = 0 WHERE id = ?1 AND hlc_physical = ?2 \
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
            "UPDATE note_reviews SET hlc_physical = ?1, hlc_counter = ?2, hlc_node_id = ?3, \
             dirty = 1 WHERE id = ?4",
            params![physical, counter, node_id, id],
        )
        .map_err(store_err)?;
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
struct NoteReviewRow {
    id: String,
    note_id: String,
    conviction: i64,
    comment: Option<String>,
    reviewed_at: String,
}

impl From<NoteReviewRow> for NoteReview {
    fn from(row: NoteReviewRow) -> Self {
        Self {
            id: row.id,
            note_id: row.note_id,
            conviction: row.conviction,
            comment: row.comment,
            reviewed_at: row.reviewed_at,
        }
    }
}
