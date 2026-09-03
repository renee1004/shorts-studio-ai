import { DomainError } from "@shorts-os/domain";
import type { FeatureFlags } from "@shorts-os/config";
import { MockYouTubeProvider } from "./mock/youtube";
import { MockResearchProvider } from "./mock/research";
import { LiveYouTubeProvider, type QuotaLedger, type ResponseCache } from "./youtube/live";
import { LiveResearchProvider } from "./gemini/research";
import type { ProviderKind, ResearchProvider, YouTubeDiscoveryProvider } from "./interfaces";

export type ProviderAvailability = {
  provider: ProviderKind;
  available: boolean;
  mode: "mock" | "live" | "disabled";
  reason?: string;
  /** 사용자에게 무엇을 하면 켜지는지 보여준다. */
  requirement?: string;
};

export type RegistryOptions = {
  appMode: "demo" | "live";
  flags: FeatureFlags;
  youtubeApiKey?: string | undefined;
  geminiApiKey?: string | undefined;
  geminiResearchModel?: string | undefined;
  quota: QuotaLedger;
  cache: ResponseCache;
  cacheTtlMinutes: number;
  retry: { maxAttempts: number; baseDelayMs: number; timeoutMs: number };
  mockSeed?: number;
  now?: () => Date;
};

/**
 * Phase에 도달하지 않은 Provider는 인터페이스만 존재하고 여기서 거절된다.
 * 가짜 성공을 돌려주지 않고 이유와 활성화 조건을 함께 준다.
 */
export class ProviderRegistry {
  constructor(private readonly options: RegistryOptions) {}

  youtubeDiscovery(): YouTubeDiscoveryProvider {
    if (!this.options.flags.youtubeDiscovery) {
      throw new DomainError("FEATURE_DISABLED", "YouTube 수집 기능이 꺼져 있습니다.", {
        details: { provider: "youtube_data", requirement: "Settings에서 youtubeDiscovery를 켜세요." },
      });
    }

    if (this.options.appMode === "live") {
      if (!this.options.youtubeApiKey) {
        throw new DomainError("PROVIDER_NOT_CONNECTED", "YouTube API Key가 없습니다.", {
          details: { provider: "youtube_data", requirement: "YOUTUBE_API_KEY를 설정하세요." },
        });
      }
      return new LiveYouTubeProvider({
        apiKey: this.options.youtubeApiKey,
        quota: this.options.quota,
        cache: this.options.cache,
        cacheTtlMinutes: this.options.cacheTtlMinutes,
        retry: this.options.retry,
        ...(this.options.now ? { now: this.options.now } : {}),
      });
    }

    return new MockYouTubeProvider({
      ...(this.options.mockSeed !== undefined ? { seed: this.options.mockSeed } : {}),
      ...(this.options.now ? { now: this.options.now() } : {}),
    });
  }

  research(): ResearchProvider {
    if (!this.options.flags.geminiResearch) {
      throw new DomainError("FEATURE_DISABLED", "Research Brain이 꺼져 있습니다.", {
        details: { provider: "gemini", requirement: "Settings에서 geminiResearch를 켜세요." },
      });
    }

    if (this.options.appMode === "live") {
      if (!this.options.geminiApiKey) {
        throw new DomainError("PROVIDER_NOT_CONNECTED", "Gemini API Key가 없습니다.", {
          details: { provider: "gemini", requirement: "GEMINI_API_KEY를 설정하세요." },
        });
      }
      if (!this.options.geminiResearchModel) {
        throw new DomainError("PROVIDER_NOT_CONNECTED", "Research 모델명이 없습니다.", {
          details: { provider: "gemini", requirement: "GEMINI_RESEARCH_MODEL을 설정하세요." },
        });
      }
      return new LiveResearchProvider({
        apiKey: this.options.geminiApiKey,
        modelName: this.options.geminiResearchModel,
        retry: this.options.retry,
      });
    }

    return new MockResearchProvider();
  }

  /** 화면에서 Provider 상태를 그대로 보여주기 위한 목록. */
  availability(): ProviderAvailability[] {
    const flags = this.options.flags;
    const youtubeLiveReady = this.options.appMode === "live" && Boolean(this.options.youtubeApiKey);
    const geminiLiveReady =
      this.options.appMode === "live" &&
      Boolean(this.options.geminiApiKey) &&
      Boolean(this.options.geminiResearchModel);

    return [
      {
        provider: "youtube_data",
        available: flags.youtubeDiscovery,
        mode: flags.youtubeDiscovery ? (youtubeLiveReady ? "live" : "mock") : "disabled",
        ...(youtubeLiveReady
          ? {}
          : { requirement: "APP_MODE=live와 YOUTUBE_API_KEY를 설정하면 실제 데이터로 바뀝니다." }),
      },
      {
        provider: "gemini",
        available: flags.geminiResearch,
        mode: flags.geminiResearch ? (geminiLiveReady ? "live" : "mock") : "disabled",
        ...(flags.geminiResearch ? {} : { reason: "FEATURE_DISABLED" }),
        ...(geminiLiveReady
          ? {}
          : {
              requirement:
                "APP_MODE=live, GEMINI_API_KEY, GEMINI_RESEARCH_MODEL을 설정하면 Search Grounding으로 바뀝니다.",
            }),
      },
      {
        provider: "notebook_enterprise",
        available: false,
        mode: "disabled",
        reason: "PHASE_2",
        requirement: "Gemini Notebook Enterprise 라이선스와 Google Cloud 프로젝트가 필요합니다.",
      },
      {
        provider: "google_trends",
        available: false,
        mode: "disabled",
        reason: "ALPHA_ACCESS_REQUIRED",
        requirement: "Trends API Alpha 승인 또는 CSV Import가 필요합니다.",
      },
      {
        provider: "google_ads",
        available: false,
        mode: "disabled",
        reason: "DEVELOPER_TOKEN_REQUIRED",
        requirement: "승인된 개발자 토큰 또는 Keyword Planner CSV Import가 필요합니다.",
      },
      {
        provider: "youtube_analytics",
        available: false,
        mode: "disabled",
        reason: "PHASE_6",
        requirement: "본인 채널 OAuth 연결이 필요합니다.",
      },
    ];
  }
}
