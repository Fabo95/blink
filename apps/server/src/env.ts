import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Every var is required — no defaults. Supply them via the environment (local:
// apps/server/.env, see .env.example; prod: the compose `environment` / .env on the box).
const schema = z.object({
  PORT: z.coerce.number(),
  ENVIRONMENT: z.enum(['development', 'test', 'production', 'staging']),
  // The server connects as the least-privilege `blink_api` role (created by migration 0001):
  // RLS is enforced and it holds only the grants it needs. The owner `blink` is used solely for
  // migrations/DDL (the migrate service / `db:migrate`). Run migrations before the server so the
  // role exists.
  DATABASE_URL: z.string(),
  // Better Auth secret (hashing/encryption). Generate one with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32),
  // The server's own public base URL, where Better Auth is mounted.
  BETTER_AUTH_URL: z.string(),
  // CORS: comma-separated origins, supports regex patterns prefixed with "regex:".
  CORS_ORIGINS: z.string(),
  // Resend API key for outbound email (verification OTPs) — the server sends real email
  // in every environment (see clients/emailClient).
  RESEND_API_KEY: z.string().min(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.log('❌ Invalid environment variables', JSON.stringify(parsed.error.format(), null, 4));
  process.exit(1);
}

export const env = parsed.data;
