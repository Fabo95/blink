//! Client for the Slack Web API — the only thing that talks to it. Authenticated with the
//! user's own token (`xoxp-…`, passed in by the service, which owns where it's stored).
//! Returns the raw response; Slack answers HTTP 200 with `{"ok": false, "error": …}` on
//! failure, so the services check `ok`.

use reqwest::Response;

const API_URL: &str = "https://slack.com/api";

#[derive(Clone)]
pub struct SlackClient {
    http: reqwest::Client,
}

impl SlackClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    /// Call a read method (`auth.test`, `users.info`, `search.messages`, …) with query params.
    pub async fn get(
        &self,
        token: &str,
        method: &str,
        params: &[(&str, &str)],
    ) -> reqwest::Result<Response> {
        self.http
            .get(format!("{API_URL}/{method}"))
            .bearer_auth(token)
            .query(params)
            .send()
            .await
    }
}
