-- Drop end-to-end encryption: the sync store becomes a readable replica of the
-- desktop's SQLite rows. Hand-written — Drizzle can't express policies, GRANTs, or
-- generated columns.
--
-- Rationale: a zero-knowledge server can't participate in anything (remote capture,
-- a web inbox, agent tool calls, webhooks) without a trusted relay holding a key.
-- The local SQLite DB stays the source of truth, so the server is a replica — and a
-- replica the server can read is worth far more here than one it can't.
--
-- `records` is dropped and recreated rather than altered in place. Every existing row
-- is AES-GCM ciphertext under a VMK this server never had, so there is nothing worth
-- migrating, and a fresh table guarantees the result matches `schema.ts` exactly
-- (including the generated columns) instead of depending on a sequence of ALTERs.
-- No data is lost: each device holds the authoritative copy locally and re-pushes it
-- — desktop migration 9 re-marks every row dirty and rewinds the pull cursor, which
-- also lines up with the `records_seq_seq` sequence restarting from 1 here.

-- The account keyset (wrapped VMK + KDF params) has nothing left to protect.
DROP TABLE IF EXISTS "sync_keysets" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "records" CASCADE;--> statement-breakpoint

CREATE TABLE "records" (
	-- Client-generated UUID, identical on every device: the stable LWW conflict key.
	"id" uuid PRIMARY KEY NOT NULL,
	-- Better Auth user ids are text nanoids, so this is text and the policy below
	-- compares it as text (no ::uuid cast).
	"owner_id" text NOT NULL,
	-- The whole client row. Loose by design: the server reads `kind` and `status` and
	-- stores the rest verbatim, so the desktop can add fields without a lockstep
	-- server migration.
	"body" jsonb NOT NULL,
	-- Derived by Postgres itself, so they can never drift from the JSON and cost no
	-- application code. A body missing the key yields NULL rather than erroring, which
	-- is what keeps an older client from breaking on a newer column.
	"kind" text GENERATED ALWAYS AS ((body->>'kind')) STORED,
	"status" text GENERATED ALWAYS AS ((body->>'status')) STORED,
	-- Hybrid Logical Clock: edit-time ordering, decides LWW conflicts.
	"hlc_physical" bigint NOT NULL,
	"hlc_counter" integer NOT NULL,
	"hlc_node_id" text NOT NULL,
	-- Server-assigned monotonic pull cursor, immune to device clock skew.
	"seq" bigserial NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "records_owner_seq_idx" ON "records" USING btree ("owner_id","seq");--> statement-breakpoint
CREATE INDEX "records_owner_kind_idx" ON "records" USING btree ("owner_id","kind","status");--> statement-breakpoint

-- FORCE so even the table owner is subject to RLS. The table is new here, so its
-- policy and grants are created from scratch (the old ones went with the DROP above).
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- A user only ever sees their own rows. `app.current_user_id` is set per request by
-- the sync API in each model-service transaction. `true` = missing_ok, so an unset
-- variable resolves to NULL and hides every row (fail-closed).
CREATE POLICY "records_owner_rw" ON "records"
  FOR ALL
  USING ("owner_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_id" = current_setting('app.current_user_id', true));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "records" TO blink_api;--> statement-breakpoint

-- `nextval` is needed on insert (the default) and on every conflict update (seq is
-- bumped so pull picks the change up), so the app role needs USAGE. The sequence is
-- new — it was dropped with the old table — so this grant must be re-issued.
GRANT USAGE, SELECT ON SEQUENCE "records_seq_seq" TO blink_api;
