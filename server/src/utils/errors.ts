// Centralized structured error types. Every layer of the app (LLM, tools,
// providers, ffmpeg, db) throws one of these so the API and UI can render
// a consistent { code, message, retryable, details } shape (see spec #44).

export type AppErrorCode =
  | "LLM_ERROR"
  | "LLM_TIMEOUT"
  | "LLM_AUTH_ERROR"
  | "LLM_RATE_LIMIT"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "FFMPEG_ERROR"
  | "FILE_ERROR"
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR"
  | "TIMEOUT_ERROR"
  | "TOOL_ERROR"
  | "NOT_FOUND"
  | "PATH_SECURITY_ERROR"
  | "UNKNOWN_ERROR";

export interface AppErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly details: AppErrorDetails;

  constructor(
    code: AppErrorCode,
    message: string,
    opts: { retryable?: boolean; details?: AppErrorDetails; cause?: unknown } = {}
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details ?? {};
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }

  static from(err: unknown, fallbackCode: AppErrorCode = "UNKNOWN_ERROR"): AppError {
    if (err instanceof AppError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new AppError(fallbackCode, message, { cause: err });
  }
}
