import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { env } from '@/env.js';
import { getDb } from '@/setup/database/db.js';

/**
 * The Better Auth instance — identity only. It never sees the E2EE key or task plaintext;
 * it just authenticates a caller so the sync routes can scope rows to `userId` via RLS.
 *
 * Shares the one DB connection with sync. Its tables (`user`/`session`/…) aren't under RLS,
 * and the `blink_api` role is granted access to them (see the auth-grants migration). Native
 * (Tauri) clients authenticate with a bearer token (the `bearer` plugin) instead of cookies;
 * the server resolves it via `auth.api.getSession`.
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: 'pg' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Mounted under /v1 alongside the sync routes (not Better Auth's default /api/auth).
  // Better Auth builds its own URLs/redirects/cookie paths from this, so it must match the
  // Fastify mount and the client's `baseURL`.
  basePath: '/v1/auth',
  emailAndPassword: { enabled: true },
  plugins: [bearer()],
  trustedOrigins: [
    ...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    'tauri://localhost', // the desktop webview origin
    'blink://', // the deep-link scheme (used once social login lands)
  ],
});

export type Auth = typeof auth;
