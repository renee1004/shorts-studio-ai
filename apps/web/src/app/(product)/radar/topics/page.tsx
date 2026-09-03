import { listNiches, listTopics } from "@shorts-os/db";
import { topicListQuerySchema } from "@shorts-os/contracts";
import { listMyWorkspaces, workspaceContext } from "@/server/context";
import { TopicRadarClient } from "@/components/product/topic-radar-client";

export const dynamic = "force-dynamic";

export default async function TopicRadarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const workspaces = await listMyWorkspaces();
  const workspace = workspaces[0]!;
  const context = await workspaceContext(workspace.id);

  const query = topicListQuerySchema.parse({
    limit: "100",
    ...(typeof raw.nicheId === "string" ? { nicheId: raw.nicheId } : {}),
    ...(typeof raw.decision === "string" ? { decision: raw.decision } : {}),
    ...(typeof raw.minScore === "string" ? { minScore: raw.minScore } : {}),
    ...(typeof raw.minConfidence === "string" ? { minConfidence: raw.minConfidence } : {}),
  });

  const { topics, niches } = await context.run(async ({ db }) => ({
    topics: await listTopics(db, workspace.id, query),
    niches: await listNiches(db, workspace.id),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">Topic Radar</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          제작 우선순위입니다. 점수와 신뢰도를 분리해 보여주고, 어떤 신호가 빠졌는지 함께
          표시합니다. 상태 변경은 사람이 결정합니다.
        </p>
      </header>

      <TopicRadarClient
        workspaceId={workspace.id}
        role={workspace.role}
        niches={niches.map(({ niche }) => ({ id: niche.id, name: niche.name }))}
        activeFilters={{
          nicheId: query.nicheId ?? null,
          decision: query.decision ?? null,
          minScore: query.minScore ?? null,
          minConfidence: query.minConfidence ?? null,
        }}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          angleHint: topic.angleHint,
          decision: topic.decision,
          nicheName: topic.nicheName,
          market: `${topic.targetCountry}/${topic.targetLanguage}`,
          opportunityScore: topic.opportunityScore,
          confidenceScore: topic.confidenceScore,
          decisionBand: topic.decisionBand,
          referenceVideoCount: topic.referenceVideoCount,
          lastSeenAt: topic.lastSeenAt,
          breakdown: topic.scoreBreakdown,
        }))}
      />
    </div>
  );
}
