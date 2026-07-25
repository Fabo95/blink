//! "Improve with AI" business logic. [`AiService`] holds the [`OpenAiClient`]
//! (absent when `OPENAI_API_KEY` isn't configured), builds the prompt, and extracts
//! the single action item. The API key never leaves the native layer.

use serde::{Deserialize, Serialize};

use crate::clients::openai_client::OpenAiClient;
use crate::core::error::{AppError, AppResult};

const SYSTEM_PROMPT: &str = "You turn rough notes into a single action item: one short, clear \
imperative sentence starting with a verb. Keep only what's needed to act on it, drop everything \
else. Return ONLY that one sentence — no preamble, no quotes, no markdown, no labels.";

/// The AI-optimization service. Holds the OpenAI client (`None` when the API key
/// isn't set); constructed once and managed as Tauri state.
pub struct AiService {
    openai_client: Option<OpenAiClient>,
}

impl AiService {
    pub fn new(openai_client: Option<OpenAiClient>) -> Self {
        Self { openai_client }
    }

    /// Send the captured text to OpenAI and return a cleaned-up single action item.
    pub async fn improve(&self, text: String) -> AppResult<String> {
        let openai_client = self
            .openai_client
            .as_ref()
            .ok_or_else(|| AppError::Ai("OPENAI_API_KEY is not set".to_string()))?;

        let request = ChatRequest {
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: vec![
                Message {
                    role: "system",
                    content: SYSTEM_PROMPT.to_string(),
                },
                Message {
                    role: "user",
                    content: text,
                },
            ],
        };

        let response = openai_client
            .chat_completion(&request)
            .await
            .map_err(|e| AppError::Ai(format!("request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Ai(format!("OpenAI returned {status}: {body}")));
        }

        let completion: ChatResponse = response
            .json()
            .await
            .map_err(|e| AppError::Ai(format!("could not read response: {e}")))?;

        completion
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content.trim().to_string())
            .ok_or_else(|| AppError::Ai("empty response".to_string()))
    }
}

#[derive(Serialize)]
struct ChatRequest {
    model: &'static str,
    temperature: f32,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct Message {
    role: &'static str,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}
