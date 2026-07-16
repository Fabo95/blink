import type { FastifyReply } from 'fastify';
import { z } from 'zod';

/** All successful responses share the shape `{ data, reqId }`. */
export const zSuccessResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    reqId: z.string(),
  });

export function sendSuccess<T>(reply: FastifyReply, statusCode: number, data: T) {
  return reply.status(statusCode).send({ data, reqId: reply.request.id });
}

export function sendOk<T>(reply: FastifyReply, data: T) {
  return sendSuccess(reply, 200, data);
}

export function sendCreated<T>(reply: FastifyReply, data: T) {
  return sendSuccess(reply, 201, data);
}

export function sendNoContent(reply: FastifyReply) {
  return reply.status(204).send();
}
