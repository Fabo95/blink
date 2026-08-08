import { type BlinkDb, setRlsUser } from '@blink/db/client';
import { type NewRecordRow, type RecordRow, records } from '@blink/db/schema';
import { asc, gt, sql } from 'drizzle-orm';

interface RecordsModelServiceDeps {
  db: BlinkDb;
}

/**
 * Thin Drizzle wrapper over the `records` table (the zero-knowledge sync store).
 * No business logic here — that lives in the common services. Each method opens a
 * transaction and sets `app.current_user_id`, which is what Row-Level Security
 * reads to scope rows to the caller (the API connects as a least-privilege role,
 * so an unset value hides everything — fail-closed).
 */
export class RecordsModelService {
  private deps: RecordsModelServiceDeps;

  constructor(deps: RecordsModelServiceDeps) {
    this.deps = deps;
  }

  async upsertMany(userId: string, rows: NewRecordRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.deps.db.transaction(async (tx) => {
      await setRlsUser(tx, userId);
      for (const row of rows) {
        await tx
          .insert(records)
          .values(row)
          .onConflictDoUpdate({
            target: records.id,
            set: {
              cipher: row.cipher,
              hlcPhysical: row.hlcPhysical,
              hlcCounter: row.hlcCounter,
              hlcNodeId: row.hlcNodeId,
              // Bump the pull cursor so other devices see this change. On insert the
              // bigserial default assigns seq; on update we must advance it explicitly.
              seq: sql`nextval(pg_get_serial_sequence('records', 'seq'))`,
              updatedAt: new Date(),
            },
            // LWW on the Hybrid Logical Clock — stale writes are ignored (and, since
            // the SET runs only for rows passing this, they don't consume a seq).
            setWhere: sql`(${records.hlcPhysical}, ${records.hlcCounter}, ${records.hlcNodeId}) < (${row.hlcPhysical}, ${row.hlcCounter}, ${row.hlcNodeId})`,
          });
      }
    });
  }

  /** Everything the caller changed after `sinceSeq`, oldest-first, for the pull
   * cursor. `seq` is server-assigned and monotonic, so this never skips a row. */
  async listSince(userId: string, sinceSeq: number): Promise<RecordRow[]> {
    return this.deps.db.transaction(async (tx) => {
      await setRlsUser(tx, userId);
      return tx.select().from(records).where(gt(records.seq, sinceSeq)).orderBy(asc(records.seq));
    });
  }
}
