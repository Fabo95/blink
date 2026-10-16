//! The device-local list of archived Incoming items: the [`IncomingDismissalsRepository`]. One
//! row per item the user archived, with the item's source-side `updated_at` at that moment.
//! Never synced.

use std::collections::HashMap;
use std::sync::Arc;

use rusqlite::params;

use crate::core::error::AppResult;
use crate::database::{store_err, Db};

#[derive(Clone)]
pub struct IncomingDismissalsRepository {
    db: Arc<Db>,
}

impl IncomingDismissalsRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn dismiss(&self, id: &str, updated_at: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO incoming_dismissals (id, updated_at) VALUES (?1, ?2) \
             ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
            params![id, updated_at],
        )
        .map_err(store_err)?;
        Ok(())
    }

    /// Every dismissal, as id → the item's `updated_at` when it was archived.
    pub fn all(&self) -> AppResult<HashMap<String, String>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT id, updated_at FROM incoming_dismissals")
            .map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(store_err)?;
        rows.map(|row| row.map_err(store_err)).collect()
    }

    /// Forget dismissals whose item is no longer at the source, so the table doesn't grow
    /// forever. An item that returns later is new again, which is what we want.
    pub fn retain(&self, ids: &[String]) -> AppResult<()> {
        let conn = self.db.lock()?;
        let keep: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
        let existing: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT id FROM incoming_dismissals")
                .map_err(store_err)?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(store_err)?;
            rows.collect::<Result<_, _>>().map_err(store_err)?
        };
        for id in existing.iter().filter(|id| !keep.contains(id.as_str())) {
            conn.execute("DELETE FROM incoming_dismissals WHERE id = ?1", params![id])
                .map_err(store_err)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> IncomingDismissalsRepository {
        IncomingDismissalsRepository::new(Arc::new(Db::open_in_memory().expect("db")))
    }

    #[test]
    fn dismiss_upserts_and_retain_forgets_the_rest() {
        let repo = repo();
        repo.dismiss("github:1", "2026-10-01T00:00:00Z")
            .expect("dismiss");
        repo.dismiss("github:1", "2026-10-02T00:00:00Z")
            .expect("re-dismiss");
        repo.dismiss("github:2", "2026-10-01T00:00:00Z")
            .expect("dismiss");
        assert_eq!(repo.all().expect("all")["github:1"], "2026-10-02T00:00:00Z");

        repo.retain(&["github:2".to_string()]).expect("retain");
        let all = repo.all().expect("all");
        assert_eq!(all.len(), 1);
        assert!(all.contains_key("github:2"));
    }
}
