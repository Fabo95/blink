use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NoteLink, NoteRelation};
use crate::services::link_service::LinkService;

/// Every link touching a note, in either direction.
#[tauri::command]
pub fn list_note_links(
    link_service: State<'_, LinkService>,
    note_id: String,
) -> AppResult<Vec<NoteLink>> {
    link_service.links(&note_id)
}

/// Link two notes: `from` supports, contradicts, or relates to `to`.
#[tauri::command]
pub fn link_notes(
    link_service: State<'_, LinkService>,
    from_note_id: String,
    to_note_id: String,
    relation: NoteRelation,
) -> AppResult<NoteLink> {
    link_service.link(&from_note_id, &to_note_id, relation)
}

#[tauri::command]
pub fn unlink_notes(link_service: State<'_, LinkService>, id: String) -> AppResult<()> {
    link_service.unlink(&id)
}
