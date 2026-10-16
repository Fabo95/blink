import {
  zNovDestinationId,
  zNovItineraryDay,
  zNovItineraryInput,
  zNovPackingInput,
  zNovPackingItem,
  zNovPerson,
  zNovState,
  zNovVoteInput,
  zNovVotes,
} from '@blink/contract/november';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendOk, zSuccessResponse } from '@/utils/response/response.js';

/** These endpoints are public and the site lives on its own origin, so they open CORS
 * for themselves instead of depending on `CORS_ORIGINS`. The wildcard OPTIONS route below
 * is more specific than the plugin's global one, so preflights get the same answer. */
const openCors = { cors: { origin: true as const } };

const zDestinationParams = z.object({ id: zNovDestinationId });
const zPersonParams = z.object({ person: zNovPerson });

export function novemberRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.options('/v1/november/*', { config: openCors, schema: { hide: true } }, async (_req, reply) =>
    reply.status(204).send(),
  );

  app.get(
    '/v1/november/state',
    { config: openCors, schema: { response: { 200: zSuccessResponse(zNovState) } } },
    async (req, reply) => sendOk(reply, await req.diScope.cradle.novemberService.getState()),
  );

  app.get(
    '/v1/november/votes',
    { config: openCors, schema: { response: { 200: zSuccessResponse(zNovVotes) } } },
    async (req, reply) => sendOk(reply, await req.diScope.cradle.novemberService.getVotes()),
  );

  app.put(
    '/v1/november/votes/:person',
    {
      config: openCors,
      schema: {
        params: zPersonParams,
        body: zNovVoteInput,
        response: { 200: zSuccessResponse(zNovVotes) },
      },
    },
    async (req, reply) => {
      const { novemberService } = req.diScope.cradle;
      return sendOk(
        reply,
        await novemberService.setVote(req.params.person, req.body.destinationId),
      );
    },
  );

  app.put(
    '/v1/november/destinations/:id/itinerary',
    {
      config: openCors,
      schema: {
        params: zDestinationParams,
        body: zNovItineraryInput,
        response: { 200: zSuccessResponse(z.object({ days: z.array(zNovItineraryDay) })) },
      },
    },
    async (req, reply) => {
      const { novemberService } = req.diScope.cradle;
      const days = await novemberService.replaceItinerary(req.params.id, req.body.days);
      return sendOk(reply, { days });
    },
  );

  app.post(
    '/v1/november/destinations/:id/itinerary/reset',
    {
      config: openCors,
      schema: {
        params: zDestinationParams,
        response: { 200: zSuccessResponse(z.object({ days: z.array(zNovItineraryDay) })) },
      },
    },
    async (req, reply) => {
      const { novemberService } = req.diScope.cradle;
      return sendOk(reply, { days: await novemberService.resetItinerary(req.params.id) });
    },
  );

  app.put(
    '/v1/november/destinations/:id/packing',
    {
      config: openCors,
      schema: {
        params: zDestinationParams,
        body: zNovPackingInput,
        response: { 200: zSuccessResponse(z.object({ items: z.array(zNovPackingItem) })) },
      },
    },
    async (req, reply) => {
      const { novemberService } = req.diScope.cradle;
      const items = await novemberService.replacePacking(req.params.id, req.body.items);
      return sendOk(reply, { items });
    },
  );

  app.post(
    '/v1/november/destinations/:id/packing/reset',
    {
      config: openCors,
      schema: {
        params: zDestinationParams,
        response: { 200: zSuccessResponse(z.object({ items: z.array(zNovPackingItem) })) },
      },
    },
    async (req, reply) => {
      const { novemberService } = req.diScope.cradle;
      return sendOk(reply, { items: await novemberService.resetPacking(req.params.id) });
    },
  );
}
