//! App settings — a simple key/value table for user preferences (the capture
//! shortcut today; theme, AI toggle, … later). Shares the same [`Db`] as the other
//! repositories.

use std::sync::Arc;

use rusqlite::OptionalExtension;

use crate::core::error::AppResult;

use super::db::{store_err, Db};

pub struct SettingsRepository {
    db: Arc<Db>,
}

impl SettingsRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// The value for `key`, or `None` if it was never set.
    pub fn get(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.db.lock()?;
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(store_err)
    }

    /// Insert or replace the value for `key`.
    pub fn set(&self, key: &str, value: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [key, value],
        )
        .map_err(store_err)?;
        Ok(())
    }
}
