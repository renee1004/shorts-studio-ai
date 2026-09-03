import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DomainError } from "@shorts-os/domain";
import { env } from "./env";

export const SESSION_COOKIE = "shorts_os_session";

export type SessionUser = {
  id: string;
  email: string;
  provider: "demo" | "supabase";
};

/**
 * Phase 0의 인증 경계.
 * Supabase 자격증명이 없어도 Demo Mode가 돌아가야 하므로 Provider를 분리했다.
 * Supabase 구현은 AUTH_PROVIDER=supabase로 켜지며, 세션 해석 지점은 이 파일 하나뿐이다.
 */
export interface AuthProvider {
  readonly kind: "demo" | "supabase";
  readSession(rawCookie: string | undefined): SessionUser | null;
  issueSession(user: { id: string; email: string }): string;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export class DemoAuthProvider implements AuthProvider {
  readonly kind = "demo" as const;

  constructor(private readonly secret: string) {}

  readSession(rawCookie: string | undefined): SessionUser | null {
    if (!rawCookie) return null;
    const [payload, signature] = rawCookie.split(".");
    if (!payload || !signature) return null;

    const expected = sign(payload, this.secret);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        id?: string;
        email?: string;
        exp?: number;
      };
      if (!decoded.id || !decoded.email) return null;
      if (decoded.exp && decoded.exp < Date.now()) return null;
      return { id: decoded.id, email: decoded.email, provider: "demo" };
    } catch {
      return null;
    }
  }

  issueSession(user: { id: string; email: string }): string {
    const payload = Buffer.from(
      JSON.stringify({ ...user, exp: Date.now() + 30 * 86_400_000 }),
      "utf8",
    ).toString("base64url");
    return `${payload}.${sign(payload, this.secret)}`;
  }
}

/**
 * Supabase Auth 어댑터 자리. 자격증명이 없는 상태에서 가짜로 통과시키지 않고
 * 명확한 오류를 던진다. Phase 0 완료 조건은 Demo Mode 실행이다.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly kind = "supabase" as const;

  readSession(): SessionUser | null {
    throw new DomainError(
      "PROVIDER_NOT_CONNECTED",
      "Supabase Auth는 SUPABASE_URL과 키가 설정된 뒤 사용할 수 있습니다.",
      { details: { requirement: "SUPABASE_URL, SUPABASE_ANON_KEY" } },
    );
  }

  issueSession(): string {
    throw new DomainError("PROVIDER_NOT_CONNECTED", "Supabase Auth가 아직 연결되지 않았습니다.");
  }
}

export function authProvider(): AuthProvider {
  const current = env();
  return current.AUTH_PROVIDER === "supabase"
    ? new SupabaseAuthProvider()
    : new DemoAuthProvider(current.AUTH_SESSION_SECRET);
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return authProvider().readSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new DomainError("AUTH_REQUIRED", "로그인이 필요합니다.");
  return user;
}
