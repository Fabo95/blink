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

    /// GET the model list — a cheap authenticated request used only to validate an
    /// API key (a 200 means it works; a 401 means it doesn't). Spends no tokens.
    pub async fn list_models(&self) -> reqwest::Result<Response> {
        self.http
            .get(format!("{BASE_URL}/v1/models"))
            .bearer_auth(&self.api_key)
            .send()
            .await
    }
}
