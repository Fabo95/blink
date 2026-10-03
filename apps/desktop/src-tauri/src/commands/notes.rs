use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NewNote, Note, NoteRevision, NoteType};
use crate::services::note_service::{NotePatch, NoteService};

#[tauri::command]
pub fn list_notes(note_service: State<'_, NoteService>) -> AppResult<Vec<Note>> {
    note_service.list()
}

/// Full-text search over every live note, best match first.
#[tauri::command]
pub fn search_notes(note_service: State<'_, NoteService>, query: String) -> AppResult<Vec<Note>> {
    note_service.search(&query)
}

#[tauri::command]
pub fn save_note(note_service: State<'_, NoteService>, note: NewNote) -> AppResult<Note> {
    note_service.save(note)
}

/// Patch a note's mutable fields. Any omitted field is left untouched; an empty `link` or
/// `topic_id` clears it. A text change keeps the previous text as a revision.
#[tauri::command]
pub fn update_note(
    note_service: State<'_, NoteService>,
    id: String,
    text: Option<String>,
    note_type: Option<NoteType>,
    link: Option<String>,
    topic_id: Option<String>,
    improved: Option<bool>,
    source: Option<String>,
) -> AppResult<Note> {
    note_service.update(
        &id,
        NotePatch {
            text,
            note_type,
            link,
            topic_id,
            improved,
            source_name: source,
        },
    )
}

/// Fetch and summarize a source again (after a failure, or to refresh it).
#[tauri::command]
pub fn retry_enrichment(note_service: State<'_, NoteService>, id: String) -> AppResult<Note> {
    note_service.request_enrichment(&id)
}

#[tauri::command]
pub fn delete_note(note_service: State<'_, NoteService>, id: String) -> AppResult<()> {
    note_service.delete(&id)
}

/// A note's revisions, newest first. Also clears the note's conflict marker: opening the
/// history is how the user sees a conflict.
#[tauri::command]
pub fn note_history(
    note_service: State<'_, NoteService>,
    id: String,
) -> AppResult<Vec<NoteRevision>> {
    note_service.history(&id)
}

#[tauri::command]
pub fn restore_note_revision(
    note_service: State<'_, NoteService>,
    note_id: String,
    revision_id: String,
) -> AppResult<Note> {
    note_service.restore_revision(&note_id, &revision_id)
}
