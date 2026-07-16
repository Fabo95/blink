import type { FastifyInstance } from 'fastify';
import { syncPullRoute } from '@/routes/sync/pull/latest.js';
import { syncPushRoute } from '@/routes/sync/push/latest.js';

export default function router(fastify: FastifyInstance) {
  fastify.register(syncPushRoute);
  fastify.register(syncPullRoute);
}
