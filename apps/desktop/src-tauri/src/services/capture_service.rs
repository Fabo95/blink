//! Copy-capture business logic. [`CaptureService`] turns the stashed selection into
//! a review-ready [`CaptureDraft`] and attaches the recorded source (or a clipboard
//! fallback when none was captured). Nothing is persisted or transmitted here.

use chrono::Utc;

use crate::core::models::{CaptureDraft, CaptureSource};
use crate::core::state::FrontmostSource;

pub struct CaptureService;

impl CaptureService {
    pub fn new() -> Self {
        Self
    }

    /// Build the review-ready draft from the stashed selection + frontmost source.
    pub fn draft(&self, raw: Option<String>, front: Option<FrontmostSource>) -> CaptureDraft {
        let link = front.as_ref().and_then(|f| f.url.clone());
        CaptureDraft {
            // Empty stash (nothing selected, or a non-text clipboard) → empty capture.
            text: raw.unwrap_or_default(),
            source: front
                .map(capture_source_from)
                .unwrap_or_else(fallback_capture_source),
            link,
        }
    }
}

fn capture_source_from(front: FrontmostSource) -> CaptureSource {
    CaptureSource {
        app_id: front.app_id,
        app_name: front.app_name,
        window_title: front.window_title,
        captured_at: Utc::now().to_rfc3339(),
    }
}

fn fallback_capture_source() -> CaptureSource {
    CaptureSource {
        app_id: "clipboard".to_string(),
        app_name: "Clipboard".to_string(),
        window_title: String::new(),
        captured_at: Utc::now().to_rfc3339(),
    }
}
