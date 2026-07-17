import { encodeUtf8, fromBase64, toBase64 } from './codec.js';
import type { EncryptedEnvelope } from './envelope.js';

export interface E2eeCipherOptions {
  /** PBKDF2 iterations. Default 310,000 (OWASP 2023 floor for HMAC-SHA256). */
  iterations?: number;
  /** AES-GCM key length in bits. Default 256. */
  keyLengthBits?: number;
  /** GCM IV length in bytes. Default 12. */
  ivBytes?: number;
}

const DEFAULTS = { iterations: 310_000, keyLengthBits: 256, ivBytes: 12 } as const;

/**
 * Zero-Knowledge E2EE for a single sensitive field.
 *
 * The invariant: fields that leave the device for the Cloud-Postgres are
 * encrypted here, on the client, under a key derived from a user-controlled
 * password. The operator only ever stores unreadable {@link EncryptedEnvelope}s.
 *
 * Uses the platform WebCrypto (`globalThis.crypto.subtle`), present in the Tauri
 * webview and Node ≥ 20 — no native dependency. KDF strength is configurable per
 * instance; decryption always re-derives with the iteration count recorded in
 * the envelope, so envelopes stay portable across policy changes.
 */
export class E2eeCipher {
  private readonly iterations: number;
  private readonly keyLengthBits: number;
  private readonly ivBytes: number;

  constructor(options: E2eeCipherOptions = {}) {
    this.iterations = options.iterations ?? DEFAULTS.iterations;
    this.keyLengthBits = options.keyLengthBits ?? DEFAULTS.keyLengthBits;
    this.ivBytes = options.ivBytes ?? DEFAULTS.ivBytes;
  }

  async encryptField(plaintext: string, password: string): Promise<EncryptedEnvelope> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(this.ivBytes));
    const key = await this.deriveKey(password, salt, this.iterations);
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
        iterations: this.iterations,
        salt: toBase64(salt),
      },
    };
  }

  async decryptField(envelope: EncryptedEnvelope, password: string): Promise<string> {
    const salt = fromBase64(envelope.kdf.salt);
    const iv = fromBase64(envelope.iv);
    const key = await this.deriveKey(password, salt, envelope.kdf.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      fromBase64(envelope.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  }

  /** Derive the symmetric key from the master password / IdP secret. */
  private async deriveKey(
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
      { name: 'AES-GCM', length: this.keyLengthBits },
      false,
      ['encrypt', 'decrypt'],
    );
  }
}

/** Shared default cipher using OWASP-floor KDF parameters. */
export const e2eeCipher = new E2eeCipher();
