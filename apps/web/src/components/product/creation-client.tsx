"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { creationInputSchema } from "@shorts-os/contracts";
import {
  creationRequest,
  CreationRequestUncertainError,
} from "@/lib/creation-request";
import { Button } from "@/components/ui/button";

export type CreationDetail = {
  project: { id: string; title: string };
  latestScript: { scriptText: string; modelName: string | null } | null;
  brief?: { modelName: string | null } | null;
  shots: unknown[];
};
const stages = [
  { key: "research", label: "자료 조사" },
  { key: "angles", label: "구성안 생성" },
  { key: "script", label: "대본·장면 구성" },
] as const;
export function CreationClient({
  workspaceId,
  canWrite,
  demo,
  initialProject,
  initialDetail,
  narrationEnabled,
}: {
  workspaceId: string;
  canWrite: boolean;
  demo: boolean;
  narrationEnabled: boolean;
  initialProject?: { id: string; title: string };
  initialDetail?: CreationDetail;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"topic" | "notes" | "script">(
    initialDetail?.latestScript?.modelName === "user-import"
      ? "script"
      : initialDetail?.brief?.modelName === "user-import"
        ? "notes"
        : "topic",
  );
  const [suppliedText, setSuppliedText] = useState("");
  const [topic, setTopic] = useState(initialProject?.title ?? "");
  const [started, setStarted] = useState(Boolean(initialProject));
  const [projectId, setProjectId] = useState<string | null>(
    initialProject?.id ?? null,
  );
  const [detail, setDetail] = useState<CreationDetail | null>(
    initialDetail ?? null,
  );
  const [completed, setCompleted] = useState<string[]>(
    initialDetail?.latestScript ? ["script"] : [],
  );
  const [active, setActive] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const operation = useRef<string | null>(null);
  const running = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [active]);
  function post<T>(path: string, body: unknown): Promise<T> {
    return creationRequest<T>(
      `/api/v1/workspaces/${workspaceId}/${path}`,
      body,
    );
  }
  async function start() {
    if (uncertain || running.current || !canWrite || topic.trim().length < 2)
      return;
    running.current = true;
    setError("");
    setElapsed(0);
    setActive("start");
    let id = projectId;
    try {
      operation.current ??= crypto.randomUUID();
      if (!id) {
        const parsed = creationInputSchema.safeParse({
          mode,
          suppliedText,
          topic: topic.trim(),
          operationId: operation.current,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
          return;
        }
        setStarted(true);
        const created = await post<CreationDetail>("creation", parsed.data);
        id = created.project.id;
        setProjectId(id);
        setDetail(created);
        window.history.replaceState(null, "", `/create?project=${id}`);
      }
      if (mode === "script") {
        setCompleted(["script"]);
        return;
      }
      for (const stage of stages.filter(
        (stage) => mode !== "notes" || stage.key !== "research",
      )) {
        setElapsed(0);
        setActive(stage.key);
        const result = await post<CreationDetail>(`projects/${id}/prepare`, {
          stage: stage.key,
        });
        setDetail(result);
        setCompleted((previous) => [...new Set([...previous, stage.key])]);
      }
    } catch (caught) {
      if (caught instanceof CreationRequestUncertainError) setUncertain(true);
      else if (!id) setStarted(false);
      setError(
        caught instanceof Error ? caught.message : "제작 중 문제가 생겼습니다.",
      );
    } finally {
      setActive(null);
      running.current = false;
    }
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-7 py-6">
      <header>
        <p className="text-sm font-semibold text-primary">새 영상 만들기</p>
        <h1 className="mt-2 text-3xl font-black">어떤 이야기를 만들까요?</h1>
        <p className="mt-3 text-muted-foreground">
          주제를 입력하면 자료 조사부터 대본과 장면 구성까지 이어서 준비합니다.
        </p>
      </header>
      {demo && (
        <p className="rounded-xl bg-secondary p-4 text-sm">
          체험 모드입니다. 예시 대본으로 흐름을 확인하며, 실제 AI 조사·음성
          생성·게시를 실행하지 않습니다.
        </p>
      )}
      <section className="space-y-4 rounded-2xl border bg-card p-6">
        {!initialProject && (
          <label className="block text-sm font-semibold">
            시작 방법
            <select
              className="mt-2 block w-full rounded-lg border bg-background p-3"
              value={mode}
              disabled={started || Boolean(active)}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="topic">주제만 입력 — 새로 조사하기</option>
              <option value="notes">정리 자료로 대본 만들기</option>
              <option value="script">
                완성 대본 가져오기 — AI 생성 없이 저장
              </option>
            </select>
          </label>
        )}
        {mode !== "topic" && (
          <label className="block text-sm font-semibold">
            {mode === "notes" ? "NotebookLM 등에서 정리한 자료" : "완성 대본"}
            <textarea
              className="mt-2 w-full rounded-lg border bg-background p-3"
              rows={8}
              value={suppliedText}
              maxLength={mode === "notes" ? 4000 : 12800}
              disabled={started || Boolean(active)}
              onChange={(event) => setSuppliedText(event.target.value)}
            />
            <span className="text-xs font-normal text-muted-foreground">
              {mode === "notes"
                ? "최대 4,000자. 새 조사는 생략하며 구성안·대본 생성에 API를 사용합니다. 음성은 저장 후 별도로 선택합니다."
                : "장면별 줄바꿈으로 2~16개 문단, 문단당 800자 이내. 문구를 다시 생성하지 않습니다. 음성은 저장 후 별도로 진행합니다."}
            </span>
          </label>
        )}
        <label htmlFor="creation-topic" className="block text-sm font-semibold">
          영상 주제
        </label>
        <textarea
          id="creation-topic"
          value={topic}
          disabled={Boolean(active) || started}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={200}
          rows={3}
          placeholder="예: 퇴근 후 10분 만에 책상 정리하는 방법"
          className="w-full resize-y rounded-xl border bg-background p-4"
        />
        <p className="text-sm text-muted-foreground">
          기본 설정: 한국어 · 45초 목표 · 세로 영상 · 게시 전 직접 검토
        </p>
        <Button
          onClick={start}
          disabled={
            uncertain ||
            !canWrite ||
            Boolean(active) ||
            topic.trim().length < 2 ||
            (!projectId && mode !== "topic" && !suppliedText.trim()) ||
            completed.includes("script")
          }
          className="w-full"
        >
          {active
            ? `준비 중… ${elapsed}초`
            : error
              ? "저장된 단계부터 다시 시도"
              : mode === "script"
                ? "대본 저장하기"
                : "제작 준비 시작"}
        </Button>
        {!canWrite && (
          <p className="text-sm">제작 권한이 있는 멤버만 시작할 수 있습니다.</p>
        )}
        {uncertain && (
          <Link
            className="block underline"
            href={projectId ? `/studio/${projectId}` : "/studio"}
          >
            저장된 작업 확인하기
          </Link>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
      {(active || projectId || error) && (
        <section aria-live="polite" className="rounded-2xl border p-6">
          <h2 className="font-bold">제작 진행 상황</h2>
          <ol className="mt-4 space-y-3">
            {stages.map((stage) => (
              <li key={stage.key} className="flex justify-between text-sm">
                <span>{stage.label}</span>
                <span>
                  {mode === "script" && stage.key !== "script"
                    ? "생략 · 완성 대본 사용"
                    : mode === "notes" && stage.key === "research"
                      ? "제공 자료 사용"
                      : completed.includes(stage.key)
                        ? "완료"
                        : active === stage.key
                          ? "진행 중"
                          : "대기"}
                </span>
              </li>
            ))}
            {narrationEnabled && (
              <li className="flex justify-between text-sm">
                <span>내레이션 생성</span>
                <span>
                  {voiceId
                    ? "완료"
                    : active === "narration"
                      ? "진행 중"
                      : "선택 사항 · 별도 실행"}
                </span>
              </li>
            )}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            화면을 닫으면 다음 단계는 진행되지 않습니다. 저장된 결과는 내
            작업함에서 확인할 수 있습니다.
          </p>
        </section>
      )}
      {completed.includes("script") && detail && (
        <section className="space-y-4 rounded-2xl border bg-card p-6">
          {voiceId && (
            <audio
              aria-label="생성된 내레이션"
              controls
              preload="none"
              src={`/api/v1/workspaces/${workspaceId}/assets/${voiceId}/file`}
            />
          )}
          {narrationEnabled && !voiceId && (
            <Button
              disabled={!canWrite || Boolean(active) || uncertain}
              onClick={async () => {
                if (!canWrite || uncertain || !projectId || running.current)
                  return;
                running.current = true;
                setElapsed(0);
                setActive("narration");
                setError("");
                try {
                  const voice = await post<{ assetId: string }>(
                    `projects/${projectId}/narration`,
                    {},
                  );
                  setVoiceId(voice.assetId);
                } catch (caught) {
                  if (caught instanceof CreationRequestUncertainError)
                    setUncertain(true);
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "음성을 생성하지 못했습니다.",
                  );
                } finally {
                  running.current = false;
                  setActive(null);
                }
              }}
            >
              내레이션 생성하기 · API 사용
            </Button>
          )}
          <h2 className="text-xl font-bold">대본과 장면 구성이 준비됐어요</h2>
          <p className="text-sm">
            장면 {detail.shots.length}개 ·{" "}
            {mode === "script"
              ? "입력한 대본을 저장했습니다. 장면 시간은 균등 배분된 초안이므로 검토해 주세요."
              : "구성안 3개 중 첫 번째를 기본 적용했습니다. 검토 화면에서 바꿀 수 있습니다."}
          </p>
          <Link
            className="inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground"
            href={`/studio/${detail.project.id}`}
          >
            대본 확인·수정하기
          </Link>
          <p className="text-sm text-muted-foreground">
            사실관계와 출처를 확인한 뒤 승인해 주세요. 지금은 완성 영상이 아닌
            제작 초안입니다.
          </p>
        </section>
      )}
      <section className="rounded-2xl border border-dashed p-6">
        <h2 className="font-bold">영상 완성까지 남은 연결</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          음성 생성은 Gemini 음성 모델 연결 후 사용할 수 있습니다. 스톡 영상
          자동 수집과 YouTube 자동 게시는 아직 연결되지 않았습니다. 현재 영상
          합성은 직접 올린 클립 또는 임시 화면을 이용합니다.
        </p>
        <Link href="/factory" className="mt-3 inline-block text-sm underline">
          영상 합성 작업 열기
        </Link>
      </section>
      <div className="flex gap-5 text-sm">
        <Link href="/studio" className="underline">
          내 작업함
        </Link>
        <Link href="/settings" className="underline">
          기본 설정
        </Link>
        {started && !active && !uncertain && (
          <button
            className="underline"
            onClick={() => {
              router.push("/create");
              operation.current = null;
              setStarted(false);
              setVoiceId(null);
              setProjectId(null);
              setDetail(null);
              setCompleted([]);
              setError("");
              setTopic("");
              setSuppliedText("");
            }}
          >
            새 주제로 시작
          </button>
        )}
      </div>
    </div>
  );
}
