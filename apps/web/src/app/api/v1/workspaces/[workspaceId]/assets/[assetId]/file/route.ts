import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getMediaAsset } from "@shorts-os/db";
import { DomainError } from "@shorts-os/domain";
import { route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string; assetId: string }>(
  async ({ params }) => {
    const { workspaceId, assetId } = params;
    const context = await workspaceContext(workspaceId);
    const asset = await context.run(({ db }) => getMediaAsset(db, workspaceId, assetId));
    if (!asset?.storageUri) {
      throw new DomainError("NOT_FOUND", "미디어 파일을 찾을 수 없습니다.");
    }
    const info = await stat(asset.storageUri);
    const stream = createReadStream(asset.storageUri);
    return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
      headers: {
        "content-type": asset.mimeType ?? "video/mp4",
        "content-length": String(info.size),
        "cache-control": "private, max-age=60",
      },
    });
  },
);
