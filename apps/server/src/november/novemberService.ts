import { randomUUID } from 'node:crypto';
import {
  type NovDestination,
  type NovDestinationId,
  type NovItineraryDay,
  type NovItineraryDayInput,
  type NovPackingItem,
  type NovPackingItemInput,
  type NovPerson,
  type NovState,
  type NovVotes,
  zNovDestinationContent,
  zNovDestinationId,
  zNovPackingKind,
} from '@blink/contract/november';
import type { BlinkDb, BlinkTx } from '@blink/db/client';
import { novDestinations, novItineraryDays, novPackingItems, novVotes } from '@blink/db/november';
import { asc, eq } from 'drizzle-orm';
import { ApiError } from '@/utils/errors/apiError.js';
import { novSeed } from './defaults.js';

interface NovemberServiceDeps {
  db: BlinkDb;
}

const PEOPLE: readonly NovPerson[] = ['fabo', 'lara'];

/** Shared across requests so concurrent first calls run the sync once. */
let seedSync: Promise<void> | null = null;

/**
 * The trip-picker's whole backend: three destinations with editable itinerary and packing
 * lists, and one heart per person. Public, unauthenticated, two users — so no RLS and
 * last-write-wins everywhere. The seed is written on first contact rather than by a migration
 * so a reset can rebuild a list from the same source.
 */
export class NovemberService {
  private deps: NovemberServiceDeps;

  constructor(deps: NovemberServiceDeps) {
    this.deps = deps;
  }

  async getState(): Promise<NovState> {
    await this.ensureSeeded();
    const { db } = this.deps;
    const [rows, days, items, votes] = await Promise.all([
      db.select().from(novDestinations).orderBy(asc(novDestinations.sortOrder)),
      db.select().from(novItineraryDays).orderBy(asc(novItineraryDays.sortOrder)),
      db.select().from(novPackingItems).orderBy(asc(novPackingItems.sortOrder)),
      this.getVotes(),
    ]);
    const destinations: NovDestination[] = rows.map((row) => {
      const id = zNovDestinationId.parse(row.id);
      return {
        id,
        ...zNovDestinationContent.parse(row.content),
        itinerary: days.filter((d) => d.destinationId === id).map(toDay),
        packing: items.filter((i) => i.destinationId === id).map(toItem),
      };
    });
    return { destinations, votes };
  }

  async getVotes(): Promise<NovVotes> {
    const rows = await this.deps.db.select().from(novVotes);
    const votes: NovVotes = { fabo: null, lara: null };
    for (const row of rows) {
      const person = PEOPLE.find((p) => p === row.person);
      if (person == null) continue;
      votes[person] = {
        destinationId:
          row.destinationId == null ? null : zNovDestinationId.parse(row.destinationId),
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    return votes;
  }

  async setVote(person: NovPerson, destinationId: NovDestinationId | null): Promise<NovVotes> {
    await this.ensureSeeded();
    const now = new Date();
    await this.deps.db
      .insert(novVotes)
      .values({ person, destinationId, updatedAt: now })
      .onConflictDoUpdate({ target: novVotes.person, set: { destinationId, updatedAt: now } });
    return this.getVotes();
  }

  async replaceItinerary(
    destinationId: NovDestinationId,
    days: readonly NovItineraryDayInput[],
  ): Promise<NovItineraryDay[]> {
    await this.ensureSeeded();
    return this.deps.db.transaction(async (tx) => {
      await this.assertDestination(tx, destinationId);
      await tx.delete(novItineraryDays).where(eq(novItineraryDays.destinationId, destinationId));
      await insertDays(tx, destinationId, days);
      return this.listDays(tx, destinationId);
    });
  }

  async resetItinerary(destinationId: NovDestinationId): Promise<NovItineraryDay[]> {
    return this.replaceItinerary(destinationId, seedFor(destinationId).itinerary);
  }

  async replacePacking(
    destinationId: NovDestinationId,
    items: readonly NovPackingItemInput[],
  ): Promise<NovPackingItem[]> {
    await this.ensureSeeded();
    return this.deps.db.transaction(async (tx) => {
      await this.assertDestination(tx, destinationId);
      await tx.delete(novPackingItems).where(eq(novPackingItems.destinationId, destinationId));
      await insertItems(tx, destinationId, items);
      return this.listItems(tx, destinationId);
    });
  }

  async resetPacking(destinationId: NovDestinationId): Promise<NovPackingItem[]> {
    return this.replacePacking(destinationId, seedFor(destinationId).packing);
  }

  /**
   * Brings the tables in line with the seed, once per process (a redeploy is what changes
   * the seed). Destination facts are code-owned and always updated; itinerary and packing are
   * user-owned, so they are written only for a destination that is new. A destination that
   * left the seed is dropped with its lists (cascade); a vote on it becomes null (set null).
   */
  private ensureSeeded(): Promise<void> {
    if (seedSync == null) {
      seedSync = this.syncSeed().catch((err) => {
        seedSync = null;
        throw err;
      });
    }
    return seedSync;
  }

  private async syncSeed(): Promise<void> {
    await this.deps.db.transaction(async (tx) => {
      const existing = await tx.select({ id: novDestinations.id }).from(novDestinations);
      const have = new Set(existing.map((row) => row.id));
      for (const row of existing) {
        if (!novSeed.some((seed) => seed.id === row.id)) {
          await tx.delete(novDestinations).where(eq(novDestinations.id, row.id));
        }
      }
      for (const [sortOrder, seed] of novSeed.entries()) {
        if (have.has(seed.id)) {
          await tx
            .update(novDestinations)
            .set({ sortOrder, content: seed.content, updatedAt: new Date() })
            .where(eq(novDestinations.id, seed.id));
          continue;
        }
        await tx.insert(novDestinations).values({ id: seed.id, sortOrder, content: seed.content });
        await insertDays(tx, seed.id, seed.itinerary);
        await insertItems(tx, seed.id, seed.packing);
      }
      await tx
        .insert(novVotes)
        .values(PEOPLE.map((person) => ({ person, destinationId: null })))
        .onConflictDoNothing();
    });
  }

  private async assertDestination(tx: BlinkTx, destinationId: string): Promise<void> {
    const found = await tx
      .select({ id: novDestinations.id })
      .from(novDestinations)
      .where(eq(novDestinations.id, destinationId))
      .limit(1);
    if (found.length === 0) throw new ApiError('notFound', `Unknown destination ${destinationId}`);
  }

  private async listDays(tx: BlinkTx, destinationId: string): Promise<NovItineraryDay[]> {
    const rows = await tx
      .select()
      .from(novItineraryDays)
      .where(eq(novItineraryDays.destinationId, destinationId))
      .orderBy(asc(novItineraryDays.sortOrder));
    return rows.map(toDay);
  }

  private async listItems(tx: BlinkTx, destinationId: string): Promise<NovPackingItem[]> {
    const rows = await tx
      .select()
      .from(novPackingItems)
      .where(eq(novPackingItems.destinationId, destinationId))
      .orderBy(asc(novPackingItems.sortOrder));
    return rows.map(toItem);
  }
}

function seedFor(destinationId: NovDestinationId) {
  const seed = novSeed.find((s) => s.id === destinationId);
  if (seed == null) throw new ApiError('notFound', `Unknown destination ${destinationId}`);
  return seed;
}

async function insertDays(
  tx: BlinkTx,
  destinationId: string,
  days: readonly NovItineraryDayInput[],
): Promise<void> {
  if (days.length === 0) return;
  await tx.insert(novItineraryDays).values(
    days.map((day, index) => ({
      id: day.id ?? randomUUID(),
      destinationId,
      sortOrder: index,
      date: day.date,
      title: day.title,
      note: day.note,
      mapQuery: day.mapQuery,
    })),
  );
}

async function insertItems(
  tx: BlinkTx,
  destinationId: string,
  items: readonly NovPackingItemInput[],
): Promise<void> {
  if (items.length === 0) return;
  await tx.insert(novPackingItems).values(
    items.map((item, index) => ({
      id: item.id ?? randomUUID(),
      destinationId,
      sortOrder: index,
      label: item.label,
      kind: item.kind,
      note: item.note,
      done: item.done,
    })),
  );
}

function toDay(row: typeof novItineraryDays.$inferSelect): NovItineraryDay {
  return { id: row.id, date: row.date, title: row.title, note: row.note, mapQuery: row.mapQuery };
}

function toItem(row: typeof novPackingItems.$inferSelect): NovPackingItem {
  return {
    id: row.id,
    label: row.label,
    kind: zNovPackingKind.parse(row.kind),
    note: row.note,
    done: row.done,
  };
}
