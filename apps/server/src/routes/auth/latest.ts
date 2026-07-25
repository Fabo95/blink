import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import { auth } from '@/setup/auth/auth.js';

/**
 * Mounts the whole Better Auth API at `/v1/auth/*` (sign-up, sign-in, session, sign-out, and
 * every future plugin/OAuth route) — the catch-all pattern Better Auth recommends for Fastify,
 * and what its client SDK expects (its `basePath` is set to match). Better Auth speaks the web
 * `Request`/`Response` API, so we translate Fastify's Node request into a `Request`, run it,
 * and forward the `Response`.
 *
 * App-specific auth logic (custom sign-up side effects, the token→userId check) lives in
 * `AuthService` on top of `auth.api.*`; this route is just the transport for the standard
 * surface, not a place for business logic.
 */
export function authHandlerRoute(fastify: FastifyInstance) {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/v1/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const req = new Request(url, {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        // Fastify has already parsed the JSON body; re-serialize it for the web Request.
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const res = await auth.handler(req);
      reply.status(res.status);
      // Copy headers, but pull Set-Cookie out separately: the Headers iterator collapses
      // repeated headers into one comma-joined value, which is invalid for Set-Cookie (the
      // one header that legitimately repeats). `getSetCookie()` returns them intact.
      for (const [key, value] of res.headers) {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      }
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length > 0) reply.header('set-cookie', setCookies);

      return reply.send(res.body ? await res.text() : null);
    },
  });
}
