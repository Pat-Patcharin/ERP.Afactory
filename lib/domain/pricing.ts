import { PRICE_LISTS as RAW, PL_PRIORITY_ENGINE, type PriceList } from "@/data/price-lists";
import { PRICING as RAW_PRICING } from "@/data/pricing";
import { PRODUCTS } from "./product";
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

export interface PriceLine {
  id: string;
  priceList: string;
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
 * Seed price lines for a product that has no explicit matrix, so the pricing
 * workspace can open any product from the master rather than only the samples.
 */
export function ensurePricing(code: string): PriceLine[] {
  if (PRICING[code]) return PRICING[code];

  const p = PRODUCTS.find((x) => x.code === code);
  if (!p) {
    PRICING[code] = [];
    return PRICING[code];
  }

  const cost = p.pricing?.lastCost ?? p.pricing?.avgCost ?? Math.round((p.price ?? 0) * 0.6);
  const cur = p.pricing?.currency ?? "THB";
  const lines: PriceLine[] = [];

  const push = (suffix: string, list: string, type: string, price: number, maxDisc: number) =>
    lines.push({
      id: `PP-${code}-${suffix}`,
      priceList: list,
      type,
      currency: cur,
      cost,
      price,
      minPrice: Math.round(price * 0.9),
      maxDisc,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "",
    });

  if (p.pricing?.retail) push("S", "PL-STD-2026", "Standard", p.pricing.retail, 8);
  if (p.pricing?.dealer) push("D", "PL-DEALER-2026", "Dealer", p.pricing.dealer, 12);
  if (p.pricing?.gov) push("G", "PL-GOV-2026", "Government", p.pricing.gov, 0);

  PRICING[code] = lines;
  return lines;
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
