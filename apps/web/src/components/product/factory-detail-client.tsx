"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Detail = {
  job: {
    id: string;
    version: number;
    status: string;
    checksum: string | null;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    loudnessLufs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    outputAssetId: string | null;
    probe: unknown;
  };
  project: { id: string; title: string; status: string };
  manifest: {
    captionsInPost: boolean;
    shots: {
      shotId: string;
      sequenceNo: number;
      durationSeconds: number;
      onScreenText: string;
      strategy: string;
      clipChecksum: string | null;
      execution: {
        status: "pending" | "succeeded" | "failed" | "reused";
        assetId: string | null;
        error: string | null;
      };
    }[];
  };
  approval: { decision: string; snapshotHash: string; decidedAt: string } | null;
};

export function FactoryDetailClient({
  workspaceId,
  renderId,
  canWrite,
  canApprove,
  detail,
}: {
  workspaceId: string;
  renderId: string;
  canWrite: boolean;
  canApprove: boolean;
  detail: Detail;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const generating = detail.job.status === "queued" || detail.job.status === "running";

  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => startTransition(() => router.refresh()), 2500);
    return () => window.clearInterval(timer);
  }, [generating, router, startTransition]);

  const [busy, setBusy] = useState<string | null>(null);
  const [retryShots, setRetryShots] = useState<string[]>([]);

  async function post(path: string, body: unknown, success: string, extra?: HeadersInit) {
    setBusy(path);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...extra },
        body: JSON.stringify(body),
      });
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

  async function uploadShot(shotId: string, file: File) {
    const path = `/api/v1/workspaces/${workspaceId}/projects/${detail.project.id}/shots/${shotId}/asset`;
    setBusy(path);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(path, { method: "POST", body: form });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "업로드에 실패했습니다.");
      toast.success("Shot 영상을 업로드했습니다. 새 Render에서 사용됩니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "업로드가 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const previewUrl = detail.job.outputAssetId
    ? `/api/v1/workspaces/${workspaceId}/assets/${detail.job.outputAssetId}/file`
    : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link href="/factory" className="underline underline-offset-4">
          Video Factory
        </Link>
        <span className="mx-2">/</span>
        {detail.project.title}
      </p>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-black">
          {previewUrl && detail.job.status === "succeeded" ? (
            <video
              className="mx-auto aspect-[9/16] h-auto max-h-[70vh] w-full bg-black object-contain"
              src={previewUrl}
              controls
              playsInline
            />
          ) : (
            <div className="flex aspect-[9/16] max-h-[70vh] items-center justify-center px-6 text-center text-sm text-zinc-400">
              {generating
                ? "합성 중입니다. 이 화면은 자동으로 새로고침됩니다."
                : detail.job.errorMessage ?? "아직 미리보기가 없습니다."}
            </div>
          )}
        </div>
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
          <p className="font-mono text-[11px] text-muted-foreground">
            v{detail.job.version} · {detail.job.status}
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Checksum</dt>
              <dd className="break-all font-mono text-[11px]">{detail.job.checksum ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">길이 / 해상도</dt>
              <dd className="font-mono text-[12px]">
                {detail.job.durationSeconds ?? "—"}s · {detail.job.width}×{detail.job.height}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Loudness</dt>
              <dd className="font-mono text-[12px]">
                {detail.job.loudnessLufs === null ? "측정 불가" : `${detail.job.loudnessLufs} LUFS`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">자막</dt>
              <dd className="text-[12px]">
                {detail.manifest.captionsInPost
                  ? "후반 합성 (AI 푸티지에 글자를 넣지 않음)"
                  : "없음"}
              </dd>
            </div>
          </dl>
          {detail.approval ? (
            <p className="text-[12px] text-success">
              Render 승인됨 · {detail.approval.snapshotHash.slice(0, 16)}…
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canApprove || detail.job.status !== "succeeded"}
              onClick={() =>
                post(
                  `/api/v1/workspaces/${workspaceId}/renders/${renderId}/approve`,
                  {},
                  "이 Render checksum을 승인했습니다",
                )
              }
            >
              Render 승인
            </Button>
            <Button
              variant="outline"
              disabled={
                !canWrite ||
                detail.job.status !== "failed" ||
                busy !== null ||
                retryShots.length === 0
              }
              onClick={() =>
                post(
                  `/api/v1/workspaces/${workspaceId}/renders/${renderId}/retry`,
                  { shotIds: retryShots },
                  "선택한 Shot만 다시 큐에 넣었습니다",
                  { "idempotency-key": `retry-${crypto.randomUUID()}` },
                )
              }
            >
              선택 Shot 재시도 ({retryShots.length})
            </Button>
          </div>
          {detail.job.errorMessage ? (
            <p className="text-sm text-destructive">{detail.job.errorMessage}</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Shot 매니페스트</h2>
        <ul className="mt-3 space-y-2">
          {detail.manifest.shots.map((shot) => (
            <li key={shot.shotId} className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={retryShots.includes(shot.shotId)}
                    disabled={detail.job.status !== "failed"}
                    onChange={(event) =>
                      setRetryShots((current) =>
                        event.target.checked
                          ? [...current, shot.shotId]
                          : current.filter((id) => id !== shot.shotId),
                      )
                    }
                  />
                  {shot.sequenceNo}. {shot.onScreenText}
                </label>
                <label className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                  Shot 영상 업로드
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="sr-only"
                    disabled={!canWrite || busy !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadShot(shot.shotId, file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {shot.durationSeconds}s · {shot.strategy} · {shot.execution.status}
                {shot.clipChecksum ? ` · ${shot.clipChecksum.slice(0, 12)}…` : ""}
              </p>
              {shot.execution.error ? (
                <p className="mt-1 text-xs text-destructive">{shot.execution.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
