import { z } from 'zod';

// The single source of truth for everything that crosses the client ↔ server sync
// boundary. Each shape is defined once, as a zod schema:
//   - the server validates incoming requests with the schema (runtime),
//   - the client derives its TypeScript types from it via `z.infer` (compile-time).
// One definition per shape → nothing can drift.

/** Per-device clock used to order and merge concurrent edits (LWW). */
export const zHybridLogicalClock = z.object({
  physical: z.number(),
  counter: z.number(),
  nodeId: z.string(),
});
export type HybridLogicalClock = z.infer<typeof zHybridLogicalClock>;

/** The payload of a synced row: the whole client row as JSON, tagged by `kind` so a
 * pulled record routes back to the right local table. Deliberately *loose* — the
 * server validates only `kind` (which it promotes to a generated column for indexing)
 * and stores the rest verbatim. That keeps the desktop free to add fields without a
 * server migration, which matters because the native app updates on its own schedule.
 *
 * Field names are snake_case to match the Rust structs in `core/wire.rs` exactly —
 * those derive plain serde, with no `rename_all` on the body structs. */
export const zRecordBody = z.looseObject({
  kind: z.string().min(1),
});
export type RecordBody = z.infer<typeof zRecordBody>;

/** The unit the client pushes. `id` is the client-owned UUID, stable across devices,
 * and the LWW conflict key. */
export const zSyncPacket = z.object({
  id: z.string().uuid(),
  clock: zHybridLogicalClock,
  body: zRecordBody,
});
export type SyncPacket = z.infer<typeof zSyncPacket>;

/** What the server returns on pull: a packet plus the server-assigned `seq`. `seq`
 * is the monotonic pull cursor (immune to device clock skew) — the client advances
 * its cursor to the max `seq` it has seen. */
export const zSyncRecord = zSyncPacket.extend({
  seq: z.number(),
});
export type SyncRecord = z.infer<typeof zSyncRecord>;
