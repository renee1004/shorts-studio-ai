import { z } from "zod";

/**
 * Research Brief 계약. (스펙 6.3 research_briefs, Phase 2A)
 *
 * 출처 없는 주장은 만들지 않는다. 모든 근거는 citations 인덱스를 가리키고,
 * 근거를 찾지 못한 항목은 unknowns로 남긴다.
 */
export const RESEARCH_PROMPT_VERSION = "research.brief.v1";

export const citationSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(300),
  publisher: z.string().min(1).max(200).nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
});

export const keyFactSchema = z.object({
  statement: z.string().min(1).max(1000),
  /** citations 배열의 인덱스. 비어 있으면 근거 없는 주장이므로 저장하지 않는다. */
  citationIndexes: z.array(z.number().int().min(0)).min(1),
});

export const researchAngleSchema = z.object({
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(500),
  why: z.string().min(1).max(1000),
});

export const researchBriefContentSchema = z.object({
  executiveSummary: z.string().min(1).max(4000),
  keyFacts: z.array(keyFactSchema).default([]),
  audienceInsights: z.array(z.string().min(1).max(1000)).default([]),
  angles: z.array(researchAngleSchema).default([]),
  counterpoints: z.array(z.string().min(1).max(1000)).default([]),
  /** 근거를 확보하지 못해 확인이 필요한 항목 */
  unknowns: z.array(z.string().min(1).max(1000)).default([]),
  citations: z.array(citationSchema).default([]),
});

export type ResearchBriefContent = z.infer<typeof researchBriefContentSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type KeyFact = z.infer<typeof keyFactSchema>;

export const generateResearchSchema = z.object({
  language: z.string().min(2).max(20).default("ko"),
  maxSources: z.number().int().min(1).max(20).default(8),
  /** 같은 입력이어도 다시 생성한다. 새 version이 쌓인다. */
  forceRefresh: z.boolean().default(false),
});

export type GenerateResearchInput = z.infer<typeof generateResearchSchema>;

/** DB research_status enum과 같은 값이어야 한다. (스펙 6.3) */
export const researchStatusSchema = z.enum([
  "draft",
  "collecting",
  "ready",
  "needs_review",
  "approved",
  "failed",
]);
export type ResearchStatus = z.infer<typeof researchStatusSchema>;

/**
 * 근거 충실도. keyFacts 중 실제 citation을 가진 비율이다.
 * 인용이 하나도 없으면 0이고, 사실 항목이 없으면 계산할 수 없으므로 null이다.
 */
export function citationCoverage(content: ResearchBriefContent): number | null {
  if (content.keyFacts.length === 0) return null;

  const valid = content.keyFacts.filter((fact) =>
    fact.citationIndexes.some((index) => content.citations[index] !== undefined),
  );

  return Math.round((valid.length / content.keyFacts.length) * 10000) / 100;
}

/** citations를 가리키지 않는 주장은 버린다. 모델이 근거를 붙이지 못한 문장은 남기지 않는다. */
export function dropUngroundedFacts(content: ResearchBriefContent): ResearchBriefContent {
  return {
    ...content,
    keyFacts: content.keyFacts.filter((fact) =>
      fact.citationIndexes.some((index) => content.citations[index] !== undefined),
    ),
  };
}
