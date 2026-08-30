//! Stub platform integration for OSes without a dedicated module yet. Every entry
//! point is a no-op so the app still builds and runs; to add real support, create a
//! per-OS module (e.g. `windows`, `ios`) exposing these same functions and wire it
//! up with a `cfg` line in `mod.rs`.

use tauri::{AppHandle, RunEvent};

pub fn record_source(_app: &AppHandle) {}

pub fn copy_selection() {}

/// Best-effort open in the default browser via `xdg-open` (Linux/BSD).
pub fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
}

/// No supported terminal-launch on this OS yet — the worktree manager is macOS-first.
pub fn open_terminal(session: &str) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        format!("opening a terminal for tmux session '{session}' is not supported on this OS"),
    ))
}

pub fn on_run_event(_app: &AppHandle, _event: &RunEvent) {}
