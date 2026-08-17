import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DISCOUNT_MODE_TH,
  IMPACT_TIERS,
  discountFloorBreaches,
  discountImpact,
  discountIneffectiveTiers,
  effectiveUnitPrice,
  promoUnitPrice,
  tierFor,
  tierUnitPrice,
  type DiscountTier,
} from "@/lib/domain/promotion-discount";
import {
  PROMOTIONS,
  getPromotion,
  promotionApprovalLevel,
  promotionDiscountBreaches,
  promotionFloorBreaches,
  promotionIneffectiveTiers,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { priceMasterByProduct } from "@/lib/domain/price-master";

/* ============================================================
   ขั้นส่วนลดราคา — §1 ของ Promotion-Types-2-3-Spec

   ทุกข้อในไฟล์นี้ทดสอบสิ่งเดียวกันจากคนละมุม: **ขั้นส่วนลดไม่ผสมกัน**
   ถ้าใครเอา `bestLadder` มาใช้แทน `tierFor` ทุกข้อในกลุ่มแรกจะแดง
   และข้อสุดท้ายของไฟล์ปักไว้ที่ตัวไฟล์เลยว่าห้าม import ข้ามกัน

   ราคาที่ใช้เทียบเป็นราคากลางจริงของ `D-AD001-01`
     ราชการ 720 · เอกชน 650 · ดีลเลอร์ 460 · ขั้นต่ำ 280
   ไม่ได้เขียนตัวเลขทับไว้ในเทสต์ — อ่านจากราคากลางแล้ว assert ว่าตรง
   เพื่อให้เทสต์แดงเมื่อข้อมูลเปลี่ยน ไม่ใช่เงียบแล้วทดสอบเคสอื่นแทน
   ============================================================ */

const CODE = "D-AD001-01";

/** ขั้นตามสเปค §1.1 — 1 = 1,000 · 2 = 700 · 3 = 650 */
const SPEC_TIERS: DiscountTier[] = [
  { minQty: 1, price: 1000, discPct: null },
  { minQty: 2, price: 700, discPct: null },
  { minQty: 3, price: 650, discPct: null },
];

const PROMO_SNAP = JSON.stringify(PROMOTIONS);

beforeEach(() => {
  PROMOTIONS.length = 0;
  PROMOTIONS.push(...(JSON.parse(PROMO_SNAP) as PromotionRow[]));
});

describe("§1.1 tierFor — จำนวนตกอยู่ในขั้นไหน", () => {
  it("ขั้น 1·2·3 กับจำนวน 1, 2, 3, 5, 10", () => {
    const at = (qty: number) => tierFor(SPEC_TIERS, qty)?.price ?? null;
    expect(at(1)).toBe(1000);
    expect(at(2)).toBe(700);
    expect(at(3)).toBe(650);
    /* ขั้นสูงสุดครอบทุกจำนวนที่มากกว่า — ไม่ใช่ "ไม่มีขั้นสำหรับ 10" */
    expect(at(5)).toBe(650);
    expect(at(10)).toBe(650);
  });

  it("ขั้นสูงสุดครอบจำนวนที่มากกว่า แม้ห่างกันมาก", () => {
    expect(tierFor(SPEC_TIERS, 10_000)?.minQty).toBe(3);
  });

  it("ซื้อ 0 · ติดลบ · ไม่ถึงขั้นต่ำสุด · ขั้นว่าง — ไม่พัง คืน null", () => {
    expect(tierFor(SPEC_TIERS, 0)).toBeNull();
    expect(tierFor(SPEC_TIERS, -5)).toBeNull();
    expect(tierFor(SPEC_TIERS, Number.NaN)).toBeNull();
    expect(tierFor([], 10)).toBeNull();
    /* ขั้นเริ่มที่ 5 แล้วซื้อ 4 = ยังไม่ได้อะไร ไม่ใช่ได้ขั้น 5 */
    expect(tierFor([{ minQty: 5, price: 600, discPct: null }], 4)).toBeNull();
  });

  it("ขั้นที่กรอกมั่ว (จำนวน 0 · ทศนิยม · ติดลบ) ถูกข้าม ไม่ทำให้ทั้งก้อนพัง", () => {
    const messy: DiscountTier[] = [
      { minQty: 0, price: 10, discPct: null },
      { minQty: -3, price: 20, discPct: null },
      { minQty: 2.5, price: 30, discPct: null },
      { minQty: 4, price: 640, discPct: null },
    ];
    expect(tierFor(messy, 3)).toBeNull();
    expect(tierFor(messy, 4)?.price).toBe(640);
  });

  it("ลำดับที่กรอกไม่สำคัญ — ขั้นที่ใหญ่ที่สุดที่ถึงคือคำตอบ", () => {
    const shuffled = [SPEC_TIERS[2], SPEC_TIERS[0], SPEC_TIERS[1]];
    expect(tierFor(shuffled, 3)?.price).toBe(650);
  });

  it("ไม่ผสมขั้น — ซื้อ 3 ได้ราคาขั้น 3 ทั้งสามชิ้น", () => {
    /* ข้อนี้คือหัวใจของไฟล์นี้ ราคาต่อชิ้นคือ 650 ทุกชิ้น รวม 1,950
       ถ้าใครทำให้ขั้นผสมกันได้ (เช่นเรียก bestLadder) จะได้ 2 ชิ้นที่ 700
       บวก 1 ชิ้นที่ 1,000 = 2,400 หรือชุดอื่นที่ไม่ใช่ 1,950 */
    const unit = promoUnitPrice(SPEC_TIERS, "price", 3, 0);
    expect(unit).toBe(650);
    expect(unit! * 3).toBe(1950);

    /* และซื้อ 5 ก็ยังเป็นราคาขั้น 3 ทุกชิ้น ไม่ใช่ขั้น 3 หนึ่งชุดแล้วเศษ 2
       ไปคิดราคาขั้น 2 */
    expect(promoUnitPrice(SPEC_TIERS, "price", 5, 0)! * 5).toBe(3250);
  });
});

describe("§1.1 ราคาที่ขั้นให้ — ตายตัว และเปอร์เซ็นต์", () => {
  it("แบบตายตัวใช้ตัวเลขที่กรอก ไม่แตะราคามาตรฐาน", () => {
    /* ส่งราคามาตรฐานเป็นอะไรก็ไม่เปลี่ยนคำตอบของโหมดราคาตายตัว */
    expect(tierUnitPrice(SPEC_TIERS[2], "price", 650)).toBe(650);
    expect(tierUnitPrice(SPEC_TIERS[2], "price", 99_999)).toBe(650);
  });

  it("เปอร์เซ็นต์คิดจากราคามาตรฐานที่ส่งเข้ามา", () => {
    const t: DiscountTier = { minQty: 1, price: null, discPct: 15 };
    expect(tierUnitPrice(t, "percent", 1000)).toBe(850);
    expect(tierUnitPrice(t, "percent", 650)).toBe(552.5);
  });

  it("ฐานคิดเปอร์เซ็นต์เป็นศูนย์ = ไม่รู้ราคามาตรฐาน คืน null ไม่ใช่ 0", () => {
    /* catalogPrice("CMP-A3") คืน 0 จริงในระบบนี้ ถ้าตีความว่าฟรี จะได้
       ส่วนลดจากศูนย์แล้วขายศูนย์บาทโดยไม่มีอะไรฟ้อง */
    const t: DiscountTier = { minQty: 1, price: null, discPct: 15 };
    expect(tierUnitPrice(t, "percent", 0)).toBeNull();
  });

  it("ขั้นที่กรอกไม่ครบตามโหมด คืน null", () => {
    expect(tierUnitPrice({ minQty: 1, price: null, discPct: 20 }, "price", 650)).toBeNull();
    expect(tierUnitPrice({ minQty: 1, price: 500, discPct: null }, "percent", 650)).toBeNull();
    /* ลด 0% หรือเกิน 100% ไม่ใช่ส่วนลด */
    expect(tierUnitPrice({ minQty: 1, price: null, discPct: 0 }, "percent", 650)).toBeNull();
    expect(tierUnitPrice({ minQty: 1, price: null, discPct: 120 }, "percent", 650)).toBeNull();
  });

  it("คำที่ใช้เรียกสองโหมดบอกฐานคิดไว้ในตัว", () => {
    expect(DISCOUNT_MODE_TH.percent).toContain("ราคามาตรฐาน");
  });
});

describe("§1.4 กฎไม่ซ้อน — min(ราคาที่ชนะ, ราคาที่โปรให้) สี่เคส", () => {
  it("สัญญา 700 · โปร 850 → 700 (โปรไม่มีผล)", () => {
    const r = effectiveUnitPrice(700, 850);
    expect(r.price).toBe(700);
    expect(r.fromPromo).toBe(false);
    expect(r.reason).toContain("ต่ำกว่าราคาโปร");
  });

  it("กลุ่มลูกค้า 900 · โปร 850 → 850 (โปรชนะ)", () => {
    const r = effectiveUnitPrice(900, 850);
    expect(r.price).toBe(850);
    expect(r.fromPromo).toBe(true);
  });

  it("มาตรฐาน 1,000 · โปร 850 → 850", () => {
    expect(effectiveUnitPrice(1000, 850).price).toBe(850);
  });

  it("แบบตายตัว: โปร 700 · สัญญา 650 → 650", () => {
    const promo = tierUnitPrice({ minQty: 1, price: 700, discPct: null }, "price", 0);
    expect(effectiveUnitPrice(650, promo).price).toBe(650);
  });

  it("ราคาเท่ากันพอดี → ไม่นับว่าโปรมีผล", () => {
    /* เท่ากันแล้วบอกว่าโปรมีผล จะทำให้งบโปรถูกหักทั้งที่ลูกค้าไม่ได้อะไรเพิ่ม */
    const r = effectiveUnitPrice(850, 850);
    expect(r.price).toBe(850);
    expect(r.fromPromo).toBe(false);
  });

  it("โปรไม่เข้าเงื่อนไข (null) ต่างจากโปรให้ฟรี (0)", () => {
    expect(effectiveUnitPrice(650, null)).toEqual({
      price: 650,
      fromPromo: false,
      reason: "โปรไม่เข้าเงื่อนไขจำนวนนี้",
    });
    const free = effectiveUnitPrice(650, 0);
    expect(free.price).toBe(0);
    expect(free.fromPromo).toBe(true);
  });
});

describe("§1.5 ข้อ 2 — โปรนี้ไม่มีผลกับกลุ่มไหน คำนวณจากตารางราคาจริง", () => {
  it("ราคากลางของสินค้าที่ใช้ทดสอบยังเป็นชุดที่เทสต์นี้อ้าง", () => {
    const rows = priceMasterByProduct(CODE);
    const row = rows.find((r) => r.status === "OK") ?? rows[0];
    expect(row).toBeTruthy();
    expect(row!.price_government).toBe(720);
    expect(row!.price_private).toBe(650);
    expect(row!.price_dealer).toBe(460);
    expect(row!.price_last).toBe(280);
  });

  it("ขั้นถูกสุด 470 ยังแพงกว่าราคาดีลเลอร์ 460 → ไม่มีผลกับดีลเลอร์เท่านั้น", () => {
    const tiers: DiscountTier[] = [
      { minQty: 5, price: 600, discPct: null },
      { minQty: 30, price: 470, discPct: null },
    ];
    expect(discountIneffectiveTiers([CODE], tiers, "price")).toEqual(["dealer"]);

    /* และผลรายชั้นบอกได้ว่าใครได้เท่าไหร่ ไม่ใช่แค่บอกว่าไม่มีผล */
    const [item] = discountImpact([CODE], tiers, "price");
    const byTier = Object.fromEntries(item.byTier.map((b) => [b.tier, b]));
    expect(byTier.government.final).toBe(470);
    expect(byTier.government.promoApplies).toBe(true);
    expect(byTier.private.final).toBe(470);
    expect(byTier.dealer.final, "ดีลเลอร์ต้องได้ราคาเดิม").toBe(460);
    expect(byTier.dealer.promoApplies).toBe(false);
  });

  it("ลดลึกจนถูกกว่าทุกชั้น → ไม่มีชั้นไหนที่ไม่มีผล", () => {
    const deep: DiscountTier[] = [{ minQty: 1, price: 300, discPct: null }];
    expect(discountIneffectiveTiers([CODE], deep, "price")).toEqual([]);
  });

  it("ลดน้อยจนไม่ชนะสักชั้น → ไม่มีผลทั้งสามชั้น", () => {
    const shallow: DiscountTier[] = [{ minQty: 1, price: 800, discPct: null }];
    expect(discountIneffectiveTiers([CODE], shallow, "price")).toEqual([...IMPACT_TIERS]);
  });

  it("ไม่มีขั้น หรือไม่มีสินค้า → ไม่สรุปว่าไม่มีผล", () => {
    /* ยังกรอกไม่เสร็จ ต่างจากกรอกเสร็จแล้วไม่มีผล การเตือนตอนกรอกไม่เสร็จ
       คือการเตือนที่คนกรอกเรียนรู้ที่จะกดข้าม */
    expect(discountIneffectiveTiers([CODE], [], "price")).toEqual([]);
    expect(discountIneffectiveTiers([], SPEC_TIERS, "price")).toEqual([]);
  });

  it("เปอร์เซ็นต์คิดจากราคาเอกชน ไม่ใช่จากราคาของชั้นนั้นเอง", () => {
    /* ลด 15% จาก 650 = 552.5 — ดีลเลอร์ที่ได้ 460 อยู่แล้วต้องไม่ถูกลด
       ต่อจาก 460 ลงไปอีก 15% (= 391) นั่นคือส่วนลดซ้อนที่ไม่มีใครสั่ง */
    const pct: DiscountTier[] = [{ minQty: 1, price: null, discPct: 15 }];
    const [item] = discountImpact([CODE], pct, "percent");
    expect(item.standardPrice).toBe(650);
    const byTier = Object.fromEntries(item.byTier.map((b) => [b.tier, b]));
    expect(byTier.private.final).toBe(552.5);
    expect(byTier.dealer.final).toBe(460);
  });
});

describe("§1.5 ข้อ 1 — ราคาหลังลดหลุดราคาขั้นต่ำ", () => {
  it("ลด 60% จาก 650 = 260 ต่ำกว่าขั้นต่ำ 280", () => {
    const tiers: DiscountTier[] = [
      { minQty: 3, price: null, discPct: 15 },
      { minQty: 50, price: null, discPct: 60 },
    ];
    const breaches = discountFloorBreaches([CODE], tiers, "percent");
    expect(breaches).toHaveLength(1);
    expect(breaches[0].tier.discPct).toBe(60);
    expect(breaches[0].price).toBe(260);
    expect(breaches[0].floor).toBe(280);
  });

  it("ขั้นที่ยังอยู่เหนือขั้นต่ำไม่ถูกฟ้อง", () => {
    expect(discountFloorBreaches([CODE], [{ minQty: 5, price: 300, discPct: null }], "price")).toEqual([]);
  });

  it("สินค้าที่ไม่มีแถวในราคากลางถูกข้าม ไม่ใช่ถือว่าผ่าน", () => {
    /* ข้ามเพราะไม่รู้ ไม่ใช่เพราะไม่มีปัญหา — ตัวที่ตัดสินว่าขายได้ไหม
       คือ checkQuotedPrice ตอนออกเอกสาร */
    expect(discountFloorBreaches(["ไม่มีรหัสนี้"], SPEC_TIERS, "price")).toEqual([]);
  });
});

describe("โปรส่วนลดกับด่านอนุมัติ", () => {
  it("โปรส่วนลดที่หลุดขั้นต่ำต้องขึ้นผู้จัดการ", () => {
    const p = getPromotion("PM-0008")!;
    expect(p.kind).toBe("price-discount");
    expect(promotionDiscountBreaches(p).length).toBeGreaterThan(0);
    expect(promotionApprovalLevel(p)).toBe("manager");
  });

  it("โปรส่วนลดที่ไม่หลุดขั้นต่ำและงบไม่เกินเพดาน อยู่ระดับแอดมิน", () => {
    const p = getPromotion("PM-0007")!;
    expect(promotionDiscountBreaches(p)).toEqual([]);
    expect(promotionApprovalLevel(p)).toBe("admin");
  });

  it("PM-0007 เป็นตัวอย่างจริงของโปรที่ไม่มีผลกับดีลเลอร์", () => {
    expect(promotionIneffectiveTiers(getPromotion("PM-0007")!)).toEqual(["dealer"]);
  });

  it("promotionFloorBreaches ไม่คำนวณโปรส่วนลดเป็นของแถม", () => {
    /* ฉีดขั้นของแถมค้างไว้ในโปรส่วนลด — เกิดได้จริงถ้าใครเปลี่ยนชนิดของโปร
       ที่กรอกไว้แล้ว ถ้าตัวนี้ไม่ดูชนิด มันจะคิดราคาเฉลี่ยของขั้นที่ไม่มีอยู่
       จริง แล้วส่งผลไปถึงว่าใครอนุมัติได้ */
    const p = getPromotion("PM-0007")!;
    p.tiers = [{ buy: 1, free: 99 }];
    expect(promotionFloorBreaches(p), "โปรส่วนลดไม่มีของแถมให้เฉลี่ย").toEqual([]);
    expect(promotionApprovalLevel(p), "ยังตัดสินจากสูตรส่วนลด").toBe("admin");

    /* และของจริงยังทำงาน — โปรแถมสินค้าที่แถมหนักยังถูกฟ้องเหมือนเดิม */
    const fg = getPromotion("PM-0002")!;
    expect(fg.kind).toBe("free-goods");
    expect(promotionFloorBreaches(fg).length).toBeGreaterThan(0);
  });

  it("ตัวห่อเงียบกับชนิดที่ไม่ใช่ของตัวเอง", () => {
    const fg = getPromotion("PM-0001")!;
    expect(promotionDiscountBreaches(fg)).toEqual([]);
    expect(promotionIneffectiveTiers(fg)).toEqual([]);
  });
});

describe("ตัวคำนวณสามตัวห้ามเรียกข้ามกัน", () => {
  /* เส้นทางจาก cwd ไม่ใช่ import.meta.url — URL แบบ file:// บน Windows
     ถูกตีความเป็น C:\lib\domain\... แล้วอ่านไม่เจอ */
  const read = (f: string) => readFileSync(join(process.cwd(), "lib", "domain", f), "utf8");

  /* ตรวจที่บรรทัด import เท่านั้น — คอมเมนต์ที่อธิบายว่าทำไมสองไฟล์นี้
     ต้องแยกกัน จำเป็นต้องเอ่ยชื่ออีกไฟล์ และเป็นสิ่งที่สเปคสั่งให้มี
     เทสต์ที่ห้ามเอ่ยชื่อเลยจะขัดกับข้อกำหนดข้อนั้นเอง */
  const importsOf = (f: string) =>
    read(f)
      .split(/\r?\n/)
      .filter((l) => /^\s*(import|export).*from|require\(/.test(l))
      .join(" · ");

  it("promotion-discount.ts ไม่ import ตัวคำนวณของแถม", () => {
    /* ปักที่ไฟล์เลย เพราะการรวมสองตัวนี้ให้ผลผิดที่ดูเหมือนถูก
       ใครเรียก bestLadder ที่นี่ จะแดงที่ข้อนี้ */
    const imports = importsOf("promotion-discount.ts");
    expect(imports).not.toContain("promotion-ladder");
    expect(imports).not.toContain("bestLadder");
    /* และในเนื้อโค้ดก็ต้องไม่มีการเรียก แม้จะไม่ผ่าน import (เช่น dynamic) */
    expect(read("promotion-discount.ts")).not.toContain("bestLadder(");
  });

  it("promotion-ladder.ts ไม่ import ตัวคำนวณส่วนลด และไม่อ่านราคา", () => {
    const imports = importsOf("promotion-ladder.ts");
    expect(imports).not.toContain("promotion-discount");
    /* §3 ของสเปครอบแรก — ไฟล์นั้นตอบคำถามเดียวและไม่อ่านราคาเลย */
    expect(imports).not.toContain("price-master");
    expect(read("promotion-ladder.ts")).not.toContain("tierFor(");
  });

  it("ทั้งสองไฟล์อธิบายไว้ว่าทำไมแยก", () => {
    expect(read("promotion-discount.ts")).toContain("ไม่ผสม");
    expect(read("promotion-ladder.ts")).toContain("ผสมกันได้");
  });
});
