import { type ErrorCode, errorCodes } from './errorCodes.js';

type ErrorJson = {
  error: {
    code: ErrorCode;
    message: string;
    payload?: unknown;
  };
  reqId: string;
};

type ApiErrorData = {
  httpStatus: number;
} & ErrorJson;

export class ApiError extends Error {
  data: ApiErrorData;

  constructor(code: ErrorCode, message?: string, payload?: unknown) {
    const httpStatus = errorCodes[code];
    const data: ApiErrorData = {
      httpStatus,
      error: {
        code,
        message: message ?? code,
        ...(payload ? { payload } : {}),
      },
      reqId: 'unknown',
    };
    super(`ApiError: ${httpStatus}\n${JSON.stringify(data, null, 2)}`);
    this.data = data;
  }

  getErrorJson({ reqId }: { reqId: string }): ErrorJson {
    return { error: this.data.error, reqId };
  }
}
