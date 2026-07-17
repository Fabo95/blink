use tauri::State;

use crate::error::AppResult;
use crate::models::{NewTask, Task};
use crate::store::TaskStore;

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
