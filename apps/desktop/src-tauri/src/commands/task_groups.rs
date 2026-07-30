use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::TaskGroup;
use crate::services::task_group_service::TaskGroupService;

#[tauri::command]
pub fn list_task_groups(
    task_group_service: State<'_, TaskGroupService>,
) -> AppResult<Vec<TaskGroup>> {
    task_group_service.list()
}

#[tauri::command]
pub fn create_task_group(
    task_group_service: State<'_, TaskGroupService>,
    name: String,
) -> AppResult<TaskGroup> {
    task_group_service.create(&name)
}

#[tauri::command]
pub fn rename_task_group(
    task_group_service: State<'_, TaskGroupService>,
    id: String,
    name: String,
) -> AppResult<TaskGroup> {
    task_group_service.rename(&id, &name)
}

/// Delete a group — its tasks fall back to ungrouped, and a stale active-filter
/// pointing at it is cleared so captures don't default to a dead group.
#[tauri::command]
pub fn delete_task_group(
    task_group_service: State<'_, TaskGroupService>,
    id: String,
) -> AppResult<()> {
    task_group_service.delete(&id)
}

#[tauri::command]
pub fn get_active_task_group(
    task_group_service: State<'_, TaskGroupService>,
) -> AppResult<Option<String>> {
    task_group_service.active_task_group()
}

#[tauri::command]
pub fn set_active_task_group(
    task_group_service: State<'_, TaskGroupService>,
    task_group_id: Option<String>,
) -> AppResult<()> {
    task_group_service.set_active_task_group(task_group_id)
}
