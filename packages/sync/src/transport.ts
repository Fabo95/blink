import type { HybridLogicalClock } from './clock.js';
import type { SyncPacket } from './packet.js';

/**
 * The pluggable seam between the sync engine and a backend. Implement this to
 * add a new destination (self-hosted API, managed cloud, a test double).
 */
export interface SyncTransport {
  push(packets: SyncPacket[]): Promise<void>;
  pull(since: HybridLogicalClock | null): Promise<SyncPacket[]>;
}
