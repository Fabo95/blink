import type { BlinkDb } from '@blink/db/client';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { bearer } from 'better-auth/plugins/bearer';
import { env } from '@/env.js';
import { renderVerificationEmail } from '@/utils/functions/renderVerificationEmail.js';
import type { EmailClient } from './emailClient.js';

interface AuthClientDeps {
  db: BlinkDb;
  emailClient: EmailClient;
}

/**
 * Wraps the Better Auth instance — identity only. It never sees the E2EE key or task
 * plaintext; it just authenticates a caller so the sync routes can scope rows to
 * `userId` via RLS. Native (Tauri) clients authenticate with a bearer token; the server
 * resolves it via `authClient.auth.api.getSession`.
 *
 * Takes the injected {@link EmailClient} and owns the verification-email method, wired
 * into the emailOTP plugin (a 6-digit code, auto-sent on sign-up).
 */
export class AuthClient {
  readonly auth: Auth;
  private readonly emailClient: EmailClient;

  constructor(deps: AuthClientDeps) {
    this.emailClient = deps.emailClient;
    this.auth = createAuth(deps.db, (email, otp) => this.sendVerificationEmail(email, otp));
  }

  private async sendVerificationEmail(email: string, otp: string): Promise<void> {
    const { subject, html, text } = renderVerificationEmail(otp);
    await this.emailClient.send({ to: email, subject, html, text });
  }
}

/** The concrete Better Auth instance (kept as a factory so its plugin-augmented type
 *  flows through to `Auth`). */
function createAuth(db: BlinkDb, sendVerificationEmail: (email: string, otp: string) => Promise<void>) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Mounted under /v1 (not Better Auth's default /api/auth); it builds its own
    // URLs/cookie paths from this, so it must match the Fastify mount + client baseURL.
    basePath: '/v1/auth',
    // Email must be verified before sign-in; the emailOTP plugin swaps the default
    // verification link for a code (better for desktop), auto-sent on sign-up.
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    plugins: [
      bearer(),
      emailOTP({
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === 'email-verification') await sendVerificationEmail(email, otp);
        },
      }),
    ],
    trustedOrigins: [
      ...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
      'tauri://localhost', // the desktop webview origin
      'blink://', // the deep-link scheme (used once social login lands)
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
