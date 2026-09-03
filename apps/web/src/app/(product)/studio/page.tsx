import { roleHasPermission } from "@shorts-os/contracts";
import { listContentProjects, listEligibleStudioTopics } from "@shorts-os/db";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { StudioListClient } from "@/components/product/studio-list-client";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);

  const { projects, eligible } = await context.run(async ({ db }) => ({
    projects: await listContentProjects(db, workspace.id),
    eligible: await listEligibleStudioTopics(db, workspace.id),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">Content Studio</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          승인한 주제에서 Angle 3개, Script 버전, Shot, QA, 승인까지 진행합니다. Demo는 출처를
          만들지 않으므로 사실 주장은 미확인으로 표시됩니다.
        </p>
      </header>
      <StudioListClient
        workspaceId={workspace.id}
        canWrite={roleHasPermission(workspace.role, "topic:write")}
        projects={projects.map((project) => ({
          id: project.id,
          title: project.title,
          status: project.status,
          targetDurationSeconds: project.targetDurationSeconds,
          updatedAt: project.updatedAt.toISOString(),
        }))}
        eligible={eligible.map((topic) => ({
          id: topic.id,
          title: topic.title,
          briefId: topic.brief?.id ?? null,
        }))}
      />
    </div>
  );
}
