# Blink

Enterprise-ready, local-first task ingestion. Capture rough text (clipboard via the copy-capture
hotkey), sanitize it on-device, optionally clean it up with AI, and store it as tasks in a
local encrypted database — with a planned self-hosted, zero-knowledge sync tier. macOS-first
desktop app, dark-violet theme.

**Per-app guides** (auto-loaded when working in that subtree; read them before touching an app):

- `apps/desktop/CLAUDE.md` — the Tauri desktop app (Rust core + React webview).
- `apps/server/CLAUDE.md` — the self-hosted sync/auth server.

This file holds only what spans the monorepo: stack, layout, shared commands, cross-app
boundaries, and conventions.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo. Node ≥20, `pnpm@11`.
- **Desktop app** (`apps/desktop`): Tauri v2 (Rust core) + React 19 + Vite 8 (rolldown) +
  Tailwind v4 + shadcn/ui (Radix) + `react-hotkeys-hook` + TypeScript 7. Local store: SQLite via
  **SQLCipher** (AES-256 at rest), key in the OS keychain.
- **Sync server** (`apps/server`): Fastify 5 + zod 4 + **awilix DI** + Drizzle ORM + Postgres 17
  (RLS) + **Better Auth** (email/password + email-OTP verification & password reset via
  **Resend**), OpenAPI-documented. The desktop core authenticates against it today;
  zero-knowledge encrypted task sync is Phase 2.
- **Tooling**: Biome (format + lint), not Prettier/ESLint.

## Layout

```
apps/
  desktop/          Tauri app. src/ = React webview, src-tauri/ = Rust core. → its CLAUDE.md
  server/           Self-hosted sync/auth API. → its CLAUDE.md
packages/
  contract/         zod wire schemas — single source of truth, client↔server. Built to dist.
  core/             Shared brand/theme constants (exports src, no build).
  crypto/           E2EE envelope helpers (AES-GCM + PBKDF2; not yet wired).
  db/               Drizzle schema + postgres client + SQL migrations. Built to dist.
  sync/             Sync client stubs (HLC, LWW) — not yet wired.
  ai/               `suggestTitle` heuristic (currently unused by the app).
```

- **`@blink/db`** is where the server's schema lives: `tasks` (owner_id, status, `*_cipher`
  JSONB payloads, HLC clock fields) + `organizations` + the Better Auth tables. `withUser()`
  sets `app.current_user_id` so RLS scopes queries. Migrations mix Drizzle-generated SQL with
  **hand-written role/grant/policy migrations** (`0001_rls_policies.sql` creates the non-owner
  `blink_api` role + RLS; `0003_auth_grants.sql` grants it the Better Auth tables) — Drizzle
  can't express roles/grants/policies, so a new server-read table needs a matching hand-written
  `GRANT` migration.

## Commands

Run from the repo root unless noted.

- `pnpm dev` — Turbo runs every package's dev task.
- `pnpm desktop` — Vite dev server for the webview only (browser mock, no Rust).
- `pnpm tauri dev` — full desktop app (spawns Vite via `beforeDevCommand`). First build is slow
  (compiles SQLCipher + OpenSSL + objc2 from source).
- `pnpm build` / `pnpm typecheck` — Turbo across the graph (`typecheck` depends on `^build` —
  build the workspace deps first or let Turbo do it).
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` — Biome.
- `pnpm --filter @blink/desktop gen:types` — regenerate TS types from Rust (`cargo test`, ts-rs).
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` — fast Rust type-check.
- `pnpm --filter @blink/db db:generate` / `db:migrate` — Drizzle migrations (sync server).
- `pnpm --filter @blink/server openapi:gen` — dump `apps/server/openapi.json` from the routes.
- `docker compose up` — Postgres + migrate (as owner `blink`) + server (as `blink_api`).

## Cross-app boundaries

Both type boundaries are single-source — never hand-maintain a duplicate:

- **Rust → TS**: `ts-rs` derives on the structs in `apps/desktop/src-tauri/src/core/models.rs`
  generate `apps/desktop/src/generated/*.ts` via `cargo test`. Don't hand-edit `src/generated/`
  (Biome ignores it) — change the Rust struct, then run `gen:types`.
- **Client ↔ Server**: `@blink/contract` zod schemas are the wire format; the server also emits
  an OpenAPI doc (`openapi.json`) from its routes.
- **Rust owns all server communication.** The flow is webview → Tauri IPC → Rust → server,
  never webview → server. This keeps the bearer token and (later) E2EE keys in the native layer
  + OS keychain, out of the JS heap; sidesteps CORS; and puts sync next to the local DB it
  reconciles.

## Conventions

These extend the global rules in `~/.claude/CLAUDE.md`. Monorepo-wide highlights:

- **No barrel files in packages.** Import directly from the origin module — `@blink/core/theme`,
  not `@blink/core`.
- **Named exports only** (except where a framework demands default).
- **No `any`, no non-null `!`.** Narrow explicitly.
- **Biome style**: 2-space, single quotes, semicolons, trailing commas, width 100.
- **Comment only the *why*.** Don't annotate code you didn't write; no changelog comments.
- **Deps**: never add one without asking first.
- **TS7**: no `baseUrl`; path aliases must be relative. Desktop uses `@/*` → `src/*`.
- App-specific rules (keyboard-first UI, Rust layering, DI patterns) live in the per-app
  CLAUDE.md files.

## Environments

- `.env.example` (root) documents sync/Postgres/AI vars (plus optional Supabase/Linear
  placeholders for planned integrations).
- Desktop env: `apps/desktop/src-tauri/.env` (gitignored) — see `apps/desktop/CLAUDE.md`.
- Server env: `apps/server/.env`, zod-validated with **no defaults** — see
  `apps/server/CLAUDE.md`.
- Dev DB lives at `~/Library/Application Support/app.blink.desktop/blink.db` (SQLCipher).
  Keychain service `app.blink.desktop` holds the DB key (account `sqlcipher-db-key`) and the
  sync session token (account `sync-session-token`).
