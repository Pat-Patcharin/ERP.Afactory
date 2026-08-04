import type { BadgeTone, RecordBase } from "@/lib/types";
import {
  PRICING_CONFIG,
  validateItem,
  type PriceListItem,
  type PriceSource,
  type PriceStatus,
  type PriceTier,
  type PriceViolation,
} from "./pricing-master";
import {
  duplicateProductCodes,
  loadPriceListItems,
  priceListMeta,
} from "./pricelist-repo";

/* ============================================================
   PRICE LIST MASTER — the read model the screens render.

   Four price tiers per SKU, the GP the generator recorded, and the
   data problems the spec says have to be visible rather than tidied
   away: 51 rows with no product code and 5 codes used twice.

   Nothing here recomputes GP from a price. The file stores it, and
   the one rule that outranks everything else is that GP is measured
   on the quoted ex-VAT price — never on price ÷ 1.07. Where a
   percentage is needed it comes from the stored `gp_*` field.
   ============================================================ */

const pad = (n: number, w: number) => String(n).padStart(w, "0");

export interface PriceMasterRow extends RecordBase, PriceListItem {
  /**
   * Row key. Not the product code: 51 rows have none and 5 codes are used
   * twice, so a synthetic key is the only thing that addresses a row
   * unambiguously. The product code stays a column of its own.
   */
  code: string;
  /** Position in the generated file, 1-based — what the key counts. */
  seq: number;

  /** Display name, so the shared engines have something to title a row with. */
  name: string;
  icon: string;

  /* ---- Data problems the spec asks the module to surface ---- */
  /** No product code at all — 51 rows from the Orthodontic-Wire sheet. */
  missingCode: boolean;
  /** Product code shared with another row. */
  duplicateCode: boolean;
  /** government ≥ private ≥ dealer ≥ last holds for this row. */
  tierOrderOk: boolean;
  /** PR-03 … PR-07 from the shared validator. */
  violations: PriceViolation[];
  /** Any violation that stops the row being sold. */
  sellable: boolean;

  /* ---- Convenience for the list ---- */
  hasPromo: boolean;
  /** Percentage form of the stored decimals, for display only. */
  gpPrivatePct: number | null;
  gpDealerPct: number | null;
  gpLastPct: number | null;
}

/* ---------- Tones ---------- */

export const PRICE_STATUS_TONE: Record<PriceStatus, BadgeTone> = {
  OK: "success",
  REVIEW: "warning",
  /* A row with no cost cannot price a deal — the spec says block the sale. */
  PENDING_COST: "danger",
  NO_PRICE: "neutral",
};

export const PRICE_SOURCE_TONE: Record<PriceSource, BadgeTone> = {
  CATALOG_SPECIAL: "primary",
  CATALOG_LIST: "info",
  PRICELIST_LEGACY: "neutral",
};

export const PRICE_STATUS_TEXT: Record<PriceStatus, string> = {
  OK: "ครบทั้ง 4 ชั้นราคา ใช้งานได้",
  PENDING_COST: "ไม่มีต้นทุน คำนวณ Dealer/Last ไม่ได้ — ห้ามขายจนกว่าจะเติมต้นทุน",
  REVIEW: "ต้นทุนสูงจนราคาเอกชนทำ GP 48% ไม่ได้ — ต้องทบทวนราคาหรือต้นทุน",
  NO_PRICE: "ไม่มีราคาตั้ง",
};

/** Green at or above the dealer floor, amber down to the last-price floor. */
export function gpTone(gp: number | null): BadgeTone {
  if (gp === null) return "neutral";
  if (gp >= PRICING_CONFIG.dealerGpMin) return "success";
  if (gp >= PRICING_CONFIG.lastPriceGpMin) return "warning";
  return "danger";
}

/** 0.4808 → 48.1. Display only; the stored decimal stays the source. */
export const gpPercent = (gp: number | null): number | null =>
  gp === null ? null : Math.round(gp * 1000) / 10;

/* ---------- Tier order ---------- */

/** government ≥ private ≥ dealer ≥ last, skipping tiers the row has not got. */
export function tierOrderHolds(i: PriceListItem): boolean {
  const ladder = [i.price_government, i.price_private, i.price_dealer, i.price_last].filter(
    (v): v is number => v !== null,
  );
  return ladder.every((v, n) => n === 0 || ladder[n - 1] >= v);
}

export const TIER_LABEL: Record<PriceTier, string> = {
  government: "ราคาราชการ",
  private: "ราคาเอกชน",
  dealer: "ราคา Dealer",
  last: "Last Price",
};

/* ---------- Build ---------- */

let cache: PriceMasterRow[] | null = null;

function build(): PriceMasterRow[] {
  const dupes = new Set(duplicateProductCodes());

  return loadPriceListItems().map((item, n) => {
    const violations = validateItem(item);

    return {
      ...item,
      code: `PLM-${pad(n + 1, 4)}`,
      seq: n + 1,
      name: item.product_name,
      icon: "🏷️",

      missingCode: !item.product_code,
      duplicateCode: Boolean(item.product_code) && dupes.has(item.product_code),
      tierOrderOk: tierOrderHolds(item),
      violations,
      /* Only a missing cost blocks outright; the rest are warnings a human
         resolves. Mirrors checkQuotedPrice(), which refuses without a cost. */
      sellable: item.status === "OK",

      hasPromo: Boolean(item.promo_catalog || item.promo_legacy),
      gpPrivatePct: gpPercent(item.gp_private),
      gpDealerPct: gpPercent(item.gp_dealer),
      gpLastPct: gpPercent(item.gp_last),
    };
  });
}

export const priceMasterRows = (): PriceMasterRow[] => (cache ??= build());

export function invalidatePriceMaster() {
  cache = null;
}

export const getPriceMasterRow = (code: string) =>
  priceMasterRows().find((r) => r.code === code) ?? null;

/** Every row sharing this product code — a duplicate resolves to several. */
export const priceMasterByProduct = (product: string) =>
  priceMasterRows().filter((r) => r.product_code === product);

/* ---------- Summary ---------- */

export interface PriceMasterSummary {
  total: number;
  ok: number;
  pendingCost: number;
  review: number;
  noPrice: number;
  missingCode: number;
  duplicateCode: number;
  tierOrderBroken: number;
  withPromo: number;
  /** Catalogue value at the private tier — an order-of-magnitude figure. */
  privateValue: number;
  generatedAt: string;
  schemaVersion: string;
}

export function priceMasterSummary(): PriceMasterSummary {
  const rows = priceMasterRows();
  const meta = priceListMeta();
  const by = (f: (r: PriceMasterRow) => boolean) => rows.filter(f).length;

  return {
    total: rows.length,
    ok: by((r) => r.status === "OK"),
    pendingCost: by((r) => r.status === "PENDING_COST"),
    review: by((r) => r.status === "REVIEW"),
    noPrice: by((r) => r.status === "NO_PRICE"),
    missingCode: by((r) => r.missingCode),
    duplicateCode: by((r) => r.duplicateCode),
    tierOrderBroken: by((r) => !r.tierOrderOk),
    withPromo: by((r) => r.hasPromo),
    privateValue: rows.reduce((t, r) => t + (r.price_private ?? 0), 0),
    generatedAt: meta.generatedAt,
    schemaVersion: meta.schemaVersion,
  };
}

/** Rows the validator flagged, worst first — the panel under the table. */
export const flaggedRows = () =>
  priceMasterRows()
    .filter((r) => r.violations.length > 0 || !r.tierOrderOk || r.duplicateCode)
    .sort((a, b) => b.violations.length - a.violations.length);

export { priceListMeta, priceListConfig } from "./pricelist-repo";
export { PRICING_CONFIG } from "./pricing-master";
export type { PriceListItem, PriceSource, PriceStatus, PriceTier, PriceViolation };
