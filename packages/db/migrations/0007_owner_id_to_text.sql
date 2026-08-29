-- The Better Auth user id is a text nanoid, not a UUID, so `owner_id` must be text and
-- the RLS policies must compare it as text — the old `::uuid` cast threw on real ids
-- (`invalid input syntax for type uuid`). Drop the policies first: Postgres can't alter
-- the type of a column an active policy depends on.
DROP POLICY IF EXISTS "records_owner_rw" ON "records";--> statement-breakpoint
DROP POLICY IF EXISTS "sync_keysets_owner_rw" ON "sync_keysets";--> statement-breakpoint

ALTER TABLE "records" ALTER COLUMN "owner_id" SET DATA TYPE text USING "owner_id"::text;--> statement-breakpoint
ALTER TABLE "sync_keysets" ALTER COLUMN "owner_id" SET DATA TYPE text USING "owner_id"::text;--> statement-breakpoint

CREATE POLICY "records_owner_rw" ON "records"
  FOR ALL
  USING ("owner_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_id" = current_setting('app.current_user_id', true));--> statement-breakpoint

CREATE POLICY "sync_keysets_owner_rw" ON "sync_keysets"
  FOR ALL
  USING ("owner_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_id" = current_setting('app.current_user_id', true));
