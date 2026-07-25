import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix';
import type { FastifyInstance } from 'fastify';
import { createRequestCradle } from './requestCradle.js';
import { createSingletonCradle } from './singletonCradle.js';

/**
 * Attach awilix to Fastify. The plugin gives each request a child scope
 * (`req.diScope`) off the app container and disposes it on response; we register
 * both cradles onto that container — singletons via `asValue`, request services
 * via `asClass(...).scoped()`. Handlers resolve services from `req.diScope.cradle`.
 */
export function registerDependencies(fastify: FastifyInstance): void {
  fastify.register(fastifyAwilixPlugin, {
    injectionMode: 'PROXY',
    disposeOnResponse: true,
    disposeOnClose: true,
  });

  diContainer.register(createSingletonCradle());
  diContainer.register(createRequestCradle());
}
