import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Better Auth's tables (user/session/account/verification) — re-exported so the shared
// Drizzle client (and Better Auth's adapter) sees them alongside the app tables.
export * from './auth-schema.js';

/**
 * Opaque AES-GCM ciphertext stored verbatim in a `cipher`/`wrapped_vmk` column;
 * the DB never sees plaintext. Structurally identical to `@blink/contract`'s
 * `RecordCipher` — declared locally so this emitting package doesn't pull another
 * workspace's TS source into its build.
 */
export interface RecordCipher {
  ciphertext: string;
  iv: string;
}

// Tenancy root (Phase 3 SSO/IAM). Groups users, workspaces and policies.
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The zero-knowledge sync store: one opaque encrypted blob per client row, of any
// kind (task, group, setting). The server understands nothing but ownership + clocks.
export const records = pgTable(
  'records',
  {
    // Client-generated UUID — the same id on every device, so it's the stable LWW
    // conflict key. No defaultRandom: the client owns it, not the server.
    id: uuid('id').primaryKey(),
    // The Better Auth user id — a text nanoid (not a UUID), so this column is text and
    // the RLS policy compares it as text (no `::uuid` cast).
    ownerId: text('owner_id').notNull(),

    // The entire client row, serialized and encrypted under the VMK. Opaque.
    cipher: jsonb('cipher').notNull().$type<RecordCipher>(),

    // Hybrid Logical Clock — edit-time ordering, decides LWW conflicts.
    hlcPhysical: bigint('hlc_physical', { mode: 'number' }).notNull(),
    hlcCounter: integer('hlc_counter').notNull(),
    hlcNodeId: text('hlc_node_id').notNull(),

    // Server-assigned monotonic cursor for pull ("give me everything since N").
    // Immune to device clock skew, unlike the HLC. Bumped on every upsert.
    seq: bigserial('seq', { mode: 'number' }).notNull(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('records_owner_seq_idx').on(t.ownerId, t.seq)],
);

// One row per user: the 2SKD account keyset. `wrapped_vmk` is the Vault Master Key
// encrypted under the KEK (opaque); the KDF params let a new device re-derive the
// KEK from the master password + Secret Key. The server can never derive the KEK.
export const syncKeysets = pgTable('sync_keysets', {
  // The Better Auth user id (text nanoid), one keyset per user.
  ownerId: text('owner_id').primaryKey(),
  wrappedVmk: jsonb('wrapped_vmk').notNull().$type<RecordCipher>(),
  kdfSalt: text('kdf_salt').notNull(),
  kdfIterations: integer('kdf_iterations').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RecordRow = typeof records.$inferSelect;
export type NewRecordRow = typeof records.$inferInsert;
export type KeysetRow = typeof syncKeysets.$inferSelect;
export type NewKeysetRow = typeof syncKeysets.$inferInsert;
