# Raw capture text + AI prompt-to-clipboard action

## Context

Today a task only keeps its current `text` — the original captured content is lost the moment
the user edits it or runs ⌘I improve. We want every task to permanently keep its **raw
captured text** (copy capture or manual capture), immutable after save, and add a per-task
action that sends that raw text + task context to OpenAI to generate a ready-to-paste
assistant prompt, which is copied to the system clipboard.

Decisions confirmed with the user:
- **Raw = post-DLP, pre-edit**: copy capture → the sanitized text that pre-fills the panel;
  manual capture → what was typed before the first ⌘I improve (or the saved text if never
  improved). Secrets stay redacted — the DLP guarantee is preserved.
- **Prompt is AI-generated** (new `AiService` method, like `improve`), **copied to clipboard**
  from the Rust side, triggered by a **shortcut only**: `p` on the focused task (`p` is
  unclaimed; existing single keys are `j k e o i c a h l n r`). Works in Inbox, Completed,
  and Archive (shared `listShortcuts`).

## Rust core (`apps/desktop/src-tauri`)

1. **Models** (`src/core/models.rs`): add to `Task` and `NewTask`, right after `text`:
   ```rust
   /// The post-sanitization, pre-edit captured text — frozen at capture, never updated.
   pub raw_text: String,
   ```
   ts-rs emits `rawText` via the existing `rename_all = "camelCase"`.

2. **Migration 7** (`src/repository/migrations.rs`) — append after migration 6, mirroring the
   migration-5 `position` backfill precedent:
   ```rust
   M::up(
       "ALTER TABLE tasks ADD COLUMN raw_text TEXT NOT NULL DEFAULT '';
        UPDATE tasks SET raw_text = text;",
   ),
   ```
   Backfill from `text` so the prompt action works uniformly on pre-existing tasks.

3. **Repository** (`src/repository/tasks.rs`):
   - `TaskRow`: add `raw_text: String` + both `From` impls. Field name must match the column
     (serde_rusqlite maps by name).
   - `insert`: add `raw_text` to the explicit column list + `:raw_text` placeholder, with an
     empty-raw fallback before building the `Task` (covers a copy capture that opened empty
     and was typed into):
     ```rust
     let raw_text = if new.raw_text.trim().is_empty() { new.text.clone() } else { new.raw_text };
     ```
   - New `pub fn get(&self, id: &str) -> AppResult<Task>` reusing the private `fetch_one`.
   - `TaskPatch` **unchanged** — immutability is enforced by having no write path.

4. **TaskService** (`src/services/task_service.rs`): `pub fn get(&self, id: &str)` delegating
   to `task_repository.get(id)`.

5. **AiService** (`src/services/ai_service.rs`):
   - Extract `improve`'s request/parse body into a private
     `async fn complete(&self, system: &'static str, user: String) -> AppResult<String>`;
     `improve` becomes `self.complete(SYSTEM_PROMPT, text).await`.
   - New const next to `SYSTEM_PROMPT`:
     ```rust
     const PROMPT_SYSTEM_PROMPT: &str = "You write prompts for AI assistants. Given a task's \
     original captured text and its context (the current task phrasing, the app and window it \
     was captured from, an optional link), write one ready-to-paste prompt asking an AI \
     assistant to help complete that task. State the goal, include the original captured text \
     as context, and mention the source or link only when they help. Return ONLY the prompt \
     text — no preamble, no quotes, no markdown, no labels.";
     ```
   - New `pub async fn generate_prompt(&self, task: &Task) -> AppResult<String>`: builds the
     user message from `task.text` + `task.raw_text`, appends `Captured from: {app_name}
     {window_title}` when non-empty and `Link: {link}` when present, then
     `self.complete(PROMPT_SYSTEM_PROMPT, user).await`.

6. **Clipboard platform helper**: new `src/platform/clipboard.rs` (+ `pub mod clipboard;` in
   `platform/mod.rs`) — services never import `tauri`, and `platform` is the one layer that
   touches the runtime (`platform/shortcut.rs` already uses `ClipboardExt`):
   ```rust
   pub fn write_text(app: &AppHandle, text: &str) -> AppResult<()>
   ```
   using `app.clipboard().write_text(...)`, mapped to a new `AppError::Clipboard(String)`
   variant (add to `src/core/error.rs` + its Display arm).

7. **Command** (`src/commands/ai.rs`) + register in `lib.rs` `invoke_handler` next to
   `improve_text`:
   ```rust
   #[tauri::command]
   pub async fn generate_task_prompt(
       app: AppHandle,
       ai_service: State<'_, AiService>,
       task_service: State<'_, TaskService>,
       id: String,
   ) -> AppResult<String> {
       let task = task_service.get(&id)?;
       let prompt = ai_service.generate_prompt(&task).await?;
       crate::platform::clipboard::write_text(&app, &prompt)?;
       Ok(prompt)
   }
   ```

8. **Regenerate types**: `pnpm --filter @blink/desktop gen:types`. `Task.ts`/`NewTask.ts`
   gain `rawText: string`; every TS construction site now fails to compile — that's the
   checklist for the webview steps.

## Webview (`apps/desktop/src`)

9. **API façade + mock** (`src/lib/api.ts`):
   - `generateTaskPrompt: (id: string) => invoke<string>('generate_task_prompt', { id })`.
   - Mock parity: seed tasks get `rawText` (give one seed a distinct, longer `rawText` so the
     feature is visible in dev); `save_task` case mirrors the Rust empty fallback
     (`rawText: input.rawText.trim() ? input.rawText : input.text`); new
     `generate_task_prompt` case builds a deterministic prompt string from
     `rawText`/`text`/`source`/`link`, best-effort
     `try { await navigator.clipboard.writeText(prompt) } catch {}`, returns the prompt
     (throws `'task not found'` for a bad id). No OpenAI in the browser — same honesty level
     as the `improve_text` echo.

10. **Capture raw snapshot** (`src/components/CapturePanel.tsx` + wrappers):
    - `CaptureContent` gains
      `/** Frozen raw text (copy capture); absent = freeze at first improve. */ rawText?: string;`
    - Panel state `const [rawText, setRawText] = useState<string | null>(null)` (`null` =
      not yet frozen). `load()` sets `content.rawText ?? null`; `hide()` resets to `null`.
    - `improve()`: before the first replace, `if (rawText === null) setRawText(text);` —
      later improves don't re-freeze.
    - `save()`: pass `rawText: rawText ?? trimmed` in the `api.saveTask` payload.
    - `CopyCapture.tsx`: `load` returns `rawText: draft.text`. `ManualCapture.tsx` unchanged.

11. **Inbox action** :
    - `src/hooks/useListCursor.ts`: add `onPrompt?: (item: T) => void` to
      `ListCursorActions` + `useHotkeys('p', guard(() => act((a) => a.onPrompt, false)),
      { enabled: canAct, preventDefault: true });`.
    - `src/components/tasks/hints.ts`: add `{ keys: 'p', label: 'prompt' }` to the shared
      `listShortcuts` array (after `o`) — Inbox/Completed/Archive all inherit it.
    - `src/lib/utils.ts`: extend `errorMessage` to unpack Tauri's AppError rejection shape
      `{ kind, message }` (today only `CapturePanel` does this inline — without it,
      "OPENAI_API_KEY is not set" collapses to the fallback). Optionally simplify
      `CapturePanel.improve`'s inline handling to use it.
    - `src/components/TaskList.tsx`:
      - `const [promptState, setPromptState] = useState<{ id: string; status: 'loading' | 'copied' } | null>(null)`;
        errors go through the existing `report()` line. Copied-state resets after ~2s via a
        `useRef` timeout, cleared before a new run.
      - Handler `generatePrompt(task)`: no-op while a run is loading; set loading → await
        `api.generateTaskPrompt(task.id)` → set copied; on catch `setPromptState(null)` +
        `report(e, 'Could not generate prompt')`.
      - Wire `onPrompt: (t) => void generatePrompt(t)` into `useListCursor`; pass
        `promptStatus={promptState?.id === task.id ? promptState.status : undefined}` in
        `renderRow`.
    - `src/components/tasks/TaskRow.tsx`: optional `promptStatus?: 'loading' | 'copied'`
      prop; render an inline chip at the end of the metadata row (`·`-separated like the
      link/group chips), mirroring the panel's improve status styling: loading →
      `WandSparkles` `animate-pulse` + "Generating prompt…" (`text-blink-bright`); copied →
      `Check` + "Prompt copied" (`text-blink-success`). No buttons; stays inside the
      `pointer-events-none` content wrapper.

## Verification

- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`, then
  `pnpm --filter @blink/desktop gen:types`; confirm `src/generated/Task.ts`/`NewTask.ts`
  gained `rawText`.
- **Browser mock** (`pnpm desktop`): press `p` on rows in all three sections → loading then
  "Prompt copied", clipboard holds the deterministic prompt; `p` appears in each section's
  hint row; typing `p` in the archive search box must not trigger it.
- **Full app** (`pnpm tauri dev`):
  1. Existing dev DB migrates; `p` works on old tasks (backfilled raw).
  2. Copy capture with a DLP hit (e.g. `sk_test_abc123`) → edit + ⌘I + save → `p`: pasted
     prompt references the sanitized prefill, not the edited/improved text.
  3. Manual capture: type, ⌘I, edit, save → raw = pre-improve text. Save one without
     improving → raw = saved text.
  4. Edit a task's text later (`e`), then `p` → prompt still uses the original raw.
  5. Unset `OPENAI_API_KEY`, restart → `p` shows "OPENAI_API_KEY is not set" on the section
     error line; clipboard untouched.

## Risks

- **serde_rusqlite pairing**: `TaskRow.raw_text` and the INSERT column list must change
  together — mismatch is a runtime error, not compile-time.
- **Mock parity drift**: the mock must implement `generate_task_prompt` + the raw fallback,
  or `pnpm desktop` lies about the feature.
- **Copied-reset timeout**: clear the ref'd timeout before starting a new run so a stale
  timer can't wipe a newer row's state.
