# Blink

Enterprise-ready, local-first task ingestion. Capture rough text (clipboard, quick-capture
hotkey), sanitize it on-device, and turn it into tasks — with an optional self-hosted,
zero-knowledge sync tier. Dark-violet theme throughout.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo. Node ≥20, `pnpm@11`.
- **Desktop app** (`apps/desktop`): Tauri v2 (Rust core) + React 19 + Vite 8 (rolldown) +
  Tailwind v4 + shadcn/ui + TypeScript 7.
- **Sync server** (`apps/sync-server`): Fastify 5 + zod 4 + Drizzle ORM + Postgres 17.
- **Tooling**: Biome (format + lint), not Prettier/ESLint.

## Layout

```
apps/
  desktop/          Tauri app. src/ = React webview, src-tauri/ = Rust core.
  sync-server/      Self-hosted sync API (structured after ramble's backend).
packages/
  contract/         zod wire schemas — single source of truth, client↔server. Built to dist.
  core/             Shared brand/theme constants.
  crypto/           E2EE envelope helpers (client-side zero-knowledge).
  db/               Drizzle schema + postgres client + migrations. Built to dist.
  sync/             Sync engine (HLC, LWW) shared logic.
  ai/               `suggestTitle` heuristic (one function, no framework).
```

## Commands

Run from the repo root unless noted.

- `pnpm dev` — Turbo runs every package's dev task.
- `pnpm desktop` — Vite dev server for the webview only (browser mock, no Rust).
- `pnpm tauri dev` — full desktop app (spawns Vite via `beforeDevCommand`).
- `pnpm build` / `pnpm typecheck` — Turbo across the graph.
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` — Biome.
- `pnpm --filter @blink/desktop gen:types` — regenerate TS types from Rust (`cargo test`, ts-rs).
- `pnpm --filter @blink/db db:generate` / `db:migrate` — Drizzle migrations.
- `docker compose up` — Postgres + sync-server.

## Architecture notes

- **Two type boundaries, both single-source:**
  - **Rust → TS**: `ts-rs` derives on Rust structs (`models.rs`, `error.rs`) generate
    `apps/desktop/src/generated/*.ts` via `cargo test`. Never hand-edit `src/generated/`
    (Biome ignores it). Change the Rust struct, then run `gen:types`.
  - **Client ↔ Server**: `@blink/contract` zod schemas (`packages/contract/src/wire.ts`) are
    the wire format for both the desktop client and the sync server.
- **Tauri IPC**: every `#[tauri::command]` in `src-tauri/src/commands/` is exposed through the
  typed façade in `apps/desktop/src/lib/api.ts`, which falls back to an in-memory mock when
  running under plain Vite (no Tauri host). Add a command → register in `lib.rs`
  `invoke_handler` → add a method + mock case in `api.ts`.
- **Quick capture** is a second frameless window (label `capture`). `main.tsx` branches on
  `getCurrentWindow().label` to render `QuickCapture` vs `App`. The ⌘⇧B global shortcut
  (`lib.rs`) copies the selection via `enigo`, positions/shows the panel, and emits
  `capture-open`. Captured text is a single field; on save the first line becomes the task
  title, the rest the body.
- **macOS specifics**: input simulation and window ops must run on the main thread
  (`run_on_main_thread`). Transparency needs `macOSPrivateApi`. The main (inbox) window stays
  hidden during capture; the dock-icon `Reopen` event brings it back.
- **Sync server** mirrors ramble's structure: `routes/` (thin) → `services/` (logic) →
  Drizzle. Tenant isolation is Postgres RLS via `SET LOCAL app.current_user_id`; the API
  connects as the least-privilege `blink_api` role. LWW conflict resolution by HLC.

## Conventions

These extend the global rules in `~/.claude/CLAUDE.md`. Highlights that bite here:

- **No barrel files.** Import directly from the origin module. Packages expose
  `"./*": "./src/*.ts"` — import `@blink/core/theme`, not `@blink/core`.
- **Named exports only** (except where a framework demands default).
- **No `any`, no non-null `!`.** Narrow explicitly.
- **No emoji in the app UI.** Icons via `lucide-react`.
- **Biome style**: 2-space, single quotes, semicolons, trailing commas, width 100.
- **Comment only the *why*.** Don't annotate code you didn't write; no changelog comments.
- **Deps**: never add one without asking first.
- **TS7**: no `baseUrl`; path aliases must be relative. Desktop uses `@/*` → `src/*`.

## Environments

- `.env.example` (root) documents sync/Postgres/AI/Linear vars — Phase 1 needs none.
- `apps/desktop/src-tauri/.env` (gitignored) holds `OPENAI_API_KEY` for the quick-capture
  "Optimize with AI" button; loaded by `dotenvy` at startup in dev. Real env vars win.
