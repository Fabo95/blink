//! Process-wide configuration, read from the environment once on first access via
//! [`config`]. `.env` is loaded by dotenvy at startup (see `run`), so reading lazily
//! here still picks up those values; real env vars win. One place, instead of
//! scattered `std::env::var` calls.

use std::sync::OnceLock;

const DEFAULT_SERVER_URL: &str = "http://localhost:8787";

pub struct Config {
    /// The Blink sync server base URL (`BLINK_SERVER_URL`).
    pub server_url: String,
}

impl Config {
    fn from_env() -> Self {
        Self {
            server_url: std::env::var("BLINK_SERVER_URL")
                .unwrap_or_else(|_| DEFAULT_SERVER_URL.to_string()),
        }
    }
}

/// The process-wide config singleton, initialized from the environment on first use.
pub fn config() -> &'static Config {
    static CONFIG: OnceLock<Config> = OnceLock::new();
    CONFIG.get_or_init(Config::from_env)
}
