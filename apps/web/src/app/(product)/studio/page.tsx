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
        <h1 className="text-2xl font-black">내 작업함</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          작업을 선택해 이어서 만들거나, 새 영상을 시작하세요.
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
