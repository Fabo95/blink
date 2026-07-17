import type { SyncTransport } from './transport.js';

export interface SyncEngineOptions {
  transport: SyncTransport;
  nodeId: string;
}

/**
 * Orchestrates the local ⇄ cloud reconciliation loop over a {@link SyncTransport}.
 *
 * Design constraints from the architecture doc:
 *   - Conflict-free: concurrent edits on multiple offline devices must merge
 *     without a central lock (last-writer-wins is NOT sufficient for body text).
 *   - Zero-knowledge: fields are encrypted before entering a packet.
 *
 * TODO(phase-2): implement CRDT merge (per-field LWW-map over the HLC, or Yjs for
 * the body), HLC advancement, and a realtime subscription. Until then `sync()` is
 * a no-op that documents the contract.
 */
export class CrdtSyncEngine {
  private readonly options: SyncEngineOptions;

  constructor(options: SyncEngineOptions) {
    this.options = options;
  }

  async sync(): Promise<{ pushed: number; pulled: number }> {
    // TODO(phase-2): diff local CRDT state against last-synced HLC, encrypt dirty
    // fields, push, then merge pulled packets conflict-free via compareClocks.
    void this.options;
    return { pushed: 0, pulled: 0 };
  }
}
