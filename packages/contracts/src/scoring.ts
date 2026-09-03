import { z } from "zod";

/** 스펙 5.2 신호 키. Weight 합계는 100이어야 한다. */
export const signalKeys = [
  "youtube_velocity",
  "search_interest",
  "commercial_intent",
  "competition_gap",
  "shorts_fit",
  "repeatability",
  "source_quality",
  "policy_safety",
] as const;

export const signalKeySchema = z.enum(signalKeys);
export type SignalKey = z.infer<typeof signalKeySchema>;

export const scoreWeightsSchema = z
  .object({
    youtube_velocity: z.number().min(0).max(100),
    search_interest: z.number().min(0).max(100),
    commercial_intent: z.number().min(0).max(100),
    competition_gap: z.number().min(0).max(100),
    shorts_fit: z.number().min(0).max(100),
    repeatability: z.number().min(0).max(100),
    source_quality: z.number().min(0).max(100),
    policy_safety: z.number().min(0).max(100),
  })
  .refine(
    (weights) => Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 100) < 0.001,
    "Weight 합계는 100이어야 합니다.",
  );

export type ScoreWeights = z.infer<typeof scoreWeightsSchema>;

export const scoreThresholdsSchema = z.object({
  produce_score: z.number().min(0).max(100),
  watch_score: z.number().min(0).max(100),
  minimum_produce_confidence: z.number().min(0).max(100),
});

export type ScoreThresholds = z.infer<typeof scoreThresholdsSchema>;

export const decisionBands = [
  "PRODUCE_CANDIDATE",
  "RESEARCH_MORE",
  "WATCH",
  "SKIP_CANDIDATE",
  "REJECT",
] as const;

export const decisionBandSchema = z.enum(decisionBands);
export type DecisionBand = z.infer<typeof decisionBandSchema>;

/** 신호 하나의 입력. 값이 없으면 available=false이며 0점으로 만들지 않는다. */
export const signalInputSchema = z.object({
  key: signalKeySchema,
  rawValue: z.number().nullable(),
  normalizedScore: z.number().min(0).max(100).nullable(),
  sourceCount: z.number().int().nonnegative().default(0),
  freshnessHours: z.number().nonnegative().nullable().default(null),
  providerReliability: z.number().min(0).max(1).default(0.8),
  unavailableReason: z.string().optional(),
});

export type SignalInput = z.infer<typeof signalInputSchema>;

export const signalBreakdownSchema = z.object({
  key: signalKeySchema,
  rawValue: z.number().nullable(),
  normalizedScore: z.number().nullable(),
  weight: z.number(),
  available: z.boolean(),
  contribution: z.number().nullable(),
  sourceCount: z.number().int().nonnegative(),
  freshnessHours: z.number().nullable(),
  reason: z.string().optional(),
});

export const penaltySchema = z.object({
  key: z.string(),
  points: z.number(),
  reason: z.string(),
  hardBlock: z.boolean().default(false),
});

export const scoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  decision: decisionBandSchema,
  availableWeight: z.number().min(0).max(100),
  configVersion: z.number().int().positive(),
  signals: z.array(signalBreakdownSchema),
  penalties: z.array(penaltySchema),
  confidenceParts: z.object({
    coverage: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1),
    sample: z.number().min(0).max(1),
    reliability: z.number().min(0).max(1),
  }),
  missingSignals: z.array(signalKeySchema),
  explanation: z.string(),
  calculatedAt: z.string(),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;
