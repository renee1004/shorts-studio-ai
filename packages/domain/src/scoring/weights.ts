import {
  scoreThresholdsSchema,
  scoreWeightsSchema,
  type ScoreThresholds,
  type ScoreWeights,
} from "@shorts-os/contracts";

/** 스펙 5.2 기본 Weight. Workspace가 덮어쓸 수 있고 합계는 항상 100이어야 한다. */
export const defaultScoreWeights: ScoreWeights = scoreWeightsSchema.parse({
  youtube_velocity: 25,
  search_interest: 15,
  commercial_intent: 15,
  competition_gap: 15,
  shorts_fit: 10,
  repeatability: 8,
  source_quality: 7,
  policy_safety: 5,
});

export const defaultScoreThresholds: ScoreThresholds = scoreThresholdsSchema.parse({
  produce_score: 85,
  watch_score: 70,
  minimum_produce_confidence: 60,
});

export function parseWeights(input: unknown): ScoreWeights {
  return scoreWeightsSchema.parse(input);
}

export function parseThresholds(input: unknown): ScoreThresholds {
  return scoreThresholdsSchema.parse(input);
}
