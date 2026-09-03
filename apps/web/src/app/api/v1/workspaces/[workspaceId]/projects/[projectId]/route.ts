import { loadStudioProject } from "@shorts-os/services";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string; projectId: string }>(
  async ({ requestId, params }) => {
    const { workspaceId, projectId } = params;
    const context = await workspaceContext(workspaceId);
    const detail = await context.run(({ db }) => loadStudioProject(db, workspaceId, projectId));
    return ok(detail, requestId);
  },
);
