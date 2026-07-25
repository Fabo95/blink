import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  ENVIRONMENT: z.enum(['development', 'test', 'production', 'staging']).default('production'),
  // The server connects as the least-privilege `blink_api` role (created by migration 0001):
  // RLS is enforced and it holds only the grants it needs. The owner `blink` is used solely for
  // migrations/DDL (the migrate service / `db:migrate`). Run migrations before the server so the
  // role exists.
  DATABASE_URL: z
    .string()
    .default('postgres://blink_api:blink_api_dev_password@localhost:5432/blink'),
  // Better Auth secret (hashing/encryption). MUST be overridden in production; the default
  // is dev-only. Generate one with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32).default('dev-only-insecure-secret-change-me-32ch'),
  // The server's own public base URL, where Better Auth is mounted.
  BETTER_AUTH_URL: z.string().default('http://localhost:8787'),
  // CORS: comma-separated origins, supports regex patterns prefixed with "regex:".
  CORS_ORIGINS: z.string().default('http://localhost:1420'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.log('❌ Invalid environment variables', JSON.stringify(parsed.error.format(), null, 4));
  process.exit(1);
}

export const env = parsed.data;
