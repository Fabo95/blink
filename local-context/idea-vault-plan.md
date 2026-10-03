# Idea Vault: capture thinking, let it mature, evaluate it later

## Status (2026-10-03)

Phase 1 (foundation) is implemented, uncommitted on `master`:

- Notes, topics, and revisions in the Rust core, synced as their own record kinds; sync conflicts kept as revisions.
- `PolicyService` sensitivity gate (AI and full export), FTS5 search, Markdown/JSON export with a DLP re-run.
- `⌘⇧I` idea capture; every capture panel switches Task / Note with `⌘T`, a note's type is picked from a dropdown (`⌘K`) beside the topic; topic picker under `⌘G`.
- Ideas page with topic filter, topic header, sections, search, in-row editor, history, delete, export.
- Rust tests: policy, export selection and Markdown, FTS query builder, and SQL-level repository tests (search, conflict merge, unfile) on an in-memory DB.

Deviations from the plan below, decided while building:

- `⌘⇧B` from a browser stays a **task** by default (the plan said Source). Changing it would alter existing task capture, which principle 1 rules out. `⌘T` switches in one key.
- No "Saved to ..." line after capture yet. It only becomes useful with related notes (Phase 4); until then the panel closes instantly, like task capture.
- Export goes through the native save dialog; JSON is the complete, re-importable format, Markdown is for reading.
- Capture is a two-level choice (Task or Note, then the note's type) instead of one 4-way `⌘T` cycle: it matches the data model and keeps `⌘T` a predictable switch.
- Revisions also get a "restore" action (`⌘↵` in the history), which the plan didn't list.

Phase 2 (review ritual) is implemented too: schedule and nudges as pure Rust functions, append-only synced reviews, keep / drop / promote (promote creates a linked inbox task), review sessions over the due queue (max 10), a "Due for review" section, conviction history on rows and in exports, and the due count on the Ideas tab. Deviations: no separate "triage" pass (existing notes are backfilled to 14 days after capture, so old notes simply become due), and the weekly digest notification is postponed until there's a settings toggle for it.

Phase 3 (evidence) is implemented except remote capture of note types: typed note links with derived evidence counts, background source enrichment (fetch, DLP-filtered excerpt, AI summary; never for confidential topics, no AI for private hosts), and the device-local egress log on Home. Remote capture of ideas/sources via `/v1/capture` is a separate server step.

Not done yet (later phases): source enrichment, egress log, briefs, embeddings, teams, server-side capture of note types (`zNoteBody` in `@blink/contract` lands with that).

## Goal

Blink captures tasks today. This adds a second track for **ideas, thoughts, and sources**: things you don't *do*, you *collect* and *judge later*.

The value is the evaluation loop, not the capture. Many tools can collect. Few help answer: "after 6 weeks, which ideas do I still believe in, and what does the evidence say?"

**Success after ~2 months of use:** you open a topic (e.g. "Agentic commerce"), see every idea and source you collected, see how your conviction moved over time, and get a brief that says what the evidence supports, what contradicts it, and what's missing.

**Enterprise angle:** the same loop works for a team. Product and strategy teams collect signals (customer quotes, market links, internal thoughts), each member rates conviction over time, and leadership sees which bets keep gaining support, with every claim traceable to a source. Local-first, DLP, admin policies, and audit logging are what make that sellable to companies that won't put this into Notion or a SaaS idea-management tool.

## Design principles

1. **Capture costs one extra key or less.** If saving an idea is slower than saving a task, it won't happen.
2. **Nothing gets lost.** Raw text is frozen, every edit keeps a revision, every judgement is append-only.
3. **Time is a feature.** Notes come back on a schedule. Conviction that holds over weeks is the signal.
4. **Evidence over opinion.** Ideas link to sources. Briefs cite notes. AI output is always marked as AI.
5. **Same Blink grammar.** Keyboard-only, statusline hints, in-row popovers, no buttons, no modals, no emoji.
6. **Nothing leaves the device without a rule allowing it.** Sensitivity labels and org policy gate every AI call, fetch, export, and share.

## Reuse from what exists

| Building block | Where | Reuse for |
|---|---|---|
| `⌘⇧B` copy capture (app, window, browser URL) | `commands/copy_capture.rs` | Sources: URL and context come for free |
| `CaptureMethod` variants, one hotkey each | `platform/shortcut.rs` | A dedicated idea hotkey |
| `CapturePanel` shared shell | `CapturePanel.tsx` | Type switch + topic picker |
| DLP filter | `security_service.rs` | Notes, fetched pages, exports |
| Frozen `raw_text` | `Task.raw_text` | Same on notes |
| Groups with `context`, filter bar | `TaskGroup`, `GroupFilterBar` | Topics with a guiding question |
| Loose `kind`-tagged sync store | `records`, `zRecordBody` | New kinds sync without a server migration |
| `/v1/capture` + Siri + extractive AI | `captureService.ts` | "Hey Siri, Blink idea ..." |
| `AiService::complete`, `p` prompt-to-clipboard | `ai_service.rs` | Summaries, briefs, related notes |
| `SHORTCUTS` table, levels, `c` cheat-sheet | `lib/shortcuts/` | All new keys |
| In-row `Popover` overlays | `TaskRow` | Review, link, topic edit |
| Attention badge on `PageNav` | `WorktreesPage` | "Due for review" badge |

## Concepts

- **Note**: one captured piece of thinking, with a type:
  - `idea`: something you might build or do
  - `thought`: an observation, question, or opinion
  - `source`: an external link or quote, with provenance
  - `brief`: an AI-generated topic synthesis (read-only, always labelled AI)
- **Topic**: a research thread. Has a **guiding question**, a **status** (`exploring | pursuing | parked | dropped`), and a **sensitivity** (`personal | internal | confidential`).
- **Review**: one dated judgement of a note: conviction 1-5 plus an optional comment. Append-only. Per person, never overwritten.
- **Link**: a typed relation between notes: `supports | contradicts | related`. This is how an idea collects evidence.
- **Revision**: the previous text of a note, kept on every edit. History, and the safety net for sync conflicts.

### Topics are separate from task groups

Groups sort tasks ("Work", "Sport"). Topics hold research and carry a question, a status, and a sensitivity label. Merging them would fill the inbox filter bar with research threads and give tasks fields they don't use. Promoted tasks keep a link back to their idea, so the two stay connected without sharing a container.

## UX

### Capture

One more hotkey, one more key in the panel. Nothing else changes for task capture.

- **Idea hotkey** `⌘⇧I` (new `CaptureMethod::Idea`, configurable like the other two): opens a blank panel preset to *Idea*. This is the zero-friction path.
- **Type switch** in every capture panel: `⌘T` cycles Task, Idea, Thought, Source. Shown as a row of chips under the title, active chip highlighted.
- **Smart default:** a copy capture from a browser with a URL pre-selects *Source*; everything else keeps the method's default (Task for `⌘⇧B`/`⌘⇧M`, Idea for `⌘⇧I`).
- **Filing:** `⌘G` opens the group picker for tasks and the topic picker for notes. The picker defaults to the topic filter active on the Ideas page, the same rule groups use today. The `⌘g` chip label changes from `group` to `file` so one verb covers both (one hint per physical key).
- **Source capture** keeps the selected text as the quote and the URL as provenance. The statusline shows `⌘i improve` for ideas and thoughts only: a source quote is evidence and is never rewritten.
- **After save**, the panel shows one quiet line for ~2 seconds before closing: `Saved to Agentic commerce. 2 related notes.` It never blocks and never asks a question.

```
+-------------------------------------------------------------+
|  New capture                                                |
|  [Task]  (Idea)  [Thought]  [Source]                        |
|                                                             |
|  Restaurants need machine-readable availability so          |
|  assistants can book them.                                  |
|                                                             |
|  link   https://...                                         |
|  topic  Agentic commerce                                    |
|-------------------------------------------------------------|
|  ⌘t type   ⌘g file   ⌘i improve   ⌘↵ confirm   Esc cancel  |
+-------------------------------------------------------------+
```

### Ideas page

New tab in `PageNav`: **Inbox, Ideas, Worktrees, Settings** (click-only, like the other tabs). Badge shows the number of notes due for review.

```
  All   Agentic commerce   Review bottleneck   Org memory
+-------------------------------------------------------------+
|  Agentic commerce                              exploring    |
|  Is there a business in agents booking local businesses?    |
|  14 notes  .  6 sources  .  avg conviction 3.8, rising      |
+-------------------------------------------------------------+
  Due for review  3
   * Agent-readable availability feed        2  3  4    5w
   * "Review is the new bottleneck"          3          3w
  Ideas
   * Restaurant MCP server                   4  5       2w   2 sources
  Thoughts
   * Liability when an agent books wrong                 1w
  Sources
   * Stripe agentic payments docs            stripe.com  4d   AI summary
```

- **Topic header** shows only when a topic filter is active: question, status, counts, conviction trend.
- **Sections:** Due for review, Ideas, Thoughts, Sources, Briefs. Same section component as the inbox.
- **Row:** lucide icon by type (`Lightbulb`, `MessageCircle`, `BookOpen`, `Sparkles` for briefs), text, conviction history as small numbered dots (numbers, not only color, for accessibility), age, source domain, evidence count.
- **Search** `s`: full-text over text, title, summary (SQLite FTS5).
- **Empty states** say what to do, with the key:
  - No notes: "Press ⌘⇧I anywhere to capture an idea."
  - Nothing due: "Nothing to review. Next note comes back in 4 days."

### Keys on the Ideas page

All new keys go into `SHORTCUTS` with a level, a hint, and a cheat-sheet sentence. The free single letters are `f m q t u w y z`.

| Key | Level | Action | Notes |
|---|---|---|---|
| `jk` `↑↓` | 0 | Move | Reused |
| `hl` `←→` | 0 | Switch topic filter | Reused, same as groups |
| `s` | 1 | Search | Reused |
| `n` / `r` / `⌫` | 1 | New / edit / delete topic | Same as groups |
| `w` | 1 | Start a review session over the due queue | `r` is taken by rename |
| `p` | 1 | Copy topic brief prompt (topic filter active) | Same verb as task prompt |
| `e` | 2 | Edit note | Reused |
| `o` | 2 | Open link | Reused |
| `t` | 2 | Change type | New |
| `⌘g` | 2 | Move to topic | Reused chip `file` |
| `w` | 2 | Review this note | |
| `u` | 2 | Link to another note (supports / contradicts / related) | New |
| `y` | 2 | Show history (reviews + revisions) | New |
| `⌘p` | 2 | Promote to task | New |
| `⌫` `d` | 2 | Delete (in-row confirm, `⌘↵`) | Reused |

### Review

The review is an **in-row popover** on the note, like the task editor. A review session (`w` with no row focused) opens the popover on each due note in turn.

```
+-------------------------------------------------------------+
|  Review  2 of 7                                             |
|  "Restaurants need machine-readable availability so         |
|   assistants can book them."            captured 5 weeks ago |
|                                                             |
|  Evidence   2 support . 1 contradicts                       |
|  History    2 (Aug 14)  3 (Sep 01)                          |
|                                                             |
|  Conviction   1  2  3  [4]  5                               |
|  Comment      Talked to 2 owners, both want it.             |
|-------------------------------------------------------------|
|  ←→ switch  ⇥ field  ⌘↵ confirm  ⌘⌫ remove  ⌘p promote  Esc |
+-------------------------------------------------------------+
```

- `←→` sets conviction (`1`-`3` are taken by effort, and each key has one label app-wide).
- `⌘↵` saves the review and keeps the note. `⌘⌫` drops the note (status `dropped`, still searchable). `⌘p` saves and promotes. `Esc` skips to the next one without saving.
- Each session is capped at **10 notes**, oldest due first, so it fits in 5 minutes. A progress line shows `2 of 7`.
- **Next revisit** is a pure function of conviction and history:

| Conviction | Next revisit | Nudge |
|---|---|---|
| 5 | 7 days | After 3 reviews of 4+: suggest promote |
| 4 | 14 days | |
| 3 | 30 days | |
| 2 | 60 days | Suggest drop after two 2s in a row |
| 1 | none | Suggest drop right away |

- New ideas and thoughts first come back after **14 days**. Sources don't get reviewed on their own. They are judged through the ideas they support.
- Notes older than 90 days with no review appear in a **triage** pass: keep, drop, or file into a topic, one key each.
- **Weekly digest:** at most one native notification a week ("7 notes due, 3 new sources in Agentic commerce"). Quiet hours and an off switch in Settings.

### Promote

`⌘p` creates a task in the inbox: text from the idea's text plus "validate:" prefix as an editable default, group = the inbox's active filter, `origin_note_id` back to the idea. The idea's status becomes `promoted`. The task row shows a small `Lightbulb` chip; `o` on it opens the idea. A promoted idea keeps getting reviewed, so the outcome of the validation task can feed back in.

### Topic brief

`p` with a topic active builds a brief from the topic's notes, links, and reviews, and does two things:

1. Copies a ready-to-paste prompt to the clipboard (the existing `task.prompt` mechanism).
2. Saves the brief as a `brief` note in the topic, so briefs form their own timeline.

Brief structure: what the evidence supports (with note references), contradictions, open questions, claims without a source, a check against fixed criteria (problem growing? unfair advantage? someone pays? already solved?), and the next cheapest validation step.

### Related notes

On save, Blink computes an embedding of the note and shows up to 3 similar earlier notes: in the post-save line of the panel, and on the note's history view. Vectors are stored as a BLOB on the note and compared in Rust (cosine over a few thousand vectors is fast; no vector DB, no new dependency).

## Enterprise readiness

### Data classification

- Every topic has a **sensitivity**: `personal` (default for individuals), `internal`, `confidential`. Notes inherit it. An unfiled note is `personal`.
- **Confidential** means: no AI calls (improve, summary, embedding, brief), no link enrichment, excluded from exports unless explicitly included, never sent to `/v1/capture` parsing. The rule is enforced in the Rust services, not the UI, so no path can skip it.
- A source captured from a host on a private network (RFC 1918, `.local`, `.internal`, or an org-configured intranet domain list) is auto-classified at least `internal`.
- The sensitivity shows as a `ShieldCheck` chip in the topic header and on rows when the All filter is active.

### AI governance

- **Provider abstraction** in `AiService`: BYO OpenAI key (today), org-provided key via a server proxy (Phase 5), local model (later, fits the ONNX item in `roadmap.md`). One interface, policy picks the provider.
- **Post-DLP only:** every AI input passes `SecurityService` first, same as `⌘I`.
- **Prompt-injection hygiene:** fetched page text goes in as clearly delimited data, the model gets no tools, and output is stored as plain text marked `ai_generated`. A summary can never trigger an action.
- **Egress log:** every AI call and fetch writes a local `egress_events` row (time, kind, note id, provider, token count, bytes; never content). Settings gets a "What left this Mac" view. This is the answer to the first question every security review asks.

### Admin policy (with workspaces)

An org admin sets a policy that the server delivers as a read-only `policy` record. The desktop enforces it locally and the server enforces it for server-side processing.

| Policy | Example |
|---|---|
| AI allowed, which providers | `org-proxy` only |
| Minimum sensitivity for new topics | `internal` |
| Link enrichment domain allow/deny list | deny `*.salesforce.com` |
| Export allowed, formats | Markdown only, no JSON |
| Sharing outside workspace | off |
| Retention for dropped notes | purge after 365 days |

### Sharing and teams

Depends on workspaces from roadmap Phase 3. Design the data so it doesn't need a rewrite later.

- A topic can be **shared to a workspace** with roles: `viewer` (read), `contributor` (add notes, sources, links, reviews), `owner` (edit topic, change sharing, delete).
- **Reviews stay personal.** In a shared topic each member rates on their own, and the topic header shows **team conviction**: median, spread, and how many members rated. High spread is itself a signal ("the team disagrees, talk about it").
- Server: `records` gains a nullable `workspace_id` column. RLS policy becomes "owner, or member of the record's workspace with a role that allows the operation". A hand-written grant/policy migration in `@blink/db`, same as the existing ones.
- Desktop: shared topics and their notes arrive through the normal pull. Write attempts above your role fail locally first, and the server rejects them anyway.

### Audit log

- Server table `audit_events` (not a sync record, append-only, `INSERT` grant only for `blink_api`): share/unshare, role change, export, policy change, workspace delete, AI proxy call metadata.
- Never stores note content. Queryable by org admins. Retention set by policy.
- Local `egress_events` (above) covers the individual user without a server.

### Retention, deletion, erasure

- Deleting a note writes a tombstone (same `deleted` flag as tasks) and cascades tombstones to its reviews, links, and revisions.
- Server purges tombstones after 30 days, and dropped notes per retention policy.
- **Delete topic** offers two choices in the in-row confirm: unfile its notes, or delete everything in it.
- **Account deletion** purges every record and audit row tied to the user (audit rows of a workspace keep the event with an anonymised actor).
- Enrichment stores the title, a summary, and at most a 2,000-character excerpt, never the full page. Smaller, and avoids keeping copyrighted content.

### Sync conflicts

Notes are longer than tasks, so last-write-wins losing an edit hurts more.

- Every text edit appends a `note_revision` row with the previous text. Append-only rows can't conflict.
- On pull, if a remote note wins over a local unsynced edit with different text, the local text is saved as a revision marked `conflict`, and the row shows a small chip until you open its history (`y`). Nothing is silently lost.
- Reviews, links, and revisions are separate rows, never arrays on the note, for the same reason.

### Export and portability

- **Markdown** per topic: question, notes grouped by type, links, review history, latest brief. Front matter carries ids so a re-import is possible later.
- **JSON** full export of everything the user owns, matching the wire format. No lock-in is a procurement requirement, not a nice-to-have.
- Both run through the DLP filter and respect sensitivity and policy.
- Read-only **MCP endpoint** (`list_topics`, `get_topic`, `search_notes`) on the server, OAuth via Better Auth's `mcp` plugin. Respects sensitivity: confidential topics are never served.

### Reliability

- **Enrichment queue** persisted in SQLite (`jobs` table: kind, note id, attempts, next run). Survives restarts, retries with backoff, gives up after 5 attempts, and the row shows "not enriched".
- Fetching runs on the desktop with the system proxy, a 10s timeout, a size cap, and an allow/deny list from policy. The server never fetches user URLs (no SSRF surface).
- All AI-dependent paths degrade: no key or policy says no means the feature's keys stand down and their chips drop out of the statusline, exactly like `aiEnabled` today.

### Quality

- **Rust unit tests:** revisit scheduler (pure function), sensitivity gate (every AI/fetch/export path refuses confidential), note repository, conflict-to-revision merge.
- **Server integration tests:** workspace RLS (member reads, non-member gets nothing, viewer can't write), audit insert-only.
- **Mock parity** in `src/lib/api.ts` for every new command, with seeded topics, notes across all types, due reviews, and one conflict revision, so `pnpm desktop` shows every state.
- **Performance budgets:** Ideas page with 5,000 notes renders under 100 ms (virtualized list), FTS search under 50 ms, related-notes lookup under 30 ms.
- **Accessibility:** every chip has an accessible label, conviction never relies on color alone, reduced-motion respected.
- **Telemetry:** opt-in error reporting only, no content, consistent with the cross-cutting item in `roadmap.md`.

## Data model

### Desktop (SQLCipher), new migrations

```sql
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  question TEXT,
  status TEXT NOT NULL DEFAULT 'exploring',      -- exploring | pursuing | parked | dropped
  sensitivity TEXT NOT NULL DEFAULT 'personal',  -- personal | internal | confidential
  workspace_id TEXT,                              -- null = personal
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  note_type TEXT NOT NULL,          -- idea | thought | source | brief
  text TEXT NOT NULL,
  raw_text TEXT NOT NULL,           -- frozen at capture
  title TEXT,
  summary TEXT,
  excerpt TEXT,                     -- sources, max 2000 chars
  link TEXT,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | promoted | dropped
  revisit_at TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  improved INTEGER NOT NULL DEFAULT 0,
  enrichment TEXT NOT NULL DEFAULT 'none',  -- none | pending | done | failed
  embedding BLOB,
  app_id TEXT, app_name TEXT, window_title TEXT, captured_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE notes_fts USING fts5(text, title, summary, content='notes');

CREATE TABLE note_reviews   (id, note_id, conviction, comment, reviewed_at, author_id);
CREATE TABLE note_links     (id, from_note_id, to_note_id, relation, created_at);
CREATE TABLE note_revisions (id, note_id, text, reason, created_at);   -- reason: edit | conflict
CREATE TABLE jobs           (id, kind, note_id, attempts, next_run_at, last_error);
CREATE TABLE egress_events  (id, kind, note_id, provider, tokens, bytes, created_at);

ALTER TABLE tasks ADD COLUMN origin_note_id TEXT;
```

`embedding`, `jobs`, and `egress_events` stay local and don't sync (device-specific or recomputable). Verify FTS5 is compiled into the bundled SQLCipher before relying on it; fall back to `LIKE` search if not.

### Sync

New `RecordBody` variants in `core/wire.rs`: `Topic`, `Note`, `NoteReview`, `NoteLink`, `NoteRevision`, routed in the `sync_service.rs` merge. Server stores them as-is. Older app versions are out of scope.

`@blink/contract` gains `zNoteBody` (for `/v1/capture`) and `zTopicBody` (for topic matching), mirroring the Rust structs like `zTaskBody`.

## Implementation map

Everything is built inside the existing structure and conventions (root `CLAUDE.md`, `apps/desktop/CLAUDE.md`, `apps/server/CLAUDE.md`). No new top-level folders, no new packages, no new architectural patterns. Where the plan says "like X", copy X's shape.

### Rules this feature follows

- **Rust layering:** `commands/` are thin and only call services. `services/` hold logic, never import `tauri`, and reach the DB only through a `*Repository`. `clients/` are thin transport returning `reqwest::Result<Response>`. `platform/` is the only layer touching the runtime (windows, notifications, clipboard, background jobs). `core/` holds shared types.
- **DI by field name:** a service holds its dependencies as fields named after the type (`note_repository: NoteRepository`, `policy_service: PolicyService`). Built in `lib.rs` (the composition root, DB-backed ones in `setup`) and `.manage()`d.
- **One file per service/client/repository**, named after it. `mod.rs` stays a thin index.
- **Types cross boundaries from one source:** Rust structs in `core/models.rs` generate `src/generated/*.ts` via `gen:types` (never hand-edited). Wire shapes live in `@blink/contract` as zod.
- **Rust owns all server communication.** The webview never calls the server.
- **Webview:** every command gets a method in `lib/api.ts` **plus a mock case** with honest behavior. Keys only through `SHORTCUTS` + `useShortcut`. Overlays are in-row `Popover`s. Stateful logic in `hooks/`, pure helpers in `lib/`, presentational pieces in a `components/<feature>/` folder, with a thin orchestrator component.
- **Server:** route folder with `latest.ts` -> common service -> model service -> Drizzle. Request-scoped services registered in `requestCradle.ts` and typed in `types.ts`. Errors via `ApiError` + `errorCodes.ts`. Every new server-read table needs a hand-written `GRANT` migration in `@blink/db`.
- **Style:** named exports, no barrel files, no `any`, no `!`, comments only for the why, Biome formatting.
- **Docs move with the code:** each phase updates the matching `CLAUDE.md` (architecture notes, migration list, command list) and the README roadmap.

### Desktop Rust core (`apps/desktop/src-tauri/src`)

| Layer | New / changed file | Modeled on |
|---|---|---|
| `core/models.rs` | `Note`, `NewNote`, `NoteType`, `NoteStatus`, `Topic`, `NewTopic`, `TopicStatus`, `Sensitivity`, `NoteReview`, `NewNoteReview`, `NoteLink`, `NoteRelation`, `NoteRevision`, `EgressEvent`, `ExportFormat`; enums get `as_str` / `from_stored` like `TaskEffort` | `Task`, `TaskGroup`, `TaskEffort` |
| `core/wire.rs` | `RecordBody::{Topic, Note, NoteReview, NoteLink, NoteRevision}` + their `*Body` structs (snake_case, `#[serde(default)]` on later-added fields) | `TaskBody`, `GroupBody` |
| `core/error.rs` | `AppError::Policy(String)` (blocked by sensitivity or org policy), `AppError::Fetch(String)` | existing variants |
| `repository/migrations.rs` | Next migrations: `topics`, `notes` (+ FTS5 table and triggers), `note_reviews`, `note_links`, `note_revisions`, `jobs`, `egress_events`, `tasks.origin_note_id`. One concern per migration, appended after the current last one | migration 6 (`task_groups`) |
| `repository/` | `topic_repository.rs`, `note_repository.rs`, `note_review_repository.rs`, `note_link_repository.rs`, `note_revision_repository.rs`, `job_repository.rs`, `egress_repository.rs`, each with a flat `*Row` + `From` impls, `merge(id, clock, body)` for synced ones, and `record_change` for HLC stamping; new fields on the `Repository` facade | `task_repository.rs`, `task_group_repository.rs` |
| `services/` | `topic_service.rs`, `note_service.rs` (CRUD, revisions on edit, promote), `review_service.rs` (scheduler as a pure function + due queue), `enrichment_service.rs` (fetch, DLP, summarize, embed), `policy_service.rs` (sensitivity + org policy gate), `export_service.rs`, `egress_service.rs` | `task_service.rs`, `task_group_service.rs` |
| `services/ai_service.rs` | New methods `summarize`, `embed`, `brief`, all built on the existing private `complete`; each takes the note's sensitivity and asks `policy_service` first | `improve`, `generate_prompt` |
| `services/sync_service.rs` | New arms in `push` packet building and the `pull` merge `match`, calling each repository's `merge` | `Task` / `Group` arms |
| `services/shortcut_service.rs` | Setting key + default for the idea hotkey | `copy_capture_shortcut` |
| `clients/` | `web_client.rs` (page fetch with timeout + size cap, system proxy); `openai_client.rs` gains an embeddings call | `openai_client.rs` |
| `commands/` | `notes.rs`, `topics.rs`, `reviews.rs`, `export.rs`, `idea_capture.rs`; each command registered in `lib.rs` `invoke_handler`; `commands/mod.rs` index updated | `tasks.rs`, `task_groups.rs`, `manual_capture.rs` |
| `platform/shortcut.rs` | `CaptureMethod::Idea` added to the enum, `ALL`, `start`, `setting_key`, default | `CaptureMethod::Manual` |
| `platform/jobs/` | `enrichment.rs` (drains the `jobs` table with backoff), `review_digest.rs` (weekly notification, quiet hours) | `jobs/sync.rs`, `jobs/attention.rs` (`should_notify` + `notify`) |
| `lib.rs` | Build and `.manage()` the new repositories/services in `setup`, start the new jobs, register commands | existing wiring |
| `tauri.conf.json` + `capabilities/default.json` | `idea-capture` window + capability entry | `manual-capture` window |

Sync ordering note: pull applies records in `seq` order, which the current code relies on for "group before its tasks". Notes can reference a topic created later on another device, so the note merge must tolerate a missing `topic_id` the same way the task merge treats a missing group (check and mirror that behavior; don't add a hard FK failure path).

### Webview (`apps/desktop/src`)

| Area | New / changed file | Modeled on |
|---|---|---|
| Entry | `main.tsx` routes the `idea-capture` window label to `IdeaCapture` | `ManualCapture` routing |
| Capture | `components/IdeaCapture.tsx` (thin `CaptureKind` config); `CapturePanel.tsx` gains the type chips, `⌘T`, topic picker under `⌘G`, post-save line | `ManualCapture.tsx`, existing group picker |
| Page | `components/IdeasPage.tsx` (thin orchestrator: cursor, filter, overlays); `PageNav.tsx` adds `'ideas'` to `Page` + `TABS` + badge; `Inbox.tsx` renders it | `TaskList.tsx`, `WorktreesPage.tsx` |
| Pieces | `components/ideas/`: `TopicFilterBar.tsx`, `TopicHeader.tsx`, `NoteSection.tsx`, `NoteRow.tsx`, `NoteEditor.tsx`, `ReviewPopover.tsx`, `LinkPopover.tsx`, `HistoryPopover.tsx`, `DeleteNotePopover.tsx`, `DeleteTopicPopover.tsx`, `TopicPrompt.tsx`, `ConvictionDots.tsx` | `components/tasks/*` |
| Hooks | `useNotes.ts`, `useTopics.ts`, `useNoteEditor.ts`, `useReviewSession.ts`, `useNoteSearch.ts`, `useDueCount.tsx` (provider for the nav badge) | `useTaskGroups.ts`, `useTaskEditor.ts`, `useArchive.ts`, `useWorktreeAttention.tsx` |
| Pure helpers | `lib/notes.ts` (section splitting, conviction trend; pure so it can be unit-tested) | `lib/completed.ts`, `lib/effort.ts` |
| Shortcuts | `lib/shortcuts/shortcuts.ts`: new `SHORTCUTS` rows (`note.*`, `topic.*`, `review.*`, `capture.type`), new `HINTS` keys (`t`, `w`, `u`, `y`, `mod+p`, `mod+t`), `mod+g` label `group` to `file`, new `CHEATSHEET` groups "Ideas" and "Review" | existing rows |
| Settings | `components/SettingsPage.tsx` gains an "Ideas" card (idea hotkey via `ShortcutRecorder`, digest on/off, quiet hours) and an "Egress" card (what left this Mac) | `AiCard.tsx`, capture card |
| IPC | `lib/api.ts`: one method per new command + mock cases with seeded topics, all note types, due reviews, a conflict revision, a failed enrichment | existing task/group mock |

### Server (`apps/server/src`)

| Area | New / changed file | Modeled on |
|---|---|---|
| Capture | `services/common/captureService.ts`: extract note type + topic (extractive, closed list of real topics), build a `NoteBody` when the note says "idea" / "thought" / "source"; skip parsing for confidential topics | current task + group extraction |
| Model | `services/model/recordsModelService.ts`: `listByKind(userId, 'topic')` already fits; workspace-scoped reads added in Phase 5 | existing methods |
| Teams (Phase 5) | `routes/workspaces/latest.ts`, `routes/topics/share/latest.ts`; `services/common/workspaceService.ts`, `services/common/shareService.ts`, `services/common/auditService.ts`; `services/model/workspacesModelService.ts`, `services/model/auditEventsModelService.ts`; cradle registrations in `requestCradle.ts` + `types.ts`; new codes in `utils/errors/errorCodes.ts` | `routes/capture`, `captureService`, `recordsModelService` |
| MCP (Phase 6) | `routes/mcp/latest.ts` + `services/common/mcpService.ts`, Better Auth `mcp` plugin in `clients/authClient.ts` | `routes/auth/latest.ts` |
| AI proxy (Phase 5) | `routes/ai/latest.ts` + reuse `clients/openaiClient.ts` (retries, breaker, no-content logs already there) | `openaiClient.ts` |
| OpenAPI | `pnpm --filter @blink/server openapi:gen` after every route change | existing |

### Shared packages

| Package | Change | Modeled on |
|---|---|---|
| `@blink/contract` (`src/wire.ts`) | `zNoteType`, `zNoteBody`, `zTopicBody`, `zSensitivity`; later `zShareInput`, `zPolicyBody` | `zTaskBody`, `zCaptureInput` |
| `@blink/db` (`src/schema.ts` + `migrations/`) | Phase 5: `records.workspace_id`, `workspaces`, `workspace_members`, `audit_events`; Drizzle-generated SQL plus hand-written `0009_workspace_rls.sql` (policy: owner or member with role) and `0010_audit_grants.sql` (`INSERT, SELECT` only on `audit_events` for `blink_api`) | `0006_records_rls_policies.sql`, `0008_plaintext_records.sql` |

Phases 1-4 need **no server schema change**: new kinds ride the loose `records.body`.

### Definition of done for every change

1. Rust model changed: `gen:types` run, `src/generated/` updated, no hand edits.
2. New command: registered in `lib.rs`, method + mock case in `lib/api.ts`, arg keys match Rust param names.
3. New key: `SHORTCUTS` row with `level`, `order`, `describe`, a `HINTS` entry (one label per physical key), and a `CHEATSHEET` slot. The dev check passes.
4. New table: migration appended, repository + service in front of it, `CLAUDE.md` migration list updated.
5. New synced kind: `RecordBody` variant, push + pull arms, contract schema if the server reads it.
6. New server route: route folder + `latest.ts`, cradle registration, error codes, `openapi:gen`, grant migration if it reads a new table.
7. Anything that calls AI, fetches, exports, or shares: goes through `PolicyService`, writes an egress or audit event, and has a test proving confidential is refused.
8. `cargo check`, `pnpm typecheck`, `pnpm lint` clean; `pnpm desktop` mock shows the new states.

## Phases

| # | Phase | Contents | Size |
|---|---|---|---|
| 1 | Foundation | Models, migrations, sync kinds, `⌘⇧I` + type switch, Ideas page, topics with sensitivity, search, revisions, Markdown/JSON export, `PolicyService` gate (sensitivity only), tests, mock parity | Large |
| 2 | Review ritual | Due queue, review popover + sessions, scheduler, triage, promote, page badge, weekly digest | Medium |
| 3 | Evidence | Note links, source enrichment queue, AI summaries, egress log, remote capture of note types | Medium |
| 4 | Synthesis | Topic briefs, embeddings + related notes | Medium |
| 5 | Teams | Workspace sharing, roles, team conviction, admin policy record, audit log, org AI proxy | Large, needs roadmap Phase 3 |
| 6 | Integrations | MCP endpoint, local AI provider, import (Markdown, browser bookmarks) | Medium |

Build 1, use it for two weeks, then build 2, so the first reviews come due right when the review flow lands.

## Open decisions

- **Name:** "Ideas" (plan) vs "Vault" vs "Research".
- **Idea hotkey:** `⌘⇧I` proposed. Check it against common app shortcuts on your machine (Safari uses it for "Email this page").
- **Scheduler numbers:** the table above is a starting point; tune after a month.
- **Team conviction display:** median + spread proposed; could also show each member's dots for small teams.
- **Embedding provider:** OpenAI now; local later.
- **Confidential + server replica:** confidential notes still sync to the readable server replica (only processing is blocked). If an enterprise needs the server unable to read them, that brings back field-level encryption for confidential topics only. Decide when the first customer asks.

## Risks

- **Capture friction.** Track: at least 5 notes a week in month one. If not, the hotkey or panel is wrong, not the user.
- **Review fatigue.** The 10-note cap and the scheduler exist for this; watch for sessions abandoned halfway.
- **Policy enforcement only in the UI** would be a security bug. Every gate lives in `PolicyService` in Rust, with tests per path.
- **Enrichment** hits paywalls, JS-only pages, and bot blocks. Best-effort, never required.
- **Scope creep toward Notion.** No rich text, no nested pages, no databases. Plain text, types, topics, links, time.
