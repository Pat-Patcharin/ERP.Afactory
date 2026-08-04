import type { BusinessPartner } from "@/data/partners";
import { priceForCustomer, type CustomerPriceTier, type PriceListItem } from "./pricing-master";
import { priceMasterByProduct, type PriceMasterRow } from "./price-master";

/* ============================================================
   PRICE TIER — which of the three customer prices a partner gets.

   BP Master carries two different dimensions that are easy to
   confuse:

     · ROLE      customer / supplier / dealer / …  (core, many at once)
     · CUSTOMER  Government | Private              (bp_customer extension)

   The tier comes from both, and the extension is the source of
   truth for "is this a government body": that is a fact about the
   legal entity, not a setting a salesperson can flip. `cls.priceGroup`
   is a core field about pricing policy and is deliberately NOT
   consulted — where the two disagree the mismatch is reported rather
   than silently resolved.

   `price_last` never appears here. It is the floor below which a deal
   needs approval, not a tier any customer is entitled to.
   ============================================================ */

export const TIER_TH: Record<CustomerPriceTier, string> = {
  private: "ราคาเอกชน",
  government: "ราคาราชการ",
  dealer: "ราคา Dealer",
};

/** What `cls.priceGroup` would imply, for the mismatch check only. */
const PRICE_GROUP_TIER: Record<string, CustomerPriceTier> = {
  Retail: "private",
  "Chain Clinic": "private",
  Contract: "private",
  Dealer: "dealer",
  Government: "government",
};

const isDealer = (bp: Partial<BusinessPartner>) =>
  Boolean(bp.roles?.dealer) || bp.customer?.bizType === "Dealer";

const isGovernment = (bp: Partial<BusinessPartner>) => bp.customer?.custType === "Government";

/**
 * The tier a partner buys at.
 *
 * Order matters: a dealer resells, so it buys at dealer price whatever kind
 * of entity it is registered as. Everything else falls to government or
 * private on the extension's own answer.
 */
export function tierForPartner(bp: Partial<BusinessPartner>): CustomerPriceTier {
  if (isDealer(bp)) return "dealer";
  if (isGovernment(bp)) return "government";
  return "private";
}

/* ---------- Notices ---------- */

export type TierNoticeKind = "price-group-mismatch" | "government-dealer";

export interface TierNotice {
  kind: TierNoticeKind;
  tone: "warn" | "danger";
  title: string;
  /** Written for the salesperson looking at a document, with the numbers in. */
  message: string;
}

/** Percentage one tier sits above another, rounded to a whole number. */
function gapPct(from: number, to: number): number | null {
  if (!from || from <= 0 || !to || to <= 0) return null;
  return Math.round(((to - from) / from) * 100);
}

/**
 * How much the chosen tier differs from the one `cls.priceGroup` implies,
 * measured on a real row so the message can carry a figure rather than an
 * adjective. Falls back to the tier definition (government = private × 1.10)
 * when the partner has no lines to measure.
 */
function tierGapText(chosen: CustomerPriceTier, implied: CustomerPriceTier, sample?: PriceListItem): string {
  const a = sample ? priceForCustomer(sample, implied) : null;
  const b = sample ? priceForCustomer(sample, chosen) : null;
  const pct = a !== null && b !== null ? gapPct(a, b) : null;

  if (pct === null) {
    /* No measurable row — state the rule instead of inventing a number. */
    if (chosen === "government" && implied === "private") return "สูงกว่าราคาเอกชน 10%";
    return `ต่างจาก${TIER_TH[implied]}`;
  }
  if (pct === 0) return `เท่ากับ${TIER_TH[implied]}`;
  return pct > 0
    ? `สูงกว่า${TIER_TH[implied]} ${pct}%`
    : `ต่ำกว่า${TIER_TH[implied]} ${Math.abs(pct)}%`;
}

/**
 * Everything about this partner's tier that a human should look at.
 *
 * Returned for the BP record and for every sales document, because the place
 * the price is actually used is where the salesperson needs to see it.
 */
export function tierNotices(
  bp: Partial<BusinessPartner>,
  sample?: PriceListItem,
): TierNotice[] {
  const out: TierNotice[] = [];
  const tier = tierForPartner(bp);

  /* ---- The price group on the core record says something else ---- */
  const group = bp.cls?.priceGroup ?? "";
  const implied = PRICE_GROUP_TIER[group];
  if (implied && implied !== tier) {
    out.push({
      kind: "price-group-mismatch",
      tone: "warn",
      title: `ระบบเลือก${TIER_TH[tier]} (${tierGapText(tier, implied, sample)})`,
      message:
        `ประเภทลูกค้าในระเบียนคือ ${bp.customer?.custType ?? "—"}` +
        `${isDealer(bp) ? " และถูกตั้งเป็นตัวแทนจำหน่าย" : ""} ` +
        `แต่ Price Group ตั้งไว้เป็น "${group}" ซึ่งหมายถึง${TIER_TH[implied]} — ` +
        `ระบบยึดประเภทลูกค้าเป็นหลัก เพราะเป็นข้อเท็จจริงของนิติบุคคล ไม่ใช่ค่าที่ตั้งได้`,
    });
  }

  /* ---- Dealer price for a government body ---- */
  if (isDealer(bp) && isGovernment(bp)) {
    out.push({
      kind: "government-dealer",
      tone: "danger",
      title: `ลูกค้าราชการแต่ได้${TIER_TH.dealer} (${tierGapText("dealer", "government", sample)})`,
      message:
        "ระเบียนนี้เป็นหน่วยงานราชการและถูกติ๊กเป็นตัวแทนจำหน่ายพร้อมกัน จึงได้ราคาต่ำที่สุดในสามชั้น — " +
        "เป็นการผสมที่ผิดปกติ ควรมีผู้อนุมัติตรวจสอบก่อนออกเอกสาร",
    });
  }

  return out;
}

/* ---------- Resolving a price ---------- */

export interface ResolvedPrice {
  tier: CustomerPriceTier;
  tierLabel: string;
  price: number | null;
  /** The catalogue row the price came from. */
  row: PriceMasterRow | null;
  /** Floor for this row — below it the deal needs approval. */
  floor: number | null;
  /** No cost on the row means no sale until someone fills it in. */
  sellable: boolean;
  notices: TierNotice[];
}

/**
 * The catalogue price this partner pays for this product.
 *
 * Returns the floor alongside it but never as the answer: `price_last` is
 * what the approval check compares against, not what gets quoted.
 */
export function resolveCustomerPrice(
  bp: Partial<BusinessPartner>,
  productCode: string,
): ResolvedPrice {
  const tier = tierForPartner(bp);
  /* A product code can name more than one row — five are duplicated in the
     master — so take the first sellable one, else the first at all. */
  const candidates = priceMasterByProduct(productCode);
  const row = candidates.find((r) => r.status === "OK") ?? candidates[0] ?? null;

  return {
    tier,
    tierLabel: TIER_TH[tier],
    price: row ? priceForCustomer(row, tier) : null,
    row,
    floor: row?.price_last ?? null,
    sellable: row?.status === "OK",
    notices: tierNotices(bp, row ?? undefined),
  };
}

export type { CustomerPriceTier };
