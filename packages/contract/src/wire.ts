import { z } from 'zod';

// The single source of truth for everything that crosses the client ↔ server sync
// boundary. Each shape is defined once, as a zod schema:
//   - the server validates incoming requests with the schema (runtime),
//   - the client and the crypto package derive their TypeScript types from it
//     via `z.infer` (compile-time).
// One definition per shape → nothing can drift.

/** An opaque, encrypted field. The server stores it verbatim; only the client can
 * read it (zero-knowledge). */
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

/** Per-device clock used to order and merge concurrent edits. */
export const zHybridLogicalClock = z.object({
  physical: z.number(),
  counter: z.number(),
  nodeId: z.string(),
});
export type HybridLogicalClock = z.infer<typeof zHybridLogicalClock>;

export const zTaskStatus = z.enum(['inbox', 'active', 'exported', 'archived']);
export type TaskStatus = z.infer<typeof zTaskStatus>;

/** The unit synced to/from the cloud. Sensitive fields are already ciphertext. */
export const zSyncPacket = z.object({
  taskId: z.string().uuid(),
  clock: zHybridLogicalClock,
  status: zTaskStatus,
  encrypted: z.object({
    title: zEncryptedEnvelope,
    body: zEncryptedEnvelope,
  }),
});
export type SyncPacket = z.infer<typeof zSyncPacket>;
