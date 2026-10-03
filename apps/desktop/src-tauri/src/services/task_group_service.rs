//! Task-group business logic. [`TaskGroupService`] fronts the
//! [`TaskGroupsRepository`] and also owns the inbox's active group filter (a
//! `settings` entry), so deleting a group can clear a stale filter in one place.

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::{NewTaskGroup, TaskGroup};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{SettingsRepository, TaskGroupsRepository, TasksRepository};
use crate::services::hlc_service::HlcService;

pub use crate::repository::TaskGroupPatch;

/// The settings key holding the inbox's active group filter. The capture windows
/// read it (via `get_active_task_group`) so new captures default to that group.
const ACTIVE_TASK_GROUP_KEY: &str = "active_task_group";

pub struct TaskGroupService {
    task_groups_repository: TaskGroupsRepository,
    settings_repository: SettingsRepository,
    // Deleting a group un-groups its tasks; those task rows change and must be stamped
    // for sync, so the group service reaches the task repo too.
    tasks_repository: TasksRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl TaskGroupService {
    pub fn new(
        task_groups_repository: TaskGroupsRepository,
        settings_repository: SettingsRepository,
        tasks_repository: TasksRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            task_groups_repository,
            settings_repository,
            tasks_repository,
            hlc_service,
            sync_signal,
        }
    }

    pub fn list(&self) -> AppResult<Vec<TaskGroup>> {
        self.task_groups_repository.list()
    }

    pub fn get(&self, id: &str) -> AppResult<Option<TaskGroup>> {
        self.task_groups_repository.get(id)
    }

    pub fn create(&self, new: NewTaskGroup) -> AppResult<TaskGroup> {
        let group = self.task_groups_repository.create(new)?;
        self.mark_dirty(&group.id)?;
        Ok(group)
    }

    pub fn update(&self, id: &str, patch: TaskGroupPatch) -> AppResult<TaskGroup> {
        let group = self.task_groups_repository.update(id, patch)?;
        self.mark_dirty(id)?;
        Ok(group)
    }

    /// Record a group as locally changed: mint a clock stamp and write it onto the row,
    /// so the sync loop finds and pushes the edit. Called after each mutation.
    fn mark_dirty(&self, id: &str) -> AppResult<()> {
        self.hlc_service.stamp(&self.task_groups_repository, [id])?;
        self.sync_signal.send();
        Ok(())
    }

    /// Delete a group — tombstone it (so the deletion syncs), un-group its tasks, and
    /// clear a stale active-filter pointing at it. The tombstone and every un-grouped task
    /// are stamped for the sync loop.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        let ungrouped = self.tasks_repository.ungroup(id)?;
        self.task_groups_repository.delete(id)?;

        self.hlc_service.stamp(&self.task_groups_repository, [id])?;
        self.hlc_service.stamp(&self.tasks_repository, &ungrouped)?;

        if self.settings_repository.get(ACTIVE_TASK_GROUP_KEY)?.as_deref() == Some(id) {
            self.settings_repository.remove(ACTIVE_TASK_GROUP_KEY)?;
        }
        self.sync_signal.send();
        Ok(())
    }

    pub fn active_task_group(&self) -> AppResult<Option<String>> {
        self.settings_repository.get(ACTIVE_TASK_GROUP_KEY)
    }

    pub fn set_active_task_group(&self, task_group_id: Option<String>) -> AppResult<()> {
        match task_group_id {
            Some(id) => self.settings_repository.set(ACTIVE_TASK_GROUP_KEY, &id),
            None => self.settings_repository.remove(ACTIVE_TASK_GROUP_KEY),
        }
    }
}
