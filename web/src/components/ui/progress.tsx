import { cn } from "@/lib/ui";

export function Progress({ value, label = "변환 진행률", className }: { value: number; label?: string; className?: string }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const roundedPct = Math.round(pct);

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={roundedPct}
      aria-valuetext={`${label} · ${roundedPct}%`}
      data-testid="job-progress"
    >
      <div className="h-full rounded-full bg-teal-700 transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

