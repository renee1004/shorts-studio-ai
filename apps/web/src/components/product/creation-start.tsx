import Link from "next/link";
import { CreationSteps } from "./creation-steps";

export function CreationStart({
  onChoose,
}: {
  onChoose: (mode: "script" | "notes" | "topic") => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-primary">새 영상 만들기</p>
        <h1 className="text-3xl font-bold sm:text-4xl">
          대본부터 준비해 볼까요?
        </h1>
        <p className="text-muted-foreground">
          준비한 대본을 가져오면 다음 단계를 안내해 드려요.
        </p>
      </header>
      <CreationSteps />
      <section className="grid gap-4 sm:grid-cols-2" aria-label="시작 방법">
        <Link
          href="/import/notebooklm"
          className="group flex min-h-48 flex-col justify-between rounded-2xl border-2 border-primary bg-primary/5 p-6 transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div>
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              추천
            </span>
            <h2 className="mt-5 text-xl font-bold">NotebookLM에서 가져오기</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              저장해 둔 노트나 대본을 선택하세요.
            </p>
          </div>
          <span className="mt-6 font-semibold text-primary">
            노트북 선택하기 →
          </span>
        </Link>
        <button
          type="button"
          onClick={() => onChoose("script")}
          className="flex min-h-48 flex-col justify-between rounded-2xl border bg-card p-6 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div>
            <h2 className="text-xl font-bold">대본 직접 붙여넣기</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              복사해 둔 대본으로 시작하세요.
            </p>
          </div>
          <span className="mt-6 font-semibold">대본 입력하기 →</span>
        </button>
      </section>
      <Link
        href="/studio"
        className="flex items-center justify-between rounded-2xl border p-5 hover:bg-muted"
      >
        <span>
          <span className="block font-semibold">이어서 작업하기</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            전에 저장한 영상을 열어보세요.
          </span>
        </span>
        <span aria-hidden>→</span>
      </Link>
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          대본이 아직 없나요?
        </summary>
        <p className="my-3 text-muted-foreground">
          AI로 새 대본을 만들 수 있어요. 실행 시 API 비용이 발생할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-lg border px-4 py-3 hover:bg-muted"
            onClick={() => onChoose("notes")}
          >
            정리한 자료로 만들기
          </button>
          <button
            type="button"
            className="rounded-lg border px-4 py-3 hover:bg-muted"
            onClick={() => onChoose("topic")}
          >
            주제부터 조사하기
          </button>
        </div>
      </details>
    </div>
  );
}
