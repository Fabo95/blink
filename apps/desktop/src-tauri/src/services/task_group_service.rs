//! Task-group business logic. [`TaskGroupService`] fronts the
//! [`TaskGroupRepository`] and also owns the inbox's active group filter (a
//! `settings` entry), so deleting a group can clear a stale filter in one place.

use std::sync::Arc;

use crate::core::error::AppResult;
use crate::core::models::TaskGroup;
use crate::repository::{SettingsRepository, TaskGroupRepository, TaskRepository};
use crate::services::hlc_service::HlcService;

/// The settings key holding the inbox's active group filter. The capture windows
/// read it (via `get_active_task_group`) so new captures default to that group.
const ACTIVE_TASK_GROUP_KEY: &str = "active_task_group";

pub struct TaskGroupService {
    task_group_repository: TaskGroupRepository,
    settings_repository: SettingsRepository,
    // Deleting a group un-groups its tasks; those task rows change and must be stamped
    // for sync, so the group service reaches the task repo too.
    task_repository: TaskRepository,
    hlc_service: Arc<HlcService>,
}

impl TaskGroupService {
    pub fn new(
        task_group_repository: TaskGroupRepository,
        settings_repository: SettingsRepository,
        task_repository: TaskRepository,
        hlc_service: Arc<HlcService>,
    ) -> Self {
        Self {
            task_group_repository,
            settings_repository,
            task_repository,
            hlc_service,
        }
    }

    pub fn list(&self) -> AppResult<Vec<TaskGroup>> {
        self.task_group_repository.list()
    }

    pub fn create(&self, name: &str) -> AppResult<TaskGroup> {
        let group = self.task_group_repository.create(name)?;
        self.mark_dirty(&group.id)?;
        Ok(group)
    }

    pub fn rename(&self, id: &str, name: &str) -> AppResult<TaskGroup> {
        let group = self.task_group_repository.rename(id, name)?;
        self.mark_dirty(id)?;
        Ok(group)
    }

    /// Record a group as locally changed: mint a clock stamp and write it onto the row,
    /// so the sync loop finds and pushes the edit. Called after each mutation.
    fn mark_dirty(&self, id: &str) -> AppResult<()> {
        let hlc = self.hlc_service.next()?;
        self.task_group_repository.record_change(id, hlc.physical, hlc.counter, &hlc.node_id)
    }

    /// Delete a group — tombstone it (so the deletion syncs), un-group its tasks, and
    /// clear a stale active-filter pointing at it. One clock stamp covers the group
    /// tombstone and every un-grouped task (they're distinct records, so a shared
    /// stamp is fine); each carries `dirty = 1` for the sync loop.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        let ungrouped = self.task_group_repository.delete(id)?;

        let hlc = self.hlc_service.next()?;
        self.task_group_repository.record_change(id, hlc.physical, hlc.counter, &hlc.node_id)?;
        for task_id in &ungrouped {
            self.task_repository.record_change(task_id, hlc.physical, hlc.counter, &hlc.node_id)?;
        }

        if self.settings_repository.get(ACTIVE_TASK_GROUP_KEY)?.as_deref() == Some(id) {
            self.settings_repository.remove(ACTIVE_TASK_GROUP_KEY)?;
        }
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
