//! Client for the OpenAI API — the only thing that talks to it. Authenticated with
//! an API key (passed in by the service, which owns where credentials come from).
//! Returns the raw response for the service to parse.

use reqwest::Response;
use serde::Serialize;

const BASE_URL: &str = "https://api.openai.com";

pub struct OpenAiClient {
    api_key: String,
    http: reqwest::Client,
}

impl OpenAiClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http: reqwest::Client::new(),
        }
    }

    /// POST a chat-completion request body; returns the raw response to parse.
    pub async fn chat_completion<B: Serialize>(&self, body: &B) -> reqwest::Result<Response> {
        self.http
            .post(format!("{BASE_URL}/v1/chat/completions"))
            .bearer_auth(&self.api_key)
            .json(body)
            .send()
            .await
    }
}
