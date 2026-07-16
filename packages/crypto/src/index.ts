/**
 * Zero-Knowledge E2EE primitives for Blink's Secure Sync layer.
 *
 * The invariant: fields that leave the device for the Cloud-Postgres are
 * encrypted here, on the client, under a key the user controls. The operator
 * only ever stores unreadable ciphertext. These are the building blocks; the
 * Phase-2 sync engine composes them per row before pushing.
 *
 * All primitives use the platform WebCrypto (`globalThis.crypto.subtle`), which
 * exists in the Tauri webview and in Node ≥ 20 — no native crypto dependency.
 */

const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 floor for PBKDF2-HMAC-SHA256
const KEY_LENGTH_BITS = 256;
const GCM_IV_BYTES = 12;

export interface EncryptedEnvelope {
  /** base64 AES-GCM ciphertext (includes auth tag). */
  ciphertext: string;
  /** base64 random IV, unique per encryption. */
  iv: string;
  /** Key-derivation params, so a peer can re-derive the key from the password. */
  kdf: {
    algorithm: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    /** base64 salt. */
    salt: string;
  };
}

/**
 * Derive the symmetric master key from the user's master password / IdP secret.
 * The salt should be persisted (it is not secret) and reused for the account.
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt },
    material,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a single sensitive field into a self-describing envelope. */
export async function encryptField(
  plaintext: string,
  password: string,
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
  };
}

/** Decrypt an envelope produced by {@link encryptField}. */
export async function decryptField(envelope: EncryptedEnvelope, password: string): Promise<string> {
  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.iv);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    fromBase64(envelope.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
