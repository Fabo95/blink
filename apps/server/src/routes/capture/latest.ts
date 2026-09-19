import { zCaptureInput } from '@blink/contract/wire';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendCreated, zSuccessResponse } from '@/utils/response/response.js';
import { zAuthHeaders } from '@/utils/schemas/headers.js';

export function captureRoute(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/v1/capture',
    {
      schema: {
        headers: zAuthHeaders,
        body: zCaptureInput,
        response: {
          201: zSuccessResponse(z.object({ id: z.string().uuid() })),
        },
      },
    },
    async (req, reply) => {
      const { authService, captureService } = req.diScope.cradle;

      const { userId } = await authService.authenticate(req.headers);
      const created = await captureService.capture(userId, req.body);

      return sendCreated(reply, created);
    },
  );
}
