import type { SignalInput } from "@shorts-os/contracts";
import { median, normalizeVelocity, videoAgeHours, viewVelocity } from "../scoring/velocity";
import type { Penalty } from "../scoring/score";

export type NormalizedVideo = {
  externalVideoId: string;
  externalChannelId: string;
  channelTitle: string;
  url: string;
  title: string;
  description: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type TopicCandidate = {
  keyphrase: string;
  title: string;
  normalizedTitle: string;
  angleHint: string;
  videoIds: string[];
  distinctChannels: number;
  medianVelocity: number | null;
  medianAgeHours: number | null;
  signals: SignalInput[];
  penalties: Penalty[];
};

export type DiscoverTopicsOptions = {
  videos: NormalizedVideo[];
  excludeTerms: string[];
  /** 조회 속도 정규화 상한. 설정값이며 코드에 고정하지 않는다. */
  velocityReferencePerHour: number;
  maxTopics: number;
  now: Date;
  /** Provider 신뢰 등급. YouTube 공개 지표는 높고 추론 신호는 낮다. */
  reliability: { youtube: number; derived: number };
  /** 아직 연결되지 않은 Provider를 결측 사유로 남긴다. */
  unavailable: { searchInterest: string; commercialIntent: string };
};

const stopwords = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "your", "you", "how",
  "what", "why", "best", "top", "new", "get", "make", "made", "using", "use", "vs", "is", "are",
  "this", "that", "it", "my", "we", "do", "does", "can", "should", "will", "from", "at", "by",
  "shorts", "short", "video", "youtube", "tutorial", "guide", "tips", "tip", "part",
  "그리고", "그런데", "하는", "하는법", "방법", "정리", "완전", "총정리", "이유", "때문", "위한",
  "가장", "제일", "진짜", "요즘", "지금", "오늘", "영상", "쇼츠",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopwords.has(token));
}

function phrasesOf(video: NormalizedVideo): string[] {
  const tokens = tokenize(video.title);
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const first = tokens[i] as string;
    phrases.push(first);
    const second = tokens[i + 1];
    if (second) phrases.push(`${first} ${second}`);
  }
  return [...new Set(phrases)];
}

export function normalizeTopicTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function titleCase(phrase: string): string {
  return phrase
    .split(" ")
    .map((word) => (/^[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * 공개 메타데이터만으로 주제 후보를 만든다.
 * 제목 문장을 복제하지 않고 반복되는 표현(구)을 근거로 묶는다.
 */
export function discoverTopics(options: DiscoverTopicsOptions): TopicCandidate[] {
  const { videos, now, maxTopics } = options;
  const exclude = options.excludeTerms.map((term) => term.toLowerCase()).filter(Boolean);

  const phraseIndex = new Map<string, NormalizedVideo[]>();
  for (const video of videos) {
    for (const phrase of phrasesOf(video)) {
      const bucket = phraseIndex.get(phrase) ?? [];
      bucket.push(video);
      phraseIndex.set(phrase, bucket);
    }
  }

  const ranked = [...phraseIndex.entries()]
    .filter(([phrase, bucket]) => {
      // 단어 하나는 주제가 되지 못한다. 두 단어 이상 반복되는 표현만 후보로 본다.
      if (!phrase.includes(" ")) return false;
      return bucket.length >= 2;
    })
    .map(([phrase, bucket]) => {
      const channels = new Set(bucket.map((video) => video.externalChannelId));
      const velocities = bucket
        .map((video) =>
          video.publishedAt
            ? viewVelocity(video.viewCount, videoAgeHours(video.publishedAt, now))
            : null,
        )
        .filter((value): value is number => value !== null);
      return {
        phrase,
        bucket,
        distinctChannels: channels.size,
        medianVelocity: median(velocities),
        // 정렬 기준: 반복 횟수, 채널 다양성, 조회 속도
        rank:
          bucket.length * 2 +
          channels.size * 1.5 +
          (median(velocities) ?? 0) / Math.max(options.velocityReferencePerHour, 1),
      };
    })
    .sort((a, b) => b.rank - a.rank || a.phrase.localeCompare(b.phrase));

  const candidates: TopicCandidate[] = [];
  const usedVideos = new Map<string, number>();

  for (const entry of ranked) {
    if (candidates.length >= maxTopics) break;

    // 이미 두 주제에 쓰인 영상은 더 쓰지 않는다.
    const fresh = entry.bucket.filter((video) => (usedVideos.get(video.externalVideoId) ?? 0) < 2);
    if (fresh.length < 2) continue;

    const phrase = entry.phrase;
    const normalizedTitle = normalizeTopicTitle(phrase);
    if (candidates.some((candidate) => candidate.normalizedTitle === normalizedTitle)) continue;

    const ages = fresh
      .map((video) => (video.publishedAt ? videoAgeHours(video.publishedAt, now) : null))
      .filter((value): value is number => value !== null);
    const velocities = fresh
      .map((video) =>
        video.publishedAt
          ? viewVelocity(video.viewCount, videoAgeHours(video.publishedAt, now))
          : null,
      )
      .filter((value): value is number => value !== null);
    const durations = fresh
      .map((video) => video.durationSeconds)
      .filter((value): value is number => value !== null);

    const distinctChannels = new Set(fresh.map((video) => video.externalChannelId)).size;
    const medianVelocity = median(velocities);
    const medianAge = median(ages);
    const medianDuration = median(durations);
    const topVideo =
      [...fresh].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0] ?? fresh[0]!;

    const excludeHit = exclude.find(
      (term) => phrase.includes(term) || fresh.some((video) => video.title.toLowerCase().includes(term)),
    );

    const signals = buildSignals({
      medianVelocity,
      medianAge,
      medianDuration,
      shortCandidateRatio:
        durations.length > 0 ? durations.filter((value) => value <= 180).length / durations.length : null,
      sampleSize: fresh.length,
      distinctChannels,
      options,
    });

    const penalties: Penalty[] = excludeHit
      ? [
          {
            key: "exclude_term",
            points: 100,
            reason: `제외 키워드 '${excludeHit}'가 포함돼 있습니다.`,
            hardBlock: true,
          },
        ]
      : [];

    for (const video of fresh) {
      usedVideos.set(video.externalVideoId, (usedVideos.get(video.externalVideoId) ?? 0) + 1);
    }

    candidates.push({
      keyphrase: phrase,
      title: titleCase(phrase),
      normalizedTitle,
      angleHint: `참고 영상 ${fresh.length}편이 같은 표현을 씁니다. 대표 예시: ${topVideo.title}`,
      videoIds: fresh.map((video) => video.externalVideoId),
      distinctChannels,
      medianVelocity,
      medianAgeHours: medianAge,
      signals,
      penalties,
    });
  }

  return candidates;
}

function buildSignals(input: {
  medianVelocity: number | null;
  medianAge: number | null;
  medianDuration: number | null;
  shortCandidateRatio: number | null;
  sampleSize: number;
  distinctChannels: number;
  options: DiscoverTopicsOptions;
}): SignalInput[] {
  const { options } = input;
  const velocityScore = normalizeVelocity(input.medianVelocity, options.velocityReferencePerHour);

  const shortsFit = (() => {
    if (input.medianDuration === null) return null;
    const base =
      input.medianDuration <= 60
        ? 95
        : input.medianDuration <= 90
          ? 85
          : input.medianDuration <= 180
            ? 70
            : 35;
    const ratioBonus = (input.shortCandidateRatio ?? 0) * 5;
    return Math.min(100, base + ratioBonus);
  })();

  // 공급이 많을수록 여유가 줄어든다. 채널 8개에서 상한에 닿는다.
  const competitionGap =
    velocityScore === null
      ? null
      : Math.max(0, Math.min(100, velocityScore - Math.min(50, input.distinctChannels * 5)));

  const repeatability = Math.min(100, input.sampleSize * 12 + input.distinctChannels * 4);
  const sourceQuality = Math.min(
    100,
    input.distinctChannels * 15 + (input.medianAge !== null && input.medianAge <= 720 ? 20 : 0),
  );

  return [
    {
      key: "youtube_velocity",
      rawValue: input.medianVelocity,
      normalizedScore: velocityScore,
      sourceCount: input.sampleSize,
      freshnessHours: input.medianAge,
      providerReliability: options.reliability.youtube,
      ...(velocityScore === null ? { unavailableReason: "NO_PUBLISHED_AT_OR_VIEWS" } : {}),
    },
    {
      key: "search_interest",
      rawValue: null,
      normalizedScore: null,
      sourceCount: 0,
      freshnessHours: null,
      providerReliability: options.reliability.derived,
      unavailableReason: options.unavailable.searchInterest,
    },
    {
      key: "commercial_intent",
      rawValue: null,
      normalizedScore: null,
      sourceCount: 0,
      freshnessHours: null,
      providerReliability: options.reliability.derived,
      unavailableReason: options.unavailable.commercialIntent,
    },
    {
      key: "competition_gap",
      rawValue: input.distinctChannels,
      normalizedScore: competitionGap,
      sourceCount: input.sampleSize,
      freshnessHours: input.medianAge,
      providerReliability: options.reliability.derived,
      ...(competitionGap === null ? { unavailableReason: "NO_VELOCITY_BASELINE" } : {}),
    },
    {
      key: "shorts_fit",
      rawValue: input.medianDuration,
      normalizedScore: shortsFit,
      sourceCount: input.sampleSize,
      freshnessHours: input.medianAge,
      providerReliability: options.reliability.youtube,
      ...(shortsFit === null ? { unavailableReason: "NO_DURATION_METADATA" } : {}),
    },
    {
      key: "repeatability",
      rawValue: input.sampleSize,
      normalizedScore: repeatability,
      sourceCount: input.sampleSize,
      freshnessHours: input.medianAge,
      providerReliability: options.reliability.derived,
    },
    {
      key: "source_quality",
      rawValue: input.distinctChannels,
      normalizedScore: sourceQuality,
      sourceCount: input.distinctChannels,
      freshnessHours: input.medianAge,
      providerReliability: options.reliability.derived,
    },
    {
      key: "policy_safety",
      rawValue: null,
      normalizedScore: 90,
      sourceCount: input.sampleSize,
      freshnessHours: input.medianAge,
      providerReliability: options.reliability.derived,
    },
  ];
}
