# Better Auth integration plan (Blink sync tier)

Auth for the zero-knowledge sync tier, using [Better Auth](https://better-auth.com).
Goal: replace the stub in `apps/server` (`authService` currently trusts `token === userId`)
with real identity, without weakening zero-knowledge.

## Why Better Auth fits

- **Self-hosted** — its tables live in *our* Postgres (`@blink/db`); no external SaaS required.
- **Drizzle + Postgres adapter** — matches the stack the sync server already uses.
- **JWT plugin exposes a JWKS endpoint** — exactly what the existing `authService` TODO asked for
  ("verify a JWT against JWKS, read `sub`"). The sync routes stay a stateless resource server.
- **Bearer plugin** — the token-based flow native (Tauri) apps need, instead of browser cookies.
- **Org plugin** available later for the `organizations` table / Phase-3 multi-tenancy.

**Stays zero-knowledge:** Better Auth only handles *identity*. It never sees the E2EE key or task
plaintext. Auth token → identity → RLS scoping. The encryption passphrase is a separate, deferred
decision.

## Architecture

```
Desktop (Tauri)                     server (Fastify)
─────────────                       ─────────────────────
Better Auth client  ── sign in ──►  /v1/auth/*   ← Better Auth handler (mounted catch-all)
  → store token in keychain            │  user/session/account/jwks tables (Drizzle → Postgres)
  → authClient.token() → JWT           │  exposes /v1/auth/jwks
                                        │
send JWT as Bearer ─ sync push/pull ─► /v1/sync/*  ← verify JWT vs JWKS → sub = userId → RLS
```

The sync data (`tasks`) stays RLS-isolated and E2EE-encrypted; Better Auth's tables sit alongside it.

## Server side (`apps/server`)

1. **Configure Better Auth** (`auth.ts`):

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },        // start here; social later
  plugins: [bearer(), jwt()],                 // bearer = native token; jwt = JWKS for sync routes
  trustedOrigins: ['tauri://localhost', 'blink://'], // Tauri webview + deep-link scheme
  // advanced.database.generateId → return a UUID (see wrinkle #1)
});
```

2. **Mount the handler** — catch-all `/v1/auth/*` (GET + POST) that converts the Fastify request
   to a web `Request` (`fromNodeHeaders`), calls `auth.handler(req)`, forwards the response. (The
   pattern in Better Auth's Fastify guide.)

3. **Replace the stub `authService`** with JWKS verification (`jose`):

```ts
const JWKS = createRemoteJWKSet(new URL(`${SELF_URL}/v1/auth/jwks`));
async authenticate(authorization) {
  const jwt = authorization?.replace('Bearer ', '');
  const { payload } = await jwtVerify(jwt, JWKS, { issuer: SELF_URL, audience: SELF_URL });
  return { userId: payload.sub };   // → ownerId → RLS app.current_user_id
}
```

   Everything downstream (`SyncService`, `TasksModelService`, RLS `withUser`) already keys off
   `userId` and is unchanged.

4. **Generate Better Auth's tables** (`user`, `session`, `account`, `verification`, `jwks`, …) into
   the same Postgres via its CLI. Keep them separate from the app's Drizzle migrations, or fold in.

## Desktop side (`apps/desktop`)

- `createAuthClient` + `jwtClient()`.
- On sign-in, capture the `set-auth-token` header and **store it in the OS keychain** via a Tauri
  command (we already have keychain access for SQLCipher) — not localStorage.
- Per sync request: `authClient.token()` → **JWT** → pass as `@blink/sync`'s `SyncServer.token`.
- **Email/password**: no native gymnastics — start here.
- **Social (Google/GitHub)**: open the system browser, redirect back via a `blink://auth/callback`
  **deep link** (Tauri deep-link plugin). The one fiddly native bit — add *after* email/password.

## Wrinkles to decide up front

1. **ID type mismatch.** Better Auth user ids are generated strings; `ownerId` + the RLS cast are
   `uuid`. Fix by configuring Better Auth to generate UUIDs (`advanced.database.generateId`) — keeps
   the sync schema as-is. (Alternative: change `ownerId` / `app.current_user_id` to `text`.)
2. **Token storage = keychain**, and the bearer token only over **HTTPS** in production (self-hosted
   → you terminate TLS). Better Auth flags bearer as "use cautiously, cookie-less APIs only" — the
   native case.
3. **JWT (not session token) for sync.** Use JWT + JWKS (stateless, no per-request DB hit, matches
   the scaffolding). The session/bearer token is just what unlocks `authClient.token()`.

## Phased plan

1. **Server auth (no sync UI yet)** — add Better Auth (`emailAndPassword + bearer + jwt`), mount
   `/v1/auth/*`, generate tables, swap `authService` → JWKS verification. Prove end-to-end with a
   throwaway script: sign up → get JWT → `GET /v1/sync/pull` returns `200`, RLS-scoped.
2. **Desktop sign-in UI** — email/password, token in keychain, JWT as sync bearer.
3. **Google social** — system browser + `blink://` deep link.
4. **(Later)** org plugin for multi-tenancy; passkeys; realtime.

## Open decisions

- **First sign-in method:** email/password (fastest to working) vs. straight to Google social
  (nicer, but pulls in the `blink://` deep-link work immediately).
- **Encryption passphrase model** (separate from auth, still deferred): dedicated sync passphrase /
  random key + recovery phrase / account-password-derived.

## Reference docs

- Fastify integration: https://better-auth.com/docs/integrations/fastify
- Bearer plugin: https://better-auth.com/docs/plugins/bearer
- JWT plugin (JWKS): https://better-auth.com/docs/plugins/jwt
- Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
