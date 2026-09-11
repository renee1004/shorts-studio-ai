import { roleHasPermission } from "@shorts-os/contracts";
import { loadRenderDetail } from "@shorts-os/services";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { FactoryDetailClient } from "@/components/product/factory-detail-client";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function FactoryDetailPage({
  params,
}: {
  params: Promise<{ renderId: string }>;
}) {
  const { renderId } = await params;
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);
  const detail = await context.run(({ db }) =>
    loadRenderDetail(db, workspace.id, renderId),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
          VIDEO FACTORY
        </p>
        <h1 className="text-2xl font-black">{detail.project.title}</h1>
      </header>
      <FactoryDetailClient
        workspaceId={workspace.id}
        renderId={renderId}
        canWrite={roleHasPermission(workspace.role, "topic:write")}
        canApprove={roleHasPermission(workspace.role, "qa:write")}
        detail={detail}
        imageModel={env().GEMINI_IMAGE_MODEL}
      />
    </div>
  );
}
