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

    /// True if a session named exactly `session` exists (the `=` prefix forces an exact
    /// match, so `blink-x` doesn't match `blink-xy`).
    pub fn session_exists(&self, session: &str) -> bool {
        let target = format!("={session}");
        Command::new("tmux")
            .args(["has-session", "-t", target.as_str()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// The name of the first terminal already attached to this tmux server (across any
    /// session), or `None` if nothing is attached. Used to reuse one terminal rather than
    /// spawning a new window per worktree. (A tmux "client" is a terminal.)
    pub fn attached_terminal(&self) -> Option<String> {
        let output = Command::new("tmux")
            .args(["list-clients", "-F", "#{client_name}"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .find(|line| !line.is_empty())
    }

    /// Switch which session an already-attached `terminal` is showing (instead of opening
    /// another window).
    pub fn switch_terminal_session(&self, terminal: &str, session: &str) -> AppResult<()> {
        let target = format!("={session}");
        self.run(&["switch-client", "-c", terminal, "-t", target.as_str()])
    }

    /// Create a detached session named `session` with a single `window` rooted at `cwd`.
    pub fn new_session(&self, session: &str, window: &str, cwd: &Path) -> AppResult<()> {
        let cwd = cwd
            .to_str()
            .ok_or_else(|| AppError::Worktree("worktree path is not valid UTF-8".into()))?;
        self.run(&["new-session", "-d", "-s", session, "-n", window, "-c", cwd])
    }

    /// Type `keys` into `target` (a `session:window`) and press Enter.
    pub fn send_line(&self, target: &str, keys: &str) -> AppResult<()> {
        self.run(&["send-keys", "-t", target, keys, "Enter"])
    }

    /// A live session other than `exclude`, if any — a place to move a terminal before its
    /// current session is killed.
    pub fn first_session_other_than(&self, exclude: &str) -> Option<String> {
        let output = Command::new("tmux")
            .args(["list-sessions", "-F", "#{session_name}"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .find(|name| !name.is_empty() && name != exclude)
    }

    /// The terminals (tmux clients) currently showing `session`.
    pub fn terminals_on(&self, session: &str) -> Vec<String> {
        let target = format!("={session}");
        Command::new("tmux")
            .args(["list-clients", "-t", target.as_str(), "-F", "#{client_name}"])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .map(|line| line.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Kill the session if present (best effort — a missing session is not an error).
    pub fn kill_session(&self, session: &str) {
        let target = format!("={session}");
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
