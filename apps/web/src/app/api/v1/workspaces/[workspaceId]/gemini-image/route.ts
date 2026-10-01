import { z } from "zod";
import { GeminiImageProvider } from "@shorts-os/providers";
import { generateShotImage } from "@shorts-os/services";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";
import { env } from "@/server/env";

export const maxDuration = 300;
function provider() {
  const current = env();
  if (current.APP_MODE !== "live")
    throw new DomainError(
      "PROVIDER_NOT_CONNECTED",
      "실제 이미지 생성은 Live 모드에서 사용할 수 있습니다.",
    );
  if (!current.GEMINI_API_KEY)
    throw new DomainError(
      "PROVIDER_NOT_CONNECTED",
      "서버에 GEMINI_API_KEY가 없습니다. .env.docker 설정 후 웹앱을 다시 시작해 주세요.",
    );
  return {
    model: current.GEMINI_IMAGE_MODEL,
    provider: new GeminiImageProvider({
      apiKey: current.GEMINI_API_KEY,
      model: current.GEMINI_IMAGE_MODEL,
    }),
  };
}
export const GET = route<{ workspaceId: string }>(
  async ({ params, requestId }) => {
    const context = await workspaceContext(params.workspaceId);
    await context.run(async ({ requireRole }) => {
      requireRole("topic:write");
    });
    const result = await provider().provider.checkConnection();
    const response = ok(result, requestId);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
);
const inputSchema = z.object({
  projectId: z.string().uuid(),
  shotId: z.string().uuid(),
  confirmPaid: z.literal(true),
});
export const POST = route<{ workspaceId: string }>(
  async ({ params, request, requestId }) => {
    const context = await workspaceContext(params.workspaceId);
    const input = await parseBody(request, inputSchema);
    const result = await context.run(async ({ db, user, requireRole }) => {
      requireRole("topic:write");
      return generateShotImage({
        db,
        workspaceId: params.workspaceId,
        userId: user.id,
        projectId: input.projectId,
        shotId: input.shotId,
        ...provider(),
      });
    });
    return ok(result, requestId);
  },
);
