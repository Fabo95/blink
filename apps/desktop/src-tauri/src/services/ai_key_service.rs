//! The user's own AI API key, kept in the OS keychain (the same store as the
//! SQLCipher key and the session token). Bring-your-own-key: set at runtime from
//! the settings UI after a connection test — never from a bundled env. Read by
//! [`crate::services::ai_service::AiService`]; it never reaches the webview.

use keyring::Entry;

use crate::core::error::{AppError, AppResult};

/// Keychain-backed store for the AI API key. Points at a fixed keychain item;
/// constructed once and held by the service that needs it.
pub struct AiKeyService {
    service: &'static str,
    account: &'static str,
}

impl AiKeyService {
    pub fn new() -> Self {
        Self {
            service: "app.blink.desktop",
            account: "openai-api-key",
        }
    }

    /// The stored key, or `None` when the user hasn't set one.
    pub fn read(&self) -> AppResult<Option<String>> {
        match self.entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Ai(format!("could not read API key: {e}"))),
        }
    }

    pub fn store(&self, key: &str) -> AppResult<()> {
        self.entry()?
            .set_password(key)
            .map_err(|e| AppError::Ai(format!("could not store API key: {e}")))
    }

    pub fn clear(&self) -> AppResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Ai(format!("could not clear API key: {e}"))),
        }
    }

    fn entry(&self) -> AppResult<Entry> {
        Entry::new(self.service, self.account)
            .map_err(|e| AppError::Ai(format!("keychain unavailable: {e}")))
    }
}
