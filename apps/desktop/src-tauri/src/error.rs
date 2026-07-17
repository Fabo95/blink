use std::fmt;

use serde::Serialize;

/// Error surfaced to the frontend. Tauri serializes the `Err` variant of a
/// command's `Result` and rejects the JS promise with this shape:
/// `{ kind, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    /// A persistence-layer failure (poisoned lock now; DB errors once SQLCipher lands).
    Store(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Store(msg) => write!(f, "store error: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;
