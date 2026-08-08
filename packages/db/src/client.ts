import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type BlinkDb = ReturnType<typeof createDb>;

/** The transaction handle Drizzle passes to a `db.transaction(...)` callback. */
export type BlinkTx = Parameters<Parameters<BlinkDb['transaction']>[0]>[0];

export function createDb(connectionString: string): ReturnType<typeof drizzle<typeof schema>> {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

/**
 * Stamp the caller's id onto the transaction so Row-Level Security scopes rows to
 * them. Every model-service transaction must call this first. `set_config(..., true)`
 * is transaction-local, so it can't leak across pooled connections; an unset value
 * makes the policies match zero rows (fail-closed).
 */
export async function setRlsUser(tx: BlinkTx, userId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
}
