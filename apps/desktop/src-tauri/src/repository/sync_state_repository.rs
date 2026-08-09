//! The `sync_state` table — device-local sync bookkeeping (the node id, the clock's
//! last stamp, and later the pull cursor). A key/value store like `settings`, but
//! kept separate because none of it ever syncs: it's this device's private state.
//! [`HlcService`](crate::services::hlc_service::HlcService) fronts it for the clock.

use std::sync::Arc;

use rusqlite::OptionalExtension;

use crate::core::error::AppResult;

use super::db::{store_err, Db};

#[derive(Clone)]
pub struct SyncStateRepository {
    db: Arc<Db>,
}

impl SyncStateRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// The value for `key`, or `None` if it was never set.
    pub fn get(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.db.lock()?;
        conn.query_row("SELECT value FROM sync_state WHERE key = ?1", [key], |row| row.get(0))
            .optional()
            .map_err(store_err)
    }

    /// Insert or replace the value for `key`.
    pub fn set(&self, key: &str, value: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO sync_state (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [key, value],
        )
        .map_err(store_err)?;
        Ok(())
    }
}
