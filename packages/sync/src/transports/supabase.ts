import type { HybridLogicalClock } from '../clock.js';
import type { SyncPacket } from '../packet.js';
import type { SyncTransport } from '../transport.js';

export interface SupabaseSyncTransportConfig {
  url: string;
  anonKey: string;
}

/**
 * Managed-cloud transport — for hosted Blink tenants who don't self-host.
 *
 * TODO(phase-2): construct a `@supabase/supabase-js` client and map push/pull
 * onto the `tasks` table (Row-Level Security enforced).
 */
export class SupabaseSyncTransport implements SyncTransport {
  private readonly config: SupabaseSyncTransportConfig;

  constructor(config: SupabaseSyncTransportConfig) {
    this.config = config;
  }

  async push(_packets: SyncPacket[]): Promise<void> {
    void this.config;
    throw new Error('SupabaseSyncTransport.push not implemented until Phase 2');
  }

  async pull(_since: HybridLogicalClock | null): Promise<SyncPacket[]> {
    throw new Error('SupabaseSyncTransport.pull not implemented until Phase 2');
  }
}
