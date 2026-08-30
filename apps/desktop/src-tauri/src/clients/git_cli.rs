//! Thin transport over the `git` binary — the worktree manager's counterpart to the
//! HTTP clients, but shelling out via [`std::process::Command`] (the same mechanism as
//! `platform::os::open_url`). Each method builds one `git -C <repo> …` invocation and
//! returns its parsed output; deciding what to do with it is business logic and lives in
//! [`crate::services::worktree_service`].

use std::path::Path;
use std::process::Command;

use crate::core::error::{AppError, AppResult};

/// One entry from `git worktree list --porcelain`. The main worktree is always first.
pub struct WorktreeEntry {
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

#[derive(Clone)]
pub struct GitCli;

impl GitCli {
    pub fn new() -> Self {
        Self
    }

    /// Run `git -C <cwd> <args…>`, erroring (with stderr) on a non-zero exit.
    fn run(&self, cwd: &Path, args: &[&str]) -> AppResult<String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(cwd)
            .args(args)
            .output()
            .map_err(|e| AppError::Worktree(format!("could not run git: {e}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Worktree(format!(
                "git {} failed: {}",
                args.join(" "),
                stderr.trim()
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    /// Run for its stdout, or `None` on failure — for probes where a non-zero exit is a
    /// legitimate answer (branch missing, no origin/HEAD, …), not an error to surface.
    fn run_opt(&self, cwd: &Path, args: &[&str]) -> Option<String> {
        let output = Command::new("git").arg("-C").arg(cwd).args(args).output().ok()?;
        output
            .status
            .success()
            .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Run purely for its exit status — for `--quiet` existence checks.
    fn run_ok(&self, cwd: &Path, args: &[&str]) -> bool {
        Command::new("git")
            .arg("-C")
            .arg(cwd)
            .args(args)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub fn is_git_repo(&self, path: &Path) -> bool {
        self.run_ok(path, &["rev-parse", "--git-dir"])
    }

    pub fn fetch_from_origin(&self, repo: &Path) -> AppResult<()> {
        self.run(repo, &["fetch", "origin", "--prune"]).map(|_| ())
    }

    /// The ref new branches fork from: origin/HEAD, else origin/main|master, else HEAD.
    pub fn default_base_branch(&self, repo: &Path) -> String {
        if let Some(head) = self.run_opt(repo, &["symbolic-ref", "-q", "refs/remotes/origin/HEAD"]) {
            if let Some(short) = head.strip_prefix("refs/remotes/") {
                return short.to_string();
            }
        }
        for candidate in ["main", "master"] {
            let refname = format!("refs/remotes/origin/{candidate}");
            if self.run_ok(repo, &["show-ref", "--verify", "--quiet", refname.as_str()]) {
                return format!("origin/{candidate}");
            }
        }
        "HEAD".to_string()
    }

    pub fn has_local_branch(&self, repo: &Path, branch: &str) -> bool {
        let refname = format!("refs/heads/{branch}");
        self.run_ok(repo, &["show-ref", "--verify", "--quiet", refname.as_str()])
    }

    pub fn has_remote_branch(&self, repo: &Path, branch: &str) -> bool {
        let refname = format!("refs/remotes/origin/{branch}");
        self.run_ok(repo, &["show-ref", "--verify", "--quiet", refname.as_str()])
    }

    /// Add a worktree that checks out an existing local branch.
    pub fn add_worktree_checkout(&self, repo: &Path, path: &str, branch: &str) -> AppResult<()> {
        self.run(repo, &["worktree", "add", path, branch]).map(|_| ())
    }

    /// Add a worktree on a new local branch tracking `origin/<branch>`.
    pub fn add_worktree_tracking(&self, repo: &Path, path: &str, branch: &str) -> AppResult<()> {
        let upstream = format!("origin/{branch}");
        self.run(
            repo,
            &["worktree", "add", "--track", "-b", branch, path, upstream.as_str()],
        )
        .map(|_| ())
    }

    /// Add a worktree on a brand-new branch forked from `base`.
    pub fn add_worktree_new_branch(
        &self,
        repo: &Path,
        path: &str,
        branch: &str,
        base: &str,
    ) -> AppResult<()> {
        self.run(repo, &["worktree", "add", "-b", branch, path, base]).map(|_| ())
    }

    pub fn remove_worktree(&self, repo: &Path, path: &str, force: bool) -> AppResult<()> {
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(path);
        self.run(repo, &args).map(|_| ())
    }

    pub fn prune_worktrees(&self, repo: &Path) -> AppResult<()> {
        self.run(repo, &["worktree", "prune"]).map(|_| ())
    }

    /// Force-delete a local branch (`-D`, so an unmerged branch still goes). Safe to call
    /// after the branch's worktree is removed — it's no longer checked out anywhere.
    pub fn delete_branch(&self, repo: &Path, branch: &str) -> AppResult<()> {
        self.run(repo, &["branch", "-D", branch]).map(|_| ())
    }

    /// Delete the branch on the remote (`git push origin --delete`) — reaches GitHub.
    pub fn delete_remote_branch(&self, repo: &Path, branch: &str) -> AppResult<()> {
        self.run(repo, &["push", "origin", "--delete", branch]).map(|_| ())
    }

    pub fn list_worktrees(&self, repo: &Path) -> AppResult<Vec<WorktreeEntry>> {
        let out = self.run(repo, &["worktree", "list", "--porcelain"])?;
        let mut entries = Vec::new();
        let mut path: Option<String> = None;
        let mut branch: Option<String> = None;
        let flush = |path: &mut Option<String>, branch: &mut Option<String>, entries: &mut Vec<WorktreeEntry>| {
            if let Some(p) = path.take() {
                let is_main = entries.is_empty();
                entries.push(WorktreeEntry { path: p, branch: branch.take(), is_main });
            }
        };
        for line in out.lines() {
            if let Some(p) = line.strip_prefix("worktree ") {
                flush(&mut path, &mut branch, &mut entries);
                path = Some(p.to_string());
            } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
                branch = Some(b.to_string());
            }
        }
        flush(&mut path, &mut branch, &mut entries);
        Ok(entries)
    }

    /// True if the worktree at `path` has uncommitted changes.
    pub fn worktree_has_changes(&self, path: &Path) -> bool {
        self.run_opt(path, &["status", "--porcelain"])
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }

    /// Local branches already merged into `base`.
    pub fn branches_merged_into(&self, repo: &Path, base: &str) -> Vec<String> {
        self.run_opt(repo, &["branch", "--merged", base, "--format=%(refname:short)"])
            .map(|s| {
                s.lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Local branches whose upstream has been deleted from the remote (`[gone]`).
    pub fn branches_with_gone_upstream(&self, repo: &Path) -> Vec<String> {
        self.run_opt(
            repo,
            &["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads"],
        )
        .map(|s| {
            s.lines()
                .filter(|l| l.contains("[gone]"))
                .filter_map(|l| l.split('\t').next().map(|b| b.trim().to_string()))
                .filter(|b| !b.is_empty())
                .collect()
        })
        .unwrap_or_default()
    }
}
