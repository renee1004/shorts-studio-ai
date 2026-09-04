"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { FactualClaim } from "@shorts-os/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const steps = ["Research", "Angles", "Script", "Shots", "QA", "Render", "Publish"] as const;

type Angle = {
  id: string;
  version: number;
  title: string;
  hook: string;
  promise: string;
  selected: boolean;
  scoreBreakdown: Record<string, unknown>;
};

type ScriptView = {
  id: string;
  version: number;
  title: string;
  hook: string;
  scriptText: string;
  status: string;
  estimatedDurationSeconds: number;
  factualClaims: FactualClaim[];
};

type ShotView = {
  id: string;
  sequenceNo: number;
  startSeconds: number;
  endSeconds: number;
  narration: string | null;
  onScreenText: string | null;
  visualDescription: string;
  assetStrategy: string;
};

type QaView = {
  checkType: string;
  result: string;
  severity: string;
  findings: { code: string; message: string }[];
};

export function StudioProjectClient({
  workspaceId,
  projectId,
  canWrite,
  canApprove,
  project,
  briefSummary,
  angles,
  scripts,
  shots,
  qa,
  approvalReadiness,
  snapshotHashes,
}: {
  workspaceId: string;
  projectId: string;
  canWrite: boolean;
  canApprove: boolean;
  project: {
    title: string;
    status: string;
    targetDurationSeconds: number;
    selectedAngleId: string | null;
  };
  briefSummary: string | null;
  angles: Angle[];
  scripts: ScriptView[];
  shots: ShotView[];
  qa: QaView[];
  approvalReadiness: {
    canApprove: boolean;
    message: string;
    missingChecks: string[];
    staleChecks: string[];
    blockingChecks: string[];
  };
  snapshotHashes: { id: string; decision: string; snapshotHash: string; decidedAt: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const latest = scripts[0] ?? null;
  const [restoreId, setRestoreId] = useState(scripts[1]?.id ?? "");

  const activeStep = useMemo(() => {
    if (project.status === "rendered" || project.status === "rendering") return 5;
    if (project.status === "approved_to_render") return 5;
    if (qa.length > 0) return 4;
    if (shots.length > 0) return 3;
    if (latest) return 2;
    if (project.selectedAngleId) return 2;
    if (angles.length > 0) return 1;
    return 0;
  }, [angles.length, latest, project.selectedAngleId, project.status, qa.length, shots.length]);

  async function call(
    path: string,
    init: RequestInit,
    success: string,
  ) {
    setBusy(path);
    try {
      const response = await fetch(path, init);
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? success);
      toast.success(success);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "요청이 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const latestAngles = angles.filter((angle) => angle.version === angles[0]?.version);

  return (
    <div className="space-y-6">
      <ol className="flex gap-1 overflow-x-auto text-[11px] font-mono">
        {steps.map((step, index) => (
          <li
            key={step}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1",
              index === activeStep
                ? "border-primary bg-primary/10 text-foreground"
                : index < activeStep
                  ? "border-success/40 text-success"
                  : "border-border text-muted-foreground",
            )}
          >
            {step}
          </li>
        ))}
      </ol>
      <p className="text-[12px] text-muted-foreground">
        Publish는 Phase 5입니다. 승인이 끝나면 Video Factory에서 합성합니다.
      </p>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-bold">Research</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {briefSummary ?? "연결된 Brief가 없습니다. Research에서 생성하면 인용 매핑에 쓰입니다."}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Angles</h2>
          <Button
            disabled={!canWrite || busy !== null || pending}
            onClick={() =>
              call(
                `/api/v1/workspaces/${workspaceId}/projects/${projectId}/angles`,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "idempotency-key": `angles-${crypto.randomUUID()}`,
                  },
                  body: "{}",
                },
                "서로 다른 Angle 3개를 만들었습니다",
              )
            }
          >
            3개 생성
          </Button>
        </div>
        {latestAngles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Angle이 없습니다.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {latestAngles.map((angle) => (
              <li
                key={angle.id}
                className={cn(
                  "rounded-2xl border p-4",
                  angle.selected ? "border-primary bg-primary/[0.06]" : "border-border/70 bg-card",
                )}
              >
                <p className="text-sm font-bold">{angle.title}</p>
                <p className="mt-2 text-[12px] text-muted-foreground">{angle.hook}</p>
                <p className="mt-2 text-[12px]">{angle.promise}</p>
                <Button
                  className="mt-3"
                  variant={angle.selected ? "secondary" : "outline"}
                  disabled={!canWrite || angle.selected}
                  onClick={() =>
                    call(
                      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/angles/${angle.id}/select`,
                      { method: "POST" },
                      "Angle을 선택했습니다. 이전 Script는 보존됩니다.",
                    )
                  }
                >
                  {angle.selected ? "선택됨" : "이 각도 사용"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Script</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canWrite || !project.selectedAngleId || busy !== null}
              onClick={() =>
                call(
                  `/api/v1/workspaces/${workspaceId}/projects/${projectId}/scripts`,
                  {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      "idempotency-key": `script-${crypto.randomUUID()}`,
                    },
                    body: "{}",
                  },
                  "새 Script 버전을 만들었습니다",
                )
              }
            >
              새 버전 생성
            </Button>
            {scripts.length > 1 ? (
              <>
                <select
                  className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                  value={restoreId}
                  onChange={(event) => setRestoreId(event.target.value)}
                >
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      v{script.version}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={!canWrite || !restoreId}
                  onClick={() =>
                    call(
                      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/scripts?restore=1`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ fromScriptId: restoreId }),
                      },
                      "이전 버전을 새 버전으로 복구했습니다",
                    )
                  }
                >
                  복구
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {!latest ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            선택한 Angle로 Script를 만드세요.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="font-mono text-[11px] text-muted-foreground">
                v{latest.version} · 추정 {latest.estimatedDurationSeconds}초 · 목표{" "}
                {project.targetDurationSeconds}초
              </p>
              <h3 className="mt-2 text-sm font-bold">{latest.title}</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{latest.scriptText}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <h3 className="text-sm font-bold">Claim · Citation</h3>
              <ul className="mt-3 space-y-2">
                {latest.factualClaims.length === 0 ? (
                  <li className="text-[12px] text-muted-foreground">사실 주장이 없습니다.</li>
                ) : (
                  latest.factualClaims.map((claim) => (
                    <li key={claim.claimKey} className="text-[12px]">
                      <span
                        className={cn(
                          "mr-2 rounded-full border px-2 py-0.5 font-mono text-[10px]",
                          claim.unverified
                            ? "border-primary/40 text-primary"
                            : "border-success/40 text-success",
                        )}
                      >
                        {claim.unverified ? "UNVERIFIED" : `cite ${claim.citationIndexes.join(",")}`}
                      </span>
                      {claim.statement}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Shots</h2>
          {latest ? (
            <Button
              variant="outline"
              disabled={!canWrite}
              onClick={() =>
                call(
                  `/api/v1/workspaces/${workspaceId}/scripts/${latest.id}/shots`,
                  { method: "POST" },
                  "Shot List를 다시 만들었습니다",
                )
              }
            >
              Shot List 생성
            </Button>
          ) : null}
        </div>
        {shots.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Script를 만들면 Shot이 함께 생깁니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shots.map((shot) => (
              <li key={shot.id} className="rounded-2xl border border-border/70 bg-card px-4 py-3">
                <p className="font-mono text-[11px] text-muted-foreground">
                  #{shot.sequenceNo} · {shot.startSeconds}–{shot.endSeconds}s · {shot.assetStrategy}
                </p>
                <p className="mt-1 text-sm">{shot.visualDescription}</p>
                {shot.onScreenText ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">화면: {shot.onScreenText}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">QA</h2>
          <Button
            disabled={!canWrite || !latest}
            onClick={() =>
              call(
                `/api/v1/workspaces/${workspaceId}/projects/${projectId}/qa`,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "idempotency-key": `qa-${crypto.randomUUID()}`,
                  },
                  body: JSON.stringify({ scriptId: latest?.id }),
                },
                "QA를 실행했습니다",
              )
            }
          >
            QA 실행
          </Button>
        </div>
        {qa.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">아직 QA 결과가 없습니다.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {qa.map((row) => (
              <li key={row.checkType} className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-sm font-bold">
                  {row.checkType}{" "}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {row.result} · {row.severity}
                  </span>
                </p>
                <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
                  {row.findings.map((finding) => (
                    <li key={finding.code}>{finding.message}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-bold">Reviewer 승인</h2>
        {!approvalReadiness.canApprove ? (
          <p className="mt-2 text-sm text-destructive">
            {approvalReadiness.message}
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-muted-foreground">
            승인 시 Script·Shot·QA의 스냅샷 해시를 저장합니다. 다음 단계는 Video Factory입니다.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={!canApprove || !approvalReadiness.canApprove || !latest}
            onClick={() =>
              call(
                `/api/v1/workspaces/${workspaceId}/projects/${projectId}/approval`,
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ decision: "approved", scriptId: latest?.id }),
                },
                "승인했고 스냅샷 해시를 저장했습니다",
              )
            }
          >
            승인
          </Button>
          <Button
            variant="outline"
            disabled={!canApprove || !latest}
            onClick={() =>
              call(
                `/api/v1/workspaces/${workspaceId}/projects/${projectId}/approval`,
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ decision: "rejected", scriptId: latest?.id }),
                },
                "반려했습니다",
              )
            }
          >
            반려
          </Button>
        </div>
        {snapshotHashes.length > 0 ? (
          <ul className="mt-4 space-y-1 font-mono text-[11px] text-muted-foreground">
            {snapshotHashes.map((row) => (
              <li key={row.id}>
                {row.decision} · {row.snapshotHash.slice(0, 16)}… · {row.decidedAt}
              </li>
            ))}
          </ul>
        ) : null}
        {project.status === "approved_to_render" ||
        project.status === "rendering" ||
        project.status === "rendered" ? (
          <p className="mt-4 text-sm">
            <Link href="/factory" className="font-semibold underline underline-offset-4">
              Video Factory에서 합성하기
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
