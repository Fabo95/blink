import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// November Escape — a small, self-contained side project (the trip picker site). Everything
// it needs lives in these four `nov_*` tables; removing the feature means dropping them and
// deleting this file, the re-export in schema.ts, migration 0009 and apps/server/src/november.
// No RLS: the endpoints are public by design and the data belongs to two named people.

/** The destination's fixed facts as JSON; the shape is `@blink/contract/november`'s
 * `zNovDestinationContent`. Loose here so this emitting package stays free of the contract. */
export type NovDestinationContent = Record<string, unknown>;

export const novDestinations = pgTable('nov_destinations', {
  id: text('id').primaryKey(),
  sortOrder: integer('sort_order').notNull(),
  content: jsonb('content').notNull().$type<NovDestinationContent>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const novItineraryDays = pgTable('nov_itinerary_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: text('destination_id')
    .notNull()
    .references(() => novDestinations.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  date: text('date').notNull(),
  title: text('title').notNull(),
  note: text('note'),
  mapQuery: text('map_query'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const novPackingItems = pgTable('nov_packing_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationId: text('destination_id')
    .notNull()
    .references(() => novDestinations.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  note: text('note'),
  done: boolean('done').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const novVotes = pgTable('nov_votes', {
  person: text('person').primaryKey(),
  destinationId: text('destination_id').references(() => novDestinations.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
