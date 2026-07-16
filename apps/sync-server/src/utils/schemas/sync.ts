import { z } from 'zod';

/** Opaque E2EE envelope — the server stores/returns it verbatim. */
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

/** CRDT Hybrid Logical Clock. */
export const zHlc = z.object({
  physical: z.number(),
  counter: z.number(),
  nodeId: z.string(),
});

export const zTaskStatus = z.enum(['inbox', 'active', 'exported', 'archived']);

/** The unit synced to/from the cloud. Sensitive fields are ciphertext. */
export const zSyncPacket = z.object({
  taskId: z.string().uuid(),
  clock: zHlc,
  status: zTaskStatus,
  encrypted: z.object({
    title: zEncryptedEnvelope,
    body: zEncryptedEnvelope,
  }),
});

export type SyncPacket = z.infer<typeof zSyncPacket>;
