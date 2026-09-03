"use client";

import { prepItems } from "@/lib/content";
import { useProgress } from "@/lib/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PrepChecklist() {
  const { isDone, toggle, ready, prepDone } = useProgress();

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold sm:text-2xl">0단계. 준비물 (모두 무료)</h2>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {ready ? `${prepDone}/${prepItems.length}` : `0/${prepItems.length}`}
        </span>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {prepItems.map((item) => {
          const done = ready && isDone(item.id);
          return (
            <li key={item.id}>
              <div
                className={cn(
                  "flex h-full gap-3 rounded-xl border p-4 transition-colors",
                  done ? "border-success/35 bg-success/[0.06]" : "border-border/70 bg-card",
                )}
              >
                <Checkbox
                  id={item.id}
                  checked={done}
                  disabled={!ready}
                  onCheckedChange={() => toggle(item.id)}
                  className="mt-0.5 size-5 shrink-0 data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground"
                />
                <div className="min-w-0">
                  <label
                    htmlFor={item.id}
                    className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-bold"
                  >
                    {item.title}
                    <Badge
                      variant="outline"
                      className="border-primary/35 bg-primary/10 text-[10px] text-primary"
                    >
                      {item.cost}
                    </Badge>
                  </label>
                  <p className="mt-1.5 text-balance-ko text-[13px] leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
