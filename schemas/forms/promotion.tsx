import {
  BUDGET_BASIS_TH,
  COMMISSION_BASES,
  OPEN_PROMOTION_SCOPES,
  PROMOTION_REASONS,
  PROMOTION_SCOPE_TH,
  PROMOTIONS,
  PROMOTION_KINDS,
  TRY_QTY_MAX,
  applyPromotionPatch,
  averageUnitPrice,
  clampTryQty,
  ladderUsesText,
  productFloor,
  createPromotion,
  getPromotion,
  tryLadder,
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
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { DASH, fmt, isoToDmy, dmyToIso, money } from "@/lib/format";
import type { LadderTier } from "@/lib/domain/promotion-ladder";
import type { FormBlock, FormSchema, FormState, GridRow } from "@/lib/types";
import { opts, saved } from "./common";

/* ============================================================
   ฟอร์มโปรโมชั่น — §6b ห้ากลุ่ม

   สี่กลุ่มแรกเป็นเงื่อนไข "ใช้เมื่อไหร่ กับอะไร กับใคร ได้กี่ครั้ง"
   กลุ่มที่ห้าเป็นเรื่องเงินกับสต๊อก — คนละธรรมชาติ จึงอยู่แท็บของตัวเอง
   ไม่ใช่ต่อท้ายกลุ่มสี่

   ฟอร์มนี้ไม่มีกฎอยู่ในตัวเอง — ทุกการเขียนไปที่ `createPromotion`
   (สร้าง) และ `applyPromotionPatch` (แก้) ซึ่งเป็นที่ที่ด่านสิทธิ์
   กับธง `dirtySinceApproval` อยู่ ถ้าฟอร์มเขียนแถวเอง ด่านทั้งสี่
   จะกลายเป็นการซ่อนปุ่ม — บทเรียนเดียวกับ pickComplete ใน BACKLOG

   ช่องบังคับ 8 ช่อง และสามช่องในนั้นห้ามมีค่าเริ่มต้น: เหตุผลที่สร้างโปร
   คลังที่หักของแถม และฐานคิดค่าคอม สามอย่างนี้ถ้าเดาให้ ทุกโปรจะได้
   ค่าที่ไม่มีใครเลือก แล้วรายงานจะสรุปจากค่าที่ระบบเดา
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** ชนิดที่หักของแถมออกจากคลังจริง — ส่วนลดราคาไม่หักสต๊อก */
const givesGoods = (st: FormState) => String(st.kind ?? "free-goods") === "free-goods";

const isDiscount = (st: FormState) => String(st.kind ?? "") === "price-discount";

const isFreeGoods = (st: FormState) => String(st.kind ?? "free-goods") === "free-goods";

const isRedeem = (st: FormState) => String(st.kind ?? "") === "redeem";

/** ตัวเลขที่ยังไม่กรอก = null ไม่ใช่ 0 — 0 เป็นค่าที่มีความหมายคนละอย่าง */
const numOrNull = (v: unknown): number | null =>
  String(v ?? "").trim() === "" ? null : Number(v) || 0;

const scopeOf = (st: FormState) => String(st.scope ?? "");

/** ขั้นของแถมจากกริด — แถวที่ยังไม่กรอกจำนวนซื้อถูกทิ้ง ไม่ใช่นับเป็นขั้น 0 */
const ladderTiersOf = (st: FormState): LadderTier[] =>
  ((st.tiers ?? []) as GridRow[])
    .filter((r) => num(r.buy) > 0)
    .map((r) => ({ buy: num(r.buy), free: num(r.free) }));

/**
 * ราคาต่อชิ้นที่ใช้คิดราคาเฉลี่ยในตารางขั้น
 *
 * อ่าน `catalogPrice` ตัวเดียวกับที่ `promotionFloorBreaches` ใช้ตัดสินว่าใคร
 * อนุมัติได้ — ถ้าหน้าจอใช้ราคาคนละตัวกับตัวที่ตัดสิน คนกรอกจะเห็นเขียวแล้ว
 * ถูกตีกลับตอนขออนุมัติ
 *
 * สินค้าหลายตัวในโปรใช้ตัวแรกเป็นตัวแทน และบอกไว้ในหัวคอลัมน์
 */
const unitPriceOf = (st: FormState): { code: string; price: number; floor: number | null } | null => {
  const [code] = itemCodes(st);
  if (!code) return null;
  return { code, price: catalogPrice(code), floor: productFloor(code) };
};

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

const productOptions = () => PRODUCTS.filter((p) => p.status === "Active").map((p) => p.code);
const warehouseOptions = () =>
  WAREHOUSES.filter((w) => w.status === "Active").map((w) => `${w.code} ${w.name}`);
const areaOptions = () => SALES_AREAS.map((a) => a.name);

/** ค่าจากฟอร์ม → patch ที่โดเมนรับ ที่เดียว ใช้ทั้งตอนสร้างและตอนแก้ */
function toPatch(s: FormState): Partial<PromotionRow> {
  const list = (path: string) =>
    ((s[path] ?? []) as GridRow[]).map((r) => String(r.code ?? "").trim()).filter(Boolean);

  /* ประเภทมาจากหน้าเลือกประเภทเป็น `?kind=` ซึ่ง route แปลงเป็น seed ให้แล้ว
     ถ้าไม่ส่งต่อ ทุกโปรจะกลายเป็น "แถมสินค้า" เพราะนั่นคือค่าเริ่มต้นของ
     `blankPromotion()` — ค่าที่ผู้ใช้เลือกจะหายเงียบ ๆ */
  const seededKind = String(s.kind ?? "");
  const kind = PROMOTION_KINDS.some((k) => k.key === seededKind)
    ? (seededKind as PromotionRow["kind"])
    : "free-goods";

  return {
    kind,
    name: String(s.name ?? "").trim(),
    printName: String(s.printName ?? "").trim(),
    from: isoToDmy(s.from),
    to: isoToDmy(s.to),
    priority: num(s.priority),
    reason: String(s.reason ?? ""),
    reasonNote: String(s.reasonNote ?? ""),
    owner: String(s.owner ?? ""),

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

    customerGroups: list("customerGroups"),
    customers: list("customers"),
    areas: list("areas"),
    channels: list("channels"),
    allowDraftPartner: Boolean(s.allowDraftPartner),

    usePerCustomer: nullNum(s.usePerCustomer),
    useTotal: nullNum(s.useTotal),
    stackWithPromo: Boolean(s.stackWithPromo),
    stackWithCustomerDiscount: Boolean(s.stackWithCustomerDiscount),
    recordUsage: Boolean(s.recordUsage),
    needsApproval: Boolean(s.needsApproval),
    commissionBase: String(s.commissionBase ?? ""),

    budget: nullNum(s.budget),
    budgetBasis: (String(s.budgetBasis ?? "") as PromotionRow["budgetBasis"]),
    budgetOver: (String(s.budgetOver ?? "warn") as PromotionRow["budgetOver"]),
    budgetWarnAt: num(s.budgetWarnAt),
    freeGoodsWarehouse: String(s.freeGoodsWarehouse ?? ""),
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
    priority: 5,
    /* ห้ามมีค่าเริ่มต้น — §6c ต้องเลือกทุกครั้ง */
    reason: "",
    reasonNote: "",
    owner: "",

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
    allowDraftPartner: false,

    usePerCustomer: "",
    useTotal: "",
    stackWithPromo: false,
    stackWithCustomerDiscount: false,
    recordUsage: true,
    needsApproval: true,
    /* ห้ามมีค่าเริ่มต้น — กระทบรายได้พนักงาน */
    commissionBase: "",

    budget: "",
    /* ห้ามมีค่าเริ่มต้น — งบ 100,000 คิดจากต้นทุนหรือราคาขายต่างกันเป็นเท่าตัว */
    budgetBasis: "",
    budgetOver: "warn",
    budgetWarnAt: 80,
    /* ห้ามมีค่าเริ่มต้น — ของแถมหักจากคลังไหนคือของจริงที่หายไปจากที่นั้น */
    freeGoodsWarehouse: "",
  }),

  toState: (p) => ({
    _mode: "edit",
    code: p.code,
    kind: p.kind,
    name: p.name,
    printName: p.printName,
    from: dmyToIso(p.from),
    to: dmyToIso(p.to),
    priority: p.priority,
    reason: p.reason,
    reasonNote: p.reasonNote,
    owner: p.owner,

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

    customerGroups: p.customerGroups.map((code) => ({ code })),
    customers: p.customers.map((code) => ({ code })),
    areas: p.areas.map((code) => ({ code })),
    channels: p.channels.map((code) => ({ code })),
    allowDraftPartner: p.allowDraftPartner,

    usePerCustomer: p.usePerCustomer ?? "",
    useTotal: p.useTotal ?? "",
    stackWithPromo: p.stackWithPromo,
    stackWithCustomerDiscount: p.stackWithCustomerDiscount,
    recordUsage: p.recordUsage,
    needsApproval: p.needsApproval,
    commissionBase: p.commissionBase,

    budget: p.budget ?? "",
    budgetBasis: p.budgetBasis,
    budgetOver: p.budgetOver,
    budgetWarnAt: p.budgetWarnAt,
    freeGoodsWarehouse: p.freeGoodsWarehouse,
  }),

  steps: [
    /* ---------- กลุ่ม 1 · ข้อมูลระบุตัวโปร ---------- */
    {
      key: "identity",
      label: "ข้อมูลโปร",
      railLabel: "ข้อมูลโปร",
      labelTh: "ชื่อ ช่วงเวลา และเหตุผลที่สร้าง",
      blocks: (s) => [
        {
          type: "card",
          title: "ชื่อและช่วงเวลา",
          cols: "2",
          fields: [
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
              path: "priority",
              label: "ลำดับความสำคัญ",
              min: 1,
              max: 9,
              hint: "เลขน้อยมาก่อน ใช้ตัดสินเมื่อโปรหลายตัวเข้าเงื่อนไขพร้อมกัน",
            },
            { type: "text", path: "owner", label: "เจ้าของโปร", placeholder: "ชื่อผู้ดูแล" },
            {
              /* เลือกไปแล้วที่หน้าเลือกประเภท แสดงไว้ให้รู้ว่ากำลังสร้างอะไร
                 แต่แก้ที่นี่ไม่ได้ เพราะแต่ละประเภทมีเงื่อนไขไม่เหมือนกัน */
              type: "static",
              path: "kind",
              label: "ประเภทโปร",
              value: (st: FormState) =>
                PROMOTION_KINDS.find((k) => k.key === String(st.kind ?? ""))?.label ?? DASH,
            },
          ],
        },
        {
          type: "card",
          title: "เหตุผลที่สร้างโปรนี้",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "reason",
              label: "เหตุผล",
              required: true,
              /* ตัวเลือกตายตัว ไม่ใช่ช่องพิมพ์อิสระ — §6c ต้องเอาไปจัดกลุ่ม
                 เทียบผลได้ ถ้าพิมพ์เองจะได้ 40 คำสำหรับเหตุผลเดียวกัน */
              options: opts(PROMOTION_REASONS),
              hint: "ไม่มีค่าเริ่มต้น — เลือกเองทุกครั้ง",
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

    /* ---------- กลุ่ม 2 · ใช้กับอะไร ---------- */
    {
      key: "what",
      label: "ใช้กับอะไร",
      railLabel: "ใช้กับอะไร",
      labelTh: "สินค้า ตารางราคา และยอดขั้นต่ำ",
      blocks: (s) => [
        {
          type: "card",
          title: "ขอบเขต",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "scope",
              label: "รูปแบบ — นับยอดแบบไหน แถมอะไร",
              required: true,
              /* รายตัว/ชุด ไม่มีความหมายกับแลกซื้อ — เงื่อนไขของมันคือ
                 "ทุก ๆ X ได้หนึ่งรอบ" ไม่ใช่ขอบเขตการนับของแถม */
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
            {
              type: "select",
              path: "minOrderBasis",
              label: "ยอดขั้นต่ำคิดจาก",
              options: opts(["ยอดก่อนภาษี", "ยอดรวมภาษี"]),
              when: (st) => !isRedeem(st) && String(st.minOrder ?? "").trim() !== "",
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
          ],
        },
        {
          type: "grid",
          path: "items",
          label: "สินค้าที่เข้าโปร",
          addLabel: "เพิ่มสินค้า",
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
        isFreeGoods(s) &&
          scopeOf(s) === "set" && {
            type: "grid",
            path: "freeItems",
            label: "ของแถม — สินค้าที่แถมได้",
            addLabel: "เพิ่มของแถม",
            empty: "ยังไม่ได้เลือกของแถม — แบบชุดต้องระบุว่าแถมอะไร",
            hint: "คนละฝั่งกับสินค้าที่เข้าโปร ชุดที่นับกับชุดที่แถมไม่จำเป็นต้องเป็นชุดเดียวกัน",
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
        /* แบบที่สามยังปิด บอกไว้ให้เห็นว่ามีอยู่และปิดเพราะอะไร ไม่ใช่หายไป */
        isFreeGoods(s) && {
          type: "note",
          label: "ยังมีรูปแบบที่สาม — กลุ่ม (แถมตัวที่ถูกที่สุด) แต่ยังเลือกไม่ได้",
          text: 'รอการตัดสินว่า "ถูกที่สุด" วัดจากราคาไหน — ราคาตั้ง · ราคาหลังหักส่วนลดของลูกค้ารายนั้น · หรือต้นทุน สามคำตอบให้ของแถมคนละชิ้น และถ้าวัดจากราคาหลังหักส่วนลด ของที่ถูกสุดจะเปลี่ยนไปตามลูกค้าแต่ละราย',
        },

        /* ---------- ขั้นบันได — ซื้อเท่าไหร่ แถมเท่าไหร่ ---------- */
        ...(() => {
          if (!isFreeGoods(s)) return [];
          const base = unitPriceOf(s);

          /* คอลัมน์ถูกสร้างข้างใน blocks() เพื่อให้ closure ปิดทับ state ได้ —
             `GridCol.get` รับแค่ row จึงไม่เห็นราคาสินค้า ซึ่งอยู่ในอีกกริด
             blocks() ถูกเรียกใหม่ทุกครั้งที่พิมพ์ คำเตือนจึงขึ้นทันทีโดยไม่ต้องบันทึก */
          const avgOf = (r: GridRow): number | null => {
            if (!base || !(base.price > 0)) return null;
            const buy = num(r.buy);
            if (buy <= 0) return null;
            return averageUnitPrice(base.price, buy, num(r.free));
          };

          const below = (r: GridRow): boolean => {
            const avg = avgOf(r);
            return avg !== null && base?.floor !== null && base !== null && avg < base.floor!;
          };

          const grid: FormBlock = {
            type: "grid",
            path: "tiers",
            label: "ขั้นบันได — ซื้อเท่าไหร่ แถมเท่าไหร่",
            addLabel: "เพิ่มขั้น",
            empty: "ยังไม่ได้ตั้งขั้น — โปรแถมสินค้าที่ไม่มีขั้นจะไม่แถมอะไรเลย",
            hint: base
              ? `ราคาเฉลี่ยคิดจาก ${base.code} ราคา ${money(base.price)}${
                  base.floor !== null ? ` · ราคาขั้นต่ำ ${money(base.floor)}` : ""
                }`
              : "เลือกสินค้าที่เข้าโปรก่อน แล้วราคาเฉลี่ยจะคำนวณให้",
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
                label: "ราคาเฉลี่ยต่อชิ้น",
                type: "computed",
                align: "right",
                get: (r) => {
                  const avg = avgOf(r);
                  if (avg === null) return DASH;
                  return below(r) ? `${money(avg)} ⚠` : money(avg);
                },
                /* สีเตือนใช้ token เดิมของระบบ ไม่ได้ตั้งสีใหม่ */
                cls: (r) => (below(r) ? "font-semibold text-danger" : ""),
              },
            ],
          };
          return [grid];
        })(),
        /* สรุปเป็นข้อความด้วย เพราะสีในตารางอ่านไม่ออกถ้าตารางเลื่อนออกนอกจอ */
        ...(() => {
          if (!isFreeGoods(s)) return [];
          const base = unitPriceOf(s);
          if (!base || !(base.price > 0) || base.floor === null) return [];
          const bad = ladderTiersOf(s).filter(
            (t) => averageUnitPrice(base.price, t.buy, t.free) < base.floor!,
          );
          if (!bad.length) return [];
          return [
            {
              type: "note",
              label: `⚠ มี ${bad.length} ขั้นที่ราคาเฉลี่ยต่ำกว่าราคาขั้นต่ำ`,
              text:
                bad
                  .map(
                    (t) =>
                      `ซื้อ ${fmt(t.buy)} แถม ${fmt(t.free)} → เฉลี่ย ${money(
                        averageUnitPrice(base.price, t.buy, t.free),
                      )}`,
                  )
                  .join(" · ") +
                ` — ต่ำกว่าราคาขั้นต่ำ ${money(base.floor)} ของ ${base.code} โปรนี้ต้องให้ผู้จัดการฝ่ายขายอนุมัติ`,
            } as FormBlock,
          ];
        })(),
        /* ---------- ตัวลองคำนวณ — §3.4 ---------- */
        ...(() => {
          if (!isFreeGoods(s)) return [];
          const tiers = ladderTiersOf(s);
          if (!tiers.length) return [];

          const base = unitPriceOf(s);
          const card: FormBlock = {
            type: "card",
            title: "ลองคำนวณ",
            cols: "2",
            fields: [
              {
                type: "number",
                /* ขึ้นต้นด้วย _ เพราะไม่ใช่ฟิลด์ของโปร เป็นช่องทดลองบนหน้าจอ
                   `toPatch` ไม่ได้อ่านมัน จึงไม่มีทางถูกบันทึกลงระเบียน */
                path: "_tryQty",
                label: "ลองจำนวนที่ลูกค้าจ่ายจริง",
                min: 1,
                max: TRY_QTY_MAX,
                span: true,
                hint: base
                  ? `คิดจาก ${base.code} ราคา ${money(base.price)} — ตัวแทนเดียวกับตารางขั้นข้างบน`
                  : "เลือกสินค้าที่เข้าโปรก่อน แล้วราคาเฉลี่ยจะคำนวณให้",
              },
            ],
          };

          const typed = String(s._tryQty ?? "").trim();
          if (!typed) return [card];

          /* จำนวนถูกคุมเพดานที่ `clampTryQty` ตรงจุดรับค่านี้ ไม่ได้คุมข้างใน
             `bestLadder` — ใครพิมพ์เก้าหลักจึงได้คำตอบของหนึ่งแสน ไม่ใช่จอค้าง */
          const r = tryLadder(tiers, s._tryQty, base?.price ?? 0);
          const capped = clampTryQty(s._tryQty) !== Number(s._tryQty);

          const lines = [
            `จ่ายจริง ${fmt(r.qty)} → แถม ${fmt(r.free)} · รวมที่ได้รับ ${fmt(r.total)}`,
            r.average !== null ? `ราคาเฉลี่ยต่อชิ้น ${money(r.average)}` : "",
            r.uses.length ? `ใช้ขั้น ${ladderUsesText(r.uses)}` : "ยังไม่ถึงขั้นไหนเลย",
            r.unmatched ? `เศษที่จับคู่ไม่ได้ ${fmt(r.unmatched)} — ทิ้งตามกติกา ไม่ปัดขึ้น` : "",
            capped ? `จำนวนถูกจำกัดไว้ที่ ${fmt(TRY_QTY_MAX)} ซึ่งเป็นเพดานของช่องทดลอง` : "",
          ].filter(Boolean);

          const result: FormBlock = {
            type: "note",
            label: `ผลที่จ่ายจริง ${fmt(r.qty)} ชิ้น`,
            text: lines.join(" · "),
          };

          const blocks: FormBlock[] = [card, result];

          /* ข้อเสนอเพิ่มจำนวนขึ้นเฉพาะเมื่อระยะที่เหลือน้อยกว่าครึ่งของขั้นนั้น
             — ตรรกะอยู่ที่ `ladderSuggestion` ในโดเมน ไม่ได้ตัดสินที่นี่ */
          if (r.suggestion) {
            const { addQty, tier, extraFree } = r.suggestion;
            blocks.push({
              type: "note",
              label: `เพิ่มอีก ${fmt(addQty)} ชิ้น ได้ของแถมเพิ่ม ${fmt(extraFree)}`,
              text: `จ่ายจริง ${fmt(tier.buy)} เข้าขั้น ${fmt(tier.buy)} แถม ${fmt(
                tier.free,
              )} — บอกลูกค้าได้ว่าเติมอีกเท่านี้แล้วคุ้มกว่า`,
            });
          }

          if (base && base.floor !== null && r.average !== null && r.average < base.floor) {
            blocks.push({
              type: "note",
              label: "⚠ ราคาเฉลี่ยที่จำนวนนี้ต่ำกว่าราคาขั้นต่ำ",
              text: `เฉลี่ย ${money(r.average)} ต่ำกว่าราคาขั้นต่ำ ${money(base.floor)} ของ ${
                base.code
              } — ใบที่ใช้โปรนี้จะถูกส่งขออนุมัติราคา`,
            });
          }

          return blocks;
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

    /* ---------- กลุ่ม 3 · ใช้กับใคร ---------- */
    {
      key: "who",
      label: "ใช้กับใคร",
      railLabel: "ใช้กับใคร",
      labelTh: "กลุ่มลูกค้า เขตขาย และช่องทาง",
      blocks: () => [
        {
          type: "card",
          title: "ขอบเขตลูกค้า",
          cols: "2",
          fields: [
            {
              type: "toggle",
              path: "allowDraftPartner",
              label: "ให้ลูกค้าที่ยังไม่ยืนยันใช้ได้",
              onText: "ใช้ได้",
              offText: "ต้องยืนยันตัวตนก่อน",
              hint: "ลูกค้าที่ผู้แทนขายเพิ่งเปิดไว้ ยังไม่ผ่านฝ่ายขาย",
            },
          ],
        },
        {
          type: "grid",
          path: "customerGroups",
          label: "กลุ่มลูกค้า",
          addLabel: "เพิ่มกลุ่ม",
          empty: "ว่างไว้ = ทุกกลุ่มลูกค้า",
          cols: [
            { key: "code", label: "กลุ่ม", type: "select", options: [...SR_CUST_GROUPS], required: true },
          ],
        },
        {
          type: "grid",
          path: "areas",
          label: "เขตขาย",
          addLabel: "เพิ่มเขต",
          empty: "ว่างไว้ = ทุกเขต",
          cols: [
            { key: "code", label: "เขต", type: "select", options: areaOptions(), required: true },
          ],
        },
        {
          type: "grid",
          path: "channels",
          label: "ช่องทางขาย",
          addLabel: "เพิ่มช่องทาง",
          empty: "ว่างไว้ = ทุกช่องทาง",
          cols: [
            {
              key: "code",
              label: "ช่องทาง",
              type: "select",
              options: [...SR_CHANNELS],
              required: true,
            },
          ],
        },
        {
          type: "grid",
          path: "customers",
          label: "เจาะจงลูกค้ารายราย",
          addLabel: "เพิ่มลูกค้า",
          empty: "ว่างไว้ = ไม่เจาะจงราย",
          hint: "ใส่เมื่อโปรนี้ทำให้ลูกค้าเฉพาะราย ไม่ใช่ทั้งกลุ่ม",
          cols: [{ key: "code", label: "รหัสลูกค้า", type: "text", required: true }],
        },
      ],
    },

    /* ---------- กลุ่ม 4 · ข้อจำกัดและผลกระทบ ---------- */
    {
      key: "limits",
      label: "ข้อจำกัด",
      railLabel: "ข้อจำกัด",
      labelTh: "จำนวนครั้ง การซ้อนโปร และค่าคอม",
      blocks: () => [
        {
          type: "card",
          title: "ใช้ได้กี่ครั้ง",
          cols: "2",
          fields: [
            {
              type: "number",
              path: "usePerCustomer",
              label: "ต่อลูกค้าหนึ่งราย",
              min: 1,
              hint: "ว่างไว้ = ไม่จำกัด",
            },
            {
              type: "number",
              path: "useTotal",
              label: "รวมทั้งโปร",
              min: 1,
              hint: "ว่างไว้ = ไม่จำกัด",
            },
            {
              type: "toggle",
              path: "recordUsage",
              label: "บันทึกการใช้ทุกครั้ง",
              onText: "บันทึก",
              offText: "ไม่บันทึก",
            },
          ],
        },
        {
          type: "card",
          title: "ซ้อนกับส่วนลดอื่น",
          cols: "2",
          fields: [
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
              type: "toggle",
              path: "needsApproval",
              label: "ต้องผ่านการอนุมัติก่อนใช้",
              onText: "ต้องอนุมัติ",
              offText: "ใช้ได้ทันที",
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
              label: "คิดค่าคอมจาก",
              required: true,
              options: opts(COMMISSION_BASES),
              span: true,
              hint: "ไม่มีค่าเริ่มต้น — สองแบบนี้ให้ตัวเลขต่างกัน และเป็นเงินของพนักงานขาย",
            },
          ],
        },
      ],
    },

    /* ---------- กลุ่ม 5 · งบประมาณและคลัง — แท็บของตัวเอง ---------- */
    {
      key: "budget",
      label: "งบประมาณและคลัง",
      railLabel: "งบและคลัง",
      labelTh: "งบที่ตั้งไว้ และของแถมหักจากคลังไหน",
      blocks: (s) => [
        {
          type: "card",
          title: "งบประมาณ",
          cols: "2",
          fields: [
            {
              type: "number",
              path: "budget",
              label: "งบที่ตั้งไว้ (บาท)",
              min: 0,
              hint: "ว่างไว้ = ไม่จำกัดงบ",
            },
            {
              type: "select",
              path: "budgetBasis",
              label: "คิดงบจาก",
              /* ห้ามมีค่าเริ่มต้น และบังคับเมื่อมีงบ — งบ 100,000 คิดจาก
                 ต้นทุนหรือราคาขายต่างกันเป็นเท่าตัว */
              options: Object.entries(BUDGET_BASIS_TH)
                .filter(([value]) => value !== "")
                .map(([value, label]) => ({ value, label })),
              when: (st) => String(st.budget ?? "").trim() !== "",
              required: true,
              hint: "ไม่มีค่าเริ่มต้น — ต้นทุนกับราคาขายต่างกันเป็นเท่าตัว",
            },
            {
              type: "select",
              path: "budgetOver",
              label: "งบหมดแล้วทำอย่างไร",
              options: [
                { value: "warn", label: "เตือน แต่ยังใช้โปรได้" },
                { value: "stop", label: "หยุดโปรทันที" },
              ],
              when: (st) => String(st.budget ?? "").trim() !== "",
            },
            {
              type: "number",
              path: "budgetWarnAt",
              label: "เตือนเมื่อใช้งบถึง (%)",
              min: 1,
              max: 100,
              when: (st) => String(st.budget ?? "").trim() !== "",
            },
          ],
        },
        /* ส่วนลดราคาไม่หักของแถมจากคลังไหน จึงไม่ถามและไม่บังคับ
           การบังคับช่องที่ไม่เกี่ยวกับชนิดนี้ คือการสอนให้คนกรอกอะไรก็ได้ให้ผ่าน */
        givesGoods(s) && {
          type: "card",
          title: "ของแถมหักจากคลังไหน",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "freeGoodsWarehouse",
              label: "คลังที่หักของแถม",
              required: true,
              options: warehouseOptions(),
              span: true,
              /* ห้ามมีค่าเริ่มต้น — ของแถมคือของจริงที่หายไปจากคลังนั้น
                 เดาให้แล้วสต๊อกคลังที่ไม่มีใครเลือกจะขาดโดยไม่มีใครรู้ */
              hint: "ไม่มีค่าเริ่มต้น — ของแถมคือของจริงที่หายไปจากคลังนี้",
            },
          ],
        },
        Boolean(String(s.budget ?? "").trim()) && {
          type: "note",
          label: "งบนี้คิดยังไง",
          text:
            String(s.budgetBasis ?? "") === "cost"
              ? "คิดจากต้นทุนของแถม — งบเท่าเดิมจะแถมได้มากกว่าแบบคิดจากราคาขาย"
              : String(s.budgetBasis ?? "") === "price"
                ? "คิดจากราคาขายของแถม — งบเท่าเดิมจะแถมได้น้อยกว่าแบบคิดจากต้นทุน"
                : "ยังไม่ได้เลือกว่าคิดจากต้นทุนหรือราคาขาย — สองแบบนี้ต่างกันเป็นเท่าตัว",
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
    { path: "reason", label: "เหตุผลที่สร้างโปร", step: "identity" },
    {
      path: "reasonNote",
      label: "รายละเอียดเหตุผล",
      step: "identity",
      test: (s) => !String(s.reason ?? "").startsWith("อื่น ๆ") || Boolean(String(s.reasonNote ?? "").trim()),
    },
    {
      path: "scope",
      label: "นับยอดแบบไหน",
      step: "what",
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
      path: "freeGoodsWarehouse",
      label: "คลังที่หักของแถม",
      step: "budget",
      /* บังคับเฉพาะชนิดที่ให้ของ — ส่วนลดราคาไม่แตะสต๊อก */
      test: (s) => !givesGoods(s) || Boolean(String(s.freeGoodsWarehouse ?? "").trim()),
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
      step: "what",
      test: (s) => OPEN_PROMOTION_SCOPES.includes(scopeOf(s) as PromotionRow["scope"]),
    },
    {
      label: "แบบชุดที่กำหนดต้องระบุว่าแถมอะไร",
      step: "what",
      test: (s) =>
        !isFreeGoods(s) ||
        scopeOf(s) !== "set" ||
        ((s.freeItems ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
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
      label: "มีงบแล้วต้องบอกว่าคิดจากต้นทุนหรือราคาขาย",
      step: "budget",
      test: (s) => String(s.budget ?? "").trim() === "" || Boolean(String(s.budgetBasis ?? "").trim()),
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
    const editing = String(s.code ?? "").trim();

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
