import { saveUploadedClip } from "@shorts-os/services";
import { DomainError } from "@shorts-os/domain";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string; shotId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId, shotId } = params;
    const context = await workspaceContext(workspaceId);
    await context.run(async ({ requireRole }) => {
      requireRole("topic:write");
    });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new DomainError("VALIDATION_FAILED", "file 필드가 필요합니다.");
    }
    const bytes = Buffer.from(await file.arrayBuffer());

    const asset = await context.run(async ({ db, user }) => {
      return saveUploadedClip({
        db,
        workspaceId,
        userId: user.id,
        projectId,
        shotId,
        bytes,
        mimeType: file.type || "video/mp4",
        fileName: file.name,
      });
    });

    return ok(
      {
        id: asset.id,
        checksum: asset.checksumSha256,
        status: asset.status,
      },
      requestId,
      201,
    );
  },
);
