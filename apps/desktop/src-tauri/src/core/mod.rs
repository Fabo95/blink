//! Shared foundations used across the app: the config singleton, the error type, the
//! ts-rs data models and managed runtime state.

pub mod config;
pub mod error;
pub mod models;
pub mod paths;
pub mod state;
pub mod sync_channel;
pub mod wire;
