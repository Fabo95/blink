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
 * Supabase-backed transport seam.
 *
 * TODO(phase-2): construct a `@supabase/supabase-js` client and map push/pull
 * onto the `tasks` table (Row-Level Security enforced). See `supabase/migrations`.
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
