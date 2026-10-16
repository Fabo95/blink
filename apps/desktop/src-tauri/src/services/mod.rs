//! The app's business logic: AI optimization, capture drafting, auth against the sync
//! server, task/group management, and hotkey policy. Transport to external systems lives
//! in [`crate::clients`]; persistence lives one level up in [`crate::repository`] —
//! commands go through a service, never a repository.

pub mod ai_key_service;
pub mod ai_service;
pub mod attention_service;
pub mod auth_service;
pub mod better_stack_account_service;
pub mod better_stack_incoming_provider;
pub mod capture_service;
pub mod editor_service;
pub mod egress_service;
pub mod export_service;
pub mod github_incoming_provider;
pub mod hlc_service;
pub mod hook_service;
pub mod incoming_service;
pub mod linear_account_service;
pub mod linear_incoming_provider;
pub mod note_service;
pub mod policy_service;
pub mod repo_service;
pub mod session_token_service;
pub mod shortcut_service;
pub mod slack_account_service;
pub mod slack_incoming_provider;
pub mod sync_service;
pub mod task_group_service;
pub mod task_service;
pub mod task_worktree_service;
pub mod terminal_service;
pub mod topic_service;
pub mod usage_service;
pub mod worktree_service;
