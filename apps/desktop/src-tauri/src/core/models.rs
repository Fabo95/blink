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

/// Whether the encryption vault is ready on this device, or which screen the sync
/// setup flow should show. Checked after sign-in to gate the inbox.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum VaultStatus {
    /// The VMK is available — sync works, show the app.
    Unlocked,
    /// No keyset on the server yet — first-time setup (choose a master password, get a
    /// Secret Key).
    NeedsSetup,
    /// A keyset exists — unlock on this device (master password + Secret Key).
    NeedsUnlock,
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub text: String,
    /// The post-sanitization, pre-edit captured text — frozen at capture, never updated.
    pub raw_text: String,
    pub status: String,
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
    pub created_at: String,
    pub updated_at: String,
}
