use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};
use crate::services::task_service::{TaskPatch, TaskService};

#[tauri::command]
pub fn list_tasks(task_service: State<'_, TaskService>) -> AppResult<Vec<Task>> {
    task_service.list()
}

#[tauri::command]
pub fn save_task(task_service: State<'_, TaskService>, task: NewTask) -> AppResult<Task> {
    task_service.save(task)
}

#[tauri::command]
pub fn delete_task(task_service: State<'_, TaskService>, id: String) -> AppResult<()> {
    task_service.delete(&id)
}

/// Swap the inbox order of two tasks (moving `first` and `second` past each other).
#[tauri::command]
pub fn reorder_task(
    task_service: State<'_, TaskService>,
    first: String,
    second: String,
) -> AppResult<()> {
    task_service.reorder(&first, &second)
}

/// Patch a task's mutable fields — text, completion, link (empty clears it), the
/// displayed source label, the group (empty un-groups), and/or the `improved` flag.
/// Any omitted field is left untouched. The AI call that produces improved text is
/// its own command (`improve_text`).
#[tauri::command]
pub fn update_task(
    task_service: State<'_, TaskService>,
    id: String,
    text: Option<String>,
    completed: Option<bool>,
    link: Option<String>,
    source: Option<String>,
    improved: Option<bool>,
    task_group_id: Option<String>,
) -> AppResult<Task> {
    task_service.update(
        &id,
        TaskPatch {
            text,
            completed,
            link,
            source_name: source,
            improved,
            task_group_id,
        },
    )
}
