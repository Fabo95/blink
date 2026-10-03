//! The device-local background job queue: the [`JobRepository`]. One row per pending
//! piece of background work (today: enriching a source). Never synced: every device works
//! its own queue, and the results sync through the note itself.

use std::sync::Arc;

use rusqlite::params;
use uuid::Uuid;

use crate::core::error::AppResult;

use super::db::{store_err, Db};

/// A queued job, due at `next_run_at`.
#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub note_id: String,
    pub attempts: i64,
}

#[derive(Clone)]
pub struct JobRepository {
    db: Arc<Db>,
}

impl JobRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// Queue a job, due at `run_at`. A job of the same kind for the same note is reset
    /// (attempts back to 0, due now) instead of duplicated.
    pub fn enqueue(&self, kind: &str, note_id: &str, run_at: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO jobs (id, kind, note_id, attempts, next_run_at) \
             VALUES (?1, ?2, ?3, 0, ?4) \
             ON CONFLICT(kind, note_id) DO UPDATE SET attempts = 0, \
             next_run_at = excluded.next_run_at, last_error = NULL",
            params![Uuid::new_v4().to_string(), kind, note_id, run_at],
        )
        .map_err(store_err)?;
        Ok(())
    }

    /// Jobs of `kind` due at `now`, oldest first, at most `limit`.
    pub fn due(&self, kind: &str, now: &str, limit: i64) -> AppResult<Vec<Job>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, note_id, attempts FROM jobs WHERE kind = ?1 \
                 AND julianday(next_run_at) <= julianday(?2) \
                 ORDER BY julianday(next_run_at) ASC LIMIT ?3",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query_map(params![kind, now, limit], |row| {
                Ok(Job {
                    id: row.get(0)?,
                    note_id: row.get(1)?,
                    attempts: row.get(2)?,
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(store_err)
    }

    /// Record a failed attempt and when to try again.
    pub fn retry_later(
        &self,
        id: &str,
        attempts: i64,
        next_run_at: &str,
        error: &str,
    ) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "UPDATE jobs SET attempts = ?1, next_run_at = ?2, last_error = ?3 WHERE id = ?4",
            params![attempts, next_run_at, error, id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute("DELETE FROM jobs WHERE id = ?1", [id])
            .map_err(store_err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enqueue_resets_an_existing_job_instead_of_duplicating_it() {
        let jobs = JobRepository::new(Arc::new(Db::open_in_memory().unwrap()));
        jobs.enqueue("enrich", "n1", "2026-01-01T00:00:00Z")
            .unwrap();
        let first = jobs.due("enrich", "2026-01-02T00:00:00Z", 10).unwrap();
        jobs.retry_later(&first[0].id, 3, "2999-01-01T00:00:00Z", "timeout")
            .unwrap();
        assert!(jobs
            .due("enrich", "2026-01-02T00:00:00Z", 10)
            .unwrap()
            .is_empty());

        jobs.enqueue("enrich", "n1", "2026-01-01T00:00:00Z")
            .unwrap();
        let again = jobs.due("enrich", "2026-01-02T00:00:00Z", 10).unwrap();
        assert_eq!(again.len(), 1);
        assert_eq!(again[0].attempts, 0);
    }
}
