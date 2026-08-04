import type { ReactNode } from "react";
import { actingUserName } from "@/lib/domain/admin";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/lib/icons";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   Shared building blocks for form schemas. Everything here is
   presentation or plumbing that repeats across entities — never
   business logic, which stays in lib/domain and lib/workflows.
   ============================================================ */

/** Whoever is filling the form in. Read per call so switching account
 *  changes who the next document says created it. */
export const FORM_USER = () => actingUserName();

/** Spread an `as const` option list into the mutable array a field wants. */
export const opts = (list: readonly string[]) => [...list];

/** The three things every successful save does, in the same order. */
export function saved(
  ctx: ActionCtx,
  o: { title: string; message: string; goto: string },
) {
  ctx.refresh();
  ctx.toast(o.title, o.message, "success");
  ctx.goto(o.goto);
}

/**
 * Create-vs-edit marker, set by blank() and toState(). Schemas use it to swap a
 * key field between an editable input and a read-only display, since a record's
 * code must not change once documents reference it.
 */
export const isCreate = (s: { _mode?: string }) => s._mode === "create";

/* ---------- Right-rail cards ---------- */

/** Generic rail card. Titled section with an icon, matching the detail aside. */
export function RailCard({
  icon,
  title,
  tone = "default",
  children,
}: {
  icon: IconName;
  title: string;
  tone?: "default" | "accent" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-card border px-5 py-4 shadow-xs max-[1280px]:min-w-[280px]",
        tone === "accent"
          ? "border-primary-border bg-primary-soft"
          : tone === "warn"
            ? "border-[#FDE68A] bg-warning-soft"
            : "border-line bg-card",
      )}
    >
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        <Icon name={icon} size={14} />
        {title}
      </p>
      {children}
    </div>
  );
}

/** Label / value row inside a rail card. */
export function RailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line py-[7px] last:border-b-0">
      <span className="flex-shrink-0 text-cap text-ink-2">{label}</span>
      <span
        className={cn(
          "ml-auto text-right text-[13px] font-medium tnum",
          tone === "ok" && "text-success-text",
          tone === "warn" && "text-warning-text",
          tone === "danger" && "text-danger-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** One grouped card on the review step; `row` comes from the engine. */
export function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-card px-6 py-5 shadow-xs max-md:rounded-btn max-md:p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        {title}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/** Big figure at the foot of a rail card — document totals. */
export function RailTotal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mt-3 flex items-baseline gap-3 border-t border-line-strong pt-3">
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="ml-auto text-lg font-semibold tracking-[-0.02em] tnum">{value}</span>
    </div>
  );
}
