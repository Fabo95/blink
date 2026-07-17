// Zero-Knowledge end-to-end encryption for a single sensitive field.
//
// Before a task's title/body leaves the device for the cloud, it's encrypted here
// under a key derived from a user-controlled password. The server only ever
// stores the unreadable EncryptedEnvelope. Uses the platform WebCrypto (present
// in the Tauri webview and Node ≥ 20) — no native dependency.
//
// NOTE: not wired into the app yet — this is the ready building block for Phase-2
// sync.

// The envelope shape is owned by the wire contract (single source of truth); we
// just produce and consume values of it here.
import type { EncryptedEnvelope } from '@blink/contract/wire';

export type { EncryptedEnvelope };

const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 floor for PBKDF2-HMAC-SHA256

export async function encryptField(
  plaintext: string,
  password: string,
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodeUtf8(plaintext),
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

export async function decryptField(envelope: EncryptedEnvelope, password: string): Promise<string> {
  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.iv);
  // Re-derive with the iteration count recorded in the envelope, so it stays
  // decryptable even if the default changes later.
  const key = await deriveKey(password, salt, envelope.kdf.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    fromBase64(envelope.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encodeUtf8(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// WebCrypto (TS 7 lib) requires ArrayBuffer-backed views, so pin the buffer type.
function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(text);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
