import { listResearchOverview } from "@shorts-os/db";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { ResearchClient } from "@/components/product/research-client";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);

  const rows = await context.run(({ db }) => listResearchOverview(db, workspace.id, 50));
  const gemini = context.registry
    .availability()
    .find((provider) => provider.provider === "gemini");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">Research</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          주제별 근거 요약입니다. 출처가 확인된 주장만 저장하고, 확인하지 못한 것은 미확인 항목으로
          남깁니다.
        </p>
      </header>

      <ResearchClient
        workspaceId={workspace.id}
        role={workspace.role}
        provider={{
          available: gemini?.available ?? false,
          mode: gemini?.mode ?? "disabled",
          ...(gemini?.requirement ? { requirement: gemini.requirement } : {}),
        }}
        rows={rows.map((row) => ({
          topicId: row.topicId,
          topicTitle: row.topicTitle,
          nicheName: row.nicheName,
          decision: row.decision,
          versionCount: row.versionCount,
          brief: row.brief
            ? {
                id: row.brief.id,
                version: row.brief.version,
                status: row.brief.status,
                citationCoverage: row.brief.citationCoverage,
                modelName: row.brief.modelName,
                executiveSummary: row.brief.content.executiveSummary,
                keyFacts: row.brief.content.keyFacts,
                audienceInsights: row.brief.content.audienceInsights,
                angles: row.brief.content.angles,
                counterpoints: row.brief.content.counterpoints,
                unknowns: row.brief.content.unknowns,
                citations: row.brief.content.citations,
              }
            : null,
        }))}
      />
    </div>
  );
}
