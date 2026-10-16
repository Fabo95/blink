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
//!
//! A new session **continues** the directory's last Claude conversation when there is one
//! (read from Claude's own session store via [`ClaudeStore`]), so a session that died with
//! tmux (reboot, crash) comes back with its history instead of starting blank.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::clients::claude_store::{ClaudeStore, SessionFile};
use crate::clients::tmux_cli::TmuxCli;
use crate::core::error::{AppError, AppResult};
use crate::core::models::{ClaudeConversation, TerminalOption};
use crate::core::paths::shell_quote;
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

/// Known CLI-first terminals, as `(display name, launcher binary, command template)`. Blink
/// offers the ones whose launcher is found on the login-shell PATH as ready-to-pick options
/// in Settings. Each template attaches to the tmux session (`{session}`) using that
/// terminal's own run-a-command syntax — they are **not** uniform like editors. GUI-only
/// terminals (Terminal.app, iTerm, Warp) are intentionally absent: they have no PATH binary
/// and need osascript, which mangles the launch command (the very reason the default is
/// Alacritty). The Custom field remains the escape hatch for those.
const TERMINAL_CATALOG: &[(&str, &str, &str)] = &[
    (
        "Alacritty",
        "alacritty",
        "alacritty -e tmux attach -t {session}",
    ),
    ("kitty", "kitty", "kitty tmux attach -t {session}"),
    (
        "WezTerm",
        "wezterm",
        "wezterm start -- tmux attach -t {session}",
    ),
    ("Ghostty", "ghostty", "ghostty -e tmux attach -t {session}"),
];

/// How many transcripts are read per conversation asked for — bounds the reading when many
/// of the newest are empty (opened and quit, no prompt).
const CONVERSATION_SCAN_FACTOR: usize = 3;

/// Characters of a conversation's first prompt shown as its preview.
const PREVIEW_CHARS: usize = 100;

/// How a **new** session's Claude starts. Ignored when the session is already running.
#[derive(Default)]
pub enum ClaudeStart {
    /// Continue the directory's last conversation, else start fresh.
    #[default]
    Default,
    /// A fork of this conversation (from any directory).
    Fork(String),
    /// A fresh conversation whose first prompt is this file's contents (a task's brief).
    Brief(PathBuf),
}

/// How a **new** session starts. Ignored when the session is already running.
#[derive(Default)]
pub struct SessionLaunch {
    /// Runs first in the session's shell; Claude starts only if it succeeds, so a failed setup
    /// stays on screen.
    pub setup_command: Option<String>,
    pub claude: ClaudeStart,
}

#[derive(Clone)]
pub struct TerminalService {
    tmux_cli: TmuxCli,
    claude_store: ClaudeStore,
    settings_repository: SettingsRepository,
    /// The command each new session's window runs to start Claude. Blink points it at its
    /// own `--settings` file so the attention hooks fire without touching the user's global
    /// Claude config.
    claude_command: String,
}

impl TerminalService {
    pub fn new(
        tmux_cli: TmuxCli,
        claude_store: ClaudeStore,
        settings_repository: SettingsRepository,
        claude_command: String,
    ) -> Self {
        Self {
            tmux_cli,
            claude_store,
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
        match command
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
        {
            Some(command) => self.settings_repository.set(TERMINAL_COMMAND_KEY, &command),
            None => self.settings_repository.remove(TERMINAL_COMMAND_KEY),
        }
    }

    /// The terminals from [`TERMINAL_CATALOG`] whose launcher resolves on the login-shell
    /// PATH — offered as one-click choices in Settings, each with its own attach-command
    /// template.
    pub fn list_terminals(&self) -> Vec<TerminalOption> {
        let bins: Vec<&str> = TERMINAL_CATALOG.iter().map(|(_, bin, _)| *bin).collect();
        let found: HashSet<String> = crate::core::paths::resolve_on_login_path(&bins);
        TERMINAL_CATALOG
            .iter()
            .filter(|(_, bin, _)| found.contains(*bin))
            .map(|(name, _, command)| TerminalOption {
                name: (*name).to_string(),
                command: (*command).to_string(),
            })
            .collect()
    }

    // ── sessions ──────────────────────────────────────────────────────────────────────

    /// True if the named tmux/Claude session is currently running.
    pub fn session_exists(&self, session: &str) -> bool {
        self.tmux_cli.session_exists(session)
    }

    /// Ensure the named tmux session exists, creating it (with Claude launched in its first
    /// window, rooted at `cwd`, as `launch` says) if it doesn't. The `send_line` (rather than a
    /// `new-session` command arg) means the window falls back to a shell when Claude exits
    /// instead of ending the session. Idempotent.
    pub fn ensure_session(
        &self,
        session: &str,
        cwd: &Path,
        launch: SessionLaunch,
    ) -> AppResult<()> {
        if self.tmux_cli.session_exists(session) {
            return Ok(());
        }
        let claude = self.claude_line(cwd, &launch.claude)?;
        let line = match launch.setup_command {
            Some(setup) => format!("{setup} && {claude}"),
            None => claude,
        };
        self.tmux_cli.new_session(session, CLAUDE_WINDOW, cwd)?;
        self.tmux_cli
            .send_line(&format!("{session}:{CLAUDE_WINDOW}"), &line)
    }

    /// Ensure the session (at `cwd`) and open a terminal attached to it: reuse an already-open
    /// terminal by pointing it at this session and raising it, else launch a fresh one.
    pub fn open(&self, session: &str, cwd: &Path) -> AppResult<()> {
        self.ensure_session(session, cwd, SessionLaunch::default())?;
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

    /// Up to `limit` of the newest conversations Claude recorded in `cwd` that have a prompt,
    /// newest first, tagged with the caller's `origin` label.
    pub fn recent_conversations(
        &self,
        cwd: &Path,
        origin: &str,
        from_main: bool,
        limit: usize,
    ) -> Vec<ClaudeConversation> {
        let mut sessions = self.claude_store.sessions(cwd);
        sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
        sessions
            .into_iter()
            .take(limit * CONVERSATION_SCAN_FACTOR)
            .filter_map(|file| {
                let preview = self.first_prompt(&file)?;
                Some(ClaudeConversation {
                    updated_at: chrono::DateTime::<chrono::Utc>::from(file.modified).to_rfc3339(),
                    session_id: file.id,
                    preview,
                    origin: origin.to_string(),
                    from_main,
                })
            })
            .take(limit)
            .collect()
    }

    // ── internals ─────────────────────────────────────────────────────────────────────

    /// The command line that starts Claude in a new session at `cwd`, per [`ClaudeStart`]:
    /// a fork, a brief as the first prompt, or by default `--continue` when Claude has run here
    /// before, else a fresh start.
    fn claude_line(&self, cwd: &Path, start: &ClaudeStart) -> AppResult<String> {
        match start {
            ClaudeStart::Fork(id) => {
                // Ids are UUIDs; anything else would be interpolated into a shell line.
                if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                    return Err(AppError::Worktree(format!(
                        "invalid Claude session id: {id}"
                    )));
                }
                Ok(format!(
                    "{} --resume {id} --fork-session",
                    self.claude_command
                ))
            }
            // Read from a file rather than typed into the shell: a brief spans lines and may
            // hold quotes, which `send-keys` would mangle.
            ClaudeStart::Brief(file) => Ok(format!(
                "{} \"$(cat {})\"",
                self.claude_command,
                shell_quote(&file.to_string_lossy())
            )),
            ClaudeStart::Default if self.claude_store.sessions(cwd).is_empty() => {
                Ok(self.claude_command.clone())
            }
            ClaudeStart::Default => Ok(format!("{} --continue", self.claude_command)),
        }
    }

    fn first_prompt(&self, file: &SessionFile) -> Option<String> {
        self.claude_store
            .read_lines(file)?
            .map_while(Result::ok)
            .find_map(|line| prompt_text(&line))
            .map(|text| shorten(&text, PREVIEW_CHARS))
    }

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

/// The text of a transcript line when it is a prompt the user typed — not a tool result,
/// a meta line, or a wrapped slash command / system note (those start with `<`).
fn prompt_text(line: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    let is_meta = value.get("isMeta").and_then(serde_json::Value::as_bool) == Some(true);
    if value.get("type")?.as_str()? != "user" || is_meta {
        return None;
    }
    let text = match value.get("message")?.get("content")? {
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Array(blocks) => blocks.iter().find_map(|block| {
            (block.get("type")?.as_str()? == "text")
                .then(|| block.get("text")?.as_str().map(str::to_string))?
        })?,
        _ => return None,
    };
    let text = text.trim();
    (!text.is_empty() && !text.starts_with('<')).then(|| text.to_string())
}

/// Whitespace collapsed to single spaces, cut to `max` characters with an ellipsis.
fn shorten(text: &str, max: usize) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max {
        return flat;
    }
    let cut: String = flat.chars().take(max).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_text_reads_typed_prompts_only() {
        let typed = r#"{"type":"user","message":{"role":"user","content":"fix the  login\nbug"}}"#;
        assert_eq!(prompt_text(typed).as_deref(), Some("fix the  login\nbug"));

        let blocks =
            r#"{"type":"user","message":{"content":[{"type":"text","text":"from blocks"}]}}"#;
        assert_eq!(prompt_text(blocks).as_deref(), Some("from blocks"));

        let tool =
            r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"x"}]}}"#;
        let meta = r#"{"type":"user","isMeta":true,"message":{"content":"Caveat"}}"#;
        let command =
            r#"{"type":"user","message":{"content":"<command-name>/clear</command-name>"}}"#;
        let assistant = r#"{"type":"assistant","message":{"content":"hi"}}"#;
        for line in [tool, meta, command, assistant, "not json"] {
            assert_eq!(prompt_text(line), None, "{line}");
        }
    }

    #[test]
    fn shorten_flattens_and_cuts() {
        assert_eq!(shorten("a\n  b", 10), "a b");
        assert_eq!(shorten("abcdef ghij", 7), "abcdef…");
    }
}
