//! Which worktree each task was started in: the [`TaskWorktreesRepository`]. One row per task
//! (repo path + branch). Device-local, never synced — the worktree only exists on this Mac.

use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;

use crate::core::error::AppResult;
use crate::database::{store_err, Db};

/// A task's worktree as stored.
#[derive(Debug, Clone, PartialEq)]
pub struct TaskWorktreeRow {
    pub task_id: String,
    pub repo_path: String,
    pub branch: String,
}

#[derive(Clone)]
pub struct TaskWorktreesRepository {
    db: Arc<Db>,
}

impl TaskWorktreesRepository {
    pub(super) fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    /// Record (or move) the task's worktree.
    pub fn link(&self, task_id: &str, repo_path: &str, branch: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "INSERT INTO task_worktrees (task_id, repo_path, branch, created_at) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(task_id) DO UPDATE SET repo_path = excluded.repo_path, \
             branch = excluded.branch, created_at = excluded.created_at",
            params![task_id, repo_path, branch, Utc::now().to_rfc3339()],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn all(&self) -> AppResult<Vec<TaskWorktreeRow>> {
        let conn = self.db.lock()?;
        let mut stmt = conn
            .prepare("SELECT task_id, repo_path, branch FROM task_worktrees ORDER BY created_at")
            .map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok(TaskWorktreeRow {
                    task_id: row.get(0)?,
                    repo_path: row.get(1)?,
                    branch: row.get(2)?,
                })
            })
            .map_err(store_err)?;
        rows.collect::<Result<_, _>>().map_err(store_err)
    }

    /// Forget the link of a worktree that's gone (removed or pruned).
    pub fn unlink_branch(&self, repo_path: &str, branch: &str) -> AppResult<()> {
        let conn = self.db.lock()?;
        conn.execute(
            "DELETE FROM task_worktrees WHERE repo_path = ?1 AND branch = ?2",
            params![repo_path, branch],
        )
        .map_err(store_err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_moves_and_unlink_forgets() {
        let repo = TaskWorktreesRepository::new(Arc::new(Db::open_in_memory().expect("db")));
        repo.link("t1", "/r", "fix-login").expect("link");
        repo.link("t1", "/r", "fix-login-2").expect("relink");
        repo.link("t2", "/r", "other").expect("link");
        let all = repo.all().expect("all");
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].branch, "fix-login-2");

        repo.unlink_branch("/r", "other").expect("unlink");
        assert_eq!(repo.all().expect("all").len(), 1);
    }
}
