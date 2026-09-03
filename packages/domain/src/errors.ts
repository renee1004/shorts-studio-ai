import type { ErrorCode } from "@shorts-os/contracts";

/** Domain이 던지는 오류. API 계층이 code를 그대로 HTTP 응답으로 옮긴다. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: {
      retryable?: boolean;
      retryAfterSeconds?: number;
      details?: Record<string, unknown>;
      httpStatus?: number;
    } = {},
  ) {
    super(message);
    this.name = "DomainError";
  }

  get retryable(): boolean {
    return this.options.retryable ?? false;
  }

  get httpStatus(): number {
    if (this.options.httpStatus) return this.options.httpStatus;
    switch (this.code) {
      case "AUTH_REQUIRED":
        return 401;
      case "PERMISSION_DENIED":
        return 403;
      case "NOT_FOUND":
        return 404;
      case "VALIDATION_FAILED":
        return 400;
      case "CONFLICT":
      case "IDEMPOTENCY_CONFLICT":
      case "INVALID_STATE_TRANSITION":
        return 409;
      case "PROVIDER_QUOTA_EXCEEDED":
      case "PROVIDER_RATE_LIMITED":
      case "WORKSPACE_LIMIT_EXCEEDED":
        return 429;
      case "PROVIDER_DISABLED":
      case "PROVIDER_NOT_CONNECTED":
      case "PROVIDER_UNAVAILABLE":
      case "FEATURE_DISABLED":
        return 503;
      case "PROVIDER_TIMEOUT":
        return 504;
      case "BUDGET_EXCEEDED":
        return 402;
      default:
        return 500;
    }
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
