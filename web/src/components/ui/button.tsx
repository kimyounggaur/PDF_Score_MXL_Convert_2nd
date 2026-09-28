import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/ui";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variants = {
  primary: "border-[#245C9E] bg-[#245C9E] text-white hover:border-[#17232D] hover:bg-[#17232D]",
  secondary: "border-[#596873] bg-white text-[#17232D] hover:border-[#245C9E] hover:bg-[#EEF3F8] hover:text-[#245C9E]",
  ghost: "border-transparent bg-transparent text-[#596873] hover:border-[#BCC7D0] hover:bg-white hover:text-[#17232D]",
  danger: "border-[#B1304A] bg-[#B1304A] text-white hover:border-[#7A2033] hover:bg-[#7A2033]",
};

const sizes = {
  sm: "min-h-11 px-3 py-2 text-sm",
  md: "min-h-11 px-4 py-2 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return <button ref={ref} className={buttonClassName({ variant, size, className })} {...props} />;
});

export function buttonClassName({
  className,
  variant = "primary",
  size = "md",
}: {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
} = {}) {
  return cn(
    "inline-flex min-w-11 items-center justify-center gap-2 rounded-[2px] border font-semibold tracking-[-0.01em] transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#245C9E] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 disabled:pointer-events-none disabled:border-[#BCC7D0] disabled:bg-[#E7ECEF] disabled:text-[#596873]",
    variants[variant],
    sizes[size],
    className,
  );
}

