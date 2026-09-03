import {
  signalKeys,
  type DecisionBand,
  type ScoreResult,
  type ScoreThresholds,
  type ScoreWeights,
  type SignalInput,
  type SignalKey,
} from "@shorts-os/contracts";
import {
  clamp01,
  confidenceWeights,
  freshnessScore,
  round2,
  sampleScore,
  weightedAverage,
} from "./confidence";

export type Penalty = {
  key: string;
  points: number;
  reason: string;
  hardBlock?: boolean;
};

export type ComputeScoreInput = {
  signals: SignalInput[];
  weights: ScoreWeights;
  thresholds: ScoreThresholds;
  configVersion: number;
  penalties?: Penalty[];
  calculatedAt?: Date;
};

const signalLabels: Record<SignalKey, string> = {
  youtube_velocity: "조회 속도",
  search_interest: "검색 관심도",
  commercial_intent: "광고 가치",
  competition_gap: "경쟁 여유",
  shorts_fit: "쇼츠 적합성",
  repeatability: "반복 제작성",
  source_quality: "출처 품질",
  policy_safety: "정책 안전성",
};

export class ScoreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreInputError";
  }
}

/**
 * 스펙 5.3: 결측값을 0점으로 만들지 않는다.
 * 사용 가능한 신호의 Weight만 모아 재정규화하고, 부족한 만큼 Confidence를 낮춘다.
 */
export function computeScore(input: ComputeScoreInput): ScoreResult {
  const { weights, thresholds, configVersion } = input;
  const calculatedAt = input.calculatedAt ?? new Date();
  const penalties = input.penalties ?? [];

  const byKey = new Map<SignalKey, SignalInput>();
  for (const signal of input.signals) {
    if (byKey.has(signal.key)) {
      throw new ScoreInputError(`신호 ${signal.key}가 중복 입력됐습니다.`);
    }
    byKey.set(signal.key, signal);
  }

  const breakdown: ScoreResult["signals"] = [];
  const missingSignals: SignalKey[] = [];
  let availableWeight = 0;
  let rawScore = 0;

  const freshnessEntries: { value: number; weight: number }[] = [];
  const reliabilityEntries: { value: number; weight: number }[] = [];
  // 표본은 신호별로 합치지 않는다. 같은 영상 묶음을 여러 신호가 재사용하므로
  // 합계를 쓰면 근거가 실제보다 많아 보인다. 가장 큰 근거 집합을 기준으로 삼는다.
  let sampleEvidence = 0;

  for (const key of signalKeys) {
    const weight = weights[key];
    const signal = byKey.get(key);
    const normalized = signal?.normalizedScore ?? null;
    const available = signal !== undefined && normalized !== null;

    if (available) {
      availableWeight += weight;
      rawScore += normalized * weight;
      freshnessEntries.push({ value: freshnessScore(signal.freshnessHours ?? null), weight });
      reliabilityEntries.push({ value: clamp01(signal.providerReliability), weight });
      sampleEvidence = Math.max(sampleEvidence, signal.sourceCount);
      breakdown.push({
        key,
        rawValue: signal.rawValue,
        normalizedScore: round2(normalized),
        weight,
        available: true,
        contribution: round2(normalized * weight),
        sourceCount: signal.sourceCount,
        freshnessHours: signal.freshnessHours ?? null,
      });
    } else {
      missingSignals.push(key);
      breakdown.push({
        key,
        rawValue: signal?.rawValue ?? null,
        normalizedScore: null,
        weight,
        available: false,
        contribution: null,
        sourceCount: signal?.sourceCount ?? 0,
        freshnessHours: signal?.freshnessHours ?? null,
        reason: signal?.unavailableReason ?? "SIGNAL_NOT_COLLECTED",
      });
    }
  }

  const hardBlock = penalties.some((penalty) => penalty.hardBlock === true);
  const penaltyPoints = penalties.reduce((sum, penalty) => sum + penalty.points, 0);

  const baseScore = availableWeight > 0 ? rawScore / availableWeight : 0;
  const score = availableWeight > 0 ? clamp0to100(baseScore - penaltyPoints) : 0;

  const coverage = clamp01(availableWeight / 100);
  const freshness = clamp01(weightedAverage(freshnessEntries));
  const sample = clamp01(sampleScore(sampleEvidence));
  const reliability = clamp01(weightedAverage(reliabilityEntries));

  const confidence = clamp0to100(
    (confidenceWeights.coverage * coverage +
      confidenceWeights.freshness * freshness +
      confidenceWeights.sample * sample +
      confidenceWeights.reliability * reliability) *
      100,
  );

  const decision = decideBand({ score, confidence, hardBlock, thresholds });

  return {
    score: round2(score),
    confidence: round2(confidence),
    decision,
    availableWeight: round2(availableWeight),
    configVersion,
    signals: breakdown,
    penalties: penalties.map((penalty) => ({
      key: penalty.key,
      points: penalty.points,
      reason: penalty.reason,
      hardBlock: penalty.hardBlock ?? false,
    })),
    confidenceParts: {
      coverage: round2(coverage),
      freshness: round2(freshness),
      sample: round2(sample),
      reliability: round2(reliability),
    },
    missingSignals,
    explanation: explain({ breakdown, missingSignals, decision, score, confidence, hardBlock }),
    calculatedAt: calculatedAt.toISOString(),
  };
}

/** 스펙 5.6 Decision Band. 자동으로 제작 상태로 넘기지 않고 사람이 승인한다. */
export function decideBand(input: {
  score: number;
  confidence: number;
  hardBlock: boolean;
  thresholds: ScoreThresholds;
}): DecisionBand {
  if (input.hardBlock) return "REJECT";
  const { produce_score, watch_score, minimum_produce_confidence } = input.thresholds;

  if (input.score >= produce_score) {
    return input.confidence >= minimum_produce_confidence ? "PRODUCE_CANDIDATE" : "RESEARCH_MORE";
  }
  if (input.score >= watch_score) return "WATCH";
  return "SKIP_CANDIDATE";
}

function clamp0to100(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function explain(input: {
  breakdown: ScoreResult["signals"];
  missingSignals: SignalKey[];
  decision: DecisionBand;
  score: number;
  confidence: number;
  hardBlock: boolean;
}): string {
  if (input.hardBlock) {
    return "정책 위험이 확인돼 제작 대상에서 제외했습니다.";
  }

  const contributors = input.breakdown
    .filter((signal) => signal.available && signal.contribution !== null)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))
    .slice(0, 2)
    .map((signal) => signalLabels[signal.key]);

  const driver =
    contributors.length > 0 ? `${contributors.join("와 ")}가 점수를 끌어올렸고` : "사용 가능한 신호가 적고";

  const missing =
    input.missingSignals.length > 0
      ? `${input.missingSignals.map((key) => signalLabels[key]).join(", ")} 신호가 없어 신뢰도가 ${Math.round(input.confidence)}%입니다.`
      : `모든 신호가 모여 신뢰도가 ${Math.round(input.confidence)}%입니다.`;

  return `${driver}, ${missing}`;
}
