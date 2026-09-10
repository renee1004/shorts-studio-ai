import { z } from "zod";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { env } from "@/server/env";
import { SupabaseAuthClient } from "@/server/supabase-auth";
import { isHttps, sessionCookie } from "@/server/session-cookie";

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});

export const POST = route(async ({ request, requestId }) => {
  const current = env();
  if (current.AUTH_PROVIDER !== "supabase")
    throw new DomainError(
      "FEATURE_DISABLED",
      "이메일 로그인이 활성화되지 않았습니다.",
    );
  const input = await parseBody(request, credentials);
  const session = await new SupabaseAuthClient(
    current.SUPABASE_URL!,
    current.SUPABASE_ANON_KEY!,
  ).signIn(input.email, input.password);
  const response = ok(
    { userId: session.user.id, email: session.user.email },
    requestId,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.append(
    "Set-Cookie",
    sessionCookie(session.access_token, isHttps(request), session.expires_in),
  );
  return response;
});

export const DELETE = route(async ({ request, requestId }) => {
  const response = ok({ signedOut: true }, requestId);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Set-Cookie", sessionCookie("", isHttps(request), 0));
  return response;
});
