//! Thin transport over the `tmux` binary — the worktree manager's session glue, the
//! counterpart to [`super::git_cli::GitCli`]. Each method runs one `tmux` command and
//! returns its raw outcome; the policy (session naming, launching `claude`) lives in
//! [`crate::services::worktree_service`].

use std::path::Path;
use std::process::Command;

use crate::core::error::{AppError, AppResult};

pub struct TmuxCli;

impl TmuxCli {
    pub fn new() -> Self {
        Self
    }

    /// True if a session named exactly `name` exists (the `=` prefix forces an exact
    /// match, so `blink-x` doesn't match `blink-xy`).
    pub fn session_exists(&self, name: &str) -> bool {
        let target = format!("={name}");
        Command::new("tmux")
            .args(["has-session", "-t", target.as_str()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Create a detached session named `name` with a single `window` rooted at `cwd`.
    pub fn new_session(&self, name: &str, window: &str, cwd: &Path) -> AppResult<()> {
        let cwd = cwd
            .to_str()
            .ok_or_else(|| AppError::Worktree("worktree path is not valid UTF-8".into()))?;
        self.run(&["new-session", "-d", "-s", name, "-n", window, "-c", cwd])
    }

    /// Type `keys` into `target` (a `session:window`) and press Enter.
    pub fn send_line(&self, target: &str, keys: &str) -> AppResult<()> {
        self.run(&["send-keys", "-t", target, keys, "Enter"])
    }

    /// Kill the session if present (best effort — a missing session is not an error).
    pub fn kill_session(&self, name: &str) {
        let target = format!("={name}");
        let _ = Command::new("tmux")
            .args(["kill-session", "-t", target.as_str()])
            .output();
    }

    fn run(&self, args: &[&str]) -> AppResult<()> {
        let output = Command::new("tmux")
            .args(args)
            .output()
            .map_err(|e| AppError::Worktree(format!("could not run tmux (is it installed?): {e}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Worktree(format!(
                "tmux {} failed: {}",
                args.join(" "),
                stderr.trim()
            )));
        }
        Ok(())
    }
}
