//! Ordered, versioned schema migrations, applied on open. Append new `M::up(...)`
//! entries as the schema grows; never edit or reorder the existing ones.

use rusqlite_migration::{Migrations, M};

pub(super) fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            "CREATE TABLE IF NOT EXISTS tasks (
                id           TEXT PRIMARY KEY,
                text         TEXT NOT NULL,
           ^     status       TEXT NOT NULL,
                app_id       TEXT NOT NULL,
                app_name     TEXT NOT NULL,
                window_title TEXT NOT NULL,
                captured_at  TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL,
                improved     INTEGER NOT NULL DEFAULT 0
            );",
        ),
        M::up(
            "CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        ),
        M::up("ALTER TABLE tasks ADD COLUMN link TEXT;"),
        M::up(
            "ALTER TABLE tasks ADD COLUMN completed_at TEXT;
             UPDATE tasks SET completed_at = updated_at WHERE status = 'done';",
        ),
    ])
}
