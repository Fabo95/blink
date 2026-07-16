# 🔮 Blink

**Enterprise-Ready Local-First Task Ingestion System.**

Blink turns any highlighted text — a Slack message, a code comment, an email —
into a task in one keystroke. It is _local-first_: snippets are sanitized and
stored **on your machine** by a Rust core, and only explicitly-exported,
DLP-cleaned tickets ever leave the device. When teams opt into sync, data is
end-to-end encrypted client-side so even the operator only stores ciphertext.

> This repository is the **Phase-1 MVP skeleton** — runnable, with the seams for
> later phases (E2EE sync, ONNX local AI, SSO, VPC deploy) already in place as
> typed stubs.

## Architecture

| Layer            | Tech                          | Package                    |
| ---------------- | ----------------------------- | -------------------------- |
| Client App Core  | Tauri (Rust) + React/TS       | `apps/desktop`             |
| Local Database   | SQLite via SQLCipher (AES-256)| `src-tauri/src/store.rs` · in-memory stub for now |
| Local AI Engine  | ONNX Runtime / local LLM      | `packages/ai`              |
| Zero-Knowledge E2EE | PBKDF2 + AES-GCM (WebCrypto)| `packages/crypto`          |
| Cloud Sync       | CRDT → Postgres (Supabase)    | `packages/sync`, `supabase/` |
| Shared model     | Types, theme, DLP patterns    | `packages/core`            |

### Capture data flow

```
[Highlight text] → ⌘⇧B
   → Tauri/Rust client reads clipboard + window metadata
   → Local security filter redacts secrets (API keys, passwords, private keys)
       ├─ Option A: local ONNX model  → title + context   (offline, private)
       └─ Option B: E2EE cloud proxy  → title + context   (over Enterprise VPN)
   → SQLCipher local store (AES-256)
   → CRDT sync engine → E2EE packets → Cloud-Postgres   (Phase 2)
   → Export button → decrypt locally → push to Linear/Jira   (Phase 1)
```

## Getting started

```bash
pnpm install

# Frontend only (browser, uses an in-memory mock of the Rust core):
pnpm desktop

# Full desktop app (requires the Rust toolchain — https://rustup.rs):
pnpm tauri dev
```

Type-check everything: `pnpm typecheck` · Build: `pnpm build`.

### Icons

The app icon set is generated from a source PNG:

```bash
node scripts/generate-icon.mjs                       # writes src-tauri/app-icon.png
pnpm --filter @blink/desktop tauri icon src-tauri/app-icon.png
```

## Repository layout

```
blink/
├── apps/desktop/          # Tauri app: React frontend + Rust core (src-tauri)
├── packages/
│   ├── core/              # shared types, brand theme tokens, DLP patterns
│   ├── ai/                # local-ONNX / cloud title generation (seam)
│   ├── crypto/            # zero-knowledge E2EE primitives
│   └── sync/              # CRDT sync engine + Supabase transport (seam)
├── supabase/migrations/   # Cloud-Postgres schema (RLS, ciphertext columns)
└── scripts/               # repo tooling
```

## Roadmap

1. **Phase 1 — Local-First MVP** _(this skeleton)_: Tauri client, local store,
   direct cloud-AI, direct Linear export.
2. **Phase 2 — Secure Sync & Cloud Bridge**: Postgres + multi-device sync,
   row-level E2EE.
3. **Phase 3 — B2B Teams & SSO**: workspaces, roles, Okta/Azure SSO, billing.
4. **Phase 4 — On-Premise / VPC**: full stack as Docker/Kubernetes in a private
   network.

---

_Confidential — for internal development use only. © 2026 Blink Inc._
