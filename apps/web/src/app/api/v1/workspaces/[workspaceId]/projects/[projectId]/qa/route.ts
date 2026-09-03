import { runQaSchema } from "@shorts-os/contracts";
import { runProjectQa } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId } = params;
    const idempotencyKey = requireIdempotencyKey(request);
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, runQaSchema);

    const result = await context.run(async ({ db, system, requireRole, user }) => {
      requireRole("topic:write");
      return runProjectQa({
        db,
        system,
        workspaceId,
        userId: user.id,
        projectId,
        ...(input.scriptId ? { scriptId: input.scriptId } : {}),
        checks: input.checks,
        idempotencyKey,
      });
    });

    return accepted(result, requestId);
  },
);
