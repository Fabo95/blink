//! Auth IPC: sign in/up/out against the sync server and report the cached session.
//! The webview never sees the bearer token — it lives in the keychain (native
//! layer); these commands only ever return the (non-secret) account profile.

use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{AuthResult, AuthUser};
use crate::services::auth_service::AuthService;

#[tauri::command]
pub async fn sign_in(
    auth_service: State<'_, AuthService>,
    email: String,
    password: String,
) -> AppResult<AuthResult> {
    auth_service.sign_in(email, password).await
}

#[tauri::command]
pub async fn sign_up(
    auth_service: State<'_, AuthService>,
    email: String,
    password: String,
    name: String,
) -> AppResult<AuthResult> {
    auth_service.sign_up(email, password, name).await
}

#[tauri::command]
pub async fn verify_email(
    auth_service: State<'_, AuthService>,
    email: String,
    otp: String,
) -> AppResult<()> {
    auth_service.verify_email(email, otp).await
}

#[tauri::command]
pub async fn resend_verification(
    auth_service: State<'_, AuthService>,
    email: String,
) -> AppResult<()> {
    auth_service.resend_verification(email).await
}

#[tauri::command]
pub async fn request_password_reset(
    auth_service: State<'_, AuthService>,
    email: String,
) -> AppResult<()> {
    auth_service.request_password_reset(email).await
}

#[tauri::command]
pub async fn reset_password(
    auth_service: State<'_, AuthService>,
    email: String,
    otp: String,
    password: String,
) -> AppResult<()> {
    auth_service.reset_password(email, otp, password).await
}

#[tauri::command]
pub async fn sign_out(auth_service: State<'_, AuthService>) -> AppResult<()> {
    auth_service.sign_out().await
}

/// The signed-in account on this device, or `None` when signed out. Offline-first:
/// it reads the local cache and trusts it only while the keychain still holds a
/// token, so app launch never blocks on the network.
#[tauri::command]
pub fn current_session(auth_service: State<'_, AuthService>) -> AppResult<Option<AuthUser>> {
    auth_service.current_session()
}
