//! The encrypted, migrated SQLite (SQLCipher) database — a shared connection every
//! repository (tasks, settings, …) runs against — plus the keychain passphrase and
//! the error helpers repositories share.

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use keyring::Entry;
use rusqlite::Connection;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};

use super::migrations::migrations;

/// The shared SQLCipher database handle. Opened, unlocked, and migrated once;
/// callers borrow the connection via [`Db::lock`] rather than owning it.
pub struct Db {
    // rusqlite's Connection is Send but not Sync; the Mutex makes the DB shareable
    // across Tauri's command threads.
    conn: Mutex<Connection>,
}

impl Db {
    /// Open the database at `path`, unlock it with the keychain passphrase, and
    /// apply pending migrations. The `key` pragma runs before anything else touches
    /// the DB, so the file stays AES-256 encrypted at rest.
    pub fn open(path: &Path) -> AppResult<Self> {
        let key = load_or_create_db_key()?;
        let mut conn = Connection::open(path).map_err(store_err)?;
        conn.pragma_update(None, "key", &key).map_err(store_err)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .map_err(store_err)?;
        migrations().to_latest(&mut conn).map_err(migrate_err)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Lock the connection for a query (one lock spans a whole repository method, so
    /// multi-statement operations stay consistent).
    pub(super) fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(lock_err)
    }
}

pub(super) fn store_err(e: rusqlite::Error) -> AppError {
    AppError::Store(e.to_string())
}

pub(super) fn serde_err(e: serde_rusqlite::Error) -> AppError {
    AppError::Store(e.to_string())
}

fn migrate_err(e: rusqlite_migration::Error) -> AppError {
    AppError::Store(e.to_string())
}

fn lock_err<T>(e: std::sync::PoisonError<T>) -> AppError {
    AppError::Store(e.to_string())
}

const KEYCHAIN_SERVICE: &str = "app.blink.desktop";
const KEYCHAIN_ACCOUNT: &str = "sqlcipher-db-key";

/// Fetch the SQLCipher passphrase from the OS keychain, generating and storing one
/// on first run. The key never lands on disk in plaintext; SQLCipher derives the
/// AES-256 data key from it via PBKDF2, so a stolen laptop yields only ciphertext.
fn load_or_create_db_key() -> AppResult<String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|e| AppError::Store(format!("keychain unavailable: {e}")))?;

    match entry.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => {
            let key = generate_db_key();
            entry
                .set_password(&key)
                .map_err(|e| AppError::Store(format!("could not store db key: {e}")))?;
            Ok(key)
        }
        Err(e) => Err(AppError::Store(format!("could not read db key: {e}"))),
    }
}

// Two v4 UUIDs → 64 hex chars (~244 bits of entropy). SQLCipher stretches this
// passphrase with PBKDF2, so no separate CSPRNG dependency is needed.
fn generate_db_key() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}
