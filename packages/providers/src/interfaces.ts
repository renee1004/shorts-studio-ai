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

/** Phase 2 이후 구현. 인터페이스만 먼저 고정한다. */
export interface ResearchProvider {
  readonly kind: "gemini";
  researchTopic(input: {
    workspaceId: string;
    topicTitle: string;
    language: string;
  }): Promise<{
    summary: string;
    citations: { url: string; title: string; publishedAt: string | null }[];
    modelName: string;
  }>;
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
