import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  REDEEM_BASIS_TH,
  redeemPreview,
  redeemQuota,
  redeemRounds,
  redeemShortfall,
  type RedeemBasis,
} from "@/lib/domain/promotion-redeem";
import {
  PROMOTIONS,
  applyPromotionPatch,
  getPromotion,
  promotionApprovalLevel,
  promotionFloorBreaches,
  promotionRedeemBreaches,
  promotionRedeemQuota,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { priceMasterByProduct } from "@/lib/domain/price-master";

/* ============================================================
   สิทธิแลกซื้อ — §2 ของ Promotion-Types-2-3-Spec

   ปัญหาของชนิดนี้คือ **การหาร** ไม่ใช่ขั้นบันได ครบเกณฑ์กี่รอบก็ได้สิทธิ
   เท่านั้นรอบ ทวีคูณเต็มจำนวน เศษทิ้ง

   ถ้าใครเอา `tierFor` มาใช้ จะได้ "ขั้นที่ยอดตกอยู่" ซึ่งไม่ทวีคูณ — คนซื้อ
   200,000 จะได้สิทธิเท่าคนซื้อ 50,000 และถ้าเอา `bestLadder` มาใช้ จะได้การ
   จับคู่หลายขั้นที่ไม่มีอยู่ในปัญหานี้ ทั้งสองแบบให้เลขที่ดูสมเหตุสมผลและผิด
   ข้อสุดท้ายของไฟล์ปักที่บรรทัด import ว่าไม่มีการเรียกข้ามกัน
   ============================================================ */

const PROMO_SNAP = JSON.stringify(PROMOTIONS);

beforeEach(() => {
  PROMOTIONS.length = 0;
  PROMOTIONS.push(...(JSON.parse(PROMO_SNAP) as PromotionRow[]));
});

describe("§2.1 redeemRounds — ครบกี่รอบ เศษทิ้ง", () => {
  /** เคสบังคับในสเปค — เกณฑ์ 50,000 บาท ต่อสิทธิ 3 ชิ้น */
  const T = 50_000;
  const rounds = (actual: number) => redeemRounds(T, "amount", actual);

  it("49,999 → 0 รอบ", () => {
    expect(rounds(49_999)).toBe(0);
  });

  it("50,000 → 1 รอบ", () => {
    expect(rounds(50_000)).toBe(1);
  });

  it("100,000 → 2 รอบ", () => {
    expect(rounds(100_000)).toBe(2);
  });

  it("120,000 → 2 รอบ เศษ 20,000 ทิ้ง ไม่ปัดขึ้น", () => {
    /* สิทธิที่ปัดขึ้นคือของที่บริษัทจ่ายให้ฟรีครึ่งรอบทุกใบ */
    expect(rounds(120_000)).toBe(2);
    expect(rounds(149_999)).toBe(2);
    expect(rounds(150_000)).toBe(3);
  });

  it("เกณฑ์ 0 · ติดลบ · ไม่ใช่ตัวเลข → 0 รอบ ไม่หารด้วยศูนย์", () => {
    expect(redeemRounds(0, "amount", 100_000)).toBe(0);
    expect(redeemRounds(-50_000, "amount", 100_000)).toBe(0);
    expect(redeemRounds(null, "amount", 100_000)).toBe(0);
    expect(redeemRounds(Number.NaN, "amount", 100_000)).toBe(0);
    /* และผลต้องเป็นจำนวนจริง ไม่ใช่ Infinity ที่ไหลไปโผล่บนหน้าจอ */
    expect(Number.isFinite(redeemRounds(0, "amount", 100_000))).toBe(true);
  });

  it("ยอดที่ยังไม่ถึงหรือไม่ใช่ตัวเลข → 0 รอบ", () => {
    expect(rounds(0)).toBe(0);
    expect(rounds(-1)).toBe(0);
    expect(redeemRounds(T, "amount", Number.NaN)).toBe(0);
    expect(redeemRounds(T, "amount", Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("ยังไม่ได้เลือกว่านับจากอะไร → 0 รอบ", () => {
    /* โปรที่ยังไม่บอกว่านับเงินหรือนับชิ้น ยังให้สิทธิใครไม่ได้ */
    expect(redeemRounds(T, "", 100_000)).toBe(0);
    expect(redeemRounds(T, "ของแปลก" as RedeemBasis, 100_000)).toBe(0);
  });

  it("นับจากจำนวนชิ้นใช้สูตรเดียวกัน ต่างแค่หน่วยที่ผู้เรียกส่งมา", () => {
    expect(redeemRounds(20, "qty", 19)).toBe(0);
    expect(redeemRounds(20, "qty", 20)).toBe(1);
    expect(redeemRounds(20, "qty", 48)).toBe(2);
    /* เลขเดียวกัน เกณฑ์เดียวกัน ผลเดียวกัน — หน่วยเป็นเรื่องของผู้เรียก */
    expect(redeemRounds(20, "qty", 48)).toBe(redeemRounds(20, "amount", 48));
  });

  it("คำที่ใช้เรียกสองแบบบอกหน่วยไว้ในตัว", () => {
    expect(REDEEM_BASIS_TH.amount).toContain("บาท");
    expect(REDEEM_BASIS_TH.qty).toContain("ชิ้น");
    expect(REDEEM_BASIS_TH[""]).toContain("ยังไม่ได้เลือก");
  });
});

describe("§2.1 redeemQuota — เพดานชิ้นที่แลกซื้อได้", () => {
  it("เคสบังคับ 50,000 → 3 ชิ้น ครบทั้งสี่แถว", () => {
    const table = [
      { actual: 49_999, rounds: 0, quota: 0 },
      { actual: 50_000, rounds: 1, quota: 3 },
      { actual: 100_000, rounds: 2, quota: 6 },
      { actual: 120_000, rounds: 2, quota: 6 },
    ];
    for (const row of table) {
      const r = redeemRounds(50_000, "amount", row.actual);
      expect(r, `ยอด ${row.actual}`).toBe(row.rounds);
      expect(redeemQuota(r, 3), `ยอด ${row.actual}`).toBe(row.quota);
    }
  });

  it("ยังไม่กรอกเพดานต่อรอบ → 0 ไม่ใช่ 1", () => {
    /* การเดาว่า "อย่างน้อยหนึ่งชิ้น" ทำให้โปรที่คนตั้งลืมกรอกให้สิทธิเงียบ ๆ
       แล้วไม่มีใครรู้ว่าตั้งใจหรือลืม ฟอร์มเป็นคนบังคับให้กรอก */
    expect(redeemQuota(2, null)).toBe(0);
    expect(redeemQuota(2, 0)).toBe(0);
    expect(redeemQuota(2, -3)).toBe(0);
  });

  it("ศูนย์รอบได้ศูนย์ชิ้น ไม่ว่าเพดานเท่าไหร่", () => {
    expect(redeemQuota(0, 3)).toBe(0);
    expect(redeemQuota(-1, 3)).toBe(0);
  });

  it("เศษของรอบและของเพดานถูกปัดลง", () => {
    expect(redeemQuota(2.9, 3)).toBe(6);
    expect(redeemQuota(2, 3.9)).toBe(6);
  });
});

describe("§2.2 ขาดอีกเท่าไหร่ถึงรอบถัดไป", () => {
  it("ยังไม่ถึงเกณฑ์ — บอกส่วนที่ขาด", () => {
    expect(redeemShortfall(50_000, "amount", 0)).toBe(50_000);
    expect(redeemShortfall(50_000, "amount", 49_999)).toBe(1);
  });

  it("ถึงพอดี — ขาดอีกเต็มเกณฑ์สำหรับรอบถัดไป", () => {
    expect(redeemShortfall(50_000, "amount", 50_000)).toBe(50_000);
    expect(redeemShortfall(50_000, "amount", 120_000)).toBe(30_000);
  });

  it("เกณฑ์ยังไม่กรอก หรือยังไม่เลือกฐาน → 0 ไม่ใช่ค่าลวง", () => {
    expect(redeemShortfall(null, "amount", 10_000)).toBe(0);
    expect(redeemShortfall(50_000, "", 10_000)).toBe(0);
  });
});

describe("§2.2 ตารางตัวอย่าง — เห็นกฎเศษทิ้งด้วยตา", () => {
  it("ทุกช่องมาจากตัวคำนวณ ไม่ได้คิดใหม่", () => {
    const rows = redeemPreview(50_000, "amount", 3, [49_999, 50_000, 100_000, 120_000]);
    expect(rows.map((r) => r.rounds)).toEqual([0, 1, 2, 2]);
    expect(rows.map((r) => r.quota)).toEqual([0, 3, 6, 6]);
    expect(rows.map((r) => r.remainder)).toEqual([49_999, 0, 0, 20_000]);
    for (const r of rows) {
      expect(r.rounds).toBe(redeemRounds(50_000, "amount", r.actual));
      expect(r.quota).toBe(redeemQuota(r.rounds, 3));
    }
  });

  it("เกณฑ์ยังไม่กรอก — ทุกแถวได้ศูนย์ ไม่พัง", () => {
    const rows = redeemPreview(null, "amount", 3, [1000, 2000]);
    expect(rows.every((r) => r.rounds === 0 && r.quota === 0)).toBe(true);
  });
});

describe("ตัวห่อในโดเมน — ยืมกฎราคาของชนิดที่สอง ไม่มีสูตรที่สอง", () => {
  it("ราคาที่ใช้ทดสอบยังเป็นชุดที่เทสต์นี้อ้าง", () => {
    const rows = priceMasterByProduct("H-AD001-01");
    const row = rows.find((r) => r.status === "OK") ?? rows[0];
    expect(row!.price_private).toBe(1750);
    expect(row!.price_last).toBe(880);
  });

  it("PM-0009 ลด 55% จาก 1,750 = 787.50 ต่ำกว่าขั้นต่ำ 880 → ผู้จัดการอนุมัติ", () => {
    const p = getPromotion("PM-0009")!;
    expect(p.kind).toBe("redeem");
    const breaches = promotionRedeemBreaches(p);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].price).toBe(787.5);
    expect(breaches[0].floor).toBe(880);
    expect(promotionApprovalLevel(p)).toBe("manager");
  });

  it("PM-0010 ลด 30% = 1,225 ยังสูงกว่าขั้นต่ำ → ระดับแอดมิน", () => {
    const p = getPromotion("PM-0010")!;
    expect(promotionRedeemBreaches(p)).toEqual([]);
    expect(promotionApprovalLevel(p)).toBe("admin");
  });

  it("โควตาของโปรจริง — ครบ 50,000 ได้ 3 ชิ้น · 120,000 ได้ 6", () => {
    const p = getPromotion("PM-0009")!;
    expect(promotionRedeemQuota(p, 49_999)).toEqual({ rounds: 0, quota: 0 });
    expect(promotionRedeemQuota(p, 50_000)).toEqual({ rounds: 1, quota: 3 });
    expect(promotionRedeemQuota(p, 120_000)).toEqual({ rounds: 2, quota: 6 });
  });

  it("โปรแลกซื้อที่นับจากจำนวนชิ้นก็เดินทางเดียวกัน", () => {
    const p = getPromotion("PM-0010")!;
    expect(p.redeemBasis).toBe("qty");
    expect(promotionRedeemQuota(p, 19)).toEqual({ rounds: 0, quota: 0 });
    expect(promotionRedeemQuota(p, 41)).toEqual({ rounds: 2, quota: 2 });
  });

  it("ตัวห่อเงียบกับชนิดที่ไม่ใช่ของตัวเอง และของแถมไม่คิดแลกซื้อเป็นขั้น", () => {
    const fg = getPromotion("PM-0001")!;
    expect(promotionRedeemBreaches(fg)).toEqual([]);

    /* และกลับกัน — สูตรของแถมต้องไม่แตะโปรแลกซื้อ */
    const rd = getPromotion("PM-0009")!;
    expect(promotionFloorBreaches(rd)).toEqual([]);
  });

  it("แก้เงื่อนไขหรือสิทธิหลังอนุมัติแล้ว ต้องขออนุมัติใหม่", () => {
    /* ทุกช่องของชนิดนี้อยู่ใน PROMOTION_CONDITION_FIELDS — เปลี่ยนเพดานต่อรอบ
       คือเปลี่ยนว่าลูกค้าได้อะไร ไม่ใช่การแก้คำบนเอกสาร */
    const p = getPromotion("PM-0010")!;
    expect(p.approvedAt).not.toBe("");
    p.status = "Paused";
    p.dirtySinceApproval = false;

    expect(applyPromotionPatch(p, { redeemPerRound: 5 }).ok).toBe(true);
    expect(p.dirtySinceApproval).toBe(true);
  });
});

describe("ตัวคำนวณตัวที่สามห้ามเรียกสองตัวแรก", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "lib", "domain", f), "utf8");
  const importsOf = (f: string) =>
    read(f)
      .split(/\r?\n/)
      .filter((l) => /^\s*(import|export).*from|require\(/.test(l))
      .join(" · ");

  /**
   * เนื้อโค้ดโดยไม่มีคอมเมนต์
   *
   * คอมเมนต์หัวไฟล์ **ต้อง** เอ่ยชื่ออีกสองตัวคำนวณ เพราะสเปคสั่งให้อธิบายว่า
   * ทำไมแยกกัน เทสต์ที่ห้ามเอ่ยชื่อเลยจะขัดกับข้อกำหนดนั้นเอง — ที่ต้องห้าม
   * คือการ **เรียกใช้** ในโค้ดจริง
   */
  const codeOf = (f: string) =>
    read(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("promotion-redeem.ts ไม่ import ใครเลย — เป็นเลขคณิตล้วน", () => {
    /* ที่ประกอบกับ PromotionRow และกับกฎราคา อยู่ที่ตัวห่อใน promotion.ts
       ไม่ใช่ที่นี่ ถ้าไฟล์นี้เริ่ม import อะไร แปลว่ามันเริ่มรู้เรื่องที่ไม่ใช่
       หน้าที่ของมัน */
    expect(importsOf("promotion-redeem.ts")).toBe("");
    const code = codeOf("promotion-redeem.ts");
    expect(code).not.toContain("bestLadder");
    expect(code).not.toContain("tierFor");
    expect(code).not.toContain("effectiveUnitPrice");
  });

  it("อีกสองไฟล์ก็ไม่ import ตัวนี้กลับ", () => {
    expect(importsOf("promotion-ladder.ts")).not.toContain("promotion-redeem");
    expect(importsOf("promotion-discount.ts")).not.toContain("promotion-redeem");
  });

  it("ไฟล์นี้อธิบายไว้ว่าทำไมแยก และแยกด้วยเหตุผลอะไร", () => {
    const src = read("promotion-redeem.ts");
    expect(src).toContain("ไม่มีขั้น");
    expect(src).toContain("ทวีคูณ");
  });

  it("กฎราคาถูกยืมมาใช้ ไม่ได้ลอกมาเขียนใหม่", () => {
    /* ตัวห่อใน promotion.ts ต้องเรียก discountFloorBreaches ของเดิม
       ถ้ามีใครลอกสูตร percent มาไว้ในไฟล์นี้ ข้อนี้จะแดง */
    const domain = readFileSync(join(process.cwd(), "lib", "domain", "promotion.ts"), "utf8");
    expect(domain).toContain("discountFloorBreaches(p.redeemItems");

    /* และไฟล์เลขคณิตต้องไม่รู้เรื่องราคาเลย ไม่มีคำว่าราคาขั้นต่ำหรือส่วนลด
       อยู่ในโค้ดของมัน (คอมเมนต์อธิบายได้ โค้ดห้ามแตะ) */
    const code = codeOf("promotion-redeem.ts");
    expect(code).not.toContain("price_last");
    expect(code).not.toContain("discPct");
    expect(code).not.toContain("priceMaster");
  });
});
