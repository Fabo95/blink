import type { FastifyInstance } from 'fastify';
import { novemberRoutes } from '@/november/routes.js';
import { authHandlerRoute } from '@/routes/auth/latest.js';
import { captureRoute } from '@/routes/capture/latest.js';
import { syncPullRoute } from '@/routes/sync/pull/latest.js';
import { syncPushRoute } from '@/routes/sync/push/latest.js';

export default function router(fastify: FastifyInstance) {
  fastify.register(authHandlerRoute);
  fastify.register(syncPushRoute);
  fastify.register(syncPullRoute);
  fastify.register(captureRoute);
  // November Escape side project (public, no auth) — remove with src/november.
  fastify.register(novemberRoutes);
}
