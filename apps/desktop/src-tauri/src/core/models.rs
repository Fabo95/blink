use serde::{Deserialize, Serialize};
use ts_rs::TS;

// These structs are the single source of truth for the app's data shapes. The
// `TS` derive generates the matching TypeScript into `apps/desktop/src/generated/`
// (run `cargo test` to regenerate), so the frontend types can never drift from
// the Rust core.

/// Where a captured snippet came from — the "system metadata".
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    pub app_id: String,
    pub app_name: String,
    pub window_title: String,
    pub captured_at: String,
}

/// A sanitized snippet awaiting review — the DLP filter has already run.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CaptureDraft {
    pub text: String,
    pub original_length: usize,
    pub redaction_count: usize,
    pub source: CaptureSource,
}

/// Result of running the local security filter over a text.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SanitizeResult {
    pub clean: String,
    pub redaction_count: usize,
    pub matched: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub text: String,
    pub status: String,
    /// Whether the text has already been cleaned up by the AI optimizer.
    pub improved: bool,
    pub source: CaptureSource,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub text: String,
    /// True when the text was already AI-optimized before saving (e.g. via the
    /// copy-capture "Optimize with AI" action), so the inbox won't offer it again.
    pub improved: bool,
    pub source: CaptureSource,
}
