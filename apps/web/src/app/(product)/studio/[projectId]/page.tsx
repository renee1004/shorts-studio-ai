import { roleHasPermission } from "@shorts-os/contracts";
import { NarrationClient } from "@/components/product/narration-client";
import { env } from "@/server/env";
import {
  findNarration,
  narrationFingerprint,
  loadStudioProject,
} from "@shorts-os/services";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { StudioProjectClient } from "@/components/product/studio-project-client";
import type { FactualClaim } from "@shorts-os/contracts";

export const dynamic = "force-dynamic";

export default async function StudioProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);
  const detail = await context.run(({ db }) =>
    loadStudioProject(db, workspace.id, projectId),
  );

  const voice = await context.run(({ db }) =>
    findNarration(db, workspace.id, projectId, detail.shots),
  );
  const config = env();
  const latestQa = new Map<string, (typeof detail.qa)[number]>();
  for (const row of detail.qa) {
    if (!latestQa.has(row.checkType)) latestQa.set(row.checkType, row);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
          대본과 장면 준비
        </p>
        <h1 className="text-2xl font-black">{detail.project.title}</h1>
        <p className="mt-1.5 font-mono text-[12px] text-muted-foreground">
          대본과 장면을 확인해 주세요.
        </p>
      </header>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          음성 추가하기 (선택)
        </summary>
        <NarrationClient
          key={narrationFingerprint(detail.shots)}
          workspaceId={workspace.id}
          projectId={projectId}
          enabled={
            config.APP_MODE === "live" &&
            Boolean(config.GEMINI_API_KEY && config.GEMINI_TTS_MODEL)
          }
          canWrite={roleHasPermission(workspace.role, "topic:write")}
          initialAssetId={voice?.id ?? null}
        />
      </details>
      <StudioProjectClient
        workspaceId={workspace.id}
        projectId={detail.project.id}
        canWrite={roleHasPermission(workspace.role, "topic:write")}
        canApprove={roleHasPermission(workspace.role, "qa:write")}
        project={{
          title: detail.project.title,
          status: detail.project.status,
          targetDurationSeconds: detail.project.targetDurationSeconds,
          selectedAngleId: detail.project.selectedAngleId,
        }}
        briefSummary={detail.brief?.content.executiveSummary ?? null}
        angles={detail.angles.map((angle) => ({
          id: angle.id,
          version: angle.version,
          title: angle.title,
          hook: angle.hook,
          promise: angle.promise,
          selected: angle.selected,
          scoreBreakdown:
            (angle.scoreBreakdown as Record<string, unknown>) ?? {},
        }))}
        scripts={detail.scripts.map((script) => ({
          id: script.id,
          version: script.version,
          title: script.title,
          hook: script.hook,
          scriptText: script.scriptText,
          status: script.status,
          estimatedDurationSeconds: Number(script.estimatedDurationSeconds),
          factualClaims: (script.factualClaims as FactualClaim[]) ?? [],
        }))}
        shots={detail.shots.map((shot) => ({
          id: shot.id,
          sequenceNo: shot.sequenceNo,
          startSeconds: Number(shot.startSeconds),
          endSeconds: Number(shot.endSeconds),
          narration: shot.narration,
          onScreenText: shot.onScreenText,
          visualDescription: shot.visualDescription,
          assetStrategy: shot.assetStrategy,
        }))}
        qa={[...latestQa.values()].map((row) => ({
          checkType: row.checkType,
          result: row.result,
          severity: row.severity,
          findings: (row.findings as { code: string; message: string }[]) ?? [],
        }))}
        approvalReadiness={detail.approvalReadiness}
        snapshotHashes={detail.approvals.map((row) => ({
          id: row.id,
          decision: row.decision,
          snapshotHash: row.snapshotHash,
          decidedAt: row.decidedAt.toISOString(),
        }))}
      />
    </div>
  );
}
