import { patchScriptSchema } from "@shorts-os/contracts";
import { patchDraftScript } from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const PATCH = route<{ workspaceId: string; scriptId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, scriptId } = params;
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, patchScriptSchema);

    const script = await context.run(async ({ db, requireRole }) => {
      requireRole("topic:write");
      return patchDraftScript({ db, workspaceId, scriptId, ...input });
    });

    return ok({ script }, requestId);
  },
);
