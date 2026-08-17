import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { PROMO_FORM } from "@/schemas/forms/promotion";
import {
  PROMOTIONS,
  getPromotion,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import type { ActionCtx, FormBlock, FormField, FormState, GridRow } from "@/lib/types";

/* ============================================================
   PROMOTION FORM — §6b ห้ากลุ่ม (PR2b, ฟอร์มเท่านั้น)

   ฟอร์มนี้ไม่มีสิทธิ์เขียนแถวเอง ทุกการเขียนต้องผ่าน `createPromotion`
   และ `applyPromotionPatch` ที่ถือด่านทั้งสี่และธง dirtySinceApproval
   ไฟล์นี้ทดสอบสามเรื่อง

     1. โครงของฟอร์ม   ห้ากลุ่ม · ช่องบังคับไม่เกินเก้า · สามช่องว่างจริง
     2. ทางเขียน       ฟอร์มเรียกโดเมน ไม่ push เอง — ทริปไวร์อยู่ท้ายไฟล์
     3. ค่าอยู่ครบ      เซฟแล้วเปิดกลับมาแก้ ค่าทุกกลุ่มยังอยู่

   ข้อ 3 ตรวจสองรอบเสมอ (ทะเบียน แล้ว toState) เพราะ "มีค่าหลังเซฟ"
   ไม่ได้พิสูจน์ว่า "เปิดกลับมาแล้วยังอยู่" — ช่องที่ toState ลืมแมป
   จะหายไปเงียบ ๆ ตอนกดแก้ แล้วเซฟทับด้วยค่าว่าง
   ============================================================ */

const SALES_ADMIN = "EMP013";
const SALES_REP = "EMP004";

const PROMO_SNAP = JSON.stringify(PROMOTIONS);

beforeEach(() => {
  PROMOTIONS.length = 0;
  PROMOTIONS.push(...(JSON.parse(PROMO_SNAP) as PromotionRow[]));
  window.localStorage.clear();
  resetCurrentUser();
});

/**
 * ช่องที่ "เห็นจริง" ที่ state นั้น — ต้องกรอง `when` เหมือนที่ engine ทำ
 * (FormFields.tsx: `if (f.when && !f.when(api.state)) return null`)
 * ถ้าไม่กรอง เทสต์จะบอกว่าเห็นช่องที่หน้าจอไม่แสดง
 */
const allFields = (state: FormState = PROMO_FORM.blank()): FormField[] =>
  PROMO_FORM.steps
    .flatMap((st) => st.blocks(state))
    .filter((b): b is FormBlock => Boolean(b))
    .flatMap((b) => ("fields" in b ? b.fields : [b]))
    .filter((f): f is FormField => Boolean(f))
    .filter((f) => !f.when || f.when(state));

const paths = (state?: FormState) => allFields(state).map((f) => f.path);

/** บล็อกทุกอันของทุกกลุ่ม ใช้หากล่องเตือน */
const allBlocks = (state: FormState): FormBlock[] =>
  PROMO_FORM.steps.flatMap((st) => st.blocks(state)).filter((b): b is FormBlock => Boolean(b));

const noteTexts = (state: FormState): string[] =>
  allBlocks(state)
    .filter((b) => b.type === "note")
    .map((b) => {
      const n = b as { label?: string; text?: string };
      return `${n.label ?? ""} ${n.text ?? ""}`;
    });

/** ctx ปลอมที่จับ toast กับปลายทางไว้ดู — ไม่มี router ในเทสต์ */
function stubCtx() {
  const toasts: { title: string; body: string; tone?: string }[] = [];
  const gone: string[] = [];
  const ctx = {
    toast: (title: string, body: string, tone?: string) => toasts.push({ title, body, tone }),
    /* saved() เรียกสามตัวนี้ — refresh, toast, goto */
    refresh: () => {},
    goto: (href: string) => gone.push(href),
    openEntity: (_e: string, code: string) => gone.push(code),
  } as unknown as ActionCtx;
  return { ctx, toasts, gone };
}

const g = (codes: string[]): GridRow[] => codes.map((code) => ({ code }));

/**
 * ช่องบังคับที่คนกรอกชนิดนี้เห็นจริง
 *
 * นับจาก `required` ที่ยัง **ไม่ผ่าน** บนฟอร์มเปล่าของชนิดนั้น — ไม่ใช่ความยาว
 * ของ `required` ดิบ เพราะรายการนั้นรวมช่องของทุกชนิดไว้ด้วยกัน ขั้นของแถม
 * กับขั้นส่วนลดไม่เคยบังคับพร้อมกัน คนกรอกโปรหนึ่งใบจึงไม่เคยเจอทั้งคู่
 *
 * เกณฑ์ที่ตกลงกันคือภาระของคนกรอก ตัวเลขนี้จึงเป็นตัวที่ตรงกับเกณฑ์
 */
const requiredFor = (kind: string): string[] => {
  const blank = { ...PROMO_FORM.blank(), kind };
  return PROMO_FORM.required.filter((r) => !r.test || !r.test(blank)).map((r) => r.path);
};

/** ค่าครบทุกกลุ่ม — ในรูปของ state ที่ฟอร์มถืออยู่จริง */
const filled = (): FormState => ({
  ...PROMO_FORM.blank(),
  name: "ซื้อ 5 แถม 1 — หัวขัด",
  printName: "โปรหัวขัดเดือนนี้",
  from: "2026-09-01",
  to: "2026-09-30",
  priority: 3,
  reason: "ล้างสต๊อกใกล้หมดอายุ",
  owner: "ณิชา พงษ์เจริญ",

  scope: "set",
  items: g(["AA-TH003-WL"]),
  priceLists: g(["PL-STD-2026 Standard"]),
  minOrder: 5000,
  minOrderBasis: "ยอดรวมภาษี",

  customerGroups: g(["Dental Clinic"]),
  customers: g(["BP000122"]),
  areas: g(["กรุงเทพและปริมณฑล"]),
  channels: g(["Direct"]),
  allowDraftPartner: true,

  usePerCustomer: 2,
  useTotal: 50,
  stackWithPromo: true,
  stackWithCustomerDiscount: false,
  recordUsage: true,
  needsApproval: true,
  commissionBase: "ยอดที่ลูกค้าจ่ายจริง",

  budget: 80000,
  budgetBasis: "cost",
  budgetOver: "stop",
  budgetWarnAt: 70,
  freeGoodsWarehouse: "WH-BKK Bangkok Main Warehouse",
});

describe("โครงฟอร์ม — §6b", () => {
  it("ห้ากลุ่ม และกลุ่มงบเป็นแท็บของตัวเอง", () => {
    const keys = PROMO_FORM.steps.map((s) => s.key);
    expect(keys.slice(0, 5)).toEqual(["identity", "what", "who", "limits", "budget"]);
  });

  it("ทุกช่องของ PromotionRow กลุ่ม 1–5 มีที่กรอกในฟอร์ม", () => {
    /* ถ้าเพิ่มช่องใน PromotionRow แล้วลืมทำที่กรอก ช่องนั้นจะได้ค่าเริ่มต้น
       ตลอดไปโดยไม่มีใครรู้ว่ามีอยู่ */
    const p = paths();
    for (const k of [
      "name", "printName", "from", "to", "priority", "reason", "owner",
      "scope", "items", "priceLists", "minOrder",
      "nearExpiryOnly",
      "customerGroups", "customers", "areas", "channels", "allowDraftPartner",
      "usePerCustomer", "useTotal", "stackWithPromo", "stackWithCustomerDiscount",
      "recordUsage", "needsApproval", "commissionBase",
      "budget", "freeGoodsWarehouse",
    ]) {
      expect(p, k).toContain(k);
    }

    /* ช่องที่โผล่ตามเงื่อนไข — ต้องมีที่กรอกเมื่อเงื่อนไขมาถึง */
    expect(paths({ ...PROMO_FORM.blank(), minOrder: 5000 })).toContain("minOrderBasis");
    for (const k of ["budgetBasis", "budgetOver", "budgetWarnAt"]) {
      expect(paths({ ...PROMO_FORM.blank(), budget: 5000 }), k).toContain(k);
    }
    expect(paths({ ...PROMO_FORM.blank(), nearExpiryOnly: true })).toContain("nearExpiryDays");
  });

  it("ช่องบังคับที่แต่ละชนิดเห็น ไม่เกินเก้า และทุกช่องเป็นสิ่งที่ระบบเดาแทนไม่ได้", () => {
    for (const kind of ["free-goods", "price-discount"]) {
      const req = requiredFor(kind);
      expect(req.length, `${kind}: ${req.join(" ")}`).toBeLessThanOrEqual(9);
    }

    /* และขั้นของสองชนิดไม่เคยบังคับพร้อมกัน — ถ้าวันหนึ่งบังคับพร้อมกัน
       คนกรอกจะถูกขอขั้นสองชุดสำหรับโปรใบเดียว */
    expect(requiredFor("free-goods")).toContain("tiers");
    expect(requiredFor("free-goods")).not.toContain("discountTiers");
    expect(requiredFor("price-discount")).toContain("discountTiers");
    expect(requiredFor("price-discount")).not.toContain("tiers");

    const req = PROMO_FORM.required.map((r) => r.path);
    /* สามช่องที่ตกลงกันว่าต้องบังคับและห้ามมีค่าเริ่มต้น */
    expect(req).toContain("reason");
    expect(req).toContain("commissionBase");
    expect(req).toContain("freeGoodsWarehouse");
  });

  it("ค่าเริ่มต้นกว้างที่สุด — ไม่จำกัดใคร ไม่จำกัดจำนวน ไม่จำกัดงบ", () => {
    const b = PROMO_FORM.blank();
    expect(b.customerGroups).toEqual([]);
    expect(b.customers).toEqual([]);
    expect(b.areas).toEqual([]);
    expect(b.channels).toEqual([]);
    expect(b.usePerCustomer).toBe("");
    expect(b.useTotal).toBe("");
    expect(b.budget).toBe("");
    expect(b.minOrder).toBe("");
  });

  it("เหตุผลเป็นตัวเลือกตายตัว ไม่ใช่ช่องพิมพ์อิสระ", () => {
    /* พิมพ์เองจะได้สี่สิบคำสำหรับเหตุผลเดียวกัน แล้วจัดกลุ่มเทียบผลไม่ได้ */
    const reason = allFields().find((f) => f.path === "reason")!;
    expect(reason.type).toBe("select");
    expect(reason.options).toBeTruthy();
  });

  it("ฐานคิดค่าคอมอยู่ในกล่องที่บอกว่ากระทบรายได้พนักงาน ไม่ใช่ dropdown เปล่า", () => {
    const card = allBlocks(PROMO_FORM.blank()).find(
      (b) => "fields" in b && b.fields.some((f) => f && f.path === "commissionBase"),
    ) as { title?: string };
    expect(String(card.title)).toContain("ค่าคอม");
    expect(String(card.title)).toMatch(/กระทบรายได้|⚠/);
  });

  it("ช่องรายละเอียดเหตุผลโผล่มาเฉพาะเมื่อเลือกอื่น ๆ", () => {
    expect(paths({ ...PROMO_FORM.blank(), reason: "ล้างสต๊อกใกล้หมดอายุ" })).not.toContain(
      "reasonNote",
    );
    const other = PROMO_FORM.required.find((r) => r.path === "reasonNote")!;
    /* เลือกอื่น ๆ แล้วไม่พิมพ์อะไร = ไม่รู้เหตุผลเลย */
    expect(other.test!({ ...PROMO_FORM.blank(), reason: "อื่น ๆ" })).toBe(false);
    expect(other.test!({ ...PROMO_FORM.blank(), reason: "อื่น ๆ", reasonNote: "งานประชุมวิชาการ" })).toBe(
      true,
    );
    expect(other.test!({ ...PROMO_FORM.blank(), reason: "ล้างสต๊อกใกล้หมดอายุ" })).toBe(true);
  });
});

describe("ล็อตใกล้หมดอายุ — เตือนตอนพิมพ์ ไม่ต้องกดบันทึก", () => {
  const withLotFlagOff = (): FormState => ({
    ...PROMO_FORM.blank(),
    nearExpiryOnly: true,
    nearExpiryDays: 60,
    /* AT-GL001 เป็น Accessory — ไม่ติดตามล็อต ไม่มีวันหมดอายุ
       ระบบจึงไม่รู้ว่าล็อตไหนใกล้หมดอายุ */
    items: g(["AT-GL001"]),
  });

  it("จำนวนวันโผล่มาเฉพาะเมื่อเปิดเงื่อนไขล็อต", () => {
    expect(paths({ ...PROMO_FORM.blank(), nearExpiryOnly: false })).not.toContain("nearExpiryDays");
    expect(paths({ ...PROMO_FORM.blank(), nearExpiryOnly: true })).toContain("nearExpiryDays");
  });

  it("เลือกสินค้าที่ไม่ได้ติดตามล็อต แล้วเปิดเงื่อนไข — เตือนทันทีจาก state", () => {
    /* เตือนคำนวณจาก state ที่กำลังพิมพ์ ไม่ได้รอบันทึก */
    const notes = noteTexts(withLotFlagOff());
    expect(notes.join(" ")).toContain("AT-GL001");
    expect(notes.join(" ")).toMatch(/ติดตามล็อต/);

    /* และกฎกันไว้ที่การบันทึกด้วย ไม่ใช่แค่เตือนแล้วปล่อยผ่าน */
    const rule = PROMO_FORM.rules!.find((r) => String(r.label).includes("ติดตามล็อต"))!;
    expect(rule.test(withLotFlagOff())).toBe(false);
    /* ปิดเงื่อนไขแล้วสินค้าตัวเดิมไม่มีปัญหา และสินค้าที่ติดตามล็อตจริง
       (AA-TH003-WL — Sealant มีวันหมดอายุ) เปิดเงื่อนไขได้ */
    expect(rule.test({ ...PROMO_FORM.blank(), nearExpiryOnly: false, items: g(["AT-GL001"]) })).toBe(
      true,
    );
    expect(
      rule.test({
        ...PROMO_FORM.blank(),
        nearExpiryOnly: true,
        nearExpiryDays: 60,
        items: g(["AA-TH003-WL"]),
      }),
    ).toBe(true);
  });
});

describe("งบประมาณ — คิดจากต้นทุนหรือราคาขาย", () => {
  it("ช่องคิดจากอะไรโผล่มาเมื่อใส่งบ และบังคับตอนนั้น", () => {
    expect(paths({ ...PROMO_FORM.blank(), budget: "" })).not.toContain("budgetBasis");
    expect(paths({ ...PROMO_FORM.blank(), budget: 50000 })).toContain("budgetBasis");

    const rule = PROMO_FORM.rules!.find((r) => String(r.label).includes("ต้นทุนหรือราคาขาย"))!;
    expect(rule.test({ ...PROMO_FORM.blank(), budget: 50000, budgetBasis: "" })).toBe(false);
    expect(rule.test({ ...PROMO_FORM.blank(), budget: 50000, budgetBasis: "cost" })).toBe(true);
    expect(rule.test({ ...PROMO_FORM.blank(), budget: "" })).toBe(true);
  });

  it("ยังไม่เลือกฐานงบ กล่องอธิบายบอกว่าสองแบบต่างกันเป็นเท่าตัว", () => {
    const notes = noteTexts({ ...PROMO_FORM.blank(), budget: 50000 }).join(" ");
    expect(notes).toContain("เท่าตัว");
  });
});

describe("ทางเขียน — ฟอร์มเรียกของเดิม ไม่เขียนแถวเอง", () => {
  it("SALES_REP กดบันทึก: ถูกปฏิเสธพร้อมเหตุผล และไม่มีแถวเพิ่มในทะเบียน", () => {
    setCurrentUser(SALES_REP);
    const before = PROMOTIONS.length;
    const { ctx, toasts } = stubCtx();

    PROMO_FORM.save(filled(), ctx);

    /* ทริปไวร์: ถ้าใครให้ฟอร์ม PROMOTIONS.push() เอง ข้อนี้จะแดงทันที
       เพราะด่านสิทธิ์อยู่ที่ createPromotion ไม่ได้อยู่ที่ปุ่ม */
    expect(PROMOTIONS).toHaveLength(before);
    expect(PROMOTIONS.some((p) => p.name === filled().name)).toBe(false);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].body, "ต้องบอกเหตุผลที่สร้างไม่ได้").toContain("สร้างโปรโมชั่นไม่ได้");
  });

  it("SALES_ADMIN กดบันทึก: ได้แถวใหม่พร้อมรหัส และค่าทุกกลุ่มอยู่ครบ", () => {
    setCurrentUser(SALES_ADMIN);
    const before = PROMOTIONS.length;
    const { ctx, toasts } = stubCtx();

    PROMO_FORM.save(filled(), ctx);

    expect(toasts[0]?.tone, toasts[0]?.body).not.toBe("danger");
    expect(PROMOTIONS).toHaveLength(before + 1);

    const row = PROMOTIONS.find((p) => p.name === filled().name)!;
    expect(row.code).toMatch(/^PM-\d{4}$/);
    expect(row.status).toBe("Draft");

    /* กลุ่ม 1 */
    expect(row.printName).toBe("โปรหัวขัดเดือนนี้");
    expect(row.from).toBe("01/09/2026");
    expect(row.to).toBe("30/09/2026");
    expect(row.priority).toBe(3);
    expect(row.reason).toBe("ล้างสต๊อกใกล้หมดอายุ");
    /* กลุ่ม 2 */
    expect(row.scope).toBe("set");
    expect(row.items).toEqual(["AA-TH003-WL"]);
    expect(row.priceLists).toEqual(["PL-STD-2026 Standard"]);
    expect(row.minOrder).toBe(5000);
    expect(row.minOrderBasis).toBe("ยอดรวมภาษี");
    /* กลุ่ม 3 */
    expect(row.customerGroups).toEqual(["Dental Clinic"]);
    expect(row.customers).toEqual(["BP000122"]);
    expect(row.areas).toEqual(["กรุงเทพและปริมณฑล"]);
    expect(row.channels).toEqual(["Direct"]);
    expect(row.allowDraftPartner).toBe(true);
    /* กลุ่ม 4 */
    expect(row.usePerCustomer).toBe(2);
    expect(row.useTotal).toBe(50);
    expect(row.stackWithPromo).toBe(true);
    expect(row.stackWithCustomerDiscount).toBe(false);
    expect(row.commissionBase).toBe("ยอดที่ลูกค้าจ่ายจริง");
    /* กลุ่ม 5 */
    expect(row.budget).toBe(80000);
    expect(row.budgetBasis).toBe("cost");
    expect(row.budgetOver).toBe("stop");
    expect(row.budgetWarnAt).toBe(70);
    expect(row.freeGoodsWarehouse).toBe("WH-BKK Bangkok Main Warehouse");
  });

  it("เปิดกลับมาแก้ ค่าทุกกลุ่มยังอยู่ในฟอร์ม แล้วเซฟทับไม่ทำให้หาย", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(filled(), ctx);
    const row = PROMOTIONS.find((p) => p.name === filled().name)!;

    /* รอบสอง: เปิดหน้าแก้ = toState(row) ช่องที่ toState ลืมแมปจะโป๊ะที่นี่ */
    const back = PROMO_FORM.toState!(row);
    expect(back.printName).toBe("โปรหัวขัดเดือนนี้");
    expect(back.from).toBe("2026-09-01");
    expect(back.to).toBe("2026-09-30");
    expect(back.reason).toBe("ล้างสต๊อกใกล้หมดอายุ");
    expect(back.scope).toBe("set");
    expect(back.items).toEqual([{ code: "AA-TH003-WL" }]);
    expect(back.priceLists).toEqual([{ code: "PL-STD-2026 Standard" }]);
    expect(back.minOrder).toBe(5000);
    expect(back.customerGroups).toEqual([{ code: "Dental Clinic" }]);
    expect(back.areas).toEqual([{ code: "กรุงเทพและปริมณฑล" }]);
    expect(back.channels).toEqual([{ code: "Direct" }]);
    expect(back.allowDraftPartner).toBe(true);
    expect(back.usePerCustomer).toBe(2);
    expect(back.commissionBase).toBe("ยอดที่ลูกค้าจ่ายจริง");
    expect(back.budget).toBe(80000);
    expect(back.budgetBasis).toBe("cost");
    expect(back.freeGoodsWarehouse).toBe("WH-BKK Bangkok Main Warehouse");

    /* เซฟทับด้วย state ที่เพิ่งอ่านกลับมา แก้ชื่ออย่างเดียว
       ถ้ามีช่องไหนหายไปตอนอ่านกลับ ช่องนั้นจะถูกเขียนทับด้วยค่าว่างที่นี่ */
    PROMO_FORM.save({ ...back, name: "แก้ชื่อแล้ว" }, ctx);
    const again = getPromotion(row.code)!;
    expect(again.name).toBe("แก้ชื่อแล้ว");
    expect(again.items).toEqual(["AA-TH003-WL"]);
    expect(again.budget).toBe(80000);
    expect(again.budgetBasis).toBe("cost");
    expect(again.freeGoodsWarehouse).toBe("WH-BKK Bangkok Main Warehouse");
    expect(again.commissionBase).toBe("ยอดที่ลูกค้าจ่ายจริง");
    /* และไม่ได้สร้างแถวใหม่ตอนแก้ */
    expect(PROMOTIONS.filter((p) => p.code === row.code)).toHaveLength(1);
  });

  it("แก้เงื่อนไขตอนพักโปรที่อนุมัติแล้ว กลับไปรออนุมัติใหม่", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(filled(), ctx);
    const row = PROMOTIONS.find((p) => p.name === filled().name)!;
    row.approvedAt = "01/09/2026";
    row.approvedBy = "สมชาย ใจดี";
    row.status = "Paused";
    row.dirtySinceApproval = false;

    PROMO_FORM.save({ ...PROMO_FORM.toState!(row), minOrder: 9000 }, ctx);

    /* ธงนี้ตั้งโดย applyPromotionPatch เท่านั้น — ถ้าฟอร์มเขียนค่าตรง
       โปรที่แก้เงื่อนไขตอนพักจะกลับมาใช้ได้โดยไม่ต้องอนุมัติซ้ำ */
    expect(getPromotion(row.code)!.minOrder).toBe(9000);
    expect(getPromotion(row.code)!.dirtySinceApproval).toBe(true);
  });

  it("ประเภทที่เลือกจากหน้าก่อนเดินมาถึงแถวจริง", () => {
    /* หน้าเลือกประเภทส่ง `?kind=` route แปลงเป็น seed ให้เป็นค่าใน state
       ถ้า save ไม่ส่งค่านี้ต่อ ทุกโปรจะเป็น "แถมสินค้า" เพราะเป็นค่าเริ่มต้น
       ของ blankPromotion() — ผู้ใช้เลือกแล้วค่าหายเงียบ ๆ */
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save({ ...filled(), kind: "package", name: "โปรแพ็กเกจ" }, ctx);
    expect(PROMOTIONS.find((p) => p.name === "โปรแพ็กเกจ")!.kind).toBe("package");

    /* ประเภทที่ไม่มีในระบบไม่เข้าไปเป็นค่าในทะเบียน */
    PROMO_FORM.save({ ...filled(), kind: "ประเภทที่ไม่มีจริง", name: "โปรประเภทเพี้ยน" }, ctx);
    expect(PROMOTIONS.find((p) => p.name === "โปรประเภทเพี้ยน")!.kind).toBe("free-goods");
  });

  it("สองใบติดกันได้รหัสไม่ซ้ำ", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save({ ...filled(), name: "โปรหนึ่ง" }, ctx);
    PROMO_FORM.save({ ...filled(), name: "โปรสอง" }, ctx);
    const codes = PROMOTIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("ฟอร์มเปิดได้จริง", () => {
  it("เปิดหน้าสร้าง แล้วสามช่องที่ห้ามเดาให้ยังว่าง", async () => {
    setCurrentUser(SALES_ADMIN);
    render(<MasterForm schema={PROMO_FORM} />);

    expect(await screen.findByText("ชื่อโปร (ใช้ภายใน)")).toBeTruthy();

    /* select ที่ยังไม่เลือกต้องไม่มีค่า — ตรวจที่ DOM ไม่ใช่ที่ blank()
       เพราะ engine อาจเลือกตัวแรกให้เองถ้าไม่มี placeholder */
    /* engine ไม่ใส่ name/id ให้ input — ยิงผ่าน placeholder ที่สคีมากำหนด */
    const sels = Array.from(document.querySelectorAll<HTMLSelectElement>("select"));
    const reason = sels.find((el) =>
      Array.from(el.options).some((o) => o.value === "ล้างสต๊อกใกล้หมดอายุ"),
    );
    expect(reason, "หา dropdown เหตุผลไม่เจอ").toBeTruthy();
    expect(reason!.value, "เหตุผลต้องยังไม่ถูกเลือกให้").toBe("");
  });

  it("พิมพ์ชื่อแล้วชื่อนั้นอยู่ในช่อง — ฟอร์มรับค่าได้", async () => {
    setCurrentUser(SALES_ADMIN);
    render(<MasterForm schema={PROMO_FORM} />);
    const name = screen.getByPlaceholderText("ซื้อ 5 แถม 1 — หัวขัด") as HTMLInputElement;
    await userEvent.type(name, "โปรทดสอบ");
    expect(name.value).toBe("โปรทดสอบ");
  });
});

/* ============================================================
   โปรส่วนลดราคา บนฟอร์มเดียวกัน — §1.5

   ฟอร์มเดียวรับสองชนิด ความต่างทั้งหมดอยู่ใน `when` ไม่ใช่ในฟอร์มคนละใบ
   ที่ต้องมาไล่เทียบกันทีหลัง
   ============================================================ */

const discountState = (): FormState => ({
  ...PROMO_FORM.blank(),
  kind: "price-discount",
  name: "ปลายกรอเพชร ราคาพิเศษ",
  from: "2026-09-01",
  reason: "แข่งกับคู่แข่ง",
  scope: "item",
  items: g(["D-AD001-01"]),
  commissionBase: "ยอดที่ลูกค้าจ่ายจริง",
  discountMode: "price",
  discountTiers: [
    { minQty: 5, price: 600, discPct: "" },
    { minQty: 30, price: 470, discPct: "" },
  ],
  /* ส่วนลดราคาไม่หักของแถม ช่องคลังจึงว่างและต้องผ่านได้ */
  freeGoodsWarehouse: "",
});

describe("ฟอร์มโปรส่วนลดราคา", () => {
  it("ตารางขั้นส่วนลดโผล่มาเฉพาะชนิดส่วนลดราคา และของแถมไม่โผล่ปนกัน", () => {
    expect(paths({ ...PROMO_FORM.blank(), kind: "free-goods" })).not.toContain("discountTiers");
    const d = paths({ ...PROMO_FORM.blank(), kind: "price-discount" });
    expect(d).toContain("discountTiers");
    expect(d).toContain("discountMode");
  });

  it("คอลัมน์ในตารางขั้นเปลี่ยนตามแบบที่เลือก ไม่ได้โชว์ทั้งสองช่องให้เดา", () => {
    const colsAt = (mode: string) => {
      const st = { ...PROMO_FORM.blank(), kind: "price-discount", discountMode: mode };
      const grid = allFields(st).find((f) => f.path === "discountTiers")!;
      return (grid.cols ?? []).map((c) => c.key);
    };
    expect(colsAt("price")).toEqual(["minQty", "price"]);
    expect(colsAt("percent")).toEqual(["minQty", "discPct"]);
  });

  it("คลังของแถมไม่ถูกถามและไม่บังคับ เมื่อโปรไม่ได้ให้ของ", () => {
    expect(paths({ ...PROMO_FORM.blank(), kind: "price-discount" })).not.toContain(
      "freeGoodsWarehouse",
    );
    const req = PROMO_FORM.required.find((r) => r.path === "freeGoodsWarehouse")!;
    expect(req.test!({ ...PROMO_FORM.blank(), kind: "price-discount" }), "ส่วนลดผ่านได้").toBe(true);
    expect(req.test!({ ...PROMO_FORM.blank(), kind: "free-goods" }), "แถมสินค้ายังบังคับ").toBe(false);
  });

  it("โปรส่วนลดต้องมีขั้นอย่างน้อยหนึ่งขั้น", () => {
    const req = PROMO_FORM.required.find((r) => r.path === "discountTiers")!;
    expect(req.test!({ ...PROMO_FORM.blank(), kind: "price-discount" })).toBe(false);
    expect(req.test!(discountState())).toBe(true);
    /* ไม่ไปบังคับชนิดอื่นแทน */
    expect(req.test!({ ...PROMO_FORM.blank(), kind: "free-goods" })).toBe(true);
  });

  it("ช่องบังคับที่โปรส่วนลดเห็น ไม่เกินเก้า", () => {
    expect(requiredFor("price-discount").length).toBeLessThanOrEqual(9);
  });

  it("กฎกันขั้นที่กรอกไม่ครบตามแบบ และกันจำนวนซ้ำ", () => {
    const half = PROMO_FORM.rules!.find((r) => String(r.label).includes("ครบตามแบบ"))!;
    expect(half.test(discountState())).toBe(true);
    /* เลือกเปอร์เซ็นต์แต่กรอกราคาไว้ = ขั้นที่ไม่ให้อะไรกับใคร */
    expect(half.test({ ...discountState(), discountMode: "percent" })).toBe(false);

    /* ระบุเจาะจง — มีกฎห้ามซ้ำสองข้อแล้ว (ขั้นของแถม กับ ขั้นส่วนลด)
       `includes("ซ้ำ")` เฉย ๆ จะไปเจอกฎของอีกชนิดแล้วทดสอบผิดตัว */
    const dup = PROMO_FORM.rules!.find((r) => String(r.label).includes("ขั้นส่วนลดห้าม"))!;
    expect(dup.test(discountState())).toBe(true);
    expect(
      dup.test({
        ...discountState(),
        discountTiers: [
          { minQty: 5, price: 600, discPct: "" },
          { minQty: 5, price: 500, discPct: "" },
        ],
      }),
    ).toBe(false);
  });

  it("เตือนตอนพิมพ์: ราคาหลังลดต่ำกว่าราคาขั้นต่ำ — ไม่ต้องกดบันทึก", () => {
    /* 650 − 60% = 260 ต่ำกว่าขั้นต่ำ 280 ของ D-AD001-01 */
    const deep: FormState = {
      ...discountState(),
      discountMode: "percent",
      discountTiers: [{ minQty: 3, price: "", discPct: 60 }],
    };
    const notes = noteTexts(deep).join(" ");
    expect(notes).toContain("ต่ำกว่าราคาขั้นต่ำ");
    expect(notes).toContain("D-AD001-01");
  });

  it("เตือนตอนพิมพ์: โปรนี้ไม่มีผลกับกลุ่มไหน — คำนวณจากตารางราคาจริง", () => {
    /* ขั้นถูกสุด 470 ยังแพงกว่าราคาดีลเลอร์ 460 ⇒ ไม่มีผลกับดีลเลอร์ */
    const notes = noteTexts(discountState()).join(" ");
    expect(notes).toContain("ไม่มีผลกับ");
    expect(notes).toContain("Dealer");

    /* ลดลึกจนถูกกว่าทุกชั้น คำเตือนนั้นต้องหายไป ไม่ใช่ค้างอยู่ตลอด */
    const deeper = noteTexts({
      ...discountState(),
      discountTiers: [{ minQty: 5, price: 300, discPct: "" }],
    }).join(" ");
    expect(deeper).not.toContain("ไม่มีผลกับ");
  });

  it("ยังไม่ได้ตั้งขั้น — ไม่ขึ้นคำเตือนสองอันนั้น", () => {
    /* คำเตือนที่ขึ้นตั้งแต่ฟอร์มยังว่าง คือคำเตือนที่คนกรอกเรียนรู้จะกดข้าม */
    const notes = noteTexts({ ...PROMO_FORM.blank(), kind: "price-discount" }).join(" ");
    expect(notes).not.toContain("ไม่มีผลกับ");
    expect(notes).not.toContain("ต่ำกว่าราคาขั้นต่ำ");
  });

  it("บันทึกแล้วขั้นส่วนลดอยู่ครบ และเปิดกลับมาแก้ยังอยู่", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(discountState(), ctx);

    const row = PROMOTIONS.find((p) => p.name === "ปลายกรอเพชร ราคาพิเศษ")!;
    expect(row.kind).toBe("price-discount");
    expect(row.discountMode).toBe("price");
    expect(row.discountTiers).toEqual([
      { minQty: 5, price: 600, discPct: null },
      { minQty: 30, price: 470, discPct: null },
    ]);
    /* ขั้นของแถมต้องไม่ถูกเขียนอะไรใส่ */
    expect(row.tiers).toEqual([]);

    /* รอบสอง — เปิดหน้าแก้แล้วเซฟทับ ขั้นต้องไม่หาย */
    const back = PROMO_FORM.toState!(row);
    expect(back.discountMode).toBe("price");
    expect(back.discountTiers).toEqual([
      { minQty: 5, price: 600, discPct: "" },
      { minQty: 30, price: 470, discPct: "" },
    ]);
    PROMO_FORM.save({ ...back, name: "แก้ชื่อโปรส่วนลด" }, ctx);
    const again = getPromotion(row.code)!;
    expect(again.discountTiers).toHaveLength(2);
    expect(again.discountTiers[1].price).toBe(470);
    expect(again.discountMode).toBe("price");
  });

  it("แถวขั้นที่ยังไม่กรอกจำนวน ไม่ถูกบันทึกเป็นขั้น 0", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(
      {
        ...discountState(),
        name: "โปรที่มีแถวว่างค้างไว้",
        discountTiers: [
          { minQty: 5, price: 600, discPct: "" },
          { minQty: "", price: "", discPct: "" },
        ],
      },
      ctx,
    );
    const row = PROMOTIONS.find((p) => p.name === "โปรที่มีแถวว่างค้างไว้")!;
    /* ขั้น 0 คือ "ซื้ออะไรก็ได้ราคานี้" ซึ่งไม่มีใครสั่ง */
    expect(row.discountTiers).toEqual([{ minQty: 5, price: 600, discPct: null }]);
  });

  it("เปอร์เซ็นต์เดินมาถึงแถวเป็นเปอร์เซ็นต์ ไม่ถูกแปลงเป็นราคา", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(
      {
        ...discountState(),
        name: "โปรลดเปอร์เซ็นต์",
        discountMode: "percent",
        discountTiers: [{ minQty: 10, price: "", discPct: 25 }],
      },
      ctx,
    );
    const row = PROMOTIONS.find((p) => p.name === "โปรลดเปอร์เซ็นต์")!;
    expect(row.discountMode).toBe("percent");
    expect(row.discountTiers).toEqual([{ minQty: 10, price: null, discPct: 25 }]);
  });
});

/* ============================================================
   PR3b — รูปแบบย่อย · ของแถม · ตารางขั้นบันได

   ก่อนรอบนี้ ขั้นบันไดเข้าระบบได้ทางเดียวคือเขียนลงไฟล์ข้อมูล ฟอร์มไม่มี
   ที่กรอกเลย ทั้งที่มันคือสาระของโปรแถมสินค้า
   ============================================================ */

/** โปรแถมสินค้าที่กรอกครบ — 3 แถม 1 · 10 แถม 4 · 30 แถม 15 ตามเกณฑ์รับงาน */
const freeGoodsState = (): FormState => ({
  ...PROMO_FORM.blank(),
  kind: "free-goods",
  name: "ปลายกรอเพชร ซื้อ 3 แถม 1",
  from: "2026-09-01",
  reason: "แข่งกับคู่แข่ง",
  scope: "item",
  items: g(["D-AD001-01"]),
  tiers: [
    { buy: 3, free: 1 },
    { buy: 10, free: 4 },
    { buy: 30, free: 15 },
  ],
  commissionBase: "มูลค่าบรรทัดหลังเฉลี่ยของแถม",
  freeGoodsWarehouse: "WH-BKK Bangkok Main Warehouse",
});

const gridCols = (st: FormState, path: string) =>
  (allFields(st).find((f) => f.path === path)?.cols ?? []).map((c) => c.key);

/** เซลล์คำนวณของกริดหนึ่งคอลัมน์ — เรียก get/cls ตรง ๆ เหมือนที่ engine ทำ */
const computed = (st: FormState, path: string, key: string, row: GridRow) => {
  const col = (allFields(st).find((f) => f.path === path)?.cols ?? []).find((c) => c.key === key)!;
  return { value: String(col.get!(row) ?? ""), cls: col.cls?.(row) ?? "" };
};

describe("รูปแบบย่อย — บังคับเลือก และแบบกลุ่มยังปิด", () => {
  it("ไม่มีค่าเริ่มต้น ต้องเลือกเอง", () => {
    expect(PROMO_FORM.blank().scope).toBe("");
    expect(PROMO_FORM.required.map((r) => r.path)).toContain("scope");
  });

  it("ตัวเลือกมีสองแบบ ไม่มีแบบกลุ่มให้เลือก", () => {
    const field = allFields({ ...PROMO_FORM.blank(), kind: "free-goods" }).find(
      (f) => f.path === "scope",
    )!;
    const values = (field.options as { value: string }[]).map((o) => o.value);
    expect(values).toEqual(["item", "set"]);
    expect(values).not.toContain("group");
  });

  it("แบบกลุ่มถูกปฏิเสธที่ทางเขียน ไม่ใช่แค่ไม่อยู่ในรายการ", () => {
    /* รายการที่ซ่อนยังส่งมาทาง ?scope=group ได้ และ disabled option ในหลาย
       เบราว์เซอร์ยังโฟกัสได้ — ด่านจริงจึงอยู่ที่ applyPromotionPatch */
    setCurrentUser(SALES_ADMIN);
    const before = PROMOTIONS.length;
    const { ctx, toasts } = stubCtx();

    PROMO_FORM.save({ ...freeGoodsState(), scope: "group", name: "โปรแบบกลุ่ม" }, ctx);

    expect(PROMOTIONS).toHaveLength(before);
    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].body).toContain("แบบกลุ่มยังใช้ไม่ได้");
  });

  it("มีโน้ตบอกว่ามีแบบที่สามและปิดเพราะอะไร", () => {
    /* ตัวเลือกที่หายไปเงียบ ๆ ทำให้คนตั้งโปรคิดว่าระบบทำไม่ได้ ไม่ใช่ยังไม่ตัดสิน */
    const notes = noteTexts({ ...PROMO_FORM.blank(), kind: "free-goods" }).join(" ");
    expect(notes).toContain("กลุ่ม");
    expect(notes).toContain("ถูกที่สุด");
  });

  it("โปรส่วนลดไม่เห็นโน้ตของฝั่งของแถม", () => {
    const notes = noteTexts({ ...PROMO_FORM.blank(), kind: "price-discount" }).join(" ");
    expect(notes).not.toContain("ถูกที่สุด");
  });
});

describe("ของแถมคืออะไร — คนละฝั่งกับสินค้าที่เข้าโปร", () => {
  it("แบบรายตัวไม่ต้องเลือกของแถม แต่บอกไว้ว่าคือตัวเดียวกัน", () => {
    const st = { ...freeGoodsState(), scope: "item" };
    expect(paths(st)).not.toContain("freeItems");
    expect(noteTexts(st).join(" ")).toContain("สินค้าตัวเดียวกัน");
  });

  it("แบบชุดมีกริดของแถมแยก และบังคับให้ระบุ", () => {
    const st = { ...freeGoodsState(), scope: "set" };
    expect(paths(st)).toContain("freeItems");

    const rule = PROMO_FORM.rules!.find((r) => String(r.label).includes("แถมอะไร"))!;
    expect(rule.test(st), "แบบชุดที่ยังไม่ระบุของแถม").toBe(false);
    expect(rule.test({ ...st, freeItems: g(["D-AD004-01"]) })).toBe(true);
    /* ไม่ไปบังคับแบบรายตัวแทน */
    expect(rule.test({ ...freeGoodsState(), scope: "item" })).toBe(true);
  });

  it("ของแถมเดินถึงแถวจริง และเปิดกลับมายังอยู่", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(
      { ...freeGoodsState(), name: "โปรแบบชุด", scope: "set", freeItems: g(["D-AD004-01"]) },
      ctx,
    );
    const row = PROMOTIONS.find((p) => p.name === "โปรแบบชุด")!;
    expect(row.scope).toBe("set");
    expect(row.freeItems).toEqual(["D-AD004-01"]);
    /* ฝั่งเงื่อนไขไม่ถูกปนกับฝั่งของแถม */
    expect(row.items).toEqual(["D-AD001-01"]);

    expect(PROMO_FORM.toState!(row).freeItems).toEqual([{ code: "D-AD004-01" }]);
  });
});

describe("ตารางขั้นบันได", () => {
  it("คอลัมน์ครบ และช่องกรอกเขียนว่า ซื้อ (จ่ายจริง)", () => {
    const st = freeGoodsState();
    expect(gridCols(st, "tiers")).toEqual(["buy", "free", "total", "avg"]);

    /* คำนี้เป็นจุดที่สับสนที่สุด — "ซื้อ" เฉย ๆ ไม่บอกว่านับของแถมด้วยไหม */
    const col = (allFields(st).find((f) => f.path === "tiers")!.cols ?? []).find(
      (c) => c.key === "buy",
    )!;
    expect(col.label).toBe("ซื้อ (จ่ายจริง)");
  });

  it("ตารางขั้นของแถมไม่โผล่ในโปรส่วนลด และกลับกัน", () => {
    expect(paths({ ...PROMO_FORM.blank(), kind: "free-goods" })).toContain("tiers");
    expect(paths({ ...PROMO_FORM.blank(), kind: "price-discount" })).not.toContain("tiers");
    expect(paths({ ...PROMO_FORM.blank(), kind: "free-goods" })).not.toContain("discountTiers");
  });

  it("ราคาเฉลี่ยคำนวณจากราคาสินค้าจริง — 650 ซื้อ 3 แถม 1 = 487.50", () => {
    const st = freeGoodsState();
    expect(computed(st, "tiers", "avg", { buy: 3, free: 1 }).value).toContain("487.50");
    expect(computed(st, "tiers", "total", { buy: 3, free: 1 }).value).toBe("4");
  });

  it("ราคาเฉลี่ยขึ้นสีเตือนทันทีที่ต่ำกว่าราคาขั้นต่ำ — ตอนพิมพ์ ไม่ต้องบันทึก", () => {
    /* D-AD001-01 ราคา 650 ขั้นต่ำ 280 — ซื้อ 3 แถม 5 ได้เฉลี่ย 243.75 */
    const st = freeGoodsState();
    const bad = computed(st, "tiers", "avg", { buy: 3, free: 5 });
    expect(bad.value).toContain("243.75");
    expect(bad.cls, "ต้องใช้ token สีเดิมของระบบ").toContain("text-danger");

    const ok = computed(st, "tiers", "avg", { buy: 3, free: 1 });
    expect(ok.cls).toBe("");
  });

  it("สรุปเป็นข้อความด้วย ไม่ใช่มีแต่สีในตารางที่อาจเลื่อนออกนอกจอ", () => {
    const notes = noteTexts({
      ...freeGoodsState(),
      tiers: [{ buy: 3, free: 5 }],
    }).join(" ");
    expect(notes).toContain("ต่ำกว่าราคาขั้นต่ำ");
    expect(notes).toContain("243.75");

    /* ขั้นที่ปลอดภัยไม่ทำให้ขึ้นคำเตือน */
    expect(noteTexts(freeGoodsState()).join(" ")).not.toContain("ต่ำกว่าราคาขั้นต่ำ");
  });

  it("ยังไม่เลือกสินค้า — ราคาเฉลี่ยเป็นขีด ไม่ใช่ศูนย์", () => {
    /* ศูนย์อ่านว่าแถมแล้วฟรีทั้งบรรทัด ซึ่งไม่จริง ยังไม่รู้ราคาต่างหาก */
    const st = { ...freeGoodsState(), items: [] };
    expect(computed(st, "tiers", "avg", { buy: 3, free: 1 }).value).toBe("—");
  });

  it("กฎกันขั้นที่แถมศูนย์ และกันจำนวนซื้อซ้ำ", () => {
    const zero = PROMO_FORM.rules!.find((r) => String(r.label).includes("มากกว่าศูนย์"))!;
    expect(zero.test(freeGoodsState())).toBe(true);
    expect(zero.test({ ...freeGoodsState(), tiers: [{ buy: 3, free: 0 }] })).toBe(false);

    const dup = PROMO_FORM.rules!.find((r) => String(r.label).includes("ขั้นของแถมห้าม"))!;
    expect(dup.test(freeGoodsState())).toBe(true);
    expect(
      dup.test({
        ...freeGoodsState(),
        tiers: [
          { buy: 3, free: 1 },
          { buy: 3, free: 2 },
        ],
      }),
    ).toBe(false);
  });

  it("โปรแถมสินค้าต้องมีขั้นอย่างน้อยหนึ่งขั้น", () => {
    const req = PROMO_FORM.required.find((r) => r.path === "tiers")!;
    expect(req.test!({ ...freeGoodsState(), tiers: [] })).toBe(false);
    expect(req.test!(freeGoodsState())).toBe(true);
    /* ไม่ไปบังคับโปรส่วนลด */
    expect(req.test!({ ...PROMO_FORM.blank(), kind: "price-discount" })).toBe(true);
  });
});

describe("ขั้นบันไดอยู่ครบตลอดทาง", () => {
  it("กรอก 3 แถม 1 · 10 แถม 4 · 30 แถม 15 แล้วบันทึกได้ครบ และเปิดกลับมายังอยู่", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx, toasts } = stubCtx();
    PROMO_FORM.save(freeGoodsState(), ctx);

    expect(toasts[0]?.tone, toasts[0]?.body).not.toBe("danger");
    const row = PROMOTIONS.find((p) => p.name === "ปลายกรอเพชร ซื้อ 3 แถม 1")!;
    expect(row.tiers).toEqual([
      { buy: 3, free: 1 },
      { buy: 10, free: 4 },
      { buy: 30, free: 15 },
    ]);
    /* ขั้นส่วนลดต้องไม่ถูกเขียนอะไรใส่ */
    expect(row.discountTiers).toEqual([]);

    /* รอบสอง — เปิดหน้าแก้ ขั้นต้องอยู่ครบสามขั้นในรูปที่กริดอ่านได้ */
    const back = PROMO_FORM.toState!(row);
    expect(back.tiers).toEqual([
      { buy: 3, free: 1 },
      { buy: 10, free: 4 },
      { buy: 30, free: 15 },
    ]);

    /* แล้วเซฟทับ ขั้นต้องไม่หาย */
    PROMO_FORM.save({ ...back, name: "แก้ชื่อแล้ว" }, ctx);
    expect(getPromotion(row.code)!.tiers).toHaveLength(3);
  });

  it("แก้โปรที่มีขั้นอยู่แล้ว โดยไม่แตะตารางขั้น — ขั้นเดิมยังอยู่ครบ", () => {
    /* ก่อน PR3b `tiers` ไม่อยู่ใน toPatch เลย จึงไม่มีทางถูกล้าง พอต่อสายแล้ว
       ความปลอดภัยนั้นหายไป — การเปิดหน้าแก้แล้วเซฟโดยไม่แตะตาราง ต้องไม่ทำให้
       ขั้นสามขั้นของโปรที่ใช้งานอยู่กลายเป็นศูนย์ขั้น
       นี่คือรูปแบบ "เซฟแล้วมีค่า แต่เปิดกลับมาแล้วหาย" ที่เจอตอน A2a */
    setCurrentUser(SALES_ADMIN);
    const seeded = getPromotion("PM-0001")!;
    expect(seeded.tiers, "ข้อมูลตัวอย่างต้องมีขั้นอยู่ก่อน").toHaveLength(3);
    const wasTiers = JSON.parse(JSON.stringify(seeded.tiers));
    /* โปรที่ใช้งานอยู่แก้ไม่ได้ตามด่านเดิม จึงหยุดชั่วคราวก่อนเหมือนคนจริง */
    seeded.status = "Paused";

    const { ctx, toasts } = stubCtx();
    PROMO_FORM.save({ ...PROMO_FORM.toState!(seeded), printName: "ชื่อใหม่บนเอกสาร" }, ctx);

    expect(toasts[0]?.tone, toasts[0]?.body).not.toBe("danger");
    const after = getPromotion("PM-0001")!;
    expect(after.printName).toBe("ชื่อใหม่บนเอกสาร");
    expect(after.tiers, "ขั้นเดิมต้องยังอยู่ครบ").toEqual(wasTiers);
    expect(after.tiers).toHaveLength(3);
  });

  it("แถวขั้นที่ยังไม่กรอกจำนวนซื้อ ไม่ถูกบันทึกเป็นขั้น 0", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(
      {
        ...freeGoodsState(),
        name: "โปรที่มีแถวขั้นว่างค้าง",
        tiers: [{ buy: 3, free: 1 }, { buy: "", free: "" }],
      },
      ctx,
    );
    /* ขั้นที่ซื้อ 0 คือของแถมไม่จำกัด และจะทำให้ bestLadder วนไม่รู้จบ
       ตัวคำนวณกันไว้อยู่แล้ว แต่ข้อมูลที่บันทึกไปก็ไม่ควรมีขั้นนั้น */
    expect(PROMOTIONS.find((p) => p.name === "โปรที่มีแถวขั้นว่างค้าง")!.tiers).toEqual([
      { buy: 3, free: 1 },
    ]);
  });
});
