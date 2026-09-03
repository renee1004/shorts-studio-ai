import { describe, expect, it } from "vitest";
import type { SignalInput } from "@shorts-os/contracts";
import { computeScore, ScoreInputError } from "./score";
import { defaultScoreThresholds, defaultScoreWeights } from "./weights";

function signal(overrides: Partial<SignalInput> & Pick<SignalInput, "key">): SignalInput {
  return {
    rawValue: 100,
    normalizedScore: 80,
    sourceCount: 10,
    freshnessHours: 4,
    providerReliability: 0.9,
    ...overrides,
  };
}

const allKeys = [
  "youtube_velocity",
  "search_interest",
  "commercial_intent",
  "competition_gap",
  "shorts_fit",
  "repeatability",
  "source_quality",
  "policy_safety",
] as const;

describe("computeScore", () => {
  it("모든 신호가 같은 점수면 그 점수가 그대로 나온다", () => {
    const result = computeScore({
      signals: allKeys.map((key) => signal({ key, normalizedScore: 80 })),
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
    });

    expect(result.score).toBe(80);
    expect(result.availableWeight).toBe(100);
    expect(result.missingSignals).toEqual([]);
  });

  it("Breakdown 기여도 합계가 결과 점수와 일치한다", () => {
    const result = computeScore({
      signals: [
        signal({ key: "youtube_velocity", normalizedScore: 92 }),
        signal({ key: "competition_gap", normalizedScore: 70 }),
        signal({ key: "shorts_fit", normalizedScore: 88 }),
        signal({ key: "repeatability", normalizedScore: 61 }),
        signal({ key: "source_quality", normalizedScore: 45 }),
        signal({ key: "policy_safety", normalizedScore: 99 }),
      ],
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 3,
    });

    const contribution = result.signals
      .filter((item) => item.available)
      .reduce((sum, item) => sum + (item.contribution ?? 0), 0);

    expect(contribution / result.availableWeight).toBeCloseTo(result.score, 1);
  });

  it("결측 신호를 0점으로 만들지 않고 가중치를 재정규화한다", () => {
    const withMissing = computeScore({
      signals: [
        signal({ key: "youtube_velocity", normalizedScore: 90 }),
        signal({
          key: "search_interest",
          normalizedScore: null,
          rawValue: null,
          sourceCount: 0,
          unavailableReason: "GOOGLE_TRENDS_NOT_CONNECTED",
        }),
        signal({
          key: "commercial_intent",
          normalizedScore: null,
          rawValue: null,
          sourceCount: 0,
          unavailableReason: "GOOGLE_ADS_NOT_CONNECTED",
        }),
        signal({ key: "competition_gap", normalizedScore: 90 }),
        signal({ key: "shorts_fit", normalizedScore: 90 }),
        signal({ key: "repeatability", normalizedScore: 90 }),
        signal({ key: "source_quality", normalizedScore: 90 }),
        signal({ key: "policy_safety", normalizedScore: 90 }),
      ],
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
    });

    // 결측을 0으로 쳤다면 점수가 63으로 떨어진다. 재정규화하면 90이 유지된다.
    expect(withMissing.score).toBe(90);
    expect(withMissing.availableWeight).toBe(70);
    expect(withMissing.missingSignals).toEqual(["search_interest", "commercial_intent"]);
    expect(withMissing.confidenceParts.coverage).toBe(0.7);

    const searchSignal = withMissing.signals.find((item) => item.key === "search_interest");
    expect(searchSignal?.normalizedScore).toBeNull();
    expect(searchSignal?.contribution).toBeNull();
    expect(searchSignal?.reason).toBe("GOOGLE_TRENDS_NOT_CONNECTED");
  });

  it("신호가 적으면 Confidence가 낮아진다", () => {
    const complete = computeScore({
      signals: allKeys.map((key) => signal({ key })),
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
    });
    const sparse = computeScore({
      signals: [signal({ key: "youtube_velocity", sourceCount: 2, freshnessHours: 900 })],
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
    });

    expect(sparse.confidence).toBeLessThan(complete.confidence);
    expect(sparse.confidenceParts.sample).toBeLessThan(complete.confidenceParts.sample);
  });

  it("높은 점수와 낮은 신뢰도는 RESEARCH_MORE로 분류한다", () => {
    const result = computeScore({
      signals: [signal({ key: "youtube_velocity", normalizedScore: 95, sourceCount: 2, freshnessHours: 800 })],
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
    });

    expect(result.score).toBeGreaterThanOrEqual(defaultScoreThresholds.produce_score);
    expect(result.confidence).toBeLessThan(defaultScoreThresholds.minimum_produce_confidence);
    expect(result.decision).toBe("RESEARCH_MORE");
  });

  it("Hard Block 패널티는 점수와 무관하게 REJECT로 만든다", () => {
    const result = computeScore({
      signals: allKeys.map((key) => signal({ key, normalizedScore: 99 })),
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
      penalties: [
        { key: "exclude_term", points: 100, reason: "제외 키워드 포함", hardBlock: true },
      ],
    });

    expect(result.decision).toBe("REJECT");
    expect(result.penalties[0]?.hardBlock).toBe(true);
  });

  it("점수 구간별로 Decision Band가 달라진다", () => {
    const bandFor = (value: number) =>
      computeScore({
        signals: allKeys.map((key) => signal({ key, normalizedScore: value })),
        weights: defaultScoreWeights,
        thresholds: defaultScoreThresholds,
        configVersion: 1,
      }).decision;

    expect(bandFor(90)).toBe("PRODUCE_CANDIDATE");
    expect(bandFor(75)).toBe("WATCH");
    expect(bandFor(50)).toBe("SKIP_CANDIDATE");
  });

  it("같은 입력은 항상 같은 결과를 낸다", () => {
    const input = {
      signals: allKeys.map((key) => signal({ key, normalizedScore: 71.5 })),
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 2,
      calculatedAt: new Date("2026-09-03T00:00:00Z"),
    };

    expect(computeScore(input)).toStrictEqual(computeScore(input));
  });

  it("신호가 중복 입력되면 계산하지 않고 오류를 던진다", () => {
    expect(() =>
      computeScore({
        signals: [signal({ key: "youtube_velocity" }), signal({ key: "youtube_velocity" })],
        weights: defaultScoreWeights,
        thresholds: defaultScoreThresholds,
        configVersion: 1,
      }),
    ).toThrow(ScoreInputError);
  });

  it("설명 문장에 결측 신호와 신뢰도가 담긴다", () => {
    const result = computeScore({
      signals: [
        signal({ key: "youtube_velocity", normalizedScore: 88 }),
        signal({
          key: "search_interest",
          normalizedScore: null,
          rawValue: null,
          unavailableReason: "GOOGLE_TRENDS_NOT_CONNECTED",
        }),
      ],
      weights: defaultScoreWeights,
      thresholds: defaultScoreThresholds,
      configVersion: 1,
    });

    expect(result.explanation).toContain("검색 관심도");
    expect(result.explanation).toContain("신뢰도");
  });
});
