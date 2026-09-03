import { generateShotsForScript } from "@shorts-os/services";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; scriptId: string }>(
  async ({ requestId, params }) => {
    const { workspaceId, scriptId } = params;
    const context = await workspaceContext(workspaceId);

    const shots = await context.run(async ({ db, requireRole }) => {
      requireRole("topic:write");
      return generateShotsForScript({ db, workspaceId, scriptId });
    });

    return ok({ shots }, requestId);
  },
);
