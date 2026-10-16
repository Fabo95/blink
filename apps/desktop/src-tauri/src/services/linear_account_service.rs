//! The user's Linear connection: their personal API key (read-only), kept in the OS keychain
//! (service `app.blink.desktop`, account `linear-api-key`) and never sent to the webview.
//! A key is checked against Linear before it's kept, and [`LinearAccountService::connection`]
//! asks Linear live whose key it is, so Settings always shows the real profile.

use serde::Deserialize;
use serde_json::json;

use crate::clients::linear_client::LinearClient;
use crate::core::error::{AppError, AppResult};
use crate::core::keychain_secret::{secret_hint, KeychainSecret};
use crate::core::models::{IncomingSource, SourceAccount, SourceAuth, SourceConnection};

const VIEWER_QUERY: &str = "query { viewer { name email avatarUrl organization { name } } }";

/// The first version kept `{"api_key": …}` JSON in the keychain item; now it's the bare key.
#[derive(Deserialize)]
struct LegacyStoredKey {
    api_key: String,
}

#[derive(Deserialize)]
struct ViewerResponse {
    data: Option<ViewerData>,
}

#[derive(Deserialize)]
struct ViewerData {
    viewer: Viewer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Viewer {
    name: String,
    email: String,
    avatar_url: Option<String>,
    organization: Organization,
}

#[derive(Deserialize)]
struct Organization {
    name: String,
}

#[derive(Clone)]
pub struct LinearAccountService {
    linear_client: LinearClient,
    key: KeychainSecret,
}

impl LinearAccountService {
    pub fn new(linear_client: LinearClient) -> Self {
        Self {
            linear_client,
            key: KeychainSecret::new("linear-api-key"),
        }
    }

    /// The stored key, or `None` when Linear isn't connected.
    pub fn api_key(&self) -> AppResult<Option<String>> {
        Ok(self.key.read()?.map(|stored| {
            serde_json::from_str::<LegacyStoredKey>(&stored)
                .map(|legacy| legacy.api_key)
                .unwrap_or(stored)
        }))
    }

    /// Whose key is stored, asked live. A key Linear no longer accepts shows as a problem.
    pub async fn connection(&self) -> SourceConnection {
        let not_connected = |problem: String| SourceConnection {
            source: IncomingSource::Linear,
            auth: SourceAuth::ApiKey,
            connected: false,
            account: None,
            credential_hint: None,
            problem: Some(problem),
        };
        let key = match self.api_key() {
            Ok(Some(key)) => key,
            Ok(None) => return not_connected("No API key yet".into()),
            Err(err) => return not_connected(err.to_string()),
        };
        let (account, problem) = match self.viewer(&key).await {
            Ok(viewer) => (Some(account(viewer)), None),
            Err(err) => (None, Some(err.to_string())),
        };
        SourceConnection {
            source: IncomingSource::Linear,
            auth: SourceAuth::ApiKey,
            connected: account.is_some(),
            account,
            credential_hint: Some(secret_hint(&key)),
            problem,
        }
    }

    /// Check `api_key` with Linear and keep it (replacing any previous one) only if it works.
    pub async fn connect(&self, api_key: &str) -> AppResult<()> {
        let api_key = api_key.trim();
        if api_key.is_empty() {
            return Err(AppError::Incoming("paste a Linear API key first".into()));
        }
        self.viewer(api_key).await?;
        self.key.store(api_key)
    }

    pub fn disconnect(&self) -> AppResult<()> {
        self.key.clear()
    }

    async fn viewer(&self, api_key: &str) -> AppResult<Viewer> {
        let response = self
            .linear_client
            .graphql(api_key, VIEWER_QUERY, json!({}))
            .await
            .map_err(|e| AppError::Incoming(format!("could not reach Linear: {e}")))?;
        if !response.status().is_success() {
            return Err(AppError::Incoming(format!(
                "Linear didn't accept the key ({})",
                response.status()
            )));
        }
        response
            .json::<ViewerResponse>()
            .await
            .ok()
            .and_then(|body| body.data)
            .map(|data| data.viewer)
            .ok_or_else(|| AppError::Incoming("Linear didn't accept the key".into()))
    }
}

fn account(viewer: Viewer) -> SourceAccount {
    SourceAccount {
        name: if viewer.name.trim().is_empty() {
            viewer.email.clone()
        } else {
            viewer.name
        },
        handle: Some(viewer.email),
        organization: Some(viewer.organization.name),
        avatar_url: viewer.avatar_url,
    }
}
