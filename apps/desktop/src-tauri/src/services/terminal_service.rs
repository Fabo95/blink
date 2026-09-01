//! Terminal + tmux session management — opening a named tmux session running Claude at a
//! working directory, via the user's configured terminal. Deliberately **decoupled from
//! worktrees**: every operation is keyed by an opaque session name + cwd, with no knowledge
//! of repos or branches, so it can back any "session at a directory" feature. The worktree
//! layer ([`crate::services::worktree_service`]) owns the `<repo>-<branch>` naming and calls
//! in with the resulting session name.
//!
//! Composes the [`TmuxCli`] client (session mechanics) and owns the terminal-launch command
//! (a `settings` entry). The `claude_command` is the line each new session runs — Blink
//! points it at its own `--settings` file so the attention hooks fire (see
//! [`crate::services::hook_service`]).

use std::path::Path;

use crate::clients::tmux_cli::TmuxCli;
use crate::core::error::{AppError, AppResult};
use crate::platform::os;
use crate::repository::SettingsRepository;

/// `settings` key holding the terminal launch command. `{session}` is replaced with the
/// tmux session name. Unset = [`DEFAULT_TERMINAL_COMMAND`]. (Value kept as the historical
/// `worktree_*` key so existing users' saved commands are preserved.)
const TERMINAL_COMMAND_KEY: &str = "worktree_terminal_command";

/// Default terminal launch command: open Alacritty and `exec` straight into `tmux attach`
/// — no interactive login shell in between (which is what mangled the command with
/// Terminal.app + osascript's `do script`).
const DEFAULT_TERMINAL_COMMAND: &str = "alacritty -e tmux attach -t {session}";

/// The name of the tmux window Claude runs in.
const CLAUDE_WINDOW: &str = "claude";

#[derive(Clone)]
pub struct TerminalService {
    tmux_cli: TmuxCli,
    settings_repository: SettingsRepository,
    /// The command each new session's window runs to start Claude. Blink points it at its
    /// own `--settings` file so the attention hooks fire without touching the user's global
    /// Claude config.
    claude_command: String,
}

impl TerminalService {
    pub fn new(
        tmux_cli: TmuxCli,
        settings_repository: SettingsRepository,
        claude_command: String,
    ) -> Self {
        Self {
            tmux_cli,
            settings_repository,
            claude_command,
        }
    }

    // ── settings ──────────────────────────────────────────────────────────────────────

    /// The terminal launch command (`{session}` = the tmux session name), or the default.
    pub fn command(&self) -> AppResult<String> {
        Ok(self
            .settings_repository
            .get(TERMINAL_COMMAND_KEY)?
            .filter(|c| !c.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_TERMINAL_COMMAND.to_string()))
    }

    /// Set (or clear, back to the default) the terminal launch command.
    pub fn set_command(&self, command: Option<String>) -> AppResult<()> {
        match command.map(|c| c.trim().to_string()).filter(|c| !c.is_empty()) {
            Some(command) => self.settings_repository.set(TERMINAL_COMMAND_KEY, &command),
            None => self.settings_repository.remove(TERMINAL_COMMAND_KEY),
        }
    }

    // ── sessions ──────────────────────────────────────────────────────────────────────

    /// True if the named tmux/Claude session is currently running.
    pub fn session_exists(&self, session: &str) -> bool {
        self.tmux_cli.session_exists(session)
    }

    /// Ensure the named tmux session exists, creating it (with Claude launched in its first
    /// window, rooted at `cwd`) if it doesn't. The `send_line` (rather than a `new-session`
    /// command arg) means the window falls back to a shell when Claude exits instead of
    /// ending the session. Idempotent.
    pub fn ensure_session(&self, session: &str, cwd: &Path) -> AppResult<()> {
        if self.tmux_cli.session_exists(session) {
            return Ok(());
        }
        self.tmux_cli.new_session(session, CLAUDE_WINDOW, cwd)?;
        self.tmux_cli
            .send_line(&format!("{session}:{CLAUDE_WINDOW}"), &self.claude_command)
    }

    /// Ensure the session (at `cwd`) and open a terminal attached to it: reuse an already-open
    /// terminal by pointing it at this session and raising it, else launch a fresh one.
    pub fn open(&self, session: &str, cwd: &Path) -> AppResult<()> {
        self.ensure_session(session, cwd)?;
        match self.tmux_cli.attached_terminal() {
            // A terminal is already open — point it at this session instead of opening
            // another window, then bring it to the front.
            Some(terminal) => {
                self.tmux_cli.switch_terminal_session(&terminal, session)?;
                self.raise_terminal()?;
            }
            // No terminal open yet — launch one on this session.
            None => self.launch_terminal(session)?,
        }
        Ok(())
    }

    /// Tear down a session: move any terminal showing it to another live session first (so a
    /// terminal doesn't drop out of tmux), then kill it. Best effort — used when the thing the
    /// session belonged to (e.g. a worktree) is removed.
    pub fn close_session(&self, session: &str) {
        self.move_terminals_off(session);
        self.tmux_cli.kill_session(session);
    }

    // ── internals ─────────────────────────────────────────────────────────────────────

    /// Move any terminal currently showing `session` to another live session, so killing it
    /// doesn't drop the terminal out of tmux. Best effort, and a no-op when it's the only
    /// session (nothing to switch to).
    fn move_terminals_off(&self, session: &str) {
        let Some(other) = self.tmux_cli.first_session_other_than(session) else {
            return;
        };
        for terminal in self.tmux_cli.terminals_on(session) {
            let _ = self.tmux_cli.switch_terminal_session(&terminal, &other);
        }
    }

    /// Spawn the configured terminal on `session` (`{session}` is substituted in). Runs via a
    /// **login, non-interactive** shell (`$SHELL -lc`): `-l` sources `.zprofile` so the user's
    /// real PATH (e.g. Homebrew's) is present even when Blink is launched from Finder with a
    /// minimal launchd PATH, while `-c` skips `.zshrc` so interactive rc hooks (like
    /// oh-my-zsh's update prompt) never run and mangle the command.
    fn launch_terminal(&self, session: &str) -> AppResult<()> {
        let command = self.command()?.replace("{session}", session);
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        std::process::Command::new(&shell)
            .arg("-lc")
            .arg(&command)
            .spawn()
            .map_err(|e| AppError::Worktree(format!("could not launch terminal: {e}")))?;
        Ok(())
    }

    /// Bring the configured terminal to the front (best effort). The app to raise is the
    /// terminal command's program — its first whitespace-separated token (e.g. `alacritty`).
    fn raise_terminal(&self) -> AppResult<()> {
        let command = self.command()?;
        if let Some(app_name) = command.split_whitespace().next() {
            os::activate_app(app_name);
        }
        Ok(())
    }
}
