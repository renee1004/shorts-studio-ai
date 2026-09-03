import { analyzeDnaSchema } from "@shorts-os/contracts";
import { analyzeReferenceDna } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; id: string }>(async ({ request, requestId, params }) => {
  const { workspaceId, id } = params;
  const idempotencyKey = requireIdempotencyKey(request);
  const context = await workspaceContext(workspaceId);
  const input = await parseBody(request, analyzeDnaSchema);

  const result = await context.run(async ({ db, system, requireRole, user, registry }) => {
    requireRole("topic:write");
    void input;
    return analyzeReferenceDna({
      db,
      system,
      provider: registry.contentStudio(),
      workspaceId,
      userId: user.id,
      referenceVideoId: id,
      idempotencyKey,
    });
  });

  return accepted(result, requestId);
});
