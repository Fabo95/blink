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

/** How much work a task is. Mirrors the Rust `TaskEffort` stored spellings. */
export const zTaskEffort = z.enum(['quick', 'standard', 'deep']);
export type TaskEffort = z.infer<typeof zTaskEffort>;

/** A task row as it rides in {@link zRecordBody}. The server needs this one shape (and
 * only this one) so it can synthesize a task from a remote capture; every other kind
 * stays opaque to it. Mirrors `core::wire::TaskBody` field for field — snake_case,
 * because those Rust structs derive plain serde with no `rename_all`. */
export const zTaskBody = z.object({
  kind: z.literal('task'),
  text: z.string(),
  raw_text: z.string(),
  status: z.string(),
  effort: zTaskEffort,
  app_id: z.string(),
  app_name: z.string(),
  window_title: z.string(),
  captured_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  improved: z.boolean(),
  link: z.string().nullable(),
  completed_at: z.string().nullable(),
  task_group_id: z.string().nullable(),
  position: z.number(),
  deleted: z.boolean(),
});
export type TaskBody = z.infer<typeof zTaskBody>;

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

/** What an outside agent posts to `/v1/capture` to file a task — the minimum an iOS
 * Shortcut, a shell script or an LLM tool call should have to know. The server fills
 * in everything else a task row needs. */
export const zCaptureInput = z.object({
  text: z.string().min(1).max(10_000),
  link: z.string().url().nullish(),
  effort: zTaskEffort.default('standard'),
  taskGroupId: z.string().uuid().nullish(),
  /** Shown in the inbox as the capture's origin (e.g. "Siri", "Gemini"). */
  via: z.string().min(1).max(60).default('remote'),
});
export type CaptureInput = z.infer<typeof zCaptureInput>;
