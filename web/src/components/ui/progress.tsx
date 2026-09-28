import { cn } from "@/lib/ui";

export function Progress({
  value,
  label = "변환 진행률",
  className,
  testId = "job-progress",
}: {
  value: number;
  label?: string;
  className?: string;
  testId?: string;
}) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const roundedPct = Math.round(pct);

  return (
    <div
      className={cn("relative isolate h-10 w-full overflow-hidden border-x-2 border-[#596873] bg-white", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={roundedPct}
      aria-valuetext={`${label} · ${roundedPct}%`}
      data-testid={testId}
    >
      <div
        className="absolute inset-y-0 left-0 border-r-2 border-[#245C9E] bg-[#245C9E]/10 transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 top-2 bottom-2 z-10 flex flex-col justify-between" aria-hidden="true">
        <span className="h-px w-full bg-[#BCC7D0]" />
        <span className="h-px w-full bg-[#BCC7D0]" />
        <span className="h-px w-full bg-[#BCC7D0]" />
        <span className="h-px w-full bg-[#BCC7D0]" />
        <span className="h-px w-full bg-[#BCC7D0]" />
      </div>
    </div>
  );
}

