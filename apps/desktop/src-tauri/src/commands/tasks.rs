use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NewTask, Task};
use crate::services::store::TaskStore;

#[tauri::command]
pub fn list_tasks(store: State<'_, Box<dyn TaskStore>>) -> AppResult<Vec<Task>> {
    store.list()
}

#[tauri::command]
pub fn save_task(store: State<'_, Box<dyn TaskStore>>, task: NewTask) -> AppResult<Task> {
    store.insert(task)
}

#[tauri::command]
pub fn delete_task(store: State<'_, Box<dyn TaskStore>>, id: String) -> AppResult<()> {
    store.delete(&id)
}

/// Improve a task's text with AI and persist the cleaned-up result, marking it
/// improved so it isn't offered again.
#[tauri::command]
pub async fn improve_task(
    store: State<'_, Box<dyn TaskStore>>,
    id: String,
    text: String,
) -> AppResult<Task> {
    let improved = crate::services::ai::improve(text).await?;
    store.mark_improved(&id, &improved)
}
