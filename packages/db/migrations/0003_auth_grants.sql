-- Grant the least-privilege sync API role (blink_api) access to the Better Auth
-- tables. Unlike `tasks`, these aren't under RLS (auth infra, not per-user data),
-- so plain table grants are enough — mirrors the tasks/organizations grants in
-- 0001. Better Auth uses text ids (no sequences), so no sequence grants are needed.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "account" TO blink_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification" TO blink_api;
