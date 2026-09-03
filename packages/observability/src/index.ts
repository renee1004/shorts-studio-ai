import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";

export type LogContext = {
  requestId?: string;
  workspaceId?: string;
  userId?: string;
  workflowRunId?: string;
  provider?: string;
};

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "apiKey",
  "accessToken",
  "refreshToken",
  "secret",
  "secretRef",
  "*.apiKey",
  "*.accessToken",
  "*.refreshToken",
];

let root: Logger | null = null;

export function rootLogger(): Logger {
  root ??= pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    base: { service: "shorts-os" },
    formatters: { level: (label) => ({ level: label }) },
  });
  return root;
}

export function createLogger(context: LogContext = {}): Logger {
  return rootLogger().child(context);
}

export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/** 외부 호출 시간을 재고 실패도 같은 형태로 로깅한다. */
export async function withTiming<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    logger.debug({ operation, durationMs: Date.now() - startedAt, outcome: "ok" }, "operation done");
    return result;
  } catch (error) {
    logger.warn(
      {
        operation,
        durationMs: Date.now() - startedAt,
        outcome: "error",
        errorName: error instanceof Error ? error.name : "Unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "operation failed",
    );
    throw error;
  }
}
