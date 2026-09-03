import { describe, expect, it } from "vitest";
import { DomainError } from "@shorts-os/domain";
import { MockYouTubeProvider } from "./youtube";
import { withRetry } from "../errors";
import { parseIsoDuration, normalizeVideo } from "../youtube/live";

const now = new Date("2026-09-03T00:00:00Z");

describe("MockYouTubeProvider", () => {
  it("같은 시드는 같은 결과를 낸다", async () => {
    const first = new MockYouTubeProvider({ seed: 7, now });
    const second = new MockYouTubeProvider({ seed: 7, now });

    const a = await first.searchVideos(input());
    const b = await second.searchVideos(input());

    expect(a.videoIds).toStrictEqual(b.videoIds);
  });

  it("검색 호출이 쿼터에 기록된다", async () => {
    const provider = new MockYouTubeProvider({ seed: 7, now });
    await provider.searchVideos(input());
    await provider.searchVideos({ ...input(), query: "other" });

    const quota = await provider.getQuota("ws");
    expect(quota.searchCallsUsed).toBe(2);
    expect(quota.searchCallsLimit).toBe(100);
  });

  it("검색 한도를 넘으면 PROVIDER_QUOTA_EXCEEDED를 던진다", async () => {
    const provider = new MockYouTubeProvider({ seed: 7, now, searchCallsLimit: 1 });
    await provider.searchVideos(input());

    await expect(provider.searchVideos({ ...input(), query: "second" })).rejects.toMatchObject({
      code: "PROVIDER_QUOTA_EXCEEDED",
      retryable: true,
    });
  });

  it("429는 재시도 가능한 오류로 정규화된다", async () => {
    const provider = new MockYouTubeProvider({
      seed: 7,
      now,
      scenario: { failWith: { status: 429, retryAfterSeconds: 30 } },
    });

    await expect(provider.searchVideos(input())).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });

  it("5xx는 재시도 후 성공한다", async () => {
    const provider = new MockYouTubeProvider({
      seed: 7,
      now,
      scenario: { failWith: { status: 503 }, failTimes: 2 },
    });

    const result = await withRetry(
      { maxAttempts: 3, baseDelayMs: 0, timeoutMs: 1000 },
      () => provider.searchVideos(input()),
      async () => {},
    );

    expect(result.videoIds.length).toBeGreaterThan(0);
  });

  it("401은 재시도하지 않는다", async () => {
    const provider = new MockYouTubeProvider({
      seed: 7,
      now,
      scenario: { failWith: { status: 401 } },
    });

    let attempts = 0;
    await expect(
      withRetry(
        { maxAttempts: 3, baseDelayMs: 0, timeoutMs: 1000 },
        () => {
          attempts += 1;
          return provider.searchVideos(input());
        },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(DomainError);

    expect(attempts).toBe(1);
  });
});

describe("live provider normalization", () => {
  it("ISO 8601 기간을 초로 바꾼다", () => {
    expect(parseIsoDuration("PT1M30S")).toBe(90);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("garbage")).toBeNull();
  });

  it("필수 필드가 없으면 영상을 버린다", () => {
    expect(normalizeVideo({ id: "abc" })).toBeNull();
  });

  it("통계가 비어 있으면 0이 아니라 null로 남긴다", () => {
    const video = normalizeVideo({
      id: "abc",
      snippet: { title: "t", channelId: "ch", publishedAt: "2026-09-01T00:00:00Z" },
      contentDetails: { duration: "PT30S" },
    });

    expect(video?.viewCount).toBeNull();
    expect(video?.likeCount).toBeNull();
    expect(video?.durationSeconds).toBe(30);
  });
});

function input() {
  return {
    workspaceId: "ws",
    query: "AI automation",
    regionCode: "US",
    relevanceLanguage: "en",
    publishedAfter: new Date("2026-08-01T00:00:00Z"),
    maxResults: 10,
  };
}
