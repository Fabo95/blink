use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NewTaskGroup, TaskGroup};
use crate::services::task_group_service::{TaskGroupPatch, TaskGroupService};

#[tauri::command]
pub fn list_task_groups(
    task_group_service: State<'_, TaskGroupService>,
) -> AppResult<Vec<TaskGroup>> {
    task_group_service.list()
}

#[tauri::command]
pub fn create_task_group(
    task_group_service: State<'_, TaskGroupService>,
    group: NewTaskGroup,
) -> AppResult<TaskGroup> {
    task_group_service.create(group)
}

/// Patch a group's mutable fields — its name and/or its context (the guidance folded into
/// the system prompt when generating a task's AI prompt; an empty value clears it). Any
/// omitted field is left untouched.
#[tauri::command]
pub fn update_task_group(
    task_group_service: State<'_, TaskGroupService>,
    id: String,
    name: Option<String>,
    context: Option<String>,
) -> AppResult<TaskGroup> {
    task_group_service.update(&id, TaskGroupPatch { name, context })
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
