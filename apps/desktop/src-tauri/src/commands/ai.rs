use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};

/// The AI-optimized capture returned to the frontend.
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct OptimizedCapture {
    pub title: String,
    pub body: String,
}

const SYSTEM_PROMPT: &str = "You clean up rough task captures. Given a title and body, \
return improved versions: a concise, clear, action-oriented title (max ~10 words) and a tidied \
body (fix grammar and structure, stay concise, keep every important detail; if the body is empty, \
leave it empty). Respond with ONLY a JSON object: {\"title\": string, \"body\": string}.";

/// Send the current capture to OpenAI and return a cleaned-up title + body. The
/// API key comes from the `OPENAI_API_KEY` environment variable and never leaves
/// the native layer.
#[tauri::command]
pub async fn optimize_capture(title: String, body: String) -> AppResult<OptimizedCapture> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| AppError::Ai("OPENAI_API_KEY is not set".to_string()))?;

    let request = ChatRequest {
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: ResponseFormat {
            kind: "json_object",
        },
        messages: vec![
            Message {
                role: "system",
                content: SYSTEM_PROMPT.to_string(),
            },
            Message {
                role: "user",
                content: format!("Title: {title}\n\nBody:\n{body}"),
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

    let content = completion
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or_else(|| AppError::Ai("empty response".to_string()))?;

    serde_json::from_str(&content)
        .map_err(|e| AppError::Ai(format!("could not parse model output: {e}")))
}

#[derive(Serialize)]
struct ChatRequest {
    model: &'static str,
    temperature: f32,
    response_format: ResponseFormat,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
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
