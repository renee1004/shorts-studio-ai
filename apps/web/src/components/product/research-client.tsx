"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Citation, KeyFact, MemberRole } from "@shorts-os/contracts";
import { roleHasPermission } from "@shorts-os/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BriefView = {
  id: string;
  version: number;
  status: string;
  citationCoverage: number | null;
  modelName: string | null;
  executiveSummary: string;
  keyFacts: KeyFact[];
  audienceInsights: string[];
  angles: { title: string; hook: string; why: string }[];
  counterpoints: string[];
  unknowns: string[];
  citations: Citation[];
};

type Row = {
  topicId: string;
  topicTitle: string;
  nicheName: string;
  decision: string;
  versionCount: number;
  brief: BriefView | null;
};

const statusLabels: Record<string, { label: string; tone: string }> = {
  ready: { label: "근거 확인됨", tone: "border-success/40 bg-success/10 text-success" },
  needs_review: {
    label: "사람 확인 필요",
    tone: "border-primary/40 bg-primary/10 text-primary",
  },
  draft: { label: "초안", tone: "border-border bg-secondary/60 text-muted-foreground" },
  collecting: { label: "수집 중", tone: "border-border bg-secondary/60 text-muted-foreground" },
  approved: { label: "승인", tone: "border-success/40 bg-success/10 text-success" },
  failed: { label: "실패", tone: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export function ResearchClient({
  workspaceId,
  role,
  provider,
  rows,
}: {
  workspaceId: string;
  role: MemberRole;
  provider: { available: boolean; mode: string; requirement?: string };
  rows: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(rows.find((row) => row.brief)?.topicId ?? null);

  const canWrite = roleHasPermission(role, "topic:write");

  async function generate(topicId: string, force: boolean) {
    setBusyId(topicId);
    // 새로 생성은 매번 새 Run이어야 하고, 첫 생성은 같은 시간대 중복 호출을 합쳐야 한다.
    const keySuffix = force
      ? crypto.randomUUID()
      : new Date().toISOString().slice(0, 13);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/topics/${topicId}/research`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `research-${topicId}-${keySuffix}`,
          },
          body: JSON.stringify({ language: "ko", maxSources: 8, forceRefresh: force }),
        },
      );

      const payload = (await response.json()) as {
        data?: {
          mode: string;
          fromCache: boolean;
          brief: { version: number; citations: number; keyFacts: number };
        };
        error?: { message: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Brief 생성에 실패했습니다.");
      }

      const { brief, mode, fromCache } = payload.data;
      if (fromCache) {
        toast.info("같은 입력이라 기존 Brief를 씁니다", {
          description: "다시 생성하려면 새로 생성을 누르세요.",
        });
      } else {
        toast.success(`v${brief.version} Brief를 만들었습니다`, {
          description:
            mode === "mock"
              ? "Demo Mode입니다. 출처를 만들지 않으므로 근거는 비어 있습니다."
              : `출처 ${brief.citations}건, 근거 있는 사실 ${brief.keyFacts}건`,
        });
      }
      setOpenId(topicId);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Brief 생성에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold">Research Provider</h2>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              <span className="font-mono">gemini</span>
              <span className="ml-1.5">{provider.mode}</span>
            </p>
            {provider.requirement && (
              <p className="mt-1 text-[12px] text-muted-foreground/80">{provider.requirement}</p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold",
              provider.available
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-secondary/60 text-muted-foreground",
            )}
          >
            {provider.available ? "사용 가능" : "꺼짐"}
          </span>
        </div>
        {provider.mode === "mock" && (
          <p className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-[12px] leading-relaxed">
            Demo Mode에서는 웹을 읽지 않습니다. 출처와 사실 주장을 만들어내지 않으므로 Brief는
            구성 틀과 확인이 필요한 항목만 담습니다.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-bold">주제가 없습니다</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Topic Radar에서 주제를 만든 뒤 여기서 근거를 모읍니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const meta = row.brief ? statusLabels[row.brief.status] : undefined;
            const open = openId === row.topicId;

            return (
              <li key={row.topicId} className="rounded-2xl border border-border/70 bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold">{row.topicTitle}</h3>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {row.nicheName} · {row.decision}
                      {row.versionCount > 0 ? ` · Brief v${row.brief?.version} (${row.versionCount}개)` : " · Brief 없음"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {row.brief && (
                      <>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          근거{" "}
                          {row.brief.citationCoverage === null
                            ? "N/A"
                            : `${row.brief.citationCoverage}%`}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                            meta?.tone ?? "border-border bg-secondary/50 text-muted-foreground",
                          )}
                        >
                          {meta?.label ?? row.brief.status}
                        </span>
                      </>
                    )}
                    {row.brief && (
                      <Button
                        variant="ghost"
                        className="h-9 px-3"
                        onClick={() => setOpenId(open ? null : row.topicId)}
                      >
                        {open ? "접기" : "펼치기"}
                      </Button>
                    )}
                    {canWrite && provider.available && (
                      <Button
                        className="h-9 px-4"
                        disabled={busyId === row.topicId || pending}
                        onClick={() => void generate(row.topicId, row.brief !== null)}
                      >
                        {busyId === row.topicId
                          ? "생성 중"
                          : row.brief
                            ? "새로 생성"
                            : "Brief 생성"}
                      </Button>
                    )}
                  </div>
                </div>

                {row.brief && open && <BriefDetail brief={row.brief} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BriefDetail({ brief }: { brief: BriefView }) {
  return (
    <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
      <section>
        <h4 className="font-mono text-[11px] tracking-widest text-muted-foreground">요약</h4>
        <p className="mt-1.5 text-balance-ko text-[13px] leading-relaxed">
          {brief.executiveSummary}
        </p>
        {brief.modelName && (
          <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
            model {brief.modelName} · v{brief.version}
          </p>
        )}
      </section>

      <section>
        <h4 className="font-mono text-[11px] tracking-widest text-muted-foreground">
          근거 있는 사실
        </h4>
        {brief.keyFacts.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            출처로 확인된 사실이 없습니다. 없는 근거를 만들지 않습니다.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {brief.keyFacts.map((fact, index) => (
              <li key={index} className="text-[13px] leading-relaxed">
                {fact.statement}
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                  [
                  {fact.citationIndexes
                    .map((citationIndex) => citationIndex + 1)
                    .join(", ")}
                  ]
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {brief.angles.length > 0 && (
        <section>
          <h4 className="font-mono text-[11px] tracking-widest text-muted-foreground">구성 안</h4>
          <ul className="mt-1.5 space-y-2">
            {brief.angles.map((angle, index) => (
              <li key={index} className="rounded-xl border border-border/60 p-3">
                <p className="text-[13px] font-bold">{angle.title}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{angle.hook}</p>
                <p className="mt-1 text-[12px] text-muted-foreground/80">{angle.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.audienceInsights.length > 0 && (
        <ListSection title="시청자" items={brief.audienceInsights} />
      )}
      {brief.counterpoints.length > 0 && (
        <ListSection title="반론" items={brief.counterpoints} />
      )}
      {brief.unknowns.length > 0 && <ListSection title="미확인" items={brief.unknowns} />}

      <section>
        <h4 className="font-mono text-[11px] tracking-widest text-muted-foreground">출처</h4>
        {brief.citations.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            출처가 없습니다. Live 모드에서 Search Grounding이 붙으면 채워집니다.
          </p>
        ) : (
          <ol className="mt-1.5 space-y-1">
            {brief.citations.map((citation, index) => (
              <li key={citation.url} className="text-[12px]">
                <span className="font-mono text-muted-foreground">{index + 1}.</span>{" "}
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-border underline-offset-4 hover:text-foreground"
                >
                  {citation.title}
                </a>
                {citation.publisher && (
                  <span className="ml-1.5 text-muted-foreground">{citation.publisher}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h4 className="font-mono text-[11px] tracking-widest text-muted-foreground">{title}</h4>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="text-balance-ko text-[13px] leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
