import type { Task } from '@blink/core/models';
import type { EncryptedEnvelope } from '@blink/crypto/e2ee';

// How the client talks to the self-hosted sync API (apps/sync-server). Defines
// the wire format and the push/pull calls.
//
// NOTE: not wired into the app yet — the conflict-free (CRDT) merge and the
// realtime subscription are Phase-2 work. This file is just the wire format plus
// the two HTTP calls.

/** A per-device clock used to order and merge concurrent edits. */
export interface HybridLogicalClock {
  physical: number;
  counter: number;
  nodeId: string;
}

/** The unit sent to / from the cloud. Sensitive fields are already ciphertext. */
export interface SyncPacket {
  taskId: string;
  clock: HybridLogicalClock;
  status: Task['status'];
  encrypted: {
    title: EncryptedEnvelope;
    body: EncryptedEnvelope;
  };
}

export interface SyncServer {
  baseUrl: string;
  /** Bearer token the API maps onto a Row-Level-Security session. */
  token: string;
}

export async function pushPackets(server: SyncServer, packets: SyncPacket[]): Promise<void> {
  const res = await fetch(`${server.baseUrl}/v1/sync/push`, {
    method: 'POST',
    headers: headers(server),
    body: JSON.stringify({ packets }),
  });
  if (!res.ok) throw new Error(`sync push failed: ${res.status}`);
}

export async function pullPackets(
  server: SyncServer,
  sincePhysical: number,
): Promise<SyncPacket[]> {
  const url = new URL(`${server.baseUrl}/v1/sync/pull`);
  url.searchParams.set('since', String(sincePhysical));
  const res = await fetch(url, { headers: headers(server) });
  if (!res.ok) throw new Error(`sync pull failed: ${res.status}`);
  // The sync API wraps responses in a `{ data, reqId }` envelope.
  const body = (await res.json()) as { data: { packets: SyncPacket[] } };
  return body.data.packets;
}

function headers(server: SyncServer): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${server.token}`,
  };
}
