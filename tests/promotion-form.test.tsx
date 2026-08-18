import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { PROMO_FORM } from "@/schemas/forms/promotion";
import {
  PROMOTIONS,
  PROMOTION_SCOPE_TH,
  blankPromotion,
  getPromotion,
  productFloor,
  promotionFloorBreaches,
  worstTierAverage,
  type PromotionRow,
} from "@/lib/domain/promotion";
import type { LadderTier } from "@/lib/domain/promotion-ladder";
import { catalogPrice } from "@/lib/domain/pricing";
import { money } from "@/lib/format";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { SALES_AREAS } from "@/data/sales-areas";
import { BUSINESS_PARTNERS, isCustomerRole } from "@/lib/domain/partner";
import { SR_CHANNELS, SR_CUST_GROUPS } from "@/data/sales-reps";
import type {
  ActionCtx,
  FormBlock,
  FormCard,
  FormField,
  FormState,
  GridRow,
} from "@/lib/types";

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

/**
 * ช่องที่เห็นจริง "ในกลุ่มนั้น"
 *
 * `paths` รวมทุกกลุ่มเข้าด้วยกัน จึงตอบได้แค่ว่าช่องนั้นมีที่กรอกไหม ไม่ได้ตอบ
 * ว่าอยู่ตรงไหน — และรอบนี้ตำแหน่งคือสิ่งที่เปลี่ยน
 */
const stepPaths = (
  key: string,
  state: FormState = PROMO_FORM.blank(),
): (string | undefined)[] =>
  (PROMO_FORM.steps.find((s) => s.key === key)?.blocks(state) ?? [])
    .filter((b): b is FormBlock => Boolean(b))
    .flatMap((b) => ("fields" in b ? b.fields : [b]))
    .filter((f): f is FormField => Boolean(f))
    .filter((f) => !f.when || f.when(state))
    .map((f) => f.path);

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

/** ค่าที่กริดนั้นเก็บจริง — ตัวเลือกเป็น value/label ตั้งแต่รายการสินค้าขึ้นชื่อด้วย */
const optionValues = (path: string, state?: FormState): string[] =>
  ((allFields(state).find((f) => f.path === path)!.cols ?? []).find(
    (c) => c.type === "select",
  )!.options ?? []
  ).map((o) => (typeof o === "string" ? o : o.value));

/** ข้อความที่คนอ่านเห็นในกริดนั้น */
const optionLabels = (path: string, state?: FormState): string[] =>
  ((allFields(state).find((f) => f.path === path)!.cols ?? []).find(
    (c) => c.type === "select",
  )!.options ?? []
  ).map((o) => (typeof o === "string" ? o : o.label));

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
  reason: "ล้างสต๊อกใกล้หมดอายุ",

  scope: "set",
  items: g(["AA-TH003-WL"]),
  priceLists: g(["PL-STD-2026 Standard"]),
  minOrder: 5000,
  minOrderBasis: "ยอดรวมภาษี",

  customerGroups: ["Dental Clinic"],
  customers: g(["BP000122"]),
  areas: ["กรุงเทพและปริมณฑล"],
  channels: ["Direct"],

  usePerCustomer: 2,
  useTotal: 50,
  stackWithPromo: true,
  stackWithCustomerDiscount: false,
  commissionBase: "ยอดที่ลูกค้าจ่ายจริง",
});

describe("โครงฟอร์ม — §6b", () => {
  it("สามกลุ่มเงื่อนไข และ 'ใช้กับอะไร' อยู่ท้ายสุดก่อนตรวจทาน", () => {
    /* §6b บอกว่ามีกลุ่มอะไรบ้าง ไม่ได้บอกว่าต้องเรียงยังไง — กลุ่มที่ตอบได้จาก
       ตัวแคมเปญเองขึ้นก่อน แล้วปิดท้ายด้วยงานยาวที่สุด (เลือกสินค้า ตั้งขั้น
       ลองคำนวณ) ถ้าวางงานยาวไว้กลางทาง คำถามสั้นที่เหลือจะถูกอ่านตอนคนกรอก
       ล้าไปแล้ว

       กลุ่มงบและคลังถูกตัดออกทั้งกลุ่ม — ช่องยังอยู่ในระเบียนและหน้ารายละเอียด
       ยังแสดงของเดิม แต่ฟอร์มไม่ถามแล้ว */
    const keys = PROMO_FORM.steps.map((s) => s.key);
    expect(keys).toEqual(["identity", "who", "limits", "what", "review"]);
  });

  it("ทุกช่องของ PromotionRow กลุ่ม 1–5 มีที่กรอกในฟอร์ม", () => {
    /* ถ้าเพิ่มช่องใน PromotionRow แล้วลืมทำที่กรอก ช่องนั้นจะได้ค่าเริ่มต้น
       ตลอดไปโดยไม่มีใครรู้ว่ามีอยู่ */
    /* ลำดับความสำคัญกับเจ้าของโปรไม่อยู่ในรายการนี้ — ตั้งใจเอาออกจากฟอร์ม
       และมีเทสต์ของตัวเองข้างล่างว่าเอาออกแล้วไม่ได้ล้างค่าของแถวที่มีอยู่ */
    const p = paths();
    for (const k of [
      "name", "printName", "from", "to", "reason",
      "scope", "items", "priceLists", "minOrder",
      "nearExpiryOnly",
      "customerGroups", "customers", "areas", "channels",
      "usePerCustomer", "usePerArea", "useTotal", "freeQtyCap",
      "stackWithPromo", "stackWithCustomerDiscount",
      "commissionBase", "paymentTerm",
    ]) {
      expect(p, k).toContain(k);
    }

    /* ช่องที่โผล่ตามเงื่อนไข — ต้องมีที่กรอกเมื่อเงื่อนไขมาถึง */
    expect(paths({ ...PROMO_FORM.blank(), minOrder: 5000 })).toContain("minOrderBasis");
    expect(paths({ ...PROMO_FORM.blank(), nearExpiryOnly: true })).toContain("nearExpiryDays");
    expect(paths({ ...PROMO_FORM.blank(), stackWithPromo: true })).toContain("stackWithPromos");
    expect(
      paths({ ...PROMO_FORM.blank(), paymentTerm: "มัดจำก่อนส่งของ" }),
    ).toContain("depositPct");
  });

  it("ไม่ถามเรื่องงบและคลังแล้ว — ทั้งกลุ่ม ไม่ใช่ซ่อนบางช่อง", () => {
    /* ช่องที่ยังอยู่ใน PromotionRow แต่ฟอร์มไม่ถาม ทุกใบใหม่จะได้ค่าจาก
       `blankPromotion()` — ไม่จำกัดงบ และไม่ระบุคลังที่หักของแถม */
    const p = paths({ ...PROMO_FORM.blank(), budget: 5000, kind: "free-goods" });
    for (const k of ["budget", "budgetBasis", "budgetOver", "budgetWarnAt", "freeGoodsWarehouse"]) {
      expect(p, k).not.toContain(k);
    }
    expect(PROMO_FORM.steps.map((s) => s.key)).not.toContain("budget");
    expect(PROMO_FORM.required.map((r) => r.path)).not.toContain("freeGoodsWarehouse");
  });

  it("รูปแบบเป็นคำถามแรกของฟอร์ม และเป็นปุ่ม ไม่ใช่ dropdown", () => {
    /* คำตอบของช่องนี้เปลี่ยนความหมายของช่องที่เหลือ (รายตัวไม่ต้องเลือกของแถม
       ชุดที่กำหนดต้องเลือก) คนกรอกที่เจอมันกลางกลุ่มที่สองจะกรอกไปหลายช่อง
       ก่อนรู้ว่ากรอกผิดกล่อง */
    const first = PROMO_FORM.steps[0].blocks(PROMO_FORM.blank())[0] as FormCard;
    const field = (first.fields.filter(Boolean) as FormField[])[0];
    expect(field.path).toBe("scope");
    expect(field.type).toBe("choice");

    /* ย้ายมาแล้วจริง ไม่ใช่ทำสำเนาไว้สองที่ */
    expect(stepPaths("what")).not.toContain("scope");
    /* และปุ่มที่พาไปช่องที่ยังไม่ได้กรอก ต้องพาไปกลุ่มที่ช่องนั้นอยู่จริง */
    expect(PROMO_FORM.required.find((r) => r.path === "scope")!.step).toBe("identity");
  });

  it("ยอดสั่งซื้อขั้นต่ำอยู่ในกลุ่มข้อมูลโปร ไม่ใช่เหนือตารางสินค้า", () => {
    /* เกณฑ์ผ่าน/ไม่ผ่านของทั้งใบ ไม่ใช่คุณสมบัติของสินค้าตัวไหน — วางไว้เหนือ
       ตารางสินค้าแล้วอ่านเหมือนยอดขั้นต่ำต่อสินค้าหนึ่งตัว */
    expect(stepPaths("identity")).toContain("minOrder");
    expect(stepPaths("what")).not.toContain("minOrder");
    expect(stepPaths("identity", { ...PROMO_FORM.blank(), minOrder: 5000 })).toContain(
      "minOrderBasis",
    );
    expect(stepPaths("what", { ...PROMO_FORM.blank(), minOrder: 5000 })).not.toContain(
      "minOrderBasis",
    );
  });

  it("ลำดับความสำคัญ เจ้าของโปร ประเภทโปร และขอบเขตลูกค้า ไม่อยู่บนฟอร์มแล้ว", () => {
    const p = paths();
    expect(p).not.toContain("priority");
    expect(p).not.toContain("owner");
    expect(p).not.toContain("allowDraftPartner");
    /* ประเภทเลือกไปแล้วที่หน้าก่อนหน้า และแก้ที่นี่ไม่ได้อยู่แล้ว —
       ช่องอ่านอย่างเดียวที่แก้ไม่ได้ ไม่ได้ช่วยให้ใครกรอกอะไรได้ */
    expect(allFields().some((f) => f.path === "kind")).toBe(false);
  });

  it("ไม่ถามแล้ว ≠ ล้างทิ้ง — เซฟทับโปรเก่า ค่าสองช่องนั้นยังอยู่", () => {
    /* `applyPromotionPatch` เขียนด้วย Object.assign ช่องที่ไม่มีใน patch จึงคง
       ค่าเดิม ถ้า toPatch ส่ง "" หรือ 0 มาแทนที่จะไม่ส่งเลย การแก้ชื่อโปรเก่า
       หนึ่งครั้งจะล้างสองช่องนั้นทิ้ง และหน้ารายละเอียดยังแสดงสองช่องนี้อยู่ */
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(filled(), ctx);
    const row = PROMOTIONS.find((x) => x.name === filled().name)!;

    /* แถวใหม่ได้ค่าจากโดเมน ไม่ใช่จากฟอร์ม */
    expect(row.priority).toBe(blankPromotion().priority);
    expect(row.owner).toBe(blankPromotion().owner);

    /* แถวที่มีค่าอยู่แล้ว — แก้ชื่อผ่านฟอร์มต้องไม่แตะสองช่องนั้น */
    row.priority = 2;
    row.owner = "ณิชา พงษ์เจริญ";
    PROMO_FORM.save({ ...PROMO_FORM.toState!(row), name: "แก้ชื่อแล้ว" }, ctx);

    const again = getPromotion(row.code)!;
    expect(again.name).toBe("แก้ชื่อแล้ว");
    expect(again.priority).toBe(2);
    expect(again.owner).toBe("ณิชา พงษ์เจริญ");
  });

  it("สินค้าที่เข้าโปรเพิ่มทีละหลายตัวได้", () => {
    /* โปรหนึ่งใบครอบสินค้าทั้งตระกูล — ทีละตัวคือการเปิด dropdown เดิมซ้ำ
       เท่าจำนวนสินค้า โดยที่ dropdown บังรายการที่เลือกไปแล้ว */
    const items = allFields().find((f) => f.path === "items")!;
    expect(items.multiAdd).toBe(true);
    /* ปุ่มนั้นเติมคอลัมน์แรกที่มีรายการให้เลือก ถ้าไม่มี ปุ่มจะไม่ขึ้นเลย */
    const col = (items.cols ?? []).find((c) => c.type === "select");
    expect(col?.options?.length ?? 0).toBeGreaterThan(0);
  });

  it("กลุ่มแรกเหลือสองกรอบ — รูปแบบ กับกรอบเดียวที่รวมที่เหลือไว้", () => {
    /* เคยเป็นสามกรอบซ้อนกัน (ชื่อ · ยอดขั้นต่ำ · เหตุผล) ทั้งที่ทุกช่องในนั้น
       เป็นเงื่อนไขระดับใบเหมือนกัน — สามหัวข้อกับเส้นขอบสามชั้นบังคับให้กวาดตา
       สามรอบเพื่ออ่านสิ่งที่อ่านรอบเดียวได้ */
    const cards = PROMO_FORM.steps[0]
      .blocks(PROMO_FORM.blank())
      .filter(Boolean) as FormCard[];
    expect(cards).toHaveLength(2);

    const merged = (cards[1].fields.filter(Boolean) as FormField[]).map((f) => f.path);
    for (const k of ["code", "name", "printName", "from", "to", "minOrder", "reason"]) {
      expect(merged, k).toContain(k);
    }
  });

  it("กลุ่มลูกค้า เขตขาย ช่องทาง — ติ๊กจากรายการ ไม่ใช่เพิ่มทีละแถว", () => {
    /* ว่าง = ทุกอัน เป็นคำตอบของเกือบทุกโปร และเป็นคำตอบที่ตารางว่างกับปุ่ม
       "เพิ่ม" สื่อได้แย่ที่สุด — มันอ่านเหมือนฟอร์มที่ยังกรอกไม่เสร็จ */
    for (const [path, allLabel, count] of [
      ["customerGroups", "ทุกกลุ่มลูกค้า", SR_CUST_GROUPS.length],
      ["areas", "ทุกเขต", SALES_AREAS.length],
      ["channels", "ทุกช่องทาง", SR_CHANNELS.length],
    ] as const) {
      const f = allFields().find((x) => x.path === path)!;
      expect(f.type, path).toBe("picks");
      expect(f.allLabel, path).toBe(allLabel);
      /* ทุกตัวเลือกอยู่บนหน้า ไม่ใช่ซ่อนอยู่หลังปุ่มเพิ่ม */
      expect(f.options, path).toHaveLength(count);
    }

    /* ค่าที่เก็บเป็นรายการข้อความตรง ๆ และว่างไว้ = ทุกอัน ทั้งขาไปและขากลับ */
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save({ ...filled(), name: "โปรทุกกลุ่ม", customerGroups: [], areas: [] }, ctx);
    const row = PROMOTIONS.find((p) => p.name === "โปรทุกกลุ่ม")!;
    expect(row.customerGroups).toEqual([]);
    expect(row.areas).toEqual([]);
    expect(PROMO_FORM.toState!(row).customerGroups).toEqual([]);
  });

  it("ข้อจำกัดทั้งกลุ่มอยู่กรอบเดียว สามคอลัมน์ และว่างไว้ = ไม่จำกัด", () => {
    /* ทุกช่องในกรอบนี้ตอบคำถามเดียวกันว่า "ใบที่ใช้โปรนี้ถูกจำกัดอะไรบ้าง" —
       แยกกรอบละมุมจะได้สามกรอบที่อ่านเหมือนสามเรื่อง กรอบละไม่กี่ช่อง */
    const card = allBlocks({ ...PROMO_FORM.blank(), kind: "free-goods" }).find(
      (b) => "fields" in b && b.fields.some((f) => f && f.path === "usePerArea"),
    ) as FormCard;
    const inCard = (card.fields.filter(Boolean) as FormField[]).map((f) => f.path);
    for (const k of [
      "usePerCustomer", "usePerArea", "useTotal", "freeQtyCap",
      "stackWithPromo", "stackWithCustomerDiscount",
      "stackWithPromos", "paymentTerm", "depositPct",
    ]) {
      expect(inCard, k).toContain(k);
    }
    expect(card.cols).toBe("3");

    /* ทุกช่องเพดานบอกเหมือนกันว่าว่างไว้แปลว่าอะไร — ห้าช่องที่ความหมายเดียวกัน
       แต่บอกคนละสำนวน คือห้าช่องที่คนกรอกต้องเดาทีละช่อง */
    for (const k of ["usePerCustomer", "usePerArea", "useTotal", "freeQtyCap"]) {
      const f = (card.fields.filter(Boolean) as FormField[]).find((x) => x.path === k)!;
      expect(String(f.hint), k).toContain("ว่างไว้ = ไม่จำกัด");
    }

    /* และค่าคอมไม่ถูกรวมมาด้วย — §6b สั่งให้เป็นกล่องเตือนของตัวเอง */
    expect(inCard).not.toContain("commissionBase");

    const b = PROMO_FORM.blank();
    for (const k of ["usePerArea", "freeQtyCap"]) {
      expect(b[k], k).toBe("");
    }
    /* ของแถมกี่ชิ้นไม่ถูกถามกับชนิดที่ไม่มีของแถม */
    expect(paths({ ...PROMO_FORM.blank(), kind: "price-discount" })).not.toContain("freeQtyCap");
  });

  it("ซ้อนกับโปรอื่น — เลือกได้ว่าตัวไหน และตัวเองไม่อยู่ในรายการ", () => {
    /* ว่าง = ทุกโปร แบบเดียวกับกลุ่มลูกค้าและเขตขาย */
    expect(paths({ ...PROMO_FORM.blank(), stackWithPromo: false })).not.toContain(
      "stackWithPromos",
    );
    const self = PROMOTIONS[0];
    const f = allFields({ ...PROMO_FORM.toState!(self), stackWithPromo: true }).find(
      (x) => x.path === "stackWithPromos",
    )!;
    expect(f.type).toBe("picks");
    const values = (f.options ?? []).map((o) => (typeof o === "string" ? o : o.value));
    expect(values, "ซ้อนกับตัวเองไม่ใช่คำถาม").not.toContain(self.code);
    expect(values.length).toBe(PROMOTIONS.length - 1);
  });

  it("เงื่อนไขการชำระเงิน — เลือกมัดจำแล้วต้องบอกกี่ %", () => {
    const req = PROMO_FORM.required.find((r) => r.path === "depositPct")!;
    expect(req.test!({ ...PROMO_FORM.blank() }), "ไม่กำหนดเทอม ผ่านได้").toBe(true);
    expect(req.test!({ ...PROMO_FORM.blank(), paymentTerm: "จ่ายสดเท่านั้น" })).toBe(true);
    expect(req.test!({ ...PROMO_FORM.blank(), paymentTerm: "มัดจำก่อนส่งของ" })).toBe(false);
    expect(
      req.test!({ ...PROMO_FORM.blank(), paymentTerm: "มัดจำก่อนส่งของ", depositPct: 30 }),
    ).toBe(true);
  });

  it("ลูกค้าเจาะจงเลือกจากทะเบียน — ขึ้นรหัสกับชื่อ และเพิ่มทีละหลายราย", () => {
    /* เคยเป็นช่องพิมพ์รหัสเปล่า พิมพ์ BP000112 แทน BP000121 แล้วโปรจะไปตกกับ
       ลูกค้าคนอื่นโดยที่ฟอร์มไม่มีทางรู้ */
    const f = allFields().find((x) => x.path === "customers")!;
    expect(f.multiAdd).toBe(true);
    const col = (f.cols ?? []).find((c) => c.key === "code")!;
    expect(col.type).toBe("select");

    const values = (col.options ?? []).map((o) => (typeof o === "string" ? o : o.value));
    const labels = (col.options ?? []).map((o) => (typeof o === "string" ? o : o.label));
    expect(values.length).toBeGreaterThan(0);
    /* ค่าที่เก็บเป็นรหัส BP เปล่า — ทุกที่ที่อ้างลูกค้าใช้รหัสนี้ */
    for (const v of values) expect(v).toMatch(/^BP[0-9]+$/);
    expect(labels.every((l) => l.includes(" — ")), "ต้องมีชื่อต่อท้ายรหัส").toBe(true);
    /* เฉพาะคู่ค้าที่เป็นลูกค้า (รวมตัวแทนจำหน่าย) และยัง Active */
    for (const bp of BUSINESS_PARTNERS) {
      if (bp.status === "Active" && isCustomerRole(bp)) expect(values, bp.code).toContain(bp.code);
      else expect(values, bp.code).not.toContain(bp.code);
    }
  });

  it("รหัสโปรพิมพ์เองได้ตอนสร้าง และอ่านอย่างเดียวหลังบันทึก", () => {
    /* รหัสที่เปลี่ยนได้หลังสร้าง ทำให้เอกสารทุกใบที่อ้างถึงมันกลายเป็นเอกสาร
       ที่อ้างถึงของที่ไม่มีอยู่ */
    const onCreate = allFields(PROMO_FORM.blank()).filter((f) => f.path === "code");
    expect(onCreate).toHaveLength(1);
    expect(onCreate[0].type).toBe("text");

    const row = PROMOTIONS[0];
    const onEdit = allFields(PROMO_FORM.toState!(row)).filter((f) => f.path === "code");
    expect(onEdit).toHaveLength(1);
    expect(onEdit[0].type).toBe("static");
  });

  it("ตัวเลือกสินค้าขึ้นทั้งรหัสและชื่อ แต่เก็บรหัสเปล่า", () => {
    /* ทุกตัวคำนวณในระบบค้นด้วยรหัส (catalogPrice · productFloor · lotTracked)
       ถ้าเก็บ "รหัส — ชื่อ" ลงไป ทุกตัวจะหาไม่เจอพร้อมกัน */
    const where: Record<string, FormState> = {
      items: { ...PROMO_FORM.blank(), kind: "free-goods" },
      freeItems: { ...PROMO_FORM.blank(), kind: "free-goods", scope: "set" },
      redeemItems: { ...PROMO_FORM.blank(), kind: "redeem" },
    };
    for (const [path, state] of Object.entries(where)) {
      const values = optionValues(path, state);
      const labels = optionLabels(path, state);
      expect(values, path).toContain("AA-TH003-WL");
      expect(values.some((v) => v.includes(" ")), `${path}: ค่าที่เก็บต้องเป็นรหัสเปล่า`).toBe(
        false,
      );
      const i = values.indexOf("AA-TH003-WL");
      expect(labels[i], path).toContain("AA-TH003-WL");
      expect(labels[i].length, `${path}: ต้องมีชื่อต่อท้ายรหัส`).toBeGreaterThan(
        "AA-TH003-WL".length + 3,
      );
    }
  });

  it("ช่องบังคับที่แต่ละชนิดเห็น ไม่เกินเก้า และทุกช่องเป็นสิ่งที่ระบบเดาแทนไม่ได้", () => {
    /* สามชนิด และไม่มีชนิดไหนเกินเก้า — ชนิดแลกซื้อมีสองฝั่ง (เงื่อนไข + สิทธิ)
       จึงเป็นชนิดที่บังคับมากที่สุด พอดีเกณฑ์โดยไม่ต้องเดาค่าให้ใคร
       เพราะรูปแบบรายตัว/ชุด ไม่มีความหมายกับมันจึงไม่ถาม */
    for (const kind of ["free-goods", "price-discount", "redeem"]) {
      const req = requiredFor(kind);
      expect(req.length, `${kind}: ${req.join(" ")}`).toBeLessThanOrEqual(9);
    }

    /* และขั้นของสองชนิดไม่เคยบังคับพร้อมกัน — ถ้าวันหนึ่งบังคับพร้อมกัน
       คนกรอกจะถูกขอขั้นสองชุดสำหรับโปรใบเดียว */
    expect(requiredFor("free-goods")).toContain("tiers");
    expect(requiredFor("free-goods")).not.toContain("discountTiers");
    expect(requiredFor("price-discount")).toContain("discountTiers");
    expect(requiredFor("price-discount")).not.toContain("tiers");
    expect(requiredFor("redeem")).not.toContain("tiers");
    expect(requiredFor("redeem")).not.toContain("discountTiers");

    /* และแลกซื้อไม่ถูกขอรูปแบบรายตัว/ชุด ซึ่งไม่เกี่ยวกับมัน */
    expect(requiredFor("redeem")).not.toContain("scope");

    const req = PROMO_FORM.required.map((r) => r.path);
    /* ช่องที่ยังบังคับและห้ามมีค่าเริ่มต้น — ค่าคอมเป็นเงินของพนักงานขาย
       และไม่มีใครเห็นว่าเลือกผิดจนถึงรอบจ่ายเงิน */
    expect(req).toContain("commissionBase");
    /* เหตุผลไม่บังคับแล้ว — โปรที่บันทึกไม่ได้เพราะยังไม่รู้จะเลือกเหตุผลไหน
       คือโปรที่ไม่เข้ารายงานสรุปนั้นเลย เลือกทีหลังได้ */
    expect(req).not.toContain("reason");
    const reason = allFields().find((f) => f.path === "reason")!;
    expect(reason.required).toBeFalsy();
  });

  it("ค่าเริ่มต้นกว้างที่สุด — ไม่จำกัดใคร ไม่จำกัดจำนวน", () => {
    const b = PROMO_FORM.blank();
    expect(b.customerGroups).toEqual([]);
    expect(b.customers).toEqual([]);
    expect(b.areas).toEqual([]);
    expect(b.channels).toEqual([]);
    expect(b.usePerCustomer).toBe("");
    expect(b.useTotal).toBe("");
    expect(b.minOrder).toBe("");
  });

  it("เหตุผลเป็นตัวเลือกตายตัว ไม่ใช่ช่องพิมพ์อิสระ", () => {
    /* พิมพ์เองจะได้สี่สิบคำสำหรับเหตุผลเดียวกัน แล้วจัดกลุ่มเทียบผลไม่ได้ */
    const reason = allFields().find((f) => f.path === "reason")!;
    expect(reason.type).toBe("select");
    expect(reason.options).toBeTruthy();
  });

  it("มีคำตอบว่าไม่จ่ายค่าคอม และยังต้องเลือกเองอยู่", () => {
    /* "ไม่จ่าย" เป็นคำตอบ ไม่ใช่การไม่ตอบ — รวมไว้ในช่องเดียวกับฐาน เพราะสอง
       ช่องที่ต้องตรงกันเองคือสองช่องที่วันหนึ่งจะไม่ตรงกัน */
    const f = allFields().find((x) => x.path === "commissionBase")!;
    const values = (f.options ?? []).map((o) => (typeof o === "string" ? o : o.value));
    expect(values).toContain("ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้");
    expect(values).toHaveLength(3);
    expect(f.required).toBe(true);
    expect(PROMO_FORM.blank().commissionBase, "ยังห้ามมีค่าเริ่มต้น").toBe("");

    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(
      { ...filled(), name: "โปรไม่จ่ายค่าคอม", commissionBase: "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้" },
      ctx,
    );
    expect(PROMOTIONS.find((p) => p.name === "โปรไม่จ่ายค่าคอม")!.commissionBase).toBe(
      "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้",
    );
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
    /* กลุ่ม 4 */
    expect(row.usePerCustomer).toBe(2);
    expect(row.useTotal).toBe(50);
    expect(row.stackWithPromo).toBe(true);
    expect(row.stackWithCustomerDiscount).toBe(false);
    expect(row.commissionBase).toBe("ยอดที่ลูกค้าจ่ายจริง");
    /* และช่องที่ฟอร์มไม่ถามแล้ว ได้ค่าจากโดเมน ไม่ใช่ค่าว่างที่ฟอร์มยัดมา */
    expect(row.budget).toBeNull();
    expect(row.freeGoodsWarehouse).toBe("");
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
    expect(back.customerGroups).toEqual(["Dental Clinic"]);
    expect(back.areas).toEqual(["กรุงเทพและปริมณฑล"]);
    expect(back.channels).toEqual(["Direct"]);
    expect(back.usePerCustomer).toBe(2);
    expect(back.commissionBase).toBe("ยอดที่ลูกค้าจ่ายจริง");

    /* เซฟทับด้วย state ที่เพิ่งอ่านกลับมา แก้ชื่ออย่างเดียว
       ถ้ามีช่องไหนหายไปตอนอ่านกลับ ช่องนั้นจะถูกเขียนทับด้วยค่าว่างที่นี่ */
    PROMO_FORM.save({ ...back, name: "แก้ชื่อแล้ว" }, ctx);
    const again = getPromotion(row.code)!;
    expect(again.name).toBe("แก้ชื่อแล้ว");
    expect(again.items).toEqual(["AA-TH003-WL"]);
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

  it("พิมพ์รหัสเอง — รหัสนั้นลงระเบียน ไม่ใช่รหัสอัตโนมัติ", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save({ ...filled(), code: "pm-nyear-01", name: "โปรปีใหม่" }, ctx);

    const row = PROMOTIONS.find((p) => p.name === "โปรปีใหม่")!;
    /* ตัวใหญ่ทั้งหมด — รหัสที่ต่างกันแค่ตัวพิมพ์คือรหัสเดียวกันสำหรับคนอ่าน
       แต่เป็นคนละใบสำหรับ getPromotion */
    expect(row.code).toBe("PM-NYEAR-01");
    expect(getPromotion("PM-NYEAR-01")).toBeTruthy();
  });

  it("ว่างไว้ = ได้รหัสอัตโนมัติตามลำดับเดิม", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save({ ...filled(), code: "", name: "โปรไม่ระบุรหัส" }, ctx);
    expect(PROMOTIONS.find((p) => p.name === "โปรไม่ระบุรหัส")!.code).toMatch(/^PM-\d{4}$/);
  });

  it("พิมพ์รหัสที่มีอยู่แล้ว — ถูกปฏิเสธ ไม่ใช่ไปแก้ทับใบของคนอื่น", () => {
    /* ตั้งแต่มีช่องให้พิมพ์รหัสเอง ถ้า save ตัดสินสร้าง/แก้จาก "มีรหัสในฟอร์ม
       ไหม" คนที่พิมพ์รหัสซ้ำจะไปเขียนทับระเบียนของคนอื่นเงียบ ๆ */
    setCurrentUser(SALES_ADMIN);
    const victim = PROMOTIONS[0];
    const before = JSON.stringify(victim);
    const count = PROMOTIONS.length;
    const { ctx, toasts } = stubCtx();

    PROMO_FORM.save({ ...filled(), code: victim.code, name: "โปรรหัสซ้ำ" }, ctx);

    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].body).toContain("มีอยู่แล้ว");
    expect(PROMOTIONS).toHaveLength(count);
    expect(JSON.stringify(PROMOTIONS.find((p) => p.code === victim.code))).toBe(before);
  });

  it("แก้โปรเดิมแล้วรหัสไม่ขยับ แม้ state จะถือรหัสอื่นมา", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save({ ...filled(), code: "PM-KEEP-01", name: "โปรรหัสคงที่" }, ctx);
    const row = PROMOTIONS.find((p) => p.name === "โปรรหัสคงที่")!;

    /* ยัดรหัสใหม่เข้าไปตรง ๆ แบบที่หน้าจอค้างหรือคำสั่งที่ปลอมมาทำได้ */
    PROMO_FORM.save({ ...PROMO_FORM.toState!(row), code: "PM-KEEP-01", name: "แก้ชื่อ" }, ctx);
    expect(getPromotion("PM-KEEP-01")!.name).toBe("แก้ชื่อ");
    expect(PROMOTIONS.filter((p) => p.name === "แก้ชื่อ")).toHaveLength(1);
  });

  it("เพดานใหม่ เงื่อนไขจ่ายเงิน และรายการโปรที่ซ้อนได้ เดินถึงระเบียน", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    const other = PROMOTIONS[1].code;
    PROMO_FORM.save(
      {
        ...filled(),
        name: "โปรมีเพดานครบ",
        usePerArea: 5,
        freeQtyCap: 400,
        stackWithPromo: true,
        stackWithPromos: [other],
        paymentTerm: "มัดจำก่อนส่งของ",
        depositPct: 30,
      },
      ctx,
    );

    const row = PROMOTIONS.find((p) => p.name === "โปรมีเพดานครบ")!;
    expect(row.usePerArea).toBe(5);
    expect(row.freeQtyCap).toBe(400);
    expect(row.stackWithPromos).toEqual([other]);
    expect(row.paymentTerm).toBe("มัดจำก่อนส่งของ");
    expect(row.depositPct).toBe(30);

    /* เปิดกลับมาแก้แล้วค่ายังอยู่ */
    const back = PROMO_FORM.toState!(row);
    expect(back.usePerArea).toBe(5);
    expect(back.stackWithPromos).toEqual([other]);
    expect(back.depositPct).toBe(30);
  });

  it("เปลี่ยนเทอมจากมัดจำเป็นอย่างอื่น — % มัดจำไม่ค้างอยู่ในระเบียน", () => {
    /* เลขที่ค้างจากเทอมเก่าคือตัวเลขที่ไม่มีใครตั้งใจ และวันหนึ่งจะมีคนอ่าน
       มันเป็นเงื่อนไขจริง */
    setCurrentUser(SALES_ADMIN);
    const { ctx } = stubCtx();
    PROMO_FORM.save(
      { ...filled(), name: "โปรเปลี่ยนเทอม", paymentTerm: "จ่ายสดเท่านั้น", depositPct: 30 },
      ctx,
    );
    expect(PROMOTIONS.find((p) => p.name === "โปรเปลี่ยนเทอม")!.depositPct).toBeNull();
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

  it("ชนิดของโปรอยู่บนหัวหน้า แทนที่จะเป็นช่องอ่านอย่างเดียวกลางฟอร์ม", async () => {
    /* ฟอร์มเดียวรับสามชนิดและถามคนละชุด ถ้าไม่บอกไว้ตรงไหนเลย คนที่เปิดค้างไว้
       แล้วกลับมากรอกต่อจะไม่รู้ว่ากำลังตั้งโปรแบบไหน */
    setCurrentUser(SALES_ADMIN);
    render(<MasterForm schema={PROMO_FORM} />);
    expect(await screen.findByText("โปรแถมสินค้า")).toBeTruthy();

    /* และตามชนิดจริง ไม่ใช่ข้อความตายตัว */
    for (const [kind, text] of [
      ["price-discount", "โปรส่วนลดราคา"],
      ["redeem", "โปรสิทธิแลกซื้อ"],
    ]) {
      expect(PROMO_FORM.headerBadge!({ ...PROMO_FORM.blank(), kind })!.text).toBe(text);
    }
  });

  it("ติ๊กทุกเขตอยู่ก่อน — เอาออกแล้วรายการเขตทั้งหมดจึงโผล่มาให้เลือก", async () => {
    setCurrentUser(SALES_ADMIN);
    render(<MasterForm schema={PROMO_FORM} />);

    const all = screen.getByLabelText("ทุกเขต", { selector: "input" }) as HTMLInputElement;
    expect(all.checked, "เริ่มที่ทุกเขต ไม่ใช่ที่ว่างเปล่า").toBe(true);
    /* รายการเขตยังไม่ต้องโผล่ ตราบใดที่คำตอบคือทุกเขต */
    expect(screen.queryByLabelText(SALES_AREAS[0].name)).toBeNull();

    await userEvent.click(all);
    const one = screen.getByLabelText(SALES_AREAS[0].name) as HTMLInputElement;
    await userEvent.click(one);
    expect(one.checked).toBe(true);
    expect(all.checked, "เลือกบางเขตแล้ว ทุกเขตต้องหลุด").toBe(false);
    expect(screen.getByText(`เลือกไว้ 1 จาก ${SALES_AREAS.length}`)).toBeTruthy();
  });

  it("รูปแบบเป็นปุ่มบนหน้าจอจริง — กดแล้วติด และตอบได้ทีละคำตอบ", async () => {
    setCurrentUser(SALES_ADMIN);
    render(<MasterForm schema={PROMO_FORM} />);

    const one = screen.getByRole("button", { name: PROMOTION_SCOPE_TH.item });
    const set = screen.getByRole("button", { name: PROMOTION_SCOPE_TH.set });
    /* ทั้งสองแบบเห็นได้โดยไม่ต้องกดเปิดอะไรก่อน และยังไม่มีแบบไหนถูกเลือกให้ */
    expect(one.getAttribute("aria-pressed")).toBe("false");
    expect(set.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(one);
    expect(one.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(set);
    expect(set.getAttribute("aria-pressed")).toBe("true");
    expect(one.getAttribute("aria-pressed"), "เลือกได้ทีละแบบ").toBe("false");
  });

  it("เลือกหลายรายการทีเดียว — ที่ติ๊กเข้าตารางครบทุกตัว", async () => {
    /* ทริปไวร์ของการเขียนทีละแถว: ถ้าปุ่มนี้วนเรียก `gridAdd` ทีละตัว ทุกครั้ง
       จะอ่าน state ของ render เดิม แถวสุดท้ายทับแถวก่อนหน้าจนเหลือตัวเดียว */
    setCurrentUser(SALES_ADMIN);
    const [a, b] = optionValues("items");

    render(<MasterForm schema={PROMO_FORM} />);

    /* มีปุ่มนี้หลายตาราง (สินค้า · ของแถม · ลูกค้า) และชื่อ "สินค้าที่เข้าโปร"
       โผล่หลายที่ (หัวตาราง · รายการช่องที่ต้องกรอก) — เอาบล็อกที่มีทั้งชื่อนั้น
       และปุ่มนั้นอยู่ด้วยกัน แล้วยืนยันอีกชั้นด้วยชื่อของกล่องที่เปิดขึ้นมา */
    const block = screen
      .getAllByText("สินค้าที่เข้าโปร")
      .map((el) => el.closest("div"))
      .find((el): el is HTMLDivElement => Boolean(el && within(el).queryByText("เลือกหลายรายการ")))!;
    await userEvent.click(within(block).getByText("เลือกหลายรายการ"));

    const dialog = screen.getByRole("dialog", { name: "สินค้าที่เข้าโปร" });
    const boxes = within(dialog).getAllByRole("checkbox");
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);
    await userEvent.click(within(dialog).getByText("เพิ่ม 2 รายการ"));

    const picked = Array.from(document.querySelectorAll<HTMLSelectElement>("select")).map(
      (el) => el.value,
    );
    expect(picked).toContain(a);
    expect(picked).toContain(b);
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

  it("ตัวเลือกมีสามแบบ ไม่มีแบบกลุ่มให้เลือก", () => {
    const field = allFields({ ...PROMO_FORM.blank(), kind: "free-goods" }).find(
      (f) => f.path === "scope",
    )!;
    const values = (field.options as { value: string }[]).map((o) => o.value);
    /* เรียงจากแบบที่ตอบว่าลูกค้าได้อะไรแน่นอนที่สุด ไปหาแบบที่หลวมที่สุด */
    expect(values).toEqual(["item", "same-price", "set"]);
    expect(values).not.toContain("group");
  });

  it("แบบราคาเดียวกันถามกลุ่มของแถมด้วย — รายตัวไม่ถาม", () => {
    const same = { ...freeGoodsState(), scope: "same-price" };
    expect(paths(same)).toContain("freeItems");
    expect(paths({ ...freeGoodsState(), scope: "item" })).not.toContain("freeItems");
    /* และเพิ่มทีละหลายตัวได้เหมือนฝั่งที่นับ — กลุ่มราคาเดียวกันมีทั้งตระกูล */
    expect(allFields(same).find((f) => f.path === "freeItems")!.multiAdd).toBe(true);
  });

  it("กลุ่มสองราคาบันทึกไม่ได้ และบอกว่าราคาไหนบ้างตั้งแต่ตอนพิมพ์", () => {
    const TIPS = ["R-TI001-01", "R-TI002-01"];
    const ODD = "AA-TH003-WL";
    const ok = {
      ...freeGoodsState(),
      scope: "same-price",
      items: g(TIPS),
      freeItems: g(TIPS),
    };
    const bad = { ...ok, items: g([...TIPS, ODD]) };

    const rule = PROMO_FORM.rules!.find((r) =>
      String(r.label).includes("สินค้าที่เข้าโปรต้องราคาเท่ากัน"),
    )!;
    expect(rule.test(ok)).toBe(true);
    expect(rule.test(bad)).toBe(false);
    /* และไม่ไปบังคับแบบอื่นแทน — ชุดที่กำหนดไม่ได้สัญญาว่าราคาเท่ากัน */
    expect(rule.test({ ...bad, scope: "set" })).toBe(true);

    /* เตือนตั้งแต่ตอนพิมพ์ ด้วยข้อความที่บอกว่าตัวไหนราคาเท่าไหร่ */
    const notes = noteTexts(bad).join(" ");
    expect(notes).toContain(ODD);
    expect(notes).toContain("315");

    /* ฝั่งของแถมมีกฎของตัวเอง */
    const freeRule = PROMO_FORM.rules!.find((r) =>
      String(r.label).includes("ของแถมต้องราคาเท่ากัน"),
    )!;
    expect(freeRule.test(ok)).toBe(true);
    expect(freeRule.test({ ...ok, freeItems: g([...TIPS, ODD]) })).toBe(false);
  });

  it("แบบที่ให้ลูกค้าเลือกของแถม ต้องบอกว่าแถมอะไรได้ — ทั้งสองแบบ", () => {
    const rule = PROMO_FORM.rules!.find((r) =>
      String(r.label).includes("ต้องระบุว่าแถมอะไรได้บ้าง"),
    )!;
    for (const scope of ["set", "same-price"]) {
      expect(rule.test({ ...freeGoodsState(), scope }), scope).toBe(false);
      expect(
        rule.test({ ...freeGoodsState(), scope, freeItems: g(["D-AD004-01"]) }),
        scope,
      ).toBe(true);
    }
    /* รายตัวแถมตัวเดียวกัน จึงไม่ถูกขอ */
    expect(rule.test({ ...freeGoodsState(), scope: "item" })).toBe(true);
  });

  it("บันทึกโปรราคาเดียวกันได้จริง และค่าทั้งสองกลุ่มลงระเบียน", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx, toasts } = stubCtx();
    PROMO_FORM.save(
      {
        ...freeGoodsState(),
        name: "ปลายขูดหินปูน เลือกรุ่นไหนก็ได้",
        scope: "same-price",
        items: g(["R-TI001-01", "R-TI002-01"]),
        freeItems: g(["R-TI003-01", "R-TI004-01"]),
      },
      ctx,
    );

    expect(toasts[0]?.tone, toasts[0]?.body).not.toBe("danger");
    const row = PROMOTIONS.find((p) => p.name === "ปลายขูดหินปูน เลือกรุ่นไหนก็ได้")!;
    expect(row.scope).toBe("same-price");
    expect(row.items).toEqual(["R-TI001-01", "R-TI002-01"]);
    expect(row.freeItems).toEqual(["R-TI003-01", "R-TI004-01"]);
  });

  it("กลุ่มสองราคาถูกปฏิเสธที่ทางเขียน ไม่ใช่แค่กฎบนฟอร์ม", () => {
    /* กฎบนฟอร์มกันได้เฉพาะคนที่กดผ่านหน้าจอ — ด่านจริงต้องอยู่ที่โดเมน */
    setCurrentUser(SALES_ADMIN);
    const before = PROMOTIONS.length;
    const { ctx, toasts } = stubCtx();

    PROMO_FORM.save(
      {
        ...freeGoodsState(),
        name: "กลุ่มสองราคา",
        scope: "same-price",
        items: g(["R-TI001-01", "AA-TH003-WL"]),
        freeItems: g(["R-TI003-01"]),
      },
      ctx,
    );

    expect(PROMOTIONS).toHaveLength(before);
    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].body).toContain("ราคาเท่ากันทั้งกลุ่ม");
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

  /* ============================================================
     สินค้าหลายตัวคนละราคา — ฟอร์มต้องพูดตรงกับด่านที่ตัดสินระดับอนุมัติ

     ก่อนหน้านี้ฟอร์มคิดราคาเฉลี่ยเองจาก **สินค้าตัวแรกในตารางตัวเดียว**
     ส่วน `promotionFloorBreaches` วนทุกตัว ⇒ โปรที่มีสินค้าคนละราคาจะเห็น
     เขียวบนฟอร์ม แล้วโดนตีกลับตอนขออนุมัติ

     ตัวเลขทุกตัวข้างล่างอ้างราคากลางจริง และถูกยืนยันก่อนใช้ — ถ้าราคาต้นทาง
     เปลี่ยน ข้อนี้ต้องแดงให้เห็น ไม่ใช่เงียบแล้วทดสอบสิ่งที่ไม่มีความหมายอีกต่อไป
     ============================================================ */
  describe("สินค้าหลายตัวคนละราคา", () => {
    /** ราคาแพง GP ดี — 3 แถม 1 แล้วยังไม่หลุดขั้นต่ำ */
    const DEAR = "F-DC004-01";
    /** ราคาถูก GP บาง — 3 แถม 1 แล้วหลุดขั้นต่ำ */
    const CHEAP = "B-GE006-01";
    /** ตัวกลางที่ fixture เดิมใช้อยู่ */
    const MID = "D-AD001-01";
    const T31: LadderTier = { buy: 3, free: 1 };

    const withItems = (codes: string[], tiers: LadderTier[] = [T31]): FormState => ({
      ...freeGoodsState(),
      items: g(codes),
      tiers: tiers as unknown as GridRow[],
    });

    const asRow = (codes: string[], tiers: LadderTier[] = [T31]): PromotionRow => ({
      ...blankPromotion(),
      kind: "free-goods",
      items: codes,
      tiers,
    });

    it("ราคากลางที่เทสต์ชุดนี้ยืนอยู่บน", () => {
      expect(catalogPrice(DEAR)).toBe(349_000);
      expect(productFloor(DEAR)).toBe(201_000);
      expect(catalogPrice(CHEAP)).toBe(80);
      expect(productFloor(CHEAP)).toBe(70);
      /* 349,000 × 3 ÷ 4 = 261,750 ผ่าน · 80 × 3 ÷ 4 = 60 หลุด 70 */
    });

    it("ช่องเฉลี่ยแสดงตัวที่แย่ที่สุด ไม่ใช่ตัวแรกในตาราง", () => {
      const cell = computed(withItems([DEAR, CHEAP]), "tiers", "avg", T31);

      expect(cell.value).toContain("60.00");
      expect(cell.cls, "ต้องขึ้นสีเตือน").toContain("text-danger");
      expect(cell.value, "บอกด้วยว่ายังมีตัวอื่น").toContain("อีก 1 ตัว");

      /* ทริปไวร์ — ถ้าใครเอา items[0] กลับมาเป็นตัวแทน ช่องนี้จะกลายเป็น
         261,750.00 และไม่มีสีเตือน ซึ่งคือสภาพก่อนแก้ */
      expect(cell.value, "ห้ามกลับไปคิดจากสินค้าตัวแรกตัวเดียว").not.toContain("261,750");
    });

    it("กล่องเตือนบนฟอร์มบอกเรื่องเดียวกับที่ด่านอนุมัติตอบ", () => {
      const breaches = promotionFloorBreaches(asRow([DEAR, CHEAP]));
      expect(breaches).toHaveLength(1);
      expect(breaches[0].code).toBe(CHEAP);

      const notes = noteTexts(withItems([DEAR, CHEAP])).join(" ");
      expect(notes).toContain("ต่ำกว่าราคาขั้นต่ำ");
      expect(notes, "บอกว่าตัวไหน").toContain(CHEAP);
      expect(notes).toContain("60.00");
      /* ตัวที่ไม่หลุดไม่ถูกฟ้อง */
      expect(notes).not.toContain("261,750");
    });

    it("สลับลำดับแถวสินค้า ผลไม่เปลี่ยน — เลขเป็นของโปร ไม่ใช่ของแถวแรก", () => {
      const a = withItems([DEAR, CHEAP]);
      const b = withItems([CHEAP, DEAR]);
      expect(computed(a, "tiers", "avg", T31).value).toBe(computed(b, "tiers", "avg", T31).value);
      expect(computed(a, "tiers", "avg", T31).cls).toBe(computed(b, "tiers", "avg", T31).cls);
      expect(noteTexts(a).join(" ")).toBe(noteTexts(b).join(" "));
    });

    it("ฟอร์มกับด่านอนุมัติตอบตรงกันทุกคู่และทุกขั้น ไม่ใช่ถูกเฉพาะเคสเดียว", () => {
      const CASES = [[DEAR], [CHEAP], [MID], [DEAR, CHEAP], [CHEAP, DEAR], [MID, CHEAP], [DEAR, MID]];
      const TIERS: LadderTier[] = [
        { buy: 3, free: 1 },
        { buy: 3, free: 5 },
        { buy: 10, free: 4 },
        { buy: 5, free: 1 },
        { buy: 12, free: 5 },
      ];

      let red = 0;
      let green = 0;
      for (const codes of CASES) {
        for (const tier of TIERS) {
          const tag = codes.join("+") + " @ " + tier.buy + "/" + tier.free;
          const st = withItems(codes, [tier]);
          const domainSaysBreach = promotionFloorBreaches(asRow(codes, [tier])).length > 0;
          const cell = computed(st, "tiers", "avg", tier as unknown as GridRow);

          expect(cell.cls.includes("text-danger"), "สี: " + tag).toBe(domainSaysBreach);
          expect(
            noteTexts(st).join(" ").includes("ต่ำกว่าราคาขั้นต่ำ"),
            "กล่องเตือน: " + tag,
          ).toBe(domainSaysBreach);

          /* และเลขในช่องคือค่าเฉลี่ยของตัวที่แย่ที่สุดจริง ไม่ใช่ตัวใดตัวหนึ่ง */
          const worst = worstTierAverage(
            { scope: "item", items: codes, freeItems: [], tiers: [tier] },
            tier,
          )!;
          expect(cell.value, "เลข: " + tag).toContain(money(worst.average));

          if (domainSaysBreach) red++;
          else green++;
        }
      }

      /* เมทริกซ์ต้องมีทั้งสองฝั่ง ไม่งั้นข้อนี้ผ่านเพราะไม่มีอะไรให้ผิด */
      expect(red, "ต้องมีเคสที่หลุดขั้นต่ำ").toBeGreaterThan(0);
      expect(green, "ต้องมีเคสที่ผ่าน").toBeGreaterThan(0);
    });

    it("แบบชุด — ของแถมแพงขึ้นสีเตือน และบอกว่าเป็นฝั่งของแถม", () => {
      /* ของแถมถูกลงบรรทัดด้วยราคาเฉลี่ยเดียวกับของที่ซื้อ (§4.2 ไม่ตั้งราคา 0)
         ⇒ 650 × 10 ÷ 14 = 464.29 ต่ำกว่าขั้นต่ำ 201,000 ของ F-DC004-01 */
      const T104 = { buy: 10, free: 4 };
      const st: FormState = {
        ...freeGoodsState(),
        scope: "set",
        items: g(["D-AD001-01"]),
        freeItems: g([DEAR]),
        tiers: [T104] as unknown as GridRow[],
      };

      const cell = computed(st, "tiers", "avg", T104 as unknown as GridRow);
      expect(cell.value).toContain("464.29");
      expect(cell.cls).toContain("text-danger");

      const notes = noteTexts(st).join(" ");
      expect(notes).toContain(DEAR);
      expect(notes, "ต้องบอกว่าตัวที่หลุดคือของแถม").toContain("(ของแถม)");
      expect(notes).toContain("ต่ำกว่าราคาขั้นต่ำ");

      /* ของแถมถูกในโปรใบเดียวกันต้องไม่ขึ้นเตือน */
      const okay = { ...st, freeItems: g([CHEAP]) };
      expect(computed(okay, "tiers", "avg", T104 as unknown as GridRow).cls).toBe("");
      expect(noteTexts(okay).join(" ")).not.toContain("ต่ำกว่าราคาขั้นต่ำ");
    });

    it("แบบชุดที่ยังไม่ระบุของแถม — บอกว่าตรวจไม่ครบ ไม่ใช่เงียบเหมือนผ่าน", () => {
      const st: FormState = {
        ...freeGoodsState(),
        scope: "set",
        items: g(["D-AD001-01"]),
        freeItems: [],
      };
      const notes = noteTexts(st).join(" ");
      expect(notes).toContain("ยังไม่ได้ระบุของแถม");
      expect(notes).toContain("ยังตรวจไม่ครบ");

      /* ระบุแล้วคำเตือนนั้นหายไป */
      expect(
        noteTexts({ ...st, freeItems: g([CHEAP]) }).join(" "),
      ).not.toContain("ยังไม่ได้ระบุของแถม");

      /* และแบบรายตัวไม่เคยขึ้นคำเตือนนี้ เพราะแถมตัวเดียวกับที่ซื้อ */
      expect(noteTexts(freeGoodsState()).join(" ")).not.toContain("ยังไม่ได้ระบุของแถม");
    });

    it("สินค้าตัวเดียวยังอ่านเหมือนเดิม ไม่มี 'อีก N ตัว' มาเกะกะ", () => {
      const cell = computed(withItems([MID]), "tiers", "avg", T31);
      expect(cell.value).toBe("487.50");
      expect(cell.cls).toBe("");
    });
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

/* ============================================================
   RD3 — ฟอร์มโปรสิทธิแลกซื้อ

   ชนิดที่สามบนฟอร์มเดียวกัน ความต่างอยู่ใน `when` ทั้งหมด
   ============================================================ */

const redeemState = (): FormState => ({
  ...PROMO_FORM.blank(),
  kind: "redeem",
  name: "ซื้อครบ 50,000 แลกซื้อ 3 ชิ้น",
  from: "2026-10-01",
  reason: "รักษาลูกค้ารายใหญ่",
  items: g(["D-AD001-01"]),
  commissionBase: "ยอดที่ลูกค้าจ่ายจริง",
  redeemBasis: "amount",
  redeemThreshold: 50_000,
  redeemItems: g(["H-AD001-01"]),
  redeemDiscPct: 30,
  redeemPerRound: 3,
});

describe("ฟอร์มโปรสิทธิแลกซื้อ", () => {
  it("ช่องของชนิดนี้โผล่เฉพาะชนิดนี้ และไม่ปนกับสองชนิดแรก", () => {
    const r = paths({ ...PROMO_FORM.blank(), kind: "redeem" });
    for (const k of ["redeemBasis", "redeemThreshold", "redeemPerRound", "redeemDiscPct", "redeemItems"]) {
      expect(r, k).toContain(k);
    }
    expect(r).not.toContain("tiers");
    expect(r).not.toContain("discountTiers");
    expect(r).not.toContain("freeItems");

    /* และช่องแลกซื้อไม่ไปโผล่ในสองชนิดแรก */
    for (const kind of ["free-goods", "price-discount"]) {
      expect(paths({ ...PROMO_FORM.blank(), kind }), kind).not.toContain("redeemBasis");
    }
  });

  it("ไม่ถามรูปแบบรายตัว/ชุด และไม่ถามคลังของแถม", () => {
    /* ทั้งคู่ไม่มีความหมายกับแลกซื้อ — รูปแบบเป็นขอบเขตการนับของแถม
       และแลกซื้อเป็นการขาย ไม่ได้หักของแถมจากคลังไหน */
    const r = paths({ ...PROMO_FORM.blank(), kind: "redeem" });
    expect(r).not.toContain("scope");
    expect(r).not.toContain("freeGoodsWarehouse");
  });

  it("ยอดสั่งซื้อขั้นต่ำถูกซ่อน เพราะซ้ำความหมายกับยอดต่อรอบสิทธิ", () => {
    /* สองช่องที่ดูเหมือนกันในหน้าเดียวคือที่มาของโปรที่ตั้งผิดโดยไม่มีใครรู้
       — minOrder เป็นเกณฑ์ผ่าน/ไม่ผ่านครั้งเดียว ยอดต่อรอบเป็นตัวหารทวีคูณ */
    expect(paths({ ...PROMO_FORM.blank(), kind: "redeem" })).not.toContain("minOrder");
    expect(paths({ ...PROMO_FORM.blank(), kind: "redeem", minOrder: 5000 })).not.toContain(
      "minOrderBasis",
    );
    /* แต่ยังถามในชนิดอื่นตามปกติ */
    expect(paths({ ...PROMO_FORM.blank(), kind: "free-goods" })).toContain("minOrder");
  });

  it("ยังไม่ได้เลือกว่านับจากอะไร — ค่าว่างจริง ไม่มีค่าเริ่มต้น", () => {
    const b = PROMO_FORM.blank();
    expect(b.redeemBasis).toBe("");
    expect(b.redeemThreshold).toBe("");
    expect(b.redeemPerRound).toBe("");
  });

  it("ป้ายของช่องยอดเปลี่ยนตามว่านับเงินหรือนับชิ้น", () => {
    /* "ครบกี่บาท" กับ "ครบกี่ชิ้น" คือคำถามคนละข้อ ป้ายเดียวสำหรับทั้งสองแบบ
       ทำให้คนกรอกใส่จำนวนชิ้นในช่องที่ระบบอ่านเป็นบาท */
    const label = (basis: string) =>
      String(
        allFields({ ...redeemState(), redeemBasis: basis }).find((f) => f.path === "redeemThreshold")!
          .label,
      );
    expect(label("amount")).toContain("บาท");
    expect(label("qty")).toContain("ชิ้น");
  });

  it("บังคับสี่ช่องของชนิดนี้ รวมเพดานชิ้นต่อรอบ", () => {
    const req = PROMO_FORM.required;
    const at = (path: string) => req.find((r) => r.path === path)!;
    const blank = { ...PROMO_FORM.blank(), kind: "redeem" };

    for (const path of ["redeemBasis", "redeemThreshold", "redeemPerRound", "redeemItems"]) {
      expect(at(path).test!(blank), `${path} ต้องบังคับ`).toBe(false);
      expect(at(path).test!(redeemState()), `${path} กรอกแล้วต้องผ่าน`).toBe(true);
      /* และไม่ไปบังคับชนิดอื่น */
      expect(at(path).test!({ ...PROMO_FORM.blank(), kind: "free-goods" }), path).toBe(true);
    }

    /* เพดานชิ้นต่อรอบเป็นช่องบังคับ ไม่ใช่ rule — ค่าว่างที่แปลว่าหนึ่งชิ้น
       คือการเดาแทนคนตั้งโปร และต่างกับ 3 ชิ้นคือเงินที่บริษัทจ่ายทุกใบ */
    expect(req.map((r) => r.path)).toContain("redeemPerRound");
  });

  it("ส่วนลดเป็นกฎ ไม่ใช่ช่องบังคับ — สิทธิที่ไม่มีส่วนลดคือการซื้อราคาปกติ", () => {
    const rule = PROMO_FORM.rules!.find((r) => String(r.label).includes("ต้องมีส่วนลด"))!;
    expect(rule.test({ ...redeemState(), redeemDiscPct: "" })).toBe(false);
    expect(rule.test(redeemState())).toBe(true);
    expect(rule.test({ ...PROMO_FORM.blank(), kind: "free-goods" })).toBe(true);
  });

  it("สินค้าที่แลกซื้อได้ต้องไม่ใช่ตัวเดียวกับที่นับเข้าเงื่อนไข", () => {
    /* ถ้าเป็นตัวเดียวกัน ลูกค้าซื้อตัวนั้นเพิ่มให้ครบเงื่อนไข แล้วเอาสิทธิไปซื้อ
       ตัวเดิมในราคาลด ซึ่งเป็นวงที่กฎ "แลกซื้อไม่นับเข้ายอด" มีไว้กัน และกฎนั้น
       ยังไม่ได้ทำ (PM-3) จึงต้องกันที่การตั้งโปรก่อน */
    const rule = PROMO_FORM.rules!.find((r) => String(r.label).includes("ตัวเดียวกับสินค้าที่นับ"))!;
    expect(rule.test(redeemState())).toBe(true);
    expect(rule.test({ ...redeemState(), redeemItems: g(["D-AD001-01"]) })).toBe(false);
  });

  it("ข้อความบอกว่าสิทธิใช้ได้เฉพาะในใบเดียวกัน อยู่บนฟอร์มจริง", () => {
    const notes = noteTexts(redeemState()).join(" ");
    expect(notes).toContain("ใบเดียวกัน");
    expect(notes).toContain("หายไป");
    /* และไม่ไปขึ้นกับชนิดอื่นที่ไม่มีสิทธิ */
    expect(noteTexts({ ...PROMO_FORM.blank(), kind: "free-goods" }).join(" ")).not.toContain(
      "ใบเดียวกัน",
    );
  });

  it("ตารางตัวอย่างบนฟอร์มมาจากตัวคำนวณ และเห็นกฎเศษทิ้ง", () => {
    const notes = noteTexts(redeemState()).join(" ");
    /* 49,999 → 0 รอบ · 50,000 → 1 รอบ 3 ชิ้น · 100,000 → 2 รอบ 6 ชิ้น
       · 120,000 → 2 รอบ เศษ 20,000 ทิ้ง */
    expect(notes).toContain("49,999");
    expect(notes).toContain("1 รอบ · 3 ชิ้น");
    expect(notes).toContain("2 รอบ · 6 ชิ้น");
    expect(notes).toContain("เศษ 20,000 บาท ทิ้ง");
  });

  it("นับจากชิ้น — ตารางตัวอย่างเปลี่ยนหน่วยตาม", () => {
    const notes = noteTexts({
      ...redeemState(),
      redeemBasis: "qty",
      redeemThreshold: 20,
      redeemPerRound: 1,
    }).join(" ");
    expect(notes).toContain("20 ชิ้น → 1 รอบ · 1 ชิ้น");
    expect(notes).not.toContain("บาท ทิ้ง");
  });

  it("ยังไม่กรอกเกณฑ์ — ไม่มีตารางตัวอย่างปลอม", () => {
    const notes = noteTexts({ ...PROMO_FORM.blank(), kind: "redeem" }).join(" ");
    expect(notes).not.toContain("รอบ ·");
  });

  it("เตือนเมื่อราคาแลกซื้อหลุดราคาขั้นต่ำ — ตอนพิมพ์ ไม่ต้องบันทึก", () => {
    /* H-AD001-01 ราคามาตรฐาน 1,750 ขั้นต่ำ 880 — ลด 55% = 787.50 */
    const notes = noteTexts({ ...redeemState(), redeemDiscPct: 55 }).join(" ");
    expect(notes).toContain("ต่ำกว่าราคาขั้นต่ำ");
    expect(notes).toContain("787.50");

    /* ลด 30% = 1,225 ยังสูงกว่าขั้นต่ำ ไม่ต้องเตือน */
    expect(noteTexts(redeemState()).join(" ")).not.toContain("ต่ำกว่าราคาขั้นต่ำ");
  });

  it("บันทึกแล้วค่าอยู่ครบ และเปิดกลับมาแก้ยังอยู่", () => {
    setCurrentUser(SALES_ADMIN);
    const { ctx, toasts } = stubCtx();
    PROMO_FORM.save(redeemState(), ctx);

    expect(toasts[0]?.tone, toasts[0]?.body).not.toBe("danger");
    const row = PROMOTIONS.find((p) => p.name === "ซื้อครบ 50,000 แลกซื้อ 3 ชิ้น")!;
    expect(row.kind).toBe("redeem");
    expect(row.redeemBasis).toBe("amount");
    expect(row.redeemThreshold).toBe(50_000);
    expect(row.redeemItems).toEqual(["H-AD001-01"]);
    expect(row.redeemDiscPct).toBe(30);
    expect(row.redeemPerRound).toBe(3);
    /* ฝั่งเงื่อนไขไม่ถูกปนกับฝั่งสิทธิ และของสองชนิดแรกไม่ถูกเขียนอะไรใส่ */
    expect(row.items).toEqual(["D-AD001-01"]);
    expect(row.tiers).toEqual([]);
    expect(row.discountTiers).toEqual([]);

    /* รอบสอง — เปิดหน้าแก้ */
    const back = PROMO_FORM.toState!(row);
    expect(back.redeemBasis).toBe("amount");
    expect(back.redeemThreshold).toBe(50_000);
    expect(back.redeemItems).toEqual([{ code: "H-AD001-01" }]);
    expect(back.redeemDiscPct).toBe(30);
    expect(back.redeemPerRound).toBe(3);

    /* แล้วเซฟทับ ค่าต้องไม่หาย */
    PROMO_FORM.save({ ...back, name: "แก้ชื่อโปรแลกซื้อ" }, ctx);
    const again = getPromotion(row.code)!;
    expect(again.redeemThreshold).toBe(50_000);
    expect(again.redeemPerRound).toBe(3);
    expect(again.redeemItems).toEqual(["H-AD001-01"]);
    expect(again.redeemBasis).toBe("amount");
  });

  it("แก้โปรแลกซื้อเดิมโดยไม่แตะช่องสิทธิ — ค่ายังอยู่ครบ", () => {
    /* แบบเดียวกับที่ปักไว้ให้ขั้นบันไดใน PR3b — ฟิลด์ที่เพิ่งต่อสายเข้า
       `toPatch` เขียนทับได้ ถ้า `toState` ลืมแมปช่องใดช่องหนึ่ง */
    setCurrentUser(SALES_ADMIN);
    const seeded = getPromotion("PM-0009")!;
    expect(seeded.redeemThreshold).toBe(50_000);
    /* โปรที่รออนุมัติแก้ไม่ได้ตามด่านเดิม — ถอนคำขอก่อนเหมือนคนจริง */
    expect(seeded.status).toBe("Pending Approval");
    seeded.status = "Draft";
    const was = {
      basis: seeded.redeemBasis,
      threshold: seeded.redeemThreshold,
      items: [...seeded.redeemItems],
      pct: seeded.redeemDiscPct,
      per: seeded.redeemPerRound,
    };

    const { ctx, toasts } = stubCtx();
    PROMO_FORM.save({ ...PROMO_FORM.toState!(seeded), printName: "ชื่อใหม่บนเอกสาร" }, ctx);

    expect(toasts[0]?.tone, toasts[0]?.body).not.toBe("danger");
    const after = getPromotion("PM-0009")!;
    expect(after.printName).toBe("ชื่อใหม่บนเอกสาร");
    expect(after.redeemBasis).toBe(was.basis);
    expect(after.redeemThreshold).toBe(was.threshold);
    expect(after.redeemItems).toEqual(was.items);
    expect(after.redeemDiscPct).toBe(was.pct);
    expect(after.redeemPerRound).toBe(was.per);
  });
});
