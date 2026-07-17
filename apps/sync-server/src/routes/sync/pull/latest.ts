import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendOk, zSuccessResponse } from '@/utils/response/response.js';
import { zAuthHeaders } from '@/utils/schemas/headers.js';
import { zSyncPacket } from '@/utils/schemas/sync.js';

const zPullQuery = z.object({
  since: z.coerce.number().default(0),
});

export function syncPullRoute(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/v1/sync/pull',
    {
      schema: {
        headers: zAuthHeaders,
        querystring: zPullQuery,
        response: {
          200: zSuccessResponse(z.object({ packets: z.array(zSyncPacket) })),
        },
      },
    },
    async (req, reply) => {
      const { authService, syncService } = req.server.services;

      const { userId } = authService.authenticate(req.headers.authorization);
      const packets = await syncService.pull(userId, req.query.since);

      return sendOk(reply, { packets });
    },
  );
}
