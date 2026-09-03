"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VideoRow = {
  id: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  importSource: "manual" | "discovery";
  transcriptProvided: boolean;
};

type PatternRow = {
  id: string;
  name: string;
  patternType: string;
  referenceVideoId: string | null;
  transcriptIncluded: boolean;
  evidence: { evidenceType: string; field: string; note: string }[];
  hookCategory: string;
  createdAt: string;
};

export function DnaLibraryClient({
  workspaceId,
  canWrite,
  videos,
  patterns,
}: {
  workspaceId: string;
  canWrite: boolean;
  videos: VideoRow[];
  patterns: PatternRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("https://www.youtube.com/watch?v=dQw4w9wgGcQ");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function importVideo() {
    setBusy("import");
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/reference-videos/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `import-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          url,
          ...(transcript.trim() ? { transcript: transcript.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "가져오기에 실패했습니다.");
      toast.success("참고 영상을 가져왔습니다", {
        description: transcript.trim()
          ? "사용자 제공 대본이 표시됩니다."
          : "대본은 없습니다. 분석이 대본을 봤다고 주장하지 않습니다.",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "가져오기에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function analyze(id: string) {
    setBusy(id);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/reference-videos/${id}/analyze`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `dna-${id}-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({ forceRefresh: false }),
        },
      );
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "분석에 실패했습니다.");
      toast.success("구조 패턴을 만들었습니다");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "분석에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-bold">YouTube URL 가져오기</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Demo Mode는 공개 메타데이터만 만듭니다. 대본을 붙여넣지 않으면 분석이 대본을 사용하지
          않습니다.
        </p>
        <label className="mt-4 block text-[12px] font-semibold" htmlFor="yt-url">
          URL
        </label>
        <input
          id="yt-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <label className="mt-3 block text-[12px] font-semibold" htmlFor="yt-transcript">
          사용자 제공 대본 (선택)
        </label>
        <textarea
          id="yt-transcript"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={4}
          placeholder="없으면 비워 두세요. 모델이 대본을 봤다고 표시하지 않습니다."
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <Button className="mt-3" disabled={!canWrite || pending || busy === "import"} onClick={importVideo}>
          {busy === "import" ? "가져오는 중" : "가져오기"}
        </Button>
      </section>

      <section>
        <h2 className="text-lg font-bold">참고 영상</h2>
        {videos.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            가져온 영상이나 수집된 참고 영상이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {videos.map((video) => (
              <li
                key={video.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{video.title}</p>
                  <p className="mt-1 flex flex-wrap gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>{video.importSource === "manual" ? "수동 Import" : "수집"}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5",
                        video.transcriptProvided
                          ? "border-success/40 text-success"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {video.transcriptProvided ? "사용자 대본 있음" : "대본 없음"}
                    </span>
                    {video.durationSeconds !== null ? <span>{video.durationSeconds}s</span> : null}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!canWrite || busy === video.id}
                  onClick={() => analyze(video.id)}
                >
                  {busy === video.id ? "분석 중" : "구조 분석"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">구조 패턴</h2>
        {patterns.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            아직 분석된 패턴이 없습니다. 영상을 가져와 구조 분석을 실행하세요.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {patterns.map((pattern) => (
              <li key={pattern.id} className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-sm font-bold">{pattern.name}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {pattern.patternType} · {pattern.hookCategory}
                </p>
                <p
                  className={cn(
                    "mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold",
                    pattern.transcriptIncluded
                      ? "border-success/40 text-success"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {pattern.transcriptIncluded ? "대본 입력됨" : "공개 메타데이터만 사용"}
                </p>
                <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
                  {pattern.evidence.map((item) => (
                    <li key={`${item.evidenceType}-${item.field}`}>
                      <span className="font-mono text-[10px]">{item.evidenceType}</span> · {item.note}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
