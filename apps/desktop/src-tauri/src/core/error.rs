use std::fmt;

use serde::Serialize;

/// Error surfaced to the frontend. Tauri serializes the `Err` variant of a
/// command's `Result` and rejects the JS promise with this shape:
/// `{ kind, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    /// A persistence-layer failure (SQLCipher/keychain error or a poisoned lock).
    Store(String),
    /// An AI-optimization failure (missing key, network, or a bad model response).
    Ai(String),
    /// A capture-shortcut failure (invalid shortcut or the OS rejected it).
    Shortcut(String),
    /// Opening a task's link failed (bad URL or the OS opener errored).
    Link(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Store(msg) => write!(f, "store error: {msg}"),
            AppError::Ai(msg) => write!(f, "ai error: {msg}"),
            AppError::Shortcut(msg) => write!(f, "shortcut error: {msg}"),
            AppError::Link(msg) => write!(f, "link error: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;
