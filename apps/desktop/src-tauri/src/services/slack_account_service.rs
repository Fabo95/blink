//! The user's Slack connection: their user token (`xoxp-…`, from a small Slack app they
//! installed with read-only user scopes), kept in the OS keychain (account
//! `slack-user-token`) and never sent to the webview. A token is checked with Slack before it's
//! kept, and [`SlackAccountService::connection`] asks Slack live whose token it is.

use serde::de::DeserializeOwned;
use serde::Deserialize;

use crate::clients::slack_client::SlackClient;
use crate::core::error::{AppError, AppResult};
use crate::core::keychain_secret::{secret_hint, KeychainSecret};
use crate::core::models::{IncomingSource, SourceAccount, SourceAuth, SourceConnection};

/// Who a token belongs to (`auth.test`).
#[derive(Deserialize)]
pub struct SlackIdentity {
    pub user_id: String,
    pub user: String,
    pub team: String,
}

#[derive(Deserialize)]
struct UsersInfo {
    user: SlackUser,
}

#[derive(Deserialize)]
struct SlackUser {
    profile: SlackProfile,
}

#[derive(Deserialize)]
struct SlackProfile {
    real_name: Option<String>,
    image_72: Option<String>,
}

#[derive(Clone)]
pub struct SlackAccountService {
    slack_client: SlackClient,
    token: KeychainSecret,
}

impl SlackAccountService {
    pub fn new(slack_client: SlackClient) -> Self {
        Self {
            slack_client,
            token: KeychainSecret::new("slack-user-token"),
        }
    }

    /// The stored token, or `None` when Slack isn't connected.
    pub fn token(&self) -> AppResult<Option<String>> {
        self.token.read()
    }

    /// Who `token` belongs to — also the check that it still works.
    pub async fn identity(&self, token: &str) -> AppResult<SlackIdentity> {
        call(&self.slack_client, token, "auth.test", &[]).await
    }

    /// Whose token is stored, asked live. A token Slack no longer accepts shows as a problem.
    pub async fn connection(&self) -> SourceConnection {
        let not_connected = |problem: String| SourceConnection {
            source: IncomingSource::Slack,
            auth: SourceAuth::ApiKey,
            connected: false,
            account: None,
            credential_hint: None,
            problem: Some(problem),
        };
        let token = match self.token() {
            Ok(Some(token)) => token,
            Ok(None) => return not_connected("No user token yet".into()),
            Err(err) => return not_connected(err.to_string()),
        };
        let (account, problem) = match self.account(&token).await {
            Ok(account) => (Some(account), None),
            Err(err) => (None, Some(err.to_string())),
        };
        SourceConnection {
            source: IncomingSource::Slack,
            auth: SourceAuth::ApiKey,
            connected: account.is_some(),
            account,
            credential_hint: Some(secret_hint(&token)),
            problem,
        }
    }

    /// Check `token` with Slack and keep it (replacing any previous one) only if it works.
    pub async fn connect(&self, token: &str) -> AppResult<()> {
        let token = token.trim();
        if !token.starts_with("xoxp-") {
            return Err(AppError::Incoming(
                "that's not a Slack user token — copy the User OAuth Token (xoxp-…)".into(),
            ));
        }
        self.identity(token).await?;
        self.token.store(token)
    }

    pub fn disconnect(&self) -> AppResult<()> {
        self.token.clear()
    }

    async fn account(&self, token: &str) -> AppResult<SourceAccount> {
        let identity = self.identity(token).await?;
        let info: UsersInfo = call(
            &self.slack_client,
            token,
            "users.info",
            &[("user", &identity.user_id)],
        )
        .await?;
        Ok(SourceAccount {
            name: info
                .user
                .profile
                .real_name
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(identity.user.clone()),
            handle: Some(format!("@{}", identity.user)),
            organization: Some(identity.team),
            avatar_url: info.user.profile.image_72,
        })
    }
}

/// Call a Slack read method and decode its body, turning `{"ok": false, "error": …}` into an
/// error (Slack answers HTTP 200 either way).
pub async fn call<T: DeserializeOwned>(
    slack_client: &SlackClient,
    token: &str,
    method: &str,
    params: &[(&str, &str)],
) -> AppResult<T> {
    let response = slack_client
        .get(token, method, params)
        .await
        .map_err(|e| AppError::Incoming(format!("could not reach Slack: {e}")))?;
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Incoming(format!("unexpected Slack response: {e}")))?;
    if body.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        let error = body
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown");
        return Err(AppError::Incoming(format!(
            "Slack refused {method}: {error}"
        )));
    }
    serde_json::from_value(body)
        .map_err(|e| AppError::Incoming(format!("unexpected Slack {method} response: {e}")))
}
