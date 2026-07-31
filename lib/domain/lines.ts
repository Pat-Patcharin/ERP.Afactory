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
