import { and, desc, eq, sql } from "drizzle-orm";
import type {
  ContentAngleDraft,
  DnaPatternContent,
  FactualClaim,
  ProjectStatus,
  QaCheckResult,
  ShotDraft,
  StructuredScript,
} from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import type { Database } from "../client";
import {
  approvals,
  contentAngles,
  contentProjects,
  dnaPatterns,
  qaReviews,
  referenceVideos,
  researchBriefs,
  scriptCitations,
  scripts,
  shots,
  topics,
} from "../schema";

export type ReferenceVideoRow = typeof referenceVideos.$inferSelect;
export type DnaPatternRow = typeof dnaPatterns.$inferSelect;
export type ContentProjectRow = typeof contentProjects.$inferSelect;
export type ContentAngleRow = typeof contentAngles.$inferSelect;
export type ScriptRow = typeof scripts.$inferSelect;
export type ScriptCitationRow = typeof scriptCitations.$inferSelect;
export type ShotRow = typeof shots.$inferSelect;
export type QaReviewRow = typeof qaReviews.$inferSelect;
export type ApprovalRow = typeof approvals.$inferSelect;

export type VideoImportMeta = {
  importSource: "manual" | "discovery";
  transcriptProvided: boolean;
  transcriptText: string | null;
};

export function readImportMeta(metadata: unknown): VideoImportMeta {
  const record = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return {
    importSource: record.importSource === "manual" ? "manual" : "discovery",
    transcriptProvided: record.transcriptProvided === true,
    transcriptText:
      typeof record.transcriptText === "string" && record.transcriptText.length > 0
        ? record.transcriptText
        : null,
  };
}

export async function getReferenceVideo(
  db: Database,
  workspaceId: string,
  videoId: string,
): Promise<ReferenceVideoRow | null> {
  const rows = await db
    .select()
    .from(referenceVideos)
    .where(and(eq(referenceVideos.workspaceId, workspaceId), eq(referenceVideos.id, videoId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listReferenceVideosForLibrary(db: Database, workspaceId: string, limit = 40) {
  return db
    .select()
    .from(referenceVideos)
    .where(eq(referenceVideos.workspaceId, workspaceId))
    .orderBy(desc(referenceVideos.lastCollectedAt))
    .limit(limit);
}

export async function listDnaPatterns(db: Database, workspaceId: string, limit = 50) {
  return db
    .select()
    .from(dnaPatterns)
    .where(eq(dnaPatterns.workspaceId, workspaceId))
    .orderBy(desc(dnaPatterns.createdAt))
    .limit(limit);
}

export async function insertDnaPattern(
  db: Database,
  input: {
    workspaceId: string;
    nicheId?: string | null;
    referenceVideoId: string;
    content: DnaPatternContent;
    modelName: string;
    promptVersion: string;
  },
): Promise<DnaPatternRow> {
  const rows = await db
    .insert(dnaPatterns)
    .values({
      workspaceId: input.workspaceId,
      nicheId: input.nicheId ?? null,
      referenceVideoId: input.referenceVideoId,
      patternType: input.content.patternType,
      name: input.content.name,
      abstractionLevel: input.content.abstractionLevel,
      structuredPattern: input.content.structuredPattern,
      evidence: input.content.evidence,
      confidenceScore:
        input.content.confidenceScore === null ? null : String(input.content.confidenceScore),
      safeToReuse: input.content.safeToReuse,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
    })
    .returning();
  const created = rows[0];
  if (!created) throw new DomainError("INTERNAL_ERROR", "DNA Pattern 저장에 실패했습니다.");
  return created;
}

export async function listEligibleStudioTopics(db: Database, workspaceId: string) {
  const topicRows = await db
    .select({
      id: topics.id,
      title: topics.title,
      decision: topics.decision,
      nicheId: topics.nicheId,
    })
    .from(topics)
    .where(and(eq(topics.workspaceId, workspaceId), eq(topics.decision, "approved")))
    .orderBy(desc(topics.updatedAt));

  const briefs = await db
    .select({
      id: researchBriefs.id,
      topicId: researchBriefs.topicId,
      version: researchBriefs.version,
      status: researchBriefs.status,
    })
    .from(researchBriefs)
    .where(eq(researchBriefs.workspaceId, workspaceId))
    .orderBy(desc(researchBriefs.version));

  const latestBrief = new Map<string, (typeof briefs)[number]>();
  for (const brief of briefs) {
    if (!latestBrief.has(brief.topicId)) latestBrief.set(brief.topicId, brief);
  }

  return topicRows.map((topic) => ({
    ...topic,
    brief: latestBrief.get(topic.id) ?? null,
  }));
}

export async function insertContentProject(
  db: Database,
  input: {
    workspaceId: string;
    topicId: string;
    researchBriefId: string | null;
    title: string;
    targetLanguage: string;
    targetDurationSeconds: number;
    ownerUserId: string;
    status: ProjectStatus;
  },
): Promise<ContentProjectRow> {
  const rows = await db
    .insert(contentProjects)
    .values({
      workspaceId: input.workspaceId,
      topicId: input.topicId,
      researchBriefId: input.researchBriefId,
      title: input.title,
      targetLanguage: input.targetLanguage,
      targetDurationSeconds: input.targetDurationSeconds,
      ownerUserId: input.ownerUserId,
      status: input.status,
    })
    .returning();
  const created = rows[0];
  if (!created) throw new DomainError("INTERNAL_ERROR", "Project 생성에 실패했습니다.");
  return created;
}

export async function listContentProjects(db: Database, workspaceId: string) {
  return db
    .select()
    .from(contentProjects)
    .where(eq(contentProjects.workspaceId, workspaceId))
    .orderBy(desc(contentProjects.updatedAt));
}

export async function getContentProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ContentProjectRow | null> {
  const rows = await db
    .select()
    .from(contentProjects)
    .where(and(eq(contentProjects.workspaceId, workspaceId), eq(contentProjects.id, projectId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateProjectStatus(
  db: Database,
  workspaceId: string,
  projectId: string,
  status: ProjectStatus,
  extra: { selectedAngleId?: string | null } = {},
) {
  await db
    .update(contentProjects)
    .set({
      status,
      updatedAt: sql`now()`,
      ...(extra.selectedAngleId !== undefined ? { selectedAngleId: extra.selectedAngleId } : {}),
    })
    .where(and(eq(contentProjects.workspaceId, workspaceId), eq(contentProjects.id, projectId)));
}

export async function insertAngleBatch(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    version: number;
    drafts: ContentAngleDraft[];
  },
): Promise<ContentAngleRow[]> {
  if (input.drafts.length === 0) return [];
  return db
    .insert(contentAngles)
    .values(
      input.drafts.map((draft) => ({
        workspaceId: input.workspaceId,
        contentProjectId: input.projectId,
        version: input.version,
        title: draft.title,
        hook: draft.hook,
        promise: draft.promise,
        outline: draft.outline,
        noveltyRationale: draft.noveltyRationale,
        scoreBreakdown: draft.scoreBreakdown,
        selected: false,
      })),
    )
    .returning();
}

export async function listAngles(db: Database, workspaceId: string, projectId: string) {
  return db
    .select()
    .from(contentAngles)
    .where(
      and(eq(contentAngles.workspaceId, workspaceId), eq(contentAngles.contentProjectId, projectId)),
    )
    .orderBy(desc(contentAngles.version), desc(contentAngles.createdAt));
}

export async function getAngle(
  db: Database,
  workspaceId: string,
  angleId: string,
): Promise<ContentAngleRow | null> {
  const rows = await db
    .select()
    .from(contentAngles)
    .where(and(eq(contentAngles.workspaceId, workspaceId), eq(contentAngles.id, angleId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function selectAngle(
  db: Database,
  workspaceId: string,
  projectId: string,
  angleId: string,
) {
  await db
    .update(contentAngles)
    .set({ selected: false })
    .where(
      and(eq(contentAngles.workspaceId, workspaceId), eq(contentAngles.contentProjectId, projectId)),
    );
  await db
    .update(contentAngles)
    .set({ selected: true })
    .where(and(eq(contentAngles.workspaceId, workspaceId), eq(contentAngles.id, angleId)));
  await updateProjectStatus(db, workspaceId, projectId, "scripting", { selectedAngleId: angleId });
}

export async function nextScriptVersion(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<number> {
  const rows = await db
    .select({ version: scripts.version })
    .from(scripts)
    .where(and(eq(scripts.workspaceId, workspaceId), eq(scripts.contentProjectId, projectId)))
    .orderBy(desc(scripts.version))
    .limit(1);
  return (rows[0]?.version ?? 0) + 1;
}

export async function nextAngleVersion(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<number> {
  const rows = await db
    .select({ version: contentAngles.version })
    .from(contentAngles)
    .where(
      and(eq(contentAngles.workspaceId, workspaceId), eq(contentAngles.contentProjectId, projectId)),
    )
    .orderBy(desc(contentAngles.version))
    .limit(1);
  return (rows[0]?.version ?? 0) + 1;
}

export async function insertScript(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    angleId: string | null;
    version: number;
    structured: StructuredScript;
    scriptText: string;
    wordCount: number;
    estimatedDurationSeconds: number;
    claims: FactualClaim[];
    originalitySummary: Record<string, unknown>;
    modelName: string;
    promptVersion: string;
    inputHash: string;
    createdBy: string;
    status?: string;
  },
): Promise<ScriptRow> {
  const rows = await db
    .insert(scripts)
    .values({
      workspaceId: input.workspaceId,
      contentProjectId: input.projectId,
      contentAngleId: input.angleId,
      version: input.version,
      title: input.structured.title,
      hook: input.structured.hook,
      scriptText: input.scriptText,
      structuredScript: input.structured,
      wordCount: input.wordCount,
      estimatedDurationSeconds: String(input.estimatedDurationSeconds),
      factualClaims: input.claims,
      originalitySummary: input.originalitySummary,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      inputHash: input.inputHash,
      status: input.status ?? "draft",
      createdBy: input.createdBy,
    })
    .returning();
  const created = rows[0];
  if (!created) throw new DomainError("INTERNAL_ERROR", "Script 저장에 실패했습니다.");
  return created;
}

export async function listScripts(db: Database, workspaceId: string, projectId: string) {
  return db
    .select()
    .from(scripts)
    .where(and(eq(scripts.workspaceId, workspaceId), eq(scripts.contentProjectId, projectId)))
    .orderBy(desc(scripts.version));
}

export async function getScript(
  db: Database,
  workspaceId: string,
  scriptId: string,
): Promise<ScriptRow | null> {
  const rows = await db
    .select()
    .from(scripts)
    .where(and(eq(scripts.workspaceId, workspaceId), eq(scripts.id, scriptId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertScriptCitations(
  db: Database,
  input: {
    workspaceId: string;
    scriptId: string;
    mappings: Array<{
      sourceId: string;
      claimKey: string;
      quoteExcerpt?: string | null;
      supportLevel?: "direct" | "partial" | "context";
    }>;
  },
): Promise<ScriptCitationRow[]> {
  if (input.mappings.length === 0) return [];
  return db
    .insert(scriptCitations)
    .values(
      input.mappings.map((mapping) => ({
        workspaceId: input.workspaceId,
        scriptId: input.scriptId,
        sourceId: mapping.sourceId,
        claimKey: mapping.claimKey,
        quoteExcerpt: mapping.quoteExcerpt ?? null,
        supportLevel: mapping.supportLevel ?? "direct",
      })),
    )
    .onConflictDoNothing()
    .returning();
}

export async function listScriptCitations(
  db: Database,
  workspaceId: string,
  scriptId: string,
): Promise<ScriptCitationRow[]> {
  return db
    .select()
    .from(scriptCitations)
    .where(
      and(
        eq(scriptCitations.workspaceId, workspaceId),
        eq(scriptCitations.scriptId, scriptId),
      ),
    )
    .orderBy(scriptCitations.claimKey, scriptCitations.sourceId);
}

export async function replaceShots(
  db: Database,
  workspaceId: string,
  scriptId: string,
  drafts: ShotDraft[],
): Promise<ShotRow[]> {
  await db.delete(shots).where(and(eq(shots.workspaceId, workspaceId), eq(shots.scriptId, scriptId)));
  if (drafts.length === 0) return [];
  return db
    .insert(shots)
    .values(
      drafts.map((draft) => ({
        workspaceId,
        scriptId,
        sequenceNo: draft.sequenceNo,
        startSeconds: String(draft.startSeconds),
        endSeconds: String(draft.endSeconds),
        narration: draft.narration,
        onScreenText: draft.onScreenText,
        visualDescription: draft.visualDescription,
        cameraDirection: draft.cameraDirection,
        generationPrompt: draft.generationPrompt,
        negativePrompt: draft.negativePrompt,
        assetStrategy: draft.assetStrategy,
      })),
    )
    .returning();
}

export async function listShots(db: Database, workspaceId: string, scriptId: string) {
  return db
    .select()
    .from(shots)
    .where(and(eq(shots.workspaceId, workspaceId), eq(shots.scriptId, scriptId)))
    .orderBy(shots.sequenceNo);
}

export async function insertQaReviews(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    scriptId: string;
    checks: QaCheckResult[];
    ruleVersion: string;
    modelName: string;
    inputHash: string;
  },
): Promise<QaReviewRow[]> {
  if (input.checks.length === 0) return [];
  return db
    .insert(qaReviews)
    .values(
      input.checks.map((check) => ({
        workspaceId: input.workspaceId,
        contentProjectId: input.projectId,
        scriptId: input.scriptId,
        checkType: check.type,
        result: check.result,
        score: check.score === null ? null : String(check.score),
        severity: check.severity,
        findings: check.findings,
        modelName: input.modelName,
        ruleVersion: input.ruleVersion,
        inputHash: input.inputHash,
      })),
    )
    .returning();
}

export async function listLatestQa(
  db: Database,
  workspaceId: string,
  projectId: string,
  scriptId: string,
) {
  return db
    .select()
    .from(qaReviews)
    .where(
      and(
        eq(qaReviews.workspaceId, workspaceId),
        eq(qaReviews.contentProjectId, projectId),
        eq(qaReviews.scriptId, scriptId),
      ),
    )
    .orderBy(desc(qaReviews.createdAt))
    .limit(20);
}

export async function insertApproval(
  db: Database,
  input: {
    workspaceId: string;
    entityType: string;
    entityId: string;
    entityVersion: number | null;
    decision: "approved" | "rejected" | "changes_requested";
    comment: string | null;
    decidedBy: string;
    snapshotHash: string;
  },
): Promise<ApprovalRow> {
  const rows = await db
    .insert(approvals)
    .values({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      entityVersion: input.entityVersion,
      decision: input.decision,
      comment: input.comment,
      decidedBy: input.decidedBy,
      snapshotHash: input.snapshotHash,
    })
    .returning();
  const created = rows[0];
  if (!created) throw new DomainError("INTERNAL_ERROR", "승인 기록에 실패했습니다.");
  return created;
}

export async function listApprovals(db: Database, workspaceId: string, entityId: string) {
  return db
    .select()
    .from(approvals)
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.entityId, entityId)))
    .orderBy(desc(approvals.decidedAt));
}
