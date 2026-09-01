//! Editor launching — opening a folder path in the user's chosen GUI editor. Operates on a
//! plain filesystem path with no knowledge of worktrees; the caller resolves the path. Owns
//! the editor-launch command (a `settings` entry) and the detection of installed editors
//! offered as one-click choices in Settings.

use std::collections::HashSet;
use std::path::Path;

use crate::core::error::{AppError, AppResult};
use crate::core::models::EditorOption;
use crate::core::paths::shell_quote;
use crate::repository::SettingsRepository;

/// `settings` key holding the editor launch command. `{path}` is replaced with the folder
/// path. Unset = the environment-derived default (see [`default_editor_command`]). (Value
/// kept as the historical `worktree_*` key so existing users' saved commands are preserved.)
const EDITOR_COMMAND_KEY: &str = "worktree_editor_command";

/// Known GUI editors, as `(display name, launcher binary)`. Blink offers the ones whose
/// launcher is found on the login-shell PATH as ready-to-pick options in Settings. Terminal
/// editors (vim/nvim) are intentionally absent — launched detached they have no TTY.
const EDITOR_CATALOG: &[(&str, &str)] = &[
    ("VS Code", "code"),
    ("Cursor", "cursor"),
    ("WebStorm", "webstorm"),
    ("PyCharm", "pycharm"),
    ("IntelliJ IDEA", "idea"),
    ("PhpStorm", "phpstorm"),
    ("GoLand", "goland"),
    ("RubyMine", "rubymine"),
    ("Fleet", "fleet"),
    ("Zed", "zed"),
    ("Sublime Text", "subl"),
];

#[derive(Clone)]
pub struct EditorService {
    settings_repository: SettingsRepository,
}

impl EditorService {
    pub fn new(settings_repository: SettingsRepository) -> Self {
        Self {
            settings_repository,
        }
    }

    /// The editor launch command (`{path}` = the folder path), or the environment-derived
    /// default (the first GUI editor found on the login-shell PATH, else `code {path}`).
    pub fn command(&self) -> AppResult<String> {
        Ok(self
            .settings_repository
            .get(EDITOR_COMMAND_KEY)?
            .filter(|c| !c.trim().is_empty())
            .unwrap_or_else(default_editor_command))
    }

    /// Set (or clear, back to the default) the editor launch command.
    pub fn set_command(&self, command: Option<String>) -> AppResult<()> {
        match command.map(|c| c.trim().to_string()).filter(|c| !c.is_empty()) {
            Some(command) => self.settings_repository.set(EDITOR_COMMAND_KEY, &command),
            None => self.settings_repository.remove(EDITOR_COMMAND_KEY),
        }
    }

    /// The editors from [`EDITOR_CATALOG`] whose launcher resolves on the login-shell PATH —
    /// offered as one-click choices in Settings. Detected via the shared login-shell probe so
    /// JetBrains Toolbox / Homebrew shims are seen even under Finder's minimal PATH.
    pub fn list_editors(&self) -> Vec<EditorOption> {
        let bins: Vec<&str> = EDITOR_CATALOG.iter().map(|(_, bin)| *bin).collect();
        let found: HashSet<String> = crate::core::paths::resolve_on_login_path(&bins);
        EDITOR_CATALOG
            .iter()
            .filter(|(_, bin)| found.contains(*bin))
            .map(|(name, bin)| EditorOption {
                name: (*name).to_string(),
                command: format!("{bin} {{path}}"),
            })
            .collect()
    }

    /// Spawn the configured editor on `path` (`{path}` is substituted, shell-quoted; a command
    /// without the placeholder gets the path appended). Runs via a **login, non-interactive**
    /// shell (`$SHELL -lc`) so the editor's launcher is on PATH (e.g. Homebrew's `code`, or
    /// JetBrains Toolbox's `webstorm`) even when Blink was started from Finder with a minimal
    /// launchd PATH.
    pub fn open(&self, path: &Path) -> AppResult<()> {
        let template = self.command()?;
        let quoted = shell_quote(&path.to_string_lossy());
        let command = if template.contains("{path}") {
            template.replace("{path}", &quoted)
        } else {
            format!("{template} {quoted}")
        };
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        std::process::Command::new(&shell)
            .arg("-lc")
            .arg(&command)
            .spawn()
            .map_err(|e| AppError::Worktree(format!("could not launch editor: {e}")))?;
        Ok(())
    }
}

/// The default editor command when none is configured: the first known GUI editor launcher
/// found on the **login-shell** PATH (so JetBrains Toolbox / Homebrew shims resolve even when
/// Blink starts from Finder), with `{path}` appended. Falls back to `code {path}`. Used only
/// until the user sets their own command in Settings.
fn default_editor_command() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let probe = "command -v webstorm || command -v code || command -v cursor \
                 || command -v idea || command -v zed || command -v subl";
    let found = std::process::Command::new(&shell)
        .arg("-lc")
        .arg(probe)
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
        });
    match found {
        // Prefer the bare launcher name — it's on the login-shell PATH we run under.
        Some(path) => {
            let prog = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or(path);
            format!("{prog} {{path}}")
        }
        None => "code {path}".to_string(),
    }
}
