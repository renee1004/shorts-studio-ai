"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MemberRole } from "@shorts-os/contracts";
import { roleHasPermission } from "@shorts-os/contracts";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/product/score-badge";
import { cn } from "@/lib/utils";

type NicheRow = {
  id: string;
  name: string;
  status: string;
  targetCountry: string;
  targetLanguage: string;
  seedKeywords: string[];
  excludeTerms: string[];
  lastScanAt: string | null;
  scanCount: number;
  opportunityScore: number | null;
  confidenceScore: number | null;
  decisionBand: string | null;
  explanation: string | null;
  scoreChange7d: number | null;
};

type Provider = {
  provider: string;
  available: boolean;
  mode: string;
  reason?: string;
  requirement?: string;
};

export function NicheRadarClient({
  workspaceId,
  role,
  niches,
  providers,
}: {
  workspaceId: string;
  role: MemberRole;
  niches: NicheRow[];
  providers: Provider[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    targetCountry: "KR",
    targetLanguage: "ko",
    seedKeywords: "",
    excludeTerms: "",
  });

  const canWrite = roleHasPermission(role, "niche:write");

  async function callApi(path: string, init: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const payload = (await response.json()) as {
      data?: unknown;
      error?: { code: string; message: string; details?: Record<string, unknown> };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "요청이 실패했습니다.");
    }
    return payload.data;
  }

  async function collect(nicheId: string) {
    setBusyId(nicheId);
    try {
      const data = (await callApi(
        `/api/v1/workspaces/${workspaceId}/niches/${nicheId}/collect`,
        {
          method: "POST",
          headers: {
            // 같은 날 같은 Niche는 한 번만 실행된다. 재호출은 기존 Run을 재사용한다.
            "idempotency-key": `niche-${nicheId}-${new Date().toISOString().slice(0, 13)}`,
          },
          body: JSON.stringify({
            providers: ["youtube_data", "google_trends"],
            lookbackDays: 45,
            maxVideosPerKeyword: 25,
            forceRefresh: false,
          }),
        },
      )) as {
        reused: boolean;
        summary: { videosCollected: number; topicsCreated: number; topicsUpdated: number };
        skippedProviders: { provider: string; reason: string }[];
        quota: { searchCallsUsed: number; searchCallsLimit: number };
      };

      if (data.reused) {
        toast.info("이미 실행된 수집입니다", {
          description: "같은 시간대에 같은 조건으로 이미 수집했습니다. 기존 결과를 씁니다.",
        });
      } else {
        toast.success(
          `영상 ${data.summary.videosCollected}편에서 주제 ${data.summary.topicsCreated}개를 찾았습니다`,
          {
            description: `검색 호출 ${data.quota.searchCallsUsed}/${data.quota.searchCallsLimit} 사용${
              data.skippedProviders.length > 0
                ? ` · 건너뜀: ${data.skippedProviders.map((p) => p.provider).join(", ")}`
                : ""
            }`,
          },
        );
      }
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수집에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function createNiche() {
    const seedKeywords = form.seedKeywords
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (form.name.trim().length === 0 || seedKeywords.length === 0) {
      toast.error("이름과 시드 키워드를 입력해 주세요.");
      return;
    }

    try {
      await callApi(`/api/v1/workspaces/${workspaceId}/niches`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          targetCountry: form.targetCountry.toUpperCase(),
          targetLanguage: form.targetLanguage,
          seedKeywords,
          includeTerms: [],
          excludeTerms: form.excludeTerms
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      toast.success("Niche를 만들었습니다");
      setCreating(false);
      setForm({ name: "", targetCountry: "KR", targetLanguage: "ko", seedKeywords: "", excludeTerms: "" });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "생성에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-bold">Provider 상태</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <li key={provider.provider} className="flex items-start gap-2 text-[12px]">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  provider.available ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              <span className="min-w-0">
                <span className="font-mono">{provider.provider}</span>
                <span className="ml-1.5 text-muted-foreground">{provider.mode}</span>
                {provider.requirement && (
                  <span className="block text-muted-foreground/80">{provider.requirement}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canWrite && (
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          {creating ? (
            <div className="space-y-3">
              <h2 className="text-sm font-bold">새 Niche</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12px]">
                  <span className="text-muted-foreground">이름</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="연말정산 절세"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="text-muted-foreground">시드 키워드 (쉼표로 구분, 최대 20개)</span>
                  <input
                    value={form.seedKeywords}
                    onChange={(event) => setForm({ ...form, seedKeywords: event.target.value })}
                    placeholder="연말정산, 세액공제, 환급"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="text-muted-foreground">국가 (ISO 2자리)</span>
                  <input
                    value={form.targetCountry}
                    onChange={(event) => setForm({ ...form, targetCountry: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="text-muted-foreground">언어</span>
                  <input
                    value={form.targetLanguage}
                    onChange={(event) => setForm({ ...form, targetLanguage: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
                <label className="block text-[12px] sm:col-span-2">
                  <span className="text-muted-foreground">제외 키워드 (선택)</span>
                  <input
                    value={form.excludeTerms}
                    onChange={(event) => setForm({ ...form, excludeTerms: event.target.value })}
                    placeholder="도박, 사기"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary/60"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button className="h-9 px-4" onClick={() => void createNiche()}>
                  만들기
                </Button>
                <Button variant="ghost" className="h-9 px-4" onClick={() => setCreating(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                관심 분야를 등록하면 시드 키워드로 신호를 모읍니다.
              </p>
              <Button className="h-9 shrink-0 px-4" onClick={() => setCreating(true)}>
                Niche 추가
              </Button>
            </div>
          )}
        </div>
      )}

      {niches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-bold">등록된 Niche가 없습니다</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            위에서 Niche를 추가하고 수집을 실행하면 Topic Radar에 후보가 쌓입니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {niches.map((niche) => (
            <li key={niche.id} className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold">{niche.name}</h3>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {niche.targetCountry}/{niche.targetLanguage} · {niche.status} · 수집{" "}
                    {niche.scanCount}회
                    {niche.lastScanAt ? ` · 최근 ${niche.lastScanAt.slice(0, 10)}` : " · 미수집"}
                  </p>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    시드: {niche.seedKeywords.join(", ")}
                    {niche.excludeTerms.length > 0 && ` · 제외: ${niche.excludeTerms.join(", ")}`}
                  </p>
                  {niche.explanation && (
                    <p className="mt-2 text-balance-ko text-[12px] leading-relaxed text-muted-foreground">
                      {niche.explanation}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ScoreBadge
                    score={niche.opportunityScore}
                    confidence={niche.confidenceScore}
                    band={niche.decisionBand}
                  />
                  {niche.scoreChange7d !== null && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      7d {niche.scoreChange7d > 0 ? "+" : ""}
                      {niche.scoreChange7d.toFixed(1)}
                    </span>
                  )}
                </div>
                {canWrite && (
                  <Button
                    className="h-9 shrink-0 px-4"
                    disabled={busyId === niche.id || pending}
                    onClick={() => void collect(niche.id)}
                  >
                    {busyId === niche.id ? "수집 중" : "신호 수집"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
