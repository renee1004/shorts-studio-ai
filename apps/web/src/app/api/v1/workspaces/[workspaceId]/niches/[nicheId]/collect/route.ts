import { collectNicheSchema } from "@shorts-os/contracts";
import { createQuotaLedger } from "@shorts-os/db";
import { collectNicheSignals } from "@shorts-os/services";
import { accepted, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";
import { env } from "@/server/env";

/**
 * 비동기 Command. 202와 workflowRunId를 돌려준다.
 * Phase 1에서는 요청 처리 중에 동기적으로 실행하고 Run/Step을 남긴다.
 * Phase 4에서 Worker로 옮길 때 이 계약은 바뀌지 않는다.
 */
export const POST = route<{ workspaceId: string; nicheId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, nicheId } = params;
    const idempotencyKey = requireIdempotencyKey(request);
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, collectNicheSchema);

    const result = await context.run(async ({ system, requireRole, user, registry }) => {
      requireRole("niche:write");
      const provider = registry.youtubeDiscovery();

      // 수집은 시스템 작업이다. Run/Step/Snapshot은 사용자 세션이 쓸 수 없다. (스펙 6.4)
      return collectNicheSignals({
        db: system,
        provider,
        // 한도는 설정값이다. 실제 사용량은 재시작에도 남아야 하므로 DB 원장에 누적한다.
        quotaLedger: createQuotaLedger({
          db: system,
          limits: {
            searchCallsLimit: env().YOUTUBE_SEARCH_DAILY_LIMIT,
            unitsLimit: env().YOUTUBE_UNITS_DAILY_LIMIT,
          },
        }),
        workspaceId,
        nicheId,
        userId: user.id,
        idempotencyKey,
        request: input,
        velocityReferencePerHour: 2000,
        requestId,
      });
    });

    return accepted(
      {
        workflowRunId: result.runId,
        status: result.reused ? "succeeded" : "succeeded",
        reused: result.reused,
        acceptedProviders: ["youtube_data"],
        skippedProviders: result.skippedProviders,
        summary: {
          videosCollected: result.videosCollected,
          topicsCreated: result.topicsCreated,
          topicsUpdated: result.topicsUpdated,
        },
        quota: result.quota,
        mode: env().APP_MODE,
      },
      requestId,
    );
  },
);
