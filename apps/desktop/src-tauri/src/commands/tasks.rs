use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};
use crate::repository::{Repository, TaskPatch};

#[tauri::command]
pub fn list_tasks(repository: State<'_, Repository>) -> AppResult<Vec<Task>> {
    repository.tasks.list()
}

#[tauri::command]
pub fn save_task(repository: State<'_, Repository>, task: NewTask) -> AppResult<Task> {
    repository.tasks.insert(task)
}

#[tauri::command]
pub fn delete_task(repository: State<'_, Repository>, id: String) -> AppResult<()> {
    repository.tasks.delete(&id)
}

/// Patch a task's mutable fields — text (which also clears the improved flag),
/// completion, link (empty clears it), and/or the displayed source label. Any omitted
/// field is left untouched. AI improvement is its own async command.
#[tauri::command]
pub fn update_task(
    repository: State<'_, Repository>,
    id: String,
    text: Option<String>,
    completed: Option<bool>,
    link: Option<String>,
    source: Option<String>,
) -> AppResult<Task> {
    repository.tasks.update(
        &id,
        TaskPatch {
            text,
            completed,
            link,
            source_name: source,
        },
    )
}

/// Improve a task's text with AI and persist the cleaned-up result, marking it
/// improved so it isn't offered again.
#[tauri::command]
pub async fn improve_task(
    repository: State<'_, Repository>,
    id: String,
    text: String,
) -> AppResult<Task> {
    let improved = crate::services::ai::improve(text).await?;
    repository.tasks.mark_improved(&id, &improved)
}
