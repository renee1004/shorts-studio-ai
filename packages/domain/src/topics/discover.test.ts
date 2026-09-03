import { describe, expect, it } from "vitest";
import { discoverTopics, type NormalizedVideo } from "./discover";

const now = new Date("2026-09-03T00:00:00Z");

function video(overrides: Partial<NormalizedVideo> & Pick<NormalizedVideo, "externalVideoId" | "title">): NormalizedVideo {
  return {
    externalChannelId: "ch_1",
    channelTitle: "Channel One",
    url: `https://www.youtube.com/watch?v=${overrides.externalVideoId}`,
    description: null,
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    durationSeconds: 48,
    viewCount: 50_000,
    likeCount: 1_000,
    commentCount: 100,
    ...overrides,
  };
}

const options = {
  excludeTerms: [] as string[],
  velocityReferencePerHour: 2000,
  maxTopics: 10,
  now,
  reliability: { youtube: 0.95, derived: 0.7 },
  unavailable: {
    searchInterest: "GOOGLE_TRENDS_NOT_CONNECTED",
    commercialIntent: "GOOGLE_ADS_NOT_CONNECTED",
  },
};

describe("discoverTopics", () => {
  it("반복되는 두 단어 표현으로 주제를 묶는다", () => {
    const candidates = discoverTopics({
      ...options,
      videos: [
        video({ externalVideoId: "a", title: "weekly reporting with AI" }),
        video({ externalVideoId: "b", title: "weekly reporting template", externalChannelId: "ch_2" }),
        video({ externalVideoId: "c", title: "inbox triage basics", externalChannelId: "ch_3" }),
      ],
    });

    const titles = candidates.map((candidate) => candidate.normalizedTitle);
    expect(titles).toContain("weekly reporting");
    // 한 번만 등장한 표현은 주제가 되지 않는다.
    expect(titles).not.toContain("inbox triage");
  });

  it("단어 하나짜리는 주제로 만들지 않는다", () => {
    const candidates = discoverTopics({
      ...options,
      videos: [
        video({ externalVideoId: "a", title: "automation" }),
        video({ externalVideoId: "b", title: "automation" }),
        video({ externalVideoId: "c", title: "automation" }),
      ],
    });

    expect(candidates).toHaveLength(0);
  });

  it("연결되지 않은 Provider 신호는 결측 사유와 함께 null로 남는다", () => {
    const [candidate] = discoverTopics({
      ...options,
      videos: [
        video({ externalVideoId: "a", title: "weekly reporting with AI" }),
        video({ externalVideoId: "b", title: "weekly reporting template", externalChannelId: "ch_2" }),
      ],
    });

    const search = candidate?.signals.find((signal) => signal.key === "search_interest");
    const ads = candidate?.signals.find((signal) => signal.key === "commercial_intent");

    expect(search?.normalizedScore).toBeNull();
    expect(search?.unavailableReason).toBe("GOOGLE_TRENDS_NOT_CONNECTED");
    expect(ads?.normalizedScore).toBeNull();
    expect(ads?.unavailableReason).toBe("GOOGLE_ADS_NOT_CONNECTED");
  });

  it("제외 키워드가 걸리면 Hard Block 패널티를 붙인다", () => {
    const [candidate] = discoverTopics({
      ...options,
      excludeTerms: ["get rich"],
      videos: [
        video({ externalVideoId: "a", title: "get rich fast method" }),
        video({ externalVideoId: "b", title: "get rich fast tricks", externalChannelId: "ch_2" }),
      ],
    });

    expect(candidate?.penalties[0]?.hardBlock).toBe(true);
  });

  it("같은 입력이면 같은 순서와 개수를 낸다", () => {
    const videos = [
      video({ externalVideoId: "a", title: "weekly reporting with AI" }),
      video({ externalVideoId: "b", title: "weekly reporting template", externalChannelId: "ch_2" }),
      video({ externalVideoId: "c", title: "client onboarding flow", externalChannelId: "ch_3" }),
      video({ externalVideoId: "d", title: "client onboarding checklist", externalChannelId: "ch_4" }),
    ];

    const first = discoverTopics({ ...options, videos });
    const second = discoverTopics({ ...options, videos });

    expect(first.map((c) => c.normalizedTitle)).toStrictEqual(second.map((c) => c.normalizedTitle));
  });

  it("게시 시각이 없으면 조회 속도를 만들지 않는다", () => {
    const [candidate] = discoverTopics({
      ...options,
      videos: [
        video({ externalVideoId: "a", title: "weekly reporting with AI", publishedAt: null }),
        video({
          externalVideoId: "b",
          title: "weekly reporting template",
          publishedAt: null,
          externalChannelId: "ch_2",
        }),
      ],
    });

    const velocity = candidate?.signals.find((signal) => signal.key === "youtube_velocity");
    expect(velocity?.normalizedScore).toBeNull();
    expect(velocity?.unavailableReason).toBe("NO_PUBLISHED_AT_OR_VIEWS");
  });
});
