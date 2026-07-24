# Blink — Enterprise-Ready Roadmap

Maps the architecture spec's 4 phases onto concrete TODOs, anchored to what's already in
the repo. Legend: ✅ done · 🟡 building block exists, not wired · ❌ not started.

## Where we are today

Phase 1 is ~80% there. The capture → sanitize → AI → inbox loop works end-to-end. The two
real gaps in Phase 1 are **persistence** (still in-memory) and **Linear export**. Phase 2
has all its building blocks written but none of them wired into the app.

| Capability | State | Location |
| --- | --- | --- |
| Tauri client, ⌘⇧B capture, clipboard + system metadata | ✅ | `src-tauri/src/lib.rs`, `commands/capture.rs` |
| Local DLP security filter (regex redaction) | ✅ | `src-tauri/src/security.rs` |
| Quick-capture panel + inbox UI | ✅ | `src/components/QuickCapture.tsx`, `App.tsx` |
| Cloud AI title/cleanup (OpenAI) | ✅ | `commands/ai.rs` |
| Local task persistence (SQLite/SQLCipher) | ❌ in-memory only | `store/memory.rs` (TODO marker) |
| Linear OAuth export | ❌ | — |
| Local/offline AI (ONNX) | ❌ | — |
| Sync server (Fastify + RLS + Drizzle) | ✅ standalone | `apps/server` |
| E2EE envelope helpers | 🟡 not wired | `packages/crypto/e2ee.ts` |
| Sync client (push/pull) | 🟡 not wired, no CRDT | `packages/sync/sync.ts` |
| Team/SSO/billing | ❌ | — |
| VPC / on-prem packaging | 🟡 docker-compose only | `docker-compose.yml` |

---

## Phase 1 — Local-First MVP (finish it)

Goal: a self-contained app that survives a restart and can push a task to Linear.

- [ ] **SQLCipher persistence.** Replace `MemoryTaskStore` with a `rusqlite` + `sqlcipher`
      store implementing the same `TaskStore` trait (the seam already exists — commands
      won't change). Key the DB from the OS keychain (macOS Keychain via `security-framework`
      / `keyring`). Add migrations for the `tasks` table.
- [ ] **DB key lifecycle.** First-run key generation, keychain storage, unlock on launch.
      Decide behaviour when the keychain entry is missing (re-key vs. locked state).
- [ ] **Linear export (OAuth direct in client).** OAuth PKCE flow in the client, token in the
      keychain, "Export to Linear" action on a task. Run the DLP filter again at export time
      (data diode) before the ticket leaves the local scope.
- [ ] **Task lifecycle in UI.** Status transitions (inbox → done/exported), delete is wired
      but surface edit + status in `TaskList`.
- [ ] **(Optional) Offline AI engine.** ONNX Runtime path behind the existing `suggestTitle`
      seam so Finance/Defense tenants can run with zero external calls. Config toggle:
      local vs. cloud proxy.

## Phase 2 — Secure Sync & Cloud Bridge

Goal: multi-device sync where the server never sees plaintext.

- [ ] **Wire E2EE into the write path.** Encrypt `title`/`body` with `encryptField` before a
      task leaves the device; store the `EncryptedEnvelope` in the sync packet. Derive the key
      from a user master-password (PBKDF2 is already implemented) — design the key-derivation
      UX and recovery story.
- [ ] **Wire the sync client.** Connect `pushPackets`/`pullPackets` to the local store: a sync
      loop that pushes local changes and applies remote ones. Persist the HLC watermark.
- [ ] **Conflict resolution → CRDT.** Spec calls for CRDT; today `packages/sync` only carries
      HLC types + LWW intent. Decide: keep LWW (simpler, per-field) or adopt a real CRDT
      (e.g. Automerge/Yjs) for offline-concurrent edits. Document the choice.
- [ ] **Realtime pull.** Replace poll-on-interval with a subscription (SSE/WebSocket) on the
      sync server.
- [ ] **Server hardening.** Real auth token issuance (currently a bearer mapped to an RLS
      session), token rotation, rate limiting, request-size limits, migration runner in
      deploy (not just the docker init-dir convenience).
- [ ] **Cloud backup/restore.** Bootstrap a fresh device from the server (encrypted) state.

## Phase 3 — B2B Teams & SSO

Goal: sellable to IT admins.

- [ ] **Workspaces & membership.** Team/org model in Postgres, RLS extended from per-user to
      per-workspace, invite flow.
- [ ] **Roles & permissions.** Admin/member roles; server-side authorization checks.
- [ ] **SSO.** SAML 2.0 + OIDC against Okta / Azure AD (Entra ID) / Google Workspace. Enforce
      2FA; immediate offboarding (revoke access on IdP removal).
- [ ] **Admin policies (data diodes).** Central config: which Linear workspaces/repos are
      authorized export targets; org-managed DLP regex rules applied before export.
- [ ] **Billing.** Per-org billing / seat management.
- [ ] **Audit log.** Who exported what, when — table-stakes for enterprise procurement.

## Phase 4 — On-Premise / VPC Deployment

Goal: DAX-Konzern can run the whole cloud tier inside their own network.

- [ ] **Container images + Helm/Compose.** Production Dockerfiles (server done), a Helm
      chart / hardened compose for Postgres + server + migrations.
- [ ] **Config via env only.** No baked-in secrets; document every var (extend `.env.example`).
- [ ] **Self-hosted IdP + backups.** Support customer-run SSO endpoints, Postgres backup/PITR
      guidance, TLS termination.
- [ ] **Ops docs.** Deploy runbook, upgrade/migration path, resource sizing.

---

## Cross-cutting (do alongside, not a phase)

- [ ] **Tests.** No test suite yet — add Rust unit tests (store, security filter, capture),
      server integration tests (RLS isolation, LWW), and crypto round-trip tests.
- [ ] **CI.** Lint + typecheck + build + test on push; `cargo test` also regenerates ts-rs
      types — gate on `src/generated` being in sync.
- [ ] **Error/telemetry.** Structured client-side error reporting (respecting local-first
      privacy — opt-in, no task content).
- [ ] **Auto-update + code signing** for the desktop app (notarization on macOS).
- [ ] **Threat model doc** for the E2EE + RLS claims before any enterprise security review.

## Suggested near-term order

1. SQLCipher persistence + keychain (unblocks everything; makes the app real).
2. Linear export with export-time DLP (completes the Phase 1 story from the spec's data flow).
3. Wire E2EE + sync client end-to-end for a single user across two devices.
4. Tests + CI in parallel from step 1 onward.
