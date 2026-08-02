//! "Improve with AI" business logic. [`AiService`] holds the [`OpenAiClient`]
//! (absent when `OPENAI_API_KEY` isn't configured), builds the prompt, and extracts
//! the single action item. The API key never leaves the native layer.

use serde::{Deserialize, Serialize};

use crate::clients::openai_client::OpenAiClient;
use crate::core::error::{AppError, AppResult};
use crate::core::models::Task;

const SYSTEM_PROMPT: &str = "You turn rough notes into a single action item: one short, clear \
imperative sentence starting with a verb. Keep only what's needed to act on it, drop everything \
else. Return ONLY that one sentence — no preamble, no quotes, no markdown, no labels.";

const PROMPT_SYSTEM_PROMPT: &str = "You write prompts for AI assistants. Given a task's \
original captured text and its context (the current task phrasing, the app and window it \
was captured from, an optional link), write one ready-to-paste prompt asking an AI \
assistant to help complete that task. State the goal, include the original captured text \
as context, and mention the source or link only when they help. Return ONLY the prompt \
text — no preamble, no quotes, no markdown, no labels.";

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
        self.complete(SYSTEM_PROMPT, text).await
    }

    /// Generate a ready-to-paste assistant prompt from a task's raw captured text and
    /// its context (current phrasing, capture source, optional link).
    pub async fn generate_prompt(&self, task: &Task) -> AppResult<String> {
        let mut user = format!("Task: {}\n\nOriginal captured text:\n{}", task.text, task.raw_text);

        let source = &task.source;
        let captured_from = format!("{} {}", source.app_name, source.window_title);
        let captured_from = captured_from.trim();
        if !captured_from.is_empty() {
            user.push_str(&format!("\n\nCaptured from: {captured_from}"));
        }

        if let Some(link) = task.link.as_deref().map(str::trim).filter(|l| !l.is_empty()) {
            user.push_str(&format!("\nLink: {link}"));
        }

        self.complete(PROMPT_SYSTEM_PROMPT, user).await
    }

    /// Shared OpenAI chat round-trip: send a system + user message pair, return the
    /// trimmed first completion. Errors carry the missing-key / network / bad-response
    /// detail so the frontend can surface it.
    async fn complete(&self, system: &'static str, user: String) -> AppResult<String> {
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
                    content: system.to_string(),
                },
                Message {
                    role: "user",
                    content: user,
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
