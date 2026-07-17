import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from '@/env.js';
import router from '@/router.js';
import { healthCheckRoute } from '@/routes/health-check.js';
import { createServices } from '@/setup/dependencies/container.js';
import { logger } from '@/setup/logger.js';
import { ApiError } from '@/utils/errors/apiError.js';
import '@/types/fastify.js';

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

  // Plain service container attached once (no DI framework for three endpoints).
  fastify.decorate('services', createServices());

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
