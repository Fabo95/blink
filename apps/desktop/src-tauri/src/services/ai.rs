//! OpenAI client for the "Optimize with AI" action. The API key comes from the
//! `OPENAI_API_KEY` environment variable and never leaves the native layer.

use serde::{Deserialize, Serialize};

use crate::core::error::{AppError, AppResult};

const SYSTEM_PROMPT: &str = "You turn rough notes into a single action item: one short, clear \
imperative sentence starting with a verb. Keep only what's needed to act on it, drop everything \
else. Return ONLY that one sentence — no preamble, no quotes, no markdown, no labels.";

/// Send the captured text to OpenAI and return a cleaned-up single action item.
pub async fn optimize(text: String) -> AppResult<String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| AppError::Ai("OPENAI_API_KEY is not set".to_string()))?;

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

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|e| AppError::Ai(format!("request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(AppError::Ai(format!("OpenAI returned {status}: {detail}")));
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
