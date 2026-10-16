//! The user's Better Stack connection: their Uptime API token, kept in the OS keychain
//! (account `better-stack-token`) and never sent to the webview. A token is checked with
//! Better Stack before it's kept. The token has no "who am I" endpoint, so the connection shows
//! the team its incidents belong to.

use serde::Deserialize;

use crate::clients::better_stack_client::BetterStackClient;
use crate::core::error::{AppError, AppResult};
use crate::core::keychain_secret::{secret_hint, KeychainSecret};
use crate::core::models::{IncomingSource, SourceAccount, SourceAuth, SourceConnection};

/// One page of `GET /api/v3/incidents` (only the fields used).
#[derive(Deserialize)]
pub struct IncidentsPage {
    pub data: Vec<Incident>,
}

#[derive(Deserialize, Clone)]
pub struct Incident {
    pub id: String,
    pub attributes: IncidentAttributes,
}

#[derive(Deserialize, Clone)]
pub struct IncidentAttributes {
    pub name: Option<String>,
    pub cause: Option<String>,
    pub started_at: String,
    pub acknowledged_at: Option<String>,
    pub resolved_at: Option<String>,
    pub team_name: Option<String>,
}

#[derive(Clone)]
pub struct BetterStackAccountService {
    better_stack_client: BetterStackClient,
    token: KeychainSecret,
}

impl BetterStackAccountService {
    pub fn new(better_stack_client: BetterStackClient) -> Self {
        Self {
            better_stack_client,
            token: KeychainSecret::new("better-stack-token"),
        }
    }

    /// The stored token, or `None` when Better Stack isn't connected.
    pub fn token(&self) -> AppResult<Option<String>> {
        self.token.read()
    }

    /// Incidents for `token` (`params` filter them) — also the check that the token works.
    pub async fn incidents(
        &self,
        token: &str,
        params: &[(&str, &str)],
    ) -> AppResult<Vec<Incident>> {
        let response = self
            .better_stack_client
            .incidents(token, params)
            .await
            .map_err(|e| AppError::Incoming(format!("could not reach Better Stack: {e}")))?;
        let status = response.status();
        if !status.is_success() {
            return Err(AppError::Incoming(format!(
                "Better Stack didn't accept the token ({status})"
            )));
        }
        let page: IncidentsPage = response
            .json()
            .await
            .map_err(|e| AppError::Incoming(format!("unexpected Better Stack response: {e}")))?;
        Ok(page.data)
    }

    /// The stored token's connection, checked live. Shows the team from its latest incident.
    pub async fn connection(&self) -> SourceConnection {
        let not_connected = |problem: String| SourceConnection {
            source: IncomingSource::BetterStack,
            auth: SourceAuth::ApiKey,
            connected: false,
            account: None,
            credential_hint: None,
            problem: Some(problem),
        };
        let token = match self.token() {
            Ok(Some(token)) => token,
            Ok(None) => return not_connected("No API token yet".into()),
            Err(err) => return not_connected(err.to_string()),
        };
        let (account, problem) = match self.incidents(&token, &[("per_page", "1")]).await {
            Ok(latest) => {
                let team = latest
                    .first()
                    .and_then(|incident| incident.attributes.team_name.clone());
                let account = SourceAccount {
                    name: team.clone().unwrap_or_else(|| "Uptime API token".into()),
                    handle: None,
                    organization: team.map(|_| "Better Stack team".into()),
                    avatar_url: None,
                };
                (Some(account), None)
            }
            Err(err) => (None, Some(err.to_string())),
        };
        SourceConnection {
            source: IncomingSource::BetterStack,
            auth: SourceAuth::ApiKey,
            connected: account.is_some(),
            account,
            credential_hint: Some(secret_hint(&token)),
            problem,
        }
    }

    /// Check `token` with Better Stack and keep it (replacing any previous one) only if it works.
    pub async fn connect(&self, token: &str) -> AppResult<()> {
        let token = token.trim();
        if token.is_empty() {
            return Err(AppError::Incoming(
                "paste a Better Stack API token first".into(),
            ));
        }
        self.incidents(token, &[("per_page", "1")]).await?;
        self.token.store(token)
    }

    pub fn disconnect(&self) -> AppResult<()> {
        self.token.clear()
    }
}
