//! macOS-specific platform integration. Exposes the OS interface the cross-platform
//! code in `platform/` expects: `record_source`, `copy_selection`, `on_run_event`.

mod accessibility;
mod frontmost;
mod input;

pub use input::copy_selection;

use tauri::{AppHandle, Manager, RunEvent};

use crate::core::state::PendingSource;

/// Detect the frontmost app/window and record it as the pending capture source,
/// before our panel takes focus.
pub fn record_source(app: &AppHandle) {
    if let Some(state) = app.try_state::<PendingSource>() {
        state.set(frontmost::detect_source());
    }
}

/// Open a URL in the user's default browser via the macOS `open` tool.
pub fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("open").arg(url).spawn().map(|_| ())
}

/// Open a Terminal.app window attached to the tmux `session` (running Claude). The
/// session must already exist — the worktree manager ensures it before calling this.
pub fn open_terminal(session: &str) -> std::io::Result<()> {
    let script = format!(
        "tell application \"Terminal\"\n\
           do script \"tmux attach -t {session}\"\n\
           activate\n\
         end tell"
    );
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .spawn()
        .map(|_| ())
}

/// Dock-icon reopen → bring the inbox back (the capture flow keeps it hidden).
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    if let RunEvent::Reopen { .. } = event {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.set_focus();
        }
    }
}
