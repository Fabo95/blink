//! Note persistence: the [`NoteRepository`] over the shared [`Db`](super::Db), including the
//! FTS5 search and the sync merge that detects a pulled edit overwriting an unsynced local
//! one.

use std::sync::Arc;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_rusqlite::{from_rows, to_params_named};
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{CaptureSource, NewNote, Note, NoteStatus, NoteType};
use crate::core::wire::{Clock, LocalChange, NoteBody, RecordBody};

use super::db::{serde_err, store_err, Db};

/// Search results are capped: the page shows a short ranked list, not an archive.
const SEARCH_LIMIT: i64 = 200;

/// A partial note edit: every `Some` field is written, `None` leaves it untouched. An empty
/// `link` or `topic_id` clears the stored value, like `TaskPatch`.
#[derive(Default)]
pub struct NotePatch {
    pub text: Option<String>,
    pub note_type: Option<NoteType>,
    pub link: Option<String>,
    pub topic_id: Option<String>,
    pub improved: Option<bool>,
    pub source_name: Option<String>,
}

#[derive(Clone)]
pub struct NoteRepository {
    db: Arc<Db>,
}

impl NoteRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn list(&self) -> AppResult<Vec<Note>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM notes WHERE deleted = 0 ORDER BY created_at DESC")
            .map_err(store_err)?;
        let rows = stmt.query([]).map_err(store_err)?;
        from_rows::<NoteRow>(rows)
            .map(|row| row.map(Note::from).map_err(serde_err))
            .collect()
    }

    pub fn get(&self, id: &str) -> AppResult<Note> {
        let conn = self.db.lock()?;
        fetch_one(&conn, id)
    }

    /// Insert a captured note. `revisit_at` is its first review date, decided by the caller
    /// (scheduling is a review rule, not a storage one).
    pub fn insert(&self, new: NewNote, revisit_at: Option<String>) -> AppResult<Note> {
        let now = Utc::now().to_rfc3339();
        let raw_text = if new.raw_text.trim().is_empty() {
            new.text.clone()
        } else {
            new.raw_text
        };
        let note = Note {
            id: Uuid::new_v4().to_string(),
            note_type: new.note_type,
            text: new.text,
            raw_text,
            link: new.link,
            topic_id: new.topic_id,
            improved: new.improved,
            conflict: false,
            status: NoteStatus::Open,
            revisit_at,
            conviction_history: Vec::new(),
            review_nudge: None,
            source: new.source,
            created_at: now.clone(),
            updated_at: now,
        };
        let params = to_params_named(NoteRow::from(&note)).map_err(serde_err)?;
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO notes (id, note_type, text, raw_text, link, topic_id, improved, \
             conflict, status, revisit_at, app_id, app_name, window_title, captured_at, \
             created_at, updated_at) \
             VALUES (:id, :note_type, :text, :raw_text, :link, :topic_id, :improved, \
             :conflict, :status, :revisit_at, :app_id, :app_name, :window_title, :captured_at, \
             :created_at, :updated_at)",
            params.to_slice().as_slice(),
        )
        .map_err(store_err)?;
        Ok(note)
    }

    pub fn update(&self, id: &str, patch: NotePatch) -> AppResult<Note> {
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock()?;

        if let Some(text) = patch.text {
            conn.execute(
                "UPDATE notes SET text = ?1, updated_at = ?2 WHERE id = ?3",
                params![text, now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(note_type) = patch.note_type {
            conn.execute(
                "UPDATE notes SET note_type = ?1, updated_at = ?2 WHERE id = ?3",
                params![note_type.as_str(), now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(improved) = patch.improved {
            conn.execute(
                "UPDATE notes SET improved = ?1, updated_at = ?2 WHERE id = ?3",
                params![improved, now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(link) = patch.link {
            conn.execute(
                "UPDATE notes SET link = ?1, updated_at = ?2 WHERE id = ?3",
                params![non_empty(&link), now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(topic_id) = patch.topic_id {
            conn.execute(
                "UPDATE notes SET topic_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![non_empty(&topic_id), now, id],
            )
            .map_err(store_err)?;
        }
        if let Some(source_name) = patch.source_name {
            conn.execute(
                "UPDATE notes SET app_name = ?1, updated_at = ?2 WHERE id = ?3",
                params![source_name, now, id],
            )
            .map_err(store_err)?;
        }

        fetch_one(&conn, id)
    }

    /// Soft-delete (tombstone) so the deletion syncs; the service stamps it afterwards.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("UPDATE notes SET deleted = 1 WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }

    /// Record a review's effect on the note: its status and next review date.
    pub fn set_review_state(
        &self,
        id: &str,
        status: NoteStatus,
        revisit_at: Option<&str>,
    ) -> AppResult<Note> {
        let conn = self.db.lock()?;
        conn.execute(
            "UPDATE notes SET status = ?1, revisit_at = ?2, updated_at = ?3 WHERE id = ?4",
            params![status.as_str(), revisit_at, Utc::now().to_rfc3339(), id],
        )
        .map_err(store_err)?;
        fetch_one(&conn, id)
    }

    /// Ideas and thoughts that are due for review at `now`, most overdue first. Dropped notes
    /// and sources are never due. Dates compare through `julianday`, so stored timestamps
    /// with different (valid) offsets or precision still order correctly.
    pub fn list_due(&self, now: &str) -> AppResult<Vec<Note>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT * FROM notes WHERE deleted = 0 AND status != 'dropped' \
                 AND note_type IN ('idea', 'thought') AND revisit_at IS NOT NULL \
                 AND julianday(revisit_at) <= julianday(?1) \
                 ORDER BY julianday(revisit_at) ASC",
            )
            .map_err(store_err)?;
        let rows = stmt.query([now]).map_err(store_err)?;
        from_rows::<NoteRow>(rows)
            .map(|row| row.map(Note::from).map_err(serde_err))
            .collect()
    }

    /// Move every live note of a topic back to unfiled. Returns the affected ids so the
    /// service can stamp them for sync.
    pub fn unfile_topic(&self, topic_id: &str) -> AppResult<Vec<String>> {
        let conn = self.db.lock()?;
        let ids = live_ids_in_topic(&conn, topic_id)?;
        conn.execute(
            "UPDATE notes SET topic_id = NULL, updated_at = ?1 \
             WHERE topic_id = ?2 AND deleted = 0",
            params![Utc::now().to_rfc3339(), topic_id],
        )
        .map_err(store_err)?;
        Ok(ids)
    }

    /// Tombstone every live note of a topic. Returns the affected ids.
    pub fn delete_in_topic(&self, topic_id: &str) -> AppResult<Vec<String>> {
        let conn = self.db.lock()?;
        let ids = live_ids_in_topic(&conn, topic_id)?;
        conn.execute(
            "UPDATE notes SET deleted = 1 WHERE topic_id = ?1 AND deleted = 0",
            [topic_id],
        )
        .map_err(store_err)?;
        Ok(ids)
    }

    /// Full-text search over text, raw text, and link, best match first.
    pub fn search(&self, query: &str) -> AppResult<Vec<Note>> {
        let Some(fts_query) = fts_query(query) else {
            return Ok(Vec::new());
        };
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT notes.* FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid \
                 WHERE notes_fts MATCH ?1 AND notes.deleted = 0 ORDER BY rank LIMIT ?2",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query(params![fts_query, SEARCH_LIMIT])
            .map_err(store_err)?;
        from_rows::<NoteRow>(rows)
            .map(|row| row.map(Note::from).map_err(serde_err))
            .collect()
    }

    /// The user has seen the conflict (opened the history); drop the device-local marker.
    pub fn clear_conflict(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("UPDATE notes SET conflict = 0 WHERE id = ?1", [id])
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
            "UPDATE notes SET hlc_physical = ?1, hlc_counter = ?2, hlc_node_id = ?3, dirty = 1 \
             WHERE id = ?4",
            params![physical, counter, node_id, id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn list_dirty(&self) -> AppResult<Vec<LocalChange>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM notes WHERE dirty = 1")
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
                    body: RecordBody::Note(NoteBody {
                        note_type: row.get("note_type")?,
                        text: row.get("text")?,
                        raw_text: row.get("raw_text")?,
                        link: row.get("link")?,
                        topic_id: row.get("topic_id")?,
                        improved: row.get("improved")?,
                        app_id: row.get("app_id")?,
                        app_name: row.get("app_name")?,
                        window_title: row.get("window_title")?,
                        captured_at: row.get("captured_at")?,
                        created_at: row.get("created_at")?,
                        updated_at: row.get("updated_at")?,
                        deleted: row.get("deleted")?,
                        status: row.get("status")?,
                        revisit_at: row.get("revisit_at")?,
                    }),
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(store_err)
    }

    /// Merge a pulled note (LWW). Returns the local text the merge overwrote when that text
    /// was an unsynced edit (the row was dirty) and differs from the incoming text, so the
    /// caller can keep it as a conflict revision. Such a row is also flagged `conflict`.
    pub fn merge(&self, id: &str, clock: &Clock, body: &NoteBody) -> AppResult<Option<String>> {
        let conn = self.db.lock()?;
        let local: Option<(bool, String, i64, i64, String)> = conn
            .query_row(
                "SELECT dirty, text, hlc_physical, hlc_counter, hlc_node_id FROM notes \
                 WHERE id = ?1",
                [id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .optional()
            .map_err(store_err)?;

        let lost_text = match &local {
            Some((dirty, text, physical, counter, node_id)) => {
                let incoming_wins = (clock.physical, clock.counter, clock.node_id.as_str())
                    > (*physical, *counter, node_id.as_str());
                (*dirty && incoming_wins && !body.deleted && *text != body.text)
                    .then(|| text.clone())
            }
            None => None,
        };

        conn.execute(
            "INSERT INTO notes (id, note_type, text, raw_text, link, topic_id, improved, \
             app_id, app_name, window_title, captured_at, created_at, updated_at, deleted, \
             hlc_physical, hlc_counter, hlc_node_id, status, revisit_at, dirty) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, \
             ?17, ?18, ?19, 0) \
             ON CONFLICT(id) DO UPDATE SET \
             note_type = excluded.note_type, text = excluded.text, \
             raw_text = excluded.raw_text, link = excluded.link, topic_id = excluded.topic_id, \
             improved = excluded.improved, app_id = excluded.app_id, \
             app_name = excluded.app_name, window_title = excluded.window_title, \
             captured_at = excluded.captured_at, created_at = excluded.created_at, \
             updated_at = excluded.updated_at, deleted = excluded.deleted, \
             hlc_physical = excluded.hlc_physical, hlc_counter = excluded.hlc_counter, \
             hlc_node_id = excluded.hlc_node_id, status = excluded.status, \
             revisit_at = excluded.revisit_at, dirty = 0 \
             WHERE (notes.hlc_physical, notes.hlc_counter, notes.hlc_node_id) \
             < (excluded.hlc_physical, excluded.hlc_counter, excluded.hlc_node_id)",
            params![
                id,
                body.note_type,
                body.text,
                body.raw_text,
                body.link,
                body.topic_id,
                body.improved,
                body.app_id,
                body.app_name,
                body.window_title,
                body.captured_at,
                body.created_at,
                body.updated_at,
                body.deleted,
                clock.physical,
                clock.counter,
                clock.node_id,
                body.status,
                body.revisit_at
            ],
        )
        .map_err(store_err)?;

        if lost_text.is_some() {
            conn.execute("UPDATE notes SET conflict = 1 WHERE id = ?1", [id])
                .map_err(store_err)?;
        }
        Ok(lost_text)
    }

    pub fn clear_dirty(&self, changes: &[LocalChange]) -> AppResult<()> {
        let conn = self.db.lock()?;
        for change in changes {
            conn.execute(
                "UPDATE notes SET dirty = 0 WHERE id = ?1 AND hlc_physical = ?2 \
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

/// Turn free text into a safe FTS5 query: split on anything that isn't a letter or digit
/// (the same boundaries the default tokenizer uses), then make each word a quoted prefix
/// term, all of them required. Quoted alphanumerics can't form FTS5 operator syntax, so
/// user input can never produce a query error. `None` when there's nothing to search for.
fn fts_query(input: &str) -> Option<String> {
    let terms: Vec<String> = input
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(|word| format!("\"{word}\"*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

fn non_empty(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn live_ids_in_topic(conn: &Connection, topic_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT id FROM notes WHERE topic_id = ?1 AND deleted = 0")
        .map_err(store_err)?;
    let rows = stmt
        .query_map([topic_id], |row| row.get::<_, String>(0))
        .map_err(store_err)?;
    rows.collect::<Result<Vec<String>, _>>().map_err(store_err)
}

fn fetch_one(conn: &Connection, id: &str) -> AppResult<Note> {
    let mut stmt = conn
        .prepare("SELECT * FROM notes WHERE id = ?1 AND deleted = 0")
        .map_err(store_err)?;
    let rows = stmt.query([id]).map_err(store_err)?;
    let row = from_rows::<NoteRow>(rows)
        .next()
        .ok_or_else(|| AppError::Store(format!("note {id} not found")))?
        .map_err(serde_err)?;
    Ok(Note::from(row))
}

/// The flat, storage-shaped mirror of [`Note`] (the nested `source` fanned out into
/// columns). Field names must match the column names exactly.
#[derive(Serialize, Deserialize)]
struct NoteRow {
    id: String,
    note_type: String,
    text: String,
    raw_text: String,
    link: Option<String>,
    topic_id: Option<String>,
    improved: bool,
    conflict: bool,
    status: String,
    revisit_at: Option<String>,
    app_id: String,
    app_name: String,
    window_title: String,
    captured_at: String,
    created_at: String,
    updated_at: String,
}

impl From<&Note> for NoteRow {
    fn from(note: &Note) -> Self {
        Self {
            id: note.id.clone(),
            note_type: note.note_type.as_str().to_string(),
            text: note.text.clone(),
            raw_text: note.raw_text.clone(),
            link: note.link.clone(),
            topic_id: note.topic_id.clone(),
            improved: note.improved,
            conflict: note.conflict,
            status: note.status.as_str().to_string(),
            revisit_at: note.revisit_at.clone(),
            app_id: note.source.app_id.clone(),
            app_name: note.source.app_name.clone(),
            window_title: note.source.window_title.clone(),
            captured_at: note.source.captured_at.clone(),
            created_at: note.created_at.clone(),
            updated_at: note.updated_at.clone(),
        }
    }
}

impl From<NoteRow> for Note {
    fn from(row: NoteRow) -> Self {
        Self {
            id: row.id,
            note_type: NoteType::from_stored(&row.note_type),
            text: row.text,
            raw_text: row.raw_text,
            link: row.link,
            topic_id: row.topic_id,
            improved: row.improved,
            conflict: row.conflict,
            status: NoteStatus::from_stored(&row.status),
            revisit_at: row.revisit_at,
            // Reviews live in their own table; the services fill these in.
            conviction_history: Vec::new(),
            review_nudge: None,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn repository() -> NoteRepository {
        NoteRepository::new(Arc::new(Db::open_in_memory().unwrap()))
    }

    fn new_note(text: &str, topic_id: Option<&str>) -> NewNote {
        NewNote {
            note_type: NoteType::Idea,
            text: text.to_string(),
            raw_text: String::new(),
            improved: false,
            link: None,
            topic_id: topic_id.map(str::to_string),
            source: CaptureSource {
                app_id: "manual".to_string(),
                app_name: "Manual".to_string(),
                window_title: String::new(),
                captured_at: "2026-10-01T00:00:00Z".to_string(),
            },
        }
    }

    fn body(text: &str, deleted: bool) -> NoteBody {
        NoteBody {
            note_type: "idea".to_string(),
            text: text.to_string(),
            raw_text: text.to_string(),
            link: None,
            topic_id: None,
            improved: false,
            app_id: "manual".to_string(),
            app_name: "Manual".to_string(),
            window_title: String::new(),
            captured_at: "2026-10-01T00:00:00Z".to_string(),
            created_at: "2026-10-01T00:00:00Z".to_string(),
            updated_at: "2026-10-01T00:00:00Z".to_string(),
            deleted,
            status: "open".to_string(),
            revisit_at: None,
        }
    }

    impl NoteRepository {
        fn insert_now(&self, new: NewNote) -> AppResult<Note> {
            self.insert(new, None)
        }
    }

    fn clock(physical: i64) -> Clock {
        Clock {
            physical,
            counter: 0,
            node_id: "remote".to_string(),
        }
    }

    #[test]
    fn search_finds_by_prefix_and_follows_edits_and_deletes() {
        let notes = repository();
        let note = notes
            .insert_now(new_note("Agents booking restaurant tables", None))
            .unwrap();
        assert_eq!(notes.search("restau").unwrap().len(), 1);

        notes
            .update(
                &note.id,
                NotePatch {
                    text: Some("Review bottleneck".into()),
                    ..NotePatch::default()
                },
            )
            .unwrap();
        assert_eq!(notes.search("bottle").unwrap().len(), 1);
        // The frozen raw text stays indexed: a note is still found by its original wording.
        assert_eq!(notes.search("restau").unwrap().len(), 1);
        assert_eq!(notes.search("agents bottleneck").unwrap().len(), 1);
        assert!(notes.search("bottleneck missing").unwrap().is_empty());

        notes.delete(&note.id).unwrap();
        assert!(notes.search("bottle").unwrap().is_empty());
    }

    #[test]
    fn insert_falls_back_to_text_for_empty_raw_text() {
        let note = repository()
            .insert_now(new_note("typed into a blank panel", None))
            .unwrap();
        assert_eq!(note.raw_text, "typed into a blank panel");
    }

    #[test]
    fn merge_keeps_an_unsynced_local_edit_that_loses() {
        let notes = repository();
        let note = notes.insert_now(new_note("local edit", None)).unwrap();
        notes.record_change(&note.id, 100, 0, "local").unwrap();

        let lost = notes
            .merge(&note.id, &clock(200), &body("remote edit", false))
            .unwrap();
        assert_eq!(lost.as_deref(), Some("local edit"));
        let merged = notes.get(&note.id).unwrap();
        assert_eq!(merged.text, "remote edit");
        assert!(merged.conflict);
    }

    #[test]
    fn merge_reports_nothing_when_local_wins_or_was_synced() {
        let notes = repository();
        let note = notes.insert_now(new_note("local edit", None)).unwrap();
        notes.record_change(&note.id, 300, 0, "local").unwrap();
        // An older remote version loses: no overwrite, no conflict.
        assert_eq!(
            notes
                .merge(&note.id, &clock(200), &body("stale", false))
                .unwrap(),
            None
        );
        assert_eq!(notes.get(&note.id).unwrap().text, "local edit");

        // Once pushed (not dirty), a newer remote edit is a plain update, not a conflict.
        let pushed = notes.list_dirty().unwrap();
        notes.clear_dirty(&pushed).unwrap();
        assert_eq!(
            notes
                .merge(&note.id, &clock(400), &body("newer", false))
                .unwrap(),
            None
        );
        assert!(!notes.get(&note.id).unwrap().conflict);
    }

    #[test]
    fn unfile_topic_moves_only_that_topics_live_notes() {
        let notes = repository();
        let filed = notes.insert_now(new_note("filed", Some("t1"))).unwrap();
        let other = notes.insert_now(new_note("other", Some("t2"))).unwrap();
        assert_eq!(notes.unfile_topic("t1").unwrap(), vec![filed.id.clone()]);
        assert_eq!(notes.get(&filed.id).unwrap().topic_id, None);
        assert_eq!(
            notes.get(&other.id).unwrap().topic_id.as_deref(),
            Some("t2")
        );
    }

    #[test]
    fn fts_query_quotes_each_word_as_a_prefix_term() {
        assert_eq!(
            fts_query("agent booking").as_deref(),
            Some("\"agent\"* \"booking\"*")
        );
    }

    #[test]
    fn fts_query_neutralizes_operator_syntax() {
        assert_eq!(
            fts_query("a\" OR NEAR(x) * col:val").as_deref(),
            Some("\"a\"* \"OR\"* \"NEAR\"* \"x\"* \"col\"* \"val\"*")
        );
    }

    #[test]
    fn fts_query_is_none_for_blank_input() {
        assert_eq!(fts_query("   "), None);
        assert_eq!(fts_query("\"*\""), None);
    }

    #[test]
    fn list_due_returns_open_ideas_and_thoughts_past_their_date() {
        let notes = repository();
        let due = notes.insert(new_note("due idea", None), Some("2026-01-01T00:00:00Z".into())).unwrap();
        notes.insert(new_note("later idea", None), Some("2999-01-01T00:00:00Z".into())).unwrap();
        notes.insert(new_note("unscheduled", None), None).unwrap();
        let dropped = notes.insert(new_note("dropped", None), Some("2026-01-01T00:00:00Z".into())).unwrap();
        notes.set_review_state(&dropped.id, NoteStatus::Dropped, Some("2026-01-01T00:00:00Z")).unwrap();
        let mut source = new_note("a source", None);
        source.note_type = NoteType::Source;
        notes.insert(source, Some("2026-01-01T00:00:00Z".into())).unwrap();

        // An RFC 3339 "now" with an offset and nanoseconds, like chrono writes.
        let found = notes.list_due("2026-06-01T10:00:00.123456789+00:00").unwrap();
        assert_eq!(found.iter().map(|n| n.id.as_str()).collect::<Vec<_>>(), [due.id.as_str()]);
    }

    #[test]
    fn review_backfill_parses_chrono_timestamps() {
        // The migration schedules existing notes with strftime over `created_at`; check
        // SQLite reads chrono's RFC 3339 output (nanoseconds + offset).
        let db = Db::open_in_memory().unwrap();
        let conn = db.lock().unwrap();
        let backfilled: Option<String> = conn
            .query_row(
                "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', '2026-10-03T11:51:52.123456789+00:00', '+14 days')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(backfilled.as_deref(), Some("2026-10-17T11:51:52Z"));
    }
}
