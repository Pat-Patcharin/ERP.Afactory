import { beforeEach, describe, expect, it } from "vitest";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  PROMOTIONS,
  PROMOTION_KINDS,
  PROMOTION_STATUSES,
  applyPromotionPatch,
  approvePromotion,
  averageUnitPrice,
  blankPromotion,
  getPromotion,
  mayApprovePromotion,
  mayCreatePromotion,
  mayEditPromotion,
  pausePromotion,
  promotionApprovalLevel,
  promotionFloorBreaches,
  resumePromotion,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { getSchemas } from "@/schemas/registry";
import { NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";

/* ============================================================
   PROMOTION เป็น entity จริง

   ด่านทุกตัวถูกทดสอบที่ **ฟังก์ชันที่เขียนข้อมูล** ไม่ใช่ที่ปุ่ม
   เพราะปุ่มที่ซ่อนไว้ไม่กันอะไรเลยเมื่อคำสั่งมาจากหน้าที่ค้างอยู่
   — บทเรียนเดียวกับ pickComplete / packComplete ใน BACKLOG

   ผู้ใช้ในเดโมที่ใช้ในไฟล์นี้
     EMP001  พิมพกา สุขใจ        SUPER_ADMIN
     EMP003  สมชาย ใจดี          SALES_MANAGER
     EMP004  สุภาวิตา โยธะพันธ์   SALES_REP
     EMP013  ณิชา พงษ์เจริญ       SALES_ADMIN
   ============================================================ */

const SALES_REP = "EMP004";
const SALES_ADMIN = "EMP013";
const SALES_MANAGER = "EMP003";

/** สำเนาเพื่อไม่ให้เทสต์ที่เขียนข้อมูลไปแก้ตัวอย่างที่เทสต์อื่นอ่าน */
const copy = (code: string): PromotionRow => {
  const row = getPromotion(code);
  if (!row) throw new Error(`ไม่มีโปร ${code} ในข้อมูลตัวอย่าง`);
  return JSON.parse(JSON.stringify(row)) as PromotionRow;
};

beforeEach(() => {
  resetCurrentUser();
});

describe("ลงทะเบียนเป็น entity", () => {
  it("อยู่ใน REGISTRY และมีทั้ง list กับ detail", () => {
    const s = getSchemas("promotion");
    expect(s).not.toBeNull();
    expect(s!.list.key).toBe("promotion");
    expect(s!.detail.key).toBe("promotion");
  });

  it("ยังไม่มีฟอร์ม — ทางสร้าง/แก้ตกไปที่ placeholder ที่บอกชื่อโมดูล", () => {
    expect(getSchemas("promotion")!.form).toBeUndefined();
  });

  it("เมนูชี้ไปหน้ารายการ ส่วนหน้าเลือกประเภทเป็นปุ่มสร้างของรายการนั้น", () => {
    const item = NAV_INDEX.find((i) => i.label === "Promotion");
    expect(item!.href).toBe("/m/promotion");
    expect(item!.soon).toBeUndefined();
    expect(pageHref("Promotion")).toBe("/m/promotion");
  });

  it("การ์ดแถมสินค้าชี้ไปทางสร้างจริงแล้ว ไม่ใช่ placeholder", () => {
    const card = PROMOTION_KINDS.find((k) => k.key === "free-goods")!;
    expect(card.href).toBe("/m/promotion/new?kind=free-goods");
    /* อีกสามใบยังปิดอยู่เหมือนเดิม การเปิด entity ไม่ได้เปิดใบอื่นตามไปด้วย */
    expect(PROMOTION_KINDS.filter((k) => k.href !== null)).toHaveLength(1);
  });
});

describe("แบบจำลองข้อมูล", () => {
  it("มีครบห้าสถานะตาม §6g และข้อมูลตัวอย่างเดินครบทุกสถานะ", () => {
    expect([...PROMOTION_STATUSES]).toEqual([
      "Draft",
      "Pending Approval",
      "Active",
      "Paused",
      "Ended",
    ]);
    for (const st of PROMOTION_STATUSES) {
      expect(PROMOTIONS.some((p) => p.status === st), st).toBe(true);
    }
  });

  it("ครอบครบทั้งห้ากลุ่มค่าตั้งตาม §6b รวมกลุ่ม 5", () => {
    const b = blankPromotion();
    /* กลุ่ม 1–4 */
    for (const k of ["code", "name", "kind", "from", "priority", "reason", "owner"]) {
      expect(b, `กลุ่ม 1 ขาด ${k}`).toHaveProperty(k);
    }
    for (const k of ["scope", "items", "priceLists", "minOrder", "nearExpiryOnly"]) {
      expect(b, `กลุ่ม 2 ขาด ${k}`).toHaveProperty(k);
    }
    for (const k of ["customerGroups", "customers", "areas", "channels", "allowDraftPartner"]) {
      expect(b, `กลุ่ม 3 ขาด ${k}`).toHaveProperty(k);
    }
    for (const k of ["usePerCustomer", "useTotal", "stackWithPromo", "recordUsage", "needsApproval", "commissionBase"]) {
      expect(b, `กลุ่ม 4 ขาด ${k}`).toHaveProperty(k);
    }
    /* กลุ่ม 5 — งบประมาณและคลัง */
    for (const k of ["budget", "budgetBasis", "budgetUsed", "budgetOver", "budgetWarnAt", "freeGoodsWarehouse"]) {
      expect(b, `กลุ่ม 5 ขาด ${k}`).toHaveProperty(k);
    }
  });

  it("ค่าเริ่มต้นกว้างที่สุด — ทุกกลุ่ม ทุกเขต ทุกช่องทาง ไม่จำกัดครั้ง", () => {
    const b = blankPromotion();
    expect(b.customerGroups).toEqual([]);
    expect(b.areas).toEqual([]);
    expect(b.channels).toEqual([]);
    expect(b.customers).toEqual([]);
    expect(b.priceLists).toEqual([]);
    expect(b.usePerCustomer).toBeNull();
    expect(b.useTotal).toBeNull();
    expect(b.minOrder).toBeNull();
  });

  it("สามช่องที่เดาแทนไม่ได้ ต้องว่างไว้ ไม่ใช่เติมให้", () => {
    const b = blankPromotion();
    expect(b.reason, "เหตุผลที่สร้างโปร").toBe("");
    expect(b.commissionBase, "ฐานคิดค่าคอม").toBe("");
    expect(b.freeGoodsWarehouse, "คลังที่หักของแถม").toBe("");
    /* §6e — งบ 100,000 คิดจากต้นทุนกับราคาขายต่างกันเป็นเท่าตัว */
    expect(b.budgetBasis, "งบคิดจากอะไร").toBe("");
  });
});

describe("ราคาเฉลี่ยและราคาขั้นต่ำ", () => {
  it("สูตรเฉลี่ยคือยอดที่จ่ายจริงหารจำนวนรวมที่ได้รับ ตาม §4.1", () => {
    /* ตัวอย่างในสเปค: จ่าย 13 × 100 = 1,300 ÷ 18 ชิ้น = 72.22 */
    expect(averageUnitPrice(100, 13, 5)).toBeCloseTo(72.222, 3);
    expect(averageUnitPrice(100, 3, 1)).toBe(75);
    expect(averageUnitPrice(100, 0, 0)).toBe(0);
  });

  it("กฎราคาขั้นต่ำกัดจริงบนข้อมูลตัวอย่าง ไม่ใช่กัดเฉพาะในเทสต์", () => {
    /* BACKLOG N-3 — กฎตายได้เพราะไม่มีข้อมูลเดินไปถึงมัน ไม่ใช่แค่เพราะ
       ไม่มีใครเรียก แถวนี้จึงต้องมีรหัสสินค้าที่มีราคากลางจริง */
    const breach = promotionFloorBreaches(copy("PM-0002"));
    expect(breach.length).toBeGreaterThan(0);
    expect(breach[0].average).toBeLessThan(breach[0].floor);

    expect(promotionFloorBreaches(copy("PM-0001"))).toEqual([]);
  });

  it("โปรที่หลุดขั้นต่ำขึ้นเป็นระดับผู้จัดการ ที่ไม่หลุดเป็นระดับแอดมิน", () => {
    expect(promotionApprovalLevel(copy("PM-0002"))).toBe("manager");
    expect(promotionApprovalLevel(copy("PM-0006"))).toBe("admin");
  });

  it("งบเกินเพดานก็ขึ้นเป็นระดับผู้จัดการ แม้ราคาเฉลี่ยจะไม่หลุด", () => {
    const p = copy("PM-0006");
    expect(promotionApprovalLevel(p)).toBe("admin");
    p.budget = 500_000;
    expect(promotionApprovalLevel(p)).toBe("manager");
  });
});

describe("§6h — ใครสร้างได้", () => {
  it("SALES_REP สร้างโปรไม่ได้", () => {
    setCurrentUser(SALES_REP);
    const guard = mayCreatePromotion();
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("สร้างโปรโมชั่นไม่ได้");
  });

  it("SALES_REP ยังเห็นรายการโปรได้ — ด่านอยู่ที่การสร้าง ไม่ใช่ที่การมองเห็น", () => {
    setCurrentUser(SALES_REP);
    /* ถ้าตัดทั้งโมดูลทิ้ง เทสต์ข้างบนจะผ่านด้วยเหตุผลผิด และเซลล์จะไม่รู้ว่า
       มีโปรอะไรใช้ได้ตอนเปิดใบ */
    expect(mayCreatePromotion().ok).toBe(false);
    const s = getSchemas("promotion");
    expect(s!.list.source().length).toBeGreaterThan(0);
  });

  it("SALES_ADMIN · SALES_MANAGER · SUPER_ADMIN สร้างได้", () => {
    for (const u of [SALES_ADMIN, SALES_MANAGER, "EMP001"]) {
      setCurrentUser(u);
      expect(mayCreatePromotion().ok, u).toBe(true);
    }
  });
});

describe("§6h — ใครอนุมัติได้", () => {
  it("SALES_ADMIN อนุมัติโปรราคาปกติได้", () => {
    setCurrentUser(SALES_ADMIN);
    const p = copy("PM-0006");
    expect(mayApprovePromotion(p).ok).toBe(true);

    expect(approvePromotion(p).ok).toBe(true);
    expect(p.status).toBe("Active");
    expect(p.approvedBy).toBe("ณิชา พงษ์เจริญ");
  });

  it("SALES_ADMIN อนุมัติโปรที่ทำให้ราคาเฉลี่ยต่ำกว่า price_last ไม่ได้", () => {
    setCurrentUser(SALES_ADMIN);
    const p = copy("PM-0002");

    const guard = mayApprovePromotion(p);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("ผู้จัดการ");

    /* ด่านอยู่ที่ตัวเขียน ไม่ใช่แค่ที่ปุ่ม — เรียกตรง ๆ ก็ยังไม่ผ่าน */
    expect(approvePromotion(p).ok).toBe(false);
    expect(p.status).toBe("Pending Approval");
    expect(p.approvedBy).toBe("");
  });

  it("SALES_MANAGER อนุมัติโปรที่ต่ำกว่า price_last ได้ ถ้าไม่ใช่คนสร้าง", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0002");
    p.createdBy = "คนอื่น";

    expect(approvePromotion(p).ok).toBe(true);
    expect(p.status).toBe("Active");
  });

  it("คนสร้างอนุมัติโปรของตัวเองไม่ได้ แม้จะมีสิทธิ์อนุมัติ", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0002");
    /* ผู้จัดการคนนี้เป็นคนสร้าง และมีสิทธิ์พอที่จะเซ็นระดับผู้จัดการ —
       สิ่งเดียวที่ปฏิเสธคือกฎห้ามอนุมัติของตัวเอง */
    expect(p.createdBy).toBe("สมชาย ใจดี");

    const guard = mayApprovePromotion(p);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("ตัวเอง");

    expect(approvePromotion(p).ok).toBe(false);
    expect(p.status).toBe("Pending Approval");
  });

  it("อนุมัติได้เฉพาะโปรที่รออนุมัติ", () => {
    setCurrentUser(SALES_MANAGER);
    for (const code of ["PM-0001", "PM-0003", "PM-0004", "PM-0005"]) {
      const p = copy(code);
      const before = p.status;
      expect(approvePromotion(p).ok, code).toBe(false);
      expect(p.status, code).toBe(before);
    }
  });
});

describe("§6h — แก้โปรที่ใช้งานอยู่ไม่ได้", () => {
  it("โปรที่ใช้งานอยู่แก้ไม่ได้ ต้องหยุดชั่วคราวก่อน", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0001");
    expect(p.status).toBe("Active");

    const guard = mayEditPromotion(p);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("หยุดชั่วคราวก่อน");

    /* ด่านที่จุดเขียน — patch ต้องไม่ลงระเบียน */
    const before = JSON.stringify(p.tiers);
    expect(applyPromotionPatch(p, { tiers: [{ buy: 1, free: 99 }] }).ok).toBe(false);
    expect(JSON.stringify(p.tiers)).toBe(before);
  });

  it("โปรที่รออนุมัติหรือสิ้นสุดแล้วก็แก้ไม่ได้", () => {
    setCurrentUser(SALES_MANAGER);
    for (const code of ["PM-0002", "PM-0004"]) {
      const p = copy(code);
      expect(mayEditPromotion(p).ok, code).toBe(false);
      expect(applyPromotionPatch(p, { priority: 1 }).ok, code).toBe(false);
      expect(p.priority, code).not.toBe(1);
    }
  });

  it("ร่างกับที่หยุดชั่วคราวแก้ได้", () => {
    setCurrentUser(SALES_MANAGER);
    for (const code of ["PM-0003", "PM-0005"]) {
      const p = copy(code);
      expect(applyPromotionPatch(p, { priority: 2 }).ok, code).toBe(true);
      expect(p.priority, code).toBe(2);
    }
  });
});

describe("§6g — หยุดชั่วคราวและเปิดกลับ", () => {
  it("หยุดต้องระบุเหตุผล", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0001");
    expect(pausePromotion(p, "   ").ok).toBe(false);
    expect(p.status).toBe("Active");

    expect(pausePromotion(p, "ของแถมชนกับโปรผู้ผลิต").ok).toBe(true);
    expect(p.status).toBe("Paused");
    expect(p.pausedReason).toBe("ของแถมชนกับโปรผู้ผลิต");
  });

  it("หยุดได้เฉพาะคนที่มีสิทธิ์อนุมัติ", () => {
    setCurrentUser(SALES_REP);
    const p = copy("PM-0001");
    expect(pausePromotion(p, "ขอพัก").ok).toBe(false);
    expect(p.status).toBe("Active");
  });

  it("เปิดกลับได้เลยถ้าไม่ได้แก้เงื่อนไข", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0005");
    p.dirtySinceApproval = false;

    expect(resumePromotion(p).ok).toBe(true);
    expect(p.status).toBe("Active");
    expect(p.pausedReason).toBe("");
  });

  it("แก้เงื่อนไขระหว่างหยุดแล้วเปิดกลับไม่ได้ — ไปเข้าคิวอนุมัติใหม่", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0005");
    expect(p.dirtySinceApproval).toBe(true);

    const guard = resumePromotion(p);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("ขออนุมัติใหม่");
    /* กลับไปเข้าคิว ไม่ใช่ค้างอยู่ที่หยุด — ไม่งั้นจะไม่มีทางออกจากสถานะนี้ */
    expect(p.status).toBe("Pending Approval");
  });

  it("แก้เงื่อนไขระหว่างหยุด ติดธงเอง ไม่ต้องรอให้ใครไปตั้ง", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0005");
    p.dirtySinceApproval = false;

    expect(applyPromotionPatch(p, { tiers: [{ buy: 6, free: 3 }] }).ok).toBe(true);
    expect(p.dirtySinceApproval).toBe(true);
  });

  it("แก้ช่องที่ไม่ใช่เงื่อนไข ไม่ต้องขออนุมัติใหม่", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0005");
    p.dirtySinceApproval = false;

    /* ชื่อที่พิมพ์บนเอกสารกับเจ้าของโปรไม่ได้เปลี่ยนว่าใครได้อะไรเท่าไหร่ */
    expect(applyPromotionPatch(p, { printName: "ซื้อ 12 แถม 5 พิเศษ", owner: "คนใหม่" }).ok).toBe(true);
    expect(p.dirtySinceApproval).toBe(false);
    expect(resumePromotion(p).ok).toBe(true);
    expect(p.status).toBe("Active");
  });
});
