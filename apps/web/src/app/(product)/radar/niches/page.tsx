import { listNiches } from "@shorts-os/db";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { NicheRadarClient } from "@/components/product/niche-radar-client";

export const dynamic = "force-dynamic";

export default async function NicheRadarPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);

  const rows = await context.run(({ db }) => listNiches(db, workspace.id));
  const providers = context.registry.availability();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">Niche Radar</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          분야별 기회를 비교합니다. 수집은 공개 YouTube 메타데이터만 사용하고, 연결되지 않은
          Provider는 값을 만들지 않고 N/A로 남깁니다.
        </p>
      </header>

      <NicheRadarClient
        workspaceId={workspace.id}
        role={workspace.role}
        providers={providers}
        niches={rows.map(({ niche, latest, history }) => ({
          id: niche.id,
          name: niche.name,
          status: niche.status,
          targetCountry: niche.targetCountry,
          targetLanguage: niche.targetLanguage,
          seedKeywords: niche.seedKeywords,
          excludeTerms: niche.excludeTerms,
          lastScanAt: latest?.collectedAt?.toISOString() ?? null,
          scanCount: history.length,
          opportunityScore: latest?.opportunityScore ? Number(latest.opportunityScore) : null,
          confidenceScore: latest?.confidenceScore ? Number(latest.confidenceScore) : null,
          decisionBand: latest?.decisionBand ?? null,
          explanation:
            (latest?.scoreBreakdown as { explanation?: string } | null)?.explanation ?? null,
          // 7일 전 대비 변화. 스냅샷이 두 개 미만이면 만들지 않는다.
          scoreChange7d: (() => {
            const week = history.find(
              (item) =>
                latest !== null &&
                item.calculatedAt.getTime() <= latest.calculatedAt.getTime() - 6 * 86_400_000,
            );
            if (!week?.opportunityScore || !latest?.opportunityScore) return null;
            return Number(latest.opportunityScore) - Number(week.opportunityScore);
          })(),
        }))}
      />
    </div>
  );
}
