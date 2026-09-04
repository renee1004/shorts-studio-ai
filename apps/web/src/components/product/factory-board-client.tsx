"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type JobCard = {
  id: string;
  projectId: string;
  projectTitle: string;
  version: number;
  status: string;
  checksum: string | null;
  errorMessage: string | null;
  durationSeconds: number | null;
  shotCount: number;
  createdAt: string;
};

const columns: { key: keyof Board["columns"]; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
  { key: "failed", label: "Failed" },
  { key: "approved", label: "Approved" },
];

type Board = {
  capabilities: {
    provider: string;
    mode: string;
    videoClips: boolean;
    textInFootage: boolean;
    requirement: string | null;
  };
  readyProjects: { id: string; title: string; status: string }[];
  columns: Record<"queued" | "generating" | "ready" | "failed" | "approved", JobCard[]>;
};

export function FactoryBoardClient({
  workspaceId,
  canWrite,
  board,
}: {
  workspaceId: string;
  canWrite: boolean;
  board: Board;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function startRender(projectId: string) {
    setBusy(projectId);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/render`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `render-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({ allowPlaceholder: true, width: 1080, height: 1920, fps: 30 }),
        },
      );
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "렌더 실패");
      toast.success("렌더를 큐에 넣었습니다. Worker가 이어서 합성합니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "렌더 요청이 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-bold">생성 Capability</h2>
        <p className="mt-2 font-mono text-[12px] text-muted-foreground">
          {board.capabilities.provider} · {board.capabilities.mode} · 글자 인-푸티지{" "}
          {board.capabilities.textInFootage ? "허용" : "금지 (후반 자막)"}
        </p>
        {board.capabilities.requirement ? (
          <p className="mt-2 text-sm text-muted-foreground">{board.capabilities.requirement}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Demo Mock은 단색 클립만 만듭니다. 업로드한 클립이 있으면 그걸 쓰고, 자막은 FFmpeg가
            나중에 태웁니다.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">렌더 대기 프로젝트</h2>
        {board.readyProjects.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            Reviewer가 승인한 프로젝트가 없습니다. Content Studio에서 QA 승인을 먼저 하세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {board.readyProjects.map((project) => (
              <li
                key={project.id}
                className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold">{project.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{project.status}</p>
                </div>
                <Button
                  disabled={!canWrite || busy === project.id}
                  onClick={() => startRender(project.id)}
                >
                  Placeholder로 렌더
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {columns.map((column) => (
          <div key={column.key} className="rounded-2xl border border-border/70 bg-card p-3">
            <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              {column.label}
            </p>
            {board.columns[column.key].length === 0 ? (
              <p className="mt-6 text-center text-[12px] text-muted-foreground">비어 있음</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {board.columns[column.key].map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/factory/${job.id}`}
                      className="block rounded-xl border border-border/60 p-3 hover:bg-secondary"
                    >
                      <p className="text-sm font-semibold">{job.projectTitle}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        v{job.version} · {job.shotCount} shots · {job.status}
                      </p>
                      {job.errorMessage ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                          {job.errorMessage}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
