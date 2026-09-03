import { z } from "zod";

/** 스펙 7.4 표준 Error Code. UI는 code로 분기하고 message는 사용자 표시용이다. */
export const errorCodes = [
  "VALIDATION_FAILED",
  "AUTH_REQUIRED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_STATE_TRANSITION",
  "WORKSPACE_LIMIT_EXCEEDED",
  "PROVIDER_DISABLED",
  "PROVIDER_NOT_CONNECTED",
  "PROVIDER_QUOTA_EXCEEDED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "FEATURE_DISABLED",
  "BUDGET_EXCEEDED",
  "INTERNAL_ERROR",
] as const;

export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  meta: apiMetaSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function apiSuccessSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: apiMetaSchema });
}

export const cursorPageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export const asyncCommandAcceptedSchema = z.object({
  workflowRunId: z.string().uuid(),
  status: z.enum(["queued", "running", "waiting", "succeeded", "failed", "cancelled"]),
  acceptedProviders: z.array(z.string()),
  skippedProviders: z.array(z.object({ provider: z.string(), reason: errorCodeSchema })),
  reused: z.boolean().default(false),
});

export type AsyncCommandAccepted = z.infer<typeof asyncCommandAcceptedSchema>;

export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 국가 코드여야 합니다.");

export const languageCodeSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/, "BCP 47 언어 코드여야 합니다.");

export const idempotencyKeySchema = z.string().min(8).max(200);
