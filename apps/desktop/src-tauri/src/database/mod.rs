//! The encrypted, migrated SQLite (SQLCipher) database: opening it, its schema migrations,
//! and the error helpers repositories share. Only repositories (in [`crate::repository`])
//! use it; every other layer goes through a repository.

mod db;
mod migrations;

pub use db::Db;
pub(crate) use db::{serde_err, store_err};
