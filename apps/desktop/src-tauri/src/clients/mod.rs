//! Transport to external systems — one client per system. Five speak HTTP (the Blink sync
//! server [`server_client::ServerClient`], OpenAI [`openai_client::OpenAiClient`], Linear
//! [`linear_client::LinearClient`], Slack [`slack_client::SlackClient`], and Better Stack
//! [`better_stack_client::BetterStackClient`]); the rest shell out to a local CLI for the
//! worktree manager (git [`git_cli::GitCli`], tmux [`tmux_cli::TmuxCli`], and GitHub
//! [`github_cli::GitHubCli`]), and one reads Claude Code's session store on disk
//! ([`claude_store::ClaudeStore`]). Clients just build and run the request/command and return
//! the raw result; interpreting it (status, output, errors) is business logic and lives in
//! [`crate::services`].

pub mod better_stack_client;
pub mod claude_store;
pub mod git_cli;
pub mod github_cli;
pub mod linear_client;
pub mod openai_client;
pub mod server_client;
pub mod slack_client;
pub mod tmux_cli;
