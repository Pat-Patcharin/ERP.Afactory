/**
 * A-Factory ERP — Price List Master Data types & pricing engine
 * Schema version 1.0.0 · generated 2026-08-04
 *
 * กติกาเหล็ก:
 *  1. ทุกราคาเป็นราคา "ก่อน VAT"
 *  2. ห้ามหาร 1.07 ที่ใดก็ตามก่อนคำนวณ GP
 *  3. ห้ามขายต่ำกว่า price_last โดยไม่มีการอนุมัติ
 */

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

export const PRICING_CONFIG = {
  governmentMultiplier: 1.10,
  dealerGpMin: 0.48,
  dealerGpTarget: 0.50,
  dealerMaxDiscountFromPrivate: 0.30,
  lastPriceGpMin: 0.40,
  vatRate: 0.07,
  /** ราคาที่เก็บทุกช่องเป็น ex-VAT — GP คำนวณจากราคาที่เสนอตรง ๆ */
  gpBasis: 'quoted_price_ex_vat',
  vatMustNotBeDeducted: true,
} as const;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PriceSource = 'CATALOG_SPECIAL' | 'CATALOG_LIST' | 'PRICELIST_LEGACY';
export type PriceStatus = 'OK' | 'PENDING_COST' | 'REVIEW' | 'NO_PRICE';

/**
 * ชั้นราคาที่ "ลูกค้า" ได้รับ — มีสามชั้นเท่านั้น
 * `last` ไม่อยู่ในนี้โดยตั้งใจ: มันคือเพดานล่างของทุกดีล ไม่ใช่ราคาของกลุ่มลูกค้าใด
 */
export type CustomerPriceTier = 'private' | 'government' | 'dealer';

/** ทุกชั้นราคาในไฟล์ รวม `last` ที่ใช้เป็นเกณฑ์อนุมัติ ไม่ใช่ราคาเสนอ */
export type PriceTier = CustomerPriceTier | 'last';

export interface PriceListItem {
  product_code: string;
  product_name: string;
  product_group: string | null;
  brand: string | null;
  unit: string | null;
  vendor: string | null;

  /** ต้นทุนต่อหน่วย ก่อน VAT */
  cost_thb: number | null;

  price_private: number | null;
  price_government: number | null;
  price_dealer: number | null;
  /** ราคาต่ำสุดที่ขายได้โดยไม่ต้องขออนุมัติ */
  price_last: number | null;

  /** เก็บเป็นทศนิยม: 0.4808 = 48.08% */
  gp_private: number | null;
  gp_dealer: number | null;
  gp_last: number | null;

  price_source: PriceSource;
  /** ราคาปกติในแคตตาล็อก — ใช้เมื่อโปรฯ หมดอายุ 30 ก.ย. 2569 */
  catalog_list_price: number | null;
  /** ราคาสุทธิเมื่อครบเงื่อนไขโปรฯ — ห้ามใช้เป็นราคาตั้ง */
  catalog_net_price: number | null;

  promo_catalog: string;
  promo_legacy: string;
  promo_min_qty: number | null;
  promo_free_qty: number | null;

  catalog_page: string;
  source_sheet: string;
  approval_required_below: 'price_last';
  status: PriceStatus;
  notes: string;
}

export interface PriceListFile {
  schema_version: string;
  generated_at: string;
  currency: 'THB';
  vat_included: false;
  vat_rate: number;
  source: string[];
  record_count: number;
  pricing_config: Record<string, unknown>;
  status_counts: Record<PriceStatus, number>;
  items: PriceListItem[];
}

// ─────────────────────────────────────────────────────────────
// Rounding
// ─────────────────────────────────────────────────────────────

/** ขั้นการปัด: <1,000 → 10 · <100,000 → 100 · ≥100,000 → 1,000 */
export function roundingStep(value: number): number {
  if (value < 1_000) return 10;
  if (value < 100_000) return 100;
  return 1_000;
}

/** ปัดขึ้น — ใช้กับเพดานล่าง (dealer, last) เพราะปัดลงจะทำให้ GP หลุดเกณฑ์ */
export function ceilRound(value: number): number {
  const s = roundingStep(value);
  return Math.ceil(value / s) * s;
}

/** ปัดใกล้ที่สุด — ใช้กับราคาราชการ */
export function nearestRound(value: number): number {
  const s = roundingStep(value);
  return Math.round(value / s) * s;
}

// ─────────────────────────────────────────────────────────────
// GP
// ─────────────────────────────────────────────────────────────

/**
 * GP% จากราคาที่เสนอ
 * ⚠️ ห้ามหาร 1.07 — ราคาที่ส่งเข้ามาเป็น ex-VAT อยู่แล้ว
 */
export function grossProfitRate(price: number, cost: number): number {
  if (!price || price <= 0) throw new Error('price must be > 0');
  return (price - cost) / price;
}

/** ราคาที่ทำให้ได้ GP ตามเป้า */
export function priceForGp(cost: number, targetGp: number): number {
  if (targetGp >= 1) throw new Error('targetGp must be < 1');
  return cost / (1 - targetGp);
}

// ─────────────────────────────────────────────────────────────
// Tier calculation
// ─────────────────────────────────────────────────────────────

export function computeGovernmentPrice(pricePrivate: number): number {
  return Math.max(
    nearestRound(pricePrivate * PRICING_CONFIG.governmentMultiplier),
    pricePrivate,
  );
}

/**
 * ราคา Dealer = MAX(ราคาที่ GP 48%, ราคาเอกชนลด 30%)
 * MAX ทำให้สินค้ากำไรดีไม่ถูกลดราคาเกินจำเป็น
 */
export function computeDealerPrice(pricePrivate: number, cost: number): number {
  const gpFloor = ceilRound(priceForGp(cost, PRICING_CONFIG.dealerGpMin));
  const discCap = ceilRound(pricePrivate * (1 - PRICING_CONFIG.dealerMaxDiscountFromPrivate));
  return Math.min(Math.max(gpFloor, discCap), pricePrivate);
}

/** Last price = ราคาที่ GP 40% แต่ไม่เกินราคา Dealer */
export function computeLastPrice(cost: number, priceDealer: number): number {
  return Math.min(ceilRound(priceForGp(cost, PRICING_CONFIG.lastPriceGpMin)), priceDealer);
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

export type RuleId = 'PR-01' | 'PR-02' | 'PR-03' | 'PR-04' | 'PR-05' | 'PR-06' | 'PR-07';
export type Severity = 'BLOCK' | 'ERROR' | 'WARN';

export interface PriceViolation {
  rule: RuleId;
  severity: Severity;
  message: string;
}

/** ตรวจความสอดคล้องของแถวใน master data */
export function validateItem(item: PriceListItem): PriceViolation[] {
  const v: PriceViolation[] = [];
  const { price_private: p, price_government: g, price_dealer: d, price_last: l, cost_thb: c } = item;

  if (g !== null && p !== null && g < p)
    v.push({ rule: 'PR-03', severity: 'ERROR', message: 'ราคาราชการต่ำกว่าราคาเอกชน' });
  if (d !== null && p !== null && d > p)
    v.push({ rule: 'PR-04', severity: 'ERROR', message: 'ราคา Dealer สูงกว่าราคาเอกชน' });
  if (l !== null && d !== null && l > d)
    v.push({ rule: 'PR-05', severity: 'ERROR', message: 'Last price สูงกว่าราคา Dealer' });
  if (c === null || c <= 0)
    v.push({ rule: 'PR-06', severity: 'WARN', message: 'ไม่มีต้นทุน — คำนวณ Dealer/Last ไม่ได้' });
  else if (p !== null && grossProfitRate(p, c) < PRICING_CONFIG.lastPriceGpMin)
    v.push({ rule: 'PR-07', severity: 'WARN', message: 'ราคาเอกชนมี GP ต่ำกว่า 40%' });

  return v;
}

export interface QuoteCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  gp: number | null;
  violations: PriceViolation[];
}

/**
 * ตรวจราคาที่พนักงานขายกรอกใน SR/SO
 * เรียกฟังก์ชันนี้ **หลังจาก** คำนวณส่วนลดและโปรโมชั่นทุกชั้นเสร็จแล้ว
 * ไม่ใช่ตอนกรอกราคาต่อบรรทัดอย่างเดียว
 */
export function checkQuotedPrice(item: PriceListItem, quotedPrice: number): QuoteCheckResult {
  const violations: PriceViolation[] = [];
  const cost = item.cost_thb;

  if (cost === null || cost <= 0) {
    return {
      allowed: false,
      requiresApproval: true,
      gp: null,
      violations: [{ rule: 'PR-06', severity: 'BLOCK', message: 'สินค้ายังไม่มีต้นทุน — ห้ามขายจนกว่าจะเติมต้นทุน' }],
    };
  }

  const gp = grossProfitRate(quotedPrice, cost);

  if (item.price_last !== null && quotedPrice < item.price_last)
    violations.push({
      rule: 'PR-01',
      severity: 'BLOCK',
      message: `ต่ำกว่า Last price (${item.price_last.toLocaleString()}) — ต้องขออนุมัติ`,
    });

  if (gp < PRICING_CONFIG.lastPriceGpMin)
    violations.push({
      rule: 'PR-02',
      severity: 'BLOCK',
      message: `GP ${(gp * 100).toFixed(1)}% ต่ำกว่าเกณฑ์ 40%`,
    });

  const blocked = violations.some((x) => x.severity === 'BLOCK');
  return { allowed: !blocked, requiresApproval: blocked, gp, violations };
}

/**
 * ราคาตั้งต้นสำหรับลูกค้า — ทางเข้าหลักที่ทุกเอกสารขายต้องใช้
 *
 * รับได้แค่สามชั้น ส่ง `'last'` เข้ามาจะไม่ผ่าน type check ตั้งแต่ตอน compile
 * เพราะ Last price คือเพดานล่างที่ต้องขออนุมัติจึงจะขายได้ ไม่ใช่ราคาที่เสนอ
 * ให้ลูกค้ากลุ่มไหนโดยอัตโนมัติ
 */
export function priceForCustomer(item: PriceListItem, tier: CustomerPriceTier): number | null {
  switch (tier) {
    case 'private': return item.price_private;
    case 'government': return item.price_government;
    case 'dealer': return item.price_dealer;
  }
}

/**
 * อ่านราคาช่องใดก็ได้รวม `last`
 *
 * ⚠️ ใช้กับการตรวจสอบและการอนุมัติเท่านั้น (เช่นเทียบว่าราคาที่กรอกต่ำกว่า
 * Last price ไหม) การเลือกราคาให้ลูกค้าให้ใช้ `priceForCustomer()`
 */
export function priceForTier(item: PriceListItem, tier: PriceTier): number | null {
  return tier === 'last' ? item.price_last : priceForCustomer(item, tier);
}
