//! "Improve with AI" business logic. [`AiService`] reads the user's own API key
//! from the keychain (via [`AiKeyService`]) on each call, builds the prompt, and
//! extracts the single action item. Bring-your-own-key: the key is set at runtime
//! after a connection test and never leaves the native layer.

use serde::{Deserialize, Serialize};

use crate::clients::openai_client::OpenAiClient;
use crate::core::error::{AppError, AppResult};
use crate::core::models::Task;
use crate::services::ai_key_service::AiKeyService;

const SYSTEM_PROMPT: &str = "You turn rough notes into a single action item: one short, clear \
imperative sentence starting with a verb. Keep only what's needed to act on it, drop everything \
else. Return ONLY that one sentence — no preamble, no quotes, no markdown, no labels.";

const PROMPT_SYSTEM_PROMPT: &str = "You write prompts for AI assistants. Given a task's \
original captured text and its context (the current task phrasing, the app and window it \
was captured from, an optional link), write one ready-to-paste prompt asking an AI \
assistant to help complete that task. State the goal, include the original captured text \
as context, and mention the source or link only when they help. Return ONLY the prompt \
text — no preamble, no quotes, no markdown, no labels.";

/// The AI-optimization service. Holds the keychain-backed key store and reads the
/// user's key on each request; constructed once and managed as Tauri state.
pub struct AiService {
    ai_key_service: AiKeyService,
}

impl AiService {
    pub fn new(ai_key_service: AiKeyService) -> Self {
        Self { ai_key_service }
    }

    /// Whether a key is stored — the frontend gates every AI action on this.
    pub fn is_enabled(&self) -> AppResult<bool> {
        Ok(self.ai_key_service.read()?.is_some())
    }

    /// Validate a candidate key against the API without storing it. `Ok(())` means it
    /// authenticated; the `Err` carries why (bad key / network) for the UI to show.
    pub async fn test_key(&self, key: &str) -> AppResult<()> {
        let client = OpenAiClient::new(key.to_string());
        let response = client
            .list_models()
            .await
            .map_err(|e| AppError::Ai(format!("request failed: {e}")))?;

        if response.status().is_success() {
            return Ok(());
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(AppError::Ai(format!("OpenAI returned {status}: {body}")))
    }

    /// Test a key, and store it in the keychain only if the test passes — so a bad
    /// key is never saved.
    pub async fn save_key(&self, key: String) -> AppResult<()> {
        let key = key.trim();
        if key.is_empty() {
            return Err(AppError::Ai("API key is empty".to_string()));
        }
        self.test_key(key).await?;
        self.ai_key_service.store(key)
    }

    /// Forget the stored key — disables the AI features.
    pub fn clear_key(&self) -> AppResult<()> {
        self.ai_key_service.clear()
    }

    /// Send the captured text to OpenAI and return a cleaned-up single action item.
    pub async fn improve(&self, text: String) -> AppResult<String> {
        self.complete(SYSTEM_PROMPT.to_string(), text).await
    }

    /// Generate a ready-to-paste assistant prompt from a task's raw captured text and
    /// its context (current phrasing, capture source, optional link). `group_context` —
    /// the task's group's free-text context, when set — is folded into the system prompt
    /// so generation is tailored to that group.
    pub async fn generate_prompt(
        &self,
        task: &Task,
        group_context: Option<&str>,
    ) -> AppResult<String> {
        let mut system = PROMPT_SYSTEM_PROMPT.to_string();
        if let Some(context) = group_context.map(str::trim).filter(|c| !c.is_empty()) {
            system.push_str(&format!(
                "\n\nThis task belongs to a group with the following context — use it to \
                 tailor the prompt:\n{context}"
            ));
        }

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

        self.complete(system, user).await
    }

    /// Shared OpenAI chat round-trip: send a system + user message pair, return the
    /// trimmed first completion. Errors carry the missing-key / network / bad-response
    /// detail so the frontend can surface it.
    async fn complete(&self, system: String, user: String) -> AppResult<String> {
        let api_key = self
            .ai_key_service
            .read()?
            .ok_or_else(|| AppError::Ai("no API key — add one in settings".to_string()))?;
        let openai_client = OpenAiClient::new(api_key);

        let request = ChatRequest {
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: vec![
                Message {
                    role: "system",
                    content: system,
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
