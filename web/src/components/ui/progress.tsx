import { cn } from "@/lib/ui";

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-teal-700 transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

