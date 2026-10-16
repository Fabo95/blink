-- November Escape (trip-picker side project): four self-contained tables, no RLS (the
-- endpoints are public by design) and plain grants for the api role. Hand-written like
-- 0003/0008 — Drizzle can't express grants. Removing the feature = dropping these four
-- tables (reverse order) and deleting packages/db/src/november.ts + apps/server/src/november.
CREATE TABLE "nov_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"sort_order" integer NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "nov_itinerary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" text NOT NULL REFERENCES "nov_destinations"("id") ON DELETE CASCADE,
	"sort_order" integer NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"map_query" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "nov_itinerary_days_destination_idx" ON "nov_itinerary_days" USING btree ("destination_id","sort_order");--> statement-breakpoint
CREATE TABLE "nov_packing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" text NOT NULL REFERENCES "nov_destinations"("id") ON DELETE CASCADE,
	"sort_order" integer NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"done" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "nov_packing_items_destination_idx" ON "nov_packing_items" USING btree ("destination_id","sort_order");--> statement-breakpoint
CREATE TABLE "nov_votes" (
	"person" text PRIMARY KEY NOT NULL,
	"destination_id" text REFERENCES "nov_destinations"("id") ON DELETE SET NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "nov_destinations" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "nov_itinerary_days" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "nov_packing_items" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "nov_votes" TO blink_api;
