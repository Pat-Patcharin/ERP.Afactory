import { describe, expect, it } from "vitest";
import { bestLadder, type LadderTier } from "@/lib/domain/promotion-ladder";

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
