import { env } from '@/env.js';
import { createServer } from '@/server.js';
import { logger } from '@/setup/logger.js';

const fastify = createServer();

try {
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown: orchestrators send SIGTERM before stopping the container.
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  await fastify.close();
  logger.info('Server closed');
  process.exit(0);
});
