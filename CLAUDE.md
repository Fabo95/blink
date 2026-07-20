# Blink

Enterprise-ready, local-first task ingestion. Capture rough text (clipboard via the copy-capture
hotkey), sanitize it on-device, optionally clean it up with AI, and store it as tasks in a
local encrypted database — with a planned self-hosted, zero-knowledge sync tier. macOS-first
desktop app, dark-violet theme.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo. Node ≥20, `pnpm@11`.
- **Desktop app** (`apps/desktop`): Tauri v2 (Rust core) + React 19 + Vite 8 (rolldown) +
  Tailwind v4 + shadcn/ui + TypeScript 7. Local store: SQLite via **SQLCipher** (AES-256 at
  rest), key in the OS keychain.
- **Sync server** (`apps/sync-server`): Fastify 5 + zod 4 + Drizzle ORM + Postgres 17 (planned
  Phase 2; not yet wired to the client).
- **Tooling**: Biome (format + lint), not Prettier/ESLint.

## Layout

```
apps/
  desktop/          Tauri app. src/ = React webview, src-tauri/ = Rust core.
  sync-server/      Self-hosted sync API (structured after ramble's backend).
packages/
  contract/         zod wire schemas — single source of truth, client↔server. Built to dist.
  core/             Shared brand/theme constants.
  crypto/           E2EE envelope helpers (built, not yet wired).
  db/               Drizzle schema + postgres client + migrations. Built to dist.
  sync/             Sync client stubs (HLC, LWW) — not yet wired.
  ai/               `suggestTitle` heuristic (currently unused by the app).
```

### `apps/desktop/src-tauri/src` (the Rust core — layered)

```
main.rs             binary entry → blink_lib::run()
lib.rs              composition root: dotenv, manage state, invoke_handler, run loop
commands/           IPC layer — one #[tauri::command] module per feature (ai, copy_capture,
                    tasks, shortcut). Thin: they delegate to services/repository/platform.
core/               shared types: error (AppError), models (ts-rs structs), state
                    (FrontmostSource, PendingSource)
services/           logic: ai (OpenAI client), security (DLP redaction filter)
repository/         persistence facade: Repository owns the shared Db (SQLCipher) and exposes
                    entity repos — TaskRepository, SettingsRepository. Plus db.rs (open +
                    keychain key + error helpers), migrations.rs (rusqlite_migration schema)
platform/           OS glue. macos/ (frontmost detection, ⌘C input) with a fallback for other
                    OSes; shortcut.rs (the whole capture-hotkey feature); window.rs (capture
                    panel placement); shortcut on mobile is a do-nothing stub
```

## Commands

Run from the repo root unless noted.

- `pnpm dev` — Turbo runs every package's dev task.
- `pnpm desktop` — Vite dev server for the webview only (browser mock, no Rust).
- `pnpm tauri dev` — full desktop app (spawns Vite via `beforeDevCommand`). First build is slow
  (compiles SQLCipher + OpenSSL + objc2 from source).
- `pnpm build` / `pnpm typecheck` — Turbo across the graph.
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` — Biome.
- `pnpm --filter @blink/desktop gen:types` — regenerate TS types from Rust (`cargo test`, ts-rs).
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` — fast Rust type-check.
- `pnpm --filter @blink/db db:generate` / `db:migrate` — Drizzle migrations (sync server).
- `docker compose up` — Postgres + sync-server.

## Architecture notes

- **Two type boundaries, both single-source:**
  - **Rust → TS**: `ts-rs` derives on the structs in `core/models.rs` generate
    `apps/desktop/src/generated/*.ts` via `cargo test`. Don't hand-edit `src/generated/` (Biome
    ignores it) — change the Rust struct, then run `gen:types`. `export_to` is relative to the
    source file, so moving `models.rs` breaks it.
  - **Client ↔ Server**: `@blink/contract` zod schemas are the wire format for the desktop
    client and the sync server (Phase 2).
- **Tauri IPC**: every `#[tauri::command]` in `src-tauri/src/commands/` is exposed through the
  typed façade in `apps/desktop/src/lib/api.ts`, which falls back to an in-memory mock when
  running under plain Vite (no Tauri host). Add a command → register in `lib.rs`
  `invoke_handler` → add a method + mock case in `api.ts`. The invoke arg key must match the
  Rust param name.
- **Persistence** = the `repository` module. `Repository::open(path)` opens the shared
  `Db` (SQLCipher, unlocked with a keychain passphrase, migrated on open) and hands an
  `Arc<Db>` to each entity repository. Add a table = a migration in `migrations.rs` + a
  `*Repository` file + a field on `Repository`. Row↔struct mapping uses `serde_rusqlite`
  (`SELECT *` maps by column name); a flat `TaskRow` mirrors the nested `Task` for storage.
- **Copy-capture flow**: the ⌘⇧B global shortcut (owned by `platform/shortcut.rs`) records the
  frontmost app/window as the source, simulates ⌘C to copy the selection, then opens a second
  frameless "copy-capture" window. `main.tsx` branches on `getCurrentWindow().label` to render
  `CopyCapture` vs `App`. The capture is a **single text field** (no title/body split); it's
  saved as one `Task.text`. The main window's `CaptureCard` is now just info + the editable
  shortcut — capture happens through the popup. Copy is the first capture method; voice/manual
  are planned as sibling windows (`voice-capture`, …) with their own components. Generic pieces
  (`CaptureSource`/`CaptureDraft`, the capture hotkey, the source detection) stay unprefixed and
  are meant to be reused across methods.
- **Source detection** (`platform/macos/frontmost.rs`): `NSWorkspace` for the frontmost app +
  the Accessibility API for its window title, captured *before* our panel steals focus and
  stashed in `PendingSource`. Reuses the Accessibility permission ⌘C already needs.
- **Custom shortcut**: the capture hotkey is user-configurable (default
  `CommandOrControl+Shift+B`), persisted in the `settings` table, bound on startup and
  re-bound on change. UI is the `ShortcutRecorder` in the capture card.
- **AI "improve"**: `services/ai.rs` calls OpenAI. `improve_text` (returns cleaned text, used
  by the popup preview) vs `improve_task` (persists + sets the `improved` flag so the inbox
  won't offer it again). The verb is **improve** everywhere.
- **macOS specifics**: input simulation and window ops must run on the main thread
  (`run_on_main_thread`). Transparency needs `macOSPrivateApi`. The capture window uses native
  `hudWindow` vibrancy; the main window has an overlay title bar (`titleBarStyle: Overlay`).
  The inbox window hides during capture; the dock-icon `Reopen` event brings it back.

## Conventions

These extend the global rules in `~/.claude/CLAUDE.md`. Highlights that bite here:

- **`mod.rs` is a thin index** — module declarations + re-exports, not definitions. Exception:
  a module's namesake facade may live at its root (e.g. `repository::Repository`).
- **No barrel files in packages.** Import directly from the origin module — `@blink/core/theme`,
  not `@blink/core`.
- **Named exports only** (except where a framework demands default).
- **No `any`, no non-null `!`.** Narrow explicitly.
- **No emoji in the app UI.** Icons via `lucide-react`. One cursor everywhere (`cursor: default`),
  UI text not selectable.
- **Biome style**: 2-space, single quotes, semicolons, trailing commas, width 100.
- **Comment only the *why*.** Don't annotate code you didn't write; no changelog comments.
- **Deps**: never add one without asking first.
- **TS7**: no `baseUrl`; path aliases must be relative. Desktop uses `@/*` → `src/*`.

## Environments

- `.env.example` (root) documents sync/Postgres/AI/Linear vars — Phase 1 needs none.
- `apps/desktop/src-tauri/.env` (gitignored) holds `OPENAI_API_KEY` for the "Improve with AI"
  action; loaded by `dotenvy` at startup in dev. Real env vars win.
- Dev DB lives at `~/Library/Application Support/app.blink.desktop/blink.db` (SQLCipher). The
  keychain key is under service `app.blink.desktop`, account `sqlcipher-db-key`.
