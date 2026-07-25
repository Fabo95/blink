import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from '@/env.js';
import router from '@/router.js';
import { healthCheckRoute } from '@/routes/health-check.js';
import { registerDependencies } from '@/setup/dependencies/setup.js';
import { logger } from '@/setup/logger.js';
import { ApiError } from '@/utils/errors/apiError.js';

/** Comma-separated origins; entries prefixed `regex:` become RegExp. */
function parseCorsOrigins(origins: string): (string | RegExp)[] {
  return origins.split(',').map((origin) => {
    const trimmed = origin.trim();
    return trimmed.startsWith('regex:') ? new RegExp(trimmed.slice(6)) : trimmed;
  });
}

export function createServer() {
  const fastify = Fastify({
    loggerInstance: logger,
    routerOptions: { ignoreTrailingSlash: true },
    genReqId: () => randomUUID(),
  });

  fastify.register(cors, {
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Zod drives both request validation and response serialization.
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Emit an OpenAPI 3 document from the zod route schemas. Registered before the
  // routes so its onRoute hook sees them; the desktop client generates its types
  // from the dumped spec (`pnpm openapi:gen`). The Better Auth catch-all opts out
  // via `schema: { hide: true }` — it isn't a typed route.
  fastify.register(fastifySwagger, {
    openapi: {
      info: { title: 'Blink Sync API', version: '1.0.0' },
      servers: [{ url: env.BETTER_AUTH_URL }],
    },
    transform: jsonSchemaTransform,
  });

  // awilix DI: singleton cradle (db, auth) + request cradle (services).
  registerDependencies(fastify);

  fastify.register(router);
  fastify.register(healthCheckRoute);

  fastify.setErrorHandler((err, req, reply) => {
    let apiError: ApiError | undefined;

    if (hasZodFastifySchemaValidationErrors(err)) {
      // Map from Fastify's stable validation fields (version-agnostic across
      // fastify-type-provider-zod releases).
      apiError = new ApiError('validation', 'Validation error', {
        issues: err.validation.map((e) => ({ path: e.instancePath, message: e.message })),
      });
    }

    if (isResponseSerializationError(err)) {
      req.log.error({ err, cause: err.cause }, 'Response serialization error');
      apiError = new ApiError('internalServerError', 'Response serialization error');
    }

    if (err instanceof ApiError) apiError = err;

    if (!apiError) {
      req.log.error({ err }, 'An unexpected error occurred');
      apiError = new ApiError('internalServerError', 'An unexpected error occurred');
    }

    return reply.code(apiError.data.httpStatus).send(apiError.getErrorJson({ reqId: req.id }));
  });

  return fastify;
}
