import { enqueueRenderSchema } from "@shorts-os/contracts";
import { dispatchRenderJob, enqueueProjectRender } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId } = params;
    const idempotencyKey = requireIdempotencyKey(request);
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, enqueueRenderSchema);

    const result = await context.run(async ({ db, system, requireRole, user, registry }) => {
      requireRole("topic:write");
      return enqueueProjectRender({
        db,
        system,
        workspaceId,
        userId: user.id,
        projectId,
        request: input,
        idempotencyKey,
        video: registry.videoGeneration(),
      });
    });

    if (!result.reused) {
      void dispatchRenderJob(result.renderJobId).catch(() => undefined);
    }

    return accepted(result, requestId);
  },
);
