import { z } from 'zod';

// The single source of truth for everything that crosses the client ↔ server sync
// boundary. Each shape is defined once, as a zod schema:
//   - the server validates incoming requests with the schema (runtime),
//   - the client and the crypto package derive their TypeScript types from it
//     via `z.infer` (compile-time).
// One definition per shape → nothing can drift.

/** An opaque AES-GCM ciphertext the server stores verbatim (zero-knowledge). Used
 * both for a synced record's payload (encrypted under the VMK) and for the wrapped
 * VMK itself (encrypted under the KEK). No KDF params here — the key is a raw 256-bit
 * key, not password-derived; KDF params for deriving the KEK live on {@link zKeyset}. */
export const zRecordCipher = z.object({
  ciphertext: z.string(),
  iv: z.string(),
});
export type RecordCipher = z.infer<typeof zRecordCipher>;

/** Legacy password-derived envelope. Still consumed by `@blink/crypto` (not yet
 * ported to the VMK model); the sync path uses {@link zRecordCipher} instead. */
export const zEncryptedEnvelope = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  kdf: z.object({
    algorithm: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number(),
    salt: z.string(),
  }),
});
export type EncryptedEnvelope = z.infer<typeof zEncryptedEnvelope>;

/** Per-device clock used to order and merge concurrent edits (LWW). */
export const zHybridLogicalClock = z.object({
  physical: z.number(),
  counter: z.number(),
  nodeId: z.string(),
});
export type HybridLogicalClock = z.infer<typeof zHybridLogicalClock>;

/** The unit the client pushes. The whole local row (of any kind — task, group,
 * setting) is serialized and encrypted into `cipher`; the server never learns the
 * shape or `kind`. `id` is the client-owned UUID, stable across devices, and the
 * LWW conflict key. */
export const zSyncPacket = z.object({
  id: z.string().uuid(),
  clock: zHybridLogicalClock,
  cipher: zRecordCipher,
});
export type SyncPacket = z.infer<typeof zSyncPacket>;

/** What the server returns on pull: a packet plus the server-assigned `seq`. `seq`
 * is the monotonic pull cursor (immune to device clock skew) — the client advances
 * its cursor to the max `seq` it has seen. */
export const zSyncRecord = zSyncPacket.extend({
  seq: z.number(),
});
export type SyncRecord = z.infer<typeof zSyncRecord>;

/** The per-user account keyset (1Password-style 2SKD). `wrappedVmk` is the Vault
 * Master Key encrypted under the KEK; `kdfSalt`/`kdfIterations` let a new device
 * re-derive the KEK from the master password + Secret Key. All zero-knowledge — the
 * server can't derive the KEK (it never sees the Secret Key or password). */
export const zKeyset = z.object({
  wrappedVmk: zRecordCipher,
  kdfSalt: z.string(),
  kdfIterations: z.number(),
});
export type Keyset = z.infer<typeof zKeyset>;
