import { approveRenderSchema } from "@shorts-os/contracts";
import { approveRenderJob } from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; renderId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, renderId } = params;
    const input = await parseBody(request, approveRenderSchema);
    const context = await workspaceContext(workspaceId);
    const result = await context.run(async ({ db, system, requireRole, user }) => {
      requireRole("qa:write");
      return approveRenderJob({
        db,
        system,
        workspaceId,
        userId: user.id,
        renderId,
        comment: input.comment,
      });
    });
    return ok(result, requestId);
  },
);
