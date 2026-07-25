//! Auth IPC: sign in/up/out against the sync server and report the cached session.
//! The webview never sees the bearer token — it lives in the keychain (native
//! layer); these commands only ever return the (non-secret) account profile.

use tauri::State;

use crate::core::error::{AppError, AppResult};
use crate::core::models::AuthUser;
use crate::repository::Repository;
use crate::services::auth::AuthService;

/// The cached account profile — persisted so the login gate works offline and can
/// show who's signed in without a round-trip.
const AUTH_USER_KEY: &str = "auth_user";

#[tauri::command]
pub async fn sign_in(
    auth_service: State<'_, AuthService>,
    repository: State<'_, Repository>,
    email: String,
    password: String,
) -> AppResult<AuthUser> {
    let user = auth_service.sign_in(email, password).await?;
    cache_user(&repository, &user)?;
    Ok(user)
}

#[tauri::command]
pub async fn sign_up(
    auth_service: State<'_, AuthService>,
    repository: State<'_, Repository>,
    email: String,
    password: String,
    name: String,
) -> AppResult<AuthUser> {
    let user = auth_service.sign_up(email, password, name).await?;
    cache_user(&repository, &user)?;
    Ok(user)
}

#[tauri::command]
pub async fn sign_out(
    auth_service: State<'_, AuthService>,
    repository: State<'_, Repository>,
) -> AppResult<()> {
    auth_service.sign_out().await?;
    repository.settings.remove(AUTH_USER_KEY)
}

/// The signed-in account on this device, or `None` when signed out. Offline-first:
/// it reads the local cache and trusts it only while the keychain still holds a
/// token, so app launch never blocks on the network.
#[tauri::command]
pub fn current_session(
    auth_service: State<'_, AuthService>,
    repository: State<'_, Repository>,
) -> AppResult<Option<AuthUser>> {
    if !auth_service.is_authenticated()? {
        return Ok(None);
    }
    let Some(json) = repository.settings.get(AUTH_USER_KEY)? else {
        return Ok(None);
    };
    serde_json::from_str(&json)
        .map(Some)
        .map_err(|e| AppError::Auth(format!("could not read the cached account: {e}")))
}

fn cache_user(repository: &Repository, user: &AuthUser) -> AppResult<()> {
    let json = serde_json::to_string(user)
        .map_err(|e| AppError::Auth(format!("could not cache the account: {e}")))?;
    repository.settings.set(AUTH_USER_KEY, &json)
}
