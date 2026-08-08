import { zSyncRecord } from '@blink/contract/wire';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendOk, zSuccessResponse } from '@/utils/response/response.js';
import { zAuthHeaders } from '@/utils/schemas/headers.js';

// `since` is the server-assigned seq cursor (not an HLC): everything with a higher
// seq is returned. The client advances it to the max seq it receives.
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
          200: zSuccessResponse(z.object({ records: z.array(zSyncRecord) })),
        },
      },
    },
    async (req, reply) => {
      const { authService, syncService } = req.diScope.cradle;

      const { userId } = await authService.authenticate(req.headers);
      const records = await syncService.pull(userId, req.query.since);

      return sendOk(reply, { records });
    },
  );
}
