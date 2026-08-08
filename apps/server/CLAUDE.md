# Blink sync server (`apps/server`)

Fastify 5 + zod 4 + awilix DI + Drizzle/Postgres 17 (RLS) + Better Auth. The desktop core is the
only client — it authenticates here (email/password + OTP email flows) and syncs an opaque,
zero-knowledge blob store: `/v1/sync/push` + `/v1/sync/pull` over the `records` table (server sees
only ciphertext + owner + clocks) plus `/v1/keyset` for the 2SKD account keyset. The desktop→sync
bridge (Rust) is still in progress. Monorepo-wide rules live in the root `CLAUDE.md` — this file is
the server-specific guide.

## Layout — `src`

```
index.ts            entry → createServer().listen()
server.ts           Fastify app: trustProxy, cors, zod validator/serializer, @fastify/swagger,
                    awilix DI, routes, error handler (ApiError → response envelope)
router.ts           registers the route modules
routes/             one folder per endpoint, handler in latest.ts (versioned convention):
                    auth/ (Better Auth catch-all), sync/pull, sync/push, keyset, health-check.ts
clients/            transport to external systems: authClient.ts (the Better Auth instance),
                    emailClient.ts (Resend)
services/common/    business logic (authService, syncService, keysetService)
services/model/     thin Drizzle wrappers (recordsModelService, keysetsModelService) — no logic
setup/database/     the postgres/Drizzle connection (getDb)
setup/dependencies/ awilix wiring: singletonCradle + requestCradle + setup + types
setup/logger.ts     pino config
utils/              errors/ (ApiError), functions/renderOtpEmail.ts (email templates),
                    schemas/headers.ts
scripts/            dumpOpenapi.ts (writes openapi.json)
env.ts              zod-validated env — no defaults, all required
```

## Architecture notes

- **DI (awilix)**: `createSingletonCradle()` registers app-lifetime singletons (`db`,
  `emailClient`, `authClient`) via `asValue`; `createRequestCradle()` registers per-request
  services (`recordsModelService`, `keysetsModelService`, `authService`, `syncService`,
  `keysetService`) via `asClass(...).scoped()`.
  Both go on `diContainer` in `setup.ts`; `types.ts` augments `@fastify/awilix`'s `Cradle` /
  `RequestCradle`. Services take a single `{ dep }` object (awilix PROXY injection). Handlers
  resolve via `req.diScope.cradle`. Add a service = a class + a cradle-type field + a cradle
  registration line. Route → common service → model service → Drizzle.
- **Better Auth** lives in `clients/authClient.ts` (drizzle adapter on the shared `db`) and is
  mounted as a catch-all at `/v1/auth/*` (`routes/auth/latest.ts`, `hide: true` so it stays out
  of the OpenAPI doc); `basePath` matches the mount and `baseURL` is the static
  `env.BETTER_AUTH_URL` (the server sits behind a proxy — `trustProxy: true` in `server.ts`,
  and auth URLs never derive from request headers). Config: email/password with
  `requireEmailVerification: true`, plugins `bearer()` + `emailOTP` (sends the OTP on sign-up,
  overrides default verification, and handles both `email-verification` and `forget-password`
  types). `trustedOrigins` includes the CORS origins plus `tauri://localhost` and `blink://`.
- **Email** goes through `EmailClient` (Resend, `RESEND_API_KEY`), sender
  `Blink <noreply@blink.wolkenassistent.de>`. Templates are plain functions in
  `utils/functions/renderOtpEmail.ts` (verification + password reset). `AuthClient` holds the
  `emailClient` and sends OTPs from the `emailOTP` callback — routes never touch email directly.
- **Auth on sync routes**: handlers call `authService.authenticate(headers)` → `getSession` →
  `userId`, and RLS (`FORCE ROW LEVEL SECURITY` on `records`/`sync_keysets`) scopes rows to that
  user — each model-service method opens a transaction and runs
  `set_config('app.current_user_id', userId, true)`, which the policies read.
- **DB roles (least-privilege)**: the server connects as `blink_api`, a non-owner role with only
  the grants it needs (`organizations` in `0001`, the Better Auth tables in `0003`,
  `records`/`sync_keysets` + the `records_seq_seq` sequence in `0006`), so
  RLS is enforced and a compromise can't touch the schema. The owner `blink` is used **only** for
  migrations/DDL + `GRANT`s (the compose `migrate` service). Grants are hand-written SQL
  migrations in `@blink/db` — Drizzle can't express roles/grants/policies — so a new server-read
  table needs a matching `GRANT`. Migration 0001 creates `blink_api` with LOGIN but **no
  password** (SQL migrations can't read env vars, and a hardcoded one would leak into prod);
  `@blink/db`'s `db:deploy` (what the `migrate` service runs) follows migrations with
  `set-api-password.js`, which sets it from `POSTGRES_BLINK_API_PASSWORD`. Until that runs the role
  can't log in — plain `db:migrate` alone leaves the server unable to connect on a fresh DB.
- **OpenAPI**: `@fastify/swagger` + the zod `jsonSchemaTransform` emit the spec;
  `pnpm --filter @blink/server openapi:gen` dumps `apps/server/openapi.json` (the wire contract).
  Regenerate it whenever a route's schema changes.

## Commands

- `pnpm --filter @blink/server dev` — builds `@blink/contract` + `@blink/db`, then
  `tsx watch` with `ENVIRONMENT=development`.
- `pnpm --filter @blink/server openapi:gen` — dump `openapi.json`.
- `pnpm --filter @blink/db db:generate` / `db:migrate` — Drizzle migrations.
- `docker compose up` (repo root) — postgres:17 + one-shot `migrate` (owner role) + `server`
  (as `blink_api`, port 8787).

## Environment

`apps/server/.env`, validated by `src/env.ts` — **no defaults, all required**: `PORT`,
`ENVIRONMENT` (development|test|staging|production), `DATABASE_URL` (the `blink_api`
connection), `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL` (public base URL),
`CORS_ORIGINS` (comma-separated; `regex:` prefix supported), `RESEND_API_KEY`.

## Deployment

`.github/workflows/deploy-server.yml` — on push to `master` touching `apps/server/**`,
`packages/contract/**`, `packages/db/**`, or the lockfile (or manual dispatch): builds
`apps/server/Dockerfile`, pushes `blink-server:latest` + `:sha` to Docker Hub, then SSHes to the
host and runs `docker compose up -d blink-server` (the server's own Caddy/n8n compose, not the
repo's `docker-compose.yml`).
