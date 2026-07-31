import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/types";

const TONE: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info-text",
  neutral: "bg-neutral-soft text-neutral-text",
  primary: "bg-primary-soft text-primary-active",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill px-[9px] py-[3px] text-cap font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small counter chip used on the notification bell. */
export function DotBadge({ children }: { children: ReactNode }) {
  return (
    <span className="absolute right-[5px] top-[5px] grid h-4 min-w-4 place-items-center rounded-pill border-2 border-card bg-danger px-1 text-[10px] font-semibold text-white">
      {children}
    </span>
  );
}
