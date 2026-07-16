import { pino } from 'pino';

export const logger = pino({
  messageKey: 'message',
  // process.env here (not @/env) to avoid a circular import.
  ...(process.env.ENVIRONMENT === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'SYS:dd.mm.yyyy HH:MM:ss',
            colorize: true,
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
