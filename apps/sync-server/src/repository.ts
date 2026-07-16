import type { SyncPacket } from '@blink/sync';

/**
 * Persistence seam for the sync API. The API never inspects ciphertext — it only
 * routes {@link SyncPacket}s to/from the owner's rows. Two implementations:
 *
 *   {@link InMemoryTaskRepository}  — dev/test, no Postgres required.
 *   {@link PostgresTaskRepository}  — the real self-hosted Cloud-Postgres store.
 */
export interface TaskRepository {
  /** Upsert the caller's packets. Returns how many rows were written. */
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
 * Postgres-backed repository against the self-hosted Cloud-Postgres.
 *
 * TODO(phase-2): implement with the `pg` driver. Each call opens a transaction,
 * runs `SET LOCAL app.current_user_id = $userId` so Row-Level Security scopes
 * every statement to the caller, then upserts/selects the `tasks` table mapping
 * `SyncPacket.encrypted.*` onto the `*_cipher` columns. See db/migrations.
 */
export class PostgresTaskRepository implements TaskRepository {
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async push(_userId: string, _packets: SyncPacket[]): Promise<number> {
    void this.connectionString;
    throw new Error('PostgresTaskRepository requires the `pg` driver (not yet installed)');
  }

  async pull(_userId: string, _sincePhysical: number): Promise<SyncPacket[]> {
    throw new Error('PostgresTaskRepository requires the `pg` driver (not yet installed)');
  }
}
