import { retryRenderSchema } from "@shorts-os/contracts";
import { dispatchRenderJob, retryFailedShots } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; renderId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, renderId } = params;
    const idempotencyKey = requireIdempotencyKey(request);
    const input = await parseBody(request, retryRenderSchema);
    const context = await workspaceContext(workspaceId);

    const result = await context.run(async ({ db, system, requireRole, user, registry }) => {
      requireRole("topic:write");
      return retryFailedShots({
        db,
        system,
        workspaceId,
        userId: user.id,
        renderId,
        shotIds: input.shotIds,
        video: registry.videoGeneration(),
        idempotencyKey,
      });
    });

    if (!result.reused) {
      void dispatchRenderJob(result.renderJobId).catch(() => undefined);
    }

    return accepted(result, requestId);
  },
);
