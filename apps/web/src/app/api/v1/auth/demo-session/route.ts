import { z } from "zod";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { SESSION_COOKIE, authProvider } from "@/server/auth";
import { env } from "@/server/env";

const bodySchema = z.object({
  email: z.literal("demo@shorts-os.local"),
  /** Demo 워크스페이스에 바로 들어가기 위한 고정 사용자 ID */
  userId: z.literal("00000000-0000-4000-8000-000000000001"),
});

/**
 * Demo Mode 전용 세션 발급. AUTH_PROVIDER=supabase면 거절한다.
 * 실서비스 인증을 흉내내지 않고, 무엇이 필요한지 오류로 알려준다.
 */
export const POST = route(async ({ request, requestId }) => {
  if (env().AUTH_PROVIDER !== "demo" || env().APP_MODE !== "demo") {
    throw new DomainError(
      "FEATURE_DISABLED",
      "Demo 세션은 AUTH_PROVIDER=demo에서만 발급됩니다.",
    );
  }

  const input = await parseBody(request, bodySchema);
  const token = authProvider().issueSession({ id: input.userId, email: input.email });
  const response = ok({ userId: input.userId, email: input.email }, requestId);
  response.headers.append("Set-Cookie", serializeSessionCookie(token, isHttps(request)));
  return response;
});

export const DELETE = route(async ({ request, requestId }) => {
  const response = ok({ signedOut: true }, requestId);
  response.headers.append("Set-Cookie", expireSessionCookie(isHttps(request)));
  return response;
});

function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(request.url).protocol === "https:";
}

/** cookies().set()는 production에서 Secure를 강제해 HTTP 프리뷰 로그인이 깨진다. */
function serializeSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${30 * 86_400}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function expireSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
