import { loadRenderDetail } from "@shorts-os/services";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string; renderId: string }>(
  async ({ requestId, params }) => {
    const { workspaceId, renderId } = params;
    const context = await workspaceContext(workspaceId);
    const detail = await context.run(({ db }) => loadRenderDetail(db, workspaceId, renderId));
    return ok(detail, requestId);
  },
);
