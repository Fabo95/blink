import { type BlinkDb, setRlsUser } from '@blink/db/client';
import { type KeysetRow, type NewKeysetRow, syncKeysets } from '@blink/db/schema';

interface KeysetsModelServiceDeps {
  db: BlinkDb;
}

/**
 * Thin Drizzle wrapper over `sync_keysets` (one 2SKD account keyset per user).
 * Each method sets `app.current_user_id` in its transaction so Row-Level Security
 * scopes it to the caller — a select returns only the caller's row.
 */
export class KeysetsModelService {
  private deps: KeysetsModelServiceDeps;

  constructor(deps: KeysetsModelServiceDeps) {
    this.deps = deps;
  }

  async get(userId: string): Promise<KeysetRow | undefined> {
    return this.deps.db.transaction(async (tx) => {
      await setRlsUser(tx, userId);
      const rows = await tx.select().from(syncKeysets);
      return rows[0];
    });
  }

  async upsert(userId: string, row: NewKeysetRow): Promise<void> {
    await this.deps.db.transaction(async (tx) => {
      await setRlsUser(tx, userId);
      await tx
        .insert(syncKeysets)
        .values(row)
        .onConflictDoUpdate({
          target: syncKeysets.ownerId,
          set: {
            wrappedVmk: row.wrappedVmk,
            kdfSalt: row.kdfSalt,
            kdfIterations: row.kdfIterations,
            updatedAt: new Date(),
          },
        });
    });
  }
}
