import { DomainError } from "@shorts-os/domain";
import type { ErrorCode } from "@shorts-os/contracts";

/** 모든 Provider 오류를 정규화한다. 호출부는 HTTP 상태나 SDK 오류를 몰라도 된다. */
export function normalizeProviderError(input: {
  provider: string;
  status?: number;
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
}): DomainError {
  const details = { provider: input.provider, providerCode: input.code };

  const map: { match: boolean; code: ErrorCode; retryable: boolean }[] = [
    { match: input.status === 401 || input.status === 403, code: "PROVIDER_NOT_CONNECTED", retryable: false },
    { match: input.status === 429, code: "PROVIDER_RATE_LIMITED", retryable: true },
    { match: input.code === "quotaExceeded" || input.code === "dailyLimitExceeded", code: "PROVIDER_QUOTA_EXCEEDED", retryable: true },
    { match: input.status !== undefined && input.status >= 500, code: "PROVIDER_UNAVAILABLE", retryable: true },
    { match: input.code === "ETIMEDOUT" || input.code === "TIMEOUT", code: "PROVIDER_TIMEOUT", retryable: true },
  ];

  const matched = map.find((entry) => entry.match);
  const code: ErrorCode = matched?.code ?? "PROVIDER_UNAVAILABLE";

  const options: {
    retryable: boolean;
    details: Record<string, unknown>;
    retryAfterSeconds?: number;
  } = {
    retryable: matched?.retryable ?? true,
    details,
  };
  if (input.retryAfterSeconds !== undefined) options.retryAfterSeconds = input.retryAfterSeconds;

  return new DomainError(code, input.message ?? `${input.provider} 호출이 실패했습니다.`, options);
}

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  timeoutMs: number;
};

/** 지수 백오프. 재시도 불가 오류는 즉시 던진다. */
export async function withRetry<T>(
  policy: RetryPolicy,
  fn: (attempt: number) => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof DomainError ? error.retryable : false;
      if (!retryable || attempt === policy.maxAttempts) throw error;
      await sleep(policy.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

export async function withTimeout<T>(
  timeoutMs: number,
  provider: string,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw normalizeProviderError({
        provider,
        code: "TIMEOUT",
        message: `${provider} 응답이 ${timeoutMs}ms 안에 오지 않았습니다.`,
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
