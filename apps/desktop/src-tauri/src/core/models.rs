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

/// A captured snippet awaiting review in the copy-capture panel.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CaptureDraft {
    pub text: String,
    pub source: CaptureSource,
    /// The source page URL when captured from a browser — pre-fills the link field.
    pub link: Option<String>,
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
    /// The pre-edit captured text — frozen at capture, never updated.
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
    /// The idea this task was promoted from, if any.
    pub origin_note_id: Option<String>,
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
    /// Set only when a review promotes a note into a task; capture never sends it.
    #[serde(default)]
    #[ts(optional)]
    pub origin_note_id: Option<String>,
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

/// What a captured note is. Ideas and thoughts are the user's own words; a source is
/// external evidence (a link or quote) and is never rewritten by AI.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum NoteType {
    #[default]
    Idea,
    Thought,
    Source,
}

impl NoteType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idea => "idea",
            Self::Thought => "thought",
            Self::Source => "source",
        }
    }

    /// An unrecognized value (a row written by a newer version) reads as the default
    /// rather than failing the whole query.
    pub fn from_stored(value: &str) -> Self {
        match value {
            "thought" => Self::Thought,
            "source" => Self::Source,
            _ => Self::Idea,
        }
    }
}

/// Where a note stands after review. Dropped notes stay searchable but leave the sections;
/// promoted ones became a task and keep being reviewed.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum NoteStatus {
    #[default]
    Open,
    Promoted,
    Dropped,
}

impl NoteStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Promoted => "promoted",
            Self::Dropped => "dropped",
        }
    }

    pub fn from_stored(value: &str) -> Self {
        match value {
            "promoted" => Self::Promoted,
            "dropped" => Self::Dropped,
            _ => Self::Open,
        }
    }
}

/// Where a topic stands. The user's own call, shown in the topic header.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum TopicStatus {
    #[default]
    Exploring,
    Pursuing,
    Parked,
    Dropped,
}

impl TopicStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Exploring => "exploring",
            Self::Pursuing => "pursuing",
            Self::Parked => "parked",
            Self::Dropped => "dropped",
        }
    }

    pub fn from_stored(value: &str) -> Self {
        match value {
            "pursuing" => Self::Pursuing,
            "parked" => Self::Parked,
            "dropped" => Self::Dropped,
            _ => Self::Exploring,
        }
    }
}

/// How sensitive a topic's notes are. `Confidential` blocks every path that would send
/// note content off the device (AI) and keeps the topic out of bulk exports. Enforced in
/// the Rust core by `PolicyService`, never only in the UI.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum Sensitivity {
    #[default]
    Personal,
    Internal,
    Confidential,
}

impl Sensitivity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Personal => "personal",
            Self::Internal => "internal",
            Self::Confidential => "confidential",
        }
    }

    /// An unrecognized value reads as `Confidential`: failing closed is the safe
    /// direction for a privacy label.
    pub fn from_stored(value: &str) -> Self {
        match value {
            "personal" => Self::Personal,
            "internal" => Self::Internal,
            _ => Self::Confidential,
        }
    }
}

/// A research thread that groups notes, with a guiding question the notes try to answer.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Topic {
    pub id: String,
    pub name: String,
    pub question: Option<String>,
    pub status: TopicStatus,
    pub sensitivity: Sensitivity,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NewTopic {
    pub name: String,
    pub question: Option<String>,
    pub sensitivity: Sensitivity,
}

/// One captured piece of thinking: an idea, a thought, or a source.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub note_type: NoteType,
    pub text: String,
    /// The pre-edit captured text, frozen at capture and never updated.
    pub raw_text: String,
    pub link: Option<String>,
    pub topic_id: Option<String>,
    pub improved: bool,
    /// A sync pull overwrote an unsynced local edit; the lost text is kept as a conflict
    /// revision. Device-local, cleared once the user opens the note's history.
    pub conflict: bool,
    pub status: NoteStatus,
    /// When the note comes back for review; `None` = not scheduled (sources, or a note
    /// rated 1).
    pub revisit_at: Option<String>,
    /// Every conviction (1 to 5) the note was given, oldest first.
    #[ts(type = "Array<number>")]
    pub conviction_history: Vec<i64>,
    /// A hint derived from the history (promote or drop), computed in the core so the rule
    /// lives in one place.
    pub review_nudge: Option<ReviewNudge>,
    /// Sources only: the fetched page's title, a short excerpt, and an AI
    /// summary (never for confidential topics or private hosts).
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub summary: Option<String>,
    pub enrichment: Enrichment,
    /// How many notes point at this one as evidence. Computed from links, never stored.
    pub evidence: Evidence,
    pub source: CaptureSource,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NewNote {
    pub note_type: NoteType,
    pub text: String,
    /// The captured text before any edit or AI improve; falls back to `text` when empty.
    pub raw_text: String,
    pub improved: bool,
    pub link: Option<String>,
    pub topic_id: Option<String>,
    pub source: CaptureSource,
}

/// Why a revision exists: the user edited the text, or a sync pull overwrote an
/// unsynced local edit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum RevisionReason {
    Edit,
    Conflict,
}

impl RevisionReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Edit => "edit",
            Self::Conflict => "conflict",
        }
    }

    pub fn from_stored(value: &str) -> Self {
        match value {
            "conflict" => Self::Conflict,
            _ => Self::Edit,
        }
    }
}

/// A note's previous text, kept on every edit. Append-only: a revision is never changed,
/// only tombstoned together with its note.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NoteRevision {
    pub id: String,
    pub note_id: String,
    pub text: String,
    pub reason: RevisionReason,
    pub created_at: String,
}

/// Where a source's background enrichment (page fetch + summary) stands.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum Enrichment {
    /// Not a source with a link, so nothing to fetch.
    #[default]
    None,
    Pending,
    Done,
    /// Gave up after repeated failures; `g` on the note retries.
    Failed,
    /// Not fetched on purpose: the note's topic is confidential.
    Skipped,
}

impl Enrichment {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Pending => "pending",
            Self::Done => "done",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }

    pub fn from_stored(value: &str) -> Self {
        match value {
            "pending" => Self::Pending,
            "done" => Self::Done,
            "failed" => Self::Failed,
            "skipped" => Self::Skipped,
            _ => Self::None,
        }
    }
}

/// How one note bears on another: `from` supports, contradicts, or relates to `to`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum NoteRelation {
    Supports,
    Contradicts,
    Related,
}

impl NoteRelation {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Supports => "supports",
            Self::Contradicts => "contradicts",
            Self::Related => "related",
        }
    }

    pub fn from_stored(value: &str) -> Self {
        match value {
            "supports" => Self::Supports,
            "contradicts" => Self::Contradicts,
            _ => Self::Related,
        }
    }
}

/// A typed link between two notes. Append-only like reviews: removing one tombstones it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    pub id: String,
    pub from_note_id: String,
    pub to_note_id: String,
    pub relation: NoteRelation,
    pub created_at: String,
}

/// The evidence a note has collected: incoming `supports` / `contradicts` links, and
/// `related` links in either direction.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub supports: u32,
    pub contradicts: u32,
    pub related: u32,
}

/// What kind of content left the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum EgressKind {
    /// Text sent to the AI provider to improve it (task or note).
    AiImprove,
    /// A task's text sent to the AI provider to write a prompt.
    AiPrompt,
    /// A fetched page excerpt sent to the AI provider to summarize a source.
    AiSummary,
    /// A source's page fetched (a request to its host, nothing of yours sent).
    PageFetch,
}

impl EgressKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AiImprove => "aiImprove",
            Self::AiPrompt => "aiPrompt",
            Self::AiSummary => "aiSummary",
            Self::PageFetch => "pageFetch",
        }
    }

    pub fn from_stored(value: &str) -> Self {
        match value {
            "aiPrompt" => Self::AiPrompt,
            "aiSummary" => Self::AiSummary,
            "pageFetch" => Self::PageFetch,
            _ => Self::AiImprove,
        }
    }
}

/// One record of something leaving the device: when, what kind, to where, and how much.
/// Never the content itself. Device-local, never synced.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct EgressEvent {
    pub id: String,
    pub kind: EgressKind,
    /// The host the request went to, e.g. `api.openai.com`.
    pub destination: String,
    pub note_id: Option<String>,
    /// Characters of your content sent (0 for a page fetch).
    #[ts(type = "number")]
    pub bytes: i64,
    pub created_at: String,
}

/// One dated judgement of a note. Append-only and per person: a review is never edited.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NoteReview {
    pub id: String,
    pub note_id: String,
    /// 1 (not convinced) to 5 (very convinced). Serialized as a JSON number; ts-rs would
    /// otherwise type an `i64` as `bigint`.
    #[ts(type = "number")]
    pub conviction: i64,
    pub comment: Option<String>,
    pub reviewed_at: String,
}

/// What a review does with the note besides recording the conviction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum ReviewDecision {
    /// Keep the note and schedule its next review from the conviction.
    Keep,
    /// Stop reviewing it; it stays searchable.
    Drop,
    /// Turn it into a validation task in the inbox; it keeps being reviewed.
    Promote,
}

/// A hint the review popover shows from the note's conviction history.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum ReviewNudge {
    /// Rated 4 or higher three times in a row: time to act on it.
    Promote,
    /// Rated 1, or 2 or lower twice in a row: probably not worth keeping.
    Drop,
}

/// The result of a review: the updated note, and the task when it was promoted.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ReviewOutcome {
    pub note: Note,
    pub task: Option<Task>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Markdown,
    Json,
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
