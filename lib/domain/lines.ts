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

/* ------------------------------------------------------------
   DOCUMENT TOTALS

   Moved here from doc-draft.ts. It is pure line arithmetic and
   belongs beside the per-line functions it calls, but the reason
   it MOVED is concrete: outbound.ts needs recordTotals for its
   list column, doc-draft.ts imports outbound.ts, and the cycle
   left recordTotals undefined at module-load time — every list
   decorated at import blew up. lines.ts imports nothing, so
   nothing can close a loop through it.
   ------------------------------------------------------------ */

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? "").trim();

/* ---------- Totals ---------- */

export interface DocTotals {
  subtotal: number;
  lineDiscount: number;
  headerDiscount: number;
  netAmount: number;
  vat: number;
  freight: number;
  otherCharges: number;
  rounding: number;
  grandTotal: number;
  itemCount: number;
  totalQty: number;
}

export interface ChargeFields {
  headerDisc: number | "";
  freight: number | "";
  otherCharges: number | "";
}

/**
 * Every figure a document shows, from the shared line maths.
 *
 * The header discount is applied after the line discounts and before VAT, so a
 * quotation, the request it becomes and the order after that agree to the
 * satang. Nothing here is a second calculation engine — the per-line work is
 * lib/domain/lines.ts.
 */
/**
 * The least a line has to be for the totals to work.
 *
 * Widened from `DraftLine` so a SAVED document can go through the same
 * function as one being typed. That is the whole point of `recordTotals`
 * below: a quotation printed from the editor and the same quotation printed
 * after saving must not be able to disagree, and the only way to guarantee
 * that is for there to be one function rather than two that match today.
 */
export interface TotalsLine {
  code?: string;
  qty?: number | "";
  price?: number | "";
  disc?: number | "";
  tax?: number | "";
}

export function docTotals(items: TotalsLine[], charges: ChargeFields): DocTotals {
  const priced = items.filter((l) => str(l.code));
  const lines = priced.map((l) => ({
    qty: num(l.qty),
    price: num(l.price),
    disc: num(l.disc),
    tax: num(l.tax),
  }));

  const subtotal = docSubtotal({ items: lines });
  const lineDiscount = docDiscTotal({ items: lines });
  const afterLine = subtotal - lineDiscount;

  const headerDiscount = Math.min(num(charges.headerDisc), afterLine);
  const netAmount = afterLine - headerDiscount;

  /* VAT follows the goods, so a header discount reduces it proportionally.
     Freight and other charges are quoted VAT-inclusive in this prototype. */
  const lineTax = docTaxTotal({ items: lines });
  const vat = afterLine > 0 ? lineTax * (netAmount / afterLine) : 0;

  const freight = num(charges.freight);
  const otherCharges = num(charges.otherCharges);
  const beforeRounding = netAmount + vat + freight + otherCharges;
  const grandTotal = Math.round(beforeRounding * 100) / 100;

  return {
    subtotal,
    lineDiscount,
    headerDiscount,
    netAmount,
    vat,
    freight,
    otherCharges,
    rounding: Math.round((grandTotal - beforeRounding) * 100) / 100,
    grandTotal,
    itemCount: priced.length,
    totalQty: lines.reduce((t, i) => t + i.qty, 0),
  };
}

/**
 * Every figure a SAVED document shows — the same function, from the record.
 *
 * The print engine used to total a stored document with `docGrandTotal`,
 * which sums the lines and nothing else, while the editor's preview used
 * `docTotals`, which also applies the header discount, freight and other
 * charges. Two formulas for one number: print a quotation before saving and
 * again afterwards and the customer gets two different totals, with nobody
 * having done anything wrong.
 *
 * There is now one formula. `docGrandTotal` still exists for the documents
 * that genuinely have no header charges — a picking list is not billed — but
 * anything a customer is billed from comes through here.
 */
export function recordTotals(
  doc: { items?: TotalsLine[] } & Partial<ChargeFields>,
): DocTotals {
  return docTotals(doc.items ?? [], {
    headerDisc: doc.headerDisc ?? 0,
    freight: doc.freight ?? 0,
    otherCharges: doc.otherCharges ?? 0,
  });
}
