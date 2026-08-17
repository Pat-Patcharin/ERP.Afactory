import { describe, expect, it } from "vitest";
import { bestLadder, type LadderTier } from "@/lib/domain/promotion-ladder";
import {
  TRY_QTY_MAX,
  averageUnitPrice,
  clampTryQty,
  ladderSuggestion,
  ladderUsesText,
  tryLadder,
} from "@/lib/domain/promotion";

/* ============================================================
   ขั้นบันไดของแถม

   สิ่งที่เทสต์ชุดนี้ต้องพิสูจน์ไม่ใช่ "ตัวเลขออกมาสวย" แต่คือ
   **โค้ดตอบถูกในเคสที่วิธีง่าย ๆ ตอบผิด** เพราะวิธีง่าย ๆ ตอบผิด
   แบบเงียบ ๆ — ได้คำตอบที่ดูสมเหตุสมผล ลูกค้าได้ของแถมน้อยกว่า
   ที่ควร และไม่มีใครรู้

   จึงมี greedy ทั้งสองแบบเขียนไว้เป็นตัวเทียบในไฟล์นี้ และทุกเคส
   ที่มันผิดถูกยืนยันสองด้าน: DP ตอบเท่าไหร่ และ greedy ตอบเท่าไหร่
   ถ้าวันหนึ่ง DP ถูกเขียนใหม่เป็น greedy เทสต์พวกนี้จะแดงทันที
   ============================================================ */

/** โปรตัวอย่างในสเปค §3.2 */
const SPEC: LadderTier[] = [
  { buy: 3, free: 1 },
  { buy: 10, free: 4 },
  { buy: 30, free: 15 },
];

/* ---------- ตัวเทียบ: วิธีที่สเปค §3.3 ห้าม ---------- */

/** หยิบขั้นใหญ่สุดที่ถึงแล้วจบ ไม่สนเศษ */
function greedyLargestOnly(tiers: LadderTier[], qty: number): number {
  const hit = [...tiers].sort((a, b) => b.buy - a.buy).find((t) => t.buy <= qty);
  return hit ? hit.free : 0;
}

/** หยิบขั้นใหญ่ลงมา แล้วเก็บเศษต่อ — ดูฉลาดกว่า แต่ยังผิด */
function greedyWithRemainder(tiers: LadderTier[], qty: number): number {
  let left = qty;
  let free = 0;
  for (const t of [...tiers].sort((a, b) => b.buy - a.buy)) {
    while (t.buy <= left) {
      free += t.free;
      left -= t.buy;
    }
  }
  return free;
}

/**
 * นับทุกส่วนผสมที่เป็นไปได้ตรง ๆ
 *
 * ตัวเทียบที่ **ไม่สมมติ optimal substructure** เลย — มันไล่จำนวนรอบของทุกขั้น
 * ทุกความเป็นไปได้แล้วเอาค่าสูงสุด ถ้าใช้สูตรเวียนซ้ำแบบเดียวกับ DP มาเทียบ
 * ก็จะพิสูจน์ได้แค่ว่าพิมพ์ลูปถูก ไม่ได้พิสูจน์ว่าสูตรถูก
 */
function bruteForceFree(tiers: LadderTier[], qty: number): number {
  let best = 0;
  const walk = (i: number, left: number, free: number) => {
    if (i === tiers.length) {
      if (free > best) best = free;
      return;
    }
    for (let times = 0; times * tiers[i].buy <= left; times++) {
      walk(i + 1, left - times * tiers[i].buy, free + times * tiers[i].free);
    }
  };
  walk(0, qty, 0);
  return best;
}

/** ขั้นที่ใช้ กับเศษที่ทิ้ง ต้องบวกกลับได้เท่าจำนวนที่จ่ายเสมอ */
const accountsFor = (tiers: LadderTier[], qty: number) => {
  const r = bestLadder(tiers, qty);
  return r.uses.reduce((n, u) => n + u.tier.buy * u.times, 0) + r.unmatched;
};

describe("ขั้นบันไดของแถม — ตารางในสเปค §3.2", () => {
  it("จ่าย 9 ได้แถม 3 จากขั้น 3 สามรอบ", () => {
    const r = bestLadder(SPEC, 9);
    expect(r.free).toBe(3);
    expect(r.uses).toEqual([{ tier: { buy: 3, free: 1 }, times: 3 }]);
    expect(r.unmatched).toBe(0);
  });

  it("จ่าย 11 ได้แถม 4 จากขั้น 10 และทิ้งเศษ 1 ไม่ปัดขึ้น", () => {
    const r = bestLadder(SPEC, 11);
    expect(r.free).toBe(4);
    expect(r.uses).toEqual([{ tier: { buy: 10, free: 4 }, times: 1 }]);
    expect(r.unmatched).toBe(1);
  });

  it("จ่าย 13 ได้แถม 5 จากขั้น 10 บวกขั้น 3", () => {
    const r = bestLadder(SPEC, 13);
    expect(r.free).toBe(5);
    expect(r.uses).toEqual([
      { tier: { buy: 10, free: 4 }, times: 1 },
      { tier: { buy: 3, free: 1 }, times: 1 },
    ]);
    expect(r.unmatched).toBe(0);
  });

  it("จ่าย 20 ได้แถม 8 จากขั้น 10 สองรอบ — ขั้นเดียวกันใช้ซ้ำได้", () => {
    const r = bestLadder(SPEC, 20);
    expect(r.free).toBe(8);
    expect(r.uses).toEqual([{ tier: { buy: 10, free: 4 }, times: 2 }]);
    expect(r.unmatched).toBe(0);
  });
});

describe("เคสที่ greedy ตอบผิด — เหตุผลที่ต้องเป็น DP", () => {
  /* หนึ่ง */
  it("จ่าย 13 กับ 3/1 · 10/4 · 30/15 — หยิบขั้นใหญ่แล้วจบ ตอบ 4 ที่ถูกคือ 5", () => {
    expect(greedyLargestOnly(SPEC, 13)).toBe(4);
    expect(bestLadder(SPEC, 13).free).toBe(5);
  });

  /* สอง — เก็บเศษต่อแล้วก็ยังผิด */
  it("จ่าย 6 กับ 3/1 · 5/1 — เก็บเศษต่อ ตอบ 1 ที่ถูกคือ 2", () => {
    const tiers: LadderTier[] = [
      { buy: 3, free: 1 },
      { buy: 5, free: 1 },
    ];
    expect(greedyWithRemainder(tiers, 6)).toBe(1);
    expect(greedyLargestOnly(tiers, 6)).toBe(1);

    const r = bestLadder(tiers, 6);
    expect(r.free).toBe(2);
    expect(r.uses).toEqual([{ tier: { buy: 3, free: 1 }, times: 2 }]);
  });

  /* สาม — ตัวอย่างของสเปคเอง §3.3 */
  it("จ่าย 9 กับ 8/5 · 3/2 ตามสเปค §3.3 — greedy ตอบ 5 ที่ถูกคือ 6", () => {
    const tiers: LadderTier[] = [
      { buy: 8, free: 5 },
      { buy: 3, free: 2 },
    ];
    expect(greedyLargestOnly(tiers, 9)).toBe(5);
    expect(greedyWithRemainder(tiers, 9)).toBe(5);

    const r = bestLadder(tiers, 9);
    expect(r.free).toBe(6);
    expect(r.uses).toEqual([{ tier: { buy: 3, free: 2 }, times: 3 }]);
  });

  it("ขั้นใหญ่กว่าไม่ได้แปลว่าคุ้มกว่าเสมอ — โค้ดไม่เชื่อขนาดขั้น", () => {
    /* ขั้น 8 ให้ 5 ต่อ 8 หน่วย · ขั้น 3 ให้ 2 ต่อ 3 หน่วย ซึ่งคุ้มกว่า */
    const tiers: LadderTier[] = [
      { buy: 8, free: 5 },
      { buy: 3, free: 2 },
    ];
    for (const qty of [3, 6, 9, 12, 24]) {
      expect(bestLadder(tiers, qty).free, `จ่าย ${qty}`).toBe(
        bruteForceFree(tiers, qty),
      );
    }
  });
});

describe("เทียบกับการนับทุกส่วนผสม", () => {
  const SETS: { name: string; tiers: LadderTier[] }[] = [
    { name: "สเปค §3.2", tiers: SPEC },
    { name: "3/1 · 5/1", tiers: [{ buy: 3, free: 1 }, { buy: 5, free: 1 }] },
    { name: "8/5 · 3/2", tiers: [{ buy: 8, free: 5 }, { buy: 3, free: 2 }] },
    {
      name: "ขั้นถี่ 2/1 · 4/3 · 7/5",
      tiers: [{ buy: 2, free: 1 }, { buy: 4, free: 3 }, { buy: 7, free: 5 }],
    },
    { name: "ขั้นเดียว 12/5", tiers: [{ buy: 12, free: 5 }] },
  ];

  for (const s of SETS) {
    it(`ตอบเท่ากับการนับทุกส่วนผสม ตั้งแต่จ่าย 0 ถึง 40 — ${s.name}`, () => {
      for (let qty = 0; qty <= 40; qty++) {
        expect(bestLadder(s.tiers, qty).free, `จ่าย ${qty}`).toBe(
          bruteForceFree(s.tiers, qty),
        );
      }
    });
  }

  it("ขั้นที่ใช้บวกเศษที่ทิ้ง เท่ากับจำนวนที่จ่ายเสมอ", () => {
    for (const s of SETS) {
      for (let qty = 0; qty <= 40; qty++) {
        expect(accountsFor(s.tiers, qty), `${s.name} จ่าย ${qty}`).toBe(qty);
      }
    }
  });

  it("ของแถมไม่มีวันลดลงเมื่อจ่ายเพิ่ม", () => {
    for (const s of SETS) {
      let prev = 0;
      for (let qty = 0; qty <= 40; qty++) {
        const now = bestLadder(s.tiers, qty).free;
        expect(now, `${s.name} จ่าย ${qty}`).toBeGreaterThanOrEqual(prev);
        prev = now;
      }
    }
  });
});

describe("ขอบของอินพุต — ต้องไม่พัง", () => {
  it("จ่ายไม่ถึงขั้นต่ำสุด ได้แถม 0 และนับเป็นเศษทั้งหมด", () => {
    const r = bestLadder(SPEC, 2);
    expect(r.free).toBe(0);
    expect(r.uses).toEqual([]);
    expect(r.unmatched).toBe(2);
  });

  it("จ่าย 0 ไม่มีอะไรให้ทิ้ง", () => {
    expect(bestLadder(SPEC, 0)).toEqual({ free: 0, uses: [], unmatched: 0 });
  });

  it("ไม่มีขั้นเลย — จำนวนที่จ่ายกลายเป็นเศษทั้งก้อน", () => {
    expect(bestLadder([], 13)).toEqual({ free: 0, uses: [], unmatched: 13 });
  });

  it("จำนวนติดลบหรือไม่ใช่ตัวเลข ไม่ทำให้พัง", () => {
    expect(bestLadder(SPEC, -5).free).toBe(0);
    expect(bestLadder(SPEC, Number.NaN).free).toBe(0);
    expect(bestLadder(SPEC, Number.POSITIVE_INFINITY).free).toBe(0);
  });

  it("เศษทศนิยมของจำนวนที่จ่าย ถูกตัดลง ไม่ปัดขึ้น", () => {
    /* 12.9 ยังไม่ถึง 13 จึงยังไม่ได้ขั้นที่ 13 เปิดให้ */
    expect(bestLadder(SPEC, 12.9).free).toBe(bestLadder(SPEC, 12).free);
    expect(bestLadder(SPEC, 13.4).free).toBe(5);
  });

  it("ขั้นที่ซื้อศูนย์หรือติดลบถูกข้าม ไม่ใช่แถมไม่จำกัด", () => {
    const broken: LadderTier[] = [
      { buy: 0, free: 5 },
      { buy: -3, free: 2 },
      { buy: 3, free: 1 },
    ];
    const r = bestLadder(broken, 9);
    expect(r.free).toBe(3);
    expect(r.uses).toEqual([{ tier: { buy: 3, free: 1 }, times: 3 }]);
  });

  it("ขั้นที่แถมศูนย์ไม่ถูกเลือกทั้งที่ยังนับเป็นขั้นที่ถูกต้อง", () => {
    const tiers: LadderTier[] = [
      { buy: 5, free: 0 },
      { buy: 3, free: 1 },
    ];
    const r = bestLadder(tiers, 6);
    expect(r.free).toBe(2);
    expect(r.uses).toEqual([{ tier: { buy: 3, free: 1 }, times: 2 }]);
  });

  it("ขั้นซ้ำรหัสเดียวกันแต่แถมไม่เท่ากัน เลือกอันที่ให้มากกว่า", () => {
    const tiers: LadderTier[] = [
      { buy: 10, free: 2 },
      { buy: 10, free: 4 },
    ];
    const r = bestLadder(tiers, 10);
    expect(r.free).toBe(4);
    expect(r.uses).toEqual([{ tier: { buy: 10, free: 4 }, times: 1 }]);
  });
});

/* ============================================================
   PR3c — ตัวลองคำนวณ

   ทุกคำตอบมาจาก `bestLadder` ตัวเดียวกับที่หน้ารายละเอียดใช้ ไฟล์นี้จึงไม่ได้
   ทดสอบว่าคำนวณถูกซ้ำอีกรอบ (`promotion-ladder.test.ts` ทำไปแล้ว 23 ข้อ)
   มันทดสอบว่า **ตัวลองไม่ได้คำนวณเอง** และเพดานจำนวนอยู่ที่จุดรับค่า
   ============================================================ */

describe("PR3c ตัวลองคำนวณ — เรียก bestLadder ไม่คำนวณเอง", () => {
  /** ขั้นตามสเปค §3.2 */
  const SPEC: LadderTier[] = [
    { buy: 3, free: 1 },
    { buy: 10, free: 4 },
    { buy: 30, free: 15 },
  ];

  it("จ่าย 13 ได้แถม 5 และบอกว่าใช้ขั้น 10 + ขั้น 3", () => {
    /* เกณฑ์รับงานข้อนี้เขียนไว้ตรง ๆ ในคำสั่ง — และเป็นเคสที่วิธีไล่จาก
       ขั้นใหญ่ลงมาตอบผิด (จะได้ 4) */
    const r = tryLadder(SPEC, 13, 650);
    expect(r.free).toBe(5);
    expect(r.total).toBe(18);
    expect(r.uses.map((u) => `${u.tier.buy}/${u.tier.free}×${u.times}`)).toEqual([
      "10/4×1",
      "3/1×1",
    ]);
    expect(ladderUsesText(r.uses)).toBe("10 แถม 4 × 1 + 3 แถม 1 × 1");
    expect(r.unmatched).toBe(0);
  });

  it("ผลตรงกับ bestLadder ทุกจำนวน — ไม่มีสูตรที่สอง", () => {
    /* ถ้าตัวลองคำนวณเองแม้บรรทัดเดียว ข้อนี้จะแดงที่จำนวนใดจำนวนหนึ่ง */
    for (let qty = 0; qty <= 60; qty++) {
      const mine = tryLadder(SPEC, qty, 650);
      const truth = bestLadder(SPEC, clampTryQty(qty));
      expect(mine.free, `จ่าย ${qty}`).toBe(truth.free);
      expect(mine.unmatched, `จ่าย ${qty}`).toBe(truth.unmatched);
    }
  });

  it("ราคาเฉลี่ยใช้สูตรเดียวของระบบ", () => {
    const r = tryLadder(SPEC, 10, 650);
    expect(r.average).toBe(averageUnitPrice(650, 10, r.free));
  });

  it("ยังไม่รู้ราคาสินค้า — ราคาเฉลี่ยเป็น null ไม่ใช่ 0", () => {
    /* 0 อ่านว่าแถมแล้วฟรีทั้งบรรทัด ซึ่งไม่จริง */
    expect(tryLadder(SPEC, 13, 0).average).toBeNull();
  });

  it("จำนวนที่ไม่ถึงขั้นไหนเลย ตอบว่าไม่ได้อะไร และไม่พัง", () => {
    const r = tryLadder(SPEC, 2, 650);
    expect(r.free).toBe(0);
    expect(r.uses).toEqual([]);
    expect(r.unmatched).toBe(2);
    expect(tryLadder([], 13, 650).free).toBe(0);
    expect(tryLadder(SPEC, 0, 650).qty).toBe(0);
  });
});

describe("PR3c เพดานจำนวน — อยู่ที่จุดรับค่า ไม่ได้อยู่ใน bestLadder", () => {
  const SPEC: LadderTier[] = [
    { buy: 3, free: 1 },
    { buy: 10, free: 4 },
  ];

  it("clampTryQty คุมเพดาน ปัดลง และปฏิเสธค่าที่ไม่ใช่จำนวนบวก", () => {
    expect(clampTryQty(13)).toBe(13);
    expect(clampTryQty(12.9)).toBe(12);
    expect(clampTryQty(TRY_QTY_MAX + 1)).toBe(TRY_QTY_MAX);
    expect(clampTryQty(9_999_999_999)).toBe(TRY_QTY_MAX);
    expect(clampTryQty(-5)).toBe(0);
    expect(clampTryQty("")).toBe(0);
    expect(clampTryQty("ห้าสิบ")).toBe(0);
    expect(clampTryQty(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("bestLadder ยังไม่มีเพดานของตัวเอง — เพดานเป็นกติกาธุรกิจ", () => {
    /* ปักไว้ว่าเพดานไม่ได้ย้ายเข้าไปข้างใน: ตัวคำนวณต้องตอบจำนวนที่เกินเพดาน
       ของหน้าจอได้ตามปกติ ถ้าวันหนึ่งมีคนใส่ clamp ไว้ข้างใน ข้อนี้จะแดง */
    expect(bestLadder(SPEC, TRY_QTY_MAX + 10).free).toBeGreaterThan(
      bestLadder(SPEC, TRY_QTY_MAX).free,
    );
  });

  it("ใส่จำนวนมหาศาลแล้วไม่ค้าง", () => {
    const started = Date.now();
    const r = tryLadder(SPEC, 9_999_999_999, 650);
    expect(r.qty).toBe(TRY_QTY_MAX);
    expect(r.free).toBeGreaterThan(0);
    /* เกณฑ์คือ "ไม่ค้าง" ไม่ใช่ "เร็วกว่า x มิลลิวินาที" — สองวินาทีคือเส้นที่
       ห่างจากเวลาจริงหลายเท่า แต่ยังจับกรณีที่เพดานถูกถอดออกได้ */
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("PR3c ข้อเสนอเพิ่มจำนวน — เฉพาะเมื่อระยะน้อยกว่าครึ่งของขั้นนั้น", () => {
  const SPEC: LadderTier[] = [
    { buy: 3, free: 1 },
    { buy: 10, free: 4 },
    { buy: 30, free: 15 },
  ];

  it("สั่ง 20 เหลือ 10 ถึงขั้น 30 — น้อยกว่าครึ่ง เสนอ", () => {
    const s = ladderSuggestion(SPEC, 20)!;
    expect(s.addQty).toBe(10);
    expect(s.tier.buy).toBe(30);
    /* ของแถมที่เพิ่มขึ้นจริง ไม่ใช่ tier.free ตรง ๆ — จ่าย 20 ได้ 8 อยู่แล้ว
       (ขั้น 10 สองรอบ) ไปถึง 30 ได้ 15 ⇒ เพิ่มขึ้น 7 */
    expect(s.extraFree).toBe(bestLadder(SPEC, 30).free - bestLadder(SPEC, 20).free);
    expect(s.extraFree).toBe(7);
  });

  it("สั่ง 3 เหลือ 7 ถึงขั้น 10 — เกินครึ่งของขั้น ไม่เสนอ", () => {
    /* 7 ≥ 10/2 ⇒ เงียบ การบอกให้เพิ่มอีก 7 เพื่อขั้น 10 คือเสียงรบกวน */
    expect(ladderSuggestion(SPEC, 3)).toBeNull();
  });

  it("สั่ง 1 แล้วบอกให้เพิ่มอีก 29 ไม่ช่วยอะไร — ไม่เสนอ", () => {
    expect(ladderSuggestion(SPEC, 1)).toBeNull();
  });

  it("สั่งถึงขั้นสูงสุดแล้ว ไม่มีอะไรให้เสนอ", () => {
    expect(ladderSuggestion(SPEC, 30)).toBeNull();
    expect(ladderSuggestion(SPEC, 45)).toBeNull();
  });

  it("เสนอขั้นที่ใกล้ที่สุดที่ยังไม่ถึง ไม่ใช่ขั้นใหญ่สุด", () => {
    const s = ladderSuggestion(SPEC, 8)!;
    expect(s.tier.buy).toBe(10);
    expect(s.addQty).toBe(2);
  });

  it("เสนอเฉพาะเมื่อของแถมเพิ่มขึ้นจริง", () => {
    /* ขั้นที่ใหญ่กว่าแต่ให้ของแถมไม่มากกว่าที่จับคู่ได้อยู่แล้ว ไม่ใช่ข้อเสนอ
       ขั้น 3 แถม 1 · ขั้น 4 แถม 1 — จ่าย 3 ได้ 1 อยู่แล้ว เติมเป็น 4 ก็ยังได้ 1 */
    const flat: LadderTier[] = [
      { buy: 3, free: 1 },
      { buy: 4, free: 1 },
    ];
    expect(ladderSuggestion(flat, 3)).toBeNull();
  });

  it("จำนวนมหาศาลก็ยังตอบเร็ว เพราะเพดานถูกคุมก่อน", () => {
    expect(ladderSuggestion(SPEC, 9_999_999_999)).toBeNull();
  });
});
