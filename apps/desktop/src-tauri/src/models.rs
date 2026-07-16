use serde::{Deserialize, Serialize};

/// Mirrors `CaptureSource` in `@blink/core` — the system metadata attached to a
/// captured snippet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    pub app_id: String,
    pub window_title: String,
    pub captured_at: String,
}

/// A sanitized snippet awaiting review — the DLP filter has already run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDraft {
    pub text: String,
    pub original_length: usize,
    pub redaction_count: usize,
    pub source: CaptureSource,
}

/// Result of running the local security filter over a text.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeResult {
    pub clean: String,
    pub redaction_count: usize,
    pub matched: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub source: CaptureSource,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub title: String,
    pub body: String,
    pub source: CaptureSource,
}
