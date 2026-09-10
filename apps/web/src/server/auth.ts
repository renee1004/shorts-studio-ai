import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DomainError } from "@shorts-os/domain";
import { env } from "./env";
import { SupabaseAuthClient } from "./supabase-auth";
import { cache } from "react";

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
  readSession(
    rawCookie: string | undefined,
  ): SessionUser | null | Promise<SessionUser | null>;
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
    const [payload, signature, extra] = rawCookie.split(".");
    if (extra !== undefined) return null;
    if (!payload || !signature) return null;

    const expected = sign(payload, this.secret);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want))
      return null;

    try {
      const decoded = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as {
        id?: string;
        email?: string;
        exp?: number;
      };
      if (!decoded.id || !decoded.email) return null;
      if (typeof decoded.exp !== "number" || decoded.exp <= Date.now())
        return null;
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

/** Supabase access tokens are verified by the Auth server, never decoded on trust. */
export class SupabaseAuthProvider implements AuthProvider {
  readonly kind = "supabase" as const;

  readSession(rawCookie: string | undefined): Promise<SessionUser | null> {
    const current = env();
    return new SupabaseAuthClient(
      current.SUPABASE_URL!,
      current.SUPABASE_ANON_KEY!,
    ).readSession(rawCookie);
  }

  issueSession(): string {
    throw new DomainError(
      "PERMISSION_DENIED",
      "Supabase 세션은 이메일 로그인으로 발급해야 합니다.",
    );
  }
}

export function authProvider(): AuthProvider {
  const current = env();
  return current.AUTH_PROVIDER === "supabase"
    ? new SupabaseAuthProvider()
    : new DemoAuthProvider(current.AUTH_SESSION_SECRET);
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return authProvider().readSession(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new DomainError("AUTH_REQUIRED", "로그인이 필요합니다.");
  return user;
}
