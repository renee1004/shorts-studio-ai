import { createHash } from "node:crypto";
import {
  claimsHaveCitationOrFlag,
  normalizeFactualClaims,
  parseYouTubeVideoId,
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
  getReferenceVideo,
  getScript,
  getTopicDetail,
  insertAngleBatch,
  insertApproval,
  insertContentProject,
  insertDnaPattern,
  insertQaReviews,
  insertScript,
  listAngles,
  listApprovals,
  listContentProjects,
  listDnaPatterns,
  listEligibleStudioTopics,
  listLatestQa,
  listReferenceVideosForLibrary,
  listScripts,
  listShots,
  mergeReferenceMetadata,
  nextAngleVersion,
  nextScriptVersion,
  readImportMeta,
  replaceShots,
  selectAngle,
  startWorkflowRun,
  updateDraftScript,
  updateProjectStatus,
  upsertReferenceVideos,
  writeAuditLog,
  type ContentProjectRow,
  type Database,
  type ScriptRow,
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

  const brief = await getLatestResearchBrief(options.db, options.workspaceId, options.request.topicId);

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
  const brief = project.researchBriefId
    ? await getLatestResearchBrief(options.db, options.workspaceId, project.topicId)
    : null;

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

  const brief = await getLatestResearchBrief(options.db, options.workspaceId, project.topicId);
  const citationCount = brief?.content.citations.length ?? 0;
  const keyFacts = (brief?.content.keyFacts ?? []).map((fact, index) => ({
    statement: fact.statement,
    claimKey: `fact_${index + 1}`,
    unverified: fact.citationIndexes.length === 0,
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

    const claims = normalizeFactualClaims(
      result.structured.factualClaims as FactualClaim[],
      citationCount,
    );
    if (!claimsHaveCitationOrFlag(claims)) {
      throw new DomainError("VALIDATION_FAILED", "사실 주장에 출처 또는 미확인 표시가 필요합니다.");
    }

    const text = scriptTextFrom({ ...result.structured, factualClaims: claims });
    const version = await nextScriptVersion(options.db, options.workspaceId, project.id);
    const inputHash = createHash("sha256")
      .update([project.id, angle.id, angle.version, result.promptVersion].join("|"))
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
  const structured = source.structuredScript as StructuredScript;
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
    claims: source.factualClaims as FactualClaim[],
    originalitySummary: (source.originalitySummary as Record<string, unknown>) ?? {},
    modelName: source.modelName ?? "restore",
    promptVersion: source.promptVersion,
    inputHash: source.inputHash,
    createdBy: options.userId,
    status: "draft",
  });
  const previousShots = await listShots(options.db, options.workspaceId, source.id);
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
  scriptId: string;
  title?: string;
  hook?: string;
  scriptText?: string;
}) {
  const script = await getScript(options.db, options.workspaceId, options.scriptId);
  if (!script) throw new DomainError("NOT_FOUND", "Script를 찾을 수 없습니다.");
  if (script.status !== "draft") {
    throw new DomainError("INVALID_STATE_TRANSITION", "초안만 수정할 수 있습니다. 새 버전을 만드세요.");
  }
  const text = options.scriptText ?? script.scriptText;
  await updateDraftScript(options.db, options.workspaceId, script.id, {
    ...(options.title ? { title: options.title } : {}),
    ...(options.hook ? { hook: options.hook } : {}),
    ...(options.scriptText ? { scriptText: options.scriptText } : {}),
    wordCount: tokenize(text).length,
    estimatedDurationSeconds: estimateSpokenSeconds(text),
  });
  return getScript(options.db, options.workspaceId, script.id);
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
    const detail = await getTopicDetail(options.db, options.workspaceId, project.topicId);
    const referenceTexts = (detail?.videos ?? []).map(
      (row) => `${row.video.title}\n${row.video.description ?? ""}`,
    );
    const brief = await getLatestResearchBrief(options.db, options.workspaceId, project.topicId);
    const structured = script.structuredScript as StructuredScript;
    const claims = script.factualClaims as FactualClaim[];
    const checks = runQaChecks({
      scriptText: script.scriptText,
      structured,
      claims,
      citationCount: brief?.content.citations.length ?? 0,
      targetDurationSeconds: project.targetDurationSeconds,
      estimatedDurationSeconds: Number(script.estimatedDurationSeconds),
      referenceTexts,
      hasBrandProfile: Boolean(project.brandProfileId),
      checks: options.checks,
    });

    const rows = await insertQaReviews(options.db, {
      workspaceId: options.workspaceId,
      projectId: project.id,
      scriptId: script.id,
      checks,
      ruleVersion: "content.qa.v1",
      modelName: "deterministic-qa",
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

  const qaRows = await listLatestQa(options.db, options.workspaceId, project.id, script.id);
  const latestByType = new Map<string, (typeof qaRows)[number]>();
  for (const row of qaRows) {
    if (!latestByType.has(row.checkType)) latestByType.set(row.checkType, row);
  }
  const latest = [...latestByType.values()];
  const blocking = latest.some((row) => row.severity === "blocker");

  if (options.request.decision === "approved" && blocking) {
    throw new DomainError("INVALID_STATE_TRANSITION", "Blocker QA가 있어 승인할 수 없습니다.");
  }

  const shotRows = await listShots(options.db, options.workspaceId, script.id);
  const hash = snapshotHash({
    projectId: project.id,
    scriptId: script.id,
    version: script.version,
    scriptText: script.scriptText,
    claims: script.factualClaims,
    shots: shotRows.map((shot) => ({
      sequenceNo: shot.sequenceNo,
      visual: shot.visualDescription,
      start: shot.startSeconds,
      end: shot.endSeconds,
    })),
    qa: latest.map((row) => ({ type: row.checkType, result: row.result, severity: row.severity })),
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

  return { approval, snapshotHash: hash, blocking };
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
    getLatestResearchBrief(db, workspaceId, project.topicId),
  ]);
  const latestScript = versions[0] ?? null;
  const shotRows = latestScript ? await listShots(db, workspaceId, latestScript.id) : [];
  const qa = latestScript ? await listLatestQa(db, workspaceId, projectId, latestScript.id) : [];
  return {
    project,
    angles,
    scripts: versions,
    latestScript,
    shots: shotRows,
    qa,
    approvals,
    brief,
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
