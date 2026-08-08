-- Row-Level Security + least-privilege grants for the zero-knowledge sync store
-- (records) and the account keyset (sync_keysets). Hand-written — Drizzle can't
-- express roles / GRANTs / policies. Mirrors 0001 (which covered the old tasks
-- table, dropped in 0005). `blink_api` already exists from 0001.

-- FORCE so even the table owner is subject to RLS.
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_keysets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_keysets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- A user only ever sees their own rows. `app.current_user_id` is set per request
-- by the sync API (set_config('app.current_user_id', …) in each model-service
-- transaction). `true` = missing_ok, so an unset variable resolves to NULL and
-- hides every row (fail-closed).
CREATE POLICY "records_owner_rw" ON "records"
  FOR ALL
  USING ("owner_id" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);--> statement-breakpoint

CREATE POLICY "sync_keysets_owner_rw" ON "sync_keysets"
  FOR ALL
  USING ("owner_id" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "records" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sync_keysets" TO blink_api;--> statement-breakpoint

-- The `records.seq` bigserial sequence: nextval is needed both on insert (default)
-- and on every conflict update (we bump seq so pull picks the change up), so the
-- app role needs USAGE on it. Without this, all inserts/updates fail.
GRANT USAGE, SELECT ON SEQUENCE "records_seq_seq" TO blink_api;
