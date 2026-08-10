import { PRICE_LISTS as RAW, PL_PRIORITY_ENGINE, type PriceList } from "@/data/price-lists";
import { PRICING as RAW_PRICING } from "@/data/pricing";
import { PRODUCTS, PURCHASE_UNIT, unitFactor, type ProductRow } from "./product";
import {
  priceMasterByProduct,
  priceMasterRows,
  type PriceMasterRow,
} from "./price-master";
import { daysUntil } from "@/lib/format";

/* ============================================================
   PRICE LIST — pricing POLICY (scope, validity, priority rules).
   The actual per-product prices live in the pricing matrix below.
   ============================================================ */

export interface PriceListRow extends PriceList {
  icon: string;
  isExpiring: boolean;
  isExpired: boolean;
  scopeText: string;
}

export const PRICE_LISTS = RAW as PriceListRow[];

export function decoratePLs() {
  for (const pl of PRICE_LISTS) {
    pl.icon = "🏷️";
    const d = daysUntil(pl.expiry);
    pl.isExpiring = d !== null && d >= 0 && d <= 30 && pl.status === "Active";
    pl.isExpired = d !== null && d < 0;
    // An expired list must read as expired even if nobody changed the flag.
    if (pl.isExpired && pl.status === "Active") pl.status = "Expired";
    pl.scopeText = (pl.scope ?? []).join(", ");
  }
}

decoratePLs();

export const getPriceList = (code: string) =>
  PRICE_LISTS.find((p) => p.code === code) ?? null;

/** Human-readable summary of a pricing rule. */
export function plRuleSummary(rule: PriceList["rule"] | undefined): string {
  if (!rule) return "—";
  switch (rule.ruleType) {
    case "Fixed Price":
      return "ราคาคงที่ตามที่กำหนด";
    case "Markup":
      return `บวกเพิ่ม ${rule.value}% จากต้นทุน`;
    case "Markdown":
      return `ลด ${rule.value}% จากราคามาตรฐาน`;
    case "Discount %":
      return `ส่วนลด ${rule.value}%`;
    case "Margin %":
      return `กำหนดกำไรขั้นต้น ${rule.value}%`;
    case "Formula":
      return rule.formula || "สูตรกำหนดเอง";
    default:
      return rule.ruleType;
  }
}

export { PL_PRIORITY_ENGINE };

/* ============================================================
   PRODUCT PRICING — the actual selling price of each product
   under each price list. One product, many price lines.
   ============================================================ */

/** The list every screen means when it says "the catalogue price". */
export const STANDARD_LIST = "PL-STD-2026";

export interface QtyBreak {
  min: number;
  /** Null on the top step — "this many and above". */
  max: number | null;
  price: number;
}

export interface PriceLine {
  id: string;
  priceList: string;
  /** The sales unit this price is quoted for. See PricingMap for why. */
  unit: string;
  type: string;
  currency: string;
  cost: number;
  price: number;
  minPrice: number;
  maxDisc: number;
  eff: string;
  exp: string;
  status: string;
  note: string;
  qtyBreaks: QtyBreak[];
}

export const PRICING = RAW_PRICING as Record<string, PriceLine[]>;

export const VAT_RATE = 0.07;

export const markupPct = (cost: number, price: number) =>
  cost > 0 ? Math.round(((price - cost) / cost) * 1000) / 10 : 0;
export const marginPct = (cost: number, price: number) =>
  price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;
export const grossProfit = (cost: number, price: number) => price - cost;
export const vatAmount = (price: number) => Math.round(price * VAT_RATE * 100) / 100;
export const netWithVat = (price: number) => Math.round(price * (1 + VAT_RATE) * 100) / 100;

/** Highest to lowest precedence — the order the engine resolves a price in. */
const ENGINE_ORDER = [
  "Contract", "Promotion", "Customer", "Clinic", "Dealer",
  "Government", "Chain Clinic", "Standard",
];

/** Which line actually wins for a product, by the priority engine. */
export function winningLine(lines: PriceLine[]): PriceLine | null {
  const active = lines.filter((l) => l.status === "Active");
  for (const t of ENGINE_ORDER) {
    const hit = active.find((l) => l.type === t);
    if (hit) return hit;
  }
  return active[0] ?? lines[0] ?? null;
}

/** Map a price line type onto its level in the priority ladder. */
export const PRICE_TYPE_TO_LEVEL: Record<string, string> = {
  Contract: "Contract",
  Promotion: "Promotion",
  Customer: "Customer Price",
  Clinic: "Customer Group Price",
  Dealer: "Customer Group Price",
  Government: "Customer Group Price",
  "Chain Clinic": "Customer Group Price",
  Standard: "Standard Price",
};

/**
 * The units a product can be SOLD in — the stock unit always, plus any
 * alternative unit marked as a sales unit and still active.
 *
 * Purchase-only units are left out on purpose: they describe how the goods
 * arrive, and quoting a customer in a unit we never offer is a price nobody
 * can order at.
 */
export function sellableUnits(p: ProductRow): { unit: string; factor: number }[] {
  const rows = [{ unit: p.unit, factor: 1 }];
  for (const u of p.detail?.units ?? []) {
    if (u.unit === p.unit || !u.active) continue;
    if (u.type === PURCHASE_UNIT) continue;
    rows.push({ unit: u.unit, factor: u.factor > 0 ? u.factor : 1 });
  }
  return rows;
}

/**
 * Seed price lines for a product that has no explicit matrix, so the pricing
 * workspace can open any product from the master rather than only the samples.
 *
 * One line per (list × unit). The larger unit's price is SEEDED at the
 * arithmetic — twelve tubes at the tube price — and is editable from there,
 * because a box price is a commercial decision and not a multiplication. The
 * seed only means nobody starts from an empty box; the screen shows what the
 * arithmetic would have said beside whatever was typed.
 */
export function ensurePricing(code: string): PriceLine[] {
  if (PRICING[code]) return PRICING[code];

  const p = PRODUCTS.find((x) => x.code === code);
  if (!p) {
    PRICING[code] = [];
    return PRICING[code];
  }

  const cost = p.pricing?.lastCost ?? p.pricing?.avgCost ?? 0;
  const cur = p.pricing?.currency ?? "THB";
  const units = sellableUnits(p);
  const lines: PriceLine[] = [];
  /* The four tiers the price file holds for this product. It is the source
     for 751 of the 810; the other 59 are seeded explicitly in data/pricing.ts
     and never reach here, because that map is checked first. */
  const master = masterRowFor(p);

  const push = (
    suffix: string,
    list: string,
    type: string,
    basePrice: number,
    maxDisc: number,
  ) => {
    for (const u of units) {
      const price = Math.round(basePrice * u.factor);
      lines.push({
        id: `PP-${code}-${suffix}${u.factor === 1 ? "" : `-${u.unit}`}`,
        priceList: list,
        unit: u.unit,
        type,
        currency: cur,
        cost: Math.round(cost * u.factor),
        price,
        minPrice: Math.round(price * 0.9),
        maxDisc,
        eff: "01/01/2026",
        exp: "31/12/2026",
        status: "Active",
        note: "",
        /* A generated line carries no ladder. The volume steps that existed
           were the eight hand-built products', and they moved into the seed
           whole rather than being re-derived here. */
        qtyBreaks: [],
      });
    }
  };

  if (master?.price_private) push("S", STANDARD_LIST, "Standard", master.price_private, 8);
  if (master?.price_dealer) push("D", "PL-DEALER-2026", "Dealer", master.price_dealer, 12);
  if (master?.price_government) push("G", "PL-GOV-2026", "Government", master.price_government, 0);

  PRICING[code] = lines;
  return lines;
}

/* ============================================================
   THE CATALOGUE PRICE — one way in, for everybody

   `product.price` used to be this, and every screen read it
   directly. It is gone: a selling price depends on which list
   is being quoted and in which unit, and a single number on the
   product could only ever be one of those.

   Two sources answer, in order:

     · an explicit price line, for the eight hand-built products
       whose prices moved into `data/pricing.ts`
     · the price list master, which already carries all four
       tiers for the other 751

   Zero means genuinely unpriced, and every caller shows that as
   a dash rather than as free. A product with no price is a real
   state here — 8 rows in the master have no price at all.
   ============================================================ */

/** The price list master row behind a product, by code or by its row key. */
function masterRowFor(p: ProductRow): PriceMasterRow | null {
  const byCode = priceMasterByProduct(p.code);
  const hit = byCode.find((r) => r.status === "OK") ?? byCode[0];
  if (hit) return hit;
  /* 51 rows have no product code; the product carries the row's own key
     instead, which is the only handle those have. */
  const row = p.priceRef?.row;
  return row ? (priceMasterRows().find((r) => r.code === row) ?? null) : null;
}

/**
 * The standard catalogue price of a product, in the unit asked for.
 *
 * The stock unit by default. `0` when nothing prices it — never a guess.
 */
export function catalogPrice(code: string, unit?: string): number {
  const p = PRODUCTS.find((x) => x.code === code);
  if (!p) return 0;
  const want = unit || p.unit;

  const line = (PRICING[code] ?? []).find(
    (l) => l.priceList === STANDARD_LIST && l.unit === want && l.status !== "Expired",
  );
  if (line?.price) return line.price;

  /* No line in that unit: take the stock unit's price and convert. Better a
     converted figure than none, and the pricing screen is where somebody
     sets the box price properly. */
  const base =
    (PRICING[code] ?? []).find(
      (l) => l.priceList === STANDARD_LIST && l.unit === p.unit && l.status !== "Expired",
    )?.price ?? masterRowFor(p)?.price_private ?? masterRowFor(p)?.price_government ?? 0;

  if (!(base > 0)) return 0;
  const factor = unitFactor(p, want);
  /* Rounded only when it has been multiplied. Rounding a price that was
     already right turned 17,166.67 into 17,167 — a change nobody asked for,
     on a figure that came straight out of the price file. */
  return factor === 1 ? base : Math.round(base * factor);
}

/**
 * What the arithmetic would say for a unit, given the same list's price for
 * the stock unit. Null when there is nothing to compare against — the stock
 * unit itself, or a list that does not price it.
 *
 * Shown BESIDE the typed price rather than replacing it: the gap between the
 * two is the volume discount, and it is the number worth seeing.
 */
export function impliedUnitPrice(
  lines: PriceLine[],
  line: PriceLine,
  p: ProductRow,
): number | null {
  const factor = unitFactor(p, line.unit);
  if (factor === 1) return null;
  const base = lines.find((l) => l.priceList === line.priceList && l.unit === p.unit);
  if (!base || !(base.price > 0)) return null;
  return Math.round(base.price * factor);
}

/** Catalogue for the pricing workspace: real products plus the spec samples. */
export function pricingProducts() {
  const src = PRODUCTS.map((p) => ({
    code: p.code,
    name: p.name,
    brand: p.brand,
    cat: p.cat,
    unit: p.unit,
    icon: p.icon,
  }));
  const extras = [
    { code: "CMP-A3", name: "Composite A3", brand: "A-DENT", cat: "Composite", unit: "Syringe", icon: "🦷" },
    { code: "CMP-A5", name: "Composite A5", brand: "A-DENT", cat: "Composite", unit: "Syringe", icon: "🦷" },
  ];
  for (const e of extras) if (!src.some((p) => p.code === e.code)) src.unshift(e);
  return src;
}
