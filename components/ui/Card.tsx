import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/lib/icons";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-card shadow-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card header with a title on the left and an optional action on the right. */
export function CardHead({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-5 py-4",
        className,
      )}
    >
      <h2 className="text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
      {action}
    </div>
  );
}

/** Uppercase eyebrow that heads every detail section. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
      {children}
    </p>
  );
}

export function Empty({
  heading,
  message,
  icon = "search",
  action,
}: {
  heading: string;
  message?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-btn bg-surface text-ink-3">
        <Icon name={icon} size={24} />
      </div>
      <p className="mb-2 font-semibold">{heading}</p>
      {message && <p className="mb-5 text-ink-2">{message}</p>}
      {action}
    </div>
  );
}
