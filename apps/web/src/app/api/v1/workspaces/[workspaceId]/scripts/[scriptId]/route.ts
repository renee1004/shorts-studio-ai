import { patchScriptSchema } from "@shorts-os/contracts";
import { patchDraftScript } from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const PATCH = route<{ workspaceId: string; scriptId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, scriptId } = params;
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, patchScriptSchema);

    const result = await context.run(async ({ db, requireRole, user }) => {
      requireRole("topic:write");
      return patchDraftScript({
        db,
        workspaceId,
        userId: user.id,
        scriptId,
        ...input,
      });
    });

    return ok(result, requestId);
  },
);
