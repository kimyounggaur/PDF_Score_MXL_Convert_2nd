import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "slate" | "blue" | "teal" | "rose" | "amber";
};

const tones = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-sky-100 text-sky-800",
  teal: "bg-teal-100 text-teal-800",
  rose: "bg-rose-100 text-rose-800",
  amber: "bg-amber-100 text-amber-800",
};

export function Badge({ className, tone = "slate", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}

