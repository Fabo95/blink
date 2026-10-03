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
        // Optional per-group context, folded into the prompt-generation system prompt.
        M::up("ALTER TABLE task_groups ADD COLUMN context TEXT;"),
        // Expected effort ('quick' | 'standard' | 'deep'). Existing rows are unlabelled,
        // which is exactly 'standard' — they stay in the main inbox section.
        M::up("ALTER TABLE tasks ADD COLUMN effort TEXT NOT NULL DEFAULT 'standard';"),
        // End-to-end encryption is gone: the server now stores a readable replica
        // rather than opaque ciphertext, so server migration 0008 dropped and
        // recreated `records` (nothing could decrypt the old rows anyway). Re-mark
        // every local row dirty so the next push rebuilds the replica from this
        // device — the local DB was always the source of truth — and rewind the pull
        // cursor, which also matches the server's `seq` sequence restarting from 1.
        // Re-merging a row we still hold is a no-op under LWW, so a rewind is safe.
        M::up(
            "UPDATE tasks SET dirty = 1;
            UPDATE task_groups SET dirty = 1;
            DELETE FROM sync_state WHERE key = 'last_pulled_seq';",
        ),
        // Idea Vault: research topics. No UNIQUE on `name` (unlike task_groups): two
        // devices creating the same name would collide on merge, so uniqueness is an
        // app-level check in the repository instead.
        M::up(
            "CREATE TABLE IF NOT EXISTS topics (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                question     TEXT,
                status       TEXT NOT NULL DEFAULT 'exploring',
                sensitivity  TEXT NOT NULL DEFAULT 'personal',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL,
                hlc_physical INTEGER NOT NULL DEFAULT 0,
                hlc_counter  INTEGER NOT NULL DEFAULT 0,
                hlc_node_id  TEXT    NOT NULL DEFAULT '',
                dirty        INTEGER NOT NULL DEFAULT 1,
                deleted      INTEGER NOT NULL DEFAULT 0
            );",
        ),
        // Notes. `topic_id` has no FK on purpose: a pull can deliver a note before the
        // topic another device created for it, and a hard FK would fail that merge.
        // `conflict` is device-local (never synced). The FTS5 index is external-content
        // over `notes`, kept in step by triggers.
        M::up(
            "CREATE TABLE IF NOT EXISTS notes (
                id           TEXT PRIMARY KEY,
                note_type    TEXT NOT NULL,
                text         TEXT NOT NULL,
                raw_text     TEXT NOT NULL,
                link         TEXT,
                topic_id     TEXT,
                improved     INTEGER NOT NULL DEFAULT 0,
                conflict     INTEGER NOT NULL DEFAULT 0,
                app_id       TEXT NOT NULL,
                app_name     TEXT NOT NULL,
                window_title TEXT NOT NULL,
                captured_at  TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL,
                hlc_physical INTEGER NOT NULL DEFAULT 0,
                hlc_counter  INTEGER NOT NULL DEFAULT 0,
                hlc_node_id  TEXT    NOT NULL DEFAULT '',
                dirty        INTEGER NOT NULL DEFAULT 1,
                deleted      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS notes_topic_idx ON notes(topic_id);
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
                USING fts5(text, raw_text, link, content='notes', content_rowid='rowid');
            CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, text, raw_text, link)
                VALUES (new.rowid, new.text, new.raw_text, new.link);
            END;
            CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, text, raw_text, link)
                VALUES ('delete', old.rowid, old.text, old.raw_text, old.link);
            END;
            CREATE TRIGGER IF NOT EXISTS notes_fts_update
            AFTER UPDATE OF text, raw_text, link ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, text, raw_text, link)
                VALUES ('delete', old.rowid, old.text, old.raw_text, old.link);
                INSERT INTO notes_fts(rowid, text, raw_text, link)
                VALUES (new.rowid, new.text, new.raw_text, new.link);
            END;",
        ),
        M::up(
            "CREATE TABLE IF NOT EXISTS note_revisions (
                id           TEXT PRIMARY KEY,
                note_id      TEXT NOT NULL,
                text         TEXT NOT NULL,
                reason       TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                hlc_physical INTEGER NOT NULL DEFAULT 0,
                hlc_counter  INTEGER NOT NULL DEFAULT 0,
                hlc_node_id  TEXT    NOT NULL DEFAULT '',
                dirty        INTEGER NOT NULL DEFAULT 1,
                deleted      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS note_revisions_note_idx ON note_revisions(note_id);",
        ),
        // Note reviews. Existing ideas and thoughts get their first review 14 days after
        // capture (sources aren't reviewed on their own); rows already past that date are
        // simply due. The backfill is deterministic, so every device computes the same
        // schedule without a re-push. Reviews are append-only rows, like revisions, so they sync without
        // last-write-wins dropping one. `tasks.origin_note_id` links a promoted idea's task.
        M::up(
            "ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
            ALTER TABLE notes ADD COLUMN revisit_at TEXT;
            UPDATE notes SET revisit_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at, '+14 days')
                WHERE note_type IN ('idea', 'thought');
            CREATE TABLE IF NOT EXISTS note_reviews (
                id           TEXT PRIMARY KEY,
                note_id      TEXT NOT NULL,
                conviction   INTEGER NOT NULL,
                comment      TEXT,
                reviewed_at  TEXT NOT NULL,
                hlc_physical INTEGER NOT NULL DEFAULT 0,
                hlc_counter  INTEGER NOT NULL DEFAULT 0,
                hlc_node_id  TEXT    NOT NULL DEFAULT '',
                dirty        INTEGER NOT NULL DEFAULT 1,
                deleted      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS note_reviews_note_idx ON note_reviews(note_id);
            ALTER TABLE tasks ADD COLUMN origin_note_id TEXT;",
        ),
        // Evidence: typed note links (append-only, synced), source enrichment (title,
        // excerpt, summary; synced so other devices don't refetch), a device-local job queue
        // for the background fetch, and a device-local egress log (what left this Mac, never
        // the content). The FTS index is rebuilt to also cover a source's title and summary.
        // Existing sources with a link are queued once; the job re-checks the topic's
        // sensitivity when it runs.
        M::up(
            "ALTER TABLE notes ADD COLUMN title TEXT;
            ALTER TABLE notes ADD COLUMN excerpt TEXT;
            ALTER TABLE notes ADD COLUMN summary TEXT;
            ALTER TABLE notes ADD COLUMN enrichment TEXT NOT NULL DEFAULT 'none';
            CREATE TABLE IF NOT EXISTS note_links (
                id           TEXT PRIMARY KEY,
                from_note_id TEXT NOT NULL,
                to_note_id   TEXT NOT NULL,
                relation     TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                hlc_physical INTEGER NOT NULL DEFAULT 0,
                hlc_counter  INTEGER NOT NULL DEFAULT 0,
                hlc_node_id  TEXT    NOT NULL DEFAULT '',
                dirty        INTEGER NOT NULL DEFAULT 1,
                deleted      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS note_links_from_idx ON note_links(from_note_id);
            CREATE INDEX IF NOT EXISTS note_links_to_idx ON note_links(to_note_id);
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                kind        TEXT NOT NULL,
                note_id     TEXT NOT NULL,
                attempts    INTEGER NOT NULL DEFAULT 0,
                next_run_at TEXT NOT NULL,
                last_error  TEXT,
                UNIQUE (kind, note_id)
            );
            CREATE TABLE IF NOT EXISTS egress_events (
                id          TEXT PRIMARY KEY,
                kind        TEXT NOT NULL,
                destination TEXT NOT NULL,
                note_id     TEXT,
                bytes       INTEGER NOT NULL,
                created_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS egress_events_created_idx ON egress_events(created_at);
            DROP TRIGGER IF EXISTS notes_fts_insert;
            DROP TRIGGER IF EXISTS notes_fts_delete;
            DROP TRIGGER IF EXISTS notes_fts_update;
            DROP TABLE IF EXISTS notes_fts;
            CREATE VIRTUAL TABLE notes_fts USING fts5(
                text, raw_text, link, title, summary, content='notes', content_rowid='rowid'
            );
            CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, text, raw_text, link, title, summary)
                VALUES (new.rowid, new.text, new.raw_text, new.link, new.title, new.summary);
            END;
            CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, text, raw_text, link, title, summary)
                VALUES ('delete', old.rowid, old.text, old.raw_text, old.link, old.title,
                    old.summary);
            END;
            CREATE TRIGGER notes_fts_update
            AFTER UPDATE OF text, raw_text, link, title, summary ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, text, raw_text, link, title, summary)
                VALUES ('delete', old.rowid, old.text, old.raw_text, old.link, old.title,
                    old.summary);
                INSERT INTO notes_fts(rowid, text, raw_text, link, title, summary)
                VALUES (new.rowid, new.text, new.raw_text, new.link, new.title, new.summary);
            END;
            INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');
            INSERT INTO jobs (id, kind, note_id, attempts, next_run_at)
                SELECT lower(hex(randomblob(16))), 'enrich', id, 0,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                FROM notes WHERE note_type = 'source' AND link IS NOT NULL AND deleted = 0;
            UPDATE notes SET enrichment = 'pending'
                WHERE note_type = 'source' AND link IS NOT NULL AND deleted = 0;",
        ),
    ])
}
