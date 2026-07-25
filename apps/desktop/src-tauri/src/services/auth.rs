//! Email/password auth business logic against the sync server's Better Auth
//! endpoints. [`AuthService`] holds the [`ServerClient`] it talks through, decides
//! which endpoint to call, reads the `set-auth-token` header, and owns the session
//! token's lifecycle in the OS keychain (the token never reaches the webview).

use reqwest::{Response, StatusCode};
use serde::Deserialize;

use crate::clients::server_client::ServerClient;
use crate::core::error::{AppError, AppResult};
use crate::core::models::AuthUser;
use crate::services::session_token::SessionTokenService;

/// Auth against the sync server. Holds the client it talks through and the keychain
/// token store; constructed once and managed as Tauri state.
pub struct AuthService {
    server_client: ServerClient,
    session_token_service: SessionTokenService,
}

impl AuthService {
    pub fn new(server_client: ServerClient, session_token_service: SessionTokenService) -> Self {
        Self {
            server_client,
            session_token_service,
        }
    }

    pub async fn sign_in(&self, email: String, password: String) -> AppResult<AuthUser> {
        let response = self
            .server_client
            .sign_in_email(&email, &password)
            .await
            .map_err(network_error)?;
        let (user, token) = read_session(response).await?;
        self.session_token_service.store(&token)?;
        Ok(user)
    }

    pub async fn sign_up(
        &self,
        email: String,
        password: String,
        name: String,
    ) -> AppResult<AuthUser> {
        let response = self
            .server_client
            .sign_up_email(&email, &password, &name)
            .await
            .map_err(network_error)?;
        let (user, token) = read_session(response).await?;
        self.session_token_service.store(&token)?;
        Ok(user)
    }

    /// Whether a session token is present on this device (the offline "is signed in"
    /// signal — it doesn't hit the network).
    pub fn is_authenticated(&self) -> AppResult<bool> {
        Ok(self.session_token_service.read()?.is_some())
    }

    /// Best-effort server-side revocation, then drop the local token regardless — the
    /// user is signed out on this device even if the server is unreachable.
    pub async fn sign_out(&self) -> AppResult<()> {
        if let Some(token) = self.session_token_service.read()? {
            let _ = self.server_client.sign_out(token.as_str()).await;
        }
        self.session_token_service.clear()
    }

}

/// Pull the session out of a Better Auth sign-in/up response: the bearer token from
/// the `set-auth-token` header (Better Auth's bearer plugin), the account from the body.
async fn read_session(response: Response) -> AppResult<(AuthUser, String)> {
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Auth(status_message(status, &body)));
    }

    let token = response
        .headers()
        .get("set-auth-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| AppError::Auth("the server did not return a session token".to_string()))?;

    let payload: AuthResponse = response
        .json()
        .await
        .map_err(|e| AppError::Auth(format!("could not read the server response: {e}")))?;

    Ok((payload.user, token))
}

/// A failure to even reach the server (DNS/connection/timeout).
fn network_error(error: reqwest::Error) -> AppError {
    AppError::Auth(format!("could not reach the sync server: {error}"))
}

/// Surface Better Auth's `{ message }` (e.g. "Invalid email or password") from a
/// rejected response, falling back to a status-coded message.
fn status_message(status: StatusCode, body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("message")?.as_str().map(str::to_string))
        .unwrap_or_else(|| format!("the server rejected the request ({status})"))
}

#[derive(Deserialize)]
struct AuthResponse {
    user: AuthUser,
}
