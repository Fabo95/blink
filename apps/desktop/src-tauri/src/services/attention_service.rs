//! Worktree-attention snapshots — the read side of the attention dashboard. The Claude Code
//! hooks installed by [`crate::services::hook_service`] drop one JSON state file per session
//! (`{session_id, cwd, state, ts}`) into `attention_dir`; this service reads them, keeps the
//! freshest per `cwd`, drops stale ones, and matches each `cwd` to a managed repo's worktree
//! path — yielding the live attention of every worktree. Composes [`RepoService`] (the repo
//! list) + [`WorktreeService`] (the worktrees per repo). Held as clones so it runs off the
//! main thread in the background loop ([`crate::platform::jobs`]) and backs the command.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::core::models::{WorktreeAttention, WorktreeAttentionUpdate};
use crate::services::repo_service::RepoService;
use crate::services::worktree_service::WorktreeService;

/// A session state file is ignored once older than this — a crashed Claude never fires its
/// closing event, so a stale "working" would otherwise linger forever. The row falls back to
/// its plain live/idle dot.
const STALE_SECS: u64 = 900;

/// One `<session_id>.json` written by the hook script.
#[derive(Deserialize)]
struct SessionState {
    cwd: String,
    state: String,
    ts: u64,
}

#[derive(Clone)]
pub struct AttentionService {
    repo_service: RepoService,
    worktree_service: WorktreeService,
    attention_dir: PathBuf,
}

impl AttentionService {
    pub fn new(
        repo_service: RepoService,
        worktree_service: WorktreeService,
        attention_dir: PathBuf,
    ) -> Self {
        Self {
            repo_service,
            worktree_service,
            attention_dir,
        }
    }

    /// The current attention of every managed worktree with a fresh hook state. Best effort —
    /// a missing dir / repo list yields an empty snapshot, since this feeds a background loop
    /// and a status UI, not a user action.
    pub fn snapshot(&self) -> Vec<WorktreeAttentionUpdate> {
        let by_cwd = self.states_by_cwd();
        if by_cwd.is_empty() {
            return Vec::new();
        }
        let Ok(repos) = self.repo_service.list() else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for repo in &repos {
            let Ok(worktrees) = self.worktree_service.list(repo) else {
                continue;
            };
            for worktree in worktrees {
                if worktree.is_main {
                    continue;
                }
                if let Some(attention) = by_cwd.get(&worktree.path) {
                    out.push(WorktreeAttentionUpdate {
                        repo: repo.path.clone(),
                        branch: worktree.branch,
                        attention: *attention,
                    });
                }
            }
        }
        out
    }

    /// Read the state dir into a `cwd → attention` map, keeping the freshest fresh-enough
    /// state per cwd. (Two Claude sessions on one worktree is unusual, but the newest wins.)
    fn states_by_cwd(&self) -> HashMap<String, WorktreeAttention> {
        let Ok(entries) = std::fs::read_dir(&self.attention_dir) else {
            return HashMap::new();
        };
        let now = now_secs();
        let mut best: HashMap<String, (u64, WorktreeAttention)> = HashMap::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            let Ok(state) = serde_json::from_str::<SessionState>(&text) else {
                continue;
            };
            if now.saturating_sub(state.ts) > STALE_SECS {
                continue;
            }
            let Some(attention) = parse_attention(&state.state) else {
                continue;
            };
            match best.get(&state.cwd) {
                Some((ts, _)) if *ts >= state.ts => {}
                _ => {
                    best.insert(state.cwd, (state.ts, attention));
                }
            }
        }
        best.into_iter().map(|(cwd, (_, a))| (cwd, a)).collect()
    }
}

fn parse_attention(state: &str) -> Option<WorktreeAttention> {
    match state {
        "working" => Some(WorktreeAttention::Working),
        "needs-input" => Some(WorktreeAttention::NeedsInput),
        "done" => Some(WorktreeAttention::Done),
        "errored" => Some(WorktreeAttention::Errored),
        _ => None,
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
