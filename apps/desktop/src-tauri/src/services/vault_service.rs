//! The device's encryption vault. Holds the unlocked Vault Master Key (VMK) in memory
//! and encrypts/decrypts record payloads with it via the pure `core::crypto`
//! primitives. The VMK is cached in the OS keychain (same store as the DB key and
//! session token), so day-to-day sync needs neither the master password nor the
//! Secret Key.
//!
//! It's server-agnostic: [`VaultService::setup`] returns the keyset for the caller to
//! upload, and [`VaultService::unlock`] takes the keyset the caller fetched — the
//! network round-trip lives in the sync layer, not here.

use std::sync::Mutex;

use keyring::Entry;

use crate::core::crypto::{self, Envelope, Keyset, PBKDF2_ITERATIONS};
use crate::core::error::{AppError, AppResult};

const KEYCHAIN_SERVICE: &str = "app.blink.desktop";
const VMK_ACCOUNT: &str = "sync-vmk";

/// First-time setup output: the Secret Key to show the user **once**, and the keyset
/// to upload to the server.
pub struct VaultSetup {
    pub secret_key: String,
    pub keyset: Keyset,
}

pub struct VaultService {
    // The unlocked VMK, or `None` when locked. Cached in the keychain across runs.
    vmk: Mutex<Option<[u8; 32]>>,
}

impl VaultService {
    /// Restore a previously-cached VMK from the keychain (unlocked on a prior run);
    /// starts locked if there's none (or the keychain is unavailable).
    pub fn new() -> Self {
        let vmk = load_cached_vmk().unwrap_or(None);
        Self { vmk: Mutex::new(vmk) }
    }

    pub fn is_unlocked(&self) -> bool {
        self.vmk.lock().map(|guard| guard.is_some()).unwrap_or(false)
    }

    /// First-time setup: mint a Secret Key + VMK, wrap the VMK under the KEK derived
    /// from the master password + Secret Key, cache the VMK, and return the Secret Key
    /// (to show once) plus the keyset (for the caller to upload).
    pub fn setup(&self, master_password: &str) -> AppResult<VaultSetup> {
        let secret_key = crypto::generate_secret_key()?;
        let vmk = crypto::generate_vmk()?;
        let salt = crypto::generate_salt()?;
        let kek = crypto::derive_kek(master_password, &secret_key, &salt, PBKDF2_ITERATIONS)?;
        let wrapped_vmk = crypto::wrap_vmk(&kek, &vmk)?;

        self.cache_vmk(vmk)?;
        Ok(VaultSetup {
            secret_key,
            keyset: Keyset {
                wrapped_vmk,
                kdf_salt: crypto::encode(&salt),
                kdf_iterations: PBKDF2_ITERATIONS,
            },
        })
    }

    /// Unlock on a new device: derive the KEK from the master password + Secret Key +
    /// the server-fetched keyset, unwrap the VMK, and cache it. Fails (wrong password
    /// or Secret Key) if the GCM tag on the wrapped VMK doesn't verify.
    pub fn unlock(&self, master_password: &str, secret_key: &str, keyset: &Keyset) -> AppResult<()> {
        let salt = crypto::decode(&keyset.kdf_salt)?;
        let kek = crypto::derive_kek(master_password, secret_key, &salt, keyset.kdf_iterations)?;
        let vmk = crypto::unwrap_vmk(&kek, &keyset.wrapped_vmk)?;
        self.cache_vmk(vmk)
    }

    /// Forget the cached VMK (sign-out) — locks the vault and clears the keychain.
    pub fn lock(&self) -> AppResult<()> {
        *self.vmk.lock().map_err(lock_poisoned)? = None;
        clear_cached_vmk()
    }

    /// Encrypt a record payload with the unlocked VMK.
    pub fn encrypt(&self, plaintext: &[u8]) -> AppResult<Envelope> {
        self.with_vmk(|vmk| crypto::encrypt(vmk, plaintext))
    }

    /// Decrypt a record payload with the unlocked VMK.
    pub fn decrypt(&self, envelope: &Envelope) -> AppResult<Vec<u8>> {
        self.with_vmk(|vmk| crypto::decrypt(vmk, envelope))
    }

    fn with_vmk<T>(&self, f: impl FnOnce(&[u8; 32]) -> AppResult<T>) -> AppResult<T> {
        let guard = self.vmk.lock().map_err(lock_poisoned)?;
        let vmk = guard.as_ref().ok_or_else(|| AppError::Crypto("vault is locked".into()))?;
        f(vmk)
    }

    fn cache_vmk(&self, vmk: [u8; 32]) -> AppResult<()> {
        store_cached_vmk(&vmk)?;
        *self.vmk.lock().map_err(lock_poisoned)? = Some(vmk);
        Ok(())
    }
}

fn entry() -> AppResult<Entry> {
    Entry::new(KEYCHAIN_SERVICE, VMK_ACCOUNT)
        .map_err(|e| AppError::Store(format!("keychain unavailable: {e}")))
}

fn load_cached_vmk() -> AppResult<Option<[u8; 32]>> {
    match entry()?.get_password() {
        Ok(b64) => Ok(Some(decode_vmk(&b64)?)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Store(format!("could not read cached VMK: {e}"))),
    }
}

fn store_cached_vmk(vmk: &[u8; 32]) -> AppResult<()> {
    entry()?
        .set_password(&crypto::encode(vmk))
        .map_err(|e| AppError::Store(format!("could not cache VMK: {e}")))
}

fn clear_cached_vmk() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Store(format!("could not clear cached VMK: {e}"))),
    }
}

fn decode_vmk(b64: &str) -> AppResult<[u8; 32]> {
    crypto::decode(b64)?
        .try_into()
        .map_err(|_| AppError::Crypto("cached VMK has wrong length".into()))
}

fn lock_poisoned<T>(_: std::sync::PoisonError<T>) -> AppError {
    AppError::Crypto("vault lock poisoned".into())
}
