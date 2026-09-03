import type { NormalizedVideo } from "@shorts-os/domain";
import { median, videoAgeHours, viewVelocity } from "@shorts-os/domain";
import { normalizeProviderError } from "../errors";
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

/** 고정 시드 난수. Demo와 테스트 결과가 매번 같아야 한다. (스펙 6.5) */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

const channelNames = [
  "Automation Weekly",
  "AI Desk",
  "Career Lab",
  "Productivity Field",
  "Studio Notes",
  "Deep Work Daily",
];

/** 클러스터가 형성되도록 반복되는 주제 구를 가진 제목을 만든다. */
const subjects = [
  "weekly reporting",
  "client onboarding",
  "inbox triage",
  "meeting notes",
  "data cleanup",
  "lead scoring",
  "invoice approval",
  "content calendar",
];

const templates = [
  "{subject} with {seed}",
  "{subject} in 60 seconds",
  "why {subject} breaks after one week",
  "{subject} cost compared to manual work",
  "{subject} template you can copy",
  "{subject} mistakes beginners repeat",
];

export type MockScenario = {
  /** 강제로 오류를 던져 재시도·정규화 경로를 테스트한다. */
  failWith?: { status?: number; code?: string; retryAfterSeconds?: number };
  failTimes?: number;
};

export type MockYouTubeOptions = {
  seed?: number;
  now?: Date;
  scenario?: MockScenario;
  searchCallsLimit?: number;
  unitsLimit?: number;
};

/**
 * 외부 Key 없이 Phase 0-1 전체 흐름을 돌리기 위한 Mock.
 * 성공을 고정 반환하지 않고 쿼터·캐시·오류를 실제 Provider와 같은 형태로 흉내낸다.
 */
export class MockYouTubeProvider implements YouTubeDiscoveryProvider {
  readonly kind = "youtube_data" as const;
  readonly mode = "mock" as const;

  private readonly now: Date;
  private readonly seed: number;
  private readonly scenario: MockScenario | undefined;
  private readonly videoCache = new Map<string, NormalizedVideo>();
  private failureCount = 0;
  private searchCalls = 0;
  private units = 0;
  private readonly searchCallsLimit: number;
  private readonly unitsLimit: number;

  constructor(options: MockYouTubeOptions = {}) {
    this.now = options.now ?? new Date("2026-09-03T00:00:00Z");
    this.seed = options.seed ?? 20260903;
    this.scenario = options.scenario;
    this.searchCallsLimit = options.searchCallsLimit ?? 100;
    this.unitsLimit = options.unitsLimit ?? 10000;
  }

  private maybeFail(): void {
    const scenario = this.scenario;
    if (!scenario?.failWith) return;
    const limit = scenario.failTimes ?? Number.POSITIVE_INFINITY;
    if (this.failureCount >= limit) return;
    this.failureCount += 1;
    throw normalizeProviderError({
      provider: "youtube_data",
      ...scenario.failWith,
      message: "Mock YouTube 오류",
    });
  }

  private quota(): QuotaUsage {
    const resetsAt = new Date(this.now);
    resetsAt.setUTCHours(24, 0, 0, 0);
    return {
      searchCallsUsed: this.searchCalls,
      searchCallsLimit: this.searchCallsLimit,
      unitsUsed: this.units,
      unitsLimit: this.unitsLimit,
      resetsAt: resetsAt.toISOString(),
    };
  }

  private buildVideos(query: string, count: number): NormalizedVideo[] {
    const random = seededRandom(this.seed + hash(query));
    const videos: NormalizedVideo[] = [];

    for (let index = 0; index < count; index += 1) {
      const template = templates[index % templates.length] as string;
      const subject = subjects[Math.floor(index / templates.length) % subjects.length] as string;
      const channelTitle = channelNames[Math.floor(random() * channelNames.length)] as string;
      const ageHours = Math.round(6 + random() * 900);
      const publishedAt = new Date(this.now.getTime() - ageHours * 3_600_000);
      const durationSeconds = [28, 42, 55, 61, 95, 180, 420][Math.floor(random() * 7)] as number;
      const viewCount = Math.round(400 + random() ** 2 * 900_000);
      const externalVideoId = `mock_${hash(`${query}-${index}`).toString(36)}`;

      const video: NormalizedVideo = {
        externalVideoId,
        externalChannelId: `mock_ch_${hash(channelTitle).toString(36)}`,
        channelTitle,
        url: `https://www.youtube.com/watch?v=${externalVideoId}`,
        title: template.replace("{subject}", subject).replace("{seed}", query),
        description: `${query} 관련 데모 메타데이터입니다.`,
        publishedAt,
        durationSeconds,
        viewCount,
        likeCount: Math.round(viewCount * (0.01 + random() * 0.05)),
        commentCount: Math.round(viewCount * (0.001 + random() * 0.004)),
      };
      this.videoCache.set(externalVideoId, video);
      videos.push(video);
    }

    return videos;
  }

  async searchVideos(input: SearchVideosInput): Promise<SearchVideosResult> {
    this.maybeFail();
    if (this.searchCalls >= this.searchCallsLimit) {
      throw normalizeProviderError({
        provider: "youtube_data",
        code: "dailyLimitExceeded",
        message: "search 호출 한도를 초과했습니다.",
        retryAfterSeconds: 3600,
      });
    }
    this.searchCalls += 1;
    this.units += 1;

    const videos = this.buildVideos(input.query, Math.min(input.maxResults, 25));
    return {
      videoIds: videos.map((video) => video.externalVideoId),
      fromCache: false,
      quota: this.quota(),
      providerRequestId: `mock_req_${this.searchCalls}`,
    };
  }

  async getVideos(input: GetVideosInput): Promise<GetVideosResult> {
    this.maybeFail();
    this.units += Math.ceil(input.videoIds.length / 50);

    const videos = input.videoIds
      .map((id) => this.videoCache.get(id))
      .filter((video): video is NormalizedVideo => video !== undefined);

    return {
      videos,
      fromCache: true,
      quota: this.quota(),
      providerRequestId: `mock_req_videos_${this.units}`,
    };
  }

  async getChannelBaseline(input: ChannelBaselineInput): Promise<ChannelBaseline> {
    this.maybeFail();
    const videos = [...this.videoCache.values()].filter(
      (video) => video.externalChannelId === input.externalChannelId,
    );
    const velocities = videos
      .map((video) =>
        video.publishedAt ? viewVelocity(video.viewCount, videoAgeHours(video.publishedAt, this.now)) : null,
      )
      .filter((value): value is number => value !== null);

    return {
      externalChannelId: input.externalChannelId,
      medianViewVelocity: median(velocities),
      sampleSize: velocities.length,
    };
  }

  async getQuota(): Promise<QuotaUsage> {
    return this.quota();
  }
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
