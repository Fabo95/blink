import { zKeyset } from '@blink/contract/wire';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendOk, zSuccessResponse } from '@/utils/response/response.js';
import { zAuthHeaders } from '@/utils/schemas/headers.js';

/**
 * The per-user 2SKD account keyset (wrapped VMK + KDF params). GET on a new device
 * fetches it to unwrap the VMK from the master password + Secret Key; PUT stores it
 * at setup or after a password change. All zero-knowledge — opaque to the server.
 */
export function keysetRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    '/v1/keyset',
    {
      schema: {
        headers: zAuthHeaders,
        response: {
          200: zSuccessResponse(z.object({ keyset: zKeyset.nullable() })),
        },
      },
    },
    async (req, reply) => {
      const { authService, keysetService } = req.diScope.cradle;

      const { userId } = await authService.authenticate(req.headers);
      const keyset = await keysetService.get(userId);

      return sendOk(reply, { keyset });
    },
  );

  f.put(
    '/v1/keyset',
    {
      schema: {
        headers: zAuthHeaders,
        body: zKeyset,
        response: {
          200: zSuccessResponse(z.object({ ok: z.literal(true) })),
        },
      },
    },
    async (req, reply) => {
      const { authService, keysetService } = req.diScope.cradle;

      const { userId } = await authService.authenticate(req.headers);
      await keysetService.put(userId, req.body);

      return sendOk(reply, { ok: true });
    },
  );
}
