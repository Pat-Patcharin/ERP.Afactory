import type { ReactNode } from "react";
import { actingUserName } from "@/lib/domain/admin";
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
