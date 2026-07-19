use std::path::Path;
use std::sync::Mutex;

use chrono::Utc;
use keyring::Entry;
use rusqlite::{params, Connection, Row};
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{CaptureSource, NewTask, Task};

use super::TaskStore;

/// SQLCipher-backed task store — AES-256 encrypted at rest (step 4 of the capture
/// data flow). The passphrase comes from the OS keychain, so the database file is
/// unreadable without it.
pub struct SqliteTaskStore {
    // rusqlite's Connection is Send but not Sync; the Mutex makes the store
    // shareable across Tauri's command threads.
    conn: Mutex<Connection>,
}

impl SqliteTaskStore {
    pub fn open(path: &Path) -> AppResult<Self> {
        let key = load_or_create_db_key()?;
        let conn = Connection::open(path).map_err(store_err)?;
        // The key pragma must run before any other statement touches the DB.
        conn.pragma_update(None, "key", &key).map_err(store_err)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .map_err(store_err)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks (
                id           TEXT PRIMARY KEY,
                text         TEXT NOT NULL,
                status       TEXT NOT NULL,
                app_id       TEXT NOT NULL,
                app_name     TEXT NOT NULL,
                window_title TEXT NOT NULL,
                captured_at  TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL,
                improved     INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .map_err(store_err)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

impl TaskStore for SqliteTaskStore {
    fn list(&self) -> AppResult<Vec<Task>> {
        let conn = self.conn.lock().map_err(lock_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, text, status, app_id, app_name, window_title, captured_at, \
                 created_at, updated_at, improved FROM tasks ORDER BY created_at DESC",
            )
            .map_err(store_err)?;
        let tasks = stmt
            .query_map([], row_to_task)
            .map_err(store_err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(store_err)?;
        Ok(tasks)
    }
    fn insert(&self, new: NewTask) -> AppResult<Task> {
        let now = Utc::now().to_rfc3339();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            text: new.text,
            status: "inbox".to_string(),
            improved: new.improved,
            source: new.source,
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = self.conn.lock().map_err(lock_err)?;
        conn.execute(
            "INSERT INTO tasks (id, text, status, app_id, app_name, window_title, \
             captured_at, created_at, updated_at, improved) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                task.id,
                task.text,
                task.status,
                task.source.app_id,
                task.source.app_name,
                task.source.window_title,
                task.source.captured_at,
                task.created_at,
                task.updated_at,
                task.improved,
            ],
        )
        .map_err(store_err)?;
        Ok(task)
    }

    fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().map_err(lock_err)?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }

    fn mark_improved(&self, id: &str, text: &str) -> AppResult<Task> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(lock_err)?;
        let changed = conn
            .execute(
                "UPDATE tasks SET text = ?1, improved = 1, updated_at = ?2 WHERE id = ?3",
                params![text, now, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store(format!("task {id} not found")));
        }
        conn.query_row(
            "SELECT id, text, status, app_id, app_name, window_title, captured_at, \
             created_at, updated_at, improved FROM tasks WHERE id = ?1",
            [id],
            row_to_task,
        )
        .map_err(store_err)
    }
}

fn row_to_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        text: row.get(1)?,
        status: row.get(2)?,
        source: CaptureSource {
            app_id: row.get(3)?,
            app_name: row.get(4)?,
            window_title: row.get(5)?,
            captured_at: row.get(6)?,
        },
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        improved: row.get(9)?,
    })
}

fn store_err(e: rusqlite::Error) -> AppError {
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
