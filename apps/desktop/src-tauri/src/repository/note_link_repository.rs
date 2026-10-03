//! Note-link persistence: the [`NoteLinkRepository`]. Links are append-only rows like
//! reviews and revisions: removing one tombstones it, so concurrent edits on two devices
//! never overwrite each other.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_rusqlite::from_rows;
use uuid::Uuid;

use crate::core::error::AppResult;
use crate::core::models::{Evidence, NoteLink, NoteRelation};
use crate::core::wire::{Clock, LocalChange, NoteLinkBody, RecordBody};

use super::db::{serde_err, store_err, Db};

#[derive(Clone)]
pub struct NoteLinkRepository {
    db: Arc<Db>,
}

impl NoteLinkRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// Every live link touching a note, in either direction, oldest first.
    pub fn list_for_note(&self, note_id: &str) -> AppResult<Vec<NoteLink>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT * FROM note_links WHERE deleted = 0 \
                 AND (from_note_id = ?1 OR to_note_id = ?1) ORDER BY created_at ASC",
            )
            .map_err(store_err)?;
        let rows = stmt.query([note_id]).map_err(store_err)?;
        from_rows::<NoteLinkRow>(rows)
            .map(|row| row.map(NoteLink::from).map_err(serde_err))
            .collect()
    }

    /// Whether a live link already joins the two notes, in either direction.
    pub fn exists_between(&self, a: &str, b: &str) -> AppResult<bool> {
        let conn = self.db.lock()?;
        let found: Option<String> = conn
            .query_row(
                "SELECT id FROM note_links WHERE deleted = 0 AND \
                 ((from_note_id = ?1 AND to_note_id = ?2) OR \
                 (from_note_id = ?2 AND to_note_id = ?1))",
                params![a, b],
                |row| row.get(0),
            )
            .optional()
            .map_err(store_err)?;
        Ok(found.is_some())
    }

    /// Every note's evidence in one query: incoming `supports` / `contradicts`, and
    /// `related` counted on both ends.
    pub fn evidence_by_note(&self) -> AppResult<HashMap<String, Evidence>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT from_note_id, to_note_id, relation FROM note_links WHERE deleted = 0")
            .map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(store_err)?;
        let mut evidence: HashMap<String, Evidence> = HashMap::new();
        for row in rows {
            let (from, to, relation) = row.map_err(store_err)?;
            match NoteRelation::from_stored(&relation) {
                NoteRelation::Supports => evidence.entry(to).or_default().supports += 1,
                NoteRelation::Contradicts => evidence.entry(to).or_default().contradicts += 1,
                NoteRelation::Related => {
                    evidence.entry(from).or_default().related += 1;
                    evidence.entry(to).or_default().related += 1;
                }
            }
        }
        Ok(evidence)
    }

    pub fn insert(&self, from: &str, to: &str, relation: NoteRelation) -> AppResult<NoteLink> {
        let link = NoteLink {
            id: Uuid::new_v4().to_string(),
            from_note_id: from.to_string(),
            to_note_id: to.to_string(),
            relation,
            created_at: Utc::now().to_rfc3339(),
        };
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO note_links (id, from_note_id, to_note_id, relation, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                link.id,
                link.from_note_id,
                link.to_note_id,
                link.relation.as_str(),
                link.created_at
            ],
        )
        .map_err(store_err)?;
        Ok(link)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("UPDATE note_links SET deleted = 1 WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }

    /// Tombstone every live link touching a note. Returns the affected ids for stamping.
    pub fn delete_for_note(&self, note_id: &str) -> AppResult<Vec<String>> {
        let conn = self.db.lock()?;
        let ids = {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM note_links WHERE deleted = 0 \
                     AND (from_note_id = ?1 OR to_note_id = ?1)",
                )
                .map_err(store_err)?;
            let rows = stmt
                .query_map([note_id], |row| row.get::<_, String>(0))
                .map_err(store_err)?;
            rows.collect::<Result<Vec<String>, _>>()
                .map_err(store_err)?
        };
        conn.execute(
            "UPDATE note_links SET deleted = 1 WHERE deleted = 0 \
             AND (from_note_id = ?1 OR to_note_id = ?1)",
            [note_id],
        )
        .map_err(store_err)?;
        Ok(ids)
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
            "UPDATE note_links SET hlc_physical = ?1, hlc_counter = ?2, hlc_node_id = ?3, \
             dirty = 1 WHERE id = ?4",
            params![physical, counter, node_id, id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn list_dirty(&self) -> AppResult<Vec<LocalChange>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM note_links WHERE dirty = 1")
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
                    body: RecordBody::NoteLink(NoteLinkBody {
                        from_note_id: row.get("from_note_id")?,
                        to_note_id: row.get("to_note_id")?,
                        relation: row.get("relation")?,
                        created_at: row.get("created_at")?,
                        deleted: row.get("deleted")?,
                    }),
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(store_err)
    }

    pub fn merge(&self, id: &str, clock: &Clock, body: &NoteLinkBody) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO note_links (id, from_note_id, to_note_id, relation, created_at, \
             deleted, hlc_physical, hlc_counter, hlc_node_id, dirty) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0) \
             ON CONFLICT(id) DO UPDATE SET \
             from_note_id = excluded.from_note_id, to_note_id = excluded.to_note_id, \
             relation = excluded.relation, created_at = excluded.created_at, \
             deleted = excluded.deleted, hlc_physical = excluded.hlc_physical, \
             hlc_counter = excluded.hlc_counter, hlc_node_id = excluded.hlc_node_id, dirty = 0 \
             WHERE (note_links.hlc_physical, note_links.hlc_counter, note_links.hlc_node_id) \
             < (excluded.hlc_physical, excluded.hlc_counter, excluded.hlc_node_id)",
            params![
                id,
                body.from_note_id,
                body.to_note_id,
                body.relation,
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

    pub fn clear_dirty(&self, changes: &[LocalChange]) -> AppResult<()> {
        let conn = self.db.lock()?;
        for change in changes {
            conn.execute(
                "UPDATE note_links SET dirty = 0 WHERE id = ?1 AND hlc_physical = ?2 \
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

#[derive(Serialize, Deserialize)]
struct NoteLinkRow {
    id: String,
    from_note_id: String,
    to_note_id: String,
    relation: String,
    created_at: String,
}

impl From<NoteLinkRow> for NoteLink {
    fn from(row: NoteLinkRow) -> Self {
        Self {
            id: row.id,
            from_note_id: row.from_note_id,
            to_note_id: row.to_note_id,
            relation: NoteRelation::from_stored(&row.relation),
            created_at: row.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository() -> NoteLinkRepository {
        NoteLinkRepository::new(Arc::new(Db::open_in_memory().unwrap()))
    }

    #[test]
    fn evidence_counts_incoming_support_and_contradiction_and_both_ends_of_related() {
        let links = repository();
        links
            .insert("source-a", "idea", NoteRelation::Supports)
            .unwrap();
        links
            .insert("source-b", "idea", NoteRelation::Supports)
            .unwrap();
        links
            .insert("thought", "idea", NoteRelation::Contradicts)
            .unwrap();
        links
            .insert("idea", "other", NoteRelation::Related)
            .unwrap();

        let evidence = links.evidence_by_note().unwrap();
        assert_eq!(
            evidence["idea"],
            Evidence {
                supports: 2,
                contradicts: 1,
                related: 1
            }
        );
        assert_eq!(evidence["other"].related, 1);
        // Supporting something isn't evidence for the supporter itself.
        assert!(!evidence.contains_key("source-a"));
    }

    #[test]
    fn deleting_a_note_removes_its_links_in_both_directions() {
        let links = repository();
        links.insert("a", "b", NoteRelation::Supports).unwrap();
        links.insert("c", "a", NoteRelation::Related).unwrap();
        links.insert("c", "b", NoteRelation::Related).unwrap();
        assert_eq!(links.delete_for_note("a").unwrap().len(), 2);
        assert!(!links.exists_between("a", "b").unwrap());
        assert!(links.exists_between("b", "c").unwrap());
    }
}
