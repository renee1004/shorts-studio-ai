import { generateResearchSchema } from "@shorts-os/contracts";
import { getLatestResearchBrief, listResearchBriefVersions } from "@shorts-os/db";
import { researchTopic } from "@shorts-os/services";
import { accepted, ok, parseBody, requireIdempotencyKey, route } from "@/server/api";
import { workspaceContext } from "@/server/context";
import { env } from "@/server/env";

/**
 * Research Brief 생성. (Phase 2A)
 * 비동기 Command 계약을 지켜 202와 workflowRunId를 돌려준다.
 */
export const POST = route<{ workspaceId: string; topicId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, topicId } = params;
    const idempotencyKey = requireIdempotencyKey(request);
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, generateResearchSchema);

    const result = await context.run(async ({ system, requireRole, user, registry }) => {
      requireRole("topic:write");
      const provider = registry.research();

      // Run/Step/Audit은 사용자 세션이 쓸 수 없다. (스펙 6.4)
      return researchTopic({
        db: system,
        provider,
        workspaceId,
        topicId,
        userId: user.id,
        idempotencyKey,
        request: input,
        requestId,
      });
    });

    return accepted(
      {
        workflowRunId: result.runId,
        status: "succeeded",
        reused: result.reused,
        fromCache: result.fromCache,
        mode: result.mode,
        brief: {
          id: result.brief.id,
          version: result.brief.version,
          status: result.brief.status,
          citationCoverage: result.brief.citationCoverage,
          citations: result.brief.content.citations.length,
          keyFacts: result.brief.content.keyFacts.length,
        },
        appMode: env().APP_MODE,
      },
      requestId,
    );
  },
);

export const GET = route<{ workspaceId: string; topicId: string }>(
  async ({ requestId, params }) => {
    const { workspaceId, topicId } = params;
    const context = await workspaceContext(workspaceId);

    const { latest, versions } = await context.run(async ({ db }) => ({
      latest: await getLatestResearchBrief(db, workspaceId, topicId),
      versions: await listResearchBriefVersions(db, workspaceId, topicId),
    }));

    return ok(
      {
        latest,
        versions: versions.map((brief) => ({
          id: brief.id,
          version: brief.version,
          status: brief.status,
          citationCoverage: brief.citationCoverage,
          modelName: brief.modelName,
          createdAt: brief.createdAt,
        })),
      },
      requestId,
    );
  },
);
