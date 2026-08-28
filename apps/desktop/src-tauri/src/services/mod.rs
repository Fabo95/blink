//! The app's business logic: AI optimization, the DLP security filter and capture
//! drafting, auth against the sync server, task/group management, and hotkey
//! policy. Transport to external systems lives in [`crate::clients`]; persistence
//! lives one level up in [`crate::repository`] — commands go through a service,
//! never a repository.

pub mod ai_service;
pub mod auth_service;
pub mod capture_service;
pub mod hlc_service;
pub mod security_service;
pub mod session_token_service;
pub mod shortcut_service;
pub mod task_group_service;
pub mod task_service;
pub mod vault_service;
