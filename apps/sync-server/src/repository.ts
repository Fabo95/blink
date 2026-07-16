import { type BlinkDb, type BlinkTx, createDb, tasks, withUser } from '@blink/db';
import type { SyncPacket } from '@blink/sync';
import { gte, sql } from 'drizzle-orm';

/**
 * Persistence seam for the sync API. The API never inspects ciphertext — it only
 * routes {@link SyncPacket}s to/from the owner's rows. Two implementations:
 *
 *   {@link InMemoryTaskRepository}  — dev/test, no Postgres required.
 *   {@link PostgresTaskRepository}  — the real self-hosted Cloud-Postgres store,
 *                                     via Drizzle, with Row-Level Security.
 */
export interface TaskRepository {
  /** Upsert the caller's packets. Returns how many were accepted. */
  push(userId: string, packets: SyncPacket[]): Promise<number>;
  /** Return the caller's packets updated at/after the given HLC physical time. */
  pull(userId: string, sincePhysical: number): Promise<SyncPacket[]>;
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly byUser = new Map<string, Map<string, SyncPacket>>();

  async push(userId: string, packets: SyncPacket[]): Promise<number> {
    const bucket = this.byUser.get(userId) ?? new Map<string, SyncPacket>();
    for (const packet of packets) {
      const existing = bucket.get(packet.taskId);
      // Last-writer-wins on the HLC — a placeholder for the real CRDT merge.
      if (!existing || isNewer(packet, existing)) bucket.set(packet.taskId, packet);
    }
    this.byUser.set(userId, bucket);
    return packets.length;
  }

  async pull(userId: string, sincePhysical: number): Promise<SyncPacket[]> {
    const bucket = this.byUser.get(userId);
    if (!bucket) return [];
    return [...bucket.values()].filter((p) => p.clock.physical >= sincePhysical);
  }
}

function isNewer(a: SyncPacket, b: SyncPacket): boolean {
  if (a.clock.physical !== b.clock.physical) return a.clock.physical > b.clock.physical;
  if (a.clock.counter !== b.clock.counter) return a.clock.counter > b.clock.counter;
  return a.clock.nodeId > b.clock.nodeId;
}

/**
 * Postgres-backed repository against the self-hosted Cloud-Postgres via Drizzle.
 *
 * Every call runs inside {@link withUser}, which sets `app.current_user_id` so
 * Row-Level Security scopes all statements to the caller. Sensitive fields are
 * stored verbatim as the ciphertext envelopes the client already produced.
 */
export class PostgresTaskRepository implements TaskRepository {
  private readonly db: BlinkDb;

  constructor(connectionString: string) {
    this.db = createDb(connectionString);
  }

  async push(userId: string, packets: SyncPacket[]): Promise<number> {
    if (packets.length === 0) return 0;
    return withUser(this.db, userId, async (tx) => {
      for (const packet of packets) await upsertPacket(tx, userId, packet);
      return packets.length;
    });
  }

  async pull(userId: string, sincePhysical: number): Promise<SyncPacket[]> {
    return withUser(this.db, userId, async (tx) => {
      const rows = await tx.select().from(tasks).where(gte(tasks.hlcPhysical, sincePhysical));
      return rows.map(rowToPacket);
    });
  }
}

async function upsertPacket(tx: BlinkTx, userId: string, packet: SyncPacket): Promise<void> {
  const fields = {
    status: packet.status,
    titleCipher: packet.encrypted.title,
    bodyCipher: packet.encrypted.body,
    hlcPhysical: packet.clock.physical,
    hlcCounter: packet.clock.counter,
    hlcNodeId: packet.clock.nodeId,
    updatedAt: new Date(),
  };
  await tx
    .insert(tasks)
    .values({ id: packet.taskId, ownerId: userId, ...fields })
    .onConflictDoUpdate({
      target: tasks.id,
      set: fields,
      // LWW on the Hybrid Logical Clock — ignore stale writes. Placeholder until
      // the field-level CRDT merge lands.
      setWhere: sql`(${tasks.hlcPhysical}, ${tasks.hlcCounter}, ${tasks.hlcNodeId}) < (${packet.clock.physical}, ${packet.clock.counter}, ${packet.clock.nodeId})`,
    });
}

function rowToPacket(row: typeof tasks.$inferSelect): SyncPacket {
  return {
    taskId: row.id,
    clock: { physical: row.hlcPhysical, counter: row.hlcCounter, nodeId: row.hlcNodeId },
    status: row.status,
    encrypted: { title: row.titleCipher, body: row.bodyCipher },
  };
}
