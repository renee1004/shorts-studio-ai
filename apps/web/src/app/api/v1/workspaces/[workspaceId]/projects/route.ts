import { createProjectSchema } from "@shorts-os/contracts";
import { createStudioProject, loadStudioBoard } from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string }>(async ({ requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);
  const board = await context.run(({ db }) => loadStudioBoard(db, workspaceId));
  return ok(board, requestId);
});

export const POST = route<{ workspaceId: string }>(async ({ request, requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);
  const input = await parseBody(request, createProjectSchema);

  const result = await context.run(async ({ db, requireRole, user }) => {
    requireRole("topic:write");
    return createStudioProject({ db, workspaceId, userId: user.id, request: input });
  });

  return ok(result, requestId, 201);
});
