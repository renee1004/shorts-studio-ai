import { z } from "zod";

/**
 * 서버에서만 읽는 환경변수. Client bundle에 들어가면 안 되는 값은 이 스키마에만 존재한다.
 * 모델명·쿼터·가중치는 여기(설정)로 관리하고 코드에 고정하지 않는다.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_MODE: z.enum(["demo", "live"]).default("demo"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL이 필요합니다."),
  /** RLS를 실제로 통과시키기 위한 비소유자 역할 접속 문자열. 없으면 DATABASE_URL을 쓴다. */
  DATABASE_APP_URL: z.string().min(1).optional(),

  AUTH_PROVIDER: z.enum(["demo", "supabase"]).default("demo"),
  AUTH_SESSION_SECRET: z
    .string()
    .min(16)
    .default("demo-session-secret-change-me"),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  YOUTUBE_API_KEY: z.string().min(1).optional(),
  YOUTUBE_SEARCH_DAILY_LIMIT: z.coerce.number().int().positive().default(100),
  YOUTUBE_UNITS_DAILY_LIMIT: z.coerce.number().int().positive().default(10000),
  YOUTUBE_CACHE_TTL_MINUTES: z.coerce.number().int().positive().default(360),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  PROVIDER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),

  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_RESEARCH_MODEL: z.string().min(1).optional(),
  GEMINI_TTS_MODEL: z.string().min(1).optional(),
  GEMINI_TTS_VOICE: z.string().min(1).default("Kore"),
  GEMINI_CONTENT_MODEL: z.string().min(1).optional(),

  FEATURE_FLAGS_OVERRIDE: z.string().optional(),

  /** 로컬 미디어 파일 루트. Worker와 Web이 같은 경로를 봐야 한다. */
  MEDIA_ROOT: z.string().min(1).default(".data/media"),
  /** Video Factory Worker. 없으면 웹 프로세스가 렌더를 이어서 실행한다. */
  WORKER_URL: z.string().url().optional(),
  WORKER_SHARED_SECRET: z
    .string()
    .min(8)
    .default("demo-worker-secret-change-me"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  featureFlagsOverride: Record<string, boolean>;
};

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`환경변수 검증 실패:\n- ${issues.join("\n- ")}`);
    this.name = "EnvValidationError";
  }
}

function parseFlagOverride(raw: string | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .filter(([, value]) => typeof value === "boolean")
          .map(([key, value]) => [key, value as boolean]),
      );
    }
  } catch {
    throw new EnvValidationError([
      "FEATURE_FLAGS_OVERRIDE가 올바른 JSON이 아닙니다.",
    ]);
  }
  return {};
}

let cached: ServerEnv | null = null;

export function loadServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  // .env.example intentionally leaves optional providers blank. Treat those
  // blanks like absent values, while required DATABASE_URL still fails validation.
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value?.trim() === "" ? undefined : value,
    ]),
  );
  const parsed = serverEnvSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }

  const env = parsed.data;
  const issues: string[] = [];

  if (env.APP_MODE === "live" && env.AUTH_PROVIDER === "demo") {
    issues.push(
      "APP_MODE=live에는 실제 계정 인증(AUTH_PROVIDER=supabase)이 필요합니다.",
    );
  }

  if (env.AUTH_PROVIDER === "supabase") {
    if (!env.SUPABASE_URL)
      issues.push("AUTH_PROVIDER=supabase에는 SUPABASE_URL이 필요합니다.");
    if (!env.SUPABASE_ANON_KEY)
      issues.push("AUTH_PROVIDER=supabase에는 SUPABASE_ANON_KEY가 필요합니다.");
  }
  // Provider credentials are checked when that provider is requested.
  // Gemini-only creation must not require a YouTube discovery key.
  if (
    env.NODE_ENV === "production" &&
    (env.AUTH_SESSION_SECRET.length < 32 ||
      /change-me|change-this/i.test(env.AUTH_SESSION_SECRET))
  ) {
    issues.push(
      "production에서는 AUTH_SESSION_SECRET을 32자 이상의 무작위 값으로 바꿔야 합니다.",
    );
  }

  if (issues.length > 0) throw new EnvValidationError(issues);

  return {
    ...env,
    featureFlagsOverride: parseFlagOverride(env.FEATURE_FLAGS_OVERRIDE),
  };
}

export function serverEnv(): ServerEnv {
  cached ??= loadServerEnv();
  return cached;
}

export function resetServerEnvCache() {
  cached = null;
}
