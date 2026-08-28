//! Shared foundations used across the app: the config singleton, the error type, the
//! ts-rs data models, managed runtime state, and the sync crypto primitives.

pub mod config;
pub mod crypto;
pub mod error;
pub mod models;
pub mod state;
pub mod wire;
