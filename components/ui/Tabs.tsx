"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: string;
}

/**
 * Underline tab strip. Overflows horizontally on narrow screens rather than
 * wrapping, so the strip never pushes the table down the page.
 */
export function Tabs({
  items,
  active,
  onChange,
  variant = "page",
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  /** `page` sits on a rule; `drawer` is compact and rule-less. */
  variant?: "page" | "drawer";
  className?: string;
}) {
  return (
    <nav
      role="tablist"
      className={cn(
        "flex overflow-x-auto scrollbar-none",
        variant === "page"
          ? "gap-6 border-b border-line"
          : "gap-5 border-b border-line px-5",
        className,
      )}
    >
      {items.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 border-transparent transition-colors duration-fast",
              variant === "page"
                ? "pb-4 pt-3 text-body"
                : "py-3 text-[13px]",
              on
                ? "border-primary font-semibold text-primary"
                : "font-medium text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
