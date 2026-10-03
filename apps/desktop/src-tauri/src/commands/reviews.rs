use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{Note, NoteReview, ReviewDecision, ReviewOutcome};
use crate::services::review_service::ReviewService;

/// Ideas and thoughts due for review now, most overdue first.
#[tauri::command]
pub fn list_due_notes(review_service: State<'_, ReviewService>) -> AppResult<Vec<Note>> {
    review_service.due()
}

/// Every review a note was given, oldest first.
#[tauri::command]
pub fn list_note_reviews(
    review_service: State<'_, ReviewService>,
    note_id: String,
) -> AppResult<Vec<NoteReview>> {
    review_service.reviews(&note_id)
}

/// Record a review (conviction 1 to 5, optional comment) and apply its decision: keep and
/// reschedule, drop, or promote into an inbox task.
#[tauri::command]
pub fn review_note(
    review_service: State<'_, ReviewService>,
    note_id: String,
    conviction: i64,
    comment: Option<String>,
    decision: ReviewDecision,
) -> AppResult<ReviewOutcome> {
    review_service.review(&note_id, conviction, comment.as_deref(), decision)
}
