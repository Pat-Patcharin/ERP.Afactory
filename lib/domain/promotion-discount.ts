import { priceMasterByProduct } from "./price-master";
import { priceForCustomer, type CustomerPriceTier } from "./pricing-master";
import { PRODUCTS } from "./product";

/* ============================================================
   ขั้นส่วนลดราคา — จำนวนนี้ตกอยู่ในขั้นไหน

   ⚠️ ไฟล์นี้แยกจาก `promotion-ladder.ts` โดยตั้งใจ และห้ามรวมกัน

   สองไฟล์หน้าตาคล้ายกันมาก — ทั้งคู่รับ "ขั้น" กับ "จำนวน" แล้วคืนผล
   แต่เป็นคนละปัญหาเชิงอัลกอริทึม:

     แถมสินค้า   ขั้น **ผสมกันได้** และใช้ซ้ำได้ → unbounded knapsack
                 จ่าย 13 กับขั้น 10 และ 3 = ใช้ทั้งสองขั้น แถม 5

     ส่วนลดราคา  ขั้น **ไม่ผสมกัน** → หาว่าจำนวนตกอยู่ในขั้นไหน
                 ซื้อ 3 กับขั้น 1·2·3 = ได้ราคาขั้น 3 ทั้งสามชิ้น
                 ไม่ใช่ขั้น 2 หนึ่งชุด บวกขั้น 1 อีกชิ้น

   ถ้าใครเห็นว่า "ก็เป็นขั้นบันไดเหมือนกัน" แล้วเอา `bestLadder` มาใช้ที่นี่
   จะได้ผลผิดที่ดูเหมือนถูก — ซื้อ 3 จะถูกจับคู่เป็น 2+1 แล้วคิดราคาผสม
   ซึ่งไม่มีใครสังเกตเพราะตัวเลขที่ออกมาก็ยังต่ำกว่าราคาปกติ
   **ไฟล์นี้ไม่ import `bestLadder` และห้าม import** เทสต์ปักไว้แล้ว

   ⚠️ ห้ามอ่าน `catalogPrice()` ตรง ๆ เป็นฐานคิดเปอร์เซ็นต์

   `catalogPrice("CMP-A3")` คืน **0** เพราะสินค้าตัวอย่างไม่ได้อยู่ใน
   `PL-STD-2026` ⇒ ส่วนลด 15% จากศูนย์ = ศูนย์ และไม่มีอะไรฟ้อง
   ตัวคำนวณข้างล่างจึง **รับราคามาตรฐานเข้ามาเป็นพารามิเตอร์**
   ไม่ไปอ่านแหล่งใดเอง ส่วนตัวต่อ (adapter) ที่อ่านราคากลาง 807 แถว
   อยู่ท้ายไฟล์และแยกออกจากตัวคำนวณอย่างชัดเจน
   ============================================================ */

/** ราคาที่โปรให้ — ตายตัว หรือ ลดเป็นเปอร์เซ็นต์จากราคามาตรฐาน */
export type DiscountMode = "price" | "percent";

export const DISCOUNT_MODE_TH: Record<DiscountMode, string> = {
  price: "ราคาตายตัวต่อชิ้น",
  percent: "ส่วนลด % จากราคามาตรฐาน",
};

export interface DiscountTier {
  /** จำนวนขั้นต่ำของขั้นนี้ — ซื้อเท่านี้ขึ้นไปได้ราคาขั้นนี้ */
  minQty: number;
  /** ราคาตายตัวต่อชิ้น · null เมื่อโปรนี้คิดเป็นเปอร์เซ็นต์ */
  price: number | null;
  /** ส่วนลดเป็นเปอร์เซ็นต์จากราคามาตรฐาน · null เมื่อโปรนี้ตั้งราคาตายตัว */
  discPct: number | null;
}

/**
 * ขั้นที่คำนวณได้จริง
 *
 * `minQty` ต้องเป็นจำนวนเต็มบวก ขั้นที่ตกเกณฑ์ถูกข้ามเงียบ ๆ เพราะฟอร์มเป็น
 * คนตรวจว่าคนกรอกกรอกอะไรมา — ที่นี่แค่ต้องไม่ตอบผิด
 */
const usable = (tiers: readonly DiscountTier[]): DiscountTier[] =>
  tiers.filter((t) => Number.isInteger(t.minQty) && t.minQty > 0);

/**
 * ขั้นที่จำนวนนี้ได้ — หรือ null เมื่อยังไม่ถึงขั้นต่ำสุด
 *
 * **ขั้นสูงสุดครอบทุกจำนวนที่มากกว่า** ตั้งถึงขั้น 3 แล้วซื้อ 10 ได้ราคาขั้น 3
 * ไม่ใช่ไม่ได้อะไรเพราะ "ไม่มีขั้นสำหรับ 10"
 *
 * ขั้นไม่ผสมกัน จึงไม่มีการจับคู่ ไม่มีเศษ และไม่มี DP — คำถามเดียวคือ
 * "ขั้นที่ใหญ่ที่สุดซึ่งจำนวนนี้ถึง คือขั้นไหน"
 */
export function tierFor(
  tiers: readonly DiscountTier[],
  qty: number,
): DiscountTier | null {
  const n = Number.isFinite(qty) ? Math.floor(qty) : 0;
  if (n <= 0) return null;

  let hit: DiscountTier | null = null;
  for (const t of usable(tiers)) {
    if (t.minQty > n) continue;
    if (!hit || t.minQty > hit.minQty) hit = t;
  }
  return hit;
}

/**
 * ราคาต่อชิ้นที่ขั้นนี้ให้
 *
 * เปอร์เซ็นต์คิดจาก **ราคามาตรฐาน** ที่ผู้เรียกส่งเข้ามา ไม่ใช่จากราคาที่ชนะ
 * ลำดับชั้น — ถ้าคิดจากราคาที่ชนะ ลูกค้าที่มีสัญญาถูกอยู่แล้วจะได้ลดซ้อนลงไป
 * อีกชั้น ซึ่งไม่ใช่สิ่งที่ "ลด 15%" หมายถึง
 *
 * คืน null เมื่อขั้นนั้นกรอกไม่ครบ หรือฐานคิดเปอร์เซ็นต์เป็นศูนย์ — ศูนย์
 * ไม่ใช่ "ฟรี" มันคือ "ไม่รู้ราคามาตรฐาน" และการเดาว่าฟรีคือความเสียหาย
 */
export function tierUnitPrice(
  tier: DiscountTier,
  mode: DiscountMode,
  standardPrice: number,
): number | null {
  if (mode === "price") {
    return tier.price !== null && tier.price >= 0 ? tier.price : null;
  }

  const pct = tier.discPct;
  if (pct === null || !(pct > 0) || pct > 100) return null;
  if (!(standardPrice > 0)) return null;
  return Math.round(standardPrice * (1 - pct / 100) * 100) / 100;
}

/** ราคาที่โปรให้สำหรับจำนวนนี้ · null เมื่อโปรไม่มีผลกับจำนวนนี้ */
export function promoUnitPrice(
  tiers: readonly DiscountTier[],
  mode: DiscountMode,
  qty: number,
  standardPrice: number,
): number | null {
  const tier = tierFor(tiers, qty);
  return tier ? tierUnitPrice(tier, mode, standardPrice) : null;
}

/* ============================================================
   กฎไม่ซ้อน — ราคาสุดท้าย = min(ราคาที่ชนะลำดับชั้น, ราคาที่โปรให้)

   โปรไม่ได้เขียนทับราคาตั้ง มันแข่งกับราคาตั้ง และแพ้ได้ ลูกค้าที่มีสัญญา
   ถูกกว่าโปรอยู่แล้ว ต้องได้ราคาสัญญาต่อไป — ไม่ใช่ถูกดันขึ้นมาเป็นราคาโปร
   เพราะ "โปรมีลำดับสูงกว่า"

   ตัวนี้เป็น pure function รับสองราคาเข้ามา ไม่อ่านแหล่งใดเอง เพื่อให้
   ผู้เรียกเป็นคนตัดสินว่า "ราคาที่ชนะ" ของบริบทนั้นคืออะไร — ระบบนี้มีสอง
   แหล่งราคาที่ไม่ต่อกัน (เมทริกซ์ `PRICING` ที่มีชั้นสัญญาแต่มี 10 สินค้า
   กับราคากลาง 807 แถวที่มีสามชั้นและเป็นสายที่เอกสารขายใช้จริง)
   ============================================================ */

export interface EffectivePrice {
  /** ราคาที่ใช้จริง */
  price: number;
  /** โปรมีผลกับราคานี้ไหม */
  fromPromo: boolean;
  /** เหตุผลที่อ่านออกได้ ใช้ทั้งบนหน้าจอและในเทสต์ */
  reason: string;
}

/**
 * ราคาสุดท้ายของหนึ่งชิ้น
 *
 * `promoPrice` เป็น null เมื่อโปรไม่เข้าเงื่อนไข — ต่างจาก 0 ซึ่งหมายถึง
 * โปรให้ฟรี และเป็นค่าที่ต้องเดินผ่านกฎ min() เหมือนราคาอื่น
 */
export function effectiveUnitPrice(
  winningPrice: number,
  promoPrice: number | null,
): EffectivePrice {
  if (promoPrice === null) {
    return { price: winningPrice, fromPromo: false, reason: "โปรไม่เข้าเงื่อนไขจำนวนนี้" };
  }
  if (promoPrice < winningPrice) {
    return { price: promoPrice, fromPromo: true, reason: "ราคาโปรต่ำกว่าราคาที่ลูกค้าได้อยู่" };
  }
  return {
    price: winningPrice,
    fromPromo: false,
    reason: "ลูกค้าได้ราคาต่ำกว่าราคาโปรอยู่แล้ว โปรจึงไม่มีผล",
  };
}

/* ============================================================
   ตัวต่อกับราคากลาง — จบตรงนี้ ไม่ปนกับตัวคำนวณข้างบน

   ข้างบนไม่รู้ว่าราคามาจากไหน ข้างล่างรู้ที่เดียวว่าอ่านจากไหน
   คนละหน้าที่ และการเตือนบนฟอร์มอ่านจากข้างล่างนี้ ไม่ได้เดาเอง
   ============================================================ */

/** สามชั้นที่ราคากลางมีจริง — เรียงจากแพงไปถูก */
export const IMPACT_TIERS: readonly CustomerPriceTier[] = ["government", "private", "dealer"];

/** ราคากลางแถวที่ใช้กับสินค้าตัวนี้ — แถวที่ขายได้ก่อน แบบเดียวกับที่อื่น */
function rowFor(code: string) {
  const rows = priceMasterByProduct(code);
  return rows.find((r) => r.status === "OK") ?? rows[0] ?? null;
}

export interface TierImpact {
  tier: CustomerPriceTier;
  /** ราคาที่ชั้นนี้ได้จากราคากลาง · null เมื่อแถวนั้นไม่มีราคาชั้นนี้ */
  tierPrice: number | null;
  /** ราคาที่โปรให้ · null เมื่อคำนวณไม่ได้ */
  promoPrice: number | null;
  final: number | null;
  promoApplies: boolean;
}

export interface ItemImpact {
  code: string;
  name: string;
  /** ราคามาตรฐาน = ราคาแคตตาล็อกเอกชนในราคากลาง — ฐานคิดเปอร์เซ็นต์ */
  standardPrice: number | null;
  floor: number | null;
  byTier: TierImpact[];
}

/**
 * โปรส่วนลดตัวนี้ทำอะไรกับแต่ละชั้นลูกค้า — คำนวณจากราคากลางจริง
 *
 * ใช้จำนวนที่ขั้นสูงสุดต้องการเป็นตัวแทน เพราะขั้นสูงสุดคือราคาที่ต่ำที่สุด
 * ที่โปรนี้ให้ได้ ถ้าขั้นที่ถูกที่สุดยังไม่ต่ำกว่าราคาของชั้นนั้น แปลว่า
 * ไม่มีจำนวนไหนที่โปรนี้จะมีผลกับชั้นนั้นเลย
 */
export function discountImpact(
  items: readonly string[],
  tiers: readonly DiscountTier[],
  mode: DiscountMode,
): ItemImpact[] {
  const steps = usable(tiers);
  const deepest = steps.reduce((m, t) => Math.max(m, t.minQty), 0);

  const out: ItemImpact[] = [];
  for (const code of items) {
    const row = rowFor(code);
    /* ราคามาตรฐานคือราคาเอกชน — CLAUDE.md เรียกช่องนั้นว่าราคาแคตตาล็อก */
    const standardPrice = row?.price_private ?? null;
    const promoPrice = deepest
      ? promoUnitPrice(steps, mode, deepest, standardPrice ?? 0)
      : null;

    out.push({
      code,
      name: PRODUCTS.find((p) => p.code === code)?.name ?? code,
      standardPrice,
      floor: row?.price_last ?? null,
      byTier: IMPACT_TIERS.map((tier) => {
        const tierPrice = row ? priceForCustomer(row, tier) : null;
        if (tierPrice === null) {
          return { tier, tierPrice, promoPrice, final: promoPrice, promoApplies: promoPrice !== null };
        }
        const eff = effectiveUnitPrice(tierPrice, promoPrice);
        return { tier, tierPrice, promoPrice, final: eff.price, promoApplies: eff.fromPromo };
      }),
    });
  }
  return out;
}

/**
 * ชั้นที่โปรนี้ไม่มีผลเลย — ทุกสินค้าในโปรได้ราคาเดิม
 *
 * §1.5 ข้อ 2 — โปรที่ดีลเลอร์ได้ถูกกว่าอยู่แล้ว คือโปรที่ไม่มีผลกับดีลเลอร์
 * ทั้งที่นับเข้างบโปรและออกสื่อไปแล้ว เป็น "กฎที่ไม่กัดใคร" ในรูปแบบธุรกิจ
 * ต่างกันแค่เสียเงินไปด้วย ต้องบอกตอนตั้งโปร ไม่ใช่ให้ไปรู้จากรายงานสิ้นเดือน
 *
 * ชั้นที่ไม่มีราคาในราคากลางไม่ถูกนับว่า "ไม่มีผล" — ไม่รู้ ต่างจากรู้ว่าไม่มีผล
 */
export function discountIneffectiveTiers(
  items: readonly string[],
  tiers: readonly DiscountTier[],
  mode: DiscountMode,
): CustomerPriceTier[] {
  /* ยังไม่มีขั้น = ยังกรอกไม่เสร็จ ต่างจากกรอกเสร็จแล้วไม่มีผล
     ถ้าตอบว่า "ไม่มีผลกับทั้งสามชั้น" ตอนตารางขั้นยังว่าง คนกรอกจะเห็นคำเตือน
     ตั้งแต่เปิดฟอร์ม แล้วเรียนรู้ที่จะกดข้ามมันไปทุกครั้ง */
  if (!usable(tiers).length) return [];

  const impact = discountImpact(items, tiers, mode);
  if (!impact.length) return [];

  return IMPACT_TIERS.filter((tier) => {
    const rows = impact
      .map((i) => i.byTier.find((b) => b.tier === tier))
      .filter((b): b is TierImpact => Boolean(b) && b!.tierPrice !== null);
    return rows.length > 0 && rows.every((b) => !b.promoApplies);
  });
}

export interface DiscountBreach {
  code: string;
  name: string;
  tier: DiscountTier;
  /** ราคาหลังลดที่ขั้นนี้ให้ */
  price: number;
  floor: number;
}

/**
 * ขั้นไหนของโปรนี้ทำให้ราคาหลังลดต่ำกว่าราคาขั้นต่ำ
 *
 * คู่ขนานกับ `promotionFloorBreaches` ของโปรแถมสินค้า แต่คนละสูตร: ของแถม
 * เทียบ **ราคาเฉลี่ยหลังเฉลี่ยของแถม** ส่วนตัวนี้เทียบ **ราคาต่อชิ้นตรง ๆ**
 * เพราะไม่มีของแถมมาเฉลี่ย รวมสองสูตรเข้าด้วยกันไม่ได้ และการเรียกผิดตัว
 * จะได้ตัวเลขที่ดูสมเหตุสมผลแต่ผิด
 */
export function discountFloorBreaches(
  items: readonly string[],
  tiers: readonly DiscountTier[],
  mode: DiscountMode,
): DiscountBreach[] {
  const out: DiscountBreach[] = [];
  for (const code of items) {
    const row = rowFor(code);
    const floor = row?.price_last ?? null;
    if (floor === null) continue;
    const standardPrice = row?.price_private ?? 0;
    const name = PRODUCTS.find((p) => p.code === code)?.name ?? code;

    for (const tier of usable(tiers)) {
      const price = tierUnitPrice(tier, mode, standardPrice);
      if (price === null) continue;
      if (price < floor) out.push({ code, name, tier, price, floor });
    }
  }
  return out;
}
