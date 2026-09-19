//! Thin transport over the `gh` binary — reads pull-request state from GitHub for the
//! worktree manager. Like [`super::git_cli`] it shells out via [`std::process::Command`];
//! it just runs `gh` and returns the parsed rows. Deciding what each PR means for a branch
//! is business logic and lives in [`crate::services::worktree_service`].

use std::path::Path;
use std::process::Command;

use serde::Deserialize;

use crate::core::error::{AppError, AppResult};

/// One row of `gh pr list --json …`. `state` is GitHub's `OPEN` | `CLOSED` | `MERGED`;
/// a draft is `OPEN` with `is_draft = true`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrRow {
    pub number: u64,
    pub head_ref_name: String,
    pub state: String,
    pub is_draft: bool,
}

#[derive(Clone)]
pub struct GitHubCli;

impl GitHubCli {
    pub fn new() -> Self {
        Self
    }

    /// Every pull request (open/closed/merged) whose head branch lives in `repo`, newest
    /// first. Errors with a friendly message when `gh` is absent, and surfaces gh's own
    /// stderr otherwise (no GitHub remote, not authenticated, …) — the page shows it.
    pub fn pull_requests(&self, repo: &Path) -> AppResult<Vec<PrRow>> {
        let output = Command::new("gh")
            .arg("pr")
            .arg("list")
            .args(["--state", "all"])
            .args(["--limit", "200"])
            .args(["--json", "number,headRefName,state,isDraft"])
            .current_dir(repo)
            .output()
            .map_err(|e| {
                AppError::Worktree(format!(
                    "GitHub CLI (gh) is required for PR status but couldn't run: {e}"
                ))
            })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Worktree(format!(
                "gh pr list failed: {}",
                stderr.trim()
            )));
        }
        serde_json::from_slice(&output.stdout)
            .map_err(|e| AppError::Worktree(format!("could not parse gh output: {e}")))
    }
}
