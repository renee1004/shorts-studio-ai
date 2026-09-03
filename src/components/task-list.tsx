"use client";

import type { Task } from "@/lib/content";
import { useProgress } from "@/lib/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function TaskList({ tasks }: { tasks: Task[] }) {
  const { isDone, toggle, ready } = useProgress();

  if (!ready) {
    return (
      <ul className="space-y-3" aria-busy="true" aria-label="할 일 불러오는 중">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="h-24 animate-pulse rounded-xl border border-border/60 bg-card/60"
          />
        ))}
      </ul>
    );
  }

  return (
    <ol className="space-y-3">
      {tasks.map((task, index) => {
        const done = isDone(task.id);
        return (
          <li key={task.id}>
            <div
              className={cn(
                "group rounded-xl border p-4 transition-colors sm:p-5",
                done
                  ? "border-success/35 bg-success/[0.06]"
                  : "border-border/70 bg-card hover:border-border",
              )}
            >
              <div className="flex gap-3.5 sm:gap-4">
                <Checkbox
                  id={task.id}
                  checked={done}
                  onCheckedChange={() => toggle(task.id)}
                  className="mt-0.5 size-5 shrink-0 data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={task.id}
                    className={cn(
                      "block cursor-pointer text-balance-ko text-[15px] font-bold leading-snug",
                      done && "text-muted-foreground line-through decoration-success/50",
                    )}
                  >
                    <span className="mr-2 font-mono text-xs font-medium text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {task.title}
                  </label>
                  <p className="mt-2 text-balance-ko text-sm leading-relaxed text-muted-foreground">
                    {task.detail}
                  </p>
                  {task.where && (
                    <p className="mt-2.5 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-secondary/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      <span aria-hidden>↳</span>
                      {task.where}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
