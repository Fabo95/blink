import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  ENVIRONMENT: z.enum(['development', 'test', 'production', 'staging']).default('production'),
  DATABASE_URL: z
    .string()
    .default('postgres://blink_api:blink_api_dev_password@localhost:5432/blink'),
  // CORS: comma-separated origins, supports regex patterns prefixed with "regex:".
  CORS_ORIGINS: z.string().default('http://localhost:1420'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.log('❌ Invalid environment variables', JSON.stringify(parsed.error.format(), null, 4));
  process.exit(1);
}

export const env = parsed.data;
