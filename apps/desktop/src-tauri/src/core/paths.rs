//! Small path helpers shared across services.

use std::collections::HashSet;

/// Expand a leading `~/` to the user's home directory. Non-tilde paths pass through
/// unchanged (as does `~/…` when `HOME` is unset).
pub fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

/// Single-quote a string for safe interpolation into a shell command (e.g. a tmux
/// `send-keys` line, or a hook `command`). Guards paths containing spaces — the app's data
/// dir lives under `~/Library/Application Support/…` — and any embedded single quotes.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Which of `binaries` resolve on the user's **login-shell** PATH — one `$SHELL -lc`
/// invocation, so Homebrew / JetBrains Toolbox shims are seen even under Finder's minimal
/// launchd PATH. Used to detect installed editors/terminals for the Settings pickers. Best
/// effort: a shell failure yields an empty set. Exit status is ignored (it reflects only the
/// last `command -v`, non-zero whenever that one is absent).
pub fn resolve_on_login_path(binaries: &[&str]) -> HashSet<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let script = binaries
        .iter()
        .map(|bin| format!("command -v {bin} >/dev/null 2>&1 && echo {bin}"))
        .collect::<Vec<_>>()
        .join("\n");
    std::process::Command::new(&shell)
        .arg("-lc")
        .arg(&script)
        .output()
        .ok()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default()
}
