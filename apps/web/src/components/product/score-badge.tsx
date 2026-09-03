import { cn } from "@/lib/utils";

const bandLabels: Record<string, { label: string; tone: string }> = {
  PRODUCE_CANDIDATE: { label: "제작 후보", tone: "border-success/40 bg-success/10 text-success" },
  RESEARCH_MORE: { label: "데이터 보강", tone: "border-primary/40 bg-primary/10 text-primary" },
  WATCH: { label: "관찰", tone: "border-border bg-secondary/60 text-muted-foreground" },
  SKIP_CANDIDATE: { label: "보류", tone: "border-border bg-secondary/40 text-muted-foreground" },
  REJECT: { label: "제외", tone: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export function ScoreBadge({
  score,
  confidence,
  band,
}: {
  score: number | null;
  confidence: number | null;
  band: string | null;
}) {
  const meta = band ? bandLabels[band] : undefined;

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="text-right">
        <p className="font-mono text-lg font-black tabular-nums leading-none">
          {score === null ? "—" : score.toFixed(1)}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          신뢰도 {confidence === null ? "—" : Math.round(confidence)}
        </p>
      </div>
      <span
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] font-bold",
          meta?.tone ?? "border-border bg-secondary/50 text-muted-foreground",
        )}
      >
        {meta?.label ?? "점수 없음"}
      </span>
    </div>
  );
}
