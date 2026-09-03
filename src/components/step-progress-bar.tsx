"use client";

import { useProgress } from "@/lib/progress";
import { Meter } from "@/components/meter";

export function StepProgressBar({ slug }: { slug: string }) {
  const { stepProgress, ready } = useProgress();
  const { done, total, percent } = stepProgress(slug);
  const complete = ready && done === total;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card px-5 py-4">
      <Meter
        value={ready ? percent : 0}
        className="h-2 flex-1"
        barClassName={complete ? "bg-success" : undefined}
        label="이 단계 진행률"
      />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {ready ? `${done}/${total}` : `0/${total}`}
      </span>
      {complete && (
        <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
          단계 완료
        </span>
      )}
    </div>
  );
}
