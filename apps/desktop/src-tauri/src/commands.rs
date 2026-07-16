//! Tauri IPC surface. Each command is the Rust counterpart of a method in
//! `apps/desktop/src/lib/api.ts`.

use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::models::{CaptureDraft, CaptureSource, NewTask, SanitizeResult, Task};
use crate::security_filter;
use crate::store::Store;

/// Step 1–3: read the clipboard + system metadata, run the DLP filter, return a
/// review-ready draft. Nothing is persisted or transmitted here.
#[tauri::command]
pub fn capture_from_clipboard() -> CaptureDraft {
    // TODO(phase-1): read the real clipboard + foreground window via a Tauri
    // plugin / platform API. Stubbed so the capture flow is exercisable now.
    let raw = read_clipboard_stub();
    let result = security_filter::sanitize(&raw);

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
pub fn sanitize(text: String) -> SanitizeResult {
    security_filter::sanitize(&text)
}

#[tauri::command]
pub fn list_tasks(store: State<'_, Store>) -> Vec<Task> {
    store.list()
}

#[tauri::command]
pub fn save_task(store: State<'_, Store>, task: NewTask) -> Task {
    store.insert(task, Uuid::new_v4().to_string(), Utc::now().to_rfc3339())
}

#[tauri::command]
pub fn delete_task(store: State<'_, Store>, id: String) {
    store.delete(&id);
}

fn read_clipboard_stub() -> String {
    "Fix the login race condition\napi_key=sk_live_9fJ2kQ7bVmXpZ01aBcDeFg should be rotated"
        .to_string()
}
