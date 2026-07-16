-- Blink Enterprise Cloud DB — Phase 2/3 schema placeholder.
--
-- The cloud is a "dumb", zero-knowledge store: it holds ciphertext for sensitive
-- fields and enforces WHO may read a row (Row-Level Security), never WHAT it says.
-- Titles and bodies arrive already E2EE-encrypted (see packages/crypto).

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
  owner_id        uuid not null,           -- auth.uid() of the creating user

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

-- Row-Level Security: a user only ever sees their own org's rows.
alter table tasks enable row level security;

-- TODO(phase-3): tighten to workspace membership + role once Okta/Azure SSO maps
-- IdP groups onto org roles. For now: owner-scoped access.
create policy "tasks_owner_rw" on tasks
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
