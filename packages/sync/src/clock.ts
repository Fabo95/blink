/** A monotonic per-device clock used to order and merge concurrent updates. */
export interface HybridLogicalClock {
  /** Wall-clock millis at emit time. */
  physical: number;
  /** Logical counter, bumped on same-millisecond events. */
  counter: number;
  /** Stable device identifier. */
  nodeId: string;
}

/**
 * Total order over HLCs. Returns a positive number if `a` is newer than `b`,
 * negative if older, 0 if identical. The `nodeId` tiebreak keeps the order total
 * so concurrent same-instant writes still converge. Used by the CRDT merge.
 */
export function compareClocks(a: HybridLogicalClock, b: HybridLogicalClock): number {
  if (a.physical !== b.physical) return a.physical - b.physical;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.nodeId === b.nodeId) return 0;
  return a.nodeId > b.nodeId ? 1 : -1;
}
