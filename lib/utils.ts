import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ============================================================
   Dot-path access — the form engine writes any field into state
   by path ("pricing.retail", "items.0.qty") without per-field wiring.
   ============================================================ */

export function getPath<T = unknown>(obj: unknown, path: string): T | undefined {
  return path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
      obj,
    ) as T | undefined;
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const target = keys.reduce<Record<string, unknown>>((o, k) => {
    if (o[k] == null || typeof o[k] !== "object") o[k] = {};
    return o[k] as Record<string, unknown>;
  }, obj);
  target[last] = value;
}

/** Structured clone that survives older runtimes and plain data objects. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Stable unique id for client-only rows (tree nodes, toasts, grid keys). */
let seq = 0;
export const uid = (prefix = "id") => `${prefix}${++seq}`;
