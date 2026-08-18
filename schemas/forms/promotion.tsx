import {
  COMMISSION_BASES,
  DEPOSIT_TERM,
  OPEN_PROMOTION_SCOPES,
  PAYMENT_TERMS,
  PROMOTION_REASONS,
  PROMOTION_SCOPE_TH,
  PROMOTIONS,
  PROMOTION_KINDS,
  applyPromotionPatch,
  ladderFloorBreaches,
  worstTierAverage,
  createPromotion,
  getPromotion,
  nextPromotionCode,
  priceClusters,
  priceClusterText,
  type ItemTierAverage,
  type PromotionRow,
} from "@/lib/domain/promotion";
import {
  REDEEM_BASIS_TH,
  redeemPreview,
  type RedeemBasis,
} from "@/lib/domain/promotion-redeem";
import {
  DISCOUNT_MODE_TH,
  discountFloorBreaches,
  discountIneffectiveTiers,
  type DiscountMode,
  type DiscountTier,
} from "@/lib/domain/promotion-discount";
import { TIER_TH } from "@/lib/domain/price-tier";
import { catalogPrice } from "@/lib/domain/pricing";
import { QT_PRICE_LISTS } from "@/data/quotations";
import { SR_CHANNELS } from "@/data/sales-requests";
import { SALES_AREAS } from "@/data/sales-areas";
import { SR_CUST_GROUPS } from "@/data/sales-reps";
import { PRODUCTS } from "@/lib/domain/product";
import { BUSINESS_PARTNERS, isCustomerRole } from "@/lib/domain/partner";
import { DASH, fmt, isoToDmy, dmyToIso, money } from "@/lib/format";
import type { LadderTier } from "@/lib/domain/promotion-ladder";
import type {
  FormBlock,
  FormSchema,
  FormState,
  GridRow,
  SelectOption,
} from "@/lib/types";
import { isCreate, opts, saved } from "./common";

/* ============================================================
   ฟอร์มโปรโมชั่น — §6b ห้ากลุ่ม

   §6b บอกว่ามีห้ากลุ่มอะไรบ้าง ไม่ได้บอกว่าต้องเรียงยังไง ลำดับบนหน้าจอ
   จึงเรียงตามงานของคนกรอก: กลุ่มที่ตอบได้จากตัวแคมเปญเอง (ข้อมูลโปรโมชั่น ·
   กลุ่มลูกค้าที่ใช้งาน · เงื่อนไขการใช้งาน) ขึ้นก่อน แล้วปิดท้ายด้วยตารางสินค้า
   และของแถม ซึ่งเป็นงานที่ยาวที่สุดของฟอร์ม — เลือกสินค้า แล้วตั้งขั้นบันได

   วางงานยาวไว้กลางทาง คำถามสั้นที่เหลือจะถูกอ่านตอนคนกรอกล้าไปแล้ว

   ฟอร์มนี้ไม่มีกฎอยู่ในตัวเอง — ทุกการเขียนไปที่ `createPromotion`
   (สร้าง) และ `applyPromotionPatch` (แก้) ซึ่งเป็นที่ที่ด่านสิทธิ์
   กับธง `dirtySinceApproval` อยู่ ถ้าฟอร์มเขียนแถวเอง ด่านทั้งสี่
   จะกลายเป็นการซ่อนปุ่ม — บทเรียนเดียวกับ pickComplete ใน BACKLOG

   ช่องบังคับ 8 ช่อง และสามช่องในนั้นห้ามมีค่าเริ่มต้น: เหตุผลที่สร้างโปร
   คลังที่หักของแถม และฐานคิดค่าคอม สามอย่างนี้ถ้าเดาให้ ทุกโปรจะได้
   ค่าที่ไม่มีใครเลือก แล้วรายงานจะสรุปจากค่าที่ระบบเดา
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isDiscount = (st: FormState) => String(st.kind ?? "") === "price-discount";

const isFreeGoods = (st: FormState) => String(st.kind ?? "free-goods") === "free-goods";

const isRedeem = (st: FormState) => String(st.kind ?? "") === "redeem";

/** ตัวเลขที่ยังไม่กรอก = null ไม่ใช่ 0 — 0 เป็นค่าที่มีความหมายคนละอย่าง */
const numOrNull = (v: unknown): number | null =>
  String(v ?? "").trim() === "" ? null : Number(v) || 0;

const scopeOf = (st: FormState) => String(st.scope ?? "");

/** แบบที่ลูกค้าเลือกของแถมเองจากกลุ่มที่ระบุ — สองแบบนี้ถามช่องเดียวกัน */
const picksFreeItems = (st: FormState) =>
  scopeOf(st) === "set" || scopeOf(st) === "same-price";

/** แบบราคาเดียวกัน — ทั้งกลุ่มที่นับและกลุ่มที่แถมต้องราคาเท่ากันในกลุ่มตัวเอง */
const isSamePriceScope = (st: FormState) => scopeOf(st) === "same-price";

/** รหัสในกริดหนึ่ง — ใช้ตรวจราคาของกลุ่มนั้น */
const codesIn = (st: FormState, path: string): string[] =>
  ((st[path] ?? []) as GridRow[]).map((r) => String(r.code ?? "").trim()).filter(Boolean);

/** ขั้นของแถมจากกริด — แถวที่ยังไม่กรอกจำนวนซื้อถูกทิ้ง ไม่ใช่นับเป็นขั้น 0 */
const ladderTiersOf = (st: FormState): LadderTier[] =>
  ((st.tiers ?? []) as GridRow[])
    .filter((r) => num(r.buy) > 0)
    .map((r) => ({ buy: num(r.buy), free: num(r.free) }));

const discountMode = (st: FormState): DiscountMode =>
  String(st.discountMode ?? "price") === "percent" ? "percent" : "price";

/** ขั้นส่วนลดจากกริด — แถวที่ยังไม่กรอกจำนวนถูกทิ้ง ไม่ใช่นับเป็นขั้น 0 */
const discountTiersOf = (st: FormState): DiscountTier[] =>
  ((st.discountTiers ?? []) as GridRow[])
    .filter((r) => num(r.minQty) > 0)
    .map((r) => ({
      minQty: num(r.minQty),
      price: String(r.price ?? "").trim() === "" ? null : num(r.price),
      discPct: String(r.discPct ?? "").trim() === "" ? null : num(r.discPct),
    }));

const itemCodes = (st: FormState): string[] =>
  ((st.items ?? []) as GridRow[]).map((r) => String(r.code ?? "").trim()).filter(Boolean);
const nullNum = (v: unknown) => (String(v ?? "").trim() === "" ? null : Number(v) || 0);

/** สินค้าที่ติดตามล็อตและมีวันหมดอายุ — เงื่อนไขล็อตใกล้หมดอายุใช้ได้เฉพาะพวกนี้ */
const lotTracked = (code: string): boolean => {
  const p = PRODUCTS.find((x) => x.code === code);
  return Boolean(p?.detail?.lotTracked) && Boolean(p?.expiry && p.expiry !== "—");
};

/** รายการที่เลือกไว้แต่ติดตามล็อตไม่ได้ — คืนรหัส เพื่อเอาไปบอกว่าตัวไหน */
export const itemsWithoutLotTracking = (items: unknown): string[] =>
  ((items ?? []) as GridRow[])
    .map((r) => String(r.code ?? "").trim())
    .filter(Boolean)
    .filter((code) => !lotTracked(code));

/**
 * สินค้าที่เลือกได้ — เก็บรหัส แสดงรหัสกับชื่อ
 *
 * ค่าที่เก็บต้องเป็นรหัสเปล่า เพราะทุกตัวคำนวณในระบบค้นด้วยรหัส (`catalogPrice`
 * · `productFloor` · `lotTracked`) แต่ "H-CS006-08" ตัวเดียวไม่ได้บอกใครว่า
 * นั่นคืออะไร คนเลือกสินค้าผิดตัวจากรายการที่มีแต่รหัสคือความผิดพลาดที่ไม่มี
 * ใครเห็นจนกว่าของจะถูกส่ง
 */
const productOptions = (): SelectOption[] =>
  PRODUCTS.filter((p) => p.status === "Active").map((p) => ({
    value: p.code,
    label: `${p.code} — ${p.name}`,
  }));
const areaOptions = () => SALES_AREAS.map((a) => a.name);

/**
 * ลูกค้าที่เจาะจงได้ — เก็บรหัส แสดงรหัสกับชื่อ แบบเดียวกับสินค้า
 *
 * เคยเป็นช่องพิมพ์รหัสเปล่า ซึ่งแปลว่าพิมพ์ BP000112 แทน BP000121 แล้วโปรจะไป
 * ตกกับลูกค้าคนอื่นโดยที่ฟอร์มไม่มีทางรู้ — และคนกรอกต้องเปิดหน้า Business
 * Partner อีกจอเพื่อหารหัสก่อนทุกครั้ง
 *
 * ตัวแทนจำหน่ายนับเป็นลูกค้าด้วย ตาม `isCustomerRole` ที่ทั้งระบบใช้ร่วมกัน
 */
const customerOptions = (): SelectOption[] =>
  BUSINESS_PARTNERS.filter((bp) => bp.status === "Active" && isCustomerRole(bp)).map((bp) => ({
    value: bp.code,
    label: `${bp.code} — ${bp.nameTh || bp.nameEn || bp.trade}`,
  }));

/** โปรตัวอื่นในทะเบียน — ตัวเองไม่อยู่ในรายการ เพราะซ้อนกับตัวเองไม่ใช่คำถาม */
const otherPromotionOptions = (st: FormState): SelectOption[] =>
  PROMOTIONS.filter((p) => p.code !== String(st.code ?? "").trim()).map((p) => ({
    value: p.code,
    label: `${p.code} — ${p.name}`,
  }));

/** ค่าจากฟอร์ม → patch ที่โดเมนรับ ที่เดียว ใช้ทั้งตอนสร้างและตอนแก้ */
function toPatch(s: FormState): Partial<PromotionRow> {
  const list = (path: string) =>
    ((s[path] ?? []) as GridRow[]).map((r) => String(r.code ?? "").trim()).filter(Boolean);

  /* ช่องแบบ `picks` ถือรายการข้อความตรง ๆ ไม่ใช่แถวของกริด — ค่าที่ไม่ใช่
     ข้อความคือของค้างจากรูปเดิมของช่องนี้ (ร่างที่กู้กลับมา) ทิ้งไปดีกว่า
     เขียนกลับลงระเบียน */
  const picked = (path: string) =>
    ((s[path] ?? []) as unknown[])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);

  /* ประเภทมาจากหน้าเลือกประเภทเป็น `?kind=` ซึ่ง route แปลงเป็น seed ให้แล้ว
     ถ้าไม่ส่งต่อ ทุกโปรจะกลายเป็น "แถมสินค้า" เพราะนั่นคือค่าเริ่มต้นของ
     `blankPromotion()` — ค่าที่ผู้ใช้เลือกจะหายเงียบ ๆ */
  const seededKind = String(s.kind ?? "");
  const kind = PROMOTION_KINDS.some((k) => k.key === seededKind)
    ? (seededKind as PromotionRow["kind"])
    : "free-goods";

  return {
    /* ตอนสร้าง: รหัสที่พิมพ์เอง ว่างไว้ = ให้ `createPromotion` ออกให้
       ตอนแก้: `applyPromotionPatch` ตัดทิ้งเสมอ รหัสไม่เคยเปลี่ยนหลังสร้าง */
    code: String(s.code ?? "").trim(),
    kind,
    name: String(s.name ?? "").trim(),
    printName: String(s.printName ?? "").trim(),
    from: isoToDmy(s.from),
    to: isoToDmy(s.to),
    /* ลำดับความสำคัญกับเจ้าของโปรไม่อยู่ใน patch เลย ไม่ใช่ส่งค่าว่างมา —
       `applyPromotionPatch` เขียนด้วย Object.assign ช่องที่ไม่ได้ส่งจึงคงค่าเดิม
       ของแถวที่มีอยู่ ส่วนแถวใหม่ได้ค่าจาก `blankPromotion()` ถ้าส่ง "" หรือ 0
       มาแทน การแก้ชื่อโปรเก่าหนึ่งครั้งจะล้างสองช่องนั้นทิ้งโดยไม่มีใครสั่ง */
    reason: String(s.reason ?? ""),
    reasonNote: String(s.reasonNote ?? ""),

    scope: (String(s.scope ?? "item") as PromotionRow["scope"]),
    freeItems: list("freeItems"),
    freeGroup: String(s.freeGroup ?? ""),
    tiers: ladderTiersOf(s),
    discountTiers: discountTiersOf(s),
    discountMode: discountMode(s),
    redeemBasis: (String(s.redeemBasis ?? "") as PromotionRow["redeemBasis"]),
    redeemThreshold: numOrNull(s.redeemThreshold),
    redeemItems: list("redeemItems"),
    redeemDiscPct: numOrNull(s.redeemDiscPct),
    redeemPerRound: numOrNull(s.redeemPerRound),
    items: list("items"),
    priceLists: list("priceLists"),
    minOrder: nullNum(s.minOrder),
    minOrderBasis: String(s.minOrderBasis ?? "ยอดก่อนภาษี"),
    nearExpiryOnly: Boolean(s.nearExpiryOnly),
    nearExpiryDays: nullNum(s.nearExpiryDays),

    customerGroups: picked("customerGroups"),
    customers: list("customers"),
    areas: picked("areas"),
    channels: picked("channels"),

    usePerCustomer: nullNum(s.usePerCustomer),
    usePerArea: nullNum(s.usePerArea),
    useTotal: nullNum(s.useTotal),
    freeQtyCap: nullNum(s.freeQtyCap),
    stackWithPromo: Boolean(s.stackWithPromo),
    stackWithPromos: picked("stackWithPromos"),
    stackWithCustomerDiscount: Boolean(s.stackWithCustomerDiscount),
    commissionBase: String(s.commissionBase ?? ""),
    paymentTerm: String(s.paymentTerm ?? ""),
    /* % มัดจำมีความหมายเฉพาะกับเทอมมัดจำ — เลือกเทอมอื่นแล้วเลขเก่าค้างอยู่
       คือตัวเลขที่ไม่มีใครตั้งใจ และวันหนึ่งจะมีคนอ่านมันเป็นเงื่อนไขจริง */
    depositPct: String(s.paymentTerm ?? "") === DEPOSIT_TERM ? nullNum(s.depositPct) : null,

  };
}

export const PROMO_FORM: FormSchema<PromotionRow> = {
  key: "promotion",
  entityLabel: "Promotion",
  titleField: "name",
  saveButton: "บันทึกโปรโมชั่น",
  statusBadge: {
    Draft: "neutral",
    "Pending Approval": "warning",
    Active: "success",
    Paused: "warning",
    Ended: "neutral",
  },

  /**
   * ค่าเริ่มต้นกว้างและปลอดภัยที่สุด — ไม่จำกัดใคร ไม่จำกัดจำนวน ไม่จำกัดงบ
   * เพราะข้อจำกัดที่ระบบเดาให้ คือข้อจำกัดที่ไม่มีใครรู้ว่ามีอยู่
   *
   * ยกเว้นสามช่องที่ต้องเลือกเอง — ปล่อยว่างไว้จริง ๆ ตาม `blankPromotion()`
   */
  blank: () => ({
    _mode: "create",
    /* seed จาก `?kind=` เขียนทับค่านี้ตอนเปิดหน้า */
    kind: "free-goods",
    name: "",
    printName: "",
    from: "",
    to: "",
    /* ห้ามมีค่าเริ่มต้น — §6c ต้องเลือกทุกครั้ง */
    reason: "",
    reasonNote: "",

    /* ห้ามมีค่าเริ่มต้น — สามรูปแบบให้ของแถมคนละอย่าง */
    scope: "",
    items: [],
    freeItems: [],
    freeGroup: "",
    tiers: [],
    priceLists: [],
    discountTiers: [],
    /* ห้ามมีค่าเริ่มต้น — นับเงินกับนับชิ้นให้สิทธิคนละจำนวน */
    redeemBasis: "",
    redeemThreshold: "",
    redeemItems: [],
    redeemDiscPct: "",
    /* ห้ามเดาเป็น 1 — ลืมกรอกแล้วลูกค้าได้ 1 ชิ้นแทน 3 โดยไม่มีใครรู้ */
    redeemPerRound: "",
    discountMode: "price",
    minOrder: "",
    minOrderBasis: "ยอดก่อนภาษี",
    nearExpiryOnly: false,
    nearExpiryDays: "",

    customerGroups: [],
    customers: [],
    areas: [],
    channels: [],

    usePerCustomer: "",
    usePerArea: "",
    useTotal: "",
    freeQtyCap: "",
    stackWithPromo: false,
    stackWithPromos: [],
    stackWithCustomerDiscount: false,
    /* ห้ามมีค่าเริ่มต้น — กระทบรายได้พนักงาน */
    commissionBase: "",
    paymentTerm: "",
    depositPct: "",

  }),

  /**
   * ชนิดของโปรอยู่บนหัวหน้า ไม่ใช่ช่องกรอก
   *
   * เลือกไปแล้วที่หน้าเลือกประเภท และแก้ที่นี่ไม่ได้เพราะแต่ละชนิดถามคนละชุด
   * — แต่ฟอร์มเดียวรับสามชนิด ถ้าไม่บอกไว้ตรงไหนเลย คนที่เปิดหน้าค้างไว้แล้ว
   * กลับมากรอกต่อจะไม่รู้ว่ากำลังตั้งโปรแบบไหนอยู่ จนกว่าจะเลื่อนลงไปเจอ
   * ช่องที่โผล่เฉพาะชนิดนั้น
   */
  headerBadge: (s) => {
    const k = PROMOTION_KINDS.find((x) => x.key === String(s.kind ?? ""));
    return k ? { text: `โปร${k.label}`, tone: "primary" } : null;
  },

  toState: (p) => ({
    _mode: "edit",
    code: p.code,
    kind: p.kind,
    name: p.name,
    printName: p.printName,
    from: dmyToIso(p.from),
    to: dmyToIso(p.to),
    reason: p.reason,
    reasonNote: p.reasonNote,

    scope: p.scope,
    items: p.items.map((code) => ({ code })),
    freeItems: p.freeItems.map((code) => ({ code })),
    freeGroup: p.freeGroup,
    tiers: p.tiers.map((t) => ({ buy: t.buy, free: t.free })),
    discountTiers: p.discountTiers.map((t) => ({
      minQty: t.minQty,
      price: t.price ?? "",
      discPct: t.discPct ?? "",
    })),
    discountMode: p.discountMode,
    redeemBasis: p.redeemBasis,
    redeemThreshold: p.redeemThreshold ?? "",
    redeemItems: p.redeemItems.map((code) => ({ code })),
    redeemDiscPct: p.redeemDiscPct ?? "",
    redeemPerRound: p.redeemPerRound ?? "",
    priceLists: p.priceLists.map((code) => ({ code })),
    minOrder: p.minOrder ?? "",
    minOrderBasis: p.minOrderBasis,
    nearExpiryOnly: p.nearExpiryOnly,
    nearExpiryDays: p.nearExpiryDays ?? "",

    customerGroups: [...p.customerGroups],
    customers: p.customers.map((code) => ({ code })),
    areas: [...p.areas],
    channels: [...p.channels],

    usePerCustomer: p.usePerCustomer ?? "",
    usePerArea: p.usePerArea ?? "",
    useTotal: p.useTotal ?? "",
    freeQtyCap: p.freeQtyCap ?? "",
    stackWithPromo: p.stackWithPromo,
    stackWithPromos: [...p.stackWithPromos],
    stackWithCustomerDiscount: p.stackWithCustomerDiscount,
    commissionBase: p.commissionBase,
    paymentTerm: p.paymentTerm,
    depositPct: p.depositPct ?? "",

  }),

  steps: [
    /* ---------- กลุ่ม 1 · ข้อมูลระบุตัวโปร ---------- */
    {
      key: "identity",
      label: "ข้อมูลโปรโมชั่น",
      railLabel: "ข้อมูลโปรโมชั่น",
      labelTh: "รูปแบบ ชื่อ ช่วงเวลา และเหตุผลที่สร้าง",
      blocks: (s) => [
        /* ---------- คำถามแรกของฟอร์ม — รูปแบบ ----------

           อยู่บนสุดเพราะคำตอบของมันเปลี่ยนความหมายของทุกอย่างที่อยู่ใต้มัน:
           รายตัวไม่ต้องเลือกของแถม ชุดที่กำหนดต้องเลือก คนกรอกที่ตอบข้อนี้
           ทีหลังจะกรอกไปหลายช่องก่อนรู้ว่ากรอกผิดกล่อง

           และเป็นปุ่ม ไม่ใช่ dropdown — สองแบบที่ต้องชั่งน้ำหนักเทียบกัน
           ถ้าซ่อนไว้หลังลูกศร คนกรอกต้องกดเปิดก่อนจึงจะรู้ว่ามีให้เลือกอะไร */
        {
          type: "card",
          title: "รูปแบบของโปร",
          cols: "2",
          fields: [
            {
              type: "choice",
              path: "scope",
              label: "นับยอดแบบไหน แถมอะไร",
              required: true,
              /* รายตัว/ชุด ไม่มีความหมายกับแลกซื้อ — เงื่อนไขของมันคือ
                 "ทุก ๆ X ได้หนึ่งรอบ" ไม่ใช่ขอบเขตการนับของแถม
                 การ์ดทั้งใบหายไปเองเมื่อไม่มีช่องไหนโผล่ (CardBlock) */
              when: (st) => !isRedeem(st),
              /* เฉพาะแบบที่เปิดแล้ว แบบกลุ่มไม่อยู่ในรายการ และถูกปฏิเสธที่
                 ทางเขียนด้วย (`applyPromotionPatch`) เพราะรายการที่ซ่อนยังส่ง
                 มาทาง `?scope=group` ได้ */
              options: OPEN_PROMOTION_SCOPES.map((value) => ({
                value,
                label: PROMOTION_SCOPE_TH[value],
              })),
              span: true,
              hint: "ไม่มีค่าเริ่มต้น — สามรูปแบบให้ของแถมคนละอย่าง",
            },
          ],
        },
/* ---------- กรอบเดียว — รหัส ชื่อ ช่วงเวลา ยอดขั้นต่ำ เหตุผล ----------

           เคยเป็นสามกรอบซ้อนกัน ทั้งที่ทุกช่องในนั้นเป็นเรื่องเดียวกัน: เงื่อนไข
           ระดับ "ใบนี้" ที่ไม่ขึ้นกับสินค้าตัวไหน — สามหัวข้อเล็ก ๆ กับเส้นขอบ
           สามชั้นทำให้ต้องกวาดตาสามรอบเพื่ออ่านสิ่งที่อ่านรอบเดียวได้

           ยอดขั้นต่ำอยู่ในนี้ด้วยเพราะเป็นเกณฑ์ผ่าน/ไม่ผ่านของทั้งใบ ไม่ใช่
           คุณสมบัติของสินค้าตัวไหน วางไว้เหนือตารางสินค้าแล้วอ่านเหมือนยอด
           ขั้นต่ำต่อสินค้าหนึ่งตัว */
        {
          type: "card",
          title: "รายละเอียดโปร",
          cols: "2",
          fields: [
            {
              /* รหัสพิมพ์เองได้ตอนสร้าง ว่างไว้ = ระบบออกให้ตามลำดับเดิม
                 หลังบันทึกแล้วอ่านอย่างเดียว — เอกสารที่อ้างรหัสนี้ไปแล้วจะ
                 กลายเป็นเอกสารที่อ้างถึงของที่ไม่มีอยู่ ถ้ารหัสเปลี่ยนได้ */
              type: "text",
              path: "code",
              label: "รหัสโปร",
              placeholder: nextPromotionCode(),
              hint: `ว่างไว้ = ออกให้อัตโนมัติ (${nextPromotionCode()}) · แก้ไม่ได้หลังบันทึก`,
              when: isCreate,
            },
            {
              type: "static",
              path: "code",
              label: "รหัสโปร",
              when: (st) => !isCreate(st),
            },
            {
              type: "text",
              path: "name",
              label: "ชื่อโปร (ใช้ภายใน)",
              required: true,
              placeholder: "ซื้อ 5 แถม 1 — หัวขัด",
            },
            {
              type: "text",
              path: "printName",
              label: "ชื่อที่ลูกค้าเห็นบนเอกสาร",
              placeholder: "ว่างไว้ = ใช้ชื่อภายใน",
              hint: "ชื่อภายในกับชื่อที่ลูกค้าเห็นมักไม่เหมือนกัน",
              span: true,
            },
            { type: "date", path: "from", label: "เริ่มใช้", required: true },
            {
              type: "date",
              path: "to",
              label: "สิ้นสุด",
              hint: "ว่างไว้ = ไม่มีกำหนดสิ้นสุด",
            },
            {
              type: "number",
              path: "minOrder",
              label: "ยอดสั่งซื้อขั้นต่ำ (บาท)",
              min: 0,
              hint: "ว่างไว้ = ไม่กำหนดยอดขั้นต่ำ",
              /* ซ่อนจากชนิดแลกซื้อ และห้ามเปิดคืนโดยไม่คิดให้จบ:
                 ช่องนี้เป็นเกณฑ์ผ่าน/ไม่ผ่านครั้งเดียว (บิลถึงยอดนี้โปรจึงใช้ได้)
                 ส่วน "ครบกี่บาทต่อหนึ่งรอบ" ของแลกซื้อเป็นตัวหารที่ทวีคูณ
                 สองช่องนี้หน้าตาเหมือนกันบนหน้าจอ ต่างกันที่ความหมาย และการวาง
                 ไว้ในหน้าเดียวกันคือที่มาของโปรที่ตั้งผิดโดยไม่มีใครรู้ */
              when: (st) => !isRedeem(st),
            },
            {
              type: "select",
              path: "minOrderBasis",
              label: "ยอดขั้นต่ำคิดจาก",
              options: opts(["ยอดก่อนภาษี", "ยอดรวมภาษี"]),
              when: (st) => !isRedeem(st) && String(st.minOrder ?? "").trim() !== "",
            },
            {
              type: "select",
              path: "reason",
              label: "เหตุผลที่สร้างโปรนี้",
              /* ตัวเลือกตายตัว ไม่ใช่ช่องพิมพ์อิสระ — §6c ต้องเอาไปจัดกลุ่ม
                 เทียบผลได้ ถ้าพิมพ์เองจะได้ 40 คำสำหรับเหตุผลเดียวกัน
                 ไม่บังคับแล้ว: §6c ขอไว้เพื่อให้รายงานสรุปได้ว่าโปรแบบไหนคุ้ม
                 แต่โปรที่บันทึกไม่ได้เพราะยังไม่รู้จะเลือกเหตุผลไหน คือโปรที่
                 ไม่ได้เข้ารายงานนั้นเลย — เลือกทีหลังได้ */
              options: opts(PROMOTION_REASONS),
              hint: "ว่างไว้ได้ — ใส่ไว้เพื่อสรุปทีหลังว่าโปรแบบไหนคุ้ม",
            },
            {
              type: "textarea",
              path: "reasonNote",
              label: "รายละเอียดเพิ่มเติม",
              rows: 2,
              span: true,
              /* เปิดเฉพาะเมื่อเลือก "อื่น ๆ" — เหตุผลตายตัวอธิบายตัวเองแล้ว */
              when: (st) => String(st.reason ?? "").startsWith("อื่น ๆ"),
              required: true,
            },
          ],
        },
      ],
    },

    /* ---------- กลุ่ม 2 · ใช้กับใคร ----------

       ทั้งสามช่องเป็นแบบเดียวกัน: ว่าง = ทุกอัน ซึ่งเป็นคำตอบของเกือบทุกโปร
       และเป็นคำตอบที่ตารางว่างเปล่ากับปุ่ม "เพิ่ม" สื่อได้แย่ที่สุด — มันอ่าน
       เหมือนฟอร์มที่ยังกรอกไม่เสร็จ */
    {
      key: "who",
      label: "กลุ่มลูกค้าที่ใช้งาน",
      railLabel: "กลุ่มลูกค้าที่ใช้งาน",
      labelTh: "กลุ่มลูกค้า เขตขาย และช่องทาง",
      blocks: () => [
        {
          type: "picks",
          path: "customerGroups",
          label: "กลุ่มลูกค้า",
          allLabel: "ทุกกลุ่มลูกค้า",
          options: [...SR_CUST_GROUPS],
        },
        {
          type: "picks",
          path: "areas",
          label: "เขตขาย",
          allLabel: "ทุกเขต",
          options: areaOptions(),
        },
        {
          type: "picks",
          path: "channels",
          label: "ช่องทางขาย",
          allLabel: "ทุกช่องทาง",
          options: [...SR_CHANNELS],
        },
        {
          /* ยังเป็นตาราง ไม่ใช่ช่องติ๊กแบบสามช่องข้างบน — กลุ่ม/เขต/ช่องทางมี
             ห้าถึงยี่สิบตัวเลือกและ "ทุกอัน" เป็นคำตอบปกติ ส่วนลูกค้ามีเป็นพัน
             และ "ทุกราย" คือปล่อยว่าง ไม่ใช่ติ๊กทั้งพัน */
          type: "grid",
          path: "customers",
          label: "เจาะจงลูกค้ารายราย",
          addLabel: "เพิ่มลูกค้า",
          multiAdd: true,
          empty: "ว่างไว้ = ไม่เจาะจงราย",
          hint: "ใส่เมื่อโปรนี้ทำให้ลูกค้าเฉพาะราย ไม่ใช่ทั้งกลุ่ม",
          cols: [
            {
              key: "code",
              label: "ลูกค้า",
              type: "select",
              options: customerOptions(),
              required: true,
            },
          ],
        },
      ],
    },

    /* ---------- กลุ่ม 3 · ข้อจำกัดและผลกระทบ ---------- */
    {
      key: "limits",
      label: "เงื่อนไขการใช้งาน",
      railLabel: "เงื่อนไขการใช้งาน",
      labelTh: "เพดานการใช้ การซ้อนโปร การชำระเงิน และค่าคอม",
      blocks: (s) => [
        {
          /* กรอบเดียว สามคอลัมน์ — ทุกช่องในนี้ตอบคำถามเดียวกันว่า "ใบที่ใช้
             โปรนี้ถูกจำกัดอะไรบ้าง" ทั้งเพดานจำนวน การซ้อนกับส่วนลดอื่น และ
             เงื่อนไขการจ่ายเงิน สามกรอบซ้อนกันทำให้ต้องกวาดตาสามรอบเพื่ออ่าน
             สิ่งที่อ่านรอบเดียวได้ และแต่ละกรอบมีของอยู่ไม่กี่ช่อง

             ฐานคิดค่าคอมไม่ได้รวมมาด้วย — §6b สั่งไว้ว่าต้องเป็นกล่องเตือน
             ไม่ใช่ช่องธรรมดาในกรอบรวม เพราะเลือกผิดแล้วกระทบเงินของพนักงาน */
          type: "card",
          title: "ข้อจำกัดและเงื่อนไขการใช้",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "usePerCustomer",
              label: "ต่อลูกค้าหนึ่งราย (ครั้ง)",
              min: 1,
              hint: "ว่างไว้ = ไม่จำกัด",
            },
            {
              type: "number",
              path: "usePerArea",
              label: "ต่อหนึ่งเขตขาย (ครั้ง)",
              min: 1,
              hint: "ว่างไว้ = ไม่จำกัด · เพดานเดียวกันทุกเขต",
            },
            {
              type: "number",
              path: "useTotal",
              label: "รวมทั้งโปร (ครั้ง)",
              min: 1,
              hint: "ว่างไว้ = ไม่จำกัด",
            },
            {
              type: "number",
              path: "freeQtyCap",
              label: "ของแถมรวมทั้งโปร (ชิ้น)",
              min: 1,
              /* คนละเรื่องกับจำนวนครั้ง — 100 ครั้งที่แถมครั้งละ 15 คือของ 1,500
                 ชิ้น และเพดานที่คนตั้งโปรคิดไว้มักเป็นจำนวนของ ไม่ใช่จำนวนครั้ง */
              hint: "ว่างไว้ = ไม่จำกัด · คนละตัวกับจำนวนครั้ง",
              when: (st) => isFreeGoods(st),
            },
            {
              type: "toggle",
              path: "stackWithPromo",
              label: "ซ้อนกับโปรตัวอื่นได้",
              onText: "ซ้อนได้",
              offText: "ซ้อนไม่ได้",
            },
            {
              type: "toggle",
              path: "stackWithCustomerDiscount",
              label: "ซ้อนกับส่วนลดประจำของลูกค้าได้",
              onText: "ซ้อนได้",
              offText: "ซ้อนไม่ได้",
            },
            {
              /* กินเต็มแถวเพราะเป็นรายการติ๊ก ไม่ใช่ช่องเดียว — และโผล่มาเฉพาะ
                 ตอนเปิดซ้อน เพราะรายการโปรที่ซ้อนได้ไม่มีความหมายเมื่อซ้อนไม่ได้ */
              type: "picks",
              path: "stackWithPromos",
              label: "ซ้อนได้กับโปรตัวไหนบ้าง",
              allLabel: "ซ้อนได้กับทุกโปร",
              options: otherPromotionOptions(s),
              when: (st) => Boolean(st.stackWithPromo),
            },
            {
              type: "select",
              path: "paymentTerm",
              label: "ใบที่ใช้โปรนี้ต้องจ่ายยังไง",
              options: opts(PAYMENT_TERMS),
              /* ว่างไว้ได้ และเป็นคำตอบของเกือบทุกโปร — โปรไม่ควรเปลี่ยนเทอม
                 การจ่ายเงินของใครโดยที่ไม่มีใครสั่ง */
              placeholder: "ไม่กำหนดเพิ่ม — ใช้เงื่อนไขปกติ",
              hint: "ใส่เมื่อโปรลดลึกจนไม่ควรปล่อยเครดิต",
            },
            {
              type: "number",
              path: "depositPct",
              label: "มัดจำก่อนส่งของ (%)",
              min: 1,
              max: 100,
              required: true,
              when: (st) => String(st.paymentTerm ?? "") === DEPOSIT_TERM,
            },
          ],
        },
        {
          /* กล่องเตือน ไม่ใช่ dropdown ธรรมดา — §6b กลุ่ม 4 เลือกผิดแล้ว
             ค่าคอมของพนักงานเปลี่ยน และไม่มีใครเห็นจนถึงรอบจ่ายเงิน */
          type: "card",
          title: "⚠ ฐานคิดค่าคอมมิชชัน — กระทบรายได้พนักงาน",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "commissionBase",
              /* คำถามรวม "จ่ายไหม" กับ "จ่ายจากอะไร" ไว้ในช่องเดียว เพราะสอง
                 ช่องที่ต้องตรงกันเองคือสองช่องที่วันหนึ่งจะไม่ตรงกัน — ติ๊กว่า
                 ไม่จ่ายแล้วยังมีฐานค้างอยู่ในระเบียน ใครอ่านทีหลังก็ตอบไม่ได้
                 ว่าอันไหนคือของจริง */
              label: "ค่าคอมของใบที่ใช้โปรนี้",
              required: true,
              options: opts(COMMISSION_BASES),
              span: true,
              hint: "ไม่มีค่าเริ่มต้น — ต่างกันเป็นเงินของพนักงานขาย และ \"ไม่จ่าย\" ก็เป็นคำตอบที่ต้องเลือกเอง",
            },
          ],
        },
      ],
    },

    /* ---------- กลุ่ม 4 · ใช้กับอะไร — งานยาวที่สุด จึงอยู่ท้ายสุด ----------

       เลือกสินค้า ตั้งขั้นบันได ลองคำนวณ แล้วอ่านคำเตือนราคาขั้นต่ำ เป็นงาน
       ที่กินเวลามากกว่าสี่กลุ่มก่อนหน้ารวมกัน และเป็นงานที่ต้องรู้คำตอบของ
       กลุ่มก่อน ๆ ก่อน (รูปแบบไหน · ให้ใคร) จึงจะกรอกได้ถูก */
    {
      key: "what",
      label: "ตารางสินค้า และของแถม",
      railLabel: "ตารางสินค้า และของแถม",
      labelTh: "สินค้า ของแถม และตารางราคา",
      blocks: (s) => [
        {
          type: "grid",
          path: "items",
          label: "สินค้าที่เข้าโปร",
          addLabel: "เพิ่มสินค้า",
          /* โปรหนึ่งใบครอบสินค้าทั้งตระกูล — H-CS006-01 ถึง -06 คือหกรอบของ
             "กดเพิ่ม แล้วเปิด dropdown ไล่หาในรายการเดิมซ้ำ" ปุ่มที่สองเปิด
             รายการเดียวกันแบบกางออก ติ๊กทีเดียวได้ทั้งตระกูล */
          multiAdd: true,
          empty: "ยังไม่ได้เลือกสินค้า — โปรจะยังใช้กับอะไรไม่ได้",
          cols: [
            {
              key: "code",
              label: "รหัสสินค้า",
              type: "select",
              options: productOptions(),
              required: true,
            },
            {
              key: "lot",
              label: "ติดตามล็อต / มีวันหมดอายุ",
              type: "computed",
              muted: true,
              get: (r) =>
                String(r.code ?? "").trim()
                  ? lotTracked(String(r.code))
                    ? "ได้"
                    : "ไม่ได้"
                  : "—",
            },
          ],
        },
        /* ---------- ของแถมคืออะไร — คนละฝั่งกับสินค้าที่เข้าโปร ---------- */
        isFreeGoods(s) &&
          scopeOf(s) === "item" && {
            type: "note",
            label: "ของแถมคือสินค้าตัวเดียวกัน",
            text: "แบบรายตัวแถมสินค้าตัวเดียวกันกับที่นับ จึงไม่ต้องเลือกของแถมซ้ำ — ถ้าต้องแถมของอีกตัว ให้เปลี่ยนรูปแบบเป็นชุดที่กำหนด",
          },
        /* แบบราคาเดียวกันบอกกติกาของมันก่อนถึงกริด — เงื่อนไขราคาเท่ากันไม่ใช่
           ข้อจำกัดที่แถมมา มันคือสิ่งเดียวที่ทำให้ "เลือกตัวไหนก็ได้" มีคำตอบเดียว */
        isFreeGoods(s) &&
          isSamePriceScope(s) && {
            type: "note",
            label: "แบบราคาเดียวกัน — ลูกค้าเลือกเองได้ทั้งสองฝั่ง",
            text: "นับรวมกันทั้งกลุ่มที่ซื้อ (ลูกค้าผสมรุ่นไหนก็ได้) แล้วเลือกของแถมจากกลุ่มที่แถมได้เอง — ใช้ได้เพราะทุกตัวในกลุ่มเดียวกันราคาเท่ากัน ราคาเฉลี่ยกับราคาขั้นต่ำจึงมีคำตอบเดียวไม่ว่าลูกค้าหยิบตัวไหน ถ้าในกลุ่มมีสองราคา คำถามว่า \"เลือกตัวไหนแล้วบริษัทเสียเท่าไหร่\" จะกลับมาทันที และโปรจะบันทึกไม่ได้",
          },
        isFreeGoods(s) &&
          picksFreeItems(s) && {
            type: "grid",
            path: "freeItems",
            label: isSamePriceScope(s)
              ? "ของแถม — กลุ่มที่ลูกค้าเลือกได้ (ต้องราคาเท่ากันทั้งกลุ่ม)"
              : "ของแถม — สินค้าที่แถมได้",
            addLabel: "เพิ่มของแถม",
            multiAdd: true,
            empty: isSamePriceScope(s)
              ? "ยังไม่ได้เลือกของแถม — แบบราคาเดียวกันต้องระบุว่ากลุ่มที่แถมได้มีอะไรบ้าง"
              : "ยังไม่ได้เลือกของแถม — แบบชุดต้องระบุว่าแถมอะไร",
            hint: isSamePriceScope(s)
              ? "คนละกลุ่มกับสินค้าที่เข้าโปร และคนละราคากันได้ — ที่ต้องเท่ากันคือราคาภายในกลุ่มเดียวกัน"
              : "คนละฝั่งกับสินค้าที่เข้าโปร ชุดที่นับกับชุดที่แถมไม่จำเป็นต้องเป็นชุดเดียวกัน",
            cols: [
              {
                key: "code",
                label: "รหัสสินค้า",
                type: "select",
                options: productOptions(),
                required: true,
              },
              {
                key: "price",
                label: "ราคาแคตตาล็อก",
                type: "computed",
                align: "right",
                muted: true,
                get: (r) =>
                  String(r.code ?? "").trim() ? money(catalogPrice(String(r.code))) : DASH,
              },
            ],
          },
        /* ---------- กลุ่มที่มีมากกว่าหนึ่งราคา — เตือนตอนพิมพ์ ----------

           ข้อความมาจาก `priceClusterText` ตัวเดียวกับที่ด่านเขียนใช้ตอบกลับ
           ถ้าเขียนสำนวนใหม่ที่นี่ คนกรอกจะได้ยินสองเรื่องสำหรับข้อเท็จจริงเดียว */
        ...(() => {
          if (!isFreeGoods(s) || !isSamePriceScope(s)) return [];
          const out: FormBlock[] = [];
          for (const [path, label] of [
            ["items", "สินค้าที่เข้าโปร"],
            ["freeItems", "ของแถม"],
          ] as const) {
            const clusters = priceClusters(codesIn(s, path));
            if (clusters.length > 1) {
              out.push({
                type: "note",
                label: `⚠ ${label}มี ${clusters.length} ราคาในกลุ่มเดียว — บันทึกไม่ได้`,
                text: `${priceClusterText(clusters)} — เอาตัวที่ราคาต่างออก หรือเปลี่ยนรูปแบบเป็นชุดที่กำหนด ซึ่งไม่ได้สัญญากับลูกค้าว่าเลือกตัวไหนก็ราคาเท่ากัน`,
              });
            }
          }
          return out;
        })(),
        /* แบบที่สี่ยังปิด บอกไว้ให้เห็นว่ามีอยู่และปิดเพราะอะไร ไม่ใช่หายไป */
        isFreeGoods(s) && {
          type: "note",
          label: "ยังมีอีกแบบ — กลุ่ม (แถมตัวที่ถูกที่สุด) แต่ยังเลือกไม่ได้",
          text: 'รอการตัดสินว่า "ถูกที่สุด" วัดจากราคาไหน — ราคาตั้ง · ราคาหลังหักส่วนลดของลูกค้ารายนั้น · หรือต้นทุน สามคำตอบให้ของแถมคนละชิ้น และถ้าวัดจากราคาหลังหักส่วนลด ของที่ถูกสุดจะเปลี่ยนไปตามลูกค้าแต่ละราย — แบบราคาเดียวกันข้างบนคือครึ่งที่ตอบได้ของคำถามนี้ เพราะเมื่อทุกตัวราคาเท่ากัน สามคำตอบนั้นให้ของชิ้นเดียวกันหมด',
        },

        /* ---------- ขั้นบันได — ซื้อเท่าไหร่ แถมเท่าไหร่ ---------- */
        ...(() => {
          if (!isFreeGoods(s)) return [];
          const codes = itemCodes(s);

          /* ---------- ฟอร์มไม่คิดราคาเฉลี่ยเอง ----------

             เคยคิดเองจาก **สินค้าตัวแรกในตารางตัวเดียว** ผลคือโปรที่มีสินค้า
             หลายตัวคนละราคา จะเห็นเลขของตัวแรกและไม่มีคำเตือน ในขณะที่ด่าน
             ที่ตัดสินระดับอนุมัติ (`promotionFloorBreaches`) วนทุกตัวและตอบว่า
             ต้องขึ้นผู้จัดการ — คนตั้งโปรเห็นเขียวแล้วใบถูกตีกลับ

             ตอนนี้ถาม `worstTierAverage` ซึ่งเป็นสูตรตัวเดียวกับด่านนั้น
             คอลัมน์เดียวแสดงหลายราคาไม่ได้ จึงแสดงตัวที่แย่ที่สุด เพราะตัวนั้น
             คือตัวที่ตัดสินว่าทั้งใบต้องขึ้นผู้จัดการหรือไม่ ที่เหลือบอกเป็นจำนวน

             คอลัมน์ถูกสร้างข้างใน blocks() เพื่อให้ closure ปิดทับ state ได้ —
             `GridCol.get` รับแค่ row จึงไม่เห็นรายการสินค้า ซึ่งอยู่ในอีกกริด
             blocks() ถูกเรียกใหม่ทุกครั้งที่พิมพ์ คำเตือนจึงขึ้นทันทีโดยไม่ต้องบันทึก */
          const worstOf = (r: GridRow): ItemTierAverage | null => {
            const buy = num(r.buy);
            if (buy <= 0 || !codes.length) return null;
            return worstTierAverage(codes, { buy, free: num(r.free) });
          };

          const grid: FormBlock = {
            type: "grid",
            path: "tiers",
            label: "ขั้นบันได — ซื้อเท่าไหร่ แถมเท่าไหร่",
            addLabel: "เพิ่มขั้น",
            empty: "ยังไม่ได้ตั้งขั้น — โปรแถมสินค้าที่ไม่มีขั้นจะไม่แถมอะไรเลย",
            hint:
              codes.length === 0
                ? "เลือกสินค้าที่เข้าโปรก่อน แล้วราคาเฉลี่ยจะคำนวณให้"
                : codes.length === 1
                  ? `ราคาเฉลี่ยคิดจาก ${codes[0]} เทียบกับราคาขั้นต่ำของตัวมันเอง`
                  : `คิดจากสินค้าทุกตัวในโปร (${fmt(codes.length)} ตัว) — ช่องเฉลี่ยแสดงตัวที่ใกล้หลุดราคาขั้นต่ำที่สุด เพราะตัวนั้นคือตัวที่ตัดสินว่าทั้งใบต้องขึ้นผู้จัดการหรือไม่`,
            cols: [
              {
                key: "buy",
                /* คำนี้ตั้งใจ — "ซื้อ" เฉย ๆ ทำให้คนกรอกไม่รู้ว่านับของแถมด้วยไหม */
                label: "ซื้อ (จ่ายจริง)",
                type: "number",
                align: "right",
                required: true,
              },
              { key: "free", label: "แถม", type: "number", align: "right", required: true },
              {
                key: "total",
                label: "รวมที่ได้รับ",
                type: "computed",
                align: "right",
                muted: true,
                get: (r) => (num(r.buy) > 0 ? fmt(num(r.buy) + num(r.free)) : DASH),
              },
              {
                key: "avg",
                /* หัวคอลัมน์บอกตรง ๆ ว่าเลขในช่องเป็นของตัวไหน เมื่อมีหลายตัว —
                   "ราคาเฉลี่ยต่อชิ้น" เฉย ๆ อ่านว่าเป็นเลขของทั้งโปร ซึ่งไม่มี
                   อยู่จริงเมื่อสินค้าคนละราคา */
                label: codes.length > 1 ? "ราคาเฉลี่ย — ตัวที่แย่ที่สุด" : "ราคาเฉลี่ยต่อชิ้น",
                type: "computed",
                align: "right",
                get: (r) => {
                  const w = worstOf(r);
                  if (!w) return DASH;
                  const more = codes.length > 1 ? ` · อีก ${fmt(codes.length - 1)} ตัว` : "";
                  return `${money(w.average)}${w.below ? " ⚠" : ""}${more}`;
                },
                /* สีเตือนใช้ token เดิมของระบบ ไม่ได้ตั้งสีใหม่ */
                cls: (r) => (worstOf(r)?.below ? "font-semibold text-danger" : ""),
              },
            ],
          };
          return [grid];
        })(),
        /* สรุปเป็นข้อความด้วย เพราะสีในตารางอ่านไม่ออกถ้าตารางเลื่อนออกนอกจอ */
        ...(() => {
          if (!isFreeGoods(s)) return [];
          /* ตัวเดียวกับที่ `promotionFloorBreaches` เรียก — กล่องนี้จึงบอกสิ่ง
             เดียวกับที่ด่านอนุมัติจะตอบ ไม่ใช่ข้อสรุปคู่ขนานที่คิดจากสินค้าตัวเดียว */
          const breaches = ladderFloorBreaches(itemCodes(s), ladderTiersOf(s));
          if (!breaches.length) return [];
          return [
            {
              type: "note",
              label: `⚠ มี ${breaches.length} รายการที่ราคาเฉลี่ยต่ำกว่าราคาขั้นต่ำ`,
              text:
                breaches
                  .map(
                    (b) =>
                      `${b.code} ซื้อ ${fmt(b.tier.buy)} แถม ${fmt(b.tier.free)} → เฉลี่ย ${money(
                        b.average,
                      )} ต่ำกว่าราคาขั้นต่ำ ${money(b.floor)}`,
                  )
                  .join(" · ") + " — โปรนี้ต้องให้ผู้จัดการฝ่ายขายอนุมัติ",
            } as FormBlock,
          ];
        })(),
        /* ---------- สิทธิแลกซื้อ — เงื่อนไข และสิทธิที่ได้ ---------- */
        isRedeem(s) && {
          type: "card",
          title: "เงื่อนไข — ครบเท่าไหร่ได้สิทธิหนึ่งรอบ",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "redeemBasis",
              label: "นับจากอะไร",
              required: true,
              options: Object.entries(REDEEM_BASIS_TH)
                .filter(([value]) => value !== "")
                .map(([value, label]) => ({ value, label })),
              hint: "ไม่มีค่าเริ่มต้น — นับเงินกับนับชิ้นให้สิทธิคนละจำนวนกับลูกค้าคนเดียวกัน",
            },
            {
              type: "number",
              path: "redeemThreshold",
              label:
                String(s.redeemBasis ?? "") === "qty"
                  ? "ครบกี่ชิ้นต่อหนึ่งรอบ"
                  : "ครบกี่บาทต่อหนึ่งรอบ",
              min: 1,
              required: true,
              hint: "ทวีคูณเต็มจำนวน เศษทิ้ง — ครบสองเท่าได้สองรอบ",
            },
          ],
        },
        isRedeem(s) && {
          type: "card",
          title: "สิทธิที่ได้",
          cols: "2",
          fields: [
            {
              type: "number",
              path: "redeemPerRound",
              label: "แลกซื้อได้กี่ชิ้นต่อรอบ",
              min: 1,
              required: true,
              /* ห้ามปล่อยว่างแล้วให้ระบบเดาเป็น 1 — คนตั้งโปรที่ลืมกรอกจะให้
                 สิทธิ 1 ชิ้นแทน 3 และไม่มีใครรู้ว่าตั้งใจหรือลืม */
              hint: "เป็นเพดาน ไม่ใช่ขั้นต่ำ — ลูกค้าซื้อน้อยกว่าได้ เกินไม่ได้",
            },
            {
              type: "number",
              path: "redeemDiscPct",
              label: "ส่วนลดจากราคามาตรฐาน (%)",
              min: 1,
              max: 100,
              hint: "แลกซื้อไม่ใช่ของฟรี ลูกค้ายังจ่าย — คิดจากราคามาตรฐาน ไม่ใช่จากราคาที่ลูกค้ารายนั้นได้อยู่",
            },
          ],
        },
        isRedeem(s) && {
          type: "grid",
          path: "redeemItems",
          label: "สินค้าที่แลกซื้อได้",
          addLabel: "เพิ่มสินค้า",
          empty: "ยังไม่ได้เลือกสินค้าที่แลกซื้อได้ — สิทธิจะยังใช้ซื้ออะไรไม่ได้",
          hint: "คนละฝั่งกับสินค้าที่นับเข้าเงื่อนไขข้างบน",
          cols: [
            {
              key: "code",
              label: "รหัสสินค้า",
              type: "select",
              options: productOptions(),
              required: true,
            },
          ],
        },
        /* ข้อความนี้ต้องอยู่บนฟอร์ม ไม่ใช่อยู่ในเอกสารประกอบ — คนตั้งโปรที่
           เข้าใจว่าสิทธิเก็บข้ามใบได้ จะบอกเซลล์ผิด แล้วเซลล์ไปสัญญากับลูกค้า
           ซึ่งระบบทำตามไม่ได้ในเฟสนี้ */
        isRedeem(s) && {
          type: "note",
          label: "สิทธิใช้ได้เฉพาะในใบเดียวกัน — ไม่ใช้ตอนนั้นจะหายไป",
          text: "รอบสิทธิคำนวณจากยอดในใบนั้นใบเดียว ถ้าลูกค้าไม่ใช้สิทธิตอนออกใบ สิทธิไม่ถูกเก็บไว้ใช้ใบหลัง และระบบยังทำสิทธิค้างข้ามใบไม่ได้ในเฟสนี้ — อย่าสัญญากับลูกค้าว่าเก็บไว้ก่อนได้",
        },
        /* ตัวอย่างจากตัวคำนวณจริง — ตัวเลขทุกช่องมาจาก redeemRounds/redeemQuota
           ไม่ได้คิดที่หน้าจอ และเห็นกฎเศษทิ้งด้วยตาโดยไม่ต้องอ่านเอกสาร */
        ...(() => {
          if (!isRedeem(s)) return [];
          const basis = String(s.redeemBasis ?? "") as RedeemBasis;
          const threshold = numOrNull(s.redeemThreshold);
          const perRound = numOrNull(s.redeemPerRound);
          if (basis === "" || threshold === null || threshold <= 0) return [];

          const unit = basis === "qty" ? "ชิ้น" : "บาท";
          const rows = redeemPreview(threshold, basis, perRound, [
            threshold - 1,
            threshold,
            threshold * 2,
            Math.round(threshold * 2.4),
          ]);

          return [
            {
              type: "note",
              label: "ยอดเท่านี้ได้สิทธิเท่าไหร่",
              text: rows
                .map(
                  (r) =>
                    `${fmt(r.actual)} ${unit} → ${fmt(r.rounds)} รอบ · ${fmt(r.quota)} ชิ้น` +
                    (r.remainder > 0 ? ` (เศษ ${fmt(r.remainder)} ${unit} ทิ้ง)` : ""),
                )
                .join(" · "),
            } as FormBlock,
          ];
        })(),
        /* ราคาแลกซื้อหลุดราคาขั้นต่ำ — สูตรเดียวกับโปรส่วนลด ไม่มีสำเนาที่สอง */
        ...(() => {
          if (!isRedeem(s)) return [];
          const pct = numOrNull(s.redeemDiscPct);
          const codes = ((s.redeemItems ?? []) as GridRow[])
            .map((r) => String(r.code ?? "").trim())
            .filter(Boolean);
          if (pct === null || pct <= 0 || !codes.length) return [];

          const breaches = discountFloorBreaches(
            codes,
            [{ minQty: 1, price: null, discPct: pct }],
            "percent",
          );
          if (!breaches.length) return [];

          return [
            {
              type: "note",
              label: `⚠ ราคาแลกซื้อของ ${breaches.length} รายการต่ำกว่าราคาขั้นต่ำ`,
              text:
                breaches
                  .map((b) => `${b.code} ลด ${pct}% → ${money(b.price)} ต่ำกว่าขั้นต่ำ ${money(b.floor)}`)
                  .join(" · ") + " — โปรนี้ต้องให้ผู้จัดการฝ่ายขายอนุมัติ",
            } as FormBlock,
          ];
        })(),
        {
          type: "grid",
          path: "priceLists",
          label: "ตารางราคาที่ใช้โปรนี้ได้",
          addLabel: "เพิ่มตารางราคา",
          empty: "ว่างไว้ = ใช้ได้ทุกตารางราคา",
          cols: [
            {
              key: "code",
              label: "ตารางราคา",
              type: "select",
              options: [...QT_PRICE_LISTS],
              required: true,
            },
          ],
        },
        /* ---------- ขั้นส่วนลด — เฉพาะโปรชนิดส่วนลดราคา ---------- */
        isDiscount(s) && {
          type: "card",
          title: "ราคาที่โปรนี้ให้",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "discountMode",
              label: "คิดแบบไหน",
              required: true,
              options: Object.entries(DISCOUNT_MODE_TH).map(([value, label]) => ({ value, label })),
              span: true,
              hint: "เปอร์เซ็นต์คิดจากราคามาตรฐาน (ราคาแคตตาล็อกเอกชน) ไม่ใช่จากราคาที่ลูกค้ารายนั้นได้อยู่",
            },
          ],
        },
        isDiscount(s) && {
          type: "grid",
          path: "discountTiers",
          label: "ขั้นส่วนลดตามจำนวน",
          addLabel: "เพิ่มขั้น",
          empty: "ยังไม่ได้ตั้งขั้น — โปรจะยังไม่ให้ราคาอะไรกับใคร",
          /* ขั้นส่วนลด **ไม่ผสมกัน** ต่างจากขั้นของแถม จำนวนที่ซื้อตกอยู่ในขั้นไหน
             ก็ได้ราคาขั้นนั้นทั้งบรรทัด และขั้นสูงสุดครอบทุกจำนวนที่มากกว่า */
          hint: "ซื้อถึงจำนวนไหนได้ราคาขั้นนั้นทั้งบรรทัด ขั้นสูงสุดครอบทุกจำนวนที่มากกว่า และไม่มีการผสมขั้น",
          cols: [
            { key: "minQty", label: "ซื้อตั้งแต่ (ชิ้น)", type: "number", required: true, align: "right" },
            discountMode(s) === "price"
              ? { key: "price", label: "ราคาต่อชิ้น", type: "number", required: true, align: "right" }
              : { key: "discPct", label: "ส่วนลด (%)", type: "number", required: true, align: "right" },
          ],
        },
        /* เตือนข้อ 1 — ราคาหลังลดต่ำกว่าราคาขั้นต่ำ คำนวณจาก state ที่กำลังพิมพ์ */
        ...(() => {
          if (!isDiscount(s)) return [];
          const tiers = discountTiersOf(s);
          const items = itemCodes(s);
          /* ไม่ต้องเช็คว่ามีขั้นหรือมีสินค้าแล้วหรือยัง — ตัวคำนวณตอบว่าง
             ให้เองเมื่อยังกรอกไม่เสร็จ (`discountIneffectiveTiers` มี guard
             นั้นอยู่ และมีเทสต์ปักไว้) เช็คซ้ำที่นี่คือกฎสำเนาที่สองซึ่งวันหนึ่ง
             จะไม่ตรงกับตัวจริง — พิสูจน์ด้วยการฉีดของผิดแล้วเทสต์ไม่แดง
             เพราะด่านจริงอยู่ข้างล่างนั้น */

          /* กล่อง note ของ form engine ไม่มีระดับความรุนแรง — สีเดียวเสมอ
             (`NoteField` ใน FormFields.tsx) รอบนี้ห้ามแตะ engine จึงบอกระดับ
             ด้วยข้อความ ไม่ใช่ด้วยสี */
          const out: FormBlock[] = [];
          const breaches = discountFloorBreaches(items, tiers, discountMode(s));
          if (breaches.length) {
            out.push({
              type: "note",
              label: `⚠ มี ${breaches.length} ขั้นที่ราคาหลังลดต่ำกว่าราคาขั้นต่ำ`,
              text:
                breaches
                  .map(
                    (b) =>
                      `${b.code} ซื้อตั้งแต่ ${b.tier.minQty} → ${money(b.price)} ต่ำกว่าขั้นต่ำ ${money(b.floor)}`,
                  )
                  .join(" · ") +
                " — โปรนี้ต้องให้ผู้จัดการฝ่ายขายอนุมัติ และทุกใบที่ใช้จะถูกส่งขออนุมัติราคา",
            });
          }

          /* เตือนข้อ 2 — ชั้นที่โปรนี้ไม่มีผลเลย เพราะได้ถูกกว่าอยู่แล้ว
             คำนวณจากราคากลางจริง ไม่ได้เดา */
          const dead = discountIneffectiveTiers(items, tiers, discountMode(s));
          if (dead.length) {
            out.push({
              type: "note",
              label: `⚠ โปรนี้ไม่มีผลกับ${dead.map((t) => TIER_TH[t]).join(" · ")}`,
              text:
                `ราคาที่กลุ่มนั้นได้อยู่แล้วต่ำกว่าราคาที่โปรนี้ให้ ทุกใบของกลุ่มนั้นจะได้ราคาเดิม ` +
                `แต่โปรยังนับเข้างบและออกสื่อไปแล้ว — ถ้าต้องการให้มีผล ต้องลดลึกกว่านี้ หรือตัดกลุ่มนั้นออกจากขอบเขต`,
            });
          }
          return out;
        })(),
        {
          type: "card",
          title: "ล็อตใกล้หมดอายุ",
          cols: "2",
          fields: [
            {
              type: "toggle",
              path: "nearExpiryOnly",
              label: "ใช้เฉพาะล็อตที่ใกล้หมดอายุ",
              onText: "เฉพาะล็อตใกล้หมดอายุ",
              offText: "ทุกล็อต",
            },
            {
              type: "number",
              path: "nearExpiryDays",
              label: "นับว่าใกล้หมดอายุที่กี่วัน",
              min: 1,
              when: (st) => Boolean(st.nearExpiryOnly),
              required: true,
            },
          ],
        },
        /* เตือนตอนพิมพ์ ไม่ต้องกดบันทึก — สินค้าที่ไม่ได้ติดตามล็อตจะเลือก
           ล็อตใกล้หมดอายุให้ไม่ได้ ระบบไม่รู้ว่าล็อตไหนหมดอายุเมื่อไหร่ */
        Boolean(s.nearExpiryOnly) &&
          itemsWithoutLotTracking(s.items).length > 0 && {
            type: "note",
            label: "เปิดตัวเลือกล็อตใกล้หมดอายุกับสินค้าเหล่านี้ไม่ได้",
            text: `${itemsWithoutLotTracking(s.items).join(" · ")} — ไม่ได้ติดตามล็อตหรือไม่มีวันหมดอายุ ระบบจึงไม่รู้ว่าล็อตไหนใกล้หมดอายุ เอาสินค้าออกหรือปิดตัวเลือกนี้`,
          },
      ],
    },

    {
      key: "review",
      label: "ตรวจทาน",
      railLabel: "ตรวจทาน",
      labelTh: "ตรวจก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  /* แปด ช่อง — ไม่เกินเก้าตามเกณฑ์ และทุกช่องเป็นสิ่งที่ระบบเดาแทนไม่ได้ */
  required: [
    { path: "name", label: "ชื่อโปร", step: "identity" },
    { path: "from", label: "วันเริ่มใช้", step: "identity" },
    {
      path: "reasonNote",
      label: "รายละเอียดเหตุผล",
      step: "identity",
      test: (s) => !String(s.reason ?? "").startsWith("อื่น ๆ") || Boolean(String(s.reasonNote ?? "").trim()),
    },
    {
      path: "scope",
      label: "นับยอดแบบไหน",
      /* ตามช่องไป ไม่ใช่ค้างไว้ที่ชื่อกลุ่มเดิม — ปุ่มที่พาไปช่องที่ยังไม่ได้
         กรอกอ่านค่านี้ ถ้าไม่ย้ายตาม มันจะพาไปกลุ่มที่ไม่มีช่องนั้นแล้ว */
      step: "identity",
      test: (s) => isRedeem(s) || Boolean(String(s.scope ?? "").trim()),
    },
    {
      path: "items",
      label: "สินค้าที่เข้าโปร",
      step: "what",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
    { path: "commissionBase", label: "ฐานคิดค่าคอมมิชชัน", step: "limits" },
    {
      /* "มัดจำก่อนส่งของ" ที่ไม่บอกว่ากี่ % คือเงื่อนไขที่ฝ่ายขายตอบลูกค้าไม่ได้
         และแต่ละคนจะไปตกลงกันเองคนละตัวเลข */
      path: "depositPct",
      label: "มัดจำกี่เปอร์เซ็นต์",
      step: "limits",
      test: (s) =>
        String(s.paymentTerm ?? "") !== DEPOSIT_TERM || (numOrNull(s.depositPct) ?? 0) > 0,
    },
    {
      path: "discountTiers",
      label: "ขั้นส่วนลดตามจำนวน",
      step: "what",
      test: (s) => !isDiscount(s) || discountTiersOf(s).length > 0,
    },
    {
      /* โปรแถมสินค้าที่ไม่มีขั้น คือโปรที่ไม่แถมอะไรเลย — และเป็นสิ่งที่ระบบนี้
         ปล่อยให้บันทึกได้มาตลอด เพราะยังไม่มีที่กรอกขั้น */
      path: "tiers",
      label: "ขั้นบันไดของแถม",
      step: "what",
      test: (s) => !isFreeGoods(s) || ladderTiersOf(s).length > 0,
    },
    {
      path: "redeemBasis",
      label: "เงื่อนไขนับจากอะไร",
      step: "what",
      test: (s) => !isRedeem(s) || Boolean(String(s.redeemBasis ?? "").trim()),
    },
    {
      path: "redeemThreshold",
      label: "ยอดต่อหนึ่งรอบสิทธิ",
      step: "what",
      test: (s) => !isRedeem(s) || (numOrNull(s.redeemThreshold) ?? 0) > 0,
    },
    {
      /* บังคับ ไม่ใช่ rule — ค่าว่างที่แปลว่า "หนึ่งชิ้น" คือการเดาแทนคนตั้งโปร
         และความต่างระหว่าง 1 กับ 3 ชิ้นคือเงินที่บริษัทจ่ายทุกใบ */
      path: "redeemPerRound",
      label: "แลกซื้อได้กี่ชิ้นต่อรอบ",
      step: "what",
      test: (s) => !isRedeem(s) || (numOrNull(s.redeemPerRound) ?? 0) > 0,
    },
    {
      path: "redeemItems",
      label: "สินค้าที่แลกซื้อได้",
      step: "what",
      test: (s) =>
        !isRedeem(s) ||
        ((s.redeemItems ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
  ],

  rules: [
    {
      /* สิทธิที่ไม่มีส่วนลดคือการซื้อราคาปกติ ซึ่งไม่ใช่สิทธิ — เป็น rule
         ไม่ใช่ช่องบังคับ เพราะไม่มีค่าที่ต้องเดาแทนใคร ค่าว่างมีความหมายเดียว
         คือยังไม่ได้ตั้ง */
      label: "สิทธิแลกซื้อต้องมีส่วนลด ไม่งั้นคือการซื้อราคาปกติ",
      step: "what",
      test: (s) => !isRedeem(s) || (numOrNull(s.redeemDiscPct) ?? 0) > 0,
    },
    {
      label: "สินค้าที่แลกซื้อได้ ต้องไม่ใช่ตัวเดียวกับสินค้าที่นับเข้าเงื่อนไข",
      step: "what",
      /* ถ้าเป็นตัวเดียวกัน ลูกค้าจะซื้อตัวนั้นเพิ่มเพื่อให้ครบเงื่อนไขแล้วเอา
         สิทธิไปซื้อตัวเดิมในราคาลด ซึ่งเป็นวงที่กติกาข้อ "แลกซื้อไม่นับเข้ายอด"
         มีไว้กัน — และกฎข้อนั้นยังไม่ได้ทำ (PM-3) จึงต้องกันที่การตั้งโปรก่อน */
      test: (s) => {
        if (!isRedeem(s)) return true;
        const counted = new Set(itemCodes(s));
        return !((s.redeemItems ?? []) as GridRow[]).some((r) =>
          counted.has(String(r.code ?? "").trim()),
        );
      },
    },
    {
      /* ด่านจริงอยู่ที่ `applyPromotionPatch` ตัวนี้คือการบอกก่อนกดบันทึก
         ไม่ใช่ด่านที่สอง — ข้อความมาจากเรื่องเดียวกันแต่คนละจังหวะ */
      label: "รูปแบบกลุ่มยังใช้ไม่ได้ — เลือกรายตัว หรือ ชุดที่กำหนด",
      step: "identity",
      test: (s) => OPEN_PROMOTION_SCOPES.includes(scopeOf(s) as PromotionRow["scope"]),
    },
    {
      label: "แบบที่ให้ลูกค้าเลือกของแถม ต้องระบุว่าแถมอะไรได้บ้าง",
      step: "what",
      test: (s) =>
        !isFreeGoods(s) || !picksFreeItems(s) || codesIn(s, "freeItems").length > 0,
    },
    {
      /* ด่านจริงอยู่ที่ `applyPromotionPatch` ตัวนี้คือการบอกก่อนกดบันทึก
         และทั้งสองที่อ่าน `priceClusters` ตัวเดียวกัน */
      label: "แบบราคาเดียวกัน — สินค้าที่เข้าโปรต้องราคาเท่ากันทุกตัว",
      step: "what",
      test: (s) =>
        !isSamePriceScope(s) || priceClusters(codesIn(s, "items")).length <= 1,
    },
    {
      label: "แบบราคาเดียวกัน — ของแถมต้องราคาเท่ากันทุกตัว",
      step: "what",
      test: (s) =>
        !isSamePriceScope(s) || priceClusters(codesIn(s, "freeItems")).length <= 1,
    },
    {
      label: "ทุกขั้นของแถมต้องมีจำนวนแถมมากกว่าศูนย์",
      step: "what",
      test: (s) => !isFreeGoods(s) || ladderTiersOf(s).every((t) => t.free > 0),
    },
    {
      /* สองขั้นที่ซื้อเท่ากันคือสองคำตอบสำหรับจำนวนเดียว `bestLadder` จะเลือก
         ตัวที่ให้ของแถมมากกว่าอย่างเงียบ ๆ และอีกตัวจะไม่เคยถูกใช้ */
      label: "ขั้นของแถมห้ามมีจำนวนซื้อซ้ำกัน",
      step: "what",
      test: (s) => {
        const buys = ladderTiersOf(s).map((t) => t.buy);
        return new Set(buys).size === buys.length;
      },
    },
    {
      label: "ทุกขั้นส่วนลดต้องกรอกราคาหรือเปอร์เซ็นต์ให้ครบตามแบบที่เลือก",
      step: "what",
      test: (s) => {
        if (!isDiscount(s)) return true;
        const mode = discountMode(s);
        return discountTiersOf(s).every((t) =>
          mode === "price" ? t.price !== null && t.price >= 0 : t.discPct !== null && t.discPct > 0,
        );
      },
    },
    {
      /* สองขั้นที่จำนวนเท่ากันคือสองราคาสำหรับจำนวนเดียว ตัวคำนวณจะเลือกตัวใด
         ตัวหนึ่งอย่างเงียบ ๆ และคนกรอกจะไม่รู้ว่าอีกตัวไม่เคยถูกใช้ */
      label: "ขั้นส่วนลดห้ามมีจำนวนซ้ำกัน",
      step: "what",
      test: (s) => {
        const qtys = discountTiersOf(s).map((t) => t.minQty);
        return new Set(qtys).size === qtys.length;
      },
    },
    {
      /* ด่านจริงอยู่ที่ `createPromotion` ตัวนี้บอกก่อนกดบันทึก — และบอก
         ตั้งแต่ตอนพิมพ์ ไม่ใช่ให้พิมพ์ครบทั้งใบแล้วค่อยรู้ว่ารหัสชนกับใคร */
      label: "รหัสโปรซ้ำกับที่มีอยู่แล้ว",
      step: "identity",
      test: (s) => {
        if (!isCreate(s)) return true;
        const code = String(s.code ?? "").trim().toUpperCase();
        return !code || !PROMOTIONS.some((p) => p.code.toUpperCase() === code);
      },
    },
    {
      label: "รหัสโปรห้ามมีช่องว่าง",
      step: "identity",
      test: (s) => !/\s/.test(String(s.code ?? "").trim()),
    },
    {
      label: "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มใช้",
      step: "identity",
      test: (s) => !s.to || !s.from || String(s.to) >= String(s.from),
    },
    {
      label: "เปิดล็อตใกล้หมดอายุต้องระบุจำนวนวัน",
      step: "what",
      test: (s) => !s.nearExpiryOnly || num(s.nearExpiryDays) > 0,
    },
    {
      /* สินค้าที่ไม่ได้ติดตามล็อตจะเลือกล็อตใกล้หมดอายุให้ไม่ได้ — ระบบไม่รู้
         ว่าล็อตไหนหมดอายุเมื่อไหร่ ปล่อยผ่านคือโปรที่ไม่มีของเข้าเงื่อนไข */
      label: "สินค้าที่ไม่ได้ติดตามล็อต ใช้เงื่อนไขล็อตใกล้หมดอายุไม่ได้",
      step: "what",
      test: (s) => !s.nearExpiryOnly || itemsWithoutLotTracking(s.items).length === 0,
    },
  ],

  newRow: () => ({ code: "" }),

  /** ชื่อซ้ำ — อ่านจากทะเบียนจริง ไม่เก็บสำเนา */
  findDuplicates: (s) => {
    const name = String(s.name ?? "").trim().toLowerCase();
    if (name.length < 4) return [];
    const self = String(s.code ?? "");
    return PROMOTIONS.filter(
      (p) => p.code !== self && p.name.trim().toLowerCase() === name,
    ).map((p) => ({ code: p.code, name: p.name, why: "ชื่อโปรซ้ำ" }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("promotion", code),

  /**
   * บันทึก — ไม่มีกฎอยู่ในนี้เลย
   *
   * สร้าง → `createPromotion` · แก้ → `applyPromotionPatch` ทั้งสองตัวถือ
   * ด่านสิทธิ์และธง `dirtySinceApproval` อยู่แล้ว ถ้าเขียนแถวตรงจากที่นี่
   * ด่านทั้งสี่จะเหลือแค่การซ่อนปุ่ม
   */
  save: (s, ctx) => {
    const patch = toPatch(s);
    /* โหมดเป็นตัวตัดสิน ไม่ใช่ "มีรหัสอยู่ในฟอร์มไหม" — ตั้งแต่มีช่องให้พิมพ์
       รหัสเอง การอ่านจากช่องนั้นแปลว่าคนที่พิมพ์รหัสซ้ำกับของเดิมจะไปแก้ทับ
       ระเบียนของคนอื่นเงียบ ๆ แทนที่จะถูกบอกว่ารหัสซ้ำ */
    const editing = isCreate(s) ? "" : String(s.code ?? "").trim();

    if (editing) {
      const row = getPromotion(editing);
      if (!row) {
        ctx.toast("บันทึกไม่ได้", `ไม่พบโปร ${editing} ในทะเบียน`, "danger");
        return;
      }
      const guard = applyPromotionPatch(row, patch);
      if (!guard.ok) {
        ctx.toast("บันทึกไม่ได้", guard.reason, "danger");
        return;
      }
      saved(ctx, {
        title: "บันทึกการแก้ไขแล้ว",
        message: `${row.code} — ${row.name}`,
        goto: `/m/promotion/${encodeURIComponent(row.code)}`,
      });
      return;
    }

    const res = createPromotion(patch);
    if (!res.ok || !res.row) {
      /* เหตุผลมาจากด่าน ไม่ได้เขียนขึ้นใหม่ที่นี่ */
      ctx.toast("สร้างโปรไม่ได้", res.reason, "danger");
      return;
    }
    saved(ctx, {
      title: "สร้างโปรโมชั่นแล้ว",
      message: `${res.row.code} — ${res.row.name}`,
      goto: `/m/promotion/${encodeURIComponent(res.row.code)}`,
    });
  },
};
