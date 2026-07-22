//! Persistence layer — the encrypted database ([`Db`]) and the [`Repository`]
//! facade, which owns the connection and exposes one entity repository per table.

mod db;
mod migrations;
mod settings;
mod tasks;

use std::path::Path;
use std::sync::Arc;

use crate::core::error::AppResult;

pub use db::Db;
pub use settings::SettingsRepository;
pub use tasks::{TaskPatch, TaskRepository};

/// The data-access facade: opens the shared [`Db`] once and hands it to an entity
/// repository per table. Adding a table = add a field here + its `*Repository`.
pub struct Repository {
    pub tasks: TaskRepository,
    pub settings: SettingsRepository,
}

impl Repository {
    pub fn open(path: &Path) -> AppResult<Self> {
        let db = Arc::new(Db::open(path)?);
        Ok(Self {
            tasks: TaskRepository::new(db.clone()),
            settings: SettingsRepository::new(db),
        })
    }
}
