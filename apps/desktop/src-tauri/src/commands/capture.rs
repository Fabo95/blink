use chrono::Utc;
use tauri::State;

use crate::models::{CaptureDraft, CaptureSource, SanitizeResult};
use crate::security::SecurityFilter;

/// Step 1–3: read the clipboard + system metadata, run the DLP filter, return a
/// review-ready draft. Nothing is persisted or transmitted here.
#[tauri::command]
pub fn capture_from_clipboard(filter: State<'_, SecurityFilter>) -> CaptureDraft {
    // TODO(phase-1): read the real clipboard + foreground window via a platform
    // API. Stubbed so the capture flow is exercisable now.
    let raw = read_clipboard_stub();
    let result = filter.sanitize(&raw);

    CaptureDraft {
        text: result.clean,
        original_length: raw.chars().count(),
        redaction_count: result.redaction_count,
        source: CaptureSource {
            app_id: "com.tinyspeck.slackmacgap".to_string(),
            window_title: "engineering — Slack".to_string(),
            captured_at: Utc::now().to_rfc3339(),
        },
    }
}

#[tauri::command]
pub fn sanitize(filter: State<'_, SecurityFilter>, text: String) -> SanitizeResult {
    filter.sanitize(&text)
}

fn read_clipboard_stub() -> String {
    "Fix the login race condition\napi_key=sk_live_9fJ2kQ7bVmXpZ01aBcDeFg should be rotated"
        .to_string()
}
