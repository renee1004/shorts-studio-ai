import { topicListQuerySchema } from "@shorts-os/contracts";
import { listTopics } from "@shorts-os/db";
import { ok, parseQuery, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string }>(async ({ request, requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);
  const query = parseQuery(request, topicListQuerySchema);

  const rows = await context.run(({ db }) => listTopics(db, workspaceId, query));

  const filtered = query.hasMissingSignals
    ? rows.filter((row) => (row.scoreBreakdown?.missingSignals.length ?? 0) > 0)
    : rows;

  return ok(
    {
      topics: filtered.map((row) => ({
        id: row.id,
        title: row.title,
        angleHint: row.angleHint,
        decision: row.decision,
        niche: { id: row.nicheId, name: row.nicheName },
        targetCountry: row.targetCountry,
        targetLanguage: row.targetLanguage,
        opportunityScore: row.opportunityScore,
        confidenceScore: row.confidenceScore,
        decisionBand: row.decisionBand,
        // 결측 신호를 숨기지 않는다. UI가 N/A와 이유를 그대로 보여준다.
        missingSignals: row.scoreBreakdown?.missingSignals ?? [],
        latestSignals: Object.fromEntries(
          (row.scoreBreakdown?.signals ?? []).map((signal) => [
            signal.key,
            signal.normalizedScore,
          ]),
        ),
        scoreConfigVersion: row.scoreBreakdown?.configVersion ?? null,
        explanation: row.scoreBreakdown?.explanation ?? null,
        referenceVideoCount: row.referenceVideoCount,
        lastSeenAt: row.lastSeenAt,
      })),
      count: filtered.length,
    },
    requestId,
  );
});
