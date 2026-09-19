use serde::{Deserialize, Serialize};
use ts_rs::TS;

// These structs are the single source of truth for the app's data shapes. The
// `TS` derive generates the matching TypeScript into `apps/desktop/src/generated/`
// (run `cargo test` to regenerate), so the frontend types can never drift from
// the Rust core.

/// The signed-in account, as returned by the sync server's Better Auth endpoints.
/// Extra fields on the server user (emailVerified, image, timestamps) are ignored.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

/// Whether a sign-in/up attempt logged the user in, or the account still needs its
/// email verified (a code was sent) before sign-in is allowed.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum AuthStatus {
    Authenticated,
    VerificationRequired,
}

/// The outcome of a sign-in/up: `user` is present only when `status` is authenticated.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub status: AuthStatus,
    pub user: Option<AuthUser>,
}

/// Where a captured snippet came from — the "system metadata".
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    pub app_id: String,
    pub app_name: String,
    pub window_title: String,
    pub captured_at: String,
}

/// A sanitized snippet awaiting review — the DLP filter has already run.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CaptureDraft {
    pub text: String,
    pub original_length: usize,
    pub redaction_count: usize,
    pub source: CaptureSource,
    /// The source page URL when captured from a browser — pre-fills the link field.
    pub link: Option<String>,
}

/// Result of running the local security filter over a text.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SanitizeResult {
    pub clean: String,
    pub redaction_count: usize,
    pub matched: Vec<String>,
}

/// How long a task is expected to take. `Quick` is the ≤5-minute bucket: the inbox
/// collects those into their own section instead of leaving them interleaved with real
/// work, so they can be handled in one pass rather than one interruption each.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum TaskEffort {
    Quick,
    #[default]
    Standard,
    Deep,
}

impl TaskEffort {
    /// The stored (and wire) spelling — the same string `serde` emits, kept in one place
    /// so the column values and the generated TS union can't drift.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Quick => "quick",
            Self::Standard => "standard",
            Self::Deep => "deep",
        }
    }

    /// An unrecognized value (a row written by a newer version, or the pre-migration
    /// default) reads as the default rather than failing the whole query.
    pub fn from_stored(value: &str) -> Self {
        match value {
            "quick" => Self::Quick,
            "deep" => Self::Deep,
            _ => Self::Standard,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub text: String,
    /// The post-sanitization, pre-edit captured text — frozen at capture, never updated.
    pub raw_text: String,
    pub status: String,
    pub effort: TaskEffort,
    pub improved: bool,
    pub link: Option<String>,
    pub task_group_id: Option<String>,
    pub source: CaptureSource,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub text: String,
    /// The captured text before any edit or AI improve; the repository falls back to
    /// `text` when this is empty (a copy capture that opened blank and was typed into).
    pub raw_text: String,
    /// True when the text was already AI-optimized before saving (e.g. via the
    /// copy-capture "Optimize with AI" action), so the inbox won't offer it again.
    pub improved: bool,
    /// An optional web link entered in the capture panel.
    pub link: Option<String>,
    /// The group picked in the capture panel (defaults to the inbox's active filter).
    pub task_group_id: Option<String>,
    pub source: CaptureSource,
}

/// A user-defined task group (e.g. "Work", "Sport") — a task belongs to at most one.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaskGroup {
    pub id: String,
    pub name: String,
    pub context: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A group to create — the mutable fields the caller supplies (the id/timestamps are
/// minted on insert). Mirrors [`NewTask`].
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NewTaskGroup {
    pub name: String,
    /// Optional free-text context, folded into AI prompts for the group's tasks.
    pub context: Option<String>,
}

/// A git repository the worktree manager tracks. Persisted (as JSON) in `settings`,
/// not derived from disk — the user curates the list in the Settings page.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ManagedRepo {
    /// Display name — the repo directory's basename.
    pub name: String,
    /// Absolute path to the repo's main worktree.
    pub path: String,
    /// Ref new branches fork from; `None` = auto-detect (origin/HEAD → main|master → HEAD).
    pub base_branch: Option<String>,
}

/// A worktree branch's status — one flat set covering both sources. The first three are
/// what local git can tell (no fetch); the rest are the GitHub PR state. Resolved
/// server-side per branch: the PR state when the branch has a PR, otherwise the local one.
///
/// No local "merged": `git branch --merged` false-positives on freshly-created branches (a
/// new branch's tip is already an ancestor of base) and misses squash/rebase/non-default-base
/// merges — "merged" is only ever the GitHub PR state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum WorktreeStatus {
    /// No `origin/<branch>` — the branch exists only locally (never pushed).
    Local,
    /// `origin/<branch>` exists — pushed, no PR (or none fetched yet).
    Pushed,
    /// Its upstream was deleted on the remote (`[gone]`).
    Gone,
    /// Open draft PR.
    Draft,
    /// Open PR (ready for review).
    Open,
    /// Merged PR.
    Merged,
    /// PR closed without merging.
    Closed,
}

/// One linked worktree of a managed repo, as shown on the Worktrees page.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    /// The managed repo's path this worktree belongs to.
    pub repo: String,
    pub branch: String,
    pub path: String,
    /// The repo's main worktree (never removable from the UI).
    pub is_main: bool,
    /// Has uncommitted changes.
    pub is_dirty: bool,
    /// A tmux session for this worktree is currently running.
    pub session_live: bool,
    /// The branch's status: the GitHub PR state when it has a PR, otherwise the local git
    /// standing. Resolved server-side (`list_worktrees` merges both) so the client renders
    /// one field and never has to combine two sources.
    pub status: WorktreeStatus,
}


/// A worktree `prune` would remove, with the reason it qualifies. Shown in the
/// prune confirmation before anything is deleted.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PruneCandidate {
    pub branch: String,
    pub reason: String,
}

/// What a worktree's Claude session needs from you right now — derived by reading its
/// tmux pane. Drives the per-row status dot, the "needs you" nav badge, and native
/// notifications. Only computed for worktrees with a live session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum WorktreeAttention {
    /// Actively processing (the pane shows the interrupt hint).
    Working,
    /// Waiting for your approval/answer (a permission or plan prompt is up).
    NeedsInput,
    /// Idle at the prompt — finished, waiting for your next message.
    Done,
    /// The session died or an error surfaced in the pane.
    Errored,
}

/// An installed editor Blink detected on the login-shell PATH — offered in Settings so the
/// user can pick one instead of typing the launch command. `command` is the ready-to-store
/// value (`<launcher> {path}`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct EditorOption {
    /// Display name, e.g. "WebStorm".
    pub name: String,
    /// The editor command to store, e.g. "webstorm {path}".
    pub command: String,
}

/// An installed terminal Blink detected on the login-shell PATH — offered in Settings so the
/// user can pick one instead of typing the launch command. `command` is the ready-to-store
/// template (`<terminal> … tmux attach -t {session}`); unlike editors, each terminal has its
/// own syntax, so the command isn't uniform.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TerminalOption {
    /// Display name, e.g. "Alacritty".
    pub name: String,
    /// The terminal command to store, e.g. "alacritty -e tmux attach -t {session}".
    pub command: String,
}

/// One worktree's live attention state, identified by its repo + branch. Carried both by
/// the `worktree-attention` event (a full snapshot each tick) and the on-demand command.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WorktreeAttentionUpdate {
    /// The managed repo's path this worktree belongs to.
    pub repo: String,
    pub branch: String,
    pub attention: WorktreeAttention,
}
