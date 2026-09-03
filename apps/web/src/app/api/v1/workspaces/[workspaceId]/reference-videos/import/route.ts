import { importReferenceVideoSchema } from "@shorts-os/contracts";
import { importReferenceVideo } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string }>(async ({ request, requestId, params }) => {
  const { workspaceId } = params;
  const idempotencyKey = requireIdempotencyKey(request);
  const context = await workspaceContext(workspaceId);
  const input = await parseBody(request, importReferenceVideoSchema);

  const result = await context.run(async ({ db, system, requireRole, user, registry }) => {
    requireRole("topic:write");
    return importReferenceVideo({
      db,
      system,
      youtube: registry.youtubeDiscovery(),
      workspaceId,
      userId: user.id,
      request: input,
      idempotencyKey,
      requestId,
    });
  });

  return accepted(result, requestId);
});
