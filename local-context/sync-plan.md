# Blink — Encrypted Sync Plan

Zero-knowledge, local-first sync of the desktop SQLite DB to the self-hosted server.
Local SQLite stays the source of truth; a thin background loop in Rust pushes/pulls
encrypted blobs. No CRDT library, no sync framework — reuse the HLC + LWW that already
exist server-side.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Encryption | 1Password-style **2SKD**: device **Secret Key** + **master password** → KEK → wraps a random **VMK** → VMK encrypts every record |
| Sync scope | **Everything** — tasks, task groups, settings (whole-app restore) |
| Server storage | One **generic `records` table**: opaque ciphertext + `owner_id` + HLC + `seq`. Typed `tasks` table is dropped. Plus a per-user `sync_keysets` row for the wrapped VMK |
| Record shape on server | Whole local row serialized (serde → JSON) and encrypted into one blob; `kind` lives *inside* the cipher |
| Conflict resolution | **HLC tuple** last-write-wins (already implemented server-side) |
| Pull cursor | **Server-assigned `seq`** (bigserial), NOT the client HLC — immune to device clock skew |
| Crypto crates | `aes-gcm` + `pbkdf2` (approved). HKDF combine step hand-built from the `hmac`/`sha2` that `pbkdf2` already pulls in — **no extra dep** |
| Secret Key rotation | Fixed across password changes; password change only **re-wraps the VMK** (no data re-encryption) |
| Sync timing | Local write commits instantly + marks dirty; **push debounced ~1–2s**; **pull poll ~15–30s** + on startup + on network reconnect. Realtime (SSE/WS) is a later optimization |
| Deletes | **Tombstones** — a delete is an HLC-bumped row flagged `deleted`; LWW carries it, server keeps the row |
| UI | Keyboard-only, `⌘↵` to confirm (per app conventions); two-step setup |

## Current state (what already exists)

**Server side is essentially built** — despite "Phase 2" wording in the docs:

- `/v1/sync/push` + `/v1/sync/pull` routes registered and working.
- LWW already implemented in `tasksModelService.upsertMany` via
  `onConflictDoUpdate({ setWhere: (hlc_physical, hlc_counter, hlc_node_id) < (incoming) })`,
  RLS-scoped through `withUser`.
- Postgres `tasks` schema has cipher + HLC columns; `@blink/contract` `zSyncPacket` + the
  `@blink/crypto` AES-GCM/PBKDF2 envelope helpers exist.

**Gap = the desktop → sync bridge, all in Rust:**

- `server_client.rs` has auth methods only — no push/pull.
- Local SQLite has **no** HLC columns, no dirty tracking, no cipher — its `tasks` table models
  desktop capture metadata (`text`, `app_id`, `window_title`, `captured_at`, `link`,
  `position`, `task_group_id`, `raw_text`, …), a different shape from the server.
- Nothing generates an HLC, encrypts, or calls the endpoints. Only `SessionTokenService` is
  pre-wired (token in keychain, ready for the sync loop).

## Key hierarchy (2SKD, mirrors 1Password)

```
Secret Key (device-random 128-bit, shown once, saved by user, NEVER sent) ─┐
                                                                            ├─ 2SKD ─► KEK ─wraps─► VMK ─encrypts─► every record blob
master password ── PBKDF2(per-account salt) ─► k_pw ────────────────────────┘        (random 256-bit data key)
```

- **KEK** = derive from master password (PBKDF2 over a per-account salt) combined with the
  Secret Key (HKDF-style expand, built from `hmac`/`sha2`).
- **VMK** (Vault Master Key) is a random data key that the KEK *wraps*. The **wrapped VMK +
  salt live on the server** (`sync_keysets`), opaque. This is what makes "restore on a new
  device with just Secret Key + master password" work, and lets a password change **re-wrap the
  VMK** instead of re-encrypting all records.
- Records are encrypted **directly with the VMK** (fresh random IV each) → per-record envelope
  is just `{ ciphertext, iv }`. Only the keyset-wrap envelope carries KDF params (salt,
  iterations).
- **Correctness of decryption is free** via AES-GCM's auth tag: a wrong VMK (wrong Secret
  Key/password) or tampered blob makes decryption *fail* rather than return garbage. This also
  validates credentials on a new device: unwrap VMK, try decrypting one record; tag failure =
  wrong Secret Key/password.

## Server row shape

```
records
  id           uuid        -- plaintext, SAME id as local, stable across devices; LWW conflict target
  owner_id     uuid        -- plaintext, authenticated user; RLS scope. Leaks nothing about content
  cipher       jsonb       -- { ciphertext, iv } — the entire local row, opaque. `kind` is inside
  hlc_physical bigint      -- plaintext, edit-time clock, for LWW
  hlc_counter  int
  hlc_node_id  text
  seq          bigserial   -- server-assigned monotonic, for the pull cursor
  updated_at   timestamptz

sync_keysets                -- one row per user, opaque to the server
  owner_id       uuid
  wrapped_vmk    jsonb      -- VMK encrypted under KEK
  kdf_salt       text
  kdf_iterations int
  created_at     timestamptz
```

### Why these columns

- **HLC (`hlc_physical`/`counter`/`node_id`)** — a Hybrid Logical Clock stamped by the editing
  device; decides *which version wins* on conflict. `physical` = monotonic wall-clock ms;
  `counter` = same-ms tiebreaker; `node_id` = per-device final tiebreaker. Winner =
  lexicographic compare of the tuple. Needed instead of a plain timestamp because device clocks
  drift/run backwards.
- **`seq`** — server-assigned arrival counter; decides *what to download* (`where seq > last_seq`).
  Immune to client clock skew, so no update is ever skipped. Can't use HLC for the cursor (a
  lagging device can write a lower `physical` than one already pulled → skipped forever). Can't
  use `seq` for conflicts (arrival order ≠ edit order).

|                     | HLC tuple            | `seq`                 |
| ------------------- | -------------------- | --------------------- |
| Assigned by         | editing device       | server                |
| Reflects            | edit time / causality| server arrival order  |
| Used for            | which version wins   | what to download      |

## "How does the user get the correct data?"

1. **Server side** — every record carries `owner_id` = user id from the bearer token; RLS
   (`withUser` → `app.current_user_id`) scopes every query. Pull can only return that user's
   rows.
2. **Client side** — record `id` is plaintext and identical local↔server, so pull matches
   server `id` → local `id`. After decrypting with the VMK, read `kind` from the plaintext and
   route the row into the correct local table. GCM auth tag guarantees the bytes are authentic
   and the key is right.

## Build order

### Phase 1 — server + db + contract (isolated, testable, no Rust)

- `@blink/db`: drop typed `tasks`; add generic `records` (with `seq bigserial`) and
  `sync_keysets`. Drizzle migration **plus** hand-written RLS policy + `blink_api` GRANT
  migrations for both tables (Drizzle can't express roles/grants/policies).
- `@blink/contract`: `SyncPacket` record cipher becomes `{ ciphertext, iv }`; add keyset
  get/put schemas; pull cursor becomes `since_seq`.
- `apps/server`: rename/ retarget `tasksModelService` → `recordsModelService` against the new
  table; LWW logic unchanged; pull switches to `where seq > since_seq`; add keyset get/put
  endpoints.

### Phase 2 — desktop local schema + HLC

- Local migration: add `hlc_physical/counter/node_id`, a `dirty` flag, and a `deleted`
  tombstone flag to every synced table (`tasks`, `task_groups`, `settings`). Give `settings`
  rows a stable id to LWW on. Add `node_id` + `last_pulled_seq` to local state.
- Hand-rolled HLC in Rust; tick + mark dirty on every mutation in the repositories.

### Phase 3 — desktop crypto + sync client

- Rust crypto (aes-gcm + pbkdf2 + hand-built HKDF):
  - `generate_secret_key()` (random, formatted `A3-XXXXXX-…`), `generate_vmk()`
  - `derive_kek(master_password, secret_key, salt, iters)` (2SKD)
  - `wrap_vmk` / `unwrap_vmk` (AES-GCM under raw KEK)
  - `encrypt_record` / `decrypt_record` (AES-GCM under raw VMK)
  - Envelope format matches `@blink/crypto` byte-for-byte; unit-test against a TS-produced vector.
- Keychain (`app.blink.desktop`) gains `sync-secret-key` and cached `sync-vmk`. The master
  password is never stored.
- `server_client.rs`: `push_records`, `pull_records`, `get_keyset`, `put_keyset`.
- `sync_service.rs`: serialize dirty rows → encrypt → push → clear dirty; pull `since_seq` →
  decrypt → HLC-merge (incl. tombstones) → advance `last_pulled_seq`.

### Phase 4 — loop + passphrase UI

- Background loop: debounced push (~1–2s), poll pull (~15–30s) + startup + reconnect.
- Setup — two keyboard-only steps, `⌘↵` to advance each:
  1. **Generate & reveal the Secret Key**, with a "You saved your Secret Key" acknowledgement
     gate (can't proceed until confirmed; shown once).
  2. **Set the master password.**
- New-device sign-in prompts for **Secret Key + master password** → derive KEK → pull wrapped
  VMK → unwrap → cache VMK → full restore.

## Open / deferred

- Realtime transport (SSE from Fastify or WebSocket) — after v1 polling works.
- Password-change flow (re-wrap VMK) and Secret-Key display/recovery UX — Phase 4+.
- Org/multi-user sharing — out of scope; current model is single-user, multi-device.
