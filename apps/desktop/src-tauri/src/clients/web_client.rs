use std::time::Duration;

use reqwest::{redirect, Response, Url};

/// A page fetch gives up after this long; enrichment is best-effort and must never hang.
const TIMEOUT: Duration = Duration::from_secs(10);
/// Enough redirects for link shorteners and http→https, not enough for a loop.
const MAX_REDIRECTS: usize = 5;

/// Fetches public web pages for source enrichment. Thin like the other clients: builds and
/// sends the request, returns the raw response; size limits and parsing live in the
/// enrichment service. Uses the system proxy settings (reqwest's default).
pub struct WebClient {
    http: reqwest::Client,
}

impl WebClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .redirect(redirect::Policy::limited(MAX_REDIRECTS))
            .user_agent("Blink/0.1 (source preview)")
            .build()
            // The builder only fails on an unusable TLS backend, which is a build-time
            // configuration error; fall back to the default client rather than abort.
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { http }
    }

    pub async fn get(&self, url: Url) -> reqwest::Result<Response> {
        self.http.get(url).send().await
    }
}
