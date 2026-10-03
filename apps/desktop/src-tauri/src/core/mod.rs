//! Shared foundations used across the app: the config singleton, the error type, the
//! ts-rs data models, managed runtime state, and the interface every synced repository
//! implements.

pub mod config;
pub mod error;
pub mod models;
pub mod paths;
pub mod state;
pub mod sync_channel;
pub mod synced_repository;
pub mod wire;
