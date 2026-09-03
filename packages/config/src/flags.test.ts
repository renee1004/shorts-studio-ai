import { describe, expect, it } from "vitest";
import { defaultFeatureFlags, resolveFeatureFlags } from "./flags";
import { EnvValidationError, loadServerEnv } from "./env";

describe("feature flags", () => {
  it("기본값은 스펙 14.4와 같다", () => {
    expect(defaultFeatureFlags).toStrictEqual({
      youtubeDiscovery: true,
      geminiResearch: false,
      notebookSync: false,
      googleTrendsApi: false,
      googleAdsApi: false,
      videoGeneration: false,
      youtubePublishing: false,
      youtubeAnalytics: false,
      autoPublish: false,
    });
  });

  it("Phase에 도달하지 않은 플래그는 켜달라고 해도 잠긴다", () => {
    const { flags, resolved } = resolveFeatureFlags({
      workspaceFlags: { videoGeneration: true, youtubePublishing: true, autoPublish: true },
    });

    expect(flags.videoGeneration).toBe(false);
    expect(flags.autoPublish).toBe(false);
    expect(resolved.find((flag) => flag.key === "videoGeneration")?.lockedReason).toBe(
      "NOT_IMPLEMENTED_IN_CURRENT_PHASE",
    );
  });

  it("Phase 2A의 geminiResearch는 워크스페이스 설정으로 켤 수 있다", () => {
    const { flags, resolved } = resolveFeatureFlags({
      workspaceFlags: { geminiResearch: true },
    });

    expect(flags.geminiResearch).toBe(true);
    expect(resolved.find((flag) => flag.key === "geminiResearch")?.lockedReason).toBeUndefined();
  });

  it("환경변수 재정의가 워크스페이스 설정을 덮는다", () => {
    const { flags, resolved } = resolveFeatureFlags({
      workspaceFlags: { youtubeDiscovery: true },
      envOverride: { youtubeDiscovery: false },
    });

    expect(flags.youtubeDiscovery).toBe(false);
    expect(resolved.find((flag) => flag.key === "youtubeDiscovery")?.source).toBe("env");
  });
});

describe("env validation", () => {
  const base = { DATABASE_URL: "postgresql://localhost:5432/app" };

  it("Demo Mode는 외부 키 없이 통과한다", () => {
    const env = loadServerEnv(base as NodeJS.ProcessEnv);
    expect(env.APP_MODE).toBe("demo");
    expect(env.AUTH_PROVIDER).toBe("demo");
  });

  it("DATABASE_URL이 없으면 즉시 실패한다", () => {
    expect(() => loadServerEnv({} as NodeJS.ProcessEnv)).toThrow(EnvValidationError);
  });

  it("live 모드는 YouTube 키를 요구한다", () => {
    expect(() =>
      loadServerEnv({ ...base, APP_MODE: "live" } as NodeJS.ProcessEnv),
    ).toThrow(/YOUTUBE_API_KEY/);
  });

  it("supabase 인증은 URL과 키를 요구한다", () => {
    expect(() =>
      loadServerEnv({ ...base, AUTH_PROVIDER: "supabase" } as NodeJS.ProcessEnv),
    ).toThrow(/SUPABASE_URL/);
  });

  it("production에서 기본 세션 비밀값을 막는다", () => {
    expect(() =>
      loadServerEnv({ ...base, NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_SESSION_SECRET/);
  });

  it("잘못된 플래그 JSON은 오류로 알려준다", () => {
    expect(() =>
      loadServerEnv({ ...base, FEATURE_FLAGS_OVERRIDE: "{not json" } as NodeJS.ProcessEnv),
    ).toThrow(/FEATURE_FLAGS_OVERRIDE/);
  });
});
