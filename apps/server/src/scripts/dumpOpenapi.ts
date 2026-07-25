import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from '@/server.js';

/**
 * Writes the OpenAPI document to `apps/server/openapi.json` (committed). The desktop
 * client generates its typed API layer from this file (`@blink/desktop gen:api`), so
 * regenerate it whenever a route's request/response schema changes.
 */
const fastify = createServer();
await fastify.ready();

const spec = fastify.swagger();
const outPath = path.resolve(process.cwd(), 'openapi.json');
await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`);

await fastify.close();
console.log(`Wrote OpenAPI spec → ${outPath}`);
