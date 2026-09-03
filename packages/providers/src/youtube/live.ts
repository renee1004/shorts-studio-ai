import type { NormalizedVideo } from "@shorts-os/domain";
import { median, videoAgeHours, viewVelocity } from "@shorts-os/domain";
import { normalizeProviderError, withRetry, withTimeout, type RetryPolicy } from "../errors";
import type {
  ChannelBaseline,
  ChannelBaselineInput,
  GetVideosInput,
  GetVideosResult,
  QuotaUsage,
  SearchVideosInput,
  SearchVideosResult,
  YouTubeDiscoveryProvider,
} from "../interfaces";

const API_BASE = "https://www.googleapis.com/youtube/v3";

export type QuotaLedger = {
  /** 호출 회계는 저장소가 담당한다. Provider는 인터페이스만 쓴다. */
  consume(input: {
    workspaceId: string;
    searchCalls: number;
    units: number;
  }): Promise<QuotaUsage>;
  read(workspaceId: string): Promise<QuotaUsage>;
};

export type ResponseCache = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlMinutes: number): Promise<void>;
};

export type LiveYouTubeOptions = {
  apiKey: string;
  quota: QuotaLedger;
  cache: ResponseCache;
  cacheTtlMinutes: number;
  retry: RetryPolicy;
  now?: () => Date;
  fetchImpl?: typeof fetch;
};

/**
 * 공개 메타데이터만 읽는다. 페이지 스크래핑이나 권한 없는 자막 다운로드는 하지 않는다.
 * (스펙 1.2, Master Prompt)
 */
export class LiveYouTubeProvider implements YouTubeDiscoveryProvider {
  readonly kind = "youtube_data" as const;
  readonly mode = "live" as const;

  constructor(private readonly options: LiveYouTubeOptions) {}

  private get now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("key", this.options.apiKey);

    const fetchImpl = this.options.fetchImpl ?? fetch;

    return withRetry(this.options.retry, async () =>
      withTimeout(this.options.retry.timeoutMs, "youtube_data", async (signal) => {
        const response = await fetchImpl(url, { signal, headers: { accept: "application/json" } });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { errors?: { reason?: string }[]; message?: string };
          };
          const retryAfter = Number(response.headers.get("retry-after") ?? "");
          throw normalizeProviderError({
            provider: "youtube_data",
            status: response.status,
            ...(body.error?.errors?.[0]?.reason ? { code: body.error.errors[0].reason } : {}),
            ...(body.error?.message ? { message: body.error.message } : {}),
            ...(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {}),
          });
        }

        return (await response.json()) as T;
      }),
    );
  }

  async searchVideos(input: SearchVideosInput): Promise<SearchVideosResult> {
    const cacheKey = [
      "yt:search",
      input.query,
      input.regionCode,
      input.relevanceLanguage,
      input.publishedAfter.toISOString().slice(0, 10),
      String(input.maxResults),
    ].join("|");

    if (!input.forceRefresh) {
      const cached = (await this.options.cache.get(cacheKey)) as string[] | null;
      if (cached) {
        return {
          videoIds: cached,
          fromCache: true,
          quota: await this.options.quota.read(input.workspaceId),
          providerRequestId: null,
        };
      }
    }

    const quota = await this.options.quota.consume({
      workspaceId: input.workspaceId,
      searchCalls: 1,
      units: 1,
    });

    const payload = await this.call<{
      items?: { id?: { videoId?: string } }[];
    }>("search", {
      part: "id",
      type: "video",
      q: input.query,
      regionCode: input.regionCode,
      relevanceLanguage: input.relevanceLanguage,
      publishedAfter: input.publishedAfter.toISOString(),
      maxResults: String(Math.min(input.maxResults, 50)),
      order: "viewCount",
    });

    const videoIds = (payload.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => typeof id === "string");

    await this.options.cache.set(cacheKey, videoIds, this.options.cacheTtlMinutes);

    return { videoIds, fromCache: false, quota, providerRequestId: null };
  }

  async getVideos(input: GetVideosInput): Promise<GetVideosResult> {
    if (input.videoIds.length === 0) {
      return {
        videos: [],
        fromCache: true,
        quota: await this.options.quota.read(input.workspaceId),
        providerRequestId: null,
      };
    }

    const batches: string[][] = [];
    for (let index = 0; index < input.videoIds.length; index += 50) {
      batches.push(input.videoIds.slice(index, index + 50));
    }

    const quota = await this.options.quota.consume({
      workspaceId: input.workspaceId,
      searchCalls: 0,
      units: batches.length,
    });

    const videos: NormalizedVideo[] = [];

    for (const batch of batches) {
      const payload = await this.call<{ items?: RawVideoItem[] }>("videos", {
        part: "snippet,statistics,contentDetails",
        id: batch.join(","),
        maxResults: "50",
      });
      for (const item of payload.items ?? []) {
        const normalized = normalizeVideo(item);
        if (normalized) videos.push(normalized);
      }
    }

    return { videos, fromCache: false, quota, providerRequestId: null };
  }

  async getChannelBaseline(input: ChannelBaselineInput): Promise<ChannelBaseline> {
    const search = await this.searchVideos({
      workspaceId: input.workspaceId,
      query: "",
      regionCode: "US",
      relevanceLanguage: "en",
      publishedAfter: new Date(this.now.getTime() - 90 * 86_400_000),
      maxResults: input.maxVideos,
    });

    const { videos } = await this.getVideos({
      workspaceId: input.workspaceId,
      videoIds: search.videoIds,
    });

    const velocities = videos
      .filter((video) => video.externalChannelId === input.externalChannelId && video.publishedAt)
      .map((video) => viewVelocity(video.viewCount, videoAgeHours(video.publishedAt!, this.now)))
      .filter((value): value is number => value !== null);

    return {
      externalChannelId: input.externalChannelId,
      medianViewVelocity: median(velocities),
      sampleSize: velocities.length,
    };
  }

  async getQuota(workspaceId: string): Promise<QuotaUsage> {
    return this.options.quota.read(workspaceId);
  }
}

type RawVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

/** ISO 8601 기간(PT1M30S)을 초로 바꾼다. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return Number.isFinite(total) ? Math.round(total) : null;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeVideo(item: RawVideoItem): NormalizedVideo | null {
  if (!item.id || !item.snippet?.title || !item.snippet.channelId) return null;
  const publishedAt = item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : null;

  return {
    externalVideoId: item.id,
    externalChannelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle ?? "",
    url: `https://www.youtube.com/watch?v=${item.id}`,
    title: item.snippet.title,
    description: item.snippet.description ?? null,
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    viewCount: toNumber(item.statistics?.viewCount),
    likeCount: toNumber(item.statistics?.likeCount),
    commentCount: toNumber(item.statistics?.commentCount),
  };
}
