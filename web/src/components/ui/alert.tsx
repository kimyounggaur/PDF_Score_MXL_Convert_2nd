import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui";

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "warning" | "error";
};

const tones = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-rose-200 bg-rose-50 text-rose-950",
};

export function Alert({ className, tone = "info", ...props }: AlertProps) {
  return <div className={cn("rounded-lg border px-4 py-3 text-sm leading-6", tones[tone], className)} {...props} />;
}

