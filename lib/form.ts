import { getPath } from "./utils";
import type { FormSchema, FormState, FormStep, RequiredRule } from "./types";

/**
 * Only the parts of a schema that validation reads. Taking this instead of
 * `FormSchema<T>` keeps every entity's schema assignable — `toState` makes the
 * full type contravariant in T, so `FormSchema<ProductRow>` is not a
 * `FormSchema<RecordBase>`.
 */
export type ValidatableSchema = Pick<FormSchema, "steps" | "required" | "rules">;

/* ============================================================
   FORM LOGIC — everything the MasterForm engine decides that is
   not rendering. Kept pure so completion, validation and the
   review step read the exact same numbers.
   ============================================================ */

/**
 * A required field counts as answered when it holds something. `0` and `false`
 * are real answers — a reorder point of 0 is a decision, not a blank. Rules
 * that need "greater than zero" say so with their own `test`.
 */
export function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export const ruleSatisfied = (rule: RequiredRule, state: FormState): boolean =>
  rule.test ? rule.test(state) : isAnswered(getPath(state, rule.path));

/** Steps whose `when` passes — the ones the rail shows and validation counts. */
export function visibleSteps(
  schema: ValidatableSchema,
  state: FormState,
): FormStep[] {
  return schema.steps.filter((s) => !s.when || s.when(state));
}

export interface StepStatus {
  key: string;
  /** Required fields belonging to this step. */
  total: number;
  done: number;
  /** Labels of the required fields still blank. */
  missing: string[];
  /** Labels of the business rules this step currently breaks. */
  broken: string[];
  complete: boolean;
}

export interface FormStatus {
  steps: Record<string, StepStatus>;
  total: number;
  done: number;
  /** Completion across every visible step, 0–100. */
  percent: number;
  missing: RequiredRule[];
  broken: { label: string; step: string }[];
  /** Required paths still blank — the renderer marks those controls. */
  blankPaths: Set<string>;
  canSave: boolean;
}

/**
 * One pass over the schema produces every number the form needs: the rail
 * ticks, the progress bar, the save guard and the error jump target.
 *
 * Rules attached to a hidden step are ignored — a Purchasing tab that does not
 * apply must never block the save.
 */
export function formStatus(
  schema: ValidatableSchema,
  state: FormState,
): FormStatus {
  const steps = visibleSteps(schema, state);
  const live = new Set(steps.map((s) => s.key));

  const required = schema.required.filter((r) => live.has(r.step));
  const rules = (schema.rules ?? []).filter((r) => live.has(r.step));

  const byStep: Record<string, StepStatus> = {};
  for (const s of steps) {
    byStep[s.key] = {
      key: s.key,
      total: 0,
      done: 0,
      missing: [],
      broken: [],
      complete: true,
    };
  }

  const missing: RequiredRule[] = [];
  const blankPaths = new Set<string>();

  for (const r of required) {
    const st = byStep[r.step];
    st.total++;
    if (ruleSatisfied(r, state)) {
      st.done++;
    } else {
      st.missing.push(r.label);
      missing.push(r);
      if (r.path) blankPaths.add(r.path);
    }
  }

  const broken: { label: string; step: string }[] = [];
  for (const r of rules) {
    if (r.test(state)) continue;
    byStep[r.step].broken.push(r.label);
    broken.push({ label: r.label, step: r.step });
  }

  for (const s of steps) {
    const st = byStep[s.key];
    st.complete = st.missing.length === 0 && st.broken.length === 0;
  }

  const total = required.length;
  const done = total - missing.length;

  return {
    steps: byStep,
    total,
    done,
    percent: total ? Math.round((done / total) * 100) : 100,
    missing,
    broken,
    blankPaths,
    canSave: missing.length === 0 && broken.length === 0,
  };
}

/* ============================================================
   DRAFT AUTOSAVE

   Browser-local only. It exists so a half-finished Business Partner
   survives a reload or a misclicked Back — never as a substitute for
   saving, which is why restoring is always the user's choice.
   ============================================================ */

export interface Draft {
  state: FormState;
  at: number;
}

export const draftKey = (entity: string, code?: string) =>
  `afactory:draft:${entity}:${code ?? "new"}`;

export function readDraft(key: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return parsed && parsed.state ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns the save timestamp, or null when storage refused (private mode, quota). */
export function writeDraft(key: string, state: FormState): number | null {
  if (typeof window === "undefined") return null;
  const at = Date.now();
  try {
    window.localStorage.setItem(key, JSON.stringify({ state, at } satisfies Draft));
    return at;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — the draft was best-effort anyway */
  }
}
