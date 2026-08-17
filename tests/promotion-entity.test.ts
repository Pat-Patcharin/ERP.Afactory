import { beforeEach, describe, expect, it } from "vitest";
import { COMPANY } from "@/data/admin";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  PROMOTIONS,
  PROMOTION_KINDS,
  PROMOTION_STATUSES,
  COMMISSION_BASES,
  applyPromotionPatch,
  approvePromotion,
  averageUnitPrice,
  blankPromotion,
  createPromotion,
  getPromotion,
  mayApprovePromotion,
  mayCreatePromotion,
  mayEditPromotion,
  managerBudgetCeiling,
  nextPromotionCode,
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

/** ทะเบียนจริงถูกเขียนโดย createPromotion — คืนสภาพทุกข้อ */
const PROMO_SNAP = JSON.stringify(PROMOTIONS);

beforeEach(() => {
  PROMOTIONS.length = 0;
  PROMOTIONS.push(...(JSON.parse(PROMO_SNAP) as PromotionRow[]));
  resetCurrentUser();
});

describe("ลงทะเบียนเป็น entity", () => {
  it("อยู่ใน REGISTRY และมีทั้ง list กับ detail", () => {
    const s = getSchemas("promotion");
    expect(s).not.toBeNull();
    expect(s!.list.key).toBe("promotion");
    expect(s!.detail.key).toBe("promotion");
  });

  it("มีฟอร์มแล้ว — ห้ากลุ่มตาม §6b กลุ่มงบเป็นแท็บของตัวเอง", () => {
    /* ข้อนี้เคยปักว่า "ยังไม่มีฟอร์ม" ซึ่งเป็นสภาพชั่วคราวที่เราตั้งใจเปลี่ยนเอง
       จึงยกระดับให้ปักโครงของฟอร์มแทน — ครอบคลุมกว่าที่ปักว่าไม่มี */
    const form = getSchemas("promotion")!.form;
    expect(form).toBeDefined();
    expect(form!.key).toBe("promotion");

    const keys = form!.steps.map((st) => st.key);
    expect(keys.slice(0, 5)).toEqual(["identity", "what", "who", "limits", "budget"]);
    /* งบกับคลังอยู่แท็บของตัวเอง ไม่ต่อท้ายกลุ่มสี่ */
    expect(keys.indexOf("budget")).toBeGreaterThan(keys.indexOf("limits"));
  });

  it("ช่องบังคับไม่เกินเก้าช่อง", () => {
    /* เกณฑ์ที่ตกลงกันไว้ — ฟอร์มที่บังคับสิบห้าช่องคือฟอร์มที่คนกรอกมั่วให้ผ่าน */
    const req = getSchemas("promotion")!.form!.required ?? [];
    expect(req.length, req.map((r) => r.path).join(" ")).toBeLessThanOrEqual(9);
  });

  it("สามช่องที่ห้ามเดาให้ ต้องว่างจริงในฟอร์มเปล่า", () => {
    const blank = getSchemas("promotion")!.form!.blank!();
    /* เหตุผลที่สร้าง · ฐานคิดค่าคอม · คลังที่หักของแถม — และงบคิดจากอะไร
       ทั้งสี่ตัวถ้าเดาให้ ทุกโปรจะได้ค่าที่ไม่มีใครเลือก */
    for (const k of ["reason", "commissionBase", "freeGoodsWarehouse", "budgetBasis"]) {
      expect(String(blank[k] ?? ""), k).toBe("");
    }
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
    p.budget = managerBudgetCeiling() + 1;
    expect(promotionApprovalLevel(p)).toBe("manager");
  });

  it("เพดานอ่านจากค่าตั้งระบบ ไม่ใช่ค่าคงที่ในโมดูล", () => {
    /* ย้ายมาอยู่กับอัตราภาษีและรอบปีบัญชี เพราะคนที่ตั้งภาษีคือคนที่ตั้ง
       เพดานนี้ — แก้ค่าตั้งระบบแล้วต้องมีผลทันที ไม่ใช่มีผลตอน import */
    expect(managerBudgetCeiling()).toBe(COMPANY.promotionManagerBudgetCeiling);

    const was = COMPANY.promotionManagerBudgetCeiling;
    const p = copy("PM-0006");
    p.budget = 60_000;
    expect(promotionApprovalLevel(p), `งบ 60,000 ใต้เพดาน ${was}`).toBe("admin");

    COMPANY.promotionManagerBudgetCeiling = 50_000;
    expect(promotionApprovalLevel(p), "ลดเพดานแล้วงบเดิมเกิน").toBe("manager");
    COMPANY.promotionManagerBudgetCeiling = was;
    expect(promotionApprovalLevel(p)).toBe("admin");
  });

  it("ฐานคิดค่าคอมมีสองตัว ตามที่ตกลงกันไว้ และใช้คำที่ตกลงกัน", () => {
    /* เคยมีตัวที่สาม "ไม่จ่ายค่าคอม..." — ตัดออกเพราะเป็นการเดานโยบาย
       ค่าตอบแทน ไม่ใช่ข้อเท็จจริงที่ใครบอกมา ระบบจะไม่เสนอตัวเลือกที่
       ไม่มีใครตัดสินใจไว้ เทสต์นี้ปักไว้เพื่อไม่ให้มันกลับมาเงียบ ๆ */
    expect([...COMMISSION_BASES]).toEqual([
      "ยอดที่ลูกค้าจ่ายจริง",
      "มูลค่าบรรทัดหลังเฉลี่ยของแถม",
    ]);

    /* และข้อมูลตัวอย่างต้องใช้คำเดียวกับที่ระบบเสนอ ไม่ใช่คำที่ตกค้าง */
    for (const p of PROMOTIONS) {
      if (!p.commissionBase) continue;
      expect([...COMMISSION_BASES], p.code).toContain(p.commissionBase);
    }
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

/* ============================================================
   §6h — สร้างโปรใหม่
   ============================================================ */

describe("createPromotion", () => {
  /** ค่าครบทุกกลุ่ม ใช้พิสูจน์ว่าไม่มีกลุ่มไหนหายตอนเขียน */
  const FULL: Partial<PromotionRow> = {
    name: "ซื้อ 5 แถม 1 — ทดสอบ",
    printName: "โปรพิเศษเดือนนี้",
    from: "01/09/2026",
    to: "30/09/2026",
    priority: 3,
    reason: "ล้างสต๊อกใกล้หมดอายุ",
    reasonNote: "ล็อตหมดอายุ ธ.ค.",
    owner: "ณิชา พงษ์เจริญ",

    scope: "set",
    items: ["AA-TH003-WL", "AA-TH003-GR"],
    priceLists: ["PL-STD-2026 Standard"],
    minOrder: 5000,
    minOrderBasis: "ยอดก่อนภาษี",
    nearExpiryOnly: true,
    nearExpiryDays: 60,

    customerGroups: ["คลินิก"],
    customers: ["BP000122"],
    areas: ["กรุงเทพ"],
    channels: ["Direct"],
    allowDraftPartner: true,

    usePerCustomer: 2,
    useTotal: 50,
    stackWithPromo: true,
    stackWithCustomerDiscount: false,
    recordUsage: true,
    needsApproval: true,
    commissionBase: "ยอดที่ลูกค้าจ่ายจริง",

    budget: 80_000,
    budgetBasis: "cost",
    budgetOver: "stop",
    budgetWarnAt: 70,
    freeGoodsWarehouse: "WH-BKK Bangkok Main Warehouse",

    tiers: [{ buy: 5, free: 1 }],
  };

  it("SALES_REP ถูกปฏิเสธ พร้อมเหตุผล และไม่มีแถวเพิ่มในทะเบียน", () => {
    setCurrentUser(SALES_REP);
    const before = PROMOTIONS.length;

    const res = createPromotion({ name: "โปรที่ไม่ควรเกิด" });

    /* ตรวจสองอย่าง ไม่ใช่แค่ค่าที่คืน — ค่าที่คืนบอกว่าไม่ผ่าน แต่ทะเบียน
       คือที่ที่ความเสียหายจะอยู่ถ้าด่านเป็นแค่การซ่อนปุ่ม */
    expect(res.ok).toBe(false);
    expect(res.row).toBeNull();
    expect(res.reason).toContain("สร้างโปรโมชั่นไม่ได้");
    expect(PROMOTIONS).toHaveLength(before);
    expect(PROMOTIONS.some((p) => p.name === "โปรที่ไม่ควรเกิด")).toBe(false);
  });

  it("สร้างสองครั้งติดกันได้รหัสไม่ซ้ำ", () => {
    setCurrentUser(SALES_ADMIN);
    const a = createPromotion({ name: "โปรหนึ่ง" });
    const b = createPromotion({ name: "โปรสอง" });

    expect(a.row!.code).not.toBe(b.row!.code);
    expect(new Set(PROMOTIONS.map((p) => p.code)).size).toBe(PROMOTIONS.length);
    /* และรหัสถัดไปต้องไม่ทับของที่เพิ่งออกไป */
    expect(nextPromotionCode()).not.toBe(b.row!.code);
  });

  it("ค่าที่กรอกครบทุกกลุ่ม อยู่ครบหลังสร้าง — และเปิดกลับมาแล้วยังอยู่", () => {
    setCurrentUser(SALES_ADMIN);
    const res = createPromotion(FULL);
    expect(res.ok, res.reason).toBe(true);

    /* รอบแรก: อ่านจากค่าที่คืนมา */
    for (const [k, v] of Object.entries(FULL)) {
      expect(res.row![k as keyof PromotionRow], k).toEqual(v);
    }

    /* รอบสอง: อ่านจากทะเบียนด้วยรหัส เหมือนเปิดหน้าแก้ไขใหม่
       — บทเรียน A2a/A2b คือเซฟแล้วมีค่าไม่ได้พิสูจน์ว่าเปิดกลับมาแล้วยังอยู่ */
    const reopened = getPromotion(res.row!.code);
    expect(reopened).not.toBeNull();
    for (const [k, v] of Object.entries(FULL)) {
      expect(reopened![k as keyof PromotionRow], `เปิดกลับ: ${k}`).toEqual(v);
    }

    /* และร่องรอยที่ระบบออกให้ ไม่ใช่ค่าที่ฟอร์มส่งมา */
    expect(reopened!.status).toBe("Draft");
    expect(reopened!.createdBy).toBe("ณิชา พงษ์เจริญ");
    expect(reopened!.code).toMatch(/^PM-\d{4}$/);
  });

  it("ทริปไวร์: ค่าเดินผ่าน applyPromotionPatch จริง ไม่ใช่ Object.assign", () => {
    /* ความต่างที่สังเกตได้ระหว่างสองเส้นทาง — ไม่มีบทบาทไหนที่ create ได้แต่
       edit ไม่ได้ (ตรวจแล้วในตารางสิทธิ์) ฉะนั้น `applyPromotionPatch` จะไม่
       ปฏิเสธตอนสร้าง สิ่งที่มันทำและ `Object.assign` ไม่ทำ คือ **ตั้งธง
       dirtySinceApproval เมื่อ patch แตะเงื่อนไขบนโปรที่มีวันอนุมัติแล้ว**

       ยิง approvedAt เข้าไปพร้อม patch จึงเป็นวิธีเดียวที่แยกสองเส้นทางออก
       จากกันได้ในเทสต์ ฟอร์มจริงไม่ส่งค่านี้ — นี่คือทริปไวร์ ไม่ใช่เคสใช้งาน
       ถ้าใครเปลี่ยน createPromotion ไปเขียนค่าตรง ข้อนี้จะแดง */
    setCurrentUser(SALES_ADMIN);
    const res = createPromotion({ ...FULL, approvedAt: "01/09/2026", minOrder: 7000 });

    expect(res.ok, res.reason).toBe(true);
    expect(res.row!.minOrder, "ค่าถูกเขียนลงแถว").toBe(7000);
    expect(
      res.row!.dirtySinceApproval,
      "ธงนี้มีแต่ applyPromotionPatch ที่ตั้ง — ถ้าเป็น false แปลว่ามีเส้นทางลัด",
    ).toBe(true);
  });

  it("ค่าจากฟอร์มเดินผ่าน applyPromotionPatch — ธงเงื่อนไขทำงานต่อได้", () => {
    setCurrentUser(SALES_ADMIN);
    const res = createPromotion(FULL);
    const row = res.row!;

    /* โปรใหม่ยังไม่อนุมัติ ธงจึงยังไม่ตั้ง — ตรงกับ applyPromotionPatch
       ที่ตั้งธงเฉพาะเมื่อ approvedAt มีค่าแล้ว */
    expect(row.dirtySinceApproval).toBe(false);
    expect(row.approvedAt).toBe("");

    /* อนุมัติแล้วแตะเงื่อนไข ธงต้องขึ้น — พิสูจน์ว่าแถวที่สร้างมาเดินเข้า
       เส้นทางเดียวกับแถวที่มาจากข้อมูลตัวอย่าง ไม่ใช่แถวพิเศษ */
    row.approvedAt = "01/09/2026";
    row.approvedBy = "สมชาย ใจดี";
    row.status = "Paused";
    expect(applyPromotionPatch(row, { minOrder: 9000 }).ok).toBe(true);
    expect(row.dirtySinceApproval).toBe(true);
  });

  it("รหัสโปรลอกตรรกะจาก nextPRCode — อ่านเฉพาะส่วนหลังขีด", () => {
    /* ถ้าอ่านตัวเลขทั้งรหัสแบบ nextBPCode รหัสที่มีปีอยู่ใน prefix จะทำให้
       เลขถัดไปกระโดดไปหลายล้าน */
    setCurrentUser(SALES_ADMIN);
    PROMOTIONS.unshift({ ...blankPromotion(), code: "PM2506-0009", name: "รหัสมีปี" });
    expect(nextPromotionCode()).toBe("PM-0010");
  });
});
