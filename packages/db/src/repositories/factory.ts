import { and, desc, eq, sql } from "drizzle-orm";
import type { MediaAssetType, RenderManifest } from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import type { Database } from "../client";
import { contentProjects, mediaAssets, renderJobs, shots } from "../schema";
import { approvals } from "../schema/workflow";

export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type RenderJobRow = typeof renderJobs.$inferSelect;

export async function insertMediaAsset(
  db: Database,
  input: {
    workspaceId: string;
    contentProjectId: string;
    shotId?: string | null;
    assetType: MediaAssetType;
    provider: string;
    providerOperationId?: string | null;
    storageUri?: string | null;
    previewUri?: string | null;
    mimeType?: string | null;
    byteSize?: number | null;
    checksumSha256?: string | null;
    promptText?: string | null;
    generationParameters?: Record<string, unknown>;
    rightsMetadata?: Record<string, unknown>;
    status?: MediaAssetRow["status"];
  },
): Promise<MediaAssetRow> {
  const rows = await db
    .insert(mediaAssets)
    .values({
      workspaceId: input.workspaceId,
      contentProjectId: input.contentProjectId,
      shotId: input.shotId ?? null,
      assetType: input.assetType,
      provider: input.provider,
      providerOperationId: input.providerOperationId ?? null,
      storageUri: input.storageUri ?? null,
      previewUri: input.previewUri ?? null,
      mimeType: input.mimeType ?? null,
      byteSize: input.byteSize ?? null,
      checksumSha256: input.checksumSha256 ?? null,
      promptText: input.promptText ?? null,
      generationParameters: input.generationParameters ?? {},
      rightsMetadata: input.rightsMetadata ?? {},
      status: input.status ?? "queued",
    })
    .returning();
  const created = rows[0];
  if (!created)
    throw new DomainError("INTERNAL_ERROR", "미디어 에셋 저장에 실패했습니다.");
  return created;
}

export async function updateMediaAsset(
  db: Database,
  assetId: string,
  patch: Partial<{
    storageUri: string | null;
    previewUri: string | null;
    mimeType: string | null;
    byteSize: number | null;
    checksumSha256: string | null;
    providerOperationId: string | null;
    generationParameters: Record<string, unknown>;
    status: MediaAssetRow["status"];
  }>,
): Promise<void> {
  await db
    .update(mediaAssets)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(mediaAssets.id, assetId));
}

export async function getMediaAsset(
  db: Database,
  workspaceId: string,
  assetId: string,
): Promise<MediaAssetRow | null> {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.workspaceId, workspaceId),
        eq(mediaAssets.id, assetId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMediaAssetsForProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<MediaAssetRow[]> {
  return db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.workspaceId, workspaceId),
        eq(mediaAssets.contentProjectId, projectId),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt));
}

export async function latestShotClip(
  db: Database,
  workspaceId: string,
  shotId: string,
): Promise<MediaAssetRow | null> {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.workspaceId, workspaceId),
        eq(mediaAssets.shotId, shotId),
        eq(mediaAssets.assetType, "video_clip"),
        eq(mediaAssets.status, "succeeded"),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function nextRenderVersion(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<number> {
  const rows = await db
    .select({ version: renderJobs.version })
    .from(renderJobs)
    .where(
      and(
        eq(renderJobs.workspaceId, workspaceId),
        eq(renderJobs.contentProjectId, projectId),
      ),
    )
    .orderBy(desc(renderJobs.version))
    .limit(1);
  return (rows[0]?.version ?? 0) + 1;
}

export async function insertRenderJob(
  db: Database,
  input: {
    workspaceId: string;
    contentProjectId: string;
    version: number;
    status?: RenderJobRow["status"];
    renderManifest: RenderManifest;
    workflowRunId?: string | null;
    commandHash: string;
    width: number;
    height: number;
  },
): Promise<RenderJobRow> {
  const rows = await db
    .insert(renderJobs)
    .values({
      workspaceId: input.workspaceId,
      contentProjectId: input.contentProjectId,
      version: input.version,
      status: input.status ?? "queued",
      renderManifest: input.renderManifest,
      workflowRunId: input.workflowRunId ?? null,
      commandHash: input.commandHash,
      width: input.width,
      height: input.height,
    })
    .returning();
  const created = rows[0];
  if (!created)
    throw new DomainError("INTERNAL_ERROR", "Render Job 저장에 실패했습니다.");
  return created;
}

export async function getRenderJob(
  db: Database,
  workspaceId: string,
  renderId: string,
): Promise<RenderJobRow | null> {
  const rows = await db
    .select()
    .from(renderJobs)
    .where(
      and(eq(renderJobs.workspaceId, workspaceId), eq(renderJobs.id, renderId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getRenderJobById(
  db: Database,
  renderId: string,
): Promise<RenderJobRow | null> {
  const rows = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.id, renderId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRenderJobByCommandHash(
  db: Database,
  workspaceId: string,
  commandHash: string,
): Promise<RenderJobRow | null> {
  const rows = await db
    .select()
    .from(renderJobs)
    .where(
      and(
        eq(renderJobs.workspaceId, workspaceId),
        eq(renderJobs.commandHash, commandHash),
      ),
    )
    .orderBy(desc(renderJobs.createdAt));
  return (
    rows.find(
      (row) =>
        row.status === "queued" ||
        row.status === "running" ||
        row.status === "waiting" ||
        row.status === "succeeded",
    ) ?? null
  );
}

export async function listRenderJobs(
  db: Database,
  workspaceId: string,
  limit = 50,
) {
  return db
    .select({
      job: renderJobs,
      projectTitle: contentProjects.title,
      projectStatus: contentProjects.status,
    })
    .from(renderJobs)
    .innerJoin(
      contentProjects,
      eq(contentProjects.id, renderJobs.contentProjectId),
    )
    .where(eq(renderJobs.workspaceId, workspaceId))
    .orderBy(desc(renderJobs.createdAt))
    .limit(limit);
}

export async function listApprovedRenderProjects(
  db: Database,
  workspaceId: string,
) {
  return db
    .select()
    .from(contentProjects)
    .where(
      and(
        eq(contentProjects.workspaceId, workspaceId),
        eq(contentProjects.status, "approved_to_render"),
      ),
    )
    .orderBy(desc(contentProjects.updatedAt));
}

export async function updateRenderJob(
  db: Database,
  renderId: string,
  patch: Partial<{
    status: RenderJobRow["status"];
    outputAssetId: string | null;
    outputChecksumSha256: string | null;
    durationSeconds: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    loudnessLufs: string | null;
    probe: Record<string, unknown>;
    renderManifest: RenderManifest;
    workflowRunId: string | null;
    startedAt: Date;
    completedAt: Date;
  }>,
): Promise<void> {
  await db.update(renderJobs).set(patch).where(eq(renderJobs.id, renderId));
}

/** Compare-and-set prevents HTTP retries and the queue poller rendering twice. */
export async function claimQueuedRenderJob(db: Database, renderId: string) {
  const rows = await db
    .update(renderJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(renderJobs.id, renderId), eq(renderJobs.status, "queued")))
    .returning();
  return rows[0] ?? null;
}

export async function listQueuedRenderJobs(db: Database) {
  return db
    .select({ id: renderJobs.id })
    .from(renderJobs)
    .where(eq(renderJobs.status, "queued"))
    .orderBy(renderJobs.createdAt)
    .limit(10);
}

export async function latestContentProjectApproval(
  db: Database,
  workspaceId: string,
  projectId: string,
) {
  const rows = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.entityType, "content_project"),
        eq(approvals.entityId, projectId),
      ),
    )
    .orderBy(desc(approvals.decidedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listShotsForScript(
  db: Database,
  workspaceId: string,
  scriptId: string,
) {
  return db
    .select()
    .from(shots)
    .where(
      and(eq(shots.workspaceId, workspaceId), eq(shots.scriptId, scriptId)),
    )
    .orderBy(shots.sequenceNo);
}

export async function latestRenderApproval(
  db: Database,
  workspaceId: string,
  renderId: string,
) {
  const rows = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.entityType, "render_job"),
        eq(approvals.entityId, renderId),
      ),
    )
    .orderBy(desc(approvals.decidedAt))
    .limit(1);
  return rows[0] ?? null;
}
