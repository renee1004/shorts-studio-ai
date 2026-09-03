import type { ResearchBriefContent } from "@shorts-os/contracts";
import type { NormalizedVideo } from "@shorts-os/domain";

/**
 * Domain은 외부 SDK 타입을 알지 못한다. 모든 Provider는 이 인터페이스만 노출한다.
 * (스펙 4.4)
 */

export type ProviderKind =
  | "youtube_data"
  | "youtube_channel"
  | "youtube_analytics"
  | "gemini"
  | "notebook_enterprise"
  | "google_trends"
  | "google_ads"
  | "storage";

export type QuotaUsage = {
  /** search.list는 2026-06부터 하루 호출 수로 관리된다. 기본값은 설정에서 온다. */
  searchCallsUsed: number;
  searchCallsLimit: number;
  unitsUsed: number;
  unitsLimit: number;
  resetsAt: string;
};

export type SearchVideosInput = {
  workspaceId: string;
  query: string;
  regionCode: string;
  relevanceLanguage: string;
  publishedAfter: Date;
  maxResults: number;
  forceRefresh?: boolean;
};

export type SearchVideosResult = {
  videoIds: string[];
  fromCache: boolean;
  quota: QuotaUsage;
  providerRequestId: string | null;
};

export type GetVideosInput = {
  workspaceId: string;
  videoIds: string[];
  forceRefresh?: boolean;
};

export type GetVideosResult = {
  videos: NormalizedVideo[];
  fromCache: boolean;
  quota: QuotaUsage;
  providerRequestId: string | null;
};

export type ChannelBaselineInput = {
  workspaceId: string;
  externalChannelId: string;
  maxVideos: number;
};

export type ChannelBaseline = {
  externalChannelId: string;
  medianViewVelocity: number | null;
  sampleSize: number;
};

export interface YouTubeDiscoveryProvider {
  readonly kind: "youtube_data";
  readonly mode: "mock" | "live";
  searchVideos(input: SearchVideosInput): Promise<SearchVideosResult>;
  getVideos(input: GetVideosInput): Promise<GetVideosResult>;
  getChannelBaseline(input: ChannelBaselineInput): Promise<ChannelBaseline>;
  getQuota(workspaceId: string): Promise<QuotaUsage>;
}

export type ResearchTopicInput = {
  workspaceId: string;
  topicTitle: string;
  /** 주제가 속한 분야. 모델이 맥락을 잡는 데만 쓴다. */
  nicheName: string;
  angleHint: string | null;
  language: string;
  maxSources: number;
};

export type ResearchTopicResult = {
  content: ResearchBriefContent;
  modelName: string;
  promptVersion: string;
  /** mock은 출처를 만들어내지 않는다. 화면이 이 값을 그대로 보여준다. */
  mode: "mock" | "live";
};

/**
 * Research Brain. (Phase 2A)
 * 출처를 만들어내지 않는 것이 이 인터페이스의 계약이다.
 * 근거를 찾지 못하면 keyFacts를 비우고 unknowns에 남긴다.
 */
export interface ResearchProvider {
  readonly kind: "gemini";
  readonly mode: "mock" | "live";
  researchTopic(input: ResearchTopicInput): Promise<ResearchTopicResult>;
}

export interface NotebookProvider {
  readonly kind: "notebook_enterprise";
  createNotebook(input: {
    workspaceId: string;
    title: string;
    locale: string;
  }): Promise<{ providerNotebookId: string; resourceName: string; url: string | null }>;
  addSources(input: {
    workspaceId: string;
    providerNotebookId: string;
    sources: { url?: string; text?: string; title: string }[];
  }): Promise<{ syncedCount: number; failed: { title: string; reason: string }[] }>;
}

export interface TrendsProvider {
  readonly kind: "google_trends";
  getInterest(input: {
    workspaceId: string;
    terms: string[];
    geo: string;
  }): Promise<{ term: string; interest: number | null; collectedAt: string }[]>;
}

export interface KeywordPlanningProvider {
  readonly kind: "google_ads";
  getKeywordMetrics(input: {
    workspaceId: string;
    keywords: string[];
    geo: string;
    language: string;
  }): Promise<
    {
      keyword: string;
      avgMonthlySearches: number | null;
      competitionIndex: number | null;
      lowTopBidMicros: number | null;
      highTopBidMicros: number | null;
      currency: string | null;
    }[]
  >;
}

export interface VideoGenerationProvider {
  readonly kind: "gemini";
  getCapabilities(): Promise<{
    maxDurationSeconds: number;
    supportsAudio: boolean;
    aspectRatios: string[];
    modelName: string;
  }>;
}

/** 비밀값은 애플리케이션 테이블에 평문으로 저장하지 않는다. (스펙 Master Prompt) */
export interface TokenVault {
  put(input: { workspaceId: string; provider: ProviderKind; value: string }): Promise<string>;
  get(secretRef: string): Promise<string>;
  revoke(secretRef: string): Promise<void>;
}
