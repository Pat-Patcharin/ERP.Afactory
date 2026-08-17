/* ============================================================
   สิทธิแลกซื้อ — ครบเงื่อนไขกี่รอบ ได้สิทธิกี่ชิ้น

   ⚠️ ไฟล์นี้แยกจาก `promotion-ladder.ts` และ `promotion-discount.ts`
   โดยตั้งใจ และ **ไม่ import ทั้งสองไฟล์นั้น** เทสต์อ่านบรรทัด import ปักไว้

   สามไฟล์รับ "เงื่อนไข" กับ "จำนวน" แล้วคืนผล แต่เป็นคนละปัญหา:

     แถมสินค้า   ขั้นผสมกันได้ ใช้ซ้ำได้ → unbounded knapsack
     ส่วนลดราคา  ขั้นไม่ผสม             → จำนวนตกอยู่ในขั้นไหน
     แลกซื้อ     **ไม่มีขั้นเลย**        → ยอดหารเกณฑ์ ได้กี่รอบ

   แลกซื้อไม่มีขั้นบันได มันมีเกณฑ์เดียวที่ทวีคูณ — ครบ 50,000 ได้ 1 รอบ
   ครบ 100,000 ได้ 2 รอบ ถ้าใครเอา `tierFor` มาใช้ที่นี่ จะได้ "ขั้นที่ยอดตก
   อยู่" ซึ่งหยุดที่ขั้นสูงสุดและไม่ทวีคูณ ⇒ ลูกค้าที่ซื้อ 200,000 จะได้สิทธิ
   เท่ากับคนที่ซื้อ 50,000 และถ้าเอา `bestLadder` มาใช้ จะได้การจับคู่หลายขั้น
   ซึ่งไม่มีอยู่ในปัญหานี้เลย ทั้งสองแบบให้ตัวเลขที่ดูสมเหตุสมผลและผิด

   ไฟล์นี้ไม่อ่านราคา ไม่รู้จัก `PromotionRow` และไม่มี UI — เป็นเลขคณิตล้วน
   กฎ min() กับการตรวจ `price_last` ของสินค้าที่แลกซื้อ อยู่ที่ตัวห่อใน
   `promotion.ts` ซึ่งเรียก `discountFloorBreaches` ของเดิมมาใช้ ไม่มีสูตรที่สอง
   ============================================================ */

/** เงื่อนไขนับจากอะไร — `""` คือยังไม่ได้เลือก และไม่มีค่าเริ่มต้นโดยตั้งใจ */
export type RedeemBasis = "" | "amount" | "qty";

export const REDEEM_BASIS_TH: Record<RedeemBasis, string> = {
  "": "— ยังไม่ได้เลือก —",
  amount: "ยอดเงินก่อนภาษี (บาท)",
  qty: "จำนวนชิ้น",
};

/**
 * ครบเงื่อนไขกี่รอบ
 *
 * **ทวีคูณเต็มจำนวน เศษทิ้ง** ยอด 120,000 กับเกณฑ์ 50,000 ได้ 2 รอบ เศษ
 * 20,000 หายไป ไม่ปัดขึ้นเป็น 3 — สิทธิที่ปัดขึ้นคือของที่บริษัทจ่ายให้ฟรี
 * ครึ่งรอบทุกใบ
 *
 * `basis` ไม่เปลี่ยนสูตร มันเปลี่ยนแค่ว่า `actual` ที่ส่งมาคือเงินหรือจำนวนชิ้น
 * — โครงเดียวกันสองแบบย่อยตามสเปค §2.1 ผู้เรียกเป็นคนรู้ว่านับอะไรมา
 * รับ `basis` ไว้เพื่อให้ผู้เรียกไม่ต้องจำว่าเลขที่ถืออยู่คือหน่วยไหน และเพื่อ
 * ปฏิเสธเมื่อยังไม่ได้เลือก — โปรที่ยังไม่บอกว่านับอะไรยังให้สิทธิใครไม่ได้
 *
 * เกณฑ์ 0 หรือติดลบคืน 0 รอบ ไม่ใช่หารด้วยศูนย์ — เกณฑ์ที่ยังไม่กรอกคือโปรที่
 * ยังตั้งไม่เสร็จ ไม่ใช่โปรที่ให้สิทธิไม่จำกัด
 */
export function redeemRounds(
  threshold: number | null,
  basis: RedeemBasis,
  actual: number,
): number {
  if (basis !== "amount" && basis !== "qty") return 0;

  const t = Number(threshold);
  if (!Number.isFinite(t) || t <= 0) return 0;

  const a = Number(actual);
  if (!Number.isFinite(a) || a <= 0) return 0;

  return Math.floor(a / t);
}

/**
 * เพดานชิ้นที่แลกซื้อได้ทั้งใบ
 *
 * `perRound` เป็นเพดานต่อรอบ ไม่ใช่ขั้นต่ำ — ลูกค้าซื้อน้อยกว่าได้ เกินไม่ได้
 * (กฎที่กันการเกินอยู่ที่จุดเขียนบรรทัดในเอกสาร ซึ่งยังไม่ทำในเฟสนี้ ดู PM-3)
 *
 * `perRound` ที่ยังไม่กรอกให้ 0 ไม่ใช่ 1 — การเดาว่า "อย่างน้อยหนึ่งชิ้น"
 * ทำให้โปรที่คนตั้งลืมกรอกให้สิทธิ 1 ชิ้นเงียบ ๆ แล้วไม่มีใครรู้ว่าตั้งใจ
 * หรือลืม ฟอร์มเป็นคนบังคับให้กรอก ที่นี่แค่ต้องไม่เดาแทน
 */
export function redeemQuota(rounds: number, perRound: number | null): number {
  const r = Number(rounds);
  const per = Number(perRound);
  if (!Number.isFinite(r) || r <= 0) return 0;
  if (!Number.isFinite(per) || per <= 0) return 0;
  return Math.floor(r) * Math.floor(per);
}

/** ยอดที่ยังขาดอีกเท่าไหร่ถึงจะได้รอบถัดไป · 0 เมื่อบอกไม่ได้ */
export function redeemShortfall(
  threshold: number | null,
  basis: RedeemBasis,
  actual: number,
): number {
  if (basis !== "amount" && basis !== "qty") return 0;
  const t = Number(threshold);
  if (!Number.isFinite(t) || t <= 0) return 0;

  const a = Number.isFinite(Number(actual)) && Number(actual) > 0 ? Number(actual) : 0;
  const done = Math.floor(a / t);
  return (done + 1) * t - a;
}

export interface RedeemPreviewRow {
  /** ยอดที่ลองใส่ — เงินหรือจำนวนชิ้นตาม basis */
  actual: number;
  rounds: number;
  quota: number;
  /** เศษที่ทิ้งไป — ตัวเลขที่ทำให้กฎเศษทิ้งเห็นด้วยตา */
  remainder: number;
}

/**
 * ตารางตัวอย่างสำหรับหน้าจอ
 *
 * ค่าทุกช่องมาจาก `redeemRounds` / `redeemQuota` ตัวเดียวกับที่เอกสารจะใช้
 * ไม่ได้คำนวณซ้ำที่หน้าจอ — ยอดตัวอย่างเป็นพารามิเตอร์ เพราะเกณฑ์แต่ละโปร
 * ต่างกัน และตารางที่ตรึงยอดไว้จะกลายเป็นตารางที่ไม่มีแถวไหนถึงเกณฑ์
 */
export function redeemPreview(
  threshold: number | null,
  basis: RedeemBasis,
  perRound: number | null,
  amounts: readonly number[],
): RedeemPreviewRow[] {
  return amounts.map((actual) => {
    const rounds = redeemRounds(threshold, basis, actual);
    const t = Number(threshold);
    return {
      actual,
      rounds,
      quota: redeemQuota(rounds, perRound),
      remainder: Number.isFinite(t) && t > 0 ? actual - rounds * t : actual,
    };
  });
}
