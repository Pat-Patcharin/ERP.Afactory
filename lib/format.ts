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

/* ------------------------------------------------------------
   THE TWO FORMATS, AND WHY THESE NAMES

     dd/mm/yyyy   what a record stores, and what a screen shows
     yyyy-mm-dd   what <input type="date"> speaks, and only it

   Both are Gregorian. Neither of these functions touches the
   era — that happens once, at print time, and nowhere else.
   `docs/DATE-ERA.md` has the decision.

   These were called `toDisplayDate` and `toInputDate` until the
   names caused a real mistake. A name describing PURPOSE gets
   believed: "display" made this look like the one place every
   date passes through on its way to the screen, so converting
   to พ.ศ. inside it looked like a one-line change. It is not
   that place. Records already hold dd/mm/yyyy and render
   straight out of the object, and 73 of this function's callers
   are save paths — the "one-line change" would have written
   Buddhist years back into `data/`.

   Named for the transformation instead, because a name that
   makes no claim about intent cannot be wrong about it. The
   direction is also readable at the call site now, which the
   `to*` pair never was.
   ------------------------------------------------------------ */

/** ISO → dd/mm/yyyy. A string already in dd/mm/yyyy passes through unchanged. */
export function isoToDmy(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return v;
}

/** dd/mm/yyyy → ISO. A string already in ISO passes through, trimmed to the date. */
export function dmyToIso(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const [d, m, y] = v.split("/");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/* ------------------------------------------------------------
   ONE FORMULA FOR "WHEN"

   Four modules each grew their own dd/mm/yyyy builder, for the
   same reason the era heuristic was in five places before D2:
   `stamp()` reads the clock itself, and a module that has a
   timestamp in hand — a ledger row, a lot expiry — cannot use
   it. So each wrote the padding out again.

   Splitting the formatting from the clock fixes that. The
   timestamp versions take the moment as an argument; `stamp()`
   and `today()` are the no-argument cases, defined in terms of
   them, so there is one formula and not five.

   Gregorian, like everything that is not the printed sheet.
   ------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, "0");

const asDate = (at: number | Date) => (at instanceof Date ? at : new Date(at));

/** "26/07/2025" — a moment as a date. */
export function formatDate(at: number | Date): string {
  const d = asDate(at);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "26/07/2025 14:22" — the audit stamp format used across every module. */
export function formatStamp(at: number | Date): string {
  const d = asDate(at);
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Now, stamped. */
export const stamp = (): string => formatStamp(new Date());

/** Now, as a date. */
export const today = (): string => formatDate(new Date());

/** Relative phrasing for the form's autosave clock. */
export function timeAgo(from: number): string {
  const s = Math.round((Date.now() - from) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  return `${Math.floor(s / 3600)} hours ago`;
}
