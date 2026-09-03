import { cn } from "@/lib/utils";

export function Meter({
  value,
  className,
  barClassName,
  label,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-500", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
