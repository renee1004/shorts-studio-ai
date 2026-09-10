"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Detail = {
  project: { id: string; title: string };
  latestScript: { body: string } | null;
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
  narrationEnabled,
}: {
  workspaceId: string;
  canWrite: boolean;
  demo: boolean;
  narrationEnabled: boolean;
  initialProject?: { id: string; title: string };
}) {
  const [topic, setTopic] = useState(initialProject?.title ?? "");
  const [started, setStarted] = useState(Boolean(initialProject));
  const [projectId, setProjectId] = useState<string | null>(
    initialProject?.id ?? null,
  );
  const [detail, setDetail] = useState<Detail | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const operation = useRef<string | null>(null);
  const running = useRef(false);
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/v1/workspaces/${workspaceId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.data)
      throw new Error(
        result.error?.message ?? "처리하지 못했습니다. 다시 시도해 주세요.",
      );
    return result.data as T;
  }
  async function start() {
    if (running.current || !canWrite || topic.trim().length < 2) return;
    running.current = true;
    setError("");
    setActive("start");
    try {
      operation.current ??= crypto.randomUUID();
      setStarted(true);
      let id = projectId;
      if (!id) {
        const created = await post<{ project: { id: string } }>("creation", {
          topic: topic.trim(),
          operationId: operation.current,
        });
        id = created.project.id;
        setProjectId(id);
      }
      for (const stage of stages) {
        setActive(stage.key);
        const result = await post<Detail>(`projects/${id}/prepare`, {
          stage: stage.key,
        });
        setDetail(result);
        setCompleted((previous) => [...new Set([...previous, stage.key])]);
      }
      if (narrationEnabled) {
        setActive("narration");
        const voice = await post<{ assetId: string }>(
          `projects/${id}/narration`,
          {},
        );
        setVoiceId(voice.assetId);
      }
    } catch (caught) {
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
            !canWrite ||
            Boolean(active) ||
            topic.trim().length < 2 ||
            (completed.includes("script") &&
              (!narrationEnabled || Boolean(voiceId)))
          }
          className="w-full"
        >
          {active
            ? "준비 중…"
            : error
              ? "저장된 단계부터 다시 시도"
              : "제작 준비 시작"}
        </Button>
        {!canWrite && (
          <p className="text-sm">제작 권한이 있는 멤버만 시작할 수 있습니다.</p>
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
                  {completed.includes(stage.key)
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
                      : "대기"}
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
          <h2 className="text-xl font-bold">대본과 장면 구성이 준비됐어요</h2>
          <p className="text-sm">
            장면 {detail.shots.length}개 · 구성안 3개 중 첫 번째를 기본
            적용했습니다. 검토 화면에서 바꿀 수 있습니다.
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
        {started && !active && (
          <button
            className="underline"
            onClick={() => {
              operation.current = null;
              setStarted(false);
              setVoiceId(null);
              setProjectId(null);
              setDetail(null);
              setCompleted([]);
              setError("");
              setTopic("");
            }}
          >
            새 주제로 시작
          </button>
        )}
      </div>
    </div>
  );
}
