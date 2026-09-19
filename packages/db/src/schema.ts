import { sql } from 'drizzle-orm';
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
 * The payload of a synced row — the whole client row as JSON, tagged by `kind`.
 * Structurally identical to `@blink/contract`'s `RecordBody`; declared locally so
 * this emitting package doesn't pull another workspace's TS source into its build.
 */
export interface RecordBody {
  kind: string;
  [field: string]: unknown;
}

// Tenancy root (Phase 3 SSO/IAM). Groups users, workspaces and policies.
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The sync store: one row per client row, of any kind (task, group, setting).
export const records = pgTable(
  'records',
  {
    // Client-generated UUID — the same id on every device, so it's the stable LWW
    // conflict key. No defaultRandom: the client owns it, not the server.
    id: uuid('id').primaryKey(),
    // The Better Auth user id — a text nanoid (not a UUID), so this column is text and
    // the RLS policy compares it as text (no `::uuid` cast).
    ownerId: text('owner_id').notNull(),

    // The entire client row, serialized. Loose by design: the server reads `kind` (and
    // `status`, below) and otherwise stores whatever the client sent, so the desktop
    // can add fields without a lockstep server migration.
    body: jsonb('body').notNull().$type<RecordBody>(),

    // Derived from `body` by Postgres itself — a query surface (indexes, plain SQL for
    // a web inbox or an agent listing tasks) that costs no write path and can't drift
    // from the JSON. A body that omits the key yields NULL rather than failing.
    kind: text('kind').generatedAlwaysAs(sql`(body->>'kind')`),
    status: text('status').generatedAlwaysAs(sql`(body->>'status')`),

    // Hybrid Logical Clock — edit-time ordering, decides LWW conflicts.
    hlcPhysical: bigint('hlc_physical', { mode: 'number' }).notNull(),
    hlcCounter: integer('hlc_counter').notNull(),
    hlcNodeId: text('hlc_node_id').notNull(),

    // Server-assigned monotonic cursor for pull ("give me everything since N").
    // Immune to device clock skew, unlike the HLC. Bumped on every upsert.
    seq: bigserial('seq', { mode: 'number' }).notNull(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('records_owner_seq_idx').on(t.ownerId, t.seq),
    index('records_owner_kind_idx').on(t.ownerId, t.kind, t.status),
  ],
);

export type RecordRow = typeof records.$inferSelect;
export type NewRecordRow = typeof records.$inferInsert;
