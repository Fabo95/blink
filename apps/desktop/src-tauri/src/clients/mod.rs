//! Transport to external systems — one client per system. Two speak HTTP (the Blink sync
//! server [`server_client::ServerClient`] and OpenAI [`openai_client::OpenAiClient`]); two
//! shell out to a local CLI for the worktree manager (git [`git_cli::GitCli`] and tmux
//! [`tmux_cli::TmuxCli`]). Clients just build and run the request/command and return the
//! raw result; interpreting it (status, output, errors) is business logic and lives in
//! [`crate::services`].

pub mod git_cli;
pub mod openai_client;
pub mod server_client;
pub mod tmux_cli;
