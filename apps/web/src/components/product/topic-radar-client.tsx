"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MemberRole, ScoreResult, TopicDecision } from "@shorts-os/contracts";
import { allowedTopicTransitions, roleHasPermission } from "@shorts-os/contracts";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/product/score-badge";
import { cn } from "@/lib/utils";

type TopicRow = {
  id: string;
  title: string;
  angleHint: string | null;
  decision: TopicDecision;
  nicheName: string;
  market: string;
  opportunityScore: number | null;
  confidenceScore: number | null;
  decisionBand: string | null;
  referenceVideoCount: number;
  lastSeenAt: string;
  breakdown: ScoreResult | null;
};

const signalLabels: Record<string, string> = {
  youtube_velocity: "조회 속도",
  search_interest: "검색 관심도",
  commercial_intent: "광고 가치",
  competition_gap: "경쟁 여유",
  shorts_fit: "쇼츠 적합성",
  repeatability: "반복 제작성",
  source_quality: "출처 품질",
  policy_safety: "정책 안전성",
};

const decisionLabels: Record<TopicDecision, string> = {
  new: "미결정",
  watch: "관찰",
  approved: "승인",
  rejected: "제외",
  archived: "보관",
};

export function TopicRadarClient({
  workspaceId,
  role,
  topics,
  niches,
  activeFilters,
}: {
  workspaceId: string;
  role: MemberRole;
  topics: TopicRow[];
  niches: { id: string; name: string }[];
  activeFilters: {
    nicheId: string | null;
    decision: string | null;
    minScore: number | null;
    minConfidence: number | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(topics[0]?.id ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const canDecide = roleHasPermission(role, "topic:decide");
  const selected = useMemo(
    () => topics.find((topic) => topic.id === selectedId) ?? null,
    [topics, selectedId],
  );

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams();
    const merged = {
      nicheId: activeFilters.nicheId,
      decision: activeFilters.decision,
      minScore: activeFilters.minScore === null ? null : String(activeFilters.minScore),
      minConfidence:
        activeFilters.minConfidence === null ? null : String(activeFilters.minConfidence),
      [key]: value,
    } as Record<string, string | null>;

    for (const [name, item] of Object.entries(merged)) {
      if (item !== null && item !== "") params.set(name, item);
    }
    startTransition(() => router.push(`/radar/topics?${params.toString()}`));
  }

  async function decide(topicId: string, decision: TopicDecision) {
    const reason = window.prompt(
      `이 결정의 이유를 남겨주세요. (감사 기록에 저장됩니다)`,
      decision === "approved" ? "점수와 신뢰도가 기준을 넘고 채널 방향에 맞습니다." : "",
    );
    if (!reason) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/topics/${topicId}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, reason }),
        },
      );
      const payload = (await response.json()) as {
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "변경에 실패했습니다.");
      toast.success(`${decisionLabels[decision]}으로 바꿨습니다`);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkDecide(decision: TopicDecision) {
    if (checked.size === 0) return;
    const reason = window.prompt(
      `${checked.size}건을 ${decisionLabels[decision]}으로 바꿉니다. 이유를 남겨주세요.`,
      "",
    );
    if (!reason) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/topics/bulk-decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicIds: [...checked], decision, reason }),
      });
      const payload = (await response.json()) as {
        data?: { succeeded: string[]; failed: { topicId: string; message: string }[] };
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "일괄 변경에 실패했습니다.");

      const failed = payload.data?.failed.length ?? 0;
      toast.success(`${payload.data?.succeeded.length ?? 0}건을 바꿨습니다`, {
        ...(failed > 0 ? { description: `${failed}건은 상태 전이 규칙 때문에 실패했습니다.` } : {}),
      });
      setChecked(new Set());
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (topics.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="font-bold">조건에 맞는 주제가 없습니다</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Niche Radar에서 신호를 수집하거나 필터를 넓혀보세요.
        </p>
        <Button
          variant="outline"
          className="mt-4 h-9 px-4"
          onClick={() => startTransition(() => router.push("/radar/topics"))}
        >
          필터 초기화
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeFilters.nicheId ?? ""}
          onChange={(event) => setFilter("nicheId", event.target.value || null)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
          aria-label="Niche 필터"
        >
          <option value="">모든 Niche</option>
          {niches.map((niche) => (
            <option key={niche.id} value={niche.id}>
              {niche.name}
            </option>
          ))}
        </select>

        <select
          value={activeFilters.decision ?? ""}
          onChange={(event) => setFilter("decision", event.target.value || null)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
          aria-label="결정 상태 필터"
        >
          <option value="">모든 상태</option>
          {(["new", "watch", "approved", "rejected", "archived"] as TopicDecision[]).map(
            (decision) => (
              <option key={decision} value={decision}>
                {decisionLabels[decision]}
              </option>
            ),
          )}
        </select>

        <select
          value={activeFilters.minScore === null ? "" : String(activeFilters.minScore)}
          onChange={(event) => setFilter("minScore", event.target.value || null)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
          aria-label="최소 점수"
        >
          <option value="">점수 전체</option>
          <option value="85">85점 이상</option>
          <option value="70">70점 이상</option>
        </select>

        <select
          value={activeFilters.minConfidence === null ? "" : String(activeFilters.minConfidence)}
          onChange={(event) => setFilter("minConfidence", event.target.value || null)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
          aria-label="최소 신뢰도"
        >
          <option value="">신뢰도 전체</option>
          <option value="60">60 이상</option>
          <option value="40">40 이상</option>
        </select>

        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {topics.length}건{pending ? " · 갱신 중" : ""}
        </span>
      </div>

      {canDecide && checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/35 bg-primary/[0.07] px-4 py-3">
          <span className="text-[13px] font-bold">{checked.size}건 선택</span>
          <Button
            className="h-8 px-3 text-xs"
            disabled={busy}
            onClick={() => void bulkDecide("approved")}
          >
            승인
          </Button>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs"
            disabled={busy}
            onClick={() => void bulkDecide("watch")}
          >
            관찰
          </Button>
          <Button
            variant="ghost"
            className="h-8 px-3 text-xs"
            disabled={busy}
            onClick={() => setChecked(new Set())}
          >
            선택 해제
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="space-y-2">
          {topics.map((topic) => (
            <li key={topic.id}>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                  topic.id === selectedId
                    ? "border-primary/45 bg-primary/[0.06]"
                    : "border-border/70 bg-card",
                )}
              >
                {canDecide && (
                  <input
                    type="checkbox"
                    checked={checked.has(topic.id)}
                    onChange={(event) => {
                      const next = new Set(checked);
                      if (event.target.checked) next.add(topic.id);
                      else next.delete(topic.id);
                      setChecked(next);
                    }}
                    aria-label={`${topic.title} 선택`}
                    className="mt-1 size-4 shrink-0"
                  />
                )}

                <button
                  type="button"
                  onClick={() => setSelectedId(topic.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-bold">{topic.title}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {topic.nicheName} · {topic.market} · 참고 영상 {topic.referenceVideoCount}편 ·{" "}
                    {decisionLabels[topic.decision]}
                  </p>
                  {(topic.breakdown?.missingSignals.length ?? 0) > 0 && (
                    <p className="mt-1 text-[11px] text-primary">
                      결측 신호 {topic.breakdown?.missingSignals.length}개
                    </p>
                  )}
                </button>

                <ScoreBadge
                  score={topic.opportunityScore}
                  confidence={topic.confidenceScore}
                  band={topic.decisionBand}
                />
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          {selected ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
              <div>
                <h2 className="text-balance-ko text-base font-bold">{selected.title}</h2>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {selected.breakdown?.explanation ?? "점수 근거가 없습니다."}
                </p>
              </div>

              {selected.angleHint && (
                <p className="rounded-lg bg-secondary/40 p-3 text-[12px] leading-relaxed text-muted-foreground">
                  {selected.angleHint}
                </p>
              )}

              <div>
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  SCORE BREAKDOWN
                </p>
                <ul className="mt-2 space-y-1.5">
                  {(selected.breakdown?.signals ?? []).map((signal) => (
                    <li key={signal.key} className="flex items-center gap-2 text-[12px]">
                      <span className="w-24 shrink-0 text-muted-foreground">
                        {signalLabels[signal.key] ?? signal.key}
                      </span>
                      {signal.available ? (
                        <>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${signal.normalizedScore ?? 0}%` }}
                            />
                          </span>
                          <span className="w-14 shrink-0 text-right font-mono tabular-nums">
                            {signal.normalizedScore?.toFixed(0)}
                            <span className="text-muted-foreground">×{signal.weight}</span>
                          </span>
                        </>
                      ) : (
                        <span className="flex-1 font-mono text-[11px] text-muted-foreground">
                          N/A · {signal.reason ?? "수집 안 됨"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {selected.breakdown && (
                <dl className="grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-[11px]">
                  <div>
                    <dt className="text-muted-foreground">사용 가중치</dt>
                    <dd className="font-mono">{selected.breakdown.availableWeight}/100</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">점수 설정 버전</dt>
                    <dd className="font-mono">v{selected.breakdown.configVersion}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">신뢰도 구성</dt>
                    <dd className="font-mono">
                      커버 {selected.breakdown.confidenceParts.coverage} · 신선{" "}
                      {selected.breakdown.confidenceParts.freshness}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">계산 시각</dt>
                    <dd className="font-mono">
                      {selected.breakdown.calculatedAt.slice(0, 16).replace("T", " ")}
                    </dd>
                  </div>
                </dl>
              )}

              {canDecide ? (
                <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                  {allowedTopicTransitions(selected.decision).map((decision) => (
                    <Button
                      key={decision}
                      variant={decision === "approved" ? "default" : "outline"}
                      className="h-8 px-3 text-xs"
                      disabled={busy}
                      onClick={() => void decide(selected.id, decision)}
                    >
                      {decisionLabels[decision]}
                    </Button>
                  ))}
                  {allowedTopicTransitions(selected.decision).length === 0 && (
                    <p className="text-[12px] text-muted-foreground">
                      보관된 주제는 상태를 바꿀 수 없습니다.
                    </p>
                  )}
                </div>
              ) : (
                <p className="border-t border-border/70 pt-3 text-[12px] text-muted-foreground">
                  {role} 역할에는 결정 권한이 없습니다. Owner나 Reviewer에게 요청하세요.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              왼쪽에서 주제를 선택하면 점수 근거가 나옵니다.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
