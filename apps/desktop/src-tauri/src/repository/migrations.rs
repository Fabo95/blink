//! Ordered, versioned schema migrations, applied on open. Append new `M::up(...)`
//! entries as the schema grows; never edit or reorder the existing ones.

use rusqlite_migration::{Migrations, M};

pub(super) fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
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
        // Manual inbox ordering. Higher `position` sorts first; seed from rowid so existing
        // rows keep their insertion order (newest on top).
        M::up(
            "ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
             UPDATE tasks SET position = rowid;",
        ),
        // User-defined task groups; a task belongs to at most one. ON DELETE SET NULL
        // is legal on ADD COLUMN because the column's default is NULL.
        M::up(
            "CREATE TABLE IF NOT EXISTS task_groups (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            ALTER TABLE tasks ADD COLUMN task_group_id TEXT \
                REFERENCES task_groups(id) ON DELETE SET NULL;",
        ),
        // The immutable captured text, frozen at capture. Backfill from `text` so the
        // prompt action works uniformly on tasks that predate this column.
        M::up(
            "ALTER TABLE tasks ADD COLUMN raw_text TEXT NOT NULL DEFAULT '';
             UPDATE tasks SET raw_text = text;",
        ),
        // Sync tracking. Each synced row carries a Hybrid Logical Clock (edit-time
        // ordering for last-write-wins), a `dirty` flag (has local changes to push),
        // and a `deleted` tombstone (so a delete can propagate; the delete→tombstone
        // behavior itself lands with the sync loop). `sync_state` is device-local
        // bookkeeping (node id, pull cursor) that never syncs. Existing rows default
        // to dirty=1 so the first sync pushes them; their hlc stays 0/'' until the
        // next edit or the first push stamps them.
        M::up(
            "CREATE TABLE IF NOT EXISTS sync_state (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ALTER TABLE tasks ADD COLUMN hlc_physical INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE tasks ADD COLUMN hlc_counter  INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE tasks ADD COLUMN hlc_node_id  TEXT    NOT NULL DEFAULT '';
            ALTER TABLE tasks ADD COLUMN dirty        INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE tasks ADD COLUMN deleted      INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE task_groups ADD COLUMN hlc_physical INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE task_groups ADD COLUMN hlc_counter  INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE task_groups ADD COLUMN hlc_node_id  TEXT    NOT NULL DEFAULT '';
            ALTER TABLE task_groups ADD COLUMN dirty        INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE task_groups ADD COLUMN deleted      INTEGER NOT NULL DEFAULT 0;",
        ),
    ])
}
