import type { FastifyInstance } from 'fastify';
import { authHandlerRoute } from '@/routes/auth/latest.js';
import { syncPullRoute } from '@/routes/sync/pull/latest.js';
import { syncPushRoute } from '@/routes/sync/push/latest.js';

export default function router(fastify: FastifyInstance) {
  fastify.register(authHandlerRoute);
  fastify.register(syncPushRoute);

  fastify.register(syncPullRoute);
}
