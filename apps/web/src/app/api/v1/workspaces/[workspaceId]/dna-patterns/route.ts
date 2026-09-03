import { listDnaPatterns, listReferenceVideosForLibrary, readImportMeta } from "@shorts-os/db";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string }>(async ({ requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);

  const data = await context.run(async ({ db }) => {
    const [patterns, videos] = await Promise.all([
      listDnaPatterns(db, workspaceId),
      listReferenceVideosForLibrary(db, workspaceId),
    ]);
    return {
      patterns,
      videos: videos.map((video) => ({
        ...video,
        importMeta: readImportMeta(video.metadata),
      })),
    };
  });

  return ok(data, requestId);
});
