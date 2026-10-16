//! Client for the Better Stack (Uptime / Incidents) API — the only thing that talks to it.
//! Authenticated with the user's own API token (passed in by the service, which owns where it's
//! stored). Returns the raw response for the service to parse.

use reqwest::Response;

const INCIDENTS_URL: &str = "https://incidents.betterstack.com/api/v3/incidents";

#[derive(Clone)]
pub struct BetterStackClient {
    http: reqwest::Client,
}

impl BetterStackClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    /// List incidents (`params` e.g. `resolved=false`, `per_page`), newest first.
    pub async fn incidents(
        &self,
        token: &str,
        params: &[(&str, &str)],
    ) -> reqwest::Result<Response> {
        self.http
            .get(INCIDENTS_URL)
            .bearer_auth(token)
            .query(params)
            .send()
            .await
    }
}
