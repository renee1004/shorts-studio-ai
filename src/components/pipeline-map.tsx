"use client";

import Link from "next/link";
import { steps } from "@/lib/content";
import { useProgress } from "@/lib/progress";
import { Meter } from "@/components/meter";
import { cn } from "@/lib/utils";

export function PipelineMap() {
  const { stepProgress, ready } = useProgress();

  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {steps.map((step) => {
        const { done, total, percent } = stepProgress(step.slug);
        const complete = ready && done === total;

        return (
          <li key={step.slug} className={cn(step.order === 5 && "md:col-span-2")}>
            <Link
              href={`/steps/${step.slug}`}
              className={cn(
                "group flex h-full flex-col rounded-2xl border p-5 transition-all",
                complete
                  ? "border-success/35 bg-success/[0.05]"
                  : "border-border/70 bg-card hover:-translate-y-0.5 hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-black",
                    complete
                      ? "bg-success text-success-foreground"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {complete ? "✓" : step.order}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-balance-ko text-[17px] font-bold leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    약 {step.minutes}분 · 할 일 {total}개
                  </p>
                </div>
              </div>

              <p className="mt-3.5 text-balance-ko text-sm font-medium text-foreground/85">
                {step.headline}
              </p>
              <p className="mt-2 flex-1 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                {step.summary}
              </p>

              <div className="mt-4 space-y-2">
                <Meter
                  value={ready ? percent : 0}
                  className="h-1.5"
                  barClassName={complete ? "bg-success" : undefined}
                  label={`${step.title} 진행률`}
                />
                <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                  <span>{ready ? `${done}/${total} 완료` : "불러오는 중"}</span>
                  <span className="text-primary transition-transform group-hover:translate-x-0.5">
                    열기 →
                  </span>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
