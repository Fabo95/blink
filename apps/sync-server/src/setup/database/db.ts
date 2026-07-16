import { type BlinkDb, createDb } from '@blink/db';
import { env } from '@/env.js';

let db: BlinkDb | undefined;

/** Lazily-created singleton connection pool to the self-hosted Cloud-Postgres. */
export function getDb(): BlinkDb {
  if (!db) db = createDb(env.DATABASE_URL);
  return db;
}
