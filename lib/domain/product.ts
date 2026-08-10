import { DEFAULT_CLASS, DETAIL, PRODUCTS as RAW, type Product } from "@/data/products";
import { DASH, daysUntil } from "@/lib/format";
import { catalogBuild } from "./product-catalog";

/** Per-product detail payload — the shape the API will eventually return. */
export type ProductDetail = (typeof DETAIL)[string];

/** Product plus the stock figures every screen derives from its warehouse rows. */
export interface ProductRow extends Product {
  detail: ProductDetail;
  onHandTotal: number;
  resTotal: number;
  onOrderTotal: number;
  backOrder: number;
  availTotal: number;
  projected: number;
}

/* ============================================================
   THE THREE UNITS A PRODUCT IS COUNTED IN

   Stock unit — the smallest thing the warehouse counts, and the
   only unit a balance is ever held in. `product.unit`.

   Purchase unit — what a supplier ships. Per (supplier ×
   product), because the same item arrives from one vendor by the
   Carton and from another by the Box. Lives on the supplier item
   with its own factor.

   Sales unit — what a customer can order. On the product, in
   `detail.units`, because it is the same offer to everybody.

   All three convert through the stock unit and nothing converts
   directly between two of the others: a Carton is 24 Tube and a
   Box is 12 Tube, so a Carton is two Boxes by arithmetic rather
   than by a rule anybody has to maintain.
   ============================================================ */

export const BASE_UNIT = "Base Unit";
export const SALES_UNIT = "Sales Unit";
export const PURCHASE_UNIT = "Purchase Unit";

/** A unit row that converts one for one — a factor never means "unstated". */
const safeFactor = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 1;
};

/** Base units in one `unit` of this product. 1 for the base unit itself. */
export function unitFactor(p: ProductRow, unit: string): number {
  if (!unit || unit === p.unit) return 1;
  const row = p.detail?.units?.find((u) => u.unit === unit);
  return safeFactor(row?.factor);
}

/** Quantity in `unit`, expressed in the unit the warehouse counts. */
export const toBaseQty = (qty: number, factor: number) =>
  (Number(qty) || 0) * safeFactor(factor);

/**
 * "1 Box = 12 Tube" — the sentence the old free-text field was trying to be,
 * built from the number rather than typed beside it.
 *
 * The base unit's own row reads "1 Tube" rather than "1 Tube = 1 Tube", which
 * is true and says nothing.
 */
export function conversionText(baseUnit: string, unit: string, factor: number): string {
  const f = safeFactor(factor);
  if (!unit) return "";
  if (unit === baseUnit || f === 1) return `1 ${unit}`;
  return `1 ${unit} = ${f.toLocaleString("en-US")} ${baseUnit}`;
}

/**
 * Fallback detail payload so every product opens cleanly, including the
 * deliberately sparse states (no supplier / no docs / no warehouse).
 */
function detailFor(p: Product): ProductDetail {
  const existing = DETAIL[p.code];
  if (existing) return existing;

  return {
    cls: {
      ...DEFAULT_CLASS,
      devClass: p.cat === "Accessory" ? "Class I" : "Class II",
    },
    units: [{ unit: p.unit, type: BASE_UNIT, factor: 1, barcode: p.barcode, active: true }],
    rfid: false,
    priceLists: [
      {
        name: "Standard 2569",
        price: p.price,
        cur: "THB",
        from: p.pricing.effective,
        to: "31/12/2026",
        status: p.status === "Inactive" ? "Expired" : "Active",
      },
      {
        name: "Dealer Tier A",
        price: p.pricing.dealer,
        cur: "THB",
        from: p.pricing.effective,
        to: "31/12/2026",
        status: p.status === "Inactive" ? "Expired" : "Active",
      },
    ],
    tiers: [{ min: 1, max: null, price: p.price }],
    contracts: p.pricing.contract
      ? [
          {
            cust: p.pricing.contract.name,
            type: "Contract",
            price: p.pricing.contract.price,
            from: "01/01/2026",
            to: "31/12/2026",
            status: "Active",
          },
        ]
      : [],
    backOrder: 0,
    lotTracked: p.cat !== "Accessory",
    serialTracked: false,
    whRows: p.stocks.map((s) => ({
      wh: s.wh,
      loc: s.loc,
      onHand: s.avail + s.res,
      res: s.res,
      onOrder: 0,
      rop: p.lowLevel,
    })),
    lots: p.stocks
      .filter((s) => s.lot && s.lot !== DASH)
      .map((s) => {
        const dd = daysUntil(s.exp);
        return {
          lot: s.lot,
          exp: s.exp,
          wh: s.wh,
          loc: s.loc,
          qty: s.avail,
          status: dd !== null && dd < 180 ? "Near Expiry" : "Normal",
        };
      }),
    serials: [],
    altSupRows: p.altSuppliers.map((a) => ({
      name: a.name,
      code: a.code,
      /* Placeholder rows: syncProductSupplyView rebuilds these from the
         partner's own supplier item as soon as that module has loaded, and
         the real unit and factor arrive with it. */
      punit: p.unit,
      punitFactor: 1,
      moq: DASH,
      lead: a.lead,
      price: parseFloat(a.price),
      status: "Active",
    })),
    regRows:
      !p.reg.no || p.reg.no === DASH || p.reg.no === "อยู่ระหว่างยื่นคำขอ"
        ? []
        : [
            {
              type: "Thai FDA",
              no: p.reg.no,
              issue: p.reg.issue,
              exp: p.reg.expiry,
              status: p.reg.status,
              doc: p.reg.docs[0]?.name || DASH,
            },
          ],
    warranty: {
      sup: (p.sup.warranty.match(/\d+/) || [DASH])[0],
      cust: (String(p.reg.custWarranty).match(/\d+/) || [DASH])[0],
      unit: "เดือน",
      startEvent: "Delivery Date",
    },
    docs: p.reg.docs.map((d) => ({
      name: d.name,
      type: "Thai FDA Certificate",
      size: d.meta.split("·")[1]?.trim() || DASH,
      by: "Pimpaka S.",
      date: p.created.split(" ")[0],
    })),
    audit: p.history.map((h) => ({
      event: h.t,
      user: h.u,
      when: h.when,
      field: DASH,
      from: DASH,
      to: h.d,
      kind: h.kind,
    })),
  } as ProductDetail;
}

/**
 * Attach the detail payload and derived stock figures to every product.
 *
 *   Available  = On Hand − Reserved
 *   Projected  = On Hand − Reserved − Back Order + On Order
 *              = Available − Back Order + On Order
 *
 * WHY BOTH ARE SUBTRACTED, since the second line looks like double counting:
 *
 * Reserved and Back Order are both stock that already has an owner. They
 * differ only in timing — Reserved is promised and not yet due, Back Order is
 * promised and already late — and neither can be sold to somebody else. A
 * projected balance is an answer to "how much will be free to commit", so
 * anything already committed comes off it, whichever of the two buckets it
 * sits in.
 *
 * The definition used to read `On Hand − Back Order + On Order`, subtracting
 * only one of them. **That was the hole this revision closes**, not an
 * elaboration on a rule that was already right: in the current data every
 * product's Back Order is zero and the reservations are the live figure, so
 * the old definition let a buyer see 1,850 units free on a product with 150
 * of them already spoken for — and under-order by exactly that much.
 *
 * These lines are the authority for the whole module. `productStock()` follows
 * them.
 *
 * The totals below are summed from the warehouse rows, while `productStock()`
 * reads the flat per-product fields. That is a second, smaller divergence:
 * where a product carries both, the two can differ. `p.projected` and
 * `p.availTotal` have no reader anywhere in the app — every screen goes
 * through `productStock()` — so nothing depends on which wins today. Left in
 * place rather than deleted in the same commit that changed the formula; see
 * docs/BACKLOG.md item N-5.
 */
export function decorateProducts() {
  for (const p of PRODUCTS) {
    const d = detailFor(p);
    p.detail = d;
    p.onHandTotal = d.whRows.reduce((s, r) => s + r.onHand, 0) || p.onHand;
    p.resTotal = d.whRows.reduce((s, r) => s + r.res, 0);
    p.onOrderTotal = d.whRows.reduce((s, r) => s + r.onOrder, 0);
    p.backOrder = d.backOrder;
    p.availTotal = p.onHandTotal - p.resTotal;
    p.projected = p.availTotal - p.backOrder + p.onOrderTotal;
  }
}

/**
 * Fold the price list master into the product master, once.
 *
 * The two were separate catalogues of the same business — eight prototype
 * records here, 807 priced rows there. Merging happens at load rather than
 * in the data file so the price file stays generated and hand-editing it
 * stays unnecessary: regenerate the file and Product Master follows.
 *
 * A price row never overwrites a prototype record. Codes that already exist
 * keep the richer record, which is the one carrying stock, lots and
 * documents.
 */
function mergeCatalog() {
  const { products, details } = catalogBuild();
  const known = new Set(RAW.map((p) => p.code));

  for (const p of products) {
    if (known.has(p.code)) continue;
    known.add(p.code);
    RAW.push(p);
    DETAIL[p.code] = details[p.code];
  }
}

mergeCatalog();

export const PRODUCTS = RAW as ProductRow[];
decorateProducts();

export const getProduct = (code: string) =>
  PRODUCTS.find((p) => p.code === code) ?? null;

/**
 * Whether the warehouse holds a stock record for this product at all.
 *
 * A catalogue product imported from the price list has none, which is not
 * the same thing as having run out — "0 available" and "never stocked" mean
 * different things to a buyer, and every stock screen keeps them apart.
 */
export const isStocked = (p: Product) => (p.stocks?.length ?? 0) > 0;

/** The products stock figures may be counted over. */
export const stockedProducts = () => PRODUCTS.filter(isStocked);

/** Stock status from the agreed definitions. */
export function stockStatus(onHand: number, res: number, rop: number) {
  const avail = onHand - res;
  if (onHand <= 0) return { text: "Out of Stock", tone: "danger" as const };
  if (avail <= rop) return { text: "Low Stock", tone: "warning" as const };
  return { text: "Normal", tone: "success" as const };
}

/**
 * Live stock intelligence for a product code — the heart of the "smart"
 * Purchase Request grid. Suggested quantity brings the projected balance up
 * to 1.5× the reorder point.
 *
 * `projected` follows the definition stated above `decorateProducts()` and
 * nowhere else — including why both Reserved and Back Order come off it.
 *
 * It used to read `available + onOrder`, subtracting neither Back Order nor
 * anything else beyond the reservation. Two formulas for one word, seventy
 * lines apart in this file, with a comment above the other one claiming they
 * were "kept distinct on purpose" — and the field that comment described
 * (`ProductRow.projected`) is written and never read, while every screen
 * showing a projected balance reads this function. A comment that describes
 * something the code does not do is worse than no comment, so the code moved
 * to the comment and the comment moved to the truth.
 */
export function productStock(code: string) {
  const p = getProduct(code);
  if (!p) return null;

  const onHand = p.onHand ?? p.stock ?? 0;
  const reserved = p.reserved ?? 0;
  const onOrder = p.onOrder ?? 0;
  /* Demand already promised to customers beyond what is on the shelf. Zero
     throughout the current seed — which is exactly why the old definition
     could subtract it alone and look correct. */
  const backOrder = p.backOrder ?? 0;
  const rop = p.lowLevel ?? 0;
  const available = onHand - reserved;
  const projected = available - backOrder + onOrder;
  const target = Math.round(rop * 1.5);
  const suggested = Math.max(0, target - projected);

  const { status, tone } =
    available < 0
      ? { status: "Critical", tone: "danger" as const }
      : available <= rop
        ? { status: "Below ROP", tone: "warning" as const }
        : projected <= rop
          ? { status: "Watch", tone: "warning" as const }
          : { status: "Healthy", tone: "success" as const };

  return {
    code: p.code,
    name: p.name,
    unit: p.unit,
    price: p.price,
    lastCost: p.pricing?.lastCost ?? p.price,
    supplier: p.supplier ?? "",
    onHand,
    reserved,
    onOrder,
    backOrder,
    available,
    projected,
    rop,
    target,
    suggested,
    status,
    tone,
  };
}
