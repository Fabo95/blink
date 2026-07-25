import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
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
 * Opaque E2EE envelope stored verbatim in a `*_cipher` column. Structurally
 * identical to `@blink/crypto`'s `EncryptedEnvelope` — declared locally so this
 * emitting package doesn't pull another workspace's TS source into its build.
 */
export interface CipherEnvelope {
  ciphertext: string;
  iv: string;
  kdf: { algorithm: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
}

// Tenancy root (Phase 3 SSO/IAM). Groups users, workspaces and policies.
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The zero-knowledge task store. `*_cipher` columns hold opaque E2EE envelopes;
// the DB never sees plaintext. Tenancy is enforced by RLS (see the rls migration).
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // TODO(phase-3): NOT NULL once workspaces/orgs are provisioned at sign-in.
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').notNull(),
    status: text('status').notNull().default('inbox').$type<TaskStatus>(),

    titleCipher: jsonb('title_cipher').notNull().$type<CipherEnvelope>(),
    bodyCipher: jsonb('body_cipher').notNull().$type<CipherEnvelope>(),

    // CRDT Hybrid Logical Clock. Non-sensitive ordering metadata.
    hlcPhysical: bigint('hlc_physical', { mode: 'number' }).notNull(),
    hlcCounter: integer('hlc_counter').notNull(),
    hlcNodeId: text('hlc_node_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_idx').on(t.orgId),
    index('tasks_owner_idx').on(t.ownerId),
    check('tasks_status_check', sql`${t.status} in ('inbox', 'active', 'exported', 'archived')`),
  ],
);

export type TaskStatus = 'inbox' | 'active' | 'exported' | 'archived';
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
