import Link from "next/link";
import { listNiches, listTopics, listWorkflowRuns } from "@shorts-os/db";
import { topicListQuerySchema } from "@shorts-os/contracts";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { ScoreBadge } from "@/components/product/score-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);

  const { niches, topics, runs } = await context.run(async ({ db }) => ({
    niches: await listNiches(db, workspace.id),
    topics: await listTopics(db, workspace.id, topicListQuerySchema.parse({ limit: "100" })),
    runs: await listWorkflowRuns(db, workspace.id, 10),
  }));

  const produceCandidates = topics.filter((topic) => topic.decisionBand === "PRODUCE_CANDIDATE");
  const researchMore = topics.filter((topic) => topic.decisionBand === "RESEARCH_MORE");
  const awaitingDecision = topics.filter((topic) => topic.decision === "new");
  const failedRuns = runs.filter((run) => run.status === "failed");

  const kpis = [
    { label: "Produce 후보", value: produceCandidates.length, hint: "점수·신뢰도 기준 통과" },
    { label: "승인 대기", value: awaitingDecision.length, hint: "Topic 결정이 필요합니다" },
    { label: "데이터 보강 필요", value: researchMore.length, hint: "점수는 높지만 신뢰도 부족" },
    { label: "실패한 Run", value: failedRuns.length, hint: "재시도가 필요합니다" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-black">Dashboard</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          오늘 처리할 일과 수집 상태입니다. 모든 숫자는 저장된 신호에서 계산되며 추정값을 만들지
          않습니다.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-border/70 bg-card p-5">
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums">{kpi.value}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">오늘의 우선순위</h2>
          <Link
            href="/radar/topics"
            className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Topic Radar 열기
          </Link>
        </div>

        {topics.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="font-bold">아직 수집된 주제가 없습니다</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Niche Radar에서 관심 분야를 만들고 신호를 수집하면 여기에 우선순위가 나타납니다.
            </p>
            <Link
              href="/radar/niches"
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-bold text-primary-foreground"
            >
              Niche 만들기
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {topics.slice(0, 5).map((topic) => (
              <li
                key={topic.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{topic.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {topic.nicheName} · {topic.scoreBreakdown?.explanation ?? "점수 근거 없음"}
                  </p>
                </div>
                <ScoreBadge
                  score={topic.opportunityScore}
                  confidence={topic.confidenceScore}
                  band={topic.decisionBand}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-base font-bold">Niche 상태</h2>
          {niches.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">등록된 Niche가 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {niches.map(({ niche, latest }) => (
                <li key={niche.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {niche.name}
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                      {niche.targetCountry}/{niche.targetLanguage}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {latest?.collectedAt
                      ? `${latest.collectedAt.toISOString().slice(0, 10)} 수집`
                      : "미수집"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">Workflow 상태</h2>
            <Link
              href="/runs"
              className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
            >
              전체 보기
            </Link>
          </div>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">실행 기록이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {runs.slice(0, 5).map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-mono text-[12px]">{run.workflowType}</span>
                  <span
                    className={
                      run.status === "failed"
                        ? "shrink-0 font-mono text-[11px] text-destructive"
                        : "shrink-0 font-mono text-[11px] text-muted-foreground"
                    }
                  >
                    {run.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
