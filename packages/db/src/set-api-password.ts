import postgres from 'postgres';

// Post-migration step (run as the owner role): sets the `blink_api` password from
// POSTGRES_BLINK_API_PASSWORD. Migration 0001 creates the role with LOGIN but no password —
// SQL migrations can't read env vars — so until this runs the role can't log in.
// Runs after `db:migrate` (see `db:deploy` and the compose migrate service).

const databaseUrl = process.env.DATABASE_URL;
const apiPassword = process.env.POSTGRES_BLINK_API_PASSWORD;

if (databaseUrl == null || databaseUrl === '') {
  console.error('set-api-password: DATABASE_URL is not set');
  process.exit(1);
}
if (apiPassword == null || apiPassword === '') {
  console.error('set-api-password: POSTGRES_BLINK_API_PASSWORD is not set');
  process.exit(1);
}

// max: 1 so both statements run on the same session — set_config is session-scoped.
const sql = postgres(databaseUrl, { max: 1 });

try {
  // ALTER ROLE can't take bound parameters, so pass the password through a session
  // setting and let Postgres quote it with format(%L) — never string-concatenated.
  await sql`select set_config('blink.api_password', ${apiPassword}, false)`;
  await sql.unsafe(
    "do $$ begin execute format('alter role blink_api password %L', current_setting('blink.api_password')); end $$",
  );
  console.log('set-api-password: blink_api password updated');
} finally {
  await sql.end();
}
