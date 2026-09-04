import { loadFactoryBoard } from "@shorts-os/services";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string }>(async ({ requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);
  const board = await context.run(async ({ db, registry }) =>
    loadFactoryBoard(db, workspaceId, registry.videoGeneration()),
  );
  return ok(board, requestId);
});
