# Blink

Enterprise-ready, local-first task ingestion. Capture rough text (clipboard via the copy-capture
hotkey), sanitize it on-device, optionally clean it up with AI, and store it as tasks in a
local encrypted database — with a planned self-hosted, zero-knowledge sync tier. macOS-first
desktop app, dark-violet theme.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo. Node ≥20, `pnpm@11`.
- **Desktop app** (`apps/desktop`): Tauri v2 (Rust core) + React 19 + Vite 8 (rolldown) +
  Tailwind v4 + shadcn/ui (Radix) + `react-hotkeys-hook` + TypeScript 7. Local store: SQLite via
  **SQLCipher** (AES-256 at rest), key in the OS keychain.
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
                    manual_capture, link, tasks, shortcut). Thin: delegate to services/repository/platform.
core/               shared types: error (AppError), models (ts-rs structs), state
                    (FrontmostSource, PendingSource)
services/           logic: ai (OpenAI client), security (DLP redaction filter)
repository/         persistence facade: Repository owns the shared Db (SQLCipher) and exposes
                    entity repos — TaskRepository, SettingsRepository. Plus db.rs (open +
                    keychain key + error helpers), migrations.rs (rusqlite_migration schema)
platform/           OS glue. os/ = native primitives behind one interface, impl picked by
                    target (os/macos/ = frontmost detection + ⌘C input + open_url; os/fallback.rs
                    for other OSes); shortcut.rs (the capture-hotkey feature); window.rs (capture
                    panel placement). shortcut/window are cross-platform, built on os::
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
- **Capture methods**: each is a variant of `platform::shortcut::CaptureMethod`, and owns a
  global hotkey + a frameless window + a component. `main.tsx` branches on
  `getCurrentWindow().label` to render the right one. Both windows render the shared
  `CapturePanel` (text field + optional link; keyboard-first — `⌘↵` save / `⌘I` improve / `Esc`
  cancel, **no buttons**), saved as one `Task`; `CopyCapture`/`ManualCapture` are thin config
  wrappers over it.
  - **Copy** (`⌘⇧B`, `copy-capture` window): records the frontmost app/window as the source,
    simulates ⌘C to copy the selection, sanitizes, then opens the panel pre-filled.
  - **Manual** (`⌘⇧M`, `manual-capture` window): no clipboard/source — a blank panel to type
    into; saved with a synthetic `manual` source.
  - Adding a method = a `CaptureMethod` variant (+ its `start`/window/`setting_key`/default) +
    a window in `tauri.conf.json` + a capability entry + a `CaptureKind` routed in `main.tsx`.
    Shared pieces (`CaptureSource`, `CapturePanel`, the `save_task`/`improve_text` commands, the
    `show_centered` window helper) are reused, not duplicated.
- **Source detection** (`platform/os/macos/frontmost.rs`): `NSWorkspace` for the frontmost app +
  the Accessibility API for its window title, captured *before* our panel steals focus and
  stashed in `PendingSource`. Reuses the Accessibility permission ⌘C already needs. Copy-only.
- **Capture shortcuts**: one hotkey **per method**, keyed by `CaptureMethod` and persisted in
  the `settings` table (`copy_capture_shortcut` / `manual_capture_shortcut`; defaults `⌘⇧B` /
  `⌘⇧M`). A single global-shortcut handler is registered; since it fires for every bound hotkey,
  it resolves the pressed shortcut back to its method (`method_of`) and dispatches. `set` refuses
  a combo already owned by another method. UI is one `ShortcutRecorder` per method in the capture
  card; the commands `get/set_capture_shortcut` take a `method` arg.
- **Inbox is keyboard-first** (`TaskList`): three stacked sections — **Inbox** (active),
  **Completed** (done in the last 24h), and a collapsible **Archive** (older completions,
  expanded in place with `a`). The archive is searchable and paginated (8/page), day-grouped
  (Today / Yesterday / weekday / date via `lib/completed.ts::groupByDay`); `←`/`→` page while
  it's open. A virtual cursor (`useListCursor`, built on `react-hotkeys-hook`) walks everything
  visible (Inbox → Completed → open archive page): `↑↓`/`jk` move it, `⏎` completes/restores the
  focused task, `e` edits, `o` opens its link, `⌫` deletes (confirm `AlertDialog`), `Esc`
  unselects. `Tab` is swallowed in the main window (the cursor drives selection, not DOM focus)
  except inside the open editor. Editing is an in-row **Popover** (text/source/link fields;
  `⇥`/`⇧⇥` move between the fields and wrap, `⌘↵` save, `⌘I` improve, `Esc` cancel). There are **no action buttons** — every action is a shortcut, always shown via a
  `ShortcutHint`; rows also click-to-select and double-click-to-complete. `useListCursor` ignores
  keys originating inside a `[role=dialog|menu|alertdialog]`, so an open overlay keeps its own keys.
  - **Structure**: `TaskList` is a thin orchestrator (owns the cursor + delete flow) that composes
    `components/tasks/` presentational pieces — `TaskSection` (Inbox/Completed), `ArchiveSection`,
    `TaskRow`, `TaskEditor`, `DeleteTaskDialog`, shared `hints.ts`. Two hooks hold the stateful
    logic: `useTaskEditor` (draft fields + `⌘I`/`⌘↵`) and `useArchive` (open/search/pagination +
    `a`/`←→`). Pure helpers (`splitTasks`, `groupByDay`) live in `lib/completed.ts`.
- **Task edits** go through the `update_task` command → a `TaskPatch` (any of `text` / `completed`
  / `link` / `source` / `improved`); the frontend sends only changed fields. An optional `link`
  (http(s)) is opened by the `open_link` command (`platform::os::open_url`) from the `o` shortcut
  or the row's link chip; its column was added in migration 3.
- **AI "improve"**: `services/ai.rs::improve` is exposed as the `improve_text` command — it
  returns cleaned text, no persistence. Both the capture panels and the inbox editor call it on
  `⌘I`, replace the field, and set an `improved` flag that gates re-improving (once per version,
  cleared when the text changes) and is persisted on save via `update_task`. The verb is
  **improve** everywhere. (`improve_task`/`mark_improved` predate this flow and are now unused.)
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
- **Keyboard shortcuts go through `react-hotkeys-hook`** — never a hand-rolled
  `window.addEventListener('keydown', …)`. List/cursor navigation is the `useListCursor`
  hook (built on it). The one exception is `ShortcutRecorder`, which *records* arbitrary
  combos (not a fixed binding). Use `enableOnFormTags` when a shortcut must fire while a
  field is focused (capture panels, editor `⌘↵`).
- **Render keys with the shared `Kbd` chip** (`components/ui/kbd.tsx`), and a row of
  key+label hints with `ShortcutHint` (`components/ShortcutHint.tsx`) — never plain
  `Esc · ⌘↵` text. Keeps every shortcut hint identical across the app.
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
