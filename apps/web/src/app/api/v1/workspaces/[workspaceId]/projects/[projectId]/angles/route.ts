import { generateAnglesSchema } from "@shorts-os/contracts";
import { generateProjectAngles } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId } = params;
    const idempotencyKey = requireIdempotencyKey(request);
    const context = await workspaceContext(workspaceId);
    await parseBody(request, generateAnglesSchema);

    const result = await context.run(async ({ db, system, requireRole, user, registry }) => {
      requireRole("topic:write");
      return generateProjectAngles({
        db,
        system,
        provider: registry.contentStudio(),
        workspaceId,
        userId: user.id,
        projectId,
        idempotencyKey,
      });
    });

    return accepted(result, requestId);
  },
);
