//! Transport to external systems — one client per system: the Blink sync server
//! ([`server_client::ServerClient`]) and OpenAI ([`openai_client::OpenAiClient`]).
//! Clients just build and send requests, returning the raw response; interpreting
//! it (status, headers, body) and mapping errors is business logic and lives in
//! [`crate::services`].

pub mod openai_client;
pub mod server_client;
