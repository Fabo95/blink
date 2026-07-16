-- Blink Enterprise Cloud DB — self-hosted Postgres schema.
--
-- The cloud is a "dumb", zero-knowledge store: it holds ciphertext for sensitive
-- fields and enforces WHO may read a row (Row-Level Security), never WHAT it says.
-- Titles and bodies arrive already E2EE-encrypted (see packages/crypto).
--
-- No Supabase: tenancy is enforced via a per-request session variable that the
-- Blink sync API (apps/sync-server) sets AFTER it authenticates the caller:
--   SET LOCAL app.current_user_id = '<uuid>';
-- The API connects as a non-owner, least-privilege role so RLS is never bypassed.

create extension if not exists "pgcrypto";

-- Tenancy: an organization groups users, workspaces and policies (Phase 3 SSO/IAM).
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists tasks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  owner_id        uuid not null,           -- authenticated user id (from the IdP/JWT)

  status          text not null default 'inbox'
                    check (status in ('inbox', 'active', 'exported', 'archived')),

  -- Zero-knowledge fields: opaque ciphertext envelopes (base64 JSON).
  title_cipher    jsonb not null,
  body_cipher     jsonb not null,

  -- CRDT ordering metadata (Hybrid Logical Clock). Non-sensitive.
  hlc_physical    bigint not null,
  hlc_counter     integer not null,
  hlc_node_id     text not null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_org_idx on tasks (org_id);
create index if not exists tasks_owner_idx on tasks (owner_id);

-- Row-Level Security. FORCE so even the table owner is subject to it — the app
-- role should be least-privilege, but this is defense in depth.
alter table tasks enable row level security;
alter table tasks force row level security;

-- A user only ever sees their own rows. `app.current_user_id` is set per request
-- by the sync API after authenticating the caller. `true` = missing_ok, so an
-- unset variable resolves to NULL and hides every row (fail-closed).
--
-- TODO(phase-3): widen to workspace membership + role once Okta/Azure SSO maps
-- IdP groups onto org roles.
create policy "tasks_owner_rw" on tasks
  for all
  using (owner_id = current_setting('app.current_user_id', true)::uuid)
  with check (owner_id = current_setting('app.current_user_id', true)::uuid);

-- Least-privilege role the sync API connects as (RLS applies; not the owner).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'blink_api') then
    create role blink_api login password 'blink_api_dev_password';
  end if;
end
$$;

grant select, insert, update, delete on tasks to blink_api;
grant select, insert, update, delete on organizations to blink_api;
