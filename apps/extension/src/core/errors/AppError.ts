import type { ErrorCode } from './errorCodes';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}
