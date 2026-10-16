//! Shared foundations used across the app: the config singleton, the error type, the
//! ts-rs data models, managed runtime state, and the interfaces every synced repository
//! and every Incoming source implements.

pub mod config;
pub mod error;
pub mod incoming_provider;
pub mod keychain_secret;
pub mod model_prices;
pub mod models;
pub mod paths;
pub mod state;
pub mod sync_channel;
pub mod synced_repository;
pub mod wire;
