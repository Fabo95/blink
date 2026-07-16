import { type BlinkDb, type NewTaskRow, type TaskRow, tasks, withUser } from '@blink/db';
import { gte, sql } from 'drizzle-orm';

interface TasksModelServiceDeps {
  db: BlinkDb;
}

/**
 * Thin Drizzle wrapper over the `tasks` table. Every method runs inside
 * {@link withUser} so Row-Level Security scopes it to the caller. No business
 * logic here — that lives in the common services.
 */
export class TasksModelService {
  private deps: TasksModelServiceDeps;

  constructor(deps: TasksModelServiceDeps) {
    this.deps = deps;
  }

  async upsertMany(userId: string, rows: NewTaskRow[]): Promise<void> {
    if (rows.length === 0) return;
    await withUser(this.deps.db, userId, async (tx) => {
      for (const row of rows) {
        await tx
          .insert(tasks)
          .values(row)
          .onConflictDoUpdate({
            target: tasks.id,
            set: {
              status: row.status,
              titleCipher: row.titleCipher,
              bodyCipher: row.bodyCipher,
              hlcPhysical: row.hlcPhysical,
              hlcCounter: row.hlcCounter,
              hlcNodeId: row.hlcNodeId,
              updatedAt: new Date(),
            },
            // LWW on the Hybrid Logical Clock — stale writes are ignored.
            setWhere: sql`(${tasks.hlcPhysical}, ${tasks.hlcCounter}, ${tasks.hlcNodeId}) < (${row.hlcPhysical}, ${row.hlcCounter}, ${row.hlcNodeId})`,
          });
      }
    });
  }

  async listSince(userId: string, sincePhysical: number): Promise<TaskRow[]> {
    return withUser(this.deps.db, userId, async (tx) =>
      tx.select().from(tasks).where(gte(tasks.hlcPhysical, sincePhysical)),
    );
  }
}
