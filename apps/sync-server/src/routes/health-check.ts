import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Health check for load balancers / container orchestration. Intentionally NOT
 * wrapped in the `{ data, reqId }` envelope — a flat `{ success: true }` is what
 * probes expect.
 */
export function healthCheckRoute(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({ success: z.literal(true) }),
        },
      },
    },
    async (_req, reply) => reply.status(200).send({ success: true }),
  );
}
