export const errorCodes = {
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  validation: 400,
  badRequest: 400,
  internalServerError: 500,
} as const;

export type ErrorCode = keyof typeof errorCodes;
