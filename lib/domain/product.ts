import { DEFAULT_CLASS, DETAIL, PRODUCTS as RAW, type Product } from "@/data/products";
import { DASH, daysUntil } from "@/lib/format";
import { catalogBuild } from "./product-catalog";
import { WAREHOUSES } from "./warehouse";

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

/**
 * What one base unit costs, from whichever figure the product actually has.
 *
 * Receipts win — what was paid beats what was quoted. A product that has
 * never been received falls back to the cost agreed with the main supplier,
 * which is the reason that figure is typed on the master at all: without it
 * a newly created item priced at nothing, and every GP check on it read 100%.
 *
 * `||` rather than `??` on purpose: a product with no receipts carries 0, not
 * undefined, so a nullish chain never reached the fallback.
 */
export const productCost = (p: {
  pricing?: { lastCost?: number; avgCost?: number; supplierCost?: number };
}) => p.pricing?.lastCost || p.pricing?.avgCost || p.pricing?.supplierCost || 0;

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
    /* Selling prices are not a product fact. The lists a product appears in,
       its tiers and its contract prices all live in the price list module —
       see `catalogPrice()`. This payload used to fabricate two "price lists"
       out of two fields on the product, which meant the Price tab showed a
       list nobody had created. */
    backOrder: 0,
    lotTracked: p.cat !== "Accessory",
    serialTracked: false,
    whRows: p.stocks.map((s) => ({
      wh: s.wh,
      loc: s.loc,
      onHand: s.avail + s.res,
      res: s.res,
      onOrder: 0,
      /* This column read `p.lowLevel` for every row, so a warehouse table
         showed one company-wide figure repeated down the page and called it
         a per-warehouse reorder point. The policy row is the authority; the
         product's own figure is the default a warehouse has not overridden. */
      rop: warehouseRop(p, s.wh),
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
    ensureWarehousePolicy(p);
    const d = detailFor(p);
    /* The reorder point on the detail table is READ from the policy, never
       carried beside it. A seeded payload seeded its own copy, and the two
       parted company the moment the rule they both describe changed. */
    for (const row of d.whRows) row.rop = warehouseRop(p, row.wh);
    p.detail = d;
    p.onHandTotal = d.whRows.reduce((s, r) => s + r.onHand, 0) || p.onHand;
    p.resTotal = d.whRows.reduce((s, r) => s + r.res, 0);
    p.onOrderTotal = d.whRows.reduce((s, r) => s + r.onOrder, 0);
    p.backOrder = d.backOrder;
    p.availTotal = p.onHandTotal - p.resTotal;
    p.projected = p.availTotal - p.backOrder + p.onOrderTotal;
  }
}

/* ============================================================
   WHICH WAREHOUSES MAY HOLD THIS PRODUCT

   A balance says where the goods ARE. This says where they MAY
   BE, which is the only one of the two that can answer "deliver
   this purchase order where" before any stock exists.

   Seeded from the balances, because a warehouse that has held
   the item is one that may: the policy did exist, it was just
   never written down anywhere a screen could read it.
   ============================================================ */

/** Warehouse-level storage rule. `wh` is written "CODE Name" everywhere. */
const whRule = (wh: string) => {
  const code = String(wh ?? "").trim().split(/\s+/)[0];
  return WAREHOUSES.find((w) => w.code === code)?.rules ?? null;
};

/**
 * Whether a warehouse's conditions suit this product.
 *
 * Both facts already exist — the product states a storage condition and the
 * warehouse states a temperature — and nothing compared them, so a 2–8 °C
 * item could be assigned to an ambient store and only the box would know.
 * Returns the reason rather than a boolean, because a refusal nobody can
 * read is a refusal nobody can act on.
 */
export function storageWarning(storage: string, wh: string): string | null {
  const rule = whRule(wh);
  if (!rule || !storage) return null;
  const needsCold = /2–8|2-8|แช่เย็น/.test(storage);
  const isCold = /cold|เย็น/i.test(rule.temp);
  return needsCold && !isCold ? `ต้องเก็บ ${storage} · คลังนี้ ${rule.temp}` : null;
}

/** The same check against a saved product. */
export const storageMismatch = (p: ProductRow, wh: string) =>
  storageWarning(p.detail?.cls?.storage ?? "", wh);

function ensureWarehousePolicy(p: Product) {
  if (p.warehouses?.length) return;

  /* Real per-warehouse reorder points already existed for the hand-built
     products — 200 at the main store, 100 at Bangkok, 0 at the service store
     — sitting in the read-only detail payload where nothing could edit them
     and every screen showed `lowLevel` over the top. Promote them rather than
     flatten them back to the default. */
  const seeded = DETAIL[p.code]?.whRows ?? [];

  const rows = (p.stocks ?? []).map((s) => {
    const was = seeded.find((w) => w.wh === s.wh);
    return {
      wh: s.wh,
      bin: s.loc,
      rop: was ? was.rop : p.lowLevel,
      maxQty: Math.round((was ? was.rop : p.lowLevel) * 1.5),
      /* The largest holding is where goods have in fact been landing. */
      defaultReceiving: false,
      defaultIssuing: false,
      status: "Active",
    };
  });

  if (rows.length) {
    const biggest = (p.stocks ?? []).reduce(
      (best, s, i) => (s.avail + s.res > (p.stocks[best]?.avail ?? -1) + (p.stocks[best]?.res ?? 0) ? i : best),
      0,
    );
    rows[biggest].defaultReceiving = true;
    rows[biggest].defaultIssuing = true;
  }

  p.warehouses = rows;
}

/** Warehouses this product may be held in, policy rows only. */
export const productWarehouses = (p: Product) =>
  (p.warehouses ?? []).filter((w) => w.status === "Active");

/**
 * The reorder point that applies at one warehouse.
 *
 * A policy row answers for its own warehouse, ZERO INCLUDED: the seeded
 * service store carries 0 and means it — it holds nothing and reorders
 * nothing, and reading that as "unset" would put a 200-unit alert on a store
 * that has never held one. The product's company-wide figure applies only
 * where no policy row exists at all.
 */
/**
 * The reorder point in force at one warehouse.
 *
 * A row's own figure when it has one, the product's Min otherwise. Zero on a
 * row now means "use the product's rule" rather than "never reorder here":
 * the product form stopped asking for a per-warehouse level, so a zero is an
 * unanswered question rather than an answer. Rows that carry a real figure —
 * the seeded ones — still win.
 */
export function warehouseRop(p: Product, wh: string): number {
  const row = (p.warehouses ?? []).find((w) => w.wh === wh);
  return row && row.rop > 0 ? row.rop : p.lowLevel;
}

/** Where goods land by default, or the first warehouse cleared to hold them. */
export function defaultReceivingWarehouse(p: Product): string {
  const rows = productWarehouses(p);
  return (rows.find((w) => w.defaultReceiving) ?? rows[0])?.wh ?? "";
}

export interface WarehouseItem {
  code: string;
  name: string;
  unit: string;
  bin: string;
  onHand: number;
  reserved: number;
  available: number;
  rop: number;
  /** Below the reorder point AT THIS WAREHOUSE, not company-wide. */
  low: boolean;
  lastCost: number;
  value: number;
  storageWarn: string | null;
}

/**
 * What one warehouse holds, item by item.
 *
 * The warehouse detail used to show four aggregate figures — SKU count, total
 * quantity, inventory value — which say how big the warehouse is and nothing
 * about what is in it. This is the list somebody actually opens a warehouse
 * to read.
 *
 * Driven by the policy rows rather than the balances, so an item cleared for
 * this warehouse but not yet delivered still appears, at zero.
 */
export function warehouseItems(wh: string): WarehouseItem[] {
  const out: WarehouseItem[] = [];
  for (const p of PRODUCTS) {
    const policy = (p.warehouses ?? []).find((w) => w.wh === wh && w.status === "Active");
    if (!policy) continue;

    const bal = (p.stocks ?? []).find((s) => s.wh === wh);
    const onHand = (bal?.avail ?? 0) + (bal?.res ?? 0);
    const reserved = bal?.res ?? 0;
    const available = onHand - reserved;
    const rop = warehouseRop(p, wh);
    const lastCost = productCost(p);

    out.push({
      code: p.code,
      name: p.name,
      unit: p.unit,
      bin: policy.bin || bal?.loc || "",
      onHand,
      reserved,
      available,
      rop,
      /* A reorder point of 0 means this store does not reorder, so it is
         never "below" it — otherwise every empty service bay would alarm. */
      low: rop > 0 && available <= rop,
      lastCost,
      value: Math.round(onHand * lastCost * 100) / 100,
      storageWarn: storageWarning(p.detail?.cls?.storage ?? "", wh),
    });
  }
  return out.sort((a, b) => Number(b.low) - Number(a.low) || b.value - a.value);
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
  /* The level a reorder tops back up to. `maxLevel` is what somebody
     decided; the 1.5× is what the form used to guess before there was
     anywhere to type it, kept only for records that predate the field. */
  const target = p.maxLevel > 0 ? p.maxLevel : Math.round(rop * 1.5);
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
    /* No selling price on a stock row. What a warehouse holds is valued at
       cost; what it will fetch belongs to whichever list is quoting it, and
       this module cannot reach the pricing one without closing a loop. */
    lastCost: productCost(p),
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
