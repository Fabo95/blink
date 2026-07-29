-- Row-Level Security + least-privilege role for the zero-knowledge task store.
-- Hand-written (Drizzle can't express roles / GRANTs / policies).

-- FORCE so even the table owner is subject to RLS — defense in depth on top of
-- the least-privilege app role below.
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- A user only ever sees their own rows. `app.current_user_id` is set per request
-- by the sync API (see packages/db withUser). `true` = missing_ok, so an unset
-- variable resolves to NULL and hides every row (fail-closed).
--
-- TODO(phase-3): widen to workspace membership + role once Okta/Azure SSO maps
-- IdP groups onto org roles.
CREATE POLICY "tasks_owner_rw" ON "tasks"
  FOR ALL
  USING ("owner_id" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);--> statement-breakpoint

-- Least-privilege role the sync API connects as (RLS applies; not the owner).
-- Created without a password on purpose: SQL migrations can't read env vars, so the
-- password is set post-migration from POSTGRES_BLINK_API_PASSWORD (src/set-api-password.ts,
-- run via db:deploy). Until that runs, the role can't log in — fail-closed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blink_api') THEN
    CREATE ROLE blink_api LOGIN;
  END IF;
END
$$;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "tasks" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO blink_api;
