import { z } from "zod";

export const DNA_PROMPT_VERSION = "dna.analyzer.v1";
export const ANGLE_PROMPT_VERSION = "content.angles.v1";
export const SCRIPT_PROMPT_VERSION = "content.script.v1";
export const QA_RULE_VERSION = "content.qa.v1";

export const evidenceTypes = [
  "public_metadata",
  "user_supplied_transcript",
  "owned_caption",
  "visual_observation",
] as const;
export const evidenceTypeSchema = z.enum(evidenceTypes);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const dnaEvidenceSchema = z.object({
  evidenceType: evidenceTypeSchema,
  field: z.string().min(1).max(80),
  note: z.string().min(1).max(400),
});

export const dnaStructuredPatternSchema = z.object({
  hookCategory: z.string().min(1).max(80),
  pacing: z.string().min(1).max(80),
  beatPurposes: z.array(z.string().min(1).max(80)).min(1).max(12),
  informationOrder: z.array(z.string().min(1).max(80)).min(1).max(12),
  emotionalCurve: z.string().min(1).max(120),
  ctaCategory: z.string().min(1).max(80),
  visualChangeRhythm: z.string().max(120).nullable().default(null),
  hypotheses: z.array(z.string().min(1).max(300)).max(8).default([]),
  /** 입력에 대본이 있었는지. 모델이 대본을 봤다고 주장하는 것과 분리한다. */
  transcriptIncluded: z.boolean(),
});

export const dnaPatternContentSchema = z.object({
  patternType: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  abstractionLevel: z.literal("structural"),
  structuredPattern: dnaStructuredPatternSchema,
  evidence: z.array(dnaEvidenceSchema).min(1),
  confidenceScore: z.number().min(0).max(100).nullable().default(null),
  safeToReuse: z.boolean().default(true),
});
export type DnaPatternContent = z.infer<typeof dnaPatternContentSchema>;

export const importReferenceVideoSchema = z.object({
  url: z.string().url().max(500),
  transcript: z.string().max(20_000).optional(),
});
export type ImportReferenceVideoInput = z.infer<
  typeof importReferenceVideoSchema
>;

export const analyzeDnaSchema = z.object({
  forceRefresh: z.boolean().default(false),
});

export const createProjectSchema = z.object({
  topicId: z.string().uuid(),
  researchBriefId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  targetLanguage: z.string().min(2).max(20).default("ko"),
  targetDurationSeconds: z.number().int().min(5).max(180).default(45),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const generateAnglesSchema = z.object({
  forceRefresh: z.boolean().default(false),
});

export const generateScriptSchema = z.object({
  forceRefresh: z.boolean().default(false),
});

export const restoreScriptSchema = z.object({
  fromScriptId: z.string().uuid(),
});

export const patchScriptSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  hook: z.string().min(1).max(500).optional(),
  scriptText: z.string().min(1).max(20_000).optional(),
});

export const runQaSchema = z.object({
  scriptId: z.string().uuid().optional(),
  checks: z
    .array(
      z.enum([
        "fact",
        "originality",
        "policy",
        "brand",
        "duration",
        "caption_readability",
      ]),
    )
    .min(1)
    .default([
      "fact",
      "originality",
      "policy",
      "brand",
      "duration",
      "caption_readability",
    ]),
});

export const projectApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  comment: z.string().max(2000).optional(),
  scriptId: z.string().uuid().optional(),
});

export const angleScoreSchema = z.object({
  hookStrength: z.number().min(0).max(100),
  audienceFit: z.number().min(0).max(100),
  novelty: z.number().min(0).max(100),
  evidenceCoverage: z.number().min(0).max(100),
  productionFeasibility: z.number().min(0).max(100),
  policySafety: z.number().min(0).max(100),
  notes: z.record(z.string(), z.string()).default({}),
});

export const contentAngleSchema = z.object({
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(500),
  promise: z.string().min(1).max(800),
  outline: z.array(z.string().min(1).max(300)).min(2).max(8),
  noveltyRationale: z.string().min(1).max(800),
  expectedClaimKeys: z.array(z.string().min(1).max(80)).default([]),
  scoreBreakdown: angleScoreSchema,
});
export type ContentAngleDraft = z.infer<typeof contentAngleSchema>;

export const scriptBeatSchema = z.object({
  beatId: z.string().min(1).max(40),
  startSeconds: z.number().min(0),
  endSeconds: z.number().positive(),
  purpose: z.string().min(1).max(40),
  narration: z.string().min(1).max(800),
  onScreenText: z.string().max(80).default(""),
  visualDescription: z.string().max(600).optional(),
  claimKeys: z.array(z.string().min(1).max(80)).default([]),
});

export const factualClaimSchema = z.object({
  claimKey: z.string().min(1).max(80),
  statement: z.string().min(1).max(800),
  /** 출처가 없으면 반드시 true. 화면이 미확인으로 표시한다. */
  unverified: z.boolean(),
  citationIndexes: z.array(z.number().int().min(0)).default([]),
  /** citationIndexes를 DB sources에 해석한 결과. Provider가 만들지 않고 서비스가 채운다. */
  sourceIds: z.array(z.string().uuid()).default([]),
});
export type FactualClaim = z.infer<typeof factualClaimSchema>;

export const structuredScriptSchema = z.object({
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(500),
  targetDurationSeconds: z.number().int().min(5).max(180),
  beats: z.array(scriptBeatSchema).min(2).max(16),
  cta: z.object({
    type: z.string().min(1).max(40),
    text: z.string().min(1).max(300),
  }),
  factualClaims: z.array(factualClaimSchema).default([]),
  estimatedDurationSeconds: z.number().positive(),
});
export type StructuredScript = z.infer<typeof structuredScriptSchema>;

export const shotDraftSchema = z.object({
  sequenceNo: z.number().int().min(1),
  startSeconds: z.number().min(0),
  endSeconds: z.number().positive(),
  narration: z.string().max(800).nullable().default(null),
  onScreenText: z.string().max(80).nullable().default(null),
  visualDescription: z.string().min(1).max(600),
  cameraDirection: z.string().max(200).nullable().default(null),
  generationPrompt: z.string().max(800).nullable().default(null),
  negativePrompt: z.string().max(400).nullable().default(null),
  assetStrategy: z.enum([
    "ai_video",
    "ai_image",
    "stock",
    "user_upload",
    "motion_graphic",
  ]),
});
export type ShotDraft = z.infer<typeof shotDraftSchema>;

export const qaCheckTypes = [
  "fact",
  "originality",
  "policy",
  "brand",
  "duration",
  "caption_readability",
] as const;
export const qaCheckTypeSchema = z.enum(qaCheckTypes);
export type QaCheckType = z.infer<typeof qaCheckTypeSchema>;

export const qaFindingSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  evidence: z.string().max(800).optional(),
  suggestedFix: z.string().max(500).optional(),
});

export const qaCheckResultSchema = z.object({
  type: qaCheckTypeSchema,
  result: z.enum(["pass", "warn", "fail", "not_run"]),
  score: z.number().min(0).max(100).nullable(),
  severity: z.enum(["info", "low", "medium", "high", "blocker"]),
  findings: z.array(qaFindingSchema),
});
export type QaCheckResult = z.infer<typeof qaCheckResultSchema>;

export const projectStatuses = [
  "draft",
  "research_ready",
  "scripting",
  "qa_review",
  "approved_to_render",
  "rendering",
  "rendered",
  "publish_review",
  "published",
  "rejected",
  "archived",
] as const;
export const projectStatusSchema = z.enum(projectStatuses);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/**
 * 사실 주장은 출처 인덱스 또는 미확인 표시가 있어야 한다.
 * 둘 다 없으면 저장하지 않는다.
 */
export function normalizeFactualClaims(
  claims: FactualClaim[],
  citationCount: number,
): FactualClaim[] {
  return claims
    .map((claim) => {
      const validIndexes = claim.citationIndexes.filter(
        (index) => index < citationCount,
      );
      if (validIndexes.length > 0) {
        return {
          ...claim,
          citationIndexes: validIndexes,
          sourceIds: [],
          unverified: false,
        };
      }
      return { ...claim, citationIndexes: [], sourceIds: [], unverified: true };
    })
    .filter((claim) => claim.unverified || claim.citationIndexes.length > 0);
}

export function claimsHaveCitationOrFlag(claims: FactualClaim[]): boolean {
  return claims.every(
    (claim) => claim.unverified || claim.citationIndexes.length > 0,
  );
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** watch / shorts / youtu.be URL 또는 11자 ID에서 영상 ID를 뽑는다. */
export function parseYouTubeVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (YOUTUBE_ID.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && YOUTUBE_ID.test(id) ? id : null;
    }
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery && YOUTUBE_ID.test(fromQuery)) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "shorts" ||
          parts[0] === "embed" ||
          parts[0] === "live") &&
        parts[1]
      ) {
        return YOUTUBE_ID.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
