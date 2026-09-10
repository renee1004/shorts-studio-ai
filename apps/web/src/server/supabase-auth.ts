import { z } from "zod";
import { DomainError } from "@shorts-os/domain";

const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1).max(3500),
  expires_in: z.number().int().positive(),
  user: userSchema,
});

/** Server-only REST client. A session is trusted only after Auth verifies it. */
export class SupabaseAuthClient {
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async call(path: string, init: RequestInit = {}) {
    try {
      return await this.request(
        `${this.url.replace(/\/$/, "")}/auth/v1/${path}`,
        {
          ...init,
          headers: {
            apikey: this.key,
            "Content-Type": "application/json",
            ...init.headers,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  async signIn(email: string, password: string) {
    const response = await this.call("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (response.status === 429) {
      throw new DomainError(
        "PROVIDER_RATE_LIMITED",
        "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    if (response.status >= 500) {
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "로그인 서버가 응답하지 않습니다.",
      );
    }
    if (!response.ok) {
      throw new DomainError(
        "AUTH_REQUIRED",
        "이메일과 비밀번호를 확인해 주세요.",
      );
    }
    const parsed = tokenSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "로그인 응답을 확인할 수 없습니다.",
      );
    return parsed.data;
  }

  async readSession(token: string | undefined) {
    if (!token) return null;
    const response = await this.call("user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok)
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "로그인 상태를 확인할 수 없습니다.",
      );
    const parsed = userSchema.safeParse(await response.json());
    return parsed.success
      ? { ...parsed.data, provider: "supabase" as const }
      : null;
  }
}
