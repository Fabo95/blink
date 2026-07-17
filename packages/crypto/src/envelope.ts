/** A self-describing, opaque ciphertext blob — everything a peer needs to decrypt
 * given the user's password. Stored verbatim in the Cloud-Postgres `*_cipher`
 * columns; the operator only ever sees this. */
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
