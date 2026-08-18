import { beforeEach, describe, expect, it } from "vitest";
import { COMPANY } from "@/data/admin";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  OPEN_PROMOTION_SCOPES,
  PROMOTIONS,
  PROMOTION_KINDS,
  PROMOTION_SCOPE_TH,
  PROMOTION_STATUSES,
  COMMISSION_BASES,
  NO_COMMISSION,
  paysCommission,
  isSamePriceGroup,
  priceClusterText,
  priceClusters,
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
  productFloor,
  promotionFloorBreaches,
  ladderFloorBreaches,
  ladderFreeSide,
  setUnitPrice,
  cheapestByStandardPrice,
  tierAverages,
  resumePromotion,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { catalogPrice } from "@/lib/domain/pricing";
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
    /* กลุ่มงบและคลังถูกตัดออกจากฟอร์มทั้งกลุ่ม — ช่องยังอยู่ในระเบียนและ
       หน้ารายละเอียดยังแสดงของเดิม แต่ไม่มีที่กรอกอีกแล้ว */
    expect(keys).toEqual(["identity", "who", "limits", "what", "review"]);
  });

  it("ช่องบังคับที่แต่ละชนิดเห็น ไม่เกินเก้าช่อง", () => {
    /* เกณฑ์ที่ตกลงกันไว้ — ฟอร์มที่บังคับสิบห้าช่องคือฟอร์มที่คนกรอกมั่วให้ผ่าน
       นับต่อชนิด เพราะ `required` ดิบรวมช่องของทุกชนิด และขั้นของแถมกับ
       ขั้นส่วนลดไม่เคยบังคับพร้อมกันในโปรใบเดียว */
    const form = getSchemas("promotion")!.form!;
    for (const kind of ["free-goods", "price-discount", "redeem"]) {
      const blank = { ...form.blank!(), kind };
      const req = (form.required ?? []).filter((r) => !r.test || !r.test(blank));
      expect(req.length, `${kind}: ${req.map((r) => r.path).join(" ")}`).toBeLessThanOrEqual(9);
    }
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

  it("การ์ดที่เปิดชี้ไปทางสร้างจริง และเปิดเฉพาะชนิดที่มีตัวคำนวณของตัวเอง", () => {
    /* สามชนิดที่เปิด — แถมสินค้า (รอบที่ 1) · ส่วนลดราคา และแลกซื้อ (รอบที่ 2)
       ทุกชนิดมีตัวคำนวณคนละไฟล์และฟอร์มของตัวเอง */
    const open = PROMOTION_KINDS.filter((k) => k.href !== null);
    expect(open.map((k) => k.key)).toEqual(["free-goods", "price-discount", "redeem"]);
    for (const k of open) {
      expect(k.href, k.label).toBe(`/m/promotion/new?kind=${k.key}`);
    }

    /* แพ็กเกจยังปิด — ติดคำถามฝ่ายบัญชีเรื่องใบกำกับเต็มจำนวนเมื่อส่งของไม่ครบ
       คำตอบเปลี่ยนโครงข้อมูล จึงไม่ใช่เรื่องที่ตัดสินในโค้ด */
    expect(PROMOTION_KINDS.filter((k) => k.href === null).map((k) => k.key)).toEqual(["package"]);
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
    /* `recordUsage` กับ `needsApproval` เคยอยู่ในรายการนี้ — ถอดออกแล้ว
       ทั้งคู่เป็นกฎของระบบ ไม่ใช่ค่าตั้งของโปรแต่ละใบ: การใช้ถูกบันทึกทุกครั้ง
       และทุกโปรเดินเส้นทางอนุมัติเดียวกันผ่าน `mayApprovePromotion` ซึ่งไม่เคย
       อ่านธงนี้เลย ช่องที่ตั้งค่าได้แต่คำตอบมีค่าเดียว คือช่องที่วันหนึ่งจะมีคน
       ตั้งเป็นอีกค่า แล้วจะมีคนเชื่อว่ามันข้ามด่านอนุมัติได้จริง */
    for (const k of ["usePerCustomer", "useTotal", "stackWithPromo", "commissionBase"]) {
      expect(b, `กลุ่ม 4 ขาด ${k}`).toHaveProperty(k);
    }
    expect(b).not.toHaveProperty("recordUsage");
    expect(b).not.toHaveProperty("needsApproval");
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

  it("ค่าคอมมีสามคำตอบ รวมคำตอบว่าไม่จ่าย และใช้คำที่ตกลงกัน", () => {
    /* ตัวที่สามเคยถูกตัดออกเพราะยังไม่มีใครตัดสินนโยบายค่าตอบแทน — ตอนนี้
       ตัดสินแล้วจึงกลับมา เงื่อนไขเดิมยังยืนอยู่ทั้งข้อ: อยู่ได้เพราะมีคนบอกมา
       ไม่ใช่เพราะระบบคิดเองว่าน่าจะมี เทสต์ยังปักคำที่ใช้ไว้เหมือนเดิม */
    expect([...COMMISSION_BASES]).toEqual([
      "ยอดที่ลูกค้าจ่ายจริง",
      "มูลค่าบรรทัดหลังเฉลี่ยของแถม",
      "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้",
    ]);
    expect(NO_COMMISSION).toBe("ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้");
    expect(paysCommission({ commissionBase: NO_COMMISSION })).toBe(false);
    expect(paysCommission({ commissionBase: "" }), "ยังไม่เลือก ไม่ใช่คำตอบว่าไม่จ่าย").toBe(false);
    expect(paysCommission({ commissionBase: "ยอดที่ลูกค้าจ่ายจริง" })).toBe(true);

    /* และข้อมูลตัวอย่างต้องใช้คำเดียวกับที่ระบบเสนอ ไม่ใช่คำที่ตกค้าง */
    for (const p of PROMOTIONS) {
      if (!p.commissionBase) continue;
      expect([...COMMISSION_BASES], p.code).toContain(p.commissionBase);
    }
  });
});

/* ============================================================
   PM-5 — ฝั่งของแถมเข้าสูตรแล้ว

   ก่อนหน้านี้สูตรถือว่าของแถมเป็นสินค้าตัวเดียวกับที่ซื้อเสมอ ซึ่งจริงเฉพาะ
   แบบรายตัว ⇒ แจกของ 320 บาทกับแจกของ 1,396,000 บาท `promotionFloorBreaches`
   ตอบ 0 เท่ากัน และเท่ากับตอนไม่ระบุของแถมเลย

   §4.2 ของสเปครอบที่ 1 บอกว่าของแถม **ไม่ตั้งราคา 0** แต่ลงบรรทัดด้วยราคา
   เฉลี่ยของบิล ⇒ ของแถมราคาแพงจะถูกลงบรรทัดต่ำกว่าราคาขั้นต่ำของตัวมันเอง
   ทันที นั่นคือสิ่งที่ต้องจับได้
   ============================================================ */

describe("PM-5 ฝั่งของแถมเข้าสูตร", () => {
  const ABC = "D-AD001-01";
  const CHEAP = "B-GE006-01";
  const DEAR = "F-DC004-01";
  const T104 = { buy: 10, free: 4 };

  const setInput = (freeItems: string[]) => ({
    scope: "set" as const,
    items: [ABC],
    freeItems,
    tiers: [T104],
  });

  it("ราคากลางที่เทสต์ชุดนี้ยืนอยู่บน", () => {
    expect(catalogPrice(ABC)).toBe(650);
    expect(productFloor(ABC)).toBe(280);
    expect(catalogPrice(CHEAP)).toBe(80);
    expect(productFloor(CHEAP)).toBe(70);
    expect(catalogPrice(DEAR)).toBe(349_000);
    expect(productFloor(DEAR)).toBe(201_000);
  });

  it("แถมของถูกกับแถมของแพง ให้ผลต่างกัน — เคยตอบ 0 เท่ากันทั้งคู่", () => {
    /* 650 × 10 ÷ 14 = 464.29 ลงบรรทัดของทั้งของที่ซื้อและของที่แถม */
    const cheap = ladderFloorBreaches(setInput([CHEAP]));
    const dear = ladderFloorBreaches(setInput([DEAR]));

    expect(cheap, `ของแถม 80 อยู่เหนือขั้นต่ำ 70 ของตัวเอง`).toHaveLength(0);
    expect(dear).toHaveLength(1);
    expect(dear[0].code).toBe(DEAR);
    expect(dear[0].side, "ตัวที่หลุดคือของแถม ไม่ใช่ของที่ซื้อ").toBe("free");
    expect(dear[0].average).toBeCloseTo(464.29, 2);
    expect(dear[0].floor).toBe(201_000);

    /* ข้อที่ PM-5 วัดไว้: สองเคสนี้ต้องไม่เท่ากันอีกต่อไป */
    expect(dear.length).not.toBe(cheap.length);
  });

  it("ของแถมแพงดันโปรขึ้นผู้จัดการ ของแถมถูกไม่ดัน", () => {
    setCurrentUser(SALES_ADMIN);
    const row = (freeItems: string[]): PromotionRow => ({
      ...blankPromotion(),
      kind: "free-goods",
      scope: "set",
      items: [ABC],
      freeItems,
      tiers: [T104],
    });
    expect(promotionApprovalLevel(row([CHEAP]))).toBe("admin");
    expect(promotionApprovalLevel(row([DEAR]))).toBe("manager");
  });

  it("ยังไม่ระบุของแถม ≠ ตรวจแล้วผ่าน", () => {
    expect(ladderFreeSide(setInput([])).missing).toBe(true);
    expect(ladderFreeSide(setInput([CHEAP])).missing).toBe(false);
    /* แบบรายตัวไม่มีฝั่งแยกให้ระบุ จึงไม่เคย missing */
    expect(
      ladderFreeSide({ scope: "item", items: [ABC], freeItems: [] }).missing,
    ).toBe(false);
  });

  it("แบบกลุ่ม — ของแถมคือตัวราคามาตรฐานต่ำสุดในรายการที่นับ", () => {
    expect(cheapestByStandardPrice([ABC, CHEAP, DEAR])).toBe(CHEAP);
    /* ตัวที่ยังไม่มีราคาไม่ถูกเลือกเป็นของถูกที่สุด — ไม่มีราคา ≠ ราคา 0 */
    expect(cheapestByStandardPrice(["ไม่มีรหัสนี้", ABC])).toBe(ABC);

    const group = { scope: "group" as const, items: [ABC, CHEAP], freeItems: [], tiers: [T104] };
    expect(ladderFreeSide(group).codes).toEqual([CHEAP]);
    /* ราคาชุด = (650 + 80) ÷ 2 = 365 · 365 × 10 ÷ 14 = 260.71 */
    expect(setUnitPrice([ABC, CHEAP])).toBe(365);
    const rows = tierAverages(group, T104);
    for (const r of rows) expect(r.average).toBeCloseTo(260.71, 2);
    /* 260.71 ต่ำกว่าขั้นต่ำ 280 ของตัวที่แพงกว่า — กลุ่มที่ราคากระจายมาก
       ดึงราคาเฉลี่ยลงจนของแพงในกลุ่มหลุดขั้นต่ำ */
    const br = ladderFloorBreaches(group);
    expect(br).toHaveLength(1);
    expect(br[0].code).toBe(ABC);
    expect(br[0].side).toBe("counted");
  });

  it("แบบรายตัวไม่เปลี่ยนพฤติกรรม และไม่สนใจ freeItems เลย", () => {
    const item = { scope: "item" as const, items: [ABC, CHEAP], freeItems: [], tiers: [T104] };
    const rows = tierAverages(item, T104);
    /* แต่ละตัวคิดจากราคาตัวเอง ไม่ใช่ราคาชุด — 650×10÷14 และ 80×10÷14 */
    expect(rows.map((r) => r.code).sort()).toEqual([ABC, CHEAP].sort());
    expect(rows.find((r) => r.code === ABC)!.average).toBeCloseTo(464.29, 2);
    expect(rows.find((r) => r.code === CHEAP)!.average).toBeCloseTo(57.14, 2);
    for (const r of rows) expect(r.side).toBe("counted");

    /* ยัด freeItems แพง ๆ เข้าไปแล้วผลต้องไม่ขยับ — แบบรายตัวแถมตัวเดียวกับที่ซื้อ */
    expect(ladderFloorBreaches({ ...item, freeItems: [DEAR] })).toEqual(
      ladderFloorBreaches(item),
    );
  });

  it("สูตรของแบบชุดไม่ใช่สูตรของแบบรายตัวที่เปลี่ยนชื่อ", () => {
    /* ทริปไวร์ — ถ้าใครทำให้แบบชุดกลับไปคิดทีละตัวจากราคาตัวเอง ของแถม
       349,000 จะได้เฉลี่ย 249,285.71 ซึ่งไม่หลุดขั้นต่ำ 201,000 และข้อนี้แดง */
    const dear = tierAverages(setInput([DEAR]), T104).find((r) => r.code === DEAR)!;
    expect(dear.average).toBeCloseTo(464.29, 2);
    expect(dear.average).not.toBeCloseTo(249_285.71, 2);
    expect(dear.below).toBe(true);
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

/* ============================================================
   แบบราคาเดียวกัน — เปิดได้เพราะ "ถูกที่สุด" ไม่ใช่คำถามอีกต่อไป

   ทั้งกลุ่มราคาเท่ากัน สามคำตอบของ §2 (ราคาตั้ง · ราคาหลังหักส่วนลด ·
   ต้นทุน) จึงชี้ไปที่ของชิ้นเดียวกันหมด เงื่อนไขราคาเท่ากันไม่ใช่ข้อจำกัด
   ที่แถมมา มันคือสิ่งเดียวที่ทำให้แบบนี้ต่างจากแบบกลุ่มที่ยังปิดอยู่
   ============================================================ */

describe("แบบราคาเดียวกัน", () => {
  /** ปลายขูดหินปูนกลุ่มราคา 315 — ราคาเท่ากันทุกตัวในข้อมูลจริง */
  const TIPS = ["R-TI001-01", "R-TI002-01", "R-TI003-01"];
  /** คนละราคา (120) — ตัวที่ทำให้กลุ่มกลายเป็นสองราคา */
  const ODD = "AA-TH003-WL";

  it("เลือกได้แล้ว แต่แบบกลุ่มยังไม่เปิดตาม", () => {
    expect(OPEN_PROMOTION_SCOPES).toContain("same-price");
    expect(OPEN_PROMOTION_SCOPES).not.toContain("group");
    expect(PROMOTION_SCOPE_TH["same-price"]).toContain("ราคาเดียวกัน");
  });

  it("กลุ่มราคาเดียว = กองเดียว · กลุ่มสองราคา = สองกอง", () => {
    expect(priceClusters(TIPS)).toHaveLength(1);
    expect(isSamePriceGroup(TIPS)).toBe(true);

    const mixed = priceClusters([...TIPS, ODD]);
    expect(mixed).toHaveLength(2);
    expect(isSamePriceGroup([...TIPS, ODD])).toBe(false);

    /* ข้อความบอกทั้งราคาและตัวที่อยู่ในกอง — ไม่ใช่แค่ว่า "ไม่เท่ากัน"
       คนกรอกต้องรู้ว่าต้องเอาตัวไหนออก */
    expect(priceClusterText(mixed)).toContain(ODD);
    expect(priceClusterText(mixed)).toContain("315");
  });

  it("ยังไม่มีราคา ไม่นับว่าราคาเดียวกัน", () => {
    /* "ไม่มีราคา" กับ "ราคา 0" ไม่ใช่เรื่องเดียวกัน และกลุ่มที่ตอบไม่ได้ว่า
       ราคาเท่าไหร่ จะสัญญากับลูกค้าว่าเลือกตัวไหนก็เท่ากันไม่ได้ */
    expect(isSamePriceGroup(["ไม่มีรหัสนี้จริง"])).toBe(false);
    expect(isSamePriceGroup([])).toBe(false);
  });

  it("ด่านเขียนปฏิเสธกลุ่มสองราคา และบอกว่าราคาไหนบ้าง", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0003");
    const guard = applyPromotionPatch(p, {
      scope: "same-price",
      items: [...TIPS, ODD],
    });

    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("ราคาเท่ากันทั้งกลุ่ม");
    expect(guard.reason).toContain(ODD);
    /* ปฏิเสธแล้วต้องไม่มีอะไรลงระเบียน ไม่ใช่ลงครึ่งเดียว */
    expect(p.scope).not.toBe("same-price");
  });

  it("ฝั่งของแถมโดนตรวจด้วย ไม่ใช่แค่ฝั่งที่นับ", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0003");
    const guard = applyPromotionPatch(p, {
      scope: "same-price",
      items: TIPS,
      freeItems: [...TIPS, ODD],
    });
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("ของแถม");
  });

  it("สองกลุ่มราคาเดียวคนละราคากันได้ — ที่ต้องเท่ากันคือภายในกลุ่มเดียวกัน", () => {
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0003");
    const guard = applyPromotionPatch(p, {
      scope: "same-price",
      items: TIPS,
      freeItems: [ODD, "AA-TH003-GR"],
    });
    expect(guard.ok, guard.reason).toBe(true);
    expect(p.scope).toBe("same-price");
  });

  it("ราคาต้นทางเปลี่ยนทีหลัง ไม่ล็อกโปรเดิมไว้ทั้งใบ", () => {
    /* ระเบียนที่กลายเป็นสองราคาโดยไม่มีใครแตะ — การแก้ชื่อของมันไม่ควรถูก
       ปฏิเสธด้วยเรื่องที่คนแก้ไม่ได้ทำ ด่านจึงตรวจเฉพาะตอน patch แตะกลุ่มนั้น
       (บทเรียนเดียวกับแบบกลุ่มที่ค้างอยู่ในข้อมูลตัวอย่าง) */
    setCurrentUser(SALES_MANAGER);
    const p = copy("PM-0003");
    p.scope = "same-price";
    p.items = [...TIPS, ODD];

    expect(applyPromotionPatch(p, { name: "ชื่อใหม่" }).ok).toBe(true);
    expect(p.name).toBe("ชื่อใหม่");
    /* แต่พอแตะกลุ่มนั้นจริง ด่านกลับมาทันที */
    expect(applyPromotionPatch(p, { items: [...TIPS, ODD] }).ok).toBe(false);
  });
});

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
       เลขถัดไปกระโดดไปหลายล้าน

       เดิมข้อนี้ปักผลลัพธ์เป็น "PM-0010" ตรง ๆ ซึ่งผูกกับ**จำนวนแถวใน
       ข้อมูลตัวอย่าง** และแดงทันทีที่เพิ่มโปรตัวที่สิบเข้าไป ทั้งที่ตรรกะที่
       ต้องการปักไม่ได้เปลี่ยน — ตอนนี้ปักที่ตรรกะ: 99 มาจากส่วนหลังขีด
       ไม่ใช่ 25060099 ที่มาจากการอ่านตัวเลขทั้งรหัส */
    setCurrentUser(SALES_ADMIN);
    const highest = Math.max(
      ...PROMOTIONS.map((x) => parseInt(String(x.code).split("-")[1], 10) || 0),
    );
    expect(highest, "ข้อมูลตัวอย่างต้องยังต่ำกว่า 99 ไม่งั้นข้อนี้ทดสอบอย่างอื่น").toBeLessThan(99);

    PROMOTIONS.unshift({ ...blankPromotion(), code: "PM2506-0099", name: "รหัสมีปี" });
    const next = nextPromotionCode();

    expect(next).toBe("PM-0100");
    expect(next, "เลขต้องไม่กระโดดเป็นแปดหลัก").toMatch(/^PM-\d{4}$/);
  });
});
