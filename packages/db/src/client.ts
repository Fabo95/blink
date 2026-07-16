import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type BlinkDb = ReturnType<typeof createDb>;

/** The transaction handle passed to {@link withUser}. */
export type BlinkTx = Parameters<Parameters<BlinkDb['transaction']>[0]>[0];

export function createDb(connectionString: string): ReturnType<typeof drizzle<typeof schema>> {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

/**
 * Run `fn` inside a transaction scoped to `userId`. Setting the session variable
 * that Row-Level Security reads (`app.current_user_id`) inside the same
 * transaction is what makes RLS enforce per-user isolation — the sync API
 * connects as a least-privilege role, so this is the only thing granting access
 * to the caller's rows. `set_config(..., true)` is transaction-local (like
 * `SET LOCAL`) but, unlike `SET`, accepts a bound parameter.
 */
export async function withUser<T>(
  db: BlinkDb,
  userId: string,
  fn: (tx: BlinkTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx);
  });
}
