"use client";

import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";

/**
 * The table header deliberately does NOT stick. `.table-wrap` is a horizontal
 * scroll container and the topbar already sticks in the same vertical flow —
 * pinning the thead makes it detach and float over row 1.
 */
export function TableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-t-card", className)}>
      {children}
    </div>
  );
}

export function Table({
  compact,
  children,
  className,
}: {
  compact?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <table
      data-compact={compact ? "true" : undefined}
      className={cn("w-full text-body", className)}
    >
      {children}
    </table>
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "right" | "center";
  sortable?: boolean;
  sorted?: "asc" | "desc" | false;
}

export function Th({
  align,
  sortable,
  sorted,
  className,
  children,
  ...rest
}: ThProps) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-line bg-surface px-4 py-3 text-cap font-semibold tracking-[0.02em] text-ink-2",
        "first:rounded-tl-card last:rounded-tr-card",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        sortable && "cursor-pointer select-none hover:text-ink",
        sorted && "text-primary",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "flex items-center gap-1",
          align === "right" && "justify-end",
          align === "center" && "justify-center",
        )}
      >
        {children}
        {sortable && (
          <Icon
            name={sorted === "asc" ? "arrowUp" : sorted === "desc" ? "arrowDown" : "sort"}
            size={13}
            className={sorted ? "opacity-100" : "opacity-45"}
          />
        )}
      </span>
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: "right" | "center";
  muted?: boolean;
}

export function Td({ align, muted, className, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        "border-b border-line px-4 py-3 align-middle group-data-[compact=true]/t:py-2",
        align === "right" && "text-right tnum",
        align === "center" && "text-center",
        muted && "text-ink-2",
        className,
      )}
      {...rest}
    />
  );
}

export function Tr({
  selected,
  clickable,
  className,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement> & {
  selected?: boolean;
  clickable?: boolean;
}) {
  return (
    <tr
      className={cn(
        "transition-colors duration-fast last:[&>td]:border-b-0",
        clickable && "cursor-pointer",
        selected ? "bg-primary-soft" : clickable && "hover:bg-surface",
        className,
      )}
      {...rest}
    />
  );
}

/** Emoji / initials square shown beside a code in the first column. */
export function Thumb({
  children,
  size = 34,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.44 }}
      className="grid flex-shrink-0 place-items-center rounded-lg border border-line bg-surface"
    >
      {children}
    </span>
  );
}

/** First-column media cell: thumb + text stacked to the right. */
export function CellMedia({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-3">{children}</span>;
}

/** Secondary line under a primary cell value (Thai name under English). */
export function CellSub({ children }: { children: ReactNode }) {
  return <span className="mt-px block text-cap text-ink-3">{children}</span>;
}

/** Percentage + bar, used for utilisation and receiving progress. */
export function UtilBar({ pct, tone }: { pct: number; tone?: "mid" | "high" | "full" }) {
  const fill =
    tone === "full"
      ? "bg-success"
      : tone === "high"
        ? "bg-danger"
        : tone === "mid"
          ? "bg-warning"
          : "bg-success";
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="min-w-[34px] text-right tnum">{pct}%</span>
      <span className="h-[5px] w-16 overflow-hidden rounded-pill bg-neutral-soft">
        <span
          className={cn("block h-full rounded-pill", fill)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
    </span>
  );
}
