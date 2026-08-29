# 🔮 Blink

**Local-first task capture for macOS — from any highlighted text to a clean task in one keystroke.**

Blink turns whatever you just highlighted — a Slack message, a code comment, an email — into a
task without leaving the app you're in. Press `⌘⇧B`: the Rust core records where you were,
lifts the selection, redacts secrets on-device, and drops you into a small review panel to
polish (optionally with AI) and save. Everything lands in a locally encrypted database;
nothing leaves your machine unless you opt in.

It's also a deliberately over-engineered playground for patterns I care about: strict type-safe
boundaries across three languages, a security model designed before the sync feature that needs
it, and a keyboard-only UI with zero buttons.

## Highlights

- **One-keystroke capture** — `⌘⇧B` captures the current selection: the Rust core detects the
  frontmost app and window title (and the page URL in browsers), snapshots your clipboard,
  simulates `⌘C`, polls until the selection lands, then **restores your clipboard** — capture
  never clobbers what you had copied. `⌘⇧M` opens a blank panel for manual capture.
- **On-device DLP** — a security filter redacts API keys, passwords, and private keys *before*
  the text is even rendered, so secrets never reach the database or any AI call.
- **Encrypted at rest** — SQLite via **SQLCipher** (AES-256); the key lives in the macOS
  keychain, never on disk.
- **Keyboard-first, no buttons — literally** — every action in the app is a shortcut, surfaced
  through inline hints: navigate with `↑↓`/`jk`, `⏎` complete, `e` edit, `o` open link,
  `⌘I` improve with AI, `⌘↵` confirms every commit. The mouse is optional everywhere.
- **AI cleanup, human in the loop** — `⌘I` turns a rough capture into a single crisp action
  item (OpenAI); the raw text is reviewed and editable before anything is saved.
- **Type-safe across every boundary** — Rust structs generate the TypeScript IPC types via
  `ts-rs` (no hand-maintained duplicates), and a shared `zod` contract package defines the
  client↔server wire format, with an OpenAPI doc generated from the server's routes.
- **Security-conscious sync design** — the self-hosted server (Fastify + Better Auth +
  Postgres 17) never trusts itself: it connects as a least-privilege role and Row-Level
  Security scopes every query to the requesting user. Task payloads are stored as ciphertext
  columns, ready for the zero-knowledge E2EE sync tier (Phase 2).

## How a capture flows

```
[Highlight text] → ⌘⇧B
   → Rust core records the frontmost app/window (+ browser URL),
     snapshots the clipboard, simulates ⌘C, restores the clipboard after
   → on-device DLP filter redacts secrets
   → review panel: edit · ⌘I improve with AI · ⌘G pick group · ⌘↵ save
   → SQLCipher store (AES-256, key in the macOS keychain)
   → (Phase 2) HLC/LWW sync → E2EE envelopes → self-hosted Postgres
```

## Architecture

| Layer | Tech | Where |
| --- | --- | --- |
| Desktop app | Tauri v2 (Rust core) + React 19 + Vite + Tailwind v4 + shadcn/ui | `apps/desktop` |
| Local store | SQLite via SQLCipher (AES-256), key in the OS keychain | `apps/desktop/src-tauri/src/repository` |
| Sync/auth server | Fastify 5 + zod 4 + awilix DI + Better Auth (email OTP via Resend) | `apps/server` |
| Database | Postgres 17, Drizzle ORM, hand-written RLS/role migrations | `packages/db` |
| Wire contract | zod schemas, single source of truth client↔server (+ OpenAPI) | `packages/contract` |
| E2EE primitives | AES-GCM + PBKDF2 envelope helpers (Phase 2 seam) | `packages/crypto` |
| Sync engine | Hybrid logical clocks + LWW stubs (Phase 2 seam) | `packages/sync` |

Three boundaries hold the design together:

- **Rust → TypeScript**: `ts-rs` derives on the Rust models generate the webview's IPC types.
  Change the struct, regenerate — the frontend can't drift from the core.
- **Client ↔ server**: `@blink/contract` zod schemas are the wire format; the server also
  emits `openapi.json` from its routes.
- **Rust owns all server communication.** The webview only ever talks to the Rust core over
  Tauri IPC; the bearer token (and later the E2EE keys) live in the native layer and the OS
  keychain, never in the JS heap.

The server side is defense-in-depth: migrations run as the schema owner, but the API connects
as a separate `blink_api` role that can't touch anything it wasn't explicitly granted, and RLS
policies bind every row to `app.current_user_id` set per request. Even a fully compromised API
process can't read another user's rows — and since payloads are ciphertext columns, Phase 2's
zero-knowledge sync means the operator stores nothing readable at all.

## Getting started

```bash
pnpm install

# Webview only (browser, in-memory mock of the Rust core — no Rust toolchain needed):
pnpm desktop

# Full desktop app (requires Rust — https://rustup.rs; first build compiles SQLCipher):
pnpm tauri dev
```

`pnpm typecheck` type-checks the whole graph, `pnpm lint` / `pnpm format` run Biome.

### Self-hosted server (auth today, sync in Phase 2)

```bash
docker compose up   # Postgres + migrations (as the owner role) + the API (as blink_api)
# port clash with a local Postgres? → POSTGRES_PORT=5433 docker compose up
```

The API listens on `:8787` — health check, Better Auth under `/v1/auth`, and the sync
endpoints. Point the desktop core at it with `BLINK_SERVER_URL`
(`apps/desktop/src-tauri/.env`). AI features (`⌘I`) are enabled by pasting your own
OpenAI key into the app's AI settings — it's tested, then stored in the OS keychain,
never in a file. See `.env.example` for the server/Postgres variables.

Schema changes go through Drizzle (`pnpm --filter @blink/db db:generate` / `db:migrate`);
roles, grants, and RLS policies live in hand-written SQL migrations alongside, because an ORM
can't express them. `pnpm --filter @blink/server openapi:gen` regenerates the OpenAPI doc.

## Repository layout

```
blink/
├── apps/
│   ├── desktop/            # Tauri app
│   │   ├── src/            #   React webview: capture panels + keyboard-driven inbox
│   │   │   └── generated/  #   ts-rs output — generated from the Rust models, never edited
│   │   └── src-tauri/src/  #   Rust core, layered:
│   │       ├── commands/   #     thin #[tauri::command] IPC endpoints
│   │       ├── services/   #     business logic (DI structs; never import tauri)
│   │       ├── clients/    #     transport: sync server, OpenAI
│   │       ├── repository/ #     SQLCipher persistence + migrations
│   │       └── platform/   #     OS glue: frontmost-app detection, ⌘C simulation, hotkeys
│   └── server/             # Fastify API: routes → services (awilix DI) → Drizzle
├── packages/
│   ├── contract/           # zod wire schemas — client↔server single source of truth
│   ├── db/                 # Drizzle schema + RLS/role migrations + withUser() client
│   ├── crypto/             # E2EE envelope primitives (Phase 2)
│   ├── sync/               # HLC/LWW sync engine stubs (Phase 2)
│   ├── ai/                 # title heuristics
│   └── core/               # shared brand/theme tokens
└── docker-compose.yml      # Postgres + migrate + API for local self-hosting
```

Monorepo: pnpm workspaces + Turborepo, Biome for lint/format, TypeScript 7.

## Roadmap

1. **Phase 1 — Local-first MVP** *(current)*: capture (`⌘⇧B`/`⌘⇧M`), DLP filter, encrypted
   local store, AI improve, keyboard-driven inbox with groups and archive, account
   sign-in/verification against the self-hosted server.
2. **Phase 2 — Zero-knowledge sync**: multi-device sync over the existing server; E2EE
   envelopes client-side, HLC/LWW conflict resolution (seams already in `packages/crypto`
   and `packages/sync`).
3. **Phase 3 — Teams**: workspaces, roles, SSO.
4. **Phase 4 — On-premise / VPC**: the full stack as a private-network deployment.
