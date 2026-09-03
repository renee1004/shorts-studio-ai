import { generateScriptSchema, restoreScriptSchema } from "@shorts-os/contracts";
import { generateProjectScript, restoreScriptVersion } from "@shorts-os/services";
import { accepted, ok, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId } = params;
    const context = await workspaceContext(workspaceId);
    const url = new URL(request.url);

    if (url.searchParams.get("restore") === "1") {
      const input = await parseBody(request, restoreScriptSchema);
      const script = await context.run(async ({ db, requireRole, user }) => {
        requireRole("topic:write");
        return restoreScriptVersion({
          db,
          workspaceId,
          userId: user.id,
          projectId,
          fromScriptId: input.fromScriptId,
        });
      });
      return ok({ script }, requestId);
    }

    const idempotencyKey = requireIdempotencyKey(request);
    await parseBody(request, generateScriptSchema);

    const result = await context.run(async ({ db, system, requireRole, user, registry }) => {
      requireRole("topic:write");
      return generateProjectScript({
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
