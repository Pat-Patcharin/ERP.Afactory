/* ============================================================
   DOCUMENT LINE MATHS

   Every transactional document — buy side and sell side — prices a
   line the same way:

     net = qty × price × (1 − disc%) × (1 + tax%)

   It lives here once so a Purchase Order and a Sales Order can
   never drift apart on rounding or on the order of operations.
   ============================================================ */

export interface DocLine {
  qty?: number;
  price?: number;
  disc?: number;
  tax?: number;
}

/* ============================================================
   WHAT A LINE IS CALLED

   A salesperson can rename a line for the customer — "ชุดวัสดุอุดฟัน
   สำหรับคลินิกสาขาใหม่" instead of the catalogue name — and can add a
   note under it. Both travel with the line all the way to the invoice.

   Two rules hold everywhere:

     - A blank custom name falls back to the catalogue name. Nothing may
       ever print an empty description, so nothing reads `customName`
       directly; everything goes through `displayName`.
     - The product code is printed regardless. If the name on the bill
       does not match what turned up, the code is what makes the line
       traceable back to the item.
   ============================================================ */

export interface NamedLine {
  code?: string;
  name?: string;
  /** What the salesperson wants the customer to read. Blank = use `name`. */
  customName?: string;
  /** Whether the custom name and note reach customer-facing paperwork. */
  showOnBill?: boolean;
}

/** The single source of what a line is called. Never read `customName` directly. */
export const displayName = (l: NamedLine): string =>
  String(l.customName ?? "").trim() || String(l.name ?? "");

/**
 * Whether this line's custom name and note belong on customer-facing paper.
 *
 * `undefined` means yes. Every line written before the flag existed has no
 * value, and reading those as "hide" would quietly strip notes that are
 * printing on bills today.
 */
export const billShows = (l: NamedLine): boolean => l.showOnBill !== false;

/** The name to print on a bill: the custom one only when it is allowed out. */
export const billName = (l: NamedLine): string =>
  billShows(l) ? displayName(l) : String(l.name ?? "");

export const lineBase = (it: DocLine) => (Number(it.qty) || 0) * (Number(it.price) || 0);

export const lineDisc = (it: DocLine) => lineBase(it) * ((Number(it.disc) || 0) / 100);

/** Tax is charged on the discounted amount, never on the gross. */
export const lineTax = (it: DocLine) =>
  (lineBase(it) - lineDisc(it)) * ((Number(it.tax) || 0) / 100);

export const lineNet = (it: DocLine) => lineBase(it) - lineDisc(it) + lineTax(it);

const sum = <T>(items: T[] | undefined, pick: (it: T) => number) =>
  (items ?? []).reduce((t, it) => t + pick(it), 0);

export const docSubtotal = (d: { items?: DocLine[] }) => sum(d.items, lineBase);
export const docDiscTotal = (d: { items?: DocLine[] }) => sum(d.items, lineDisc);
export const docTaxTotal = (d: { items?: DocLine[] }) => sum(d.items, lineTax);
export const docGrandTotal = (d: { items?: DocLine[] }) => sum(d.items, lineNet);

/** Progress of one quantity against another, clamped to 0–100. */
export const pctOf = (done: number, total: number) =>
  total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
