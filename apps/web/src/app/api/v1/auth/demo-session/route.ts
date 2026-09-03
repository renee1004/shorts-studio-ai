import { cookies } from "next/headers";
import { z } from "zod";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { SESSION_COOKIE, authProvider } from "@/server/auth";
import { env } from "@/server/env";

const bodySchema = z.object({
  email: z.string().email(),
  /** Demo 워크스페이스에 바로 들어가기 위한 고정 사용자 ID */
  userId: z.string().uuid(),
});

/**
 * Demo Mode 전용 세션 발급. AUTH_PROVIDER=supabase면 거절한다.
 * 실서비스 인증을 흉내내지 않고, 무엇이 필요한지 오류로 알려준다.
 */
export const POST = route(async ({ request, requestId }) => {
  if (env().AUTH_PROVIDER !== "demo") {
    throw new DomainError(
      "FEATURE_DISABLED",
      "Demo 세션은 AUTH_PROVIDER=demo에서만 발급됩니다.",
    );
  }

  const input = await parseBody(request, bodySchema);
  const token = authProvider().issueSession({ id: input.userId, email: input.email });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86_400,
  });

  return ok({ userId: input.userId, email: input.email }, requestId);
});

export const DELETE = route(async ({ requestId }) => {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return ok({ signedOut: true }, requestId);
});
