//! Tauri IPC surface — the Rust counterpart of `apps/desktop/src/lib/api.ts`.
//! One module per feature group.

pub mod ai;
pub mod auth;
pub mod copy_capture;
pub mod editor;
pub mod export;
pub mod idea_capture;
pub mod link;
pub mod manual_capture;
pub mod notes;
pub mod repo;
pub mod reviews;
pub mod shortcut;
pub mod sync;
pub mod task_groups;
pub mod tasks;
pub mod terminal;
pub mod topics;
pub mod worktree;
