import { DEFAULT_CLASS, DETAIL, PRODUCTS as RAW, type Product } from "@/data/products";
import { DASH, daysUntil } from "@/lib/format";

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
      ptype: p.cat === "Accessory" ? "General Consumable" : "Medical Consumable",
      devClass: p.cat === "Accessory" ? "Class I" : "Class II",
      origin: p.sup.country,
      maker: `${p.brand} Co., Ltd.`,
    },
    units: [
      {
        unit: p.unit,
        type: "Base Unit",
        conv: `1 ${p.unit}`,
        barcode: p.barcode,
        active: true,
      },
    ],
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
      punit: "Carton",
      moq: DASH,
      lead: a.lead,
      price: parseFloat(a.price),
      status: "Active",
    })),
    regRows:
      p.reg.no === "อยู่ระหว่างยื่นคำขอ"
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
 *   Available = On Hand − Reserved
 *   Projected = On Hand − Back Order + On Order   (kept distinct on purpose)
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
    p.projected = p.onHandTotal - p.backOrder + p.onOrderTotal;
  }
}

export const PRODUCTS = RAW as ProductRow[];
decorateProducts();

export const getProduct = (code: string) =>
  PRODUCTS.find((p) => p.code === code) ?? null;

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
 */
export function productStock(code: string) {
  const p = getProduct(code);
  if (!p) return null;

  const onHand = p.onHand ?? p.stock ?? 0;
  const reserved = p.reserved ?? 0;
  const onOrder = p.onOrder ?? 0;
  const rop = p.lowLevel ?? 0;
  const available = onHand - reserved;
  const projected = available + onOrder;
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
    available,
    projected,
    rop,
    target,
    suggested,
    status,
    tone,
  };
}
