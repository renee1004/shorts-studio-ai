import { sql } from "drizzle-orm";
import { DomainError } from "@shorts-os/domain";
import { GeminiSpeechProvider } from "@shorts-os/providers";
import {
  findNarration,
  generateNarration,
  loadStudioProject,
} from "@shorts-os/services";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";
import { env } from "@/server/env";

export const GET = route<{ workspaceId: string; projectId: string }>(
  async ({ params, requestId }) => {
    const context = await workspaceContext(params.workspaceId);
    const asset = await context.run(async ({ db }) => {
      const detail = await loadStudioProject(
        db,
        params.workspaceId,
        params.projectId,
      );
      return findNarration(
        db,
        params.workspaceId,
        params.projectId,
        detail.shots,
      );
    });
    return ok({ assetId: asset?.id ?? null }, requestId);
  },
);
export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ params, requestId }) => {
    const { workspaceId, projectId } = params;
    const context = await workspaceContext(workspaceId);
    const asset = await context.run(async ({ db, requireRole }) => {
      requireRole("topic:write");
      const config = env();
      if (
        config.APP_MODE !== "live" ||
        !config.GEMINI_API_KEY ||
        !config.GEMINI_TTS_MODEL
      )
        throw new DomainError(
          "PROVIDER_NOT_CONNECTED",
          "실제 음성 생성을 사용하려면 Live 모드와 Gemini 음성 모델 설정이 필요합니다.",
        );
      const lock = await db.execute(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${workspaceId + projectId}, 0)) as acquired`,
      );
      if (!lock[0]?.acquired)
        throw new DomainError(
          "CONFLICT",
          "이 프로젝트의 제작이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
        );
      const detail = await loadStudioProject(db, workspaceId, projectId);
      if (!detail.latestScript || !detail.shots.length)
        throw new DomainError(
          "INVALID_STATE_TRANSITION",
          "대본과 장면을 먼저 생성해 주세요.",
        );
      return generateNarration({
        db,
        workspaceId,
        projectId,
        shots: detail.shots,
        model: config.GEMINI_TTS_MODEL,
        voice: config.GEMINI_TTS_VOICE,
        provider: new GeminiSpeechProvider({
          apiKey: config.GEMINI_API_KEY,
          model: config.GEMINI_TTS_MODEL,
          voice: config.GEMINI_TTS_VOICE,
        }),
      });
    });
    return ok({ assetId: asset.id }, requestId);
  },
);
