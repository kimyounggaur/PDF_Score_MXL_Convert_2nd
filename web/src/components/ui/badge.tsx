import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "slate" | "blue" | "teal" | "rose" | "amber";
};

const tones = {
  slate: "border-[#BCC7D0] bg-[#F6F8FA] text-[#596873]",
  blue: "border-[#245C9E] bg-[#EEF3F8] text-[#173F6D]",
  teal: "border-[#245C9E] bg-[#245C9E] text-white",
  rose: "border-[#B1304A] bg-[#F9EAED] text-[#7A2033]",
  amber: "border-dashed border-[#596873] bg-white text-[#17232D]",
};

export function Badge({ className, tone = "slate", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex min-h-7 items-center rounded-[2px] border px-2.5 py-1 text-xs font-semibold tracking-[0.02em]", tones[tone], className)}
      {...props}
    />
  );
}

