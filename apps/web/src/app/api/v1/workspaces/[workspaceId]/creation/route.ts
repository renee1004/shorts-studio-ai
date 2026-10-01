import { creationInputSchema } from "@shorts-os/contracts";
import { createCreationProject } from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string }>(
  async ({ request, requestId, params }) => {
    const input = await parseBody(request, creationInputSchema);
    const context = await workspaceContext(params.workspaceId);
    const result = await context.run(
      async ({ db, workspaceId, user, requireRole }) => {
        requireRole("topic:write");
        return createCreationProject({
          db,
          workspaceId,
          userId: user.id,
          input,
        });
      },
    );
    return ok(result, requestId, 201);
  },
);
