import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendOk, zSuccessResponse } from '@/utils/response/response.js';
import { zAuthHeaders } from '@/utils/schemas/headers.js';
import { zSyncPacket } from '@/utils/schemas/sync.js';

const zPushBody = z.object({
  packets: z.array(zSyncPacket),
});

export function syncPushRoute(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/v1/sync/push',
    {
      schema: {
        headers: zAuthHeaders,
        body: zPushBody,
        response: {
          200: zSuccessResponse(z.object({ written: z.number() })),
        },
      },
    },
    async (req, reply) => {
      const { authService, syncService } = req.server.services;

      const { userId } = authService.authenticate(req.headers.authorization);
      const written = await syncService.push(userId, req.body.packets);

      return sendOk(reply, { written });
    },
  );
}
