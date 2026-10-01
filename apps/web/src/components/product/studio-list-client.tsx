"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Eligible = {
  id: string;
  title: string;
  briefId: string | null;
};

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  targetDurationSeconds: number;
  updatedAt: string;
};

export function StudioListClient({
  workspaceId,
  canWrite,
  projects,
  eligible,
}: {
  workspaceId: string;
  canWrite: boolean;
  projects: ProjectRow[];
  eligible: Eligible[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topicId, setTopicId] = useState(eligible[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function createProject() {
    if (!topicId) return;
    setBusy(true);
    try {
      const selected = eligible.find((row) => row.id === topicId);
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/projects`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topicId,
            ...(selected?.briefId ? { researchBriefId: selected.briefId } : {}),
            targetLanguage: "ko",
            targetDurationSeconds: 45,
          }),
        },
      );
      const payload = (await response.json()) as {
        data?: { project: { id: string } };
        error?: { message: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "프로젝트를 만들지 못했습니다.",
        );
      }
      toast.success("Content Studio 프로젝트를 만들었습니다");
      startTransition(() => router.push(`/studio/${payload.data!.project.id}`));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "프로젝트 생성 실패",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/create"
        className="inline-block rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
      >
        + 새 영상 만들기
      </Link>
      <details className="rounded-2xl border border-border/70 bg-card p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          고급: 조사한 주제로 시작
        </summary>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Topic Radar에서 주제를 승인한 뒤 Research Brief를 만들면 여기 목록에
          나타납니다.
        </p>
        {eligible.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            아직 승인한 주제가 없습니다.{" "}
            <Link href="/radar/topics" className="underline">
              Topic Radar
            </Link>
            에서 승인하세요.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-[12px] font-semibold">
              주제
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
              >
                {eligible.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                    {row.briefId ? "" : " · Brief 없음"}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={!canWrite || busy || pending}
              onClick={createProject}
            >
              {busy ? "만드는 중" : "프로젝트 만들기"}
            </Button>
          </div>
        )}
      </details>

      <section>
        <h2 className="text-lg font-bold">저장한 작업</h2>
        {projects.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            아직 저장한 작업이 없어요. 위의 ‘새 영상 만들기’로 시작해 보세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/studio/${project.id}`}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-4 py-3 hover:bg-secondary/40"
                >
                  <div>
                    <p className="text-sm font-semibold">{project.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {(
                        {
                          draft: "대본 준비 중",
                          research_ready: "자료 준비됨",
                          script_ready: "대본 준비됨",
                          approved: "승인 완료",
                          rendered: "영상 완성",
                        } as Record<string, string>
                      )[project.status] ?? "작업 중"}{" "}
                      · {project.targetDurationSeconds}초
                    </p>
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    열기
                  </span>
                </Link>
                {["draft", "research_ready"].includes(project.status) && (
                  <Link
                    href={`/create?project=${project.id}`}
                    className="mt-1 inline-block px-4 py-2 text-sm underline"
                  >
                    대본 준비 이어하기
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
