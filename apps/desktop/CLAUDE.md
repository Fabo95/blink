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
                    Thin: delegate to services/platform — never to a repository directly.
core/               shared types: error (AppError), models (ts-rs structs), state
                    (FrontmostSource, PendingSource), config (the env singleton)
clients/            transport to external systems — one struct per system: ServerClient (Blink
                    sync server) + OpenAiClient. Thin: build + send, return the raw response.
services/           business logic as structs, one file per service named after it
                    (auth_service.rs → AuthService); each holds its client(s)/repo(s) via DI and
                    is managed as Tauri state — AuthService (server auth + cached profile),
                    AiService (improve), SecurityService (DLP filter), SessionTokenService
                    (keychain bearer token), TaskService + TaskGroupService (task/group CRUD),
                    CaptureService (capture drafts), ShortcutService (hotkey policy)
repository/         persistence facade: Repository owns the shared Db (SQLCipher) and exposes
                    entity repos — TaskRepository, TaskGroupRepository, SettingsRepository.
                    Plus db.rs (open + keychain key + error helpers), migrations.rs
                    (rusqlite_migration schema, 6 migrations)
platform/           OS glue. os/ = native primitives behind one interface, impl picked by
                    target (os/macos/ = frontmost detection + ⌘C input + open_url; os/fallback.rs
                    for other OSes); shortcut.rs (capture-hotkey OS mechanics — the policy lives
                    in ShortcutService); window.rs (capture panel placement). shortcut/window are
                    cross-platform, built on os::. No file in services/ imports tauri; platform
                    is the one layer that touches the runtime
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
  tasks/            TaskSection, ArchivePage, TaskRow, TaskEditor, GroupFilterBar,
                    DeleteTaskPopover, DeleteGroupPopover (in-row confirms)
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
  `Arc<Db>` to each entity repository. Entity repos are `Clone` (clones share the
  connection); `lib.rs` clones them into the services that need them — `Repository` itself
  is just the opener, not managed state, and only services ever call a repository. Add a
  table = a migration in `migrations.rs` + a `*Repository` file + a field on `Repository`
  + a service that fronts it. Row↔struct mapping uses `serde_rusqlite`
  (`SELECT *` maps by column name); a flat `TaskRow` mirrors the nested `Task` for storage.
  Migrations so far: 1 tasks, 2 settings, 3 `link`, 4 `completed_at`, 5 `position`,
  6 `task_groups` + `tasks.task_group_id`.
- **Services & clients (Rust DI)**: business logic lives in `services/` as structs; each holds the
  `clients/`, repositories, and other services it needs as fields named after the type —
  `AuthService { server_client, session_token_service, settings_repository }`, `TaskService {
  task_repository }`. They're built in `lib.rs` (the composition root; DB-backed ones in `setup`,
  after the `Db` opens) and `.manage()`d, then resolved in commands via `State<XService>`.
  Clients are thin transport — one struct per external system, returning
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
  the webview. Capture windows stay local (not gated). The auth screens are keyboard-first and
  button-free like the rest of the app, with the shortcut statusline pinned to the bottom of
  `LoginScreen` (like the inbox footer): `⌘↵` is the only submit (shared `AuthForm` —
  `requestSubmit()` keeps native validation, plain Enter is swallowed), `Esc` steps back, `⌘R`
  resends the code, `⌘N` toggles sign-in ↔ sign-up, `⌘F` opens forgot-password — each a plain
  `useShortcut` whose chip shows in the statusline (no clickable chips). `⌘⇧O` signs out (hinted
  on the header menu item, and on the vault gate; not `⌘⇧Q` — that's macOS's own Log Out chord). `useLoginState` holds only what spans steps (`step` + the
  email/password carried forward + busy/error + navigation); each form owns its own
  submit/resend via `useSession`.
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
- **Capture shortcuts**: one hotkey **per method**, keyed by `CaptureMethod`. `ShortcutService`
  owns the policy — the `settings` keys (`copy_capture_shortcut` / `manual_capture_shortcut`)
  and defaults (`⌘⇧B` / `⌘⇧M`); `platform/shortcut.rs` owns the OS mechanics. A single
  global-shortcut handler is registered; since it fires for every bound hotkey,
  it resolves the pressed shortcut back to its method (`method_of`) and dispatches. `set` refuses
  a combo already owned by another method. UI is one `ShortcutRecorder` per method in the capture
  card; the commands `get/set_capture_shortcut` take a `method` arg.
- **Inbox is keyboard-first** (`TaskList`): two stacked sections — **Inbox** (active) and
  **Completed** (done in the last 24h), both always open — above the capture card and group
  filter bar. **The Archive is its own page** (`ArchivePage`), reached with `a`: it replaces the
  whole inbox (capture card, filter bar, both sections) with a searchable, paginated (8/page),
  day-grouped list of older completions (Today / Yesterday / weekday / date via
  `lib/completed.ts::groupByDay`). On the archive page `s` focuses its search box, `←→`/`hl`
  page, and `a` or `Esc` return to the inbox (`Esc` only with no row focused — a focused row's
  `Esc` clears the selection first). `archiveOpen` lives in `TaskList` (lifted above
  `useTaskGroups`/`useArchive` so both read it); while it's true the group-management keys
  (`n`/`r`/`⌫`) and filter cycling stand down. A virtual cursor (`useListCursor`, built on
  `react-hotkeys-hook`) walks whichever page is showing — the inbox (Inbox → Completed) or the
  archive page's current slice: `↑↓`/`jk` move it, `↵` completes/restores the focused task,
  `e`/`i` edit, `o` opens its link, `⌫`/`d` delete (in-row confirm popover, `⌘↵` confirms),
  `⌥↑↓`/`⌥KJ` reorder it (Inbox only — see below), `Esc` unselects. `Tab` is swallowed while
  browsing (the cursor drives selection, not DOM focus); it works normally in every input
  elsewhere (the editor fields, capture panel, login).
  Editing is an in-row **Popover** (text/source/link/group fields; `⇥`/`⇧⇥` move between the
  fields and wrap, `⌘↵` save, `⌘I` improve, `Esc` cancel). There are **no action buttons** —
  every action is a shortcut; rows also click-to-select and double-click-to-complete.
  - **Shortcuts live in one table** (`lib/shortcuts/`). **`SHORTCUTS`** (`shortcuts.ts`) is the
    single place keys are assigned — one row per action (`'task.delete'`, `'editor.save'`, …),
    each owning its `keys` (synonyms comma-separated), statusline chip (`hint`), `order` slot,
    and `opts` (`enableOnFormTags`/`preventDefault`). Chips come from **`HINTS`** (also in
    `shortcuts.ts`), keyed by the binding so there is **one hint per physical key** with an
    app-wide verb (`⌘↵ confirm`, `Esc cancel`, `←→ switch`, `↵ toggle`); a dev-time check fails
    if two rows on the same key diverge. `hint: null` = no chip (silent half of a pair, or a
    key surfaced by its own control-local chip). There are no use-site hint overrides.
  - **The `ShortcutProvider`** (one per window, `main.tsx`) binds every SHORTCUTS row once — a
    static `KeyBinding` per row whose enablement is looked up at keypress, so nothing
    re-registers and components never touch the key engine. `react-hotkeys-hook` appears
    **only** inside the provider — never call `useHotkeys` elsewhere. *Gotcha:* the provider
    applies `preventDefault` itself in its dispatch callback and passes `preventDefault: false`
    to the library, because the library applies its own `preventDefault` *before* the enabled
    check and our bindings are always attached — so the library option would swallow keys
    (notably `Tab` in inputs) even where the shortcut is disabled. Leave it that way.
  - **Components contribute only behavior**: `useShortcut(id, { enabled, callback })`; `enabled`
    gates BOTH firing and the chip. There is **no scope system** — a shortcut works exactly
    while a mounted component keeps it enabled: mounting separates the windows/screens (capture
    panel, login screen), and overlay exclusivity is plain `enabled` logic (`TaskList` threads
    one `enabled` boolean — no editor / delete-confirm / group prompt open — into
    `useListCursor`/`useArchive`/`useTaskGroups`, and each overlay's shortcuts enable on its own
    open state). Rows sharing a key (Esc, `⌘↵`, `←→`/`hl`) rely on those conditions being
    mutually exclusive.
  - **The statusline is a single, specificity-driven bar.** `<Hints />` (`useHints()`) shows
    only the **highest active level** so the bar reflects *where you are* and stays one line:
    each `SHORTCUTS` row has a numeric `level` (higher = more specific, like a z-index): `3`
    overlay (an open editor/dialog/prompt) > `2` task (a focused row) > `1` browse (archive
    `a`, groups `n`/`r`/`⌫`) > `0` navigate (the base list level — `↑↓` between rows and `←→`
    to switch filter / page the archive; rides along under browse/task, only enabled outside
    overlays, so it drops away when one is up). So browsing shows the structural keys, focusing a task swaps to its actions,
    opening the editor swaps to its keys. Rendered in the `Inbox` footer with the always-on `c help` and `v` dialect toggle at
    its right; the **login screen** and **capture panels** render the same `<Hints />` (their
    keys are all `overlay`-level, so all show). **New UI surfaces its keys through the statusline
    — never a local hint row, and never a chip on a section header or the filter bar.** Keys with
    no chip (`hint: null`): `c`/`v`/`⌘⇧o` (their own affordances) and the silent halves of pairs.
    (Bindings are matched by physical key code, so single letters are used over layout-shifted
    symbols like `/` or `?` that break on non-US keyboards.)
  - **`c` opens the cheat-sheet** (`ShortcutHelp`, an `AlertDialog`; `c` toggles, `Esc` closes):
    a reference of every shortcut grouped by the three types the user thinks in — **Sections /
    Task groups / Tasks / Editing** (`CHEATSHEET` in `shortcuts.ts`), each row's chip from its
    `hint` and its sentence from `describe`. It shows *all* keys (not just enabled ones); the
    always-on bar shows the relevant subset. While it's open, browse/task shortcuts gate off
    (`helpOpen` in `TaskList`'s `baseEnabled`).
  - **Overlays are in-row popovers, not modals** — the editor and the delete-confirm both anchor
    to the task row through one Radix `Popover` (`TaskRow`), so they sit beside the task and
    leave the statusline visible; their `⌘↵`/`Esc` are ordinary shortcuts shown in the
    statusline. Follow this for any new per-item confirm.
  - **Structure**: `TaskList` is a thin orchestrator (owns the cursor, delete flow, and group
    filter) that composes `components/tasks/` presentational pieces. Stateful logic lives in
    hooks: `useTaskEditor` (editor shortcuts: `⇥`/`⌘i`/`⌘↵`/`Esc`), `useTaskGroups` (filter +
    group CRUD + its prompt/dialog shortcuts), `useArchive` (open/search/pagination),
    `useListCursor` (cursor + movement; the per-row shortcuts live in `TaskList`, which has
    the task data their hints need). Pure helpers in `lib/completed.ts`.
- **Task groups**: tasks optionally belong to one group (`tasks.task_group_id`, FK
  `ON DELETE SET NULL`; migration 6). `TaskGroupRepository` owns CRUD (names unique + non-empty;
  `delete` explicitly un-groups its tasks); commands are `list/create/rename/delete_task_group`
  + `get/set_active_task_group` (the active filter persists in `settings` under
  `active_task_group`, so capture windows can read it).
  - **Filter bar** (`GroupFilterBar` + `useTaskGroups`): pills for **All** + each group above
    the inbox. `←→`/`hl` cycle the filter (wraps; while the archive is open these keys page it
    instead — bound in `TaskList`, which sees both states; hinted in the statusline), `n`
    creates, `r` renames (popover prompt), `⌫` deletes (the same delete key as a task —
    bound in `TaskList` and gated on no task being focused, so the two never collide; confirm
    `⌘↵` in the `DeleteGroupPopover`, deleting moves its tasks back to All). Filtering happens
    before `splitTasks`, so all sections respect it.
  - **Assignment**: the editor gains a group field in the `⇥` cycle (Radix dropdown, arrow keys
    + `↵`); `update_task` clears the group when sent an empty string (same pattern as `link`).
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
  **improve** everywhere.
- **macOS specifics**: input simulation and window ops must run on the main thread
  (`run_on_main_thread`). Transparency needs `macOSPrivateApi`. The capture window uses native
  `hudWindow` vibrancy; the main window has an overlay title bar (`titleBarStyle: Overlay`).
  The inbox window hides during capture; the dock-icon `Reopen` event brings it back.

## Conventions

- **`mod.rs` is a thin index** — module declarations + re-exports, not definitions. Exception:
  a module's namesake facade may live at its root (e.g. `repository::Repository`).
- **Rust services & clients are structs**, held via DI and managed as Tauri state. Name a
  dependency field after the type it holds (`server_client: ServerClient`, `session_token_service:
  SessionTokenService`) — not an abbreviation like `client`/`tokens`. One file per service/client,
  named after it (`auth_service.rs`, `server_client.rs`). Commands never touch a repository —
  always through a service; services never import `tauri`.
- **A service reaches persistence only through a repository — never the raw `Db`.** If a service
  needs a table, add a `*Repository` for it (holding `Arc<Db>`, locking internally) and inject that,
  the way `AuthService` takes `SettingsRepository` and `HlcService` takes `SyncStateRepository`.
  `Db` stays `pub(super)` inside `repository/`; only repositories hold it. Row writes belong on the
  owning repository (e.g. `TaskRepository::record_change(id, physical, counter, node_id)` — raw
  column values, so the repo never depends on a service type like `Hlc`); the entity service
  composes them — `HlcService::next()` mints the clock stamp, the service's own `mark_dirty` hands
  its fields to `repo.record_change` after each write — so a service never runs raw table SQL.
- **No buttons, anywhere.** Every action is a keyboard shortcut, surfaced via `HintRow`.
  **`⌘↵` confirms** every commit/destructive action (save, delete-task, delete-group) — never
  plain `Enter`. Mouse affordances (pill click, row double-click) are secondary and stay out of
  the focus flow (`tabIndex={-1}` + `preventDefault` on mousedown).
- **No emoji in the app UI.** Icons via `lucide-react`. One cursor everywhere (`cursor: default`),
  UI text not selectable.
- **Keyboard shortcuts go through the `SHORTCUTS`** (`lib/shortcuts/shortcuts.ts`): add the entry
  there, enable it with `useShortcut(id, { when, run })` — never raw `useHotkeys` or a
  hand-rolled `window.addEventListener('keydown', …)`. The exceptions: `ShortcutRecorder`
  (*records* arbitrary combos, not a fixed binding) and input-local `onKeyDown` behavior
  (the archive search's Esc-to-clear). Set `opts.enableOnFormTags` on the SHORTCUTS entry
  when a command must fire while a field is focused (capture panels, editor, auth forms).
- **Render keys with the shared `Kbd` chip** (`components/ui/kbd.tsx`), and a row of
  key+label hints with `HintRow` (`components/HintRow.tsx`) — never plain
  `Esc · ⌘↵` text. Keeps every shortcut hint identical across the app. A `Shortcut` may
  carry a `vim` synonym (`{ keys: '↑↓', vim: 'jk' }`); `v` in the main window flips every
  chip between the two dialects (`lib/hintStyle.ts`, webview-local — both keys always work
  regardless of what's displayed). Glyph rules: a chip shows exactly what's pressed —
  letters always lowercase (`e`, `jk`, `⌘i`, `⌥kj`, `⌘⇧o`; the `⇧` glyph carries Shift,
  never a capital), plain Return is `↵` (never `⏎`), named keys keep their labels (`Esc`),
  and each hint row ends with its Esc action. (Prose in docs may still name chords
  conventionally, e.g. ⌘I — the rule is about rendered chips.)
- **Never hand-edit `src/generated/`** — change the struct in `core/models.rs`, run `gen:types`.

## Environment

`apps/desktop/src-tauri/.env` (gitignored) holds the desktop core's env — `OPENAI_API_KEY` (the
"Improve with AI" action) and `BLINK_SERVER_URL` (the sync server, default
`http://localhost:8787`). Loaded by `dotenvy` at startup in dev, then read once via
`core::config`; real env vars win.
