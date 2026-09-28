import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui";

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "warning" | "error";
};

const tones = {
  info: "border-[#245C9E] bg-[#EEF3F8] text-[#17232D]",
  warning: "border-[#596873] bg-[#F6F8FA] text-[#17232D]",
  error: "border-[#B1304A] bg-[#F9EAED] text-[#17232D]",
};

export function Alert({ className, tone = "info", ...props }: AlertProps) {
  return <div className={cn("rounded-[2px] border border-l-4 px-4 py-3 text-sm leading-6 shadow-none", tones[tone], className)} {...props} />;
}

