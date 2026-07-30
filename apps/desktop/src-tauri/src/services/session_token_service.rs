//! The sync session bearer token, kept in the OS keychain (the same store as the
//! SQLCipher key). Isolated from the auth flow so future native code (e.g. the sync
//! loop) can read the token without going through auth. It never reaches the webview.

use keyring::Entry;

use crate::core::error::{AppError, AppResult};

/// Keychain-backed store for the session token. Points at a fixed keychain item;
/// constructed once and held by the service that needs it.
pub struct SessionTokenService {
    service: &'static str,
    account: &'static str,
}

impl SessionTokenService {
    pub fn new() -> Self {
        Self {
            service: "app.blink.desktop",
            account: "sync-session-token",
        }
    }

    /// The stored token, or `None` when signed out.
    pub fn read(&self) -> AppResult<Option<String>> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Auth(format!("could not read session token: {e}"))),
        }
    }

    pub fn store(&self, token: &str) -> AppResult<()> {
        self.entry()?
            .set_password(token)
            .map_err(|e| AppError::Auth(format!("could not store session token: {e}")))
    }

    pub fn clear(&self) -> AppResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Auth(format!("could not clear session token: {e}"))),
        }
    }

    fn entry(&self) -> AppResult<Entry> {
        Entry::new(self.service, self.account)
            .map_err(|e| AppError::Auth(format!("keychain unavailable: {e}")))
    }
}
