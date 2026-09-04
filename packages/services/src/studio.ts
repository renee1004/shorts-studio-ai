import { createHash } from "node:crypto";
import {
  claimsHaveCitationOrFlag,
  normalizeFactualClaims,
  parseYouTubeVideoId,
  QA_RULE_VERSION,
  qaCheckTypes,
  structuredScriptSchema,
  type CreateProjectInput,
  type FactualClaim,
  type ImportReferenceVideoInput,
  type QaCheckType,
  type ShotDraft,
  type StructuredScript,
} from "@shorts-os/contracts";
import {
  DomainError,
  estimateSpokenSeconds,
  qaHasBlocker,
  runQaChecks,
  snapshotHash,
  tokenize,
} from "@shorts-os/domain";
import {
  addWorkflowStep,
  finishWorkflowRun,
  getAngle,
  getContentProject,
  getLatestResearchBrief,
  getResearchBriefById,
  getReferenceVideo,
  getScript,
  getTopicDetail,
  insertAngleBatch,
  insertApproval,
  insertContentProject,
  insertDnaPattern,
  insertQaReviews,
  insertScript,
  insertScriptCitations,
  listAngles,
  listApprovals,
  listContentProjects,
  listDnaPatterns,
  listEligibleStudioTopics,
  listLatestQa,
  listReferenceVideosForLibrary,
  listScriptCitations,
  listScripts,
  listShots,
  listTopicReferenceTexts,
  mergeReferenceMetadata,
  nextAngleVersion,
  nextScriptVersion,
  readImportMeta,
  replaceShots,
  resolveBriefCitationSources,
  selectAngle,
  startWorkflowRun,
  updateProjectStatus,
  upsertReferenceVideos,
  writeAuditLog,
  type ContentProjectRow,
  type Database,
  type ScriptCitationRow,
  type ScriptRow,
  type ShotRow,
  type StoredBrief,
} from "@shorts-os/db";
import type { ContentStudioProvider, YouTubeDiscoveryProvider } from "@shorts-os/providers";

type ProjectApprovalInput = {
  decision: "approved" | "rejected" | "changes_requested";
  comment?: string | undefined;
  scriptId?: string | undefined;
};

function scriptTextFrom(structured: StructuredScript): string {
  return structured.beats.map((beat) => beat.narration).join("\n");
}

function storedClaims(value: unknown): FactualClaim[] {
  if (!Array.isArray(value)) return [];
  return (value as FactualClaim[]).map((claim) => ({
    ...claim,
    citationIndexes: Array.isArray(claim.citationIndexes) ? claim.citationIndexes : [],
    sourceIds: Array.isArray(claim.sourceIds) ? claim.sourceIds : [],
  }));
}

function manualSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizedSentence(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, " ").trim();
}

function manualClaimsAdded(previousText: string, nextText: string): FactualClaim[] {
  const previous = new Set(manualSentences(previousText).map(normalizedSentence));
  return manualSentences(nextText)
    .filter((sentence) => !previous.has(normalizedSentence(sentence)))
    .map((sentence) => ({
      claimKey: `manual_${createHash("sha256").update(sentence).digest("hex").slice(0, 16)}`,
      statement: sentence,
      unverified: true,
      citationIndexes: [],
      sourceIds: [],
    }));
}

function shotsFromScript(structured: StructuredScript): ShotDraft[] {
  return structured.beats.map((beat, index) => ({
    sequenceNo: index + 1,
    startSeconds: beat.startSeconds,
    endSeconds: beat.endSeconds,
    narration: beat.narration,
    onScreenText: beat.onScreenText || null,
    visualDescription: `${beat.purpose} 장면. 한 가지 정보만 보여줍니다. 화면 글자는 후처리합니다.`,
    cameraDirection: "static_9_16",
    generationPrompt: null,
    negativePrompt: "on-screen text, watermark, logo copy",
    assetStrategy: beat.purpose === "cta" ? "motion_graphic" : "ai_video",
  }));
}

async function pinnedBrief(
  db: Database,
  workspaceId: string,
  project: ContentProjectRow,
): Promise<StoredBrief | null> {
  if (!project.researchBriefId) return null;
  const brief = await getResearchBriefById(db, workspaceId, project.researchBriefId);
  if (!brief || brief.topicId !== project.topicId) {
    throw new DomainError(
      "CONFLICT",
      "Project에 고정된 Research Brief가 없거나 다른 Topic 소속입니다.",
    );
  }
  return brief;
}

function fullShotSnapshot(shot: ShotRow) {
  return {
    id: shot.id,
    scriptId: shot.scriptId,
    sequenceNo: shot.sequenceNo,
    startSeconds: shot.startSeconds,
    endSeconds: shot.endSeconds,
    narration: shot.narration,
    onScreenText: shot.onScreenText,
    visualDescription: shot.visualDescription,
    cameraDirection: shot.cameraDirection,
    generationPrompt: shot.generationPrompt,
    negativePrompt: shot.negativePrompt,
    assetStrategy: shot.assetStrategy,
    status: shot.status,
  };
}

function fullCitationSnapshot(mapping: ScriptCitationRow) {
  return {
    claimKey: mapping.claimKey,
    sourceId: mapping.sourceId,
    quoteExcerpt: mapping.quoteExcerpt,
    supportLevel: mapping.supportLevel,
  };
}

function qaInputHash(input: {
  project: ContentProjectRow;
  brief: StoredBrief | null;
  script: ScriptRow;
  shots: ShotRow[];
  citations: ScriptCitationRow[];
  referenceVideoTextHash: string;
}): string {
  return snapshotHash({
    projectId: input.project.id,
    qaRuleVersion: QA_RULE_VERSION,
    targetDurationSeconds: input.project.targetDurationSeconds,
    brandProfileId: input.project.brandProfileId,
    referenceVideoTextHash: input.referenceVideoTextHash,
    researchBriefId: input.brief?.id ?? null,
    researchBriefInputHash: input.brief?.inputHash ?? null,
    script: {
      id: input.script.id,
      version: input.script.version,
      title: input.script.title,
      hook: input.script.hook,
      scriptText: input.script.scriptText,
      structuredScript: input.script.structuredScript,
      factualClaims: input.script.factualClaims,
      inputHash: input.script.inputHash,
      status: input.script.status,
    },
    citations: input.citations.map(fullCitationSnapshot),
    shots: input.shots.map(fullShotSnapshot),
  });
}

async function loadIntegrityInput(
  db: Database,
  workspaceId: string,
  project: ContentProjectRow,
  script: ScriptRow,
) {
  if (script.contentProjectId !== project.id) {
    throw new DomainError("CONFLICT", "Script가 현재 Project 소속이 아닙니다.");
  }
  const [brief, shotRows, citationRows, referenceTexts] = await Promise.all([
    pinnedBrief(db, workspaceId, project),
    listShots(db, workspaceId, script.id),
    listScriptCitations(db, workspaceId, script.id),
    listTopicReferenceTexts(db, workspaceId, project.topicId),
  ]);
  const sortedReferenceTexts = [...referenceTexts].sort((left, right) =>
    left.localeCompare(right),
  );
  const referenceVideoTextHash = snapshotHash(sortedReferenceTexts);
  return {
    brief,
    shots: shotRows,
    citations: citationRows,
    referenceTexts: sortedReferenceTexts,
    referenceVideoTextHash,
    inputHash: qaInputHash({
      project,
      brief,
      script,
      shots: shotRows,
      citations: citationRows,
      referenceVideoTextHash,
    }),
  };
}

function sourceMappingErrors(input: {
  claims: FactualClaim[];
  briefSources: Array<{ citationIndex: number; sourceId: string }>;
  scriptCitations: ScriptCitationRow[];
}): string[] {
  const sourceByIndex = new Map(
    input.briefSources.map((source) => [source.citationIndex, source.sourceId]),
  );
  const actual = new Map<string, Set<string>>();
  for (const mapping of input.scriptCitations) {
    const bucket = actual.get(mapping.claimKey) ?? new Set<string>();
    bucket.add(mapping.sourceId);
    actual.set(mapping.claimKey, bucket);
  }

  const errors: string[] = [];
  const claimKeys = new Set(input.claims.map((claim) => claim.claimKey));
  for (const mapping of input.scriptCitations) {
    if (!claimKeys.has(mapping.claimKey)) {
      errors.push(`${mapping.claimKey}: 존재하지 않는 Claim의 script_citations 매핑입니다.`);
    }
  }
  for (const claim of input.claims) {
    const resolved = claim.citationIndexes
      .map((index) => sourceByIndex.get(index))
      .filter((sourceId): sourceId is string => Boolean(sourceId));
    const expected = [...new Set(resolved)].sort();
    const storedInClaim = [...new Set(claim.sourceIds ?? [])].sort();
    const persisted = [...(actual.get(claim.claimKey) ?? new Set<string>())].sort();

    if (!claim.unverified && expected.length !== claim.citationIndexes.length) {
      errors.push(`${claim.claimKey}: Research Citation에 해당하는 Source가 없습니다.`);
    }
    if (JSON.stringify(expected) !== JSON.stringify(storedInClaim)) {
      errors.push(`${claim.claimKey}: Claim sourceIds가 Research Citation과 다릅니다.`);
    }
    if (JSON.stringify(expected) !== JSON.stringify(persisted)) {
      errors.push(`${claim.claimKey}: script_citations 매핑이 Claim과 다릅니다.`);
    }
  }
  return errors;
}

export async function importReferenceVideo(options: {
  db: Database;
  system: Database;
  youtube: YouTubeDiscoveryProvider;
  workspaceId: string;
  userId: string;
  request: ImportReferenceVideoInput;
  idempotencyKey: string | null;
  requestId?: string;
}) {
  const videoId = parseYouTubeVideoId(options.request.url);
  if (!videoId) {
    throw new DomainError("VALIDATION_FAILED", "YouTube 영상 URL 또는 11자 ID가 필요합니다.");
  }

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "reference.import",
    entityType: "reference_video",
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { url: options.request.url, transcriptProvided: Boolean(options.request.transcript) },
  });

  if (run.reused) {
    return { runId: run.runId, reused: true as const };
  }

  try {
    const fetched = await options.youtube.getVideos({
      workspaceId: options.workspaceId,
      videoIds: [videoId],
    });
    const video = fetched.videos[0];
    if (!video) {
      throw new DomainError("NOT_FOUND", "영상을 찾지 못했습니다. Demo에서는 Mock 메타데이터를 씁니다.");
    }

    const ids = await upsertReferenceVideos(options.db, options.workspaceId, [video], {
      now: new Date(),
    });
    const id = ids.get(video.externalVideoId);
    if (!id) throw new DomainError("INTERNAL_ERROR", "영상 저장에 실패했습니다.");

    const transcript = options.request.transcript?.trim() ?? "";
    await mergeReferenceMetadata(options.db, options.workspaceId, id, {
      importSource: "manual",
      transcriptProvided: transcript.length > 0,
      transcriptText: transcript.length > 0 ? transcript : null,
    });

    await addWorkflowStep(options.system, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 1,
      stepKey: "reference:import",
      provider: "youtube_data",
      status: "succeeded",
      inputSummary: { externalVideoId: videoId },
      outputSummary: { referenceVideoId: id, transcriptProvided: transcript.length > 0 },
    });
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "succeeded",
      output: { referenceVideoId: id },
    });
    await writeAuditLog(options.system, {
      workspaceId: options.workspaceId,
      actorUserId: options.userId,
      action: "reference.imported",
      entityType: "reference_video",
      entityId: id,
      afterState: { transcriptProvided: transcript.length > 0 },
    });

    return {
      runId: run.runId,
      reused: false as const,
      video: await getReferenceVideo(options.db, options.workspaceId, id),
    };
  } catch (error) {
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "failed",
      errorCode: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : "Import 실패",
    });
    throw error;
  }
}

export async function analyzeReferenceDna(options: {
  db: Database;
  system: Database;
  provider: ContentStudioProvider;
  workspaceId: string;
  userId: string;
  referenceVideoId: string;
  idempotencyKey: string | null;
}) {
  const video = await getReferenceVideo(options.db, options.workspaceId, options.referenceVideoId);
  if (!video) throw new DomainError("NOT_FOUND", "참고 영상을 찾을 수 없습니다.");
  const meta = readImportMeta(video.metadata);

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "dna.analyze",
    entityType: "reference_video",
    entityId: video.id,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { referenceVideoId: video.id, transcriptProvided: meta.transcriptProvided },
  });
  if (run.reused) return { runId: run.runId, reused: true as const };

  try {
    const result = await options.provider.analyzeDna({
      workspaceId: options.workspaceId,
      title: video.title,
      description: video.description,
      durationSeconds: video.durationSeconds,
      transcript: meta.transcriptProvided ? meta.transcriptText : null,
    });

    if (!meta.transcriptProvided) {
      const usedTranscript = result.content.evidence.some(
        (item) => item.evidenceType === "user_supplied_transcript",
      );
      if (usedTranscript || result.content.structuredPattern.transcriptIncluded) {
        throw new DomainError(
          "VALIDATION_FAILED",
          "대본이 입력에 없는데 대본을 본 것처럼 분석 결과가 나왔습니다.",
        );
      }
    }

    const pattern = await insertDnaPattern(options.db, {
      workspaceId: options.workspaceId,
      referenceVideoId: video.id,
      content: result.content,
      modelName: result.modelName,
      promptVersion: result.promptVersion,
    });

    await addWorkflowStep(options.system, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 1,
      stepKey: "dna:analyze",
      provider: "gemini",
      status: "succeeded",
      inputSummary: { transcriptProvided: meta.transcriptProvided },
      outputSummary: { patternId: pattern.id },
    });
    await finishWorkflowRun(options.system, { runId: run.runId, status: "succeeded", output: { patternId: pattern.id } });

    return { runId: run.runId, reused: false as const, pattern, transcriptProvided: meta.transcriptProvided };
  } catch (error) {
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "failed",
      errorCode: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : "DNA 분석 실패",
    });
    throw error;
  }
}

export async function createStudioProject(options: {
  db: Database;
  workspaceId: string;
  userId: string;
  request: CreateProjectInput;
}) {
  const detail = await getTopicDetail(options.db, options.workspaceId, options.request.topicId);
  if (!detail) throw new DomainError("NOT_FOUND", "Topic을 찾을 수 없습니다.");
  if (detail.topic.decision !== "approved") {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "승인한 주제만 Content Studio 프로젝트로 만들 수 있습니다.",
    );
  }

  const brief = options.request.researchBriefId
    ? await getResearchBriefById(
        options.db,
        options.workspaceId,
        options.request.researchBriefId,
      )
    : await getLatestResearchBrief(options.db, options.workspaceId, options.request.topicId);
  if (
    options.request.researchBriefId &&
    (!brief || brief.topicId !== options.request.topicId)
  ) {
    throw new DomainError(
      "CONFLICT",
      "선택한 Research Brief가 없거나 이 Topic 소속이 아닙니다.",
    );
  }

  const project = await insertContentProject(options.db, {
    workspaceId: options.workspaceId,
    topicId: options.request.topicId,
    researchBriefId: brief?.id ?? null,
    title: options.request.title ?? detail.topic.title,
    targetLanguage: options.request.targetLanguage,
    targetDurationSeconds: options.request.targetDurationSeconds,
    ownerUserId: options.userId,
    status: brief ? "research_ready" : "draft",
  });

  return { project, brief };
}

export async function generateProjectAngles(options: {
  db: Database;
  system: Database;
  provider: ContentStudioProvider;
  workspaceId: string;
  userId: string;
  projectId: string;
  idempotencyKey: string | null;
}) {
  const project = await requireProject(options.db, options.workspaceId, options.projectId);
  const brief = await pinnedBrief(options.db, options.workspaceId, project);

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "content.angles",
    entityType: "content_project",
    entityId: project.id,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { projectId: project.id },
  });
  if (run.reused) return { runId: run.runId, reused: true as const };

  try {
    const result = await options.provider.generateAngles({
      topicTitle: project.title,
      language: project.targetLanguage,
      targetDurationSeconds: project.targetDurationSeconds,
      briefSummary: brief?.content.executiveSummary ?? "",
      keyFacts: (brief?.content.keyFacts ?? []).map((fact) => ({
        statement: fact.statement,
        unverified: fact.citationIndexes.length === 0,
      })),
      unknowns: brief?.content.unknowns ?? [],
    });

    if (result.angles.length !== 3) {
      throw new DomainError("VALIDATION_FAILED", "Angle은 서로 다른 세 개여야 합니다.");
    }

    const version = await nextAngleVersion(options.db, options.workspaceId, project.id);
    const rows = await insertAngleBatch(options.db, {
      workspaceId: options.workspaceId,
      projectId: project.id,
      version,
      drafts: result.angles,
    });
    await updateProjectStatus(options.db, options.workspaceId, project.id, "research_ready");
    await addWorkflowStep(options.system, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 1,
      stepKey: "content:angles",
      provider: "gemini",
      status: "succeeded",
      inputSummary: { projectId: project.id },
      outputSummary: { count: rows.length, version },
    });
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "succeeded",
      output: { angleIds: rows.map((row) => row.id), version },
    });
    return { runId: run.runId, reused: false as const, angles: rows, version };
  } catch (error) {
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "failed",
      errorCode: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : "Angle 생성 실패",
    });
    throw error;
  }
}

export async function selectProjectAngle(options: {
  db: Database;
  workspaceId: string;
  projectId: string;
  angleId: string;
}) {
  const project = await requireProject(options.db, options.workspaceId, options.projectId);
  const angle = await getAngle(options.db, options.workspaceId, options.angleId);
  if (!angle || angle.contentProjectId !== project.id) {
    throw new DomainError("NOT_FOUND", "Angle을 찾을 수 없습니다.");
  }
  await selectAngle(options.db, options.workspaceId, project.id, angle.id);
  const scripts = await listScripts(options.db, options.workspaceId, project.id);
  return {
    selectedAngleId: angle.id,
    previousScriptsPreserved: scripts.length > 0,
  };
}

export async function generateProjectScript(options: {
  db: Database;
  system: Database;
  provider: ContentStudioProvider;
  workspaceId: string;
  userId: string;
  projectId: string;
  idempotencyKey: string | null;
}) {
  const project = await requireProject(options.db, options.workspaceId, options.projectId);
  if (!project.selectedAngleId) {
    throw new DomainError("INVALID_STATE_TRANSITION", "먼저 Angle을 선택하세요.");
  }
  const angle = await getAngle(options.db, options.workspaceId, project.selectedAngleId);
  if (!angle) throw new DomainError("NOT_FOUND", "선택한 Angle을 찾을 수 없습니다.");

  const brief = await pinnedBrief(options.db, options.workspaceId, project);
  const citationCount = brief?.content.citations.length ?? 0;
  const keyFacts = (brief?.content.keyFacts ?? []).map((fact, index) => ({
    statement: fact.statement,
    claimKey: `fact_${index + 1}`,
    unverified: fact.citationIndexes.length === 0,
    citationIndexes: [...fact.citationIndexes],
  }));

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "content.script",
    entityType: "content_project",
    entityId: project.id,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { projectId: project.id, angleId: angle.id },
  });
  if (run.reused) return { runId: run.runId, reused: true as const };

  try {
    const result = await options.provider.generateScript({
      topicTitle: project.title,
      language: project.targetLanguage,
      targetDurationSeconds: project.targetDurationSeconds,
      angle: {
        title: angle.title,
        hook: angle.hook,
        promise: angle.promise,
        outline: (angle.outline as string[]) ?? [],
      },
      keyFacts,
      citationCount,
    });

    const researchFactByKey = new Map(keyFacts.map((fact) => [fact.claimKey, fact]));
    const providerClaims = (result.structured.factualClaims as FactualClaim[]).map(
      (claim) => {
        const researchFact = researchFactByKey.get(claim.claimKey);
        return researchFact
          ? {
              ...claim,
              statement: researchFact.statement,
              unverified: researchFact.unverified,
              citationIndexes: [...researchFact.citationIndexes],
              sourceIds: [],
            }
          : {
              ...claim,
              unverified: true,
              citationIndexes: [],
              sourceIds: [],
            };
      },
    );
    const normalizedClaims = normalizeFactualClaims(
      providerClaims,
      citationCount,
    );
    const briefSources = brief
      ? await resolveBriefCitationSources(options.db, options.workspaceId, brief)
      : [];
    const sourceByIndex = new Map(
      briefSources.map((source) => [source.citationIndex, source.sourceId]),
    );
    const claims = normalizedClaims.map((claim) => ({
      ...claim,
      sourceIds: [
        ...new Set(
          claim.citationIndexes
            .map((citationIndex) => sourceByIndex.get(citationIndex))
            .filter((sourceId): sourceId is string => Boolean(sourceId)),
        ),
      ],
    }));
    const unresolved = claims.some(
      (claim) =>
        !claim.unverified &&
        claim.citationIndexes.some((citationIndex) => !sourceByIndex.has(citationIndex)),
    );
    if (unresolved) {
      throw new DomainError(
        "CONFLICT",
        "Research Citation에 대응하는 Source가 없어 Script를 만들 수 없습니다.",
      );
    }
    if (!claimsHaveCitationOrFlag(claims)) {
      throw new DomainError("VALIDATION_FAILED", "사실 주장에 출처 또는 미확인 표시가 필요합니다.");
    }

    const text = scriptTextFrom({ ...result.structured, factualClaims: claims });
    const version = await nextScriptVersion(options.db, options.workspaceId, project.id);
    const inputHash = createHash("sha256")
      .update(
        [
          project.id,
          angle.id,
          angle.version,
          brief?.id ?? "no-brief",
          brief?.inputHash ?? "no-brief-hash",
          result.promptVersion,
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 32);

    const script = await insertScript(options.db, {
      workspaceId: options.workspaceId,
      projectId: project.id,
      angleId: angle.id,
      version,
      structured: { ...result.structured, factualClaims: claims },
      scriptText: text,
      wordCount: tokenize(text).length,
      estimatedDurationSeconds: estimateSpokenSeconds(text),
      claims,
      originalitySummary: { note: "QA 단계에서 n-gram 겹침을 계산합니다. 법률 판단이 아닙니다." },
      modelName: result.modelName,
      promptVersion: result.promptVersion,
      inputHash,
      createdBy: options.userId,
    });
    await insertScriptCitations(options.db, {
      workspaceId: options.workspaceId,
      scriptId: script.id,
      mappings: claims.flatMap((claim) =>
        claim.sourceIds.map((sourceId) => ({
          sourceId,
          claimKey: claim.claimKey,
          quoteExcerpt: claim.statement,
          supportLevel: "direct" as const,
        })),
      ),
    });

    const shots = await replaceShots(
      options.db,
      options.workspaceId,
      script.id,
      shotsFromScript({ ...result.structured, factualClaims: claims }),
    );
    await updateProjectStatus(options.db, options.workspaceId, project.id, "scripting");
    await addWorkflowStep(options.system, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 1,
      stepKey: "content:script",
      provider: "gemini",
      status: "succeeded",
      inputSummary: { angleId: angle.id },
      outputSummary: { scriptId: script.id, version, claims: claims.length },
    });
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "succeeded",
      output: { scriptId: script.id, version },
    });
    return { runId: run.runId, reused: false as const, script, shots, claims };
  } catch (error) {
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "failed",
      errorCode: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : "Script 생성 실패",
    });
    throw error;
  }
}

export async function restoreScriptVersion(options: {
  db: Database;
  workspaceId: string;
  userId: string;
  projectId: string;
  fromScriptId: string;
}) {
  const project = await requireProject(options.db, options.workspaceId, options.projectId);
  const source = await getScript(options.db, options.workspaceId, options.fromScriptId);
  if (!source || source.contentProjectId !== project.id) {
    throw new DomainError("NOT_FOUND", "복구할 Script를 찾을 수 없습니다.");
  }
  const originalStructured = source.structuredScript as StructuredScript;
  const claims = storedClaims(source.factualClaims);
  const structured = { ...originalStructured, factualClaims: claims };
  const version = await nextScriptVersion(options.db, options.workspaceId, project.id);
  const restored = await insertScript(options.db, {
    workspaceId: options.workspaceId,
    projectId: project.id,
    angleId: source.contentAngleId,
    version,
    structured,
    scriptText: source.scriptText,
    wordCount: source.wordCount,
    estimatedDurationSeconds: Number(source.estimatedDurationSeconds),
    claims,
    originalitySummary: (source.originalitySummary as Record<string, unknown>) ?? {},
    modelName: source.modelName ?? "restore",
    promptVersion: source.promptVersion,
    inputHash: source.inputHash,
    createdBy: options.userId,
    status: "draft",
  });
  const [previousShots, previousCitations] = await Promise.all([
    listShots(options.db, options.workspaceId, source.id),
    listScriptCitations(options.db, options.workspaceId, source.id),
  ]);
  await insertScriptCitations(options.db, {
    workspaceId: options.workspaceId,
    scriptId: restored.id,
    mappings: previousCitations.map((citation) => ({
      sourceId: citation.sourceId,
      claimKey: citation.claimKey,
      quoteExcerpt: citation.quoteExcerpt,
      supportLevel: citation.supportLevel as "direct" | "partial" | "context",
    })),
  });
  await replaceShots(
    options.db,
    options.workspaceId,
    restored.id,
    previousShots.map((shot) => ({
      sequenceNo: shot.sequenceNo,
      startSeconds: Number(shot.startSeconds),
      endSeconds: Number(shot.endSeconds),
      narration: shot.narration,
      onScreenText: shot.onScreenText,
      visualDescription: shot.visualDescription,
      cameraDirection: shot.cameraDirection,
      generationPrompt: shot.generationPrompt,
      negativePrompt: shot.negativePrompt,
      assetStrategy: shot.assetStrategy as ShotDraft["assetStrategy"],
    })),
  );
  return restored;
}

export async function patchDraftScript(options: {
  db: Database;
  workspaceId: string;
  userId: string;
  scriptId: string;
  title?: string;
  hook?: string;
  scriptText?: string;
}) {
  const script = await getScript(options.db, options.workspaceId, options.scriptId);
  if (!script) throw new DomainError("NOT_FOUND", "Script를 찾을 수 없습니다.");
  const project = await requireProject(
    options.db,
    options.workspaceId,
    script.contentProjectId,
  );
  const nextTitle = options.title === undefined ? script.title : options.title.trim();
  const nextHook = options.hook === undefined ? script.hook : options.hook.trim();
  if (!nextTitle) {
    throw new DomainError("VALIDATION_FAILED", "공백 Title은 저장할 수 없습니다.");
  }
  if (!nextHook) {
    throw new DomainError("VALIDATION_FAILED", "공백 Hook은 저장할 수 없습니다.");
  }
  const oldStructured = script.structuredScript as StructuredScript;
  const originalClaims = storedClaims(script.factualClaims);
  const requestedText = options.scriptText?.trim() ?? script.scriptText.trim();
  if (!requestedText) {
    throw new DomainError("VALIDATION_FAILED", "공백 Script는 저장할 수 없습니다.");
  }
  const initialParagraphs = requestedText
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const paragraphs = initialParagraphs.length > 0 ? initialParagraphs : [requestedText];
  if (options.hook !== undefined) paragraphs[0] = nextHook;
  if (paragraphs.length < 2 || paragraphs.length > 16) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "수동 Script는 2개 이상 16개 이하 Beat로 구성해야 합니다. 줄바꿈으로 Beat를 구분하세요.",
    );
  }

  const text = paragraphs.join("\n");
  const finalNormalized = normalizedSentence(text);
  const retainedClaims = originalClaims.filter((claim) =>
    finalNormalized.includes(normalizedSentence(claim.statement)),
  );
  const addedClaims = manualClaimsAdded(script.scriptText, text);
  const claimByKey = new Map(
    [...retainedClaims, ...addedClaims].map((claim) => [claim.claimKey, claim]),
  );
  const claims = [...claimByKey.values()];
  const duration = oldStructured.targetDurationSeconds;
  const segment = duration / paragraphs.length;
  const structured = structuredScriptSchema.parse({
    ...oldStructured,
    title: nextTitle,
    hook: nextHook,
    beats: paragraphs.map((narration, index) => ({
      beatId: `b${index + 1}`,
      startSeconds: Math.round(index * segment * 100) / 100,
      endSeconds: Math.round((index + 1) * segment * 100) / 100,
      purpose:
        index === 0 ? "hook" : index === paragraphs.length - 1 ? "cta" : "content",
      narration,
      onScreenText:
        index === 0 ? nextHook : "",
      claimKeys: claims
        .filter((claim) => narration.includes(claim.statement))
        .map((claim) => claim.claimKey),
    })),
    factualClaims: claims,
    estimatedDurationSeconds: estimateSpokenSeconds(text),
  });
  const version = await nextScriptVersion(options.db, options.workspaceId, project.id);
  const created = await insertScript(options.db, {
    workspaceId: options.workspaceId,
    projectId: project.id,
    angleId: script.contentAngleId,
    version,
    structured,
    scriptText: text,
    wordCount: tokenize(text).length,
    estimatedDurationSeconds: structured.estimatedDurationSeconds,
    claims,
    originalitySummary: (script.originalitySummary as Record<string, unknown>) ?? {},
    modelName: script.modelName ?? "manual-edit",
    promptVersion: script.promptVersion,
    inputHash: snapshotHash({
      parentScriptId: script.id,
      structured,
      claims,
    }),
    createdBy: options.userId,
    status: "draft",
  });

  const previousCitations = await listScriptCitations(
    options.db,
    options.workspaceId,
    script.id,
  );
  const claimKeys = new Set(claims.map((claim) => claim.claimKey));
  await insertScriptCitations(options.db, {
    workspaceId: options.workspaceId,
    scriptId: created.id,
    mappings: previousCitations
      .filter((citation) => claimKeys.has(citation.claimKey))
      .map((citation) => ({
        sourceId: citation.sourceId,
        claimKey: citation.claimKey,
        quoteExcerpt: citation.quoteExcerpt,
        supportLevel: citation.supportLevel as "direct" | "partial" | "context",
      })),
  });
  const shotRows = await replaceShots(
    options.db,
    options.workspaceId,
    created.id,
    shotsFromScript(structured),
  );
  await updateProjectStatus(options.db, options.workspaceId, project.id, "scripting");
  return { script: created, shots: shotRows, qaRequired: true };
}

export async function generateShotsForScript(options: {
  db: Database;
  workspaceId: string;
  scriptId: string;
}) {
  const script = await getScript(options.db, options.workspaceId, options.scriptId);
  if (!script) throw new DomainError("NOT_FOUND", "Script를 찾을 수 없습니다.");
  const structured = script.structuredScript as StructuredScript;
  const rows = await replaceShots(
    options.db,
    options.workspaceId,
    script.id,
    shotsFromScript(structured),
  );
  return rows;
}

export async function runProjectQa(options: {
  db: Database;
  system: Database;
  workspaceId: string;
  userId: string;
  projectId: string;
  scriptId?: string;
  checks: QaCheckType[];
  idempotencyKey: string | null;
}) {
  const project = await requireProject(options.db, options.workspaceId, options.projectId);
  const versions = await listScripts(options.db, options.workspaceId, project.id);
  const script = options.scriptId
    ? await getScript(options.db, options.workspaceId, options.scriptId)
    : (versions[0] ?? null);
  if (!script || script.contentProjectId !== project.id) {
    throw new DomainError("NOT_FOUND", "QA할 Script가 없습니다.");
  }

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "content.qa",
    entityType: "script",
    entityId: script.id,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { projectId: project.id, scriptId: script.id, checks: options.checks },
  });
  if (run.reused) return { runId: run.runId, reused: true as const };

  try {
    const integrity = await loadIntegrityInput(
      options.db,
      options.workspaceId,
      project,
      script,
    );
    const briefSources = integrity.brief
      ? await resolveBriefCitationSources(
          options.db,
          options.workspaceId,
          integrity.brief,
        )
      : [];
    const structured = script.structuredScript as StructuredScript;
    const claims = storedClaims(script.factualClaims);
    const mappingErrors = sourceMappingErrors({
      claims,
      briefSources,
      scriptCitations: integrity.citations,
    });
    const checks = runQaChecks({
      scriptText: script.scriptText,
      structured,
      claims,
      citationCount: integrity.brief?.content.citations.length ?? 0,
      targetDurationSeconds: project.targetDurationSeconds,
      estimatedDurationSeconds: Number(script.estimatedDurationSeconds),
      referenceTexts: integrity.referenceTexts,
      hasBrandProfile: Boolean(project.brandProfileId),
      checks: options.checks,
    });
    if (mappingErrors.length > 0) {
      const fact = checks.find((check) => check.type === "fact");
      if (fact) {
        fact.result = "fail";
        fact.score = 0;
        fact.severity = "blocker";
        fact.findings.push(
          ...mappingErrors.map((message) => ({
            code: "SOURCE_MAPPING_INVALID",
            message,
          })),
        );
      }
    }

    const rows = await insertQaReviews(options.db, {
      workspaceId: options.workspaceId,
      projectId: project.id,
      scriptId: script.id,
      checks,
      ruleVersion: QA_RULE_VERSION,
      modelName: "deterministic-qa",
      inputHash: integrity.inputHash,
    });
    await updateProjectStatus(options.db, options.workspaceId, project.id, "qa_review");
    await addWorkflowStep(options.system, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 1,
      stepKey: "content:qa",
      provider: "internal",
      status: "succeeded",
      inputSummary: { scriptId: script.id },
      outputSummary: { blocking: qaHasBlocker(checks), checks: checks.map((check) => check.type) },
    });
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "succeeded",
      output: { blocking: qaHasBlocker(checks) },
    });
    return {
      runId: run.runId,
      reused: false as const,
      checks,
      rows,
      blocking: qaHasBlocker(checks),
      scriptId: script.id,
    };
  } catch (error) {
    await finishWorkflowRun(options.system, {
      runId: run.runId,
      status: "failed",
      errorCode: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : "QA 실패",
    });
    throw error;
  }
}

export async function decideProjectApproval(options: {
  db: Database;
  system: Database;
  workspaceId: string;
  userId: string;
  projectId: string;
  request: ProjectApprovalInput;
}) {
  const project = await requireProject(options.db, options.workspaceId, options.projectId);
  const versions = await listScripts(options.db, options.workspaceId, project.id);
  const script = options.request.scriptId
    ? await getScript(options.db, options.workspaceId, options.request.scriptId)
    : (versions[0] ?? null);
  if (!script) throw new DomainError("NOT_FOUND", "승인할 Script가 없습니다.");
  if (script.contentProjectId !== project.id) {
    throw new DomainError("CONFLICT", "Script가 현재 Project 소속이 아닙니다.");
  }

  const readiness = await getProjectApprovalReadiness(
    options.db,
    options.workspaceId,
    project,
    script,
  );
  if (options.request.decision === "approved" && !readiness.canApprove) {
    throw new DomainError("CONFLICT", readiness.message, {
      details: {
        missingChecks: readiness.missingChecks,
        staleChecks: readiness.staleChecks,
        blockingChecks: readiness.blockingChecks,
      },
    });
  }

  const hash = snapshotHash({
    projectId: project.id,
    researchBriefId: readiness.integrity.brief?.id ?? null,
    researchBriefInputHash: readiness.integrity.brief?.inputHash ?? null,
    script: {
      id: script.id,
      version: script.version,
      title: script.title,
      hook: script.hook,
      scriptText: script.scriptText,
      structuredScript: script.structuredScript,
      wordCount: script.wordCount,
      estimatedDurationSeconds: script.estimatedDurationSeconds,
      factualClaims: script.factualClaims,
      originalitySummary: script.originalitySummary,
      promptVersion: script.promptVersion,
      inputHash: script.inputHash,
      status: script.status,
    },
    claimSources: readiness.integrity.citations.map(fullCitationSnapshot),
    shots: readiness.integrity.shots.map(fullShotSnapshot),
    qa: readiness.latestQa.map((row) => ({
      checkType: row.checkType,
      result: row.result,
      score: row.score,
      severity: row.severity,
      findings: row.findings,
      modelName: row.modelName,
      ruleVersion: row.ruleVersion,
      inputHash: row.inputHash,
    })),
  });

  const approval = await insertApproval(options.system, {
    workspaceId: options.workspaceId,
    entityType: "content_project",
    entityId: project.id,
    entityVersion: script.version,
    decision: options.request.decision,
    comment: options.request.comment ?? null,
    decidedBy: options.userId,
    snapshotHash: hash,
  });

  const nextStatus =
    options.request.decision === "approved"
      ? "approved_to_render"
      : options.request.decision === "rejected"
        ? "rejected"
        : "qa_review";
  await updateProjectStatus(options.db, options.workspaceId, project.id, nextStatus);
  await writeAuditLog(options.system, {
    workspaceId: options.workspaceId,
    actorUserId: options.userId,
    action: "content.approval",
    entityType: "content_project",
    entityId: project.id,
    afterState: { decision: options.request.decision, snapshotHash: hash },
  });

  return { approval, snapshotHash: hash, blocking: readiness.blockingChecks.length > 0 };
}

export async function getProjectApprovalReadiness(
  db: Database,
  workspaceId: string,
  project: ContentProjectRow,
  script: ScriptRow,
) {
  if (script.contentProjectId !== project.id) {
    throw new DomainError("CONFLICT", "Script가 현재 Project 소속이 아닙니다.");
  }
  const integrity = await loadIntegrityInput(db, workspaceId, project, script);
  const qaRows = await listLatestQa(db, workspaceId, project.id, script.id);
  const latestByType = new Map<string, (typeof qaRows)[number]>();
  for (const row of qaRows) {
    if (!latestByType.has(row.checkType)) latestByType.set(row.checkType, row);
  }
  const missingChecks = qaCheckTypes.filter((type) => !latestByType.has(type));
  const staleChecks = qaCheckTypes.filter((type) => {
    const row = latestByType.get(type);
    return Boolean(
      row &&
        (row.inputHash !== integrity.inputHash || row.ruleVersion !== QA_RULE_VERSION),
    );
  });
  const blockingChecks = qaCheckTypes.filter(
    (type) => latestByType.get(type)?.severity === "blocker",
  );
  const latestQa = qaCheckTypes.flatMap((type) => {
    const row = latestByType.get(type);
    return row ? [row] : [];
  });
  const canApprove =
    missingChecks.length === 0 &&
    staleChecks.length === 0 &&
    blockingChecks.length === 0;
  const message =
    missingChecks.length > 0
      ? `QA 6종이 모두 필요합니다. 누락: ${missingChecks.join(", ")}`
      : staleChecks.length > 0
        ? `현재 Script·Claims·Shots·Research Brief와 QA가 일치하지 않습니다. 다시 실행하세요: ${staleChecks.join(", ")}`
        : blockingChecks.length > 0
          ? `Blocker QA가 있어 승인할 수 없습니다: ${blockingChecks.join(", ")}`
          : "승인할 수 있습니다.";

  return {
    canApprove,
    message,
    missingChecks,
    staleChecks,
    blockingChecks,
    latestQa,
    integrity,
  };
}

export async function loadStudioBoard(db: Database, workspaceId: string) {
  const [projects, eligible, patterns, videos] = await Promise.all([
    listContentProjects(db, workspaceId),
    listEligibleStudioTopics(db, workspaceId),
    listDnaPatterns(db, workspaceId),
    listReferenceVideosForLibrary(db, workspaceId),
  ]);
  return { projects, eligible, patterns, videos };
}

export async function loadStudioProject(db: Database, workspaceId: string, projectId: string) {
  const project = await requireProject(db, workspaceId, projectId);
  const [angles, versions, approvals, brief] = await Promise.all([
    listAngles(db, workspaceId, projectId),
    listScripts(db, workspaceId, projectId),
    listApprovals(db, workspaceId, projectId),
    pinnedBrief(db, workspaceId, project),
  ]);
  const latestScript = versions[0] ?? null;
  const shotRows = latestScript ? await listShots(db, workspaceId, latestScript.id) : [];
  const qa = latestScript ? await listLatestQa(db, workspaceId, projectId, latestScript.id) : [];
  const approvalReadiness = latestScript
    ? await getProjectApprovalReadiness(db, workspaceId, project, latestScript)
    : {
        canApprove: false,
        message: "승인할 Script가 없습니다.",
        missingChecks: [...qaCheckTypes],
        staleChecks: [],
        blockingChecks: [],
      };
  return {
    project,
    angles,
    scripts: versions,
    latestScript,
    shots: shotRows,
    qa,
    approvals,
    brief,
    approvalReadiness: {
      canApprove: approvalReadiness.canApprove,
      message: approvalReadiness.message,
      missingChecks: approvalReadiness.missingChecks,
      staleChecks: approvalReadiness.staleChecks,
      blockingChecks: approvalReadiness.blockingChecks,
    },
  };
}

async function requireProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ContentProjectRow> {
  const project = await getContentProject(db, workspaceId, projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Project를 찾을 수 없습니다.");
  return project;
}

export type { ScriptRow };
