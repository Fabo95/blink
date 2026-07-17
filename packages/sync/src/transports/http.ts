import type { HybridLogicalClock } from '../clock.js';
import type { SyncPacket } from '../packet.js';
import type { SyncTransport } from '../transport.js';

export interface HttpSyncTransportConfig {
  baseUrl: string;
  token: string;
}

/**
 * Self-hosted transport — the default for VPC / on-premise tenants.
 *
 * Talks to the Blink sync API (`apps/sync-server`), the only thing that touches
 * Cloud-Postgres. The client never sees the DB; it sends already-E2EE
 * {@link SyncPacket}s over HTTPS with a bearer token the API maps onto a
 * Row-Level-Security session. See `packages/db`.
 */
export class HttpSyncTransport implements SyncTransport {
  private readonly config: HttpSyncTransportConfig;

  constructor(config: HttpSyncTransportConfig) {
    this.config = config;
  }

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
    // The sync API wraps success responses in a `{ data, reqId }` envelope.
    const body = (await res.json()) as { data: { packets: SyncPacket[] } };
    return body.data.packets;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.config.token}`,
    };
  }
}
