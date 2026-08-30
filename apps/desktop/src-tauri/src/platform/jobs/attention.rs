//! The worktree attention loop — the flagship dashboard's engine. On a fixed cadence it reads
//! the current attention snapshot (which [`AttentionService`] derives from the Claude Code
//! hook state files), pushes it to the webview as a `worktree-attention` event (driving the
//! per-row status dots and the "needs you" nav badge), and fires a **native notification**
//! when a worktree transitions into a state worth interrupting you for.
//!
//! Started once from [`super::start`]; runs for the app's lifetime. Reads window focus and
//! shows OS notifications — the reason background jobs live in `platform`, not `services`.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::core::models::{WorktreeAttention, WorktreeAttentionUpdate};
use crate::services::attention_service::AttentionService;

/// How often to read the panes. Fast enough to feel live, slow enough to stay cheap.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Start the attention poll loop. Fire-and-forget for the app's lifetime.
pub(super) fn start(app: AppHandle, attention_service: Arc<AttentionService>) {
    thread::spawn(move || {
        // The last attention seen per worktree — the transition detector. Seeded silently on
        // a worktree's first observation so a state that was already up at launch (or when a
        // worktree first appears) doesn't fire a notification out of nowhere.
        let mut previous: HashMap<String, WorktreeAttention> = HashMap::new();

        loop {
            let snapshot = attention_service.snapshot();

            // Suppress notifications while Blink is focused — the dots already show the state
            // there; only interrupt when it's in the background.
            let focused = app
                .get_webview_window("main")
                .and_then(|w| w.is_focused().ok())
                .unwrap_or(false);

            for update in &snapshot {
                let key = worktree_key(update);
                let prior = previous.get(&key).copied();
                if !focused && should_notify(prior, update.attention) {
                    notify(&app, update);
                }
            }

            previous = snapshot
                .iter()
                .map(|u| (worktree_key(u), u.attention))
                .collect();

            let _ = app.emit("worktree-attention", &snapshot);
            thread::sleep(POLL_INTERVAL);
        }
    });
}

/// Whether a transition from `prior` to `next` is worth a native notification. Only real
/// transitions notify (a session's first observation, where `prior` is `None`, never does):
///   - **needs-input** / **errored**: entering the state from anything else;
///   - **done**: specifically *finishing* — going idle straight from working, so a session
///     that was merely sitting idle doesn't announce itself.
fn should_notify(prior: Option<WorktreeAttention>, next: WorktreeAttention) -> bool {
    let Some(prior) = prior else {
        return false;
    };
    if prior == next {
        return false;
    }
    match next {
        WorktreeAttention::NeedsInput | WorktreeAttention::Errored => true,
        WorktreeAttention::Done => prior == WorktreeAttention::Working,
        WorktreeAttention::Working => false,
    }
}

/// A stable per-worktree key for transition detection (repo path + branch).
fn worktree_key(update: &WorktreeAttentionUpdate) -> String {
    format!("{}\n{}", update.repo, update.branch)
}

fn notify(app: &AppHandle, update: &WorktreeAttentionUpdate) {
    let repo = Path::new(&update.repo)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| update.repo.clone());
    let body = match update.attention {
        WorktreeAttention::NeedsInput => "Needs your input",
        WorktreeAttention::Done => "Finished — ready for you",
        WorktreeAttention::Errored => "Session errored",
        WorktreeAttention::Working => "Working",
    };
    let _ = app
        .notification()
        .builder()
        .title(format!("{repo} · {}", update.branch))
        .body(body)
        .show();
}
