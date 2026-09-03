"use client";

import { steps } from "@/lib/content";
import { useProgress } from "@/lib/progress";
import { LinkButton } from "@/components/link-button";
import { Meter } from "@/components/meter";

export function OverallStatus() {
  const { overall, ready, stepProgress, storageBlocked } = useProgress();

  if (!ready) {
    return (
      <div
        className="h-32 animate-pulse rounded-2xl border border-border/70 bg-card/60"
        aria-busy="true"
        aria-label="진행 상황 불러오는 중"
      />
    );
  }

  const nextStep =
    steps.find((step) => {
      const { done, total } = stepProgress(step.slug);
      return done < total;
    }) ?? null;

  const started = overall.done > 0;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
            MY PROGRESS
          </p>
          <p className="mt-2 text-balance-ko text-lg font-bold sm:text-xl">
            {!started
              ? "아직 시작하지 않았습니다"
              : nextStep
                ? `다음은 ${nextStep.order}단계 · ${nextStep.title}`
                : "5단계를 모두 끝냈습니다"}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {!started
              ? "0단계 준비물부터 체크하면서 내려오세요."
              : nextStep
                ? `전체 할 일 ${overall.total}개 중 ${overall.done}개 완료`
                : "이제 캘린더의 다음 주제로 4단계부터 반복하면 됩니다."}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="font-mono text-3xl font-black tabular-nums">
              {overall.percent}
            </span>
            <span className="font-mono text-sm text-muted-foreground">%</span>
          </div>
          <LinkButton
            href={`/playbook/steps/${nextStep?.slug ?? steps[0]!.slug}`}
            variant={started ? "default" : "outline"}
          >
            {started ? "이어서 하기" : "둘러보기"}
          </LinkButton>
        </div>
      </div>

      <Meter value={overall.percent} className="mt-5 h-2" label="전체 진행률" />

      {storageBlocked && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-[13px] text-muted-foreground">
          브라우저 저장소를 쓸 수 없어서 체크가 유지되지 않습니다. 시크릿 모드이거나 저장소 접근이
          차단된 상태일 수 있습니다.
        </p>
      )}
    </div>
  );
}
