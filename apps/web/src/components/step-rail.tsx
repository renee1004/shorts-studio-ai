"use client";

import Link from "next/link";
import { steps } from "@/lib/content";
import { useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export function StepRail({ activeSlug }: { activeSlug: string }) {
  const { stepProgress, ready } = useProgress();

  return (
    <nav aria-label="단계 목록" className="lg:sticky lg:top-24">
      <p className="mb-3 hidden font-mono text-[11px] tracking-widest text-muted-foreground lg:block">
        5 STEPS
      </p>
      <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0">
        {steps.map((step) => {
          const active = step.slug === activeSlug;
          const { done, total, percent } = stepProgress(step.slug);
          const complete = ready && done === total;

          return (
            <li key={step.slug} className="shrink-0 lg:shrink">
              <Link
                href={`/playbook/steps/${step.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors lg:w-full",
                  active
                    ? "border-primary/45 bg-primary/10"
                    : "border-transparent hover:border-border/70 hover:bg-card",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold",
                    complete
                      ? "bg-success text-success-foreground"
                      : active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {complete ? "✓" : step.order}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block whitespace-nowrap text-sm font-semibold lg:whitespace-normal",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  <span className="hidden font-mono text-[11px] text-muted-foreground lg:block">
                    {ready ? `${done}/${total} · ${percent}%` : `0/${total}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
