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
    /// Set only by the retired note-review promote flow (older tasks still carry it);
    /// capture never sends it.
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

/// What kind of content left the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum EgressKind {
    /// Text sent to the AI provider to improve it (task or note).
    AiImprove,
    /// A task's text sent to the AI provider to write a prompt.
    AiPrompt,
    /// A fetched page excerpt sent to the AI provider to summarize a source. Source
    /// enrichment is gone; kept so older egress rows still label correctly.
    AiSummary,
    /// A source's page fetched (a request to its host, nothing of yours sent). Kept for
    /// older egress rows, like `AiSummary`.
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
    /// Shell command run in a **new** worktree before Claude starts (e.g. `pnpm i`); `{repo}`
    /// is the main checkout's path. `None` = no setup.
    pub setup_command: Option<String>,
}

/// A recent Claude conversation from one of a repo's checkouts, offered for carrying over into
/// a new worktree (`claude --resume <id> --fork-session`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConversation {
    pub session_id: String,
    /// The conversation's first prompt, shortened — enough to recognise it.
    pub preview: String,
    /// When the transcript was last written (RFC 3339, UTC).
    pub updated_at: String,
    /// The branch of the checkout it ran in.
    pub origin: String,
    /// It ran in the main checkout, not a linked worktree.
    pub from_main: bool,
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

/// Where an Incoming item comes from. Each has an [`crate::core::incoming_provider`]
/// implementation that reads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum IncomingSource {
    Github,
    Slack,
    Linear,
    BetterStack,
}

impl IncomingSource {
    /// The stable spelling used in item ids (`github:123`) and task sources.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Github => "github",
            Self::Slack => "slack",
            Self::Linear => "linear",
            Self::BetterStack => "betterStack",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Github => "GitHub",
            Self::Slack => "Slack",
            Self::Linear => "Linear",
            Self::BetterStack => "Better Stack",
        }
    }

    /// The id of an item from this source: `<source>:<id at the source>`.
    pub fn item_id(self, source_id: &str) -> String {
        format!("{}:{source_id}", self.as_str())
    }
}

/// Something from an external source that wants your attention (a review request, a Slack
/// DM, an incident, …) — the one shape every source maps into. Read-only at the source:
/// archiving it only hides it in Blink until it changes.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct IncomingItem {
    /// `<source>:<source id>` (see [`IncomingSource::item_id`]), stable across polls.
    pub id: String,
    pub source: IncomingSource,
    /// Why it's here, in a few words (`review requested`, `mentioned`, `incident`, …).
    pub reason: String,
    pub title: String,
    /// Where it lives: the GitHub repo, the Slack channel or sender, the Linear team, …
    pub context: String,
    pub url: String,
    /// When it last changed at the source (RFC 3339, UTC).
    pub updated_at: String,
    /// Worth interrupting you for (an incident, a DM): a native notification fires when it
    /// first appears. Everything else waits quietly in the list.
    pub urgent: bool,
}

/// The Incoming feed: the items still waiting on you, plus one error line per source that
/// couldn't be read (so a missing `gh` login shows up instead of an empty list).
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct IncomingFeed {
    pub items: Vec<IncomingItem>,
    pub errors: Vec<String>,
}

/// How an Incoming source is signed in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum SourceAuth {
    /// Rides on the `gh` CLI's own login; managed outside Blink.
    GhCli,
    /// A key pasted in Blink, kept in the keychain; set, replaced, and removed in Settings.
    ApiKey,
}

/// The profile a source is signed in as — the same shape for every source.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SourceAccount {
    pub name: String,
    /// `@login` or an email.
    pub handle: Option<String>,
    /// The company / workspace the account belongs to, when the source says.
    pub organization: Option<String>,
    pub avatar_url: Option<String>,
}

/// One source's connection, checked live: who it's signed in as and how — what Settings →
/// Sources shows for every source alike.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SourceConnection {
    pub source: IncomingSource,
    pub auth: SourceAuth,
    pub connected: bool,
    pub account: Option<SourceAccount>,
    /// A safe glimpse of the credential (`lin_api_…a1b2`, `gh · github.com`), never the secret.
    pub credential_hint: Option<String>,
    /// Why it isn't connected, or why the live check failed (e.g. a revoked key).
    pub problem: Option<String>,
}

/// A task started in a worktree (`w` on a task): which repo + branch it lives in. Device-local.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaskWorktree {
    pub task_id: String,
    /// The task's text, so the Worktrees page can show what a worktree is for.
    pub task_text: String,
    pub repo_path: String,
    pub branch: String,
}

/// Which slice of Claude Code usage a report covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum UsageRange {
    Today,
    Week,
    Month,
    All,
}

/// Claude Code token usage summed over a set of replies (each reply counted once), with its
/// cost estimated at API list prices.
#[derive(Debug, Clone, Default, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    #[ts(type = "number")]
    pub input_tokens: i64,
    /// Includes the thinking tokens (billed as output).
    #[ts(type = "number")]
    pub output_tokens: i64,
    #[ts(type = "number")]
    pub thinking_tokens: i64,
    #[ts(type = "number")]
    pub cache_write_tokens: i64,
    #[ts(type = "number")]
    pub cache_read_tokens: i64,
    /// Share of all input tokens served from the cache (0–1).
    pub cache_hit_rate: f64,
    pub cost_usd: f64,
    pub replies: u32,
    pub web_searches: u32,
    pub web_fetches: u32,
}

/// One row of a usage breakdown (a day, a model, a repo + branch).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UsageGroup {
    pub label: String,
    pub detail: Option<String>,
    pub totals: UsageTotals,
}

/// One Claude Code session (its sub-agents included).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UsageSession {
    pub session_id: String,
    /// The session's first prompt.
    pub title: String,
    pub repo: String,
    pub branch: Option<String>,
    pub last_active: String,
    pub totals: UsageTotals,
}

/// Claude Code usage on this Mac for one range, read from Claude's own transcripts.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub range: UsageRange,
    pub totals: UsageTotals,
    pub sessions: u32,
    /// Newest day first.
    pub by_day: Vec<UsageGroup>,
    pub by_model: Vec<UsageGroup>,
    /// Repo + branch, most expensive first.
    pub by_repo: Vec<UsageGroup>,
    pub top_sessions: Vec<UsageSession>,
    /// Models seen with tokens but no known price (left out of the cost).
    pub unpriced_models: Vec<String>,
    /// The earliest reply in the store — how far back "all" reaches.
    pub first_seen: Option<String>,
}
