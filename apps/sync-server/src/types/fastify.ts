import type { Services } from '@/setup/dependencies/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
  }
}
