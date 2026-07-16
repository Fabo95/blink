import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { SyncPacket } from '@blink/sync';
import { authenticate } from './auth.ts';
import {
  InMemoryTaskRepository,
  PostgresTaskRepository,
  type TaskRepository,
} from './repository.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DATABASE_URL = process.env.DATABASE_URL;

// Self-hosted Postgres when configured; in-memory otherwise (dev/test).
const repo: TaskRepository = DATABASE_URL
  ? new PostgresTaskRepository(DATABASE_URL)
  : new InMemoryTaskRepository();

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
  }
});

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok', store: DATABASE_URL ? 'postgres' : 'memory' });
  }

  // Everything below the health check requires an authenticated caller.
  const auth = authenticate(req);
  if (!auth) return send(res, 401, { error: 'missing or invalid bearer token' });

  if (req.method === 'POST' && url.pathname === '/v1/sync/push') {
    const body = await readJson<{ packets: SyncPacket[] }>(req);
    const written = await repo.push(auth.userId, body.packets ?? []);
    return send(res, 200, { written });
  }

  if (req.method === 'GET' && url.pathname === '/v1/sync/pull') {
    const since = Number(url.searchParams.get('since') ?? 0);
    const packets = await repo.pull(auth.userId, Number.isFinite(since) ? since : 0);
    return send(res, 200, { packets });
  }

  send(res, 404, { error: 'not found' });
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

server.listen(PORT, () => {
  console.log(
    `Blink sync API listening on :${PORT} (store: ${DATABASE_URL ? 'postgres' : 'memory'})`,
  );
});
