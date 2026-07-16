import type { Task } from '@blink/core';
import type { EncryptedEnvelope } from '@blink/crypto';

/**
 * CRDT-based bidirectional sync between offline devices and Cloud-Postgres.
 *
 * Design constraints from the architecture doc:
 *   - Conflict-free: concurrent edits on multiple offline devices must merge
 *     without a central lock (last-writer-wins is NOT sufficient for body text).
 *   - Zero-knowledge: sensitive fields are already {@link EncryptedEnvelope}s
 *     before they enter a {@link SyncPacket}; the transport and the server see
 *     only ciphertext.
 *
 * Phase-2 will back this with a real CRDT (e.g. a per-field LWW-map with a
 * Hybrid Logical Clock, or Yjs for the body) and a Supabase Realtime channel.
 * This module defines the seam and the wire format only.
 */

/** A monotonic per-device clock used to order and merge concurrent updates. */
export interface HybridLogicalClock {
  /** Wall-clock millis at emit time. */
  physical: number;
  /** Logical counter, bumped on same-millisecond events. */
  counter: number;
  /** Stable device identifier. */
  nodeId: string;
}

/** The unit pushed to / pulled from the cloud. Sensitive fields are ciphertext. */
export interface SyncPacket {
  taskId: string;
  clock: HybridLogicalClock;
  /** Non-sensitive metadata may travel in clear (status, timestamps). */
  status: Task['status'];
  /** Sensitive fields, individually encrypted client-side. */
  encrypted: {
    title: EncryptedEnvelope;
    body: EncryptedEnvelope;
  };
}

export interface SyncTransport {
  push(packets: SyncPacket[]): Promise<void>;
  pull(since: HybridLogicalClock | null): Promise<SyncPacket[]>;
}

export interface SyncEngineOptions {
  transport: SyncTransport;
  nodeId: string;
}

/**
 * Orchestrates the local ⇄ cloud reconciliation loop.
 *
 * TODO(phase-2): implement CRDT merge, HLC advancement, and Supabase Realtime
 * subscription. Until then `sync()` is a no-op that documents the contract.
 */
export class CrdtSyncEngine {
  constructor(private readonly options: SyncEngineOptions) {}

  async sync(): Promise<{ pushed: number; pulled: number }> {
    // TODO(phase-2): diff local CRDT state against last-synced HLC, encrypt
    // dirty fields, push, then merge pulled packets conflict-free.
    void this.options;
    return { pushed: 0, pulled: 0 };
  }
}

/**
 * Self-hosted transport — the default for VPC / on-premise tenants.
 *
 * Talks to the Blink sync API (`apps/sync-server`), which is the only thing that
 * touches Cloud-Postgres. The client never sees the DB; it sends already-E2EE
 * {@link SyncPacket}s over HTTPS with a bearer token the API maps onto a
 * Row-Level-Security session. See `db/migrations`.
 */
export class HttpSyncTransport implements SyncTransport {
  constructor(private readonly config: { baseUrl: string; token: string }) {}

  async push(packets: SyncPacket[]): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/v1/sync/push`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ packets }),
    });
    if (!res.ok) throw new Error(`sync push failed: ${res.status}`);
  }

  async pull(since: HybridLogicalClock | null): Promise<SyncPacket[]> {
    const url = new URL(`${this.config.baseUrl}/v1/sync/pull`);
    url.searchParams.set('since', String(since?.physical ?? 0));
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`sync pull failed: ${res.status}`);
    const body = (await res.json()) as { packets: SyncPacket[] };
    return body.packets;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.config.token}`,
    };
  }
}

/**
 * Managed-cloud transport — for hosted Blink tenants who don't self-host.
 *
 * TODO(phase-2): construct a `@supabase/supabase-js` client and map push/pull
 * onto the `tasks` table (Row-Level Security enforced).
 */
export class SupabaseSyncTransport implements SyncTransport {
  constructor(private readonly config: { url: string; anonKey: string }) {}

  async push(_packets: SyncPacket[]): Promise<void> {
    void this.config;
    throw new Error('SupabaseSyncTransport.push not implemented until Phase 2');
  }

  async pull(_since: HybridLogicalClock | null): Promise<SyncPacket[]> {
    throw new Error('SupabaseSyncTransport.pull not implemented until Phase 2');
  }
}
