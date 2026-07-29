use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::TaskGroup;
use crate::repository::Repository;

/// The settings key holding the inbox's active group filter. The capture windows
/// read it (via `get_active_task_group`) so new captures default to that group.
const ACTIVE_TASK_GROUP_KEY: &str = "active_task_group";

#[tauri::command]
pub fn list_task_groups(repository: State<'_, Repository>) -> AppResult<Vec<TaskGroup>> {
    repository.task_groups.list()
}

#[tauri::command]
pub fn create_task_group(repository: State<'_, Repository>, name: String) -> AppResult<TaskGroup> {
    repository.task_groups.create(&name)
}

#[tauri::command]
pub fn rename_task_group(
    repository: State<'_, Repository>,
    id: String,
    name: String,
) -> AppResult<TaskGroup> {
    repository.task_groups.rename(&id, &name)
}

/// Delete a group — its tasks fall back to ungrouped, and a stale active-filter
/// pointing at it is cleared so captures don't default to a dead group.
#[tauri::command]
pub fn delete_task_group(repository: State<'_, Repository>, id: String) -> AppResult<()> {
    repository.task_groups.delete(&id)?;
    if repository.settings.get(ACTIVE_TASK_GROUP_KEY)?.as_deref() == Some(id.as_str()) {
        repository.settings.remove(ACTIVE_TASK_GROUP_KEY)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_active_task_group(repository: State<'_, Repository>) -> AppResult<Option<String>> {
    repository.settings.get(ACTIVE_TASK_GROUP_KEY)
}

#[tauri::command]
pub fn set_active_task_group(
    repository: State<'_, Repository>,
    task_group_id: Option<String>,
) -> AppResult<()> {
    match task_group_id {
        Some(id) => repository.settings.set(ACTIVE_TASK_GROUP_KEY, &id),
        None => repository.settings.remove(ACTIVE_TASK_GROUP_KEY),
    }
}
