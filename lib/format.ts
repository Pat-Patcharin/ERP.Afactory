/* ============================================================
   Formatters — every figure in the app goes through one of these
   so thousands separators, decimals and the em-dash placeholder
   stay consistent across list, detail and form.
   ============================================================ */

/** Integer with thousands separators: 1250 → "1,250" */
export const fmt = (n: number | string | null | undefined): string =>
  Number(n ?? 0).toLocaleString("en-US");

/** Money with two decimals: 120 → "120.00" */
export const money = (n: number | string | null | undefined): string =>
  Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Money without decimals — used for large totals: 1250000 → "1,250,000" */
export const money0 = (n: number | string | null | undefined): string =>
  Number(n ?? 0).toLocaleString("en-US");

/** Em-dash placeholder for empty values, so columns never look broken. */
export const DASH = "—";

export const esc = (v: unknown): string =>
  v === null || v === undefined || v === "" ? DASH : String(v);

export const formatCurrency = (n: number | null | undefined, cur = "THB") =>
  n === null || n === undefined ? DASH : `${money(n)} ${cur}`;

/** Two-character avatar initials; keeps Thai characters intact. */
export const initials = (s: string): string =>
  String(s ?? "")
    .replace(/[^A-Za-z0-9ก-๙ ]/g, "")
    .trim()
    .slice(0, 2)
    .toUpperCase();

/* ============================================================
   THE TWO ERAS

   Thai records are dated in the Buddhist era — 22/07/2569, not
   22/07/2026 — and 543 years separate the two. Everything that
   CALCULATES with a date needs the Gregorian year; everything a
   Thai reader sees should carry the Buddhist one.

   The comment that used to sit on `bpDaysUntil` in
   lib/domain/partner.ts said it best, and is kept here because
   it explains the whole problem:

     The BP module dates everything in BE — 22/07/2569, not
     22/07/2026 — while lib/format's daysUntil reads the year
     literally. Passing a BE date through it returns ~198,000
     days, so the document-expiry warning could never fire.

   That was true of nine places, not one. Business Partner,
   Inventory, Partner Analytics (twice), Product Analytics
   (twice), Administration (twice), the print engine and the
   shipment schema had each hit this and each written their own
   `y > 2400 ? y - 543 : y`. Nobody knew the others existed, so
   nobody generalised it — and the tenth caller, the quotation
   list, never got the fix at all. Its Expired status and its
   "expiring soon" tab have never once fired.

   ONE conversion, here. If you find yourself writing 543
   anywhere else, call these instead.
   ============================================================ */

const BE_OFFSET = 543;

/**
 * A year is Buddhist if it could not plausibly be Gregorian.
 *
 * 2400 is the cut: BE years in this system run 2560–2600 (CE 2017–2057),
 * and no Gregorian date the business records reaches 2400.
 */
export const isBuddhistYear = (y: number): boolean => y > 2400;

/** Gregorian year, whichever era it arrived in. Safe to call twice. */
export const ceYear = (y: number): number => (isBuddhistYear(y) ? y - BE_OFFSET : y);

/** Buddhist year, whichever era it arrived in. Safe to call twice. */
export const beYear = (y: number): number => (isBuddhistYear(y) ? y : y + BE_OFFSET);

/**
 * Rewrite every dd/mm/yyyy in a string into the Buddhist era.
 *
 * Used where a whole line of display text may carry a date — a printed meta
 * row, an audit line. Idempotent, because `beYear` is.
 */
export const toBuddhistText = (v: string): string =>
  String(v ?? "").replace(
    /\b(\d{2})\/(\d{2})\/(\d{4})\b/g,
    (_, d, m, y) => `${d}/${m}/${beYear(Number(y))}`,
  );

/**
 * Days from today to a dd/mm/yyyy string. Returns null when undated, so
 * callers can distinguish "no expiry" from "expires today".
 *
 * Accepts either era — see the note above. A caller no longer has to know
 * which one its module happens to store.
 */
export function daysUntil(str: string | null | undefined): number | null {
  if (!str || str === DASH) return null;
  const [d, m, y] = String(str).split("/").map(Number);
  if (!d || !m || !y) return null;
  return Math.ceil((new Date(ceYear(y), m - 1, d).getTime() - Date.now()) / 86_400_000);
}

/** dd/mm/yyyy for display; accepts both an ISO date input and a Thai-style string. */
export function toDisplayDate(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return v;
}

/** yyyy-mm-dd for <input type="date">; accepts a dd/mm/yyyy string. */
export function toInputDate(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const [d, m, y] = v.split("/");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "26/07/2025 14:22" — the audit stamp format used across every module. */
export function stamp(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-GB")} ${d.toTimeString().slice(0, 5)}`;
}

export const today = (): string => new Date().toLocaleDateString("en-GB");

/** Relative phrasing for the form's autosave clock. */
export function timeAgo(from: number): string {
  const s = Math.round((Date.now() - from) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  return `${Math.floor(s / 3600)} hours ago`;
}
