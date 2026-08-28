//! Zero-knowledge sync crypto — 1Password-style two-secret-key derivation (2SKD).
//!
//! The device holds a random **VMK** (Vault Master Key) that encrypts every synced
//! record. The VMK never leaves the device in the clear: it's wrapped under a **KEK**
//! derived from the user's master password *and* a high-entropy **Secret Key** (shown
//! once, never sent to the server). So the server — which stores only the wrapped VMK
//! and record ciphertext — can never derive the key or read anything.
//!
//! All AEAD is AES-256-GCM; envelopes (`{ciphertext, iv}`, base64) match
//! `@blink/contract`'s `RecordCipher`, which the server stores verbatim.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::core::error::{AppError, AppResult};

/// PBKDF2 rounds for the master-password half of the KEK. Matches `@blink/crypto`.
pub const PBKDF2_ITERATIONS: u32 = 310_000;

const KEY_LEN: usize = 32; // AES-256
const NONCE_LEN: usize = 12; // AES-GCM standard nonce
const SALT_LEN: usize = 16;
const SECRET_KEY_BYTES: usize = 16; // 128-bit Secret Key

type HmacSha256 = Hmac<Sha256>;

/// An opaque AES-GCM envelope: base64 ciphertext (GCM tag appended) + base64 nonce.
/// Mirrors `@blink/contract`'s `RecordCipher` — stored verbatim by the server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub ciphertext: String,
    pub iv: String,
}

/// The per-user account keyset (2SKD): the VMK wrapped under the KEK, plus the KDF
/// params to re-derive the KEK on another device. Mirrors `@blink/contract`'s
/// `Keyset`; the server stores it opaquely. `kdf_salt` is base64.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyset {
    pub wrapped_vmk: Envelope,
    pub kdf_salt: String,
    pub kdf_iterations: u32,
}

/// Encrypt `plaintext` under a 32-byte key with a fresh random nonce.
pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8]) -> AppResult<Envelope> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| AppError::Crypto("bad key length".into()))?;
    let nonce = random_bytes::<NONCE_LEN>()?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| AppError::Crypto("encryption failed".into()))?;
    Ok(Envelope { ciphertext: B64.encode(ciphertext), iv: B64.encode(nonce) })
}

/// Decrypt an [`Envelope`] under a 32-byte key. Fails (rather than returning garbage)
/// on the wrong key or tampered ciphertext — the GCM tag is authenticated.
pub fn decrypt(key: &[u8; KEY_LEN], envelope: &Envelope) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| AppError::Crypto("bad key length".into()))?;
    let nonce = B64.decode(&envelope.iv).map_err(|e| AppError::Crypto(format!("bad iv: {e}")))?;
    if nonce.len() != NONCE_LEN {
        return Err(AppError::Crypto("bad iv length".into()));
    }
    let ciphertext = B64
        .decode(&envelope.ciphertext)
        .map_err(|e| AppError::Crypto(format!("bad ciphertext: {e}")))?;
    cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| AppError::Crypto("decryption failed (wrong key or tampered data)".into()))
}

/// Wrap the VMK under the KEK for storage on the server (opaque ciphertext).
pub fn wrap_vmk(kek: &[u8; KEY_LEN], vmk: &[u8; KEY_LEN]) -> AppResult<Envelope> {
    encrypt(kek, vmk)
}

/// Unwrap the VMK from its server-stored envelope using the KEK. A wrong KEK (wrong
/// master password or Secret Key) fails here — the tag won't verify.
pub fn unwrap_vmk(kek: &[u8; KEY_LEN], wrapped: &Envelope) -> AppResult<[u8; KEY_LEN]> {
    let bytes = decrypt(kek, wrapped)?;
    bytes.try_into().map_err(|_| AppError::Crypto("unwrapped VMK has wrong length".into()))
}

/// Derive the Key-Encryption-Key from the master password + Secret Key (2SKD): PBKDF2
/// stretches the password, then one HMAC-SHA256 mixes in the Secret Key. Both inputs
/// are required to reproduce the KEK, and neither ever reaches the server.
pub fn derive_kek(
    master_password: &str,
    secret_key: &str,
    salt: &[u8],
    iterations: u32,
) -> AppResult<[u8; KEY_LEN]> {
    let mut k_pw = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<Sha256>(master_password.as_bytes(), salt, iterations, &mut k_pw);

    let mut mac = <HmacSha256 as Mac>::new_from_slice(normalize_secret_key(secret_key).as_bytes())
        .map_err(|e| AppError::Crypto(format!("hmac init: {e}")))?;
    mac.update(&k_pw);
    let derived = mac.finalize().into_bytes();

    let mut kek = [0u8; KEY_LEN];
    kek.copy_from_slice(&derived);
    Ok(kek)
}

/// A fresh random Vault Master Key.
pub fn generate_vmk() -> AppResult<[u8; KEY_LEN]> {
    random_bytes::<KEY_LEN>()
}

/// A fresh random KDF salt (stored on the server alongside the wrapped VMK).
pub fn generate_salt() -> AppResult<[u8; SALT_LEN]> {
    random_bytes::<SALT_LEN>()
}

/// A fresh Secret Key, formatted for the user to save (shown once, never sent).
pub fn generate_secret_key() -> AppResult<String> {
    let bytes = random_bytes::<SECRET_KEY_BYTES>()?;
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    // "A3-<8>-<8>-<8>-<8>": the A3 version marker + grouped hex for readability.
    let groups: Vec<&str> = (0..hex.len()).step_by(8).map(|i| &hex[i..i + 8]).collect();
    Ok(format!("A3-{}", groups.join("-")))
}

/// Base64 so callers encode salts the same way as envelope fields.
pub fn encode(bytes: &[u8]) -> String {
    B64.encode(bytes)
}

pub fn decode(s: &str) -> AppResult<Vec<u8>> {
    B64.decode(s).map_err(|e| AppError::Crypto(format!("bad base64: {e}")))
}

/// Strip formatting so a re-typed Secret Key derives the same KEK: keep alphanumerics,
/// lowercased. Generation and derivation must normalize identically.
fn normalize_secret_key(secret_key: &str) -> String {
    secret_key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn random_bytes<const N: usize>() -> AppResult<[u8; N]> {
    let mut buf = [0u8; N];
    getrandom::getrandom(&mut buf).map_err(|e| AppError::Crypto(format!("rng failure: {e}")))?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = generate_vmk().unwrap();
        let env = encrypt(&key, b"buy oat milk").unwrap();
        assert_eq!(decrypt(&key, &env).unwrap(), b"buy oat milk");
    }

    #[test]
    fn wrong_key_fails_loudly() {
        let env = encrypt(&generate_vmk().unwrap(), b"secret").unwrap();
        assert!(decrypt(&generate_vmk().unwrap(), &env).is_err());
    }

    #[test]
    fn distinct_nonces_per_encryption() {
        let key = generate_vmk().unwrap();
        let a = encrypt(&key, b"same").unwrap();
        let b = encrypt(&key, b"same").unwrap();
        assert_ne!(a.iv, b.iv);
        assert_ne!(a.ciphertext, b.ciphertext);
    }

    #[test]
    fn vmk_wrap_roundtrip() {
        let kek = generate_vmk().unwrap();
        let vmk = generate_vmk().unwrap();
        let wrapped = wrap_vmk(&kek, &vmk).unwrap();
        assert_eq!(unwrap_vmk(&kek, &wrapped).unwrap(), vmk);
    }

    #[test]
    fn kek_needs_both_secrets() {
        let salt = generate_salt().unwrap();
        let base = derive_kek("hunter2", "A3-0011-2233", &salt, 2000).unwrap();
        // Same inputs → same KEK.
        assert_eq!(base, derive_kek("hunter2", "A3-0011-2233", &salt, 2000).unwrap());
        // Wrong password → different KEK.
        assert_ne!(base, derive_kek("hunter3", "A3-0011-2233", &salt, 2000).unwrap());
        // Wrong Secret Key → different KEK.
        assert_ne!(base, derive_kek("hunter2", "A3-9999-2233", &salt, 2000).unwrap());
    }

    #[test]
    fn secret_key_normalization_is_format_insensitive() {
        let salt = generate_salt().unwrap();
        let dashed = derive_kek("pw", "A3-0011-2233-4455-6677", &salt, 2000).unwrap();
        let plain = derive_kek("pw", "a3001122334455 6677", &salt, 2000).unwrap();
        assert_eq!(dashed, plain);
    }
}
