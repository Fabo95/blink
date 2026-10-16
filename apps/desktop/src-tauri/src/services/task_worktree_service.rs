//! Task → worktree: start a captured task in its own worktree with Claude already briefed, and
//! keep the two linked. The brief (the task, its link, its group's context — or the AI-written
//! prompt when an AI key is set) is written to a file Claude reads as its first prompt; the
//! link lives in the device-local `task_worktrees` table. A task completes when its branch's
//! PR is merged ([`TaskWorktreeService::merged_tasks`], checked with the PR status).

use std::collections::HashMap;
use std::path::PathBuf;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{ManagedRepo, Task, TaskWorktree, Worktree, WorktreeStatus};
use crate::repository::{TaskWorktreesRepository, TasksRepository};
use crate::services::terminal_service::ClaudeStart;
use crate::services::worktree_service::WorktreeService;

#[derive(Clone)]
pub struct TaskWorktreeService {
    task_worktrees_repository: TaskWorktreesRepository,
    tasks_repository: TasksRepository,
    worktree_service: WorktreeService,
    /// Where briefs are written (`<data dir>/briefs`), one file per task.
    briefs_dir: PathBuf,
}

impl TaskWorktreeService {
    pub fn new(
        task_worktrees_repository: TaskWorktreesRepository,
        tasks_repository: TasksRepository,
        worktree_service: WorktreeService,
        briefs_dir: PathBuf,
    ) -> Self {
        Self {
            task_worktrees_repository,
            tasks_repository,
            worktree_service,
            briefs_dir,
        }
    }

    /// Every task → worktree link whose task still exists, with the task's text.
    pub fn links(&self) -> AppResult<Vec<TaskWorktree>> {
        let rows = self.task_worktrees_repository.all()?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let task = self.tasks_repository.get(&row.task_id).ok()?;
                Some(TaskWorktree {
                    task_id: row.task_id,
                    task_text: task.text,
                    repo_path: row.repo_path,
                    branch: row.branch,
                })
            })
            .collect())
    }

    /// Create (or reuse) the worktree for `task` on `branch` and start its Claude with
    /// `brief` as the first prompt, then link the two.
    pub fn start(
        &self,
        task: &Task,
        repo: &ManagedRepo,
        branch: String,
        brief: &str,
    ) -> AppResult<Worktree> {
        std::fs::create_dir_all(&self.briefs_dir)
            .map_err(|e| AppError::Worktree(format!("could not create the briefs folder: {e}")))?;
        let file = self.briefs_dir.join(format!("{}.md", task.id));
        std::fs::write(&file, brief)
            .map_err(|e| AppError::Worktree(format!("could not write the brief: {e}")))?;
        let worktree = self
            .worktree_service
            .add(repo, branch, ClaudeStart::Brief(file))?;
        self.task_worktrees_repository
            .link(&task.id, &repo.path, &worktree.branch)?;
        Ok(worktree)
    }

    /// The tasks whose worktree branch (in `repo_path`) has a merged PR.
    pub fn merged_tasks(
        &self,
        repo_path: &str,
        statuses: &HashMap<String, WorktreeStatus>,
    ) -> AppResult<Vec<String>> {
        Ok(self
            .task_worktrees_repository
            .all()?
            .into_iter()
            .filter(|row| row.repo_path == repo_path)
            .filter(|row| statuses.get(&row.branch) == Some(&WorktreeStatus::Merged))
            .map(|row| row.task_id)
            .collect())
    }

    /// Forget the link of a worktree that's gone.
    pub fn unlink(&self, repo_path: &str, branch: &str) -> AppResult<()> {
        self.task_worktrees_repository
            .unlink_branch(repo_path, branch)
    }
}

/// The brief when no AI key is set: what was captured, where it came from, and the group's
/// standing context — enough for Claude to start planning.
pub fn plain_brief(task: &Task, group_context: Option<&str>) -> String {
    let mut brief = format!("Task: {}", task.text.trim());
    let raw = task.raw_text.trim();
    if !raw.is_empty() && raw != task.text.trim() {
        brief.push_str(&format!("\n\nOriginally captured as:\n{raw}"));
    }
    if let Some(link) = task
        .link
        .as_deref()
        .map(str::trim)
        .filter(|l| !l.is_empty())
    {
        brief.push_str(&format!("\n\nLink: {link}"));
    }
    if let Some(context) = group_context.map(str::trim).filter(|c| !c.is_empty()) {
        brief.push_str(&format!("\n\nContext: {context}"));
    }
    brief.push_str(
        "\n\nStart by understanding the task in this repository and propose a short plan \
         before changing anything.",
    );
    brief
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::{CaptureSource, TaskEffort};

    fn task(text: &str, raw: &str, link: Option<&str>) -> Task {
        Task {
            id: "t1".into(),
            text: text.into(),
            raw_text: raw.into(),
            status: "open".into(),
            effort: TaskEffort::Standard,
            improved: false,
            link: link.map(str::to_string),
            task_group_id: None,
            source: CaptureSource {
                app_id: "slack".into(),
                app_name: "Slack".into(),
                window_title: "#dev".into(),
                captured_at: "2026-10-14T10:00:00Z".into(),
            },
            created_at: "2026-10-14T10:00:00Z".into(),
            updated_at: "2026-10-14T10:00:00Z".into(),
            completed_at: None,
            origin_note_id: None,
        }
    }

    #[test]
    fn plain_brief_carries_task_link_and_context() {
        let brief = plain_brief(
            &task(
                "Fix login",
                "login broken for SSO users",
                Some("https://x.io/1"),
            ),
            Some("Web app, Next.js"),
        );
        assert!(brief.starts_with("Task: Fix login"));
        assert!(brief.contains("Originally captured as:\nlogin broken for SSO users"));
        assert!(brief.contains("Link: https://x.io/1"));
        assert!(brief.contains("Context: Web app, Next.js"));
    }

    #[test]
    fn plain_brief_skips_what_isnt_there() {
        let brief = plain_brief(&task("Fix login", "Fix login", None), None);
        assert!(!brief.contains("Originally"));
        assert!(!brief.contains("Link:"));
        assert!(!brief.contains("Context:"));
    }
}
