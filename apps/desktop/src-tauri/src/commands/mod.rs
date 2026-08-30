//! Tauri IPC surface — the Rust counterpart of `apps/desktop/src/lib/api.ts`.
//! One module per feature group.

pub mod ai;
pub mod auth;
pub mod copy_capture;
pub mod link;
pub mod manual_capture;
pub mod repo;
pub mod shortcut;
pub mod sync;
pub mod task_groups;
pub mod tasks;
pub mod worktree;
