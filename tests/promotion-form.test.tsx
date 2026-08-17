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

  it("ช่องบังคับไม่เกินเก้า และทุกช่องเป็นสิ่งที่ระบบเดาแทนไม่ได้", () => {
    expect(PROMO_FORM.required.length).toBeLessThanOrEqual(9);
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
