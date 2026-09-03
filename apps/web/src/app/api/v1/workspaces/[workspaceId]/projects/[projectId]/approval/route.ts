import { projectApprovalSchema } from "@shorts-os/contracts";
import { decideProjectApproval } from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId } = params;
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, projectApprovalSchema);

    const result = await context.run(async ({ db, system, requireRole, user }) => {
      requireRole("qa:write");
      return decideProjectApproval({
        db,
        system,
        workspaceId,
        userId: user.id,
        projectId,
        request: input,
      });
    });

    return ok(result, requestId);
  },
);
