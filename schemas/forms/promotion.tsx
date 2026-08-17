import {
  BUDGET_BASIS_TH,
  COMMISSION_BASES,
  PROMOTION_REASONS,
  PROMOTION_SCOPE_TH,
  PROMOTIONS,
  PROMOTION_KINDS,
  applyPromotionPatch,
  createPromotion,
  getPromotion,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { QT_PRICE_LISTS } from "@/data/quotations";
import { SR_CHANNELS } from "@/data/sales-requests";
import { SALES_AREAS } from "@/data/sales-areas";
import { SR_CUST_GROUPS } from "@/data/sales-reps";
import { PRODUCTS } from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { DASH, isoToDmy, dmyToIso } from "@/lib/format";
import type { FormSchema, FormState, GridRow } from "@/lib/types";
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

    scope: "item",
    items: [],
    priceLists: [],
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
              label: "นับยอดแบบไหน",
              required: true,
              options: Object.entries(PROMOTION_SCOPE_TH).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              type: "select",
              path: "minOrderBasis",
              label: "ยอดขั้นต่ำคิดจาก",
              options: opts(["ยอดก่อนภาษี", "ยอดรวมภาษี"]),
              when: (st) => String(st.minOrder ?? "").trim() !== "",
            },
            {
              type: "number",
              path: "minOrder",
              label: "ยอดสั่งซื้อขั้นต่ำ (บาท)",
              min: 0,
              hint: "ว่างไว้ = ไม่กำหนดยอดขั้นต่ำ",
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
        {
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
    { path: "scope", label: "นับยอดแบบไหน", step: "what" },
    {
      path: "items",
      label: "สินค้าที่เข้าโปร",
      step: "what",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
    { path: "commissionBase", label: "ฐานคิดค่าคอมมิชชัน", step: "limits" },
    { path: "freeGoodsWarehouse", label: "คลังที่หักของแถม", step: "budget" },
  ],

  rules: [
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
