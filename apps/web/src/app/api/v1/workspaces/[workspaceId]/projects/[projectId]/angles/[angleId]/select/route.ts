import { selectProjectAngle } from "@shorts-os/services";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string; angleId: string }>(
  async ({ requestId, params }) => {
    const { workspaceId, projectId, angleId } = params;
    const context = await workspaceContext(workspaceId);

    const result = await context.run(async ({ db, requireRole }) => {
      requireRole("topic:write");
      return selectProjectAngle({ db, workspaceId, projectId, angleId });
    });

    return ok(result, requestId);
  },
);
