//! Transport to external systems — one client per system. Three speak HTTP (the Blink sync
//! server [`server_client::ServerClient`], OpenAI [`openai_client::OpenAiClient`], and
//! public web pages for source previews [`web_client::WebClient`]); the
//! rest shell out to a local CLI for the worktree manager (git [`git_cli::GitCli`], tmux
//! [`tmux_cli::TmuxCli`], and GitHub [`github_cli::GitHubCli`]). Clients just build and run
//! the request/command and return the raw result; interpreting it (status, output, errors)
//! is business logic and lives in [`crate::services`].

pub mod git_cli;
pub mod github_cli;
pub mod openai_client;
pub mod server_client;
pub mod tmux_cli;
pub mod web_client;
