//! Email/password auth business logic against the sync server's Better Auth
//! endpoints. [`AuthService`] holds the [`ServerClient`] it talks through, decides
//! which endpoint to call, reads the `set-auth-token` header, and owns the session
//! token's lifecycle in the OS keychain (the token never reaches the webview).

use reqwest::{Response, StatusCode};
use serde::Deserialize;

use crate::clients::server_client::ServerClient;
use crate::core::error::{AppError, AppResult};
use crate::core::models::{AuthResult, AuthStatus, AuthUser};
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

    pub async fn sign_in(&self, email: String, password: String) -> AppResult<AuthResult> {
        let response = self
            .server_client
            .sign_in_email(&email, &password)
            .await
            .map_err(network_error)?;

        if response.status().is_success() {
            let (user, token) = read_session(response).await?;
            self.session_token_service.store(&token)?;
            return Ok(authenticated(user));
        }

        // The server rejects sign-in for an unverified account (403 EMAIL_NOT_VERIFIED)
        // and auto-sends a fresh code — surface that as a normal branch, not an error.
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if is_email_not_verified(&body) {
            return Ok(verification_required());
        }
        Err(AppError::Auth(status_message(status, &body)))
    }

    pub async fn sign_up(
        &self,
        email: String,
        password: String,
        name: String,
    ) -> AppResult<AuthResult> {
        let response = self
            .server_client
            .sign_up_email(&email, &password, &name)
            .await
            .map_err(network_error)?;
        expect_success(response).await?;
        // `requireEmailVerification` means sign-up creates the account (unverified) and
        // auto-sends the OTP, but returns no session — the user must verify first.
        Ok(verification_required())
    }

    /// Confirm the account with the emailed code. On success the caller signs in again
    /// (now verified) to obtain a session.
    pub async fn verify_email(&self, email: String, otp: String) -> AppResult<()> {
        let response = self
            .server_client
            .verify_email_otp(&email, &otp)
            .await
            .map_err(network_error)?;
        expect_success(response).await
    }

    /// (Re)send the verification code to the account's email.
    pub async fn resend_verification(&self, email: String) -> AppResult<()> {
        let response = self
            .server_client
            .send_verification_otp(&email)
            .await
            .map_err(network_error)?;
        expect_success(response).await
    }

    /// Email a password-reset code. The server reports success even for unknown
    /// addresses (no account enumeration), so this only fails on transport errors.
    pub async fn request_password_reset(&self, email: String) -> AppResult<()> {
        let response = self
            .server_client
            .request_password_reset(&email)
            .await
            .map_err(network_error)?;
        expect_success(response).await
    }

    /// Set a new password with the emailed code. On success the caller signs in
    /// with the new password to obtain a session.
    pub async fn reset_password(
        &self,
        email: String,
        otp: String,
        password: String,
    ) -> AppResult<()> {
        let response = self
            .server_client
            .reset_password(&email, &otp, &password)
            .await
            .map_err(network_error)?;
        expect_success(response).await
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

fn authenticated(user: AuthUser) -> AuthResult {
    AuthResult {
        status: AuthStatus::Authenticated,
        user: Some(user),
    }
}

fn verification_required() -> AuthResult {
    AuthResult {
        status: AuthStatus::VerificationRequired,
        user: None,
    }
}

/// True when Better Auth rejected sign-in because the email isn't verified yet.
fn is_email_not_verified(body: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("code")?.as_str().map(|code| code == "EMAIL_NOT_VERIFIED"))
        .unwrap_or(false)
}

/// `Ok` on a 2xx response, otherwise the server's error message.
async fn expect_success(response: Response) -> AppResult<()> {
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(AppError::Auth(status_message(status, &body)))
}

#[derive(Deserialize)]
struct AuthResponse {
    user: AuthUser,
}
