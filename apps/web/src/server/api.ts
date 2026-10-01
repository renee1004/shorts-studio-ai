import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DomainError, isDomainError } from "@shorts-os/domain";
import { createLogger, newRequestId } from "@shorts-os/observability";
import type { ErrorCode } from "@shorts-os/contracts";

export type RequestMeta = { requestId: string; timestamp: string };

function meta(requestId: string): RequestMeta {
  return { requestId, timestamp: new Date().toISOString() };
}

export function ok<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json({ data, meta: meta(requestId) }, { status });
}

export function accepted<T>(data: T, requestId: string) {
  return ok(data, requestId, 202);
}

export function fail(
  input: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
    details?: Record<string, unknown>;
    status: number;
  },
  requestId: string,
) {
  return NextResponse.json(
    {
      error: {
        code: input.code,
        message: input.message,
        retryable: input.retryable ?? false,
        ...(input.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: input.retryAfterSeconds }
          : {}),
        ...(input.details ? { details: input.details } : {}),
      },
      meta: meta(requestId),
    },
    { status: input.status },
  );
}

/**
 * 모든 라우트를 감싼다. 오류를 삼키지 않고 표준 코드로 변환하며 requestId를 남긴다.
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (context: {
    requestId: string;
    request: Request;
    params: P;
  }) => Promise<Response>,
) {
  return async (
    request: Request,
    routeContext?: { params: Promise<P> },
  ): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? newRequestId();
    const logger = createLogger({ requestId });

    const startedAt = Date.now();
    logger.info({ method: request.method, path: new URL(request.url).pathname }, "요청 시작");
    try {
      const params = ((await routeContext?.params) ?? {}) as P;
      const response = await handler({ requestId, request, params });
      logger.info({ status: response.status, elapsedMs: Date.now() - startedAt }, "요청 완료");
      return response;
    } catch (error) {
      if (isDomainError(error)) {
        logger.warn(
          { code: error.code, details: error.options.details },
          `요청 실패: ${error.message}`,
        );
        return fail(
          {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            ...(error.options.retryAfterSeconds !== undefined
              ? { retryAfterSeconds: error.options.retryAfterSeconds }
              : {}),
            ...(error.options.details ? { details: error.options.details } : {}),
            status: error.httpStatus,
          },
          requestId,
        );
      }

      if (error instanceof ZodError) {
        return fail(
          {
            code: "VALIDATION_FAILED",
            message: "요청 값을 확인해 주세요.",
            details: {
              issues: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
            status: 400,
          },
          requestId,
        );
      }

      logger.error(
        { errorName: error instanceof Error ? error.name : "Unknown" },
        error instanceof Error ? error.message : String(error),
      );
      return fail(
        { code: "INTERNAL_ERROR", message: "처리 중 문제가 생겼습니다.", status: 500 },
        requestId,
      );
    }
  };
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new DomainError("VALIDATION_FAILED", "JSON 본문이 필요합니다.");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const url = new URL(request.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

/** 생성·재시도 계열 API는 Idempotency-Key를 요구한다. (스펙 7.1) */
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key || key.length < 8) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Idempotency-Key 헤더가 필요합니다. 같은 작업을 두 번 실행하지 않기 위한 값입니다.",
    );
  }
  return key;
}
