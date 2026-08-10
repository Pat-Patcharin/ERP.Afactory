import type { Product } from "@/data/products";
import { OPT } from "@/data/options";
import {
  BASE_UNIT,
  PRODUCTS,
  SALES_UNIT,
  conversionText,
  decorateProducts,
  storageWarning,
  type ProductRow,
} from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { BUSINESS_PARTNERS, isSupplierRole, supplierOffers } from "@/lib/domain/partner";
import { catalogPrice } from "@/lib/domain/pricing";
import { DASH, money, stamp, isoToDmy, dmyToIso } from "@/lib/format";
import { checkPermission } from "@/lib/permissions";
import type { FormSchema, FormState, GridRow } from "@/lib/types";
import { FORM_USER, ReviewCard, isCreate, opts, saved } from "./common";

/* ============================================================
   PRODUCT FORM — six sections plus a review, mirroring the
   detail tabs, so a user who knows the read screen already
   knows the form.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const whOptions = () => WAREHOUSES.map((w) => `${w.code} ${w.name}`);

/**
 * The product name is one of the two language fields, never a third string
 * typed on its own. A product called "A-FLEX PU40 (White)" in the list while
 * its Thai and English boxes said something else was three names for one
 * thing, and nothing said which of them a quotation would print.
 *
 * `nameLang` is that decision, made once and visible on the form.
 */
const productName = (s: FormState) =>
  String((s.nameLang === "en" ? s.nameEn : s.nameTh) ?? "").trim();

/* Named for the language rather than for the two boxes above, so the choice
   and the box it points at are never two controls with one name. */
const NAME_LANG = [
  { value: "th", label: "ภาษาไทย" },
  { value: "en", label: "English" },
];

/**
 * The supplier offers, flattened for a read-only grid.
 *
 * Rendered rather than editable: the agreed figures live on the supplier item
 * and editing them here would put a second copy back. Formatted once, on the
 * way in, so every cell is a plain string the grid can show without a
 * per-column renderer.
 */
/* ============================================================
   THE SUPPLIER LIST

   One row per supplier of this product, main and alternative
   alike. Each row IS the `supplierItems` row on that partner —
   read from it on the way in, written back to it on save — so
   the product master and the Business Partner screen cannot say
   different things about the same MOQ.
   ============================================================ */

/**
 * Suppliers that may be offered, by CODE.
 *
 * The code and not the name: a name is spelled three ways across a seed and
 * matching on one is what left purchase history unable to find its own
 * supplier. The name is beside it, computed, so nobody has to recognise
 * BP000121 by sight.
 */
const supplierCodes = () => BUSINESS_PARTNERS.filter(isSupplierRole).map((bp) => bp.code);

const supplierNameOf = (code: string) => {
  const bp = BUSINESS_PARTNERS.find((b) => b.code === code);
  return bp ? bp.nameTh || bp.nameEn : "";
};

/**
 * The price in the unit the warehouse counts.
 *
 * The only figure that compares across suppliers: one quotes by the Carton of
 * 24 and the next by the Tube, and the two per-purchase-unit prices are not
 * the same measurement.
 */
const rowCostPerBase = (r: { price?: unknown; punitFactor?: unknown }) => {
  const factor = num(r.punitFactor) > 0 ? num(r.punitFactor) : 1;
  return Math.round((num(r.price) / factor) * 100) / 100;
};

/** The ticked row, or the only row when nobody has ticked one yet. */
const mainRow = (s: FormState): GridRow | null => {
  const rows = (s.suppliers ?? []) as GridRow[];
  return rows.find((r) => r.main) ?? (rows.length === 1 ? rows[0] : null);
};

/** The partner rows for this product, flattened into the grid's shape. */
const supplierRows = (code: string): GridRow[] =>
  supplierOffers(code).map((o) => {
    const bp = BUSINESS_PARTNERS.find((b) => b.code === o.partner);
    const row = (bp?.supplierItems ?? []).find((i) => i.product === code);
    return {
      main: o.preferred,
      supplierCode: o.partner,
      supplierName: o.partnerName,
      sku: o.sku,
      punit: o.punit,
      punitFactor: o.punitFactor,
      price: o.price,
      moq: o.moq,
      lead: o.lead,
      warranty: row?.warranty ?? "",
      country: row?.country ?? "",
      status: o.status || "Active",
    };
  });

export const PRODUCT_FORM: FormSchema<ProductRow> = {
  key: "product",
  entityLabel: "Product",
  titleField: "name",
  saveButton: "Save Product",
  statusBadge: { Active: "success", Draft: "warning", Inactive: "neutral" },

  blank: () => ({
    _mode: "create",
    icon: "",
    code: "",
    barcode: "",
    name: "",
    nameTh: "",
    nameEn: "",
    nameLang: "th",
    cat: "",
    brand: "",
    series: "",
    status: "Draft",
    demoAllowed: false,
    desc: "",
    cls: { devClass: "", storage: "" },
    unit: "",
    weight: "",
    dim: "",
    units: [],
    pricing: {
      currency: "THB",
      /* The one cost a person states. `lastCost` and `avgCost` are written by
         receipts, so a blank form has nothing to say about them. */
      supplierCost: "",
      vat: "VAT 7% (exclusive)",
    },
    lowLevel: 0,
    /* One row per supplier of this product — see the note on the section. */
    suppliers: [],
    warehouses: [],
    stocks: [],
    supplier: "",
    sup: {
      code: "",
      itemCode: "",
      punit: "",
      punitFactor: 1,
      moq: "",
      lead: "",
      lastPrice: "",
      warranty: "",
      country: "ประเทศไทย",
    },
    altSuppliers: [],
    reg: { no: "", status: "Pending", issue: "", expiry: "", custWarranty: "" },
  }),

  toState: (p) => {
    /*
       `name` predates the choice, so an edit has to work out which box it
       came from. An exact match with the English name means English;
       anything else counts as Thai, and a record whose Thai box was never
       filled in takes the old name rather than losing it.
    */
    const nameEn = String(p.nameEn ?? "").trim();
    const fromEn = Boolean(nameEn) && p.name.trim() === nameEn;

    return {
      _mode: "edit",
      icon: p.icon,
      code: p.code,
      barcode: p.barcode,
      name: p.name,
      nameTh: fromEn ? p.nameTh : String(p.nameTh ?? "").trim() || p.name,
      nameEn,
      nameLang: fromEn ? "en" : "th",
      cat: p.cat,
      brand: p.brand,
      series: p.series,
      status: p.status,
      demoAllowed: p.demoAllowed,
      desc: p.desc,
      cls: { ...p.detail.cls },
      unit: p.unit,
      weight: p.weight,
      dim: p.dim,
      units: p.detail.units.filter((u) => u.type !== "Base Unit").map((u) => ({ ...u })),
      pricing: {
        currency: p.pricing.currency,
        supplierCost: p.pricing.supplierCost,
        vat: p.pricing.vat,
      },
      lowLevel: p.lowLevel,
      suppliers: supplierRows(p.code),
      warehouses: (p.warehouses ?? []).map((w) => ({ ...w })),
      stocks: p.stocks.map((s) => ({ ...s, exp: dmyToIso(s.exp) })),
      supplier: p.supplier,
      sup: { ...p.sup },
      altSuppliers: p.altSuppliers.map((a) => ({ ...a })),
      reg: {
        no: p.reg.no,
        status: p.reg.status,
        issue: dmyToIso(p.reg.issue),
        expiry: dmyToIso(p.reg.expiry),
        custWarranty: p.reg.custWarranty,
      },
    };
  },

  steps: [
    /* ---------- 1. GENERAL ---------- */
    {
      key: "general",
      label: "General",
      railLabel: "ข้อมูลทั่วไป",
      labelTh: "รหัส ชื่อ หมวดหมู่ และการจัดประเภท",
      blocks: () => [
        {
          type: "card",
          title: "Identity",
          cols: "2",
          fields: [
            {
              type: "photo",
              path: "icon",
              label: "Product Image",
              icon: "product",
              span: true,
            },
            {
              type: "text",
              path: "code",
              label: "Product Code",
              required: true,
              placeholder: "AB-AC-PU40-2ML",
              hint: "รหัสสินค้าใช้เป็นกุญแจหลัก แก้ไขไม่ได้หลังบันทึก",
              when: isCreate,
            },
            {
              type: "static",
              path: "code",
              label: "Product Code",
              when: (s) => !isCreate(s),
            },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: opts(OPT.status),
            },
            {
              type: "text",
              path: "nameTh",
              label: "ชื่อภาษาไทย",
              placeholder: "เอ-เฟล็กซ์ ซีลแลนท์ พียู40 2 มล.",
            },
            {
              type: "text",
              path: "nameEn",
              label: "English Name",
              placeholder: "A-FLEX Sealant PU40 2ml",
            },
            {
              type: "radio",
              path: "nameLang",
              label: "ใช้ชื่อใดเป็นชื่อสินค้า",
              options: NAME_LANG,
              hint: "ชื่อที่เลือกคือชื่อที่ขึ้นในรายการสินค้าและบนเอกสารทุกใบ",
            },
            {
              type: "static",
              label: "Product Name",
              value: (s) => productName(s) || "—",
            },
            {
              type: "textarea",
              path: "desc",
              label: "Description",
              span: true,
              rows: 3,
            },
          ],
        },
        {
          type: "card",
          title: "Grouping & Classification",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "cat",
              label: "Category",
              required: true,
              options: opts(OPT.category),
            },
            {
              type: "select",
              path: "brand",
              label: "Brand",
              required: true,
              options: opts(OPT.brand),
            },
            { type: "select", path: "series", label: "Series", options: opts(OPT.series) },
            {
              type: "select",
              path: "cls.devClass",
              label: "Medical Device Class",
              options: opts(OPT.devClass),
            },
            {
              type: "select",
              path: "cls.storage",
              label: "Storage Condition",
              options: opts(OPT.storage),
            },
            /*
               Not "this is a demo product" — every product in the master is a
               normal product. The switch says whether this one MAY go out as
               a demo, which is a permission the sales side asks of it, not a
               kind of thing it is. Read the old way it also implied a stock
               of demo units that does not exist.
            */
            {
              type: "toggle",
              path: "demoAllowed",
              label: "Demo Allowed",
              onText: "เบิกเป็นสินค้า Demo ได้",
              offText: "เบิกเป็นสินค้า Demo ไม่ได้",
            },
          ],
        },
      ],
    },

    /* ---------- 2. UNITS & BARCODE ---------- */
    {
      key: "units",
      label: "Units & Barcode",
      railLabel: "หน่วยนับ",
      labelTh: "หน่วยนับและบาร์โค้ด",
      blocks: (s) => [
        {
          type: "card",
          title: "Stock Unit",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "unit",
              label: "Base Unit",
              required: true,
              options: opts(OPT.unit),
              hint: "หน่วยต่ำสุดที่คลังนับ — ยอดคงเหลือทุกที่อยู่ในหน่วยนี้",
            },
            { type: "text", path: "weight", label: "Weight", placeholder: "12 g" },
            { type: "text", path: "dim", label: "Dimension", placeholder: "22 × 22 × 88 mm" },
            {
              type: "text",
              path: "barcode",
              label: "Primary Barcode",
              placeholder: "8850001234567",
              span: true,
            },
          ],
        },
        {
          type: "grid",
          path: "units",
          label: "Alternative Units",
          addLabel: "เพิ่มหน่วยนับ",
          empty: "มีเฉพาะหน่วยนับหลัก",
          hint: "หน่วยขายหรือหน่วยซื้อที่แปลงกลับเป็นหน่วยหลักได้ · หน่วยซื้อของผู้ขายแต่ละรายกำหนดที่ Business Partner → Supplier Items",
          cols: [
            { key: "unit", label: "Unit", type: "select", options: opts(OPT.unit), required: true },
            { key: "type", label: "Unit Type", type: "select", options: opts(OPT.unitType) },
            /*
               A number, not the sentence it used to be.

               "1 Box = 12 Tube" read perfectly and computed not at all, so a
               sale of one Box could not decrement the twelve tubes it holds.
               The typed value is the count of base units; the sentence is
               rebuilt beside it, from the number, so nothing can drift.
            */
            {
              key: "factor",
              label: `จำนวน ${String(s.unit || "หน่วยหลัก")} ต่อ 1 หน่วย`,
              type: "number",
              align: "right",
              required: true,
              width: "150px",
            },
            {
              key: "conv",
              label: "Conversion",
              type: "computed",
              muted: true,
              width: "170px",
              get: (r) =>
                r.unit
                  ? conversionText(String(s.unit ?? ""), String(r.unit), num(r.factor))
                  : "—",
            },
            { key: "barcode", label: "Barcode", type: "text", placeholder: "8850001234570" },
            { key: "active", label: "Active", type: "check", align: "right", width: "70px" },
          ],
        },
      ],
    },

    /* ---------- 3. COST & SUPPLIER ----------

       One section, because they were one subject split across two.

       "Cost" carried Latest Purchase Price and a table of every supplier's
       price; "Supplier" carried Latest Purchase Price again, plus that same
       supplier's unit, MOQ and lead time as six read-only boxes. Both were
       renderings of the same `supplierItems` row — the second one just
       showed a single supplier instead of all of them, and repeated four
       fields the table beside it already had columns for.

       Read in the order the answers arrive: pick the supplier, and the
       currency, tax and cost that follow are that supplier's terms. The
       three figures that used to lead — Latest Purchase Price, Moving
       Average Cost, the cheapest offer — are all written by what happened
       rather than typed, and they move with every exchange rate, discount
       and receipt. A form is where a person states an agreement; those
       belong on the read screen, which is where they still are. */
    {
      key: "supply",
      label: "Cost & Supplier",
      railLabel: "ต้นทุนและผู้ขาย",
      labelTh: "ผู้ขายหลักและต้นทุนที่ตกลงไว้",
      blocks: (s) => {
        const baseUnit = String(s.unit || "หน่วยหลัก");

        return [
          /* ---- ONE FRAME, ONE ROW PER SUPPLIER ----

             The main supplier and the alternatives are the same thing filled
             in the same way, so they are one list with a tick rather than a
             card and a table that ask for different fields. Whoever is ticked
             is the default on a purchase order; everybody else is a second
             source, on identical terms.

             What is edited here is the supplier item on the PARTNER, not a
             copy of it — the product master is the door, the partner is the
             room. Two doors, one set of numbers: change the MOQ here and the
             Business Partner screen shows the change, because it is the same
             row. */
          {
            type: "card",
            title: "ผู้ขายและต้นทุน",
            cols: "3",
            fields: [
              {
                type: "select",
                path: "pricing.currency",
                label: "Currency",
                required: true,
                options: opts(OPT.currency),
              },
              { type: "select", path: "pricing.vat", label: "VAT", options: opts(OPT.vat) },
              {
                type: "secure",
                as: "static",
                permission: "canViewCost",
                label: `ต้นทุนที่ตกลงไว้ / ${baseUnit}`,
                /* Read, not typed: it IS the ticked supplier's price converted
                   to the stock unit. Typing a second figure beside the row it
                   comes from is how the two start disagreeing. */
                value: (st) => {
                  const row = mainRow(st);
                  return row
                    ? `${money(rowCostPerBase(row))} / ${baseUnit} · ${row.supplierName || row.supplierCode}`
                    : "ยังไม่ได้ติ๊กผู้ขายหลัก";
                },
                hint: "มาจากผู้ขายที่ติ๊กว่าเป็นผู้ขายหลัก · ต้นทุนจริงมาจากใบรับสินค้า",
              },
              {
                type: "grid",
                path: "suppliers",
                label: "รายชื่อผู้ขายสินค้านี้",
                addLabel: "เพิ่มผู้ขายทางเลือก",
                empty: "ยังไม่มีผู้ขายสินค้านี้ — เพิ่มอย่างน้อย 1 ราย แล้วติ๊กว่าเป็นผู้ขายหลัก",
                layout: "stacked",
                rowLabel: "ผู้ขาย",
                span: true,
                hint: `ติ๊ก "ผู้ขายหลัก" ได้รายเดียว ที่เหลือคือผู้ขายทางเลือก · ผู้ขายแต่ละรายเสนอราคาในหน่วยของตัวเอง ช่อง "ต้นทุนต่อ ${baseUnit}" แปลงกลับให้แล้ว จึงเป็นช่องเดียวที่เทียบข้ามผู้ขายได้`,
                cols: [
                  {
                    key: "main",
                    label: "ผู้ขายหลัก",
                    type: "radio",
                    align: "right",
                    width: "110px",
                  },
                  {
                    key: "supplierCode",
                    label: "Supplier Code",
                    type: "select",
                    options: supplierCodes(),
                    required: true,
                    width: "150px",
                  },
                  {
                    key: "supplierName",
                    label: "Supplier Name",
                    type: "computed",
                    muted: true,
                    width: "200px",
                    get: (r) => supplierNameOf(String(r.supplierCode ?? "")) || DASH,
                  },
                  { key: "sku", label: "Vendor Code", type: "text", width: "140px" },
                  { key: "punit", label: "Purchase Unit", type: "text", width: "120px" },
                  {
                    key: "punitFactor",
                    label: `${baseUnit} ต่อ 1 หน่วยซื้อ`,
                    type: "number",
                    align: "right",
                    width: "150px",
                  },
                  {
                    key: "price",
                    label: "ราคาต่อหน่วยซื้อ",
                    type: "number",
                    align: "right",
                    width: "130px",
                  },
                  {
                    key: "costPerBase",
                    label: `ต้นทุนต่อ ${baseUnit}`,
                    type: "computed",
                    align: "right",
                    width: "130px",
                    get: (r) => money(rowCostPerBase(r)),
                  },
                  { key: "moq", label: "MOQ (หน่วยซื้อ)", type: "number", align: "right", width: "130px" },
                  { key: "lead", label: "Lead Time (วัน)", type: "number", align: "right", width: "130px" },
                  { key: "warranty", label: "Supplier Warranty", type: "text", width: "140px" },
                  {
                    key: "country",
                    label: "Country",
                    type: "select",
                    options: [...OPT.country],
                    width: "140px",
                  },
                  {
                    key: "status",
                    label: "Status",
                    type: "select",
                    options: ["Active", "Inactive"],
                    width: "120px",
                  },
                ],
              },
            ],
          },

          {
            type: "note",
            label: "ราคาขายไม่ได้อยู่ที่นี่",
            text: `ราคาขายของสินค้านี้ตั้งที่ Product Pricing — หนึ่งบรรทัดต่อรายการราคาและต่อหน่วยขาย ราคาตามแคตตาล็อกตอนนี้คือ ${
              catalogPrice(String(s.code ?? "")) > 0
                ? `${money(catalogPrice(String(s.code ?? "")))} / ${baseUnit}`
                : "ยังไม่ได้ตั้ง"
            }`,
          },
        ];
      },
    },

    /* ---------- 4. STOCK ---------- */
    {
      key: "stock",
      label: "Stock",
      railLabel: "คลังสินค้า",
      labelTh: "จุดสั่งซื้อและคลัง",
      blocks: (s) => [
        {
          type: "card",
          title: "Replenishment",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "lowLevel",
              label: "Reorder Point (ค่าตั้งต้น)",
              required: true,
              min: 0,
              hint: "ใช้กับคลังที่ยังไม่ได้ตั้งจุดสั่งซื้อของตัวเอง",
            },
            {
              type: "static",
              label: "Suggested Target",
              value: (st) => `${Math.round(num(st.lowLevel) * 1.5)} ${st.unit ?? ""}`,
              hint: "1.5 เท่าของจุดสั่งซื้อ",
            },
          ],
        },

        /* ---- Policy: which warehouses may hold this at all ----

           Separate grid from the balances below, because they answer
           different questions. This one can be filled in before a single
           unit exists, which is what a purchase order needs in order to
           know where to deliver. */
        {
          type: "grid",
          path: "warehouses",
          label: "คลังที่เก็บสินค้านี้ได้",
          addLabel: "เพิ่มคลัง",
          empty: "ยังไม่ได้กำหนดคลัง — สินค้าจะยังรับเข้าไม่ได้",
          hint: "จุดสั่งซื้อรายคลังใช้แทนค่าตั้งต้นด้านบน · คลังบริการกับคลังหลักไม่ควรใช้ตัวเลขเดียวกัน",
          cols: [
            { key: "wh", label: "Warehouse", type: "select", options: whOptions(), required: true },
            { key: "bin", label: "Default Bin", type: "text", placeholder: "A-01-02" },
            { key: "rop", label: "Reorder Point", type: "number", align: "right" },
            { key: "maxQty", label: "Max Qty", type: "number", align: "right" },
            {
              key: "warn",
              label: "เงื่อนไขการเก็บ",
              type: "computed",
              muted: true,
              /* Both facts already exist — the product states a storage
                 condition and the warehouse states a temperature. Nothing
                 compared them, so a 2–8 °C item could be assigned to an
                 ambient store and only the box would know. */
              get: (r) => storageWarning(String(s.cls?.storage ?? ""), String(r.wh ?? "")) || "—",
            },
            { key: "defaultReceiving", label: "รับเข้า", type: "radio", align: "right", width: "80px" },
            { key: "defaultIssuing", label: "จ่ายออก", type: "radio", align: "right", width: "80px" },
          ],
        },

        /* ---- Balances: what is actually there ---- */
        {
          type: "grid",
          path: "stocks",
          label: "ยอดคงเหลือตามคลัง",
          addLabel: "เพิ่มยอดคงเหลือ",
          empty: "ยังไม่มียอดคงเหลือ",
          hint: "ยอดจริงมาจากการรับเข้า-จ่ายออก แก้ที่นี่เฉพาะตอนตั้งต้นระบบ",
          cols: [
            { key: "wh", label: "Warehouse", type: "select", options: whOptions(), required: true },
            { key: "loc", label: "Location", type: "text", placeholder: "A-01-02" },
            { key: "avail", label: "Available", type: "number", align: "right" },
            { key: "res", label: "Reserved", type: "number", align: "right", muted: true },
            { key: "lot", label: "Lot", type: "text" },
            { key: "exp", label: "Expiry", type: "date" },
          ],
        },
      ],
    },

    /* ---------- 5. REGISTRATION ---------- */
    {
      key: "registration",
      label: "Registration",
      railLabel: "ทะเบียนและรับประกัน",
      labelTh: "อย. และการรับประกัน",
      blocks: () => [
        {
          type: "card",
          title: "Product Registration",
          cols: "2",
          fields: [
            {
              type: "text",
              path: "reg.no",
              label: "Registration Number",
              placeholder: "อยู่ระหว่างยื่นคำขอ",
            },
            {
              type: "select",
              path: "reg.status",
              label: "Registration Status",
              options: opts(OPT.regStatus),
            },
            { type: "date", path: "reg.issue", label: "Issue Date" },
            { type: "date", path: "reg.expiry", label: "Expiry Date" },
          ],
        },
        {
          type: "card",
          title: "Warranty",
          cols: "2",
          fields: [
            {
              type: "text",
              path: "reg.custWarranty",
              label: "Customer Warranty",
              placeholder: "12 เดือน",
            },
          ],
        },
      ],
    },

    {
      key: "review",
      label: "Review",
      railLabel: "ตรวจทาน",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "code", label: "Product Code", step: "general" },
    /*
       Only the box the product is actually named from. Demanding both would
       block a product that genuinely has one name, and demanding neither
       would let one through with no name at all — which is what `name` being
       its own field used to allow.
    */
    {
      path: "nameTh",
      label: "ชื่อภาษาไทย",
      step: "general",
      test: (s) => s.nameLang === "en" || Boolean(String(s.nameTh ?? "").trim()),
    },
    {
      path: "nameEn",
      label: "English Name",
      step: "general",
      test: (s) => s.nameLang !== "en" || Boolean(String(s.nameEn ?? "").trim()),
    },
    { path: "status", label: "Status", step: "general" },
    { path: "cat", label: "Category", step: "general" },
    { path: "brand", label: "Brand", step: "general" },
    { path: "unit", label: "Base Unit", step: "units" },
    { path: "pricing.currency", label: "Currency", step: "supply" },
    { path: "lowLevel", label: "Reorder Point", step: "stock" },
  ],

  rules: [
    {
      label: "รหัสสินค้าต้องไม่ซ้ำกับสินค้าที่มีอยู่",
      step: "general",
      test: (s) =>
        !isCreate(s) || !PRODUCTS.some((p) => p.code === String(s.code ?? "").trim()),
    },
    {
      label: "บาร์โค้ดต้องไม่ซ้ำกับสินค้าอื่น",
      step: "units",
      test: (s) => {
        const bc = String(s.barcode ?? "").trim();
        return !bc || !PRODUCTS.some((p) => p.barcode === bc && p.code !== s.code);
      },
    },
    /*
       The three selling-price rules left with the prices they guarded.
       "must be above cost" and "dealer must not exceed standard" are checks
       on a price list line, not on an item — they are enforced where the
       price is now set, against the line being edited, rather than here
       against a field that no longer exists.
    */
  ],

  /*
     The two name boxes and the language choice all feed one field, so keep it
     in step here rather than only at save. The list column, the form title and
     the duplicate check all read `name`, and each of them would otherwise be a
     keystroke behind what the form shows.
  */
  onChange: (path, s) => {
    if (path === "nameTh" || path === "nameEn" || path === "nameLang") {
      s.name = productName(s);
    }

    /* No supplier prefill any more. It filled a cost box from the standing
       offer; the cost box IS the standing offer now — one row, typed once. */
  },

  newRow: (path, isFirst) => {
    switch (path) {
      case "suppliers":
        /* The first supplier a product gets is its main one — there is
           nothing else for it to be. Ticking a later row moves it. */
        return {
          main: isFirst,
          supplierCode: "",
          sku: "",
          punit: "",
          punitFactor: 1,
          price: 0,
          moq: 0,
          lead: 0,
          warranty: "",
          country: "ประเทศไทย",
          status: "Active",
        };
      case "units":
        return { unit: "", type: SALES_UNIT, factor: 1, barcode: "", active: true };
      case "stocks":
        return { wh: "", loc: "", avail: 0, res: 0, lot: "", exp: "" };
      case "warehouses":
        return {
          wh: "",
          bin: "",
          rop: 0,
          maxQty: 0,
          /* The first warehouse cleared for a product is where its goods land
             until somebody says otherwise. */
          defaultReceiving: isFirst,
          defaultIssuing: isFirst,
          status: "Active",
        };
      default:
        return {};
    }
  },

  findDuplicates: (s) => {
    const name = String(s.name ?? "").trim().toLowerCase();
    const bc = String(s.barcode ?? "").trim();
    if (name.length < 4 && !bc) return [];
    return PRODUCTS.filter(
      (p) =>
        p.code !== s.code &&
        ((bc && p.barcode === bc) || (name.length >= 4 && p.name.toLowerCase() === name)),
    )
      .slice(0, 4)
      .map((p) => ({
        code: p.code,
        name: p.name,
        why: p.barcode === bc ? "บาร์โค้ดซ้ำ" : "ชื่อสินค้าซ้ำ",
      }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("product", code),

  /*
     No preview card and no insight rail.

     Both restated what the form already showed — the code, the name and the
     price were on screen a few centimetres to the left, and the gross margin
     is a computed field inside the Cost card where the two numbers it comes
     from are typed. A rail that repeats the page costs a third of the width
     and tells the person filling it in nothing they did not just write.
  */

  reviewCards: (s, row) => (
    <>
      <ReviewCard title="General">
        {row("Product Code", s.code, "general")}
        {row("Product Name", productName(s), "general")}
        {row("Category", s.cat, "general")}
        {row("Brand", s.brand, "general")}
        {row("Status", s.status, "general")}
        {row("Storage Condition", s.cls?.storage, "general")}
      </ReviewCard>
      <ReviewCard title="Units & Barcode">
        {row("Base Unit", s.unit, "units")}
        {row("Alternative Units", s.units, "units")}
        {row("Primary Barcode", s.barcode, "units")}
      </ReviewCard>
      <ReviewCard title="Price & Stock">
        {row("Currency", s.pricing?.currency, "supply")}
        {row("VAT", s.pricing?.vat, "supply")}
        {row("Reorder Point", s.lowLevel, "stock")}
        {row("Warehouse Assignment", s.stocks, "stock")}
      </ReviewCard>
      <ReviewCard title="Supplier">
        {row("Main Supplier", s.supplier, "supply")}
        {row("ต้นทุนที่ตกลงไว้", s.pricing?.supplierCost, "supply")}
        {row("Supplier Warranty", s.sup?.warranty, "supply")}
        {row("Country", s.sup?.country, "supply")}
      </ReviewCard>
      <ReviewCard title="Registration">
        {row("Registration Number", s.reg?.no, "registration")}
        {row("Registration Status", s.reg?.status, "registration")}
        {row("Expiry Date", isoToDmy(s.reg?.expiry), "registration")}
      </ReviewCard>
    </>
  ),

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PRODUCTS.find((p) => p.code === code);

    /* The agreed cost is the only figure this form writes. What was actually
       paid — the last receipt, the moving average, and the date that cost
       took effect — is written by goods receipts, so an existing record keeps
       its own rather than having them overwritten by whatever the draft
       happened to hold. */
    const pricing = {
      currency: String(s.pricing?.currency ?? "THB"),
      supplierCost: num(s.pricing?.supplierCost),
      lastCost: existing?.pricing.lastCost ?? 0,
      avgCost: existing?.pricing.avgCost ?? 0,
      vat: String(s.pricing?.vat ?? ""),
      effective: existing?.pricing.effective ?? "",
    };

    const stocks = ((s.stocks ?? []) as GridRow[]).map((r) => ({
      wh: String(r.wh ?? ""),
      loc: String(r.loc ?? ""),
      avail: num(r.avail),
      res: num(r.res),
      lot: String(r.lot ?? ""),
      exp: isoToDmy(r.exp),
    }));

    const patch = {
      icon: String(s.icon ?? ""),
      barcode: String(s.barcode ?? ""),
      /* Derived here as well as in onChange: a restored draft written before
         the choice existed reaches save without ever firing a change. */
      name: productName(s),
      nameTh: String(s.nameTh ?? "").trim(),
      nameEn: String(s.nameEn ?? "").trim(),
      cat: String(s.cat ?? ""),
      brand: String(s.brand ?? ""),
      series: String(s.series ?? ""),
      unit: String(s.unit ?? ""),
      weight: String(s.weight ?? ""),
      dim: String(s.dim ?? ""),
      demoAllowed: Boolean(s.demoAllowed),
      lowLevel: num(s.lowLevel),
      status: String(s.status ?? "Draft"),
      desc: String(s.desc ?? ""),
      supplier: String(s.supplier ?? ""),
      pricing,
      stocks,
      warehouses: ((s.warehouses ?? []) as GridRow[]).map((w) => ({
        wh: String(w.wh ?? ""),
        bin: String(w.bin ?? ""),
        /* 0 means "use the product default", which is what an untouched row
           honestly says — not "reorder when it hits nothing". */
        rop: num(w.rop),
        maxQty: num(w.maxQty),
        defaultReceiving: Boolean(w.defaultReceiving),
        defaultIssuing: Boolean(w.defaultIssuing),
        status: String(w.status ?? "Active"),
      })),
      onHand: stocks.reduce((t, r) => t + r.avail + r.res, 0),
      reserved: stocks.reduce((t, r) => t + r.res, 0),
      sup: {
        code: String(s.sup?.code ?? ""),
        itemCode: String(s.sup?.itemCode ?? ""),
        lead: String(s.sup?.lead ?? ""),
        moq: String(s.sup?.moq ?? ""),
        punit: String(s.sup?.punit ?? ""),
        /* Read-only on this form: the buying terms belong to the supplier
           item, and syncProductSupplyView writes this view from that row. */
        punitFactor: Math.max(1, num(s.sup?.punitFactor)),
        lastPrice: String(s.sup?.lastPrice ?? ""),
        warranty: String(s.sup?.warranty ?? ""),
        country: String(s.sup?.country ?? ""),
      },
      altSuppliers: ((s.altSuppliers ?? []) as GridRow[]).map((a) => ({
        name: String(a.name ?? ""),
        code: String(a.code ?? ""),
        lead: String(a.lead ?? ""),
        price: String(a.price ?? ""),
      })),
      reg: {
        no: String(s.reg?.no ?? ""),
        status: String(s.reg?.status ?? "Pending"),
        issue: isoToDmy(s.reg?.issue),
        expiry: isoToDmy(s.reg?.expiry),
        warranty: String(s.sup?.warranty ?? ""),
        custWarranty: String(s.reg?.custWarranty ?? ""),
        docs: existing?.reg.docs ?? [],
      },
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Product updated",
        d: "แก้ไขข้อมูลสินค้าจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      const fresh: Product = {
        code,
        ...patch,
        stock: patch.onHand,
        onOrder: 0,
        expiry: patch.reg.expiry,
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Product created",
            d: "สร้างสินค้าเข้าระบบจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      };
      PRODUCTS.push(fresh as ProductRow);
    }

    /* ---- The supplier list goes back where it came from ----

       Each row is a `supplierItems` row on a partner, so saving writes it
       there rather than onto the product: one set of numbers, reachable from
       two screens. A supplier dropped from the list loses its row for THIS
       product only — everything else that partner supplies is untouched. */
    const supplierRowsIn = ((s.suppliers ?? []) as GridRow[]).filter((r) =>
      String(r.supplierCode ?? "").trim(),
    );
    const listed = new Set(supplierRowsIn.map((r) => String(r.supplierCode).trim()));
    const prodName = String(s.name ?? "").trim() || code;

    for (const bp of BUSINESS_PARTNERS) {
      bp.supplierItems ??= [];
      const held = bp.supplierItems.findIndex((i) => i.product === code);

      if (!listed.has(bp.code)) {
        /* Was a supplier of this product and is not on the list any more. */
        if (held > -1) bp.supplierItems.splice(held, 1);
        continue;
      }

      const row = supplierRowsIn.find((r) => String(r.supplierCode).trim() === bp.code)!;
      const patch = {
        product: code,
        productName: prodName,
        sku: String(row.sku ?? ""),
        supName: bp.nameTh || bp.nameEn,
        punit: String(row.punit ?? ""),
        punitFactor: num(row.punitFactor) > 0 ? num(row.punitFactor) : 1,
        moq: num(row.moq),
        lead: num(row.lead),
        currency: String(s.pricing?.currency ?? "THB"),
        price: num(row.price),
        preferred: Boolean(row.main),
        status: String(row.status ?? "Active"),
        warranty: String(row.warranty ?? ""),
        country: String(row.country ?? ""),
      };

      if (held > -1) {
        /* Kept: effective and expiry are the partner screen's to set, and an
           edit made from the product side has no opinion about them. */
        Object.assign(bp.supplierItems[held], patch);
      } else {
        bp.supplierItems.push({ ...patch, effective: "", expiry: "" });
      }
    }

    /* The main row decides what the rest of the system calls "the supplier"
       of this product, and what it costs. Derived here rather than typed
       twice — see the read-only field on the form. */
    const main = supplierRowsIn.find((r) => r.main) ?? supplierRowsIn[0];
    const target = PRODUCTS.find((p) => p.code === code);
    if (target) {
      target.supplier = main ? supplierNameOf(String(main.supplierCode)) : "";
      target.sup = {
        ...target.sup,
        code: main ? String(main.supplierCode) : "",
        itemCode: main ? String(main.sku ?? "") : "",
        punit: main ? String(main.punit ?? "") : "",
        punitFactor: main && num(main.punitFactor) > 0 ? num(main.punitFactor) : 1,
        moq: main ? String(num(main.moq)) : "",
        lead: main ? String(num(main.lead)) : "",
        lastPrice: main ? String(num(main.price)) : "",
        warranty: main ? String(main.warranty ?? "") : "",
        country: main ? String(main.country ?? "") : "",
      };
      target.pricing.supplierCost = main ? rowCostPerBase(main) : 0;
    }

    decorateProducts();

    /* decorateProducts only rebuilds a detail payload for products that have
       none. These four collections are what the form owns, so write them back
       explicitly or an edit would silently not show on the detail screen. */
    const rec = PRODUCTS.find((p) => p.code === code);
    if (rec) {
      rec.detail.cls = {
        devClass: String(s.cls?.devClass ?? ""),
        storage: String(s.cls?.storage ?? ""),
      };
      rec.detail.units = [
        /* The stock unit is always the first row and always converts one for
           one — it is what the other factors are counted in. */
        {
          unit: patch.unit,
          type: BASE_UNIT,
          factor: 1,
          barcode: patch.barcode,
          active: true,
        },
        ...((s.units ?? []) as GridRow[]).map((u) => ({
          unit: String(u.unit ?? ""),
          type: String(u.type ?? SALES_UNIT),
          factor: Math.max(1, num(u.factor)),
          barcode: String(u.barcode ?? ""),
          active: Boolean(u.active),
        })),
      ];
      /* The volume ladder moved onto the price list line, where it belongs to
         one price rather than to the item. */
      rec.detail.regRows = patch.reg.no
        ? [
            {
              type: "Thai FDA",
              no: patch.reg.no,
              issue: patch.reg.issue,
              exp: patch.reg.expiry,
              status: patch.reg.status,
              doc: patch.reg.docs[0]?.name ?? "—",
            },
          ]
        : [];
    }

    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างสินค้าแล้ว",
      message: `${code} — ${patch.name}`,
      goto: `/m/product/${encodeURIComponent(code)}`,
    });
  },
};
