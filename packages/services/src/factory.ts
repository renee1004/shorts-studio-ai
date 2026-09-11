import { findNarration, narrationFingerprint } from "./narration";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, rm, rename } from "node:fs/promises";
import { sql } from "drizzle-orm";
import path from "node:path";
import {
  RENDER_ENGINE_VERSION,
  RENDER_MANIFEST_VERSION,
  renderManifestSchema,
  type EnqueueRenderInput,
  type FactoryKanbanColumn,
  type MediaCapabilities,
  type RenderManifest,
  type RenderShotManifest,
} from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import {
  addWorkflowStep,
  countCostEventsForRun,
  claimQueuedRenderJob,
  finishWorkflowRun,
  getContentProject,
  getMediaAsset,
  getRenderJob,
  getRenderJobByCommandHash,
  getRenderJobById,
  insertApproval,
  insertCostEvent,
  insertMediaAsset,
  insertRenderJob,
  latestContentProjectApproval,
  latestRenderApproval,
  latestShotClip,
  listApprovedRenderProjects,
  listMediaAssetsForProject,
  listRenderJobs,
  listScripts,
  listShots,
  nextRenderVersion,
  serviceDb,
  startWorkflowRun,
  updateMediaAsset,
  updateProjectStatus,
  updateRenderJob,
  writeAuditLog,
  type ContentProjectRow,
  type Database,
  type MediaAssetRow,
  type RenderJobRow,
  type ScriptRow,
  type ShotRow,
} from "@shorts-os/db";
import type { VideoGenerationProvider } from "@shorts-os/providers";
import {
  assetFilePath,
  composeRender,
  ffmpegAvailable,
  mediaRoot,
  sha256File,
  writePlaceholderClip,
  writeImageClip,
} from "./render-engine";

function commandHash(manifest: RenderManifest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scriptId: manifest.scriptId,
        scriptVersion: manifest.scriptVersion,
        contentApprovalId: manifest.contentApprovalId,
        contentApprovalSnapshotHash: manifest.contentApprovalSnapshotHash,
        width: manifest.width,
        height: manifest.height,
        fps: manifest.fps,
        captionsInPost: true,
        shots: manifest.shots.map((shot) => ({
          shotId: shot.shotId,
          start: shot.startSeconds,
          end: shot.endSeconds,
          text: shot.onScreenText,
          strategy: shot.strategy,
          clipChecksum: shot.clipChecksum,
        })),
        voiceAssetId: manifest.voiceAssetId,
        retryOf: manifest.retryOf,
      }),
    )
    .digest("hex");
}

function kanbanColumn(
  job: RenderJobRow,
  approved: boolean,
): FactoryKanbanColumn {
  if (approved) return "approved";
  if (job.status === "failed") return "failed";
  if (job.status === "succeeded") return "ready";
  if (job.status === "queued") return "queued";
  return "generating";
}

function captionFor(shot: ShotRow): string {
  const text = (
    shot.onScreenText ??
    shot.narration ??
    shot.visualDescription
  ).trim();
  if (!text) {
    throw new DomainError(
      "VALIDATION_FAILED",
      `Shot ${shot.sequenceNo}에 화면 자막이 없습니다.`,
    );
  }
  return text;
}

async function buildManifest(options: {
  db: Database;
  workspaceId: string;
  project: ContentProjectRow;
  script: ScriptRow;
  approval: NonNullable<
    Awaited<ReturnType<typeof latestContentProjectApproval>>
  >;
  request: EnqueueRenderInput;
  videoCaps: MediaCapabilities;
}): Promise<RenderManifest> {
  const shots = await listShots(
    options.db,
    options.workspaceId,
    options.script.id,
  );
  if (shots.length < 2 || shots.length > 16) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "렌더하려면 Shot이 2–16개여야 합니다.",
    );
  }

  const shotRows: RenderShotManifest[] = [];
  const missing: number[] = [];

  for (const shot of shots) {
    const clip = await latestShotClip(options.db, options.workspaceId, shot.id);
    let strategy: RenderShotManifest["strategy"] = "placeholder";
    if (clip?.checksumSha256) {
      strategy = "user_upload";
    } else if (options.videoCaps.videoClips) {
      strategy = "generated";
    } else if (!options.request.allowPlaceholder) {
      missing.push(shot.sequenceNo);
    }

    shotRows.push({
      shotId: shot.id,
      sequenceNo: shot.sequenceNo,
      startSeconds: Number(shot.startSeconds),
      endSeconds: Number(shot.endSeconds),
      durationSeconds: Number(shot.endSeconds) - Number(shot.startSeconds),
      narration: shot.narration,
      onScreenText: captionFor(shot),
      visualDescription: shot.visualDescription,
      strategy,
      clipAssetId: clip?.id ?? null,
      clipChecksum: clip?.checksumSha256 ?? null,
      execution: {
        status: clip ? "reused" : "pending",
        assetId: clip?.id ?? null,
        error: null,
      },
    });
  }

  if (missing.length > 0) {
    throw new DomainError(
      "VALIDATION_FAILED",
      `클립이 없는 Shot이 있습니다: ${missing.join(", ")}. 업로드하거나 Placeholder를 허용하세요.`,
      { details: { missingShots: missing } },
    );
  }

  return renderManifestSchema.parse({
    version: RENDER_MANIFEST_VERSION,
    engine: RENDER_ENGINE_VERSION,
    width: options.request.width,
    height: options.request.height,
    fps: options.request.fps,
    scriptId: options.script.id,
    scriptVersion: options.script.version,
    contentApprovalId: options.approval.id,
    contentApprovalSnapshotHash: options.approval.snapshotHash,
    captionsInPost: true,
    allowPlaceholder: options.request.allowPlaceholder,
    shots: shotRows,
    voiceAssetId:
      (
        await findNarration(
          options.db,
          options.workspaceId,
          options.project.id,
          shots,
        )
      )?.id ?? null,
    musicAssetId: null,
    retryOf: null,
  });
}

async function requireApprovedScript(
  db: Database,
  workspaceId: string,
  project: ContentProjectRow,
  requestedScriptId?: string,
) {
  const approval = await latestContentProjectApproval(
    db,
    workspaceId,
    project.id,
  );
  if (
    !approval ||
    approval.decision !== "approved" ||
    approval.entityVersion === null
  ) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "최신 Content Project 승인 레코드가 없어 렌더할 수 없습니다.",
    );
  }
  const scripts = await listScripts(db, workspaceId, project.id);
  const approvedScript =
    scripts.find((row) => row.version === approval.entityVersion) ?? null;
  if (!approvedScript) {
    throw new DomainError(
      "CONFLICT",
      "승인 버전에 해당하는 Script를 찾을 수 없습니다.",
    );
  }
  if (requestedScriptId && requestedScriptId !== approvedScript.id) {
    throw new DomainError(
      "CONFLICT",
      "승인되지 않은 다른 Script는 렌더할 수 없습니다.",
      {
        details: { approvedScriptId: approvedScript.id },
      },
    );
  }
  return { approval, script: approvedScript };
}

async function requireProject(
  db: Database,
  workspaceId: string,
  projectId: string,
) {
  const project = await getContentProject(db, workspaceId, projectId);
  if (!project)
    throw new DomainError("NOT_FOUND", "Project를 찾을 수 없습니다.");
  return project;
}

export async function enqueueProjectRender(options: {
  db: Database;
  system: Database;
  workspaceId: string;
  userId: string;
  projectId: string;
  request: EnqueueRenderInput;
  idempotencyKey: string;
  video: VideoGenerationProvider;
}): Promise<{
  renderJobId: string;
  workflowRunId: string;
  reused: boolean;
  status: string;
  version: number;
  commandHash: string;
}> {
  const project = await requireProject(
    options.db,
    options.workspaceId,
    options.projectId,
  );
  if (options.request.width * 16 !== options.request.height * 9) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Render 해상도는 정확히 9:16이어야 합니다.",
    );
  }
  const { approval, script } = await requireApprovedScript(
    options.db,
    options.workspaceId,
    project,
    options.request.scriptId,
  );

  const manifest = await buildManifest({
    db: options.db,
    workspaceId: options.workspaceId,
    project,
    script,
    approval,
    request: options.request,
    videoCaps: options.video.capabilities(),
  });
  const hash = commandHash(manifest);

  const existingByHash = await getRenderJobByCommandHash(
    options.db,
    options.workspaceId,
    hash,
  );
  if (existingByHash) {
    return {
      renderJobId: existingByHash.id,
      workflowRunId: existingByHash.workflowRunId ?? "",
      reused: true,
      status: existingByHash.status,
      version: existingByHash.version,
      commandHash: hash,
    };
  }

  if (
    project.status !== "approved_to_render" &&
    project.status !== "rendered"
  ) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      project.status === "rendering"
        ? "이미 다른 Render가 진행 중입니다."
        : "Reviewer가 승인한 프로젝트만 렌더할 수 있습니다.",
      { details: { status: project.status } },
    );
  }

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "media.render",
    entityType: "content_project",
    entityId: options.projectId,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { projectId: options.projectId, commandHash: hash },
  });

  if (run.reused) {
    const linked = await getRenderJobByCommandHash(
      options.db,
      options.workspaceId,
      hash,
    );
    if (linked) {
      return {
        renderJobId: linked.id,
        workflowRunId: run.runId,
        reused: true,
        status: linked.status,
        version: linked.version,
        commandHash: hash,
      };
    }
  }

  const version = await nextRenderVersion(
    options.db,
    options.workspaceId,
    options.projectId,
  );
  let job: RenderJobRow;
  try {
    job = await insertRenderJob(options.db, {
      workspaceId: options.workspaceId,
      contentProjectId: options.projectId,
      version,
      status: "queued",
      renderManifest: manifest,
      workflowRunId: run.runId,
      commandHash: hash,
      width: manifest.width,
      height: manifest.height,
    });
  } catch (error) {
    const raced = await getRenderJobByCommandHash(
      options.db,
      options.workspaceId,
      hash,
    );
    if (raced) {
      return {
        renderJobId: raced.id,
        workflowRunId: raced.workflowRunId ?? run.runId,
        reused: true,
        status: raced.status,
        version: raced.version,
        commandHash: hash,
      };
    }
    throw error;
  }

  await updateProjectStatus(
    options.db,
    options.workspaceId,
    options.projectId,
    "rendering",
  );
  await writeAuditLog(options.system, {
    workspaceId: options.workspaceId,
    actorUserId: options.userId,
    action: "render.enqueued",
    entityType: "render_job",
    entityId: job.id,
    afterState: { commandHash: hash, version },
  });

  return {
    renderJobId: job.id,
    workflowRunId: run.runId,
    reused: false,
    status: job.status,
    version: job.version,
    commandHash: hash,
  };
}

export async function dispatchRenderJob(renderJobId: string): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const secret =
    process.env.WORKER_SHARED_SECRET ?? "demo-worker-secret-change-me";
  if (workerUrl) {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/internal/render`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-worker-secret": secret,
        },
        body: JSON.stringify({ renderJobId }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Video Factory Worker가 렌더를 받지 못했습니다.",
        {
          retryable: true,
          details: { status: response.status },
        },
      );
    }
    return;
  }
  await executeRenderJob(renderJobId);
}

export async function executeRenderJob(
  renderJobId: string,
  db?: Database,
): Promise<RenderJobRow> {
  const connection = process.env.DATABASE_URL;
  if (!connection)
    throw new DomainError("INTERNAL_ERROR", "DATABASE_URL이 필요합니다.");
  const system = db ?? serviceDb(connection);

  const job = await getRenderJobById(system, renderJobId);
  if (!job)
    throw new DomainError("NOT_FOUND", "Render Job을 찾을 수 없습니다.");
  if (job.status === "succeeded") return job;
  if (!(await claimQueuedRenderJob(system, renderJobId))) {
    return (await getRenderJobById(system, renderJobId))!;
  }

  try {
    if (!(await ffmpegAvailable())) {
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "ffmpeg/ffprobe가 설치되어 있지 않습니다.",
      );
    }

    const manifest = renderManifestSchema.parse(job.renderManifest);
    await updateProjectStatus(
      system,
      job.workspaceId,
      job.contentProjectId,
      "rendering",
    );

    const clipPaths: string[] = [];
    let generatedShots = 0;
    for (const [index, shot] of manifest.shots.entries()) {
      const reusableAssetId =
        shot.execution.status === "succeeded" ||
        shot.execution.status === "reused"
          ? shot.execution.assetId
          : null;
      if (reusableAssetId) {
        const asset = await getMediaAsset(
          system,
          job.workspaceId,
          reusableAssetId,
        );
        if (!asset?.storageUri) {
          throw new DomainError(
            "VALIDATION_FAILED",
            `Shot ${shot.sequenceNo} 재사용 클립 파일이 없습니다.`,
          );
        }
        clipPaths.push(asset.storageUri);
        continue;
      }

      let attemptAssetId: string | null = null;
      try {
        const generated = await insertMediaAsset(system, {
          workspaceId: job.workspaceId,
          contentProjectId: job.contentProjectId,
          shotId: shot.shotId,
          assetType: "video_clip",
          provider:
            shot.strategy === "generated" ? "mock_ffmpeg" : "placeholder",
          promptText: shot.visualDescription,
          generationParameters: { textInFootage: false, colorIndex: index },
          status: "running",
        });
        attemptAssetId = generated.id;
        const filePath = assetFilePath(job.workspaceId, generated.id);
        await writePlaceholderClip({
          outputPath: filePath,
          durationSeconds: shot.durationSeconds,
          width: manifest.width,
          height: manifest.height,
          fps: manifest.fps,
          colorIndex: index,
        });
        const checksum = await sha256File(filePath);
        const { stat } = await import("node:fs/promises");
        await updateMediaAsset(system, generated.id, {
          storageUri: filePath,
          mimeType: "video/mp4",
          byteSize: (await stat(filePath)).size,
          checksumSha256: checksum,
          status: "succeeded",
          providerOperationId: `local-${generated.id}`,
        });
        shot.clipAssetId = generated.id;
        shot.clipChecksum = checksum;
        shot.execution = {
          status: "succeeded",
          assetId: generated.id,
          error: null,
        };
        await updateRenderJob(system, job.id, { renderManifest: manifest });
        if (shot.strategy === "generated") generatedShots += 1;
        clipPaths.push(filePath);
      } catch (error) {
        if (attemptAssetId) {
          await updateMediaAsset(system, attemptAssetId, { status: "failed" });
        }
        shot.execution = {
          status: "failed",
          assetId: attemptAssetId,
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : String(error),
        };
        await updateRenderJob(system, job.id, { renderManifest: manifest });
        throw error;
      }
    }

    if (generatedShots > 0 && job.workflowRunId) {
      const existingCost = await countCostEventsForRun(
        system,
        job.workflowRunId,
      );
      if (existingCost === 0) {
        await insertCostEvent(system, {
          workspaceId: job.workspaceId,
          workflowRunId: job.workflowRunId,
          provider: "mock_ffmpeg",
          service: "video_clip",
          quantity: String(generatedShots),
          unit: "shot",
          estimatedCost: "0.00",
          actualCost: "0.00",
          metadata: {
            note: "Demo Mock은 과금하지 않습니다.",
            textInFootage: false,
          },
        });
      }
    }

    let voicePath: string | undefined;
    if (manifest.voiceAssetId) {
      const voice = await getMediaAsset(
        system,
        job.workspaceId,
        manifest.voiceAssetId,
      );
      if (
        !voice?.storageUri ||
        voice.contentProjectId !== job.contentProjectId ||
        voice.assetType !== "voice" ||
        voice.status !== "succeeded" ||
        (voice.generationParameters as Record<string, unknown>)
          .narrationFingerprint !== narrationFingerprint(manifest.shots) ||
        (await sha256File(voice.storageUri)) !== voice.checksumSha256
      ) {
        throw new DomainError(
          "VALIDATION_FAILED",
          "대본과 일치하는 음성 파일을 확인할 수 없습니다. 음성을 다시 생성해 주세요.",
        );
      }
      voicePath = voice.storageUri;
    }
    const composed = await composeRender({
      renderId: job.id,
      workspaceId: job.workspaceId,
      manifest,
      clipPaths,
      ...(voicePath ? { voicePath } : {}),
    });

    const output = await insertMediaAsset(system, {
      workspaceId: job.workspaceId,
      contentProjectId: job.contentProjectId,
      assetType: "final_video",
      provider: "ffmpeg",
      storageUri: composed.outputPath,
      mimeType: "video/mp4",
      byteSize: composed.byteSize,
      checksumSha256: composed.checksumSha256,
      generationParameters: {
        captionsInPost: true,
        engine: RENDER_ENGINE_VERSION,
      },
      status: "succeeded",
    });

    await updateRenderJob(system, job.id, {
      status: "succeeded",
      outputAssetId: output.id,
      outputChecksumSha256: composed.checksumSha256,
      durationSeconds: composed.durationSeconds.toFixed(2),
      loudnessLufs:
        composed.loudnessLufs === null
          ? null
          : composed.loudnessLufs.toFixed(2),
      probe: composed.probe,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    });
    await updateProjectStatus(
      system,
      job.workspaceId,
      job.contentProjectId,
      "rendered",
    );
    if (job.workflowRunId) {
      await addWorkflowStep(system, {
        workspaceId: job.workspaceId,
        runId: job.workflowRunId,
        sequenceNo: 1,
        stepKey: "ffmpeg.compose",
        provider: "ffmpeg",
        status: "succeeded",
        outputSummary: {
          checksum: composed.checksumSha256,
          loudnessLufs: composed.loudnessLufs,
          durationSeconds: composed.durationSeconds,
        },
      });
      await finishWorkflowRun(system, {
        runId: job.workflowRunId,
        status: "succeeded",
        output: { renderJobId: job.id, checksum: composed.checksumSha256 },
      });
    }
    await writeAuditLog(system, {
      workspaceId: job.workspaceId,
      actorUserId: null,
      action: "render.completed",
      entityType: "render_job",
      entityId: job.id,
      afterState: { checksum: composed.checksumSha256 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
    await failJob(system, job, code, message);
    throw error;
  }

  const updated = await getRenderJobById(system, job.id);
  if (!updated)
    throw new DomainError(
      "INTERNAL_ERROR",
      "Render Job을 다시 읽지 못했습니다.",
    );
  return updated;
}

async function failJob(
  db: Database,
  job: RenderJobRow,
  code: string,
  message: string,
) {
  await updateRenderJob(db, job.id, {
    status: "failed",
    errorCode: code,
    errorMessage: message.slice(0, 2000),
    completedAt: new Date(),
  });
  await updateProjectStatus(
    db,
    job.workspaceId,
    job.contentProjectId,
    "approved_to_render",
  );
  if (job.workflowRunId) {
    await finishWorkflowRun(db, {
      runId: job.workflowRunId,
      status: "failed",
      errorCode: code,
      errorMessage: message.slice(0, 2000),
    });
  }
}

export async function retryFailedShots(options: {
  db: Database;
  system: Database;
  workspaceId: string;
  userId: string;
  renderId: string;
  shotIds: string[];
  video: VideoGenerationProvider;
  idempotencyKey: string;
}) {
  const previous = await getRenderJob(
    options.db,
    options.workspaceId,
    options.renderId,
  );
  if (!previous)
    throw new DomainError("NOT_FOUND", "Render Job을 찾을 수 없습니다.");
  if (previous.status !== "failed") {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "실패한 Render만 Shot을 골라 다시 만들 수 있습니다.",
    );
  }
  const manifest = renderManifestSchema.parse(previous.renderManifest);
  const project = await requireProject(
    options.db,
    options.workspaceId,
    previous.contentProjectId,
  );
  const approved = await requireApprovedScript(
    options.db,
    options.workspaceId,
    project,
    manifest.scriptId,
  );
  if (
    approved.approval.id !== manifest.contentApprovalId ||
    approved.approval.snapshotHash !== manifest.contentApprovalSnapshotHash
  ) {
    throw new DomainError(
      "CONFLICT",
      "원본 Render 이후 Content 승인이 변경되어 재시도할 수 없습니다.",
    );
  }
  const retrySet = new Set(options.shotIds);
  const unknown = options.shotIds.filter(
    (id) => !manifest.shots.some((shot) => shot.shotId === id),
  );
  if (unknown.length > 0) {
    throw new DomainError("VALIDATION_FAILED", "이 Render에 없는 Shot입니다.", {
      details: { shotIds: unknown },
    });
  }

  const nextManifest: RenderManifest = renderManifestSchema.parse({
    ...manifest,
    retryOf: previous.id,
    shots: manifest.shots.map((shot) =>
      retrySet.has(shot.shotId)
        ? {
            ...shot,
            clipAssetId: null,
            clipChecksum: null,
            strategy: options.video.capabilities().videoClips
              ? "generated"
              : "placeholder",
            execution: { status: "pending", assetId: null, error: null },
          }
        : shot,
    ),
  });
  const hash = commandHash(nextManifest);

  const existing = await getRenderJobByCommandHash(
    options.db,
    options.workspaceId,
    hash,
  );
  if (existing) {
    return {
      renderJobId: existing.id,
      workflowRunId: existing.workflowRunId ?? "",
      reused: true,
      status: existing.status,
      version: existing.version,
      commandHash: hash,
    };
  }

  const run = await startWorkflowRun(options.system, {
    workspaceId: options.workspaceId,
    workflowType: "media.render",
    entityType: "content_project",
    entityId: previous.contentProjectId,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: {
      projectId: previous.contentProjectId,
      commandHash: hash,
      retryOf: previous.id,
    },
  });
  if (run.reused) {
    const linked = await getRenderJobByCommandHash(
      options.db,
      options.workspaceId,
      hash,
    );
    if (linked) {
      return {
        renderJobId: linked.id,
        workflowRunId: run.runId,
        reused: true,
        status: linked.status,
        version: linked.version,
        commandHash: hash,
      };
    }
  }

  const version = await nextRenderVersion(
    options.db,
    options.workspaceId,
    previous.contentProjectId,
  );
  const job = await insertRenderJob(options.db, {
    workspaceId: options.workspaceId,
    contentProjectId: previous.contentProjectId,
    version,
    status: "queued",
    renderManifest: nextManifest,
    workflowRunId: run.runId,
    commandHash: hash,
    width: nextManifest.width,
    height: nextManifest.height,
  });
  await updateProjectStatus(
    options.db,
    options.workspaceId,
    previous.contentProjectId,
    "rendering",
  );
  return {
    renderJobId: job.id,
    workflowRunId: run.runId,
    reused: false,
    status: job.status,
    version: job.version,
    commandHash: hash,
  };
}

export async function approveRenderJob(options: {
  db: Database;
  system: Database;
  workspaceId: string;
  userId: string;
  renderId: string;
  comment?: string | undefined;
}) {
  const job = await getRenderJob(
    options.db,
    options.workspaceId,
    options.renderId,
  );
  if (!job)
    throw new DomainError("NOT_FOUND", "Render Job을 찾을 수 없습니다.");
  if (job.status !== "succeeded" || !job.outputChecksumSha256) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "완성된 Render만 승인할 수 있습니다.",
    );
  }
  const current = await latestRenderApproval(
    options.db,
    options.workspaceId,
    job.id,
  );
  if (
    current?.decision === "approved" &&
    current.snapshotHash === job.outputChecksumSha256
  ) {
    return {
      approvalId: current.id,
      reused: true,
      snapshotHash: current.snapshotHash,
    };
  }
  const approval = await insertApproval(options.system, {
    workspaceId: options.workspaceId,
    entityType: "render_job",
    entityId: job.id,
    entityVersion: job.version,
    decision: "approved",
    comment: options.comment ?? null,
    decidedBy: options.userId,
    snapshotHash: job.outputChecksumSha256,
  });
  await writeAuditLog(options.system, {
    workspaceId: options.workspaceId,
    actorUserId: options.userId,
    action: "render.approved",
    entityType: "render_job",
    entityId: job.id,
    afterState: { snapshotHash: job.outputChecksumSha256 },
  });
  return {
    approvalId: approval.id,
    reused: false,
    snapshotHash: job.outputChecksumSha256,
  };
}

export async function saveUploadedClip(options: {
  db: Database;
  workspaceId: string;
  userId: string;
  projectId: string;
  shotId: string;
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  generatedSource?: { provider: string; model: string; fingerprint: string };
}): Promise<MediaAssetRow> {
  const project = await requireProject(
    options.db,
    options.workspaceId,
    options.projectId,
  );
  if (
    project.status !== "approved_to_render" &&
    project.status !== "rendering" &&
    project.status !== "rendered"
  ) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "승인한 프로젝트에만 클립을 올릴 수 있습니다.",
    );
  }
  const { script } = await requireApprovedScript(
    options.db,
    options.workspaceId,
    project,
  );
  const shotRows = await listShots(options.db, options.workspaceId, script.id);
  const selectedShot = shotRows.find((shot) => shot.id === options.shotId);
  if (!selectedShot) {
    throw new DomainError("NOT_FOUND", "승인된 Script의 Shot이 아닙니다.");
  }
  if (options.bytes.byteLength > 25 * 1024 * 1024) {
    throw new DomainError("VALIDATION_FAILED", "클립은 25MB 이하여야 합니다.");
  }
  const imageExtensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const imageExtension = imageExtensions[options.mimeType];
  const allowed = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
    ...Object.keys(imageExtensions),
  ]);
  if (!allowed.has(options.mimeType)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "이미지는 PNG·JPG·WebP, 영상은 MP4·WebM·MOV로 올려 주세요.",
    );
  }
  const asset = await insertMediaAsset(options.db, {
    workspaceId: options.workspaceId,
    contentProjectId: options.projectId,
    shotId: options.shotId,
    assetType: "video_clip",
    provider: options.generatedSource?.provider ?? "user_upload",
    generationParameters: options.generatedSource ?? {},
    mimeType: imageExtension ? "video/mp4" : options.mimeType,
    byteSize: options.bytes.byteLength,
    rightsMetadata: {
      uploadedBy: options.userId,
      fileName: options.fileName,
      originalMimeType: options.mimeType,
    },
    status: "running",
  });
  const ext = options.mimeType === "video/webm" ? "webm" : "mp4";
  const filePath = assetFilePath(options.workspaceId, asset.id, ext);
  await mkdir(path.dirname(filePath), { recursive: true });
  let storedBytes = options.bytes;
  if (imageExtension) {
    const sourcePath = assetFilePath(
      options.workspaceId,
      asset.id,
      imageExtension,
    );
    try {
      await writeFile(sourcePath, options.bytes);
      await writeImageClip(
        sourcePath,
        filePath,
        Number(selectedShot.endSeconds) - Number(selectedShot.startSeconds),
      );
      storedBytes = await readFile(filePath);
    } catch {
      await rm(filePath, { force: true });
      await updateMediaAsset(options.db, asset.id, { status: "failed" });
      throw new DomainError(
        "VALIDATION_FAILED",
        "이미지를 읽지 못했습니다. 정상적인 PNG·JPG·WebP 파일인지 확인해 주세요.",
      );
    } finally {
      await rm(sourcePath, { force: true });
    }
  } else {
    await writeFile(filePath, storedBytes);
  }
  const checksum = createHash("sha256").update(storedBytes).digest("hex");
  await updateMediaAsset(options.db, asset.id, {
    storageUri: filePath,
    checksumSha256: checksum,
    byteSize: storedBytes.byteLength,
    status: "succeeded",
  });
  return {
    ...asset,
    byteSize: storedBytes.byteLength,
    storageUri: filePath,
    checksumSha256: checksum,
    status: "succeeded",
  };
}

/** Paid generation runs only on an explicit request, once per scene; completed images survive conversion/DB failures. */
export async function generateShotImage(options: {
  db: Database;
  workspaceId: string;
  userId: string;
  projectId: string;
  shotId: string;
  model: string;
  provider: {
    generate(prompt: string): Promise<{ bytes: Buffer; mimeType: string }>;
  };
}) {
  const lock = await options.db.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${`image:${options.workspaceId}:${options.shotId}`}, 0)) as locked`,
  );
  if (!lock[0]?.locked)
    throw new DomainError(
      "CONFLICT",
      "이 장면 이미지를 만들고 있습니다. 잠시 후 확인해 주세요.",
    );
  const project = await requireProject(
    options.db,
    options.workspaceId,
    options.projectId,
  );
  if (!["approved_to_render", "rendered"].includes(project.status))
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "대본 승인과 진행 중인 영상 합성이 끝난 뒤 이미지를 만들어 주세요.",
    );
  const { script } = await requireApprovedScript(
    options.db,
    options.workspaceId,
    project,
  );
  const shot = (
    await listShots(options.db, options.workspaceId, script.id)
  ).find((item) => item.id === options.shotId);
  if (!shot)
    throw new DomainError("NOT_FOUND", "승인된 대본의 장면이 아닙니다.");
  const existing = await latestShotClip(
    options.db,
    options.workspaceId,
    shot.id,
  );
  if (
    existing?.checksumSha256 &&
    ["user_upload", "gemini_image"].includes(existing.provider)
  ) {
    try {
      if (
        existing.storageUri &&
        (await sha256File(existing.storageUri)) === existing.checksumSha256
      )
        return { assetId: existing.id, reused: true };
    } catch {
      /* Recover generated clips from the cached original below. */
    }
    if (existing.provider === "user_upload")
      throw new DomainError(
        "VALIDATION_FAILED",
        "업로드한 장면 파일을 읽지 못했습니다. 이미지를 다시 올려 주세요.",
      );
  }
  const prompt = `Create one vertical 9:16 illustration for a Korean informational short. Consistent clean editorial photography style, dark navy and warm orange accents, centered subject, space for captions. No written text, numbers, logos or watermarks. Represent apps and documents conceptually; do not invent an authentic government interface.\nScene description: ${shot.visualDescription}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ prompt, model: options.model, version: 1 }))
    .digest("hex");
  const cacheDir = path.join(
    mediaRoot(),
    options.workspaceId,
    "generated-images",
    options.projectId,
    shot.id,
  );
  const cachePath = path.join(cacheDir, `${fingerprint}.json`);
  await mkdir(cacheDir, { recursive: true });
  let image: { bytes: Buffer; mimeType: string };
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8"));
    image = {
      bytes: Buffer.from(cached.data, "base64"),
      mimeType: cached.mimeType,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "저장된 이미지 파일을 읽지 못했습니다. 중복 과금을 막기 위해 다시 생성하지 않았습니다.",
      );
    image = await options.provider.generate(prompt);
    const temp = `${cachePath}.tmp`;
    await writeFile(
      temp,
      JSON.stringify({
        data: image.bytes.toString("base64"),
        mimeType: image.mimeType,
      }),
    );
    await rename(temp, cachePath);
  }
  const asset = await saveUploadedClip({
    ...options,
    ...image,
    fileName: "gemini-scene",
    generatedSource: {
      provider: "gemini_image",
      model: options.model,
      fingerprint,
    },
  });
  return { assetId: asset.id, reused: false };
}

export async function loadFactoryBoard(
  db: Database,
  workspaceId: string,
  video: VideoGenerationProvider,
) {
  const [jobs, readyProjects] = await Promise.all([
    listRenderJobs(db, workspaceId),
    listApprovedRenderProjects(db, workspaceId),
  ]);
  const columns: Record<FactoryKanbanColumn, typeof jobs> = {
    queued: [],
    generating: [],
    ready: [],
    failed: [],
    approved: [],
  };
  for (const row of jobs) {
    const approval = await latestRenderApproval(db, workspaceId, row.job.id);
    columns[kanbanColumn(row.job, approval?.decision === "approved")].push(row);
  }
  return {
    capabilities: video.capabilities(),
    readyProjects: readyProjects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
    })),
    columns: {
      queued: columns.queued.map(summarizeJob),
      generating: columns.generating.map(summarizeJob),
      ready: columns.ready.map(summarizeJob),
      failed: columns.failed.map(summarizeJob),
      approved: columns.approved.map(summarizeJob),
    },
  };
}

function summarizeJob(row: Awaited<ReturnType<typeof listRenderJobs>>[number]) {
  const manifest = renderManifestSchema.safeParse(row.job.renderManifest);
  return {
    id: row.job.id,
    projectId: row.job.contentProjectId,
    projectTitle: row.projectTitle,
    version: row.job.version,
    status: row.job.status,
    checksum: row.job.outputChecksumSha256,
    errorMessage: row.job.errorMessage,
    durationSeconds: row.job.durationSeconds
      ? Number(row.job.durationSeconds)
      : null,
    shotCount: manifest.success ? manifest.data.shots.length : 0,
    createdAt: row.job.createdAt.toISOString(),
  };
}

export async function loadRenderDetail(
  db: Database,
  workspaceId: string,
  renderId: string,
) {
  const job = await getRenderJob(db, workspaceId, renderId);
  if (!job)
    throw new DomainError("NOT_FOUND", "Render Job을 찾을 수 없습니다.");
  const project = await requireProject(db, workspaceId, job.contentProjectId);
  const assets = await listMediaAssetsForProject(
    db,
    workspaceId,
    job.contentProjectId,
  );
  const approval = await latestRenderApproval(db, workspaceId, job.id);
  const manifest = renderManifestSchema.parse(job.renderManifest);
  return {
    job: {
      id: job.id,
      version: job.version,
      status: job.status,
      checksum: job.outputChecksumSha256,
      durationSeconds: job.durationSeconds ? Number(job.durationSeconds) : null,
      width: job.width,
      height: job.height,
      loudnessLufs: job.loudnessLufs ? Number(job.loudnessLufs) : null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      outputAssetId: job.outputAssetId,
      probe: job.probe,
      createdAt: job.createdAt.toISOString(),
    },
    project: { id: project.id, title: project.title, status: project.status },
    manifest,
    approval: approval
      ? {
          decision: approval.decision,
          snapshotHash: approval.snapshotHash,
          decidedAt: approval.decidedAt.toISOString(),
        }
      : null,
    assets: assets.map((asset) => ({
      id: asset.id,
      shotId: asset.shotId,
      assetType: asset.assetType,
      provider: asset.provider,
      status: asset.status,
      checksum: asset.checksumSha256,
      mimeType: asset.mimeType,
    })),
  };
}

export function localMediaRoot(): string {
  return mediaRoot();
}
