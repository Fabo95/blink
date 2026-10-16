//! One secret in the OS keychain (service `app.blink.desktop`), as the Incoming sources keep
//! their pasted keys/tokens: read, store, forget, and a safe glimpse for the UI. The secret
//! itself never leaves the Rust core.

use keyring::Entry;

use crate::core::error::{AppError, AppResult};

const SERVICE: &str = "app.blink.desktop";

#[derive(Clone)]
pub struct KeychainSecret {
    account: &'static str,
}

impl KeychainSecret {
    pub fn new(account: &'static str) -> Self {
        Self { account }
    }

    pub fn read(&self) -> AppResult<Option<String>> {
        match self.entry()?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(self.error("read", e)),
        }
    }

    pub fn store(&self, secret: &str) -> AppResult<()> {
        self.entry()?
            .set_password(secret)
            .map_err(|e| self.error("store", e))
    }

    pub fn clear(&self) -> AppResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(self.error("remove", e)),
        }
    }

    fn entry(&self) -> AppResult<Entry> {
        Entry::new(SERVICE, self.account)
            .map_err(|e| AppError::Incoming(format!("keychain unavailable: {e}")))
    }

    fn error(&self, action: &str, e: keyring::Error) -> AppError {
        AppError::Incoming(format!(
            "could not {action} the {} keychain item: {e}",
            self.account
        ))
    }
}

/// Enough of a secret to recognise it (`lin_api_…a1b2`, `xoxp-123…wxyz`), never enough to
/// use it.
pub fn secret_hint(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    if chars.len() <= 12 {
        return "••••".into();
    }
    let head: String = chars[..8].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hint_shows_prefix_and_last_four_only() {
        assert_eq!(secret_hint("lin_api_ABCDEFGHIJKLMNOPwxyz"), "lin_api_…wxyz");
        assert_eq!(secret_hint("short"), "••••");
    }
}
