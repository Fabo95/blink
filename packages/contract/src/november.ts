import { z } from 'zod';

// November Escape — wire schemas for the trip-picker side project. Kept apart from wire.ts so
// the whole feature can be removed as a unit (this file, @blink/db's november tables and
// apps/server/src/november). The site repo mirrors these shapes with its own zod schemas.

export const zNovPerson = z.enum(['fabo', 'lara']);
export type NovPerson = z.infer<typeof zNovPerson>;

export const zNovDestinationId = z.enum(['marokko', 'kapverden', 'azoren']);
export type NovDestinationId = z.infer<typeof zNovDestinationId>;

export const zNovPlace = z.object({
  name: z.string().min(1),
  mapQuery: z.string().min(1),
});

export const zNovActivity = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string(),
  description: z.string(),
  places: z.array(zNovPlace),
});

export const zNovFlight = z.object({
  airportCode: z.string().min(3).max(3),
  airportName: z.string().min(1),
  airportMapQuery: z.string().min(1),
  duration: z.string().min(1),
  stops: z.number().int().min(0),
  via: z.string().optional(),
  extraTransfer: z.string().optional(),
  airlineExamples: z.string(),
});

export const zNovTheme = z.object({
  surface: z.string(),
  surfaceElevated: z.string(),
  accent: z.string(),
  accentStrong: z.string(),
  accentSoft: z.string(),
  ink: z.string(),
  inkMuted: z.string(),
  sceneSky: z.string(),
  sceneGround: z.string(),
  sceneWater: z.string(),
});

/** The fixed facts of a destination, stored as one JSON column. */
export const zNovDestinationContent = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  mapQuery: z.string().min(1),
  coords: z.object({ lat: z.number(), lng: z.number() }),
  tagline: z.string(),
  summary: z.string(),
  flight: zNovFlight,
  climate: z.object({ air: z.string(), water: z.string() }),
  activities: z.array(zNovActivity),
  logistics: z.object({ vehicle: z.string(), lodging: z.string() }),
  limitation: z.string(),
  theme: zNovTheme,
});
export type NovDestinationContent = z.infer<typeof zNovDestinationContent>;

export const zNovItineraryDayInput = z.object({
  /** Keep an existing id to stay stable across edits; omit it for a new day. */
  id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(240).nullable(),
  mapQuery: z.string().trim().max(120).nullable(),
});
export type NovItineraryDayInput = z.infer<typeof zNovItineraryDayInput>;

export const zNovItineraryDay = zNovItineraryDayInput.extend({ id: z.string().uuid() });
export type NovItineraryDay = z.infer<typeof zNovItineraryDay>;

export const zNovPackingKind = z.enum(['dokument', 'ausruestung', 'geld', 'sonstiges']);
export type NovPackingKind = z.infer<typeof zNovPackingKind>;

export const zNovPackingItemInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(120),
  kind: zNovPackingKind,
  note: z.string().trim().max(160).nullable(),
  done: z.boolean(),
});
export type NovPackingItemInput = z.infer<typeof zNovPackingItemInput>;

export const zNovPackingItem = zNovPackingItemInput.extend({ id: z.string().uuid() });
export type NovPackingItem = z.infer<typeof zNovPackingItem>;

export const zNovDestination = zNovDestinationContent.extend({
  id: zNovDestinationId,
  itinerary: z.array(zNovItineraryDay),
  packing: z.array(zNovPackingItem),
});
export type NovDestination = z.infer<typeof zNovDestination>;

export const zNovVote = z.object({
  destinationId: zNovDestinationId.nullable(),
  updatedAt: z.string(),
});
export type NovVote = z.infer<typeof zNovVote>;

export const zNovVotes = z.object({
  fabo: zNovVote.nullable(),
  lara: zNovVote.nullable(),
});
export type NovVotes = z.infer<typeof zNovVotes>;

export const zNovState = z.object({
  destinations: z.array(zNovDestination),
  votes: zNovVotes,
});
export type NovState = z.infer<typeof zNovState>;

export const zNovVoteInput = z.object({
  destinationId: zNovDestinationId.nullable(),
});

export const zNovItineraryInput = z.object({
  days: z.array(zNovItineraryDayInput).max(40),
});

export const zNovPackingInput = z.object({
  items: z.array(zNovPackingItemInput).max(80),
});
