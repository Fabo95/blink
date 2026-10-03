//! The device-local egress log: the [`EgressRepository`]. One row per thing that left the
//! device (an AI call, a page fetch): kind, destination host, size. Never the content, and
//! never synced: it answers "what left this Mac".

use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_rusqlite::from_rows;
use uuid::Uuid;

use crate::core::error::AppResult;
use crate::core::models::{EgressEvent, EgressKind};

use super::db::{serde_err, store_err, Db};

#[derive(Clone)]
pub struct EgressRepository {
    db: Arc<Db>,
}

impl EgressRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn insert(
        &self,
        kind: EgressKind,
        destination: &str,
        note_id: Option<&str>,
        bytes: i64,
    ) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO egress_events (id, kind, destination, note_id, bytes, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                kind.as_str(),
                destination,
                note_id,
                bytes,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(store_err)?;
        Ok(())
    }

    /// The most recent events, newest first.
    pub fn list_recent(&self, limit: i64) -> AppResult<Vec<EgressEvent>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM egress_events ORDER BY created_at DESC LIMIT ?1")
            .map_err(store_err)?;
        let rows = stmt.query([limit]).map_err(store_err)?;
        from_rows::<EgressRow>(rows)
            .map(|row| row.map(EgressEvent::from).map_err(serde_err))
            .collect()
    }
}

#[derive(Serialize, Deserialize)]
struct EgressRow {
    id: String,
    kind: String,
    destination: String,
    note_id: Option<String>,
    bytes: i64,
    created_at: String,
}

impl From<EgressRow> for EgressEvent {
    fn from(row: EgressRow) -> Self {
        Self {
            id: row.id,
            kind: EgressKind::from_stored(&row.kind),
            destination: row.destination,
            note_id: row.note_id,
            bytes: row.bytes,
            created_at: row.created_at,
        }
    }
}
