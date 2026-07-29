# Blink desktop (`apps/desktop`)

Tauri v2 app: `src/` is the React 19 webview, `src-tauri/` the Rust core. Monorepo-wide rules
(type boundaries, Biome style, deps policy) live in the root `CLAUDE.md` — this file is the
desktop-specific guide.

## Layout — `src-tauri/src` (the Rust core, layered)

```
main.rs             binary entry → blink_lib::run()
lib.rs              composition root: dotenv, manage state, invoke_handler, run loop
commands/           IPC layer — one #[tauri::command] module per feature (ai, auth,
                    copy_capture, manual_capture, link, tasks, task_groups, shortcut).
                    Thin: delegate to services/repository/platform.
core/               shared types: error (AppError), models (ts-rs structs), state
                    (FrontmostSource, PendingSource), config (the env singleton)
clients/            transport to external systems — one struct per system: ServerClient (Blink
                    sync server) + OpenAiClient. Thin: build + send, return the raw response.
services/           business logic as structs, each holding its client(s) via DI and managed as
                    Tauri state — AuthService (server auth), AiService (improve), SecurityService
                    (DLP filter), SessionTokenService (keychain bearer token)
repository/         persistence facade: Repository owns the shared Db (SQLCipher) and exposes
                    entity repos — TaskRepository, TaskGroupRepository, SettingsRepository.
                    Plus db.rs (open + keychain key + error helpers), migrations.rs
                    (rusqlite_migration schema, 6 migrations)
platform/           OS glue. os/ = native primitives behind one interface, impl picked by
                    target (os/macos/ = frontmost detection + ⌘C input + open_url; os/fallback.rs
                    for other OSes); shortcut.rs (the capture-hotkey feature); window.rs (capture
                    panel placement). shortcut/window are cross-platform, built on os::
```

## Layout — `src` (the webview)

```
main.tsx            branches on getCurrentWindow().label → main app or a capture panel
App.tsx             <SessionProvider><AuthGate><Inbox/></AuthGate>
lib/api.ts          typed IPC façade over every Tauri command + in-memory browser mock
generated/          ts-rs output — never hand-edit; run gen:types after changing models.rs
components/
  auth/             LoginScreen, CredentialsForm, VerifyForm, ForgotPasswordForm,
                    ResetPasswordForm, AuthCard, Field
  tasks/            TaskSection, ArchiveSection, TaskRow, TaskEditor, GroupFilterBar,
                    DeleteTaskDialog, DeleteGroupDialog, shared hints.ts
  CapturePanel.tsx  shared capture UI; CopyCapture/ManualCapture are thin config wrappers
  TaskList.tsx      inbox orchestrator (cursor + delete flow + group filter)
hooks/              useTaskEditor, useTaskGroups, useArchive, useListCursor, useSession
lib/completed.ts    pure helpers (splitTasks, groupByDay)
```

## Commands

- `pnpm tauri dev` (repo root) — full app. `pnpm desktop` — webview only, browser mock.
- `pnpm --filter @blink/desktop gen:types` — regenerate `src/generated/` from Rust
  (`cargo test`, ts-rs). `export_to` (`../../src/generated/`) resolves relative to
  `src-tauri/src` (ts-rs 10).
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` — fast Rust type-check.

## Architecture notes

- **Tauri IPC**: every `#[tauri::command]` in `src-tauri/src/commands/` is exposed through the
  typed façade in `src/lib/api.ts`, which falls back to an in-memory mock when running under
  plain Vite (no Tauri host). Add a command → register in `lib.rs` `invoke_handler` → add a
  method + mock case in `api.ts`. The invoke arg key must match the Rust param name. The mock
  keeps feature parity (e.g. it seeds task groups and implements all six group commands) — keep
  it honest when adding commands.
- **Persistence** = the `repository` module. `Repository::open(path)` opens the shared
  `Db` (SQLCipher, unlocked with a keychain passphrase, migrated on open) and hands an
  `Arc<Db>` to each entity repository. Add a table = a migration in `migrations.rs` + a
  `*Repository` file + a field on `Repository`. Row↔struct mapping uses `serde_rusqlite`
  (`SELECT *` maps by column name); a flat `TaskRow` mirrors the nested `Task` for storage.
  Migrations so far: 1 tasks, 2 settings, 3 `link`, 4 `completed_at`, 5 `position`,
  6 `task_groups` + `tasks.task_group_id`.
- **Services & clients (Rust DI)**: business logic lives in `services/` as structs; each holds the
  `clients/` (and other services) it needs as fields named after the type — `AuthService {
  server_client, session_token_service }`, `AiService { openai_client }`. They're built in `lib.rs`
  (the composition root) and `.manage()`d, then resolved in commands via `State<XService>`, exactly
  like `State<Repository>`. Clients are thin transport — one struct per external system, returning
  `reqwest::Result<Response>`; the service checks status, parses, and maps errors to `AppError`.
  Add a server endpoint = a method on `ServerClient` (its path + body) + the service call that
  reads the response.
- **Config singleton**: `core::config::config()` reads the environment once (`OnceLock`) into a
  `Config`. Read env only there — never scatter `std::env::var`. A new var = a field + a line in
  `from_env` (`BLINK_SERVER_URL`, `OPENAI_API_KEY`).
- **Auth / login gate**: the main window is gated behind email/password sign-in (Better Auth on
  the server). `AuthService` drives the full flow via `ServerClient` — the commands are
  `sign_in`, `sign_up`, `verify_email`, `resend_verification`, `request_password_reset`,
  `reset_password`, `sign_out`, `current_session`. Sign-up requires email verification and
  password reset is code-based — both use the server's email-OTP flow, entered in `VerifyForm` /
  `ForgotPasswordForm` + `ResetPasswordForm`. The bearer token from the `set-auth-token` header
  is stored in the keychain via `SessionTokenService` (account `sync-session-token`); the account
  profile is cached in `settings` so `current_session` gates offline (token present + cached
  user). Webview side: `AuthGate` is the SPA's route-middleware stand-in (renders `LoginScreen`
  until authenticated), and `useSession` reads the provider's context. The token never enters
  the webview. Capture windows stay local (not gated).
- **Capture methods**: each is a variant of `platform::shortcut::CaptureMethod`, and owns a
  global hotkey + a frameless window + a component. `main.tsx` branches on
  `getCurrentWindow().label` to render the right one. Both windows render the shared
  `CapturePanel` (text field + optional link + group picker; keyboard-first — `⌘↵` save / `⌘I`
  improve / `⌘G` group picker / `Esc` cancel, **no buttons**), saved as one `Task`;
  `CopyCapture`/`ManualCapture` are thin config wrappers over it.
  - **Copy** (`⌘⇧B`, `copy-capture` window): records the frontmost app/window as the source,
    snapshots the clipboard, simulates ⌘C, then **polls** the clipboard until the selection
    lands (instead of a fixed sleep) and **restores the user's clipboard** — capture never
    clobbers what they had copied. The lifted text is stashed in `PendingCapture`; the panel's
    `read_copy_capture` reads that stash (not the live clipboard), sanitizes, and pre-fills.
  - **Manual** (`⌘⇧M`, `manual-capture` window): no clipboard/source — a blank panel to type
    into; saved with a synthetic `manual` source.
  - Adding a method = a `CaptureMethod` variant (+ its `start`/window/`setting_key`/default) +
    a window in `tauri.conf.json` + a capability entry + a `CaptureKind` routed in `main.tsx`.
    Shared pieces (`CaptureSource`, `CapturePanel`, the `save_task`/`improve_text` commands, the
    `show_centered` window helper) are reused, not duplicated.
- **Source detection** (`platform/os/macos/frontmost.rs`): `NSWorkspace` for the frontmost app +
  the Accessibility API for its window title, captured *before* our panel steals focus and
  stashed in `PendingSource`. Reuses the Accessibility permission ⌘C already needs. Copy-only.
  For **browsers** (matched by bundle id) it also reads the current page URL — the window's
  `AXDocument` (Safari) or a bounded search for the `AXWebArea`'s `AXURL` (Chromium) — and carries
  it as `FrontmostSource.url` → `CaptureDraft.link`, pre-filling the panel's link field.
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
  focused task, `e` edits, `o` opens its link, `⌫` deletes (confirm `AlertDialog`, `⌘↵` to
  confirm), `⌥↑`/`⌥↓` reorder it (Inbox only — see below), `Esc` unselects. `Tab` is swallowed
  in the main window (the cursor drives selection, not DOM focus) except inside the open editor.
  Editing is an in-row **Popover** (text/source/link/group fields; `⇥`/`⇧⇥` move between the
  fields and wrap, `⌘↵` save, `⌘I` improve, `Esc` cancel). There are **no action buttons** —
  every action is a shortcut, always shown via a `ShortcutHint`; rows also click-to-select and
  double-click-to-complete. `useListCursor` ignores keys originating inside a
  `[role=dialog|menu|alertdialog]`, so an open overlay keeps its own keys.
  - **Structure**: `TaskList` is a thin orchestrator (owns the cursor, delete flow, and group
    filter) that composes `components/tasks/` presentational pieces. Stateful logic lives in
    hooks: `useTaskEditor` (draft fields + `⌘I`/`⌘↵`), `useTaskGroups` (filter + group CRUD),
    `useArchive` (open/search/pagination + `a`/`←→`). Pure helpers in `lib/completed.ts`.
- **Task groups**: tasks optionally belong to one group (`tasks.task_group_id`, FK
  `ON DELETE SET NULL`; migration 6). `TaskGroupRepository` owns CRUD (names unique + non-empty;
  `delete` explicitly un-groups its tasks); commands are `list/create/rename/delete_task_group`
  + `get/set_active_task_group` (the active filter persists in `settings` under
  `active_task_group`, so capture windows can read it).
  - **Filter bar** (`GroupFilterBar` + `useTaskGroups`): pills for **All** + each group above
    the inbox. `h`/`l` cycle the filter (wraps), `n` creates, `r` renames (popover prompt),
    `⌘⌫` deletes (confirm `⌘↵` in `DeleteGroupDialog` — deleting moves its tasks back to All).
    Filtering happens before `splitTasks`, so all sections respect it.
  - **Assignment**: the editor gains a group field in the `⇥` cycle (Radix dropdown, arrow keys
    + `⏎`); `update_task` clears the group when sent an empty string (same pattern as `link`).
    `CapturePanel` shows a group picker (`⌘G`) when groups exist, **defaulting to the inbox's
    active filter** (validated against the loaded groups so a stale id degrades to none).
  - `TaskRow` shows a group chip (Tag icon) only while the All filter is active.
- **Inbox order** is manual and persisted: a `position` column (migration 5, seeded from `rowid`)
  sorts `list` (`ORDER BY position DESC`, higher = top); new tasks land on top (`MAX+1`). `⌥↑`/`⌥↓`
  on the focused Inbox row calls `reorder_task(first, second)` → `TaskRepository::swap_positions`
  (swaps the two rows' positions). Only active tasks reorder; Completed/Archive keep their natural
  order. `position` is storage-only — it's not on the `Task` model, so `TaskRow` omits it and
  `SELECT *` just ignores it.
- **Task edits** go through the `update_task` command → a `TaskPatch` (any of `text` / `completed`
  / `link` / `source` / `improved` / `task_group_id`); the frontend sends only changed fields. An
  optional `link` (http(s)) is opened by the `open_link` command (`platform::os::open_url`) from
  the `o` shortcut or the row's link chip; its column was added in migration 3.
- **AI "improve"**: `AiService::improve` (via `OpenAiClient`) is exposed as the `improve_text`
  command — it returns cleaned text, no persistence. Both the capture panels and the inbox editor
  call it on `⌘I`, replace the field, and set an `improved` flag that gates re-improving (once per
  version, cleared when the text changes) and is persisted on save via `update_task`. The verb is
  **improve** everywhere. (`improve_task`/`mark_improved` predate this flow and are now unused.)
- **macOS specifics**: input simulation and window ops must run on the main thread
  (`run_on_main_thread`). Transparency needs `macOSPrivateApi`. The capture window uses native
  `hudWindow` vibrancy; the main window has an overlay title bar (`titleBarStyle: Overlay`).
  The inbox window hides during capture; the dock-icon `Reopen` event brings it back.

## Conventions

- **`mod.rs` is a thin index** — module declarations + re-exports, not definitions. Exception:
  a module's namesake facade may live at its root (e.g. `repository::Repository`).
- **Rust services & clients are structs**, held via DI and managed as Tauri state. Name a
  dependency field after the type it holds (`server_client: ServerClient`, `session_token_service:
  SessionTokenService`) — not an abbreviation like `client`/`tokens`.
- **No buttons, anywhere.** Every action is a keyboard shortcut, surfaced via `ShortcutHint`.
  **`⌘↵` confirms** every commit/destructive action (save, delete-task, delete-group) — never
  plain `Enter`. Mouse affordances (pill click, row double-click) are secondary and stay out of
  the focus flow (`tabIndex={-1}` + `preventDefault` on mousedown).
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
- **Never hand-edit `src/generated/`** — change the struct in `core/models.rs`, run `gen:types`.

## Environment

`apps/desktop/src-tauri/.env` (gitignored) holds the desktop core's env — `OPENAI_API_KEY` (the
"Improve with AI" action) and `BLINK_SERVER_URL` (the sync server, default
`http://localhost:8787`). Loaded by `dotenvy` at startup in dev, then read once via
`core::config`; real env vars win.
