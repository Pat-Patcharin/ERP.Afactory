import type { Product } from "@/data/products";
import { OPT } from "@/data/options";
import { PRODUCTS, decorateProducts, type ProductRow } from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { marginPct, markupPct } from "@/lib/domain/pricing";
import { money, stamp, isoToDmy, dmyToIso } from "@/lib/format";
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
    demo: false,
    desc: "",
    cls: { devClass: "", storage: "" },
    unit: "",
    weight: "",
    dim: "",
    units: [],
    price: "",
    pricing: {
      currency: "THB",
      retail: "",
      dealer: "",
      gov: "",
      lastCost: "",
      avgCost: "",
      vat: "VAT 7% (exclusive)",
      effective: "",
    },
    tiers: [],
    lowLevel: 0,
    stocks: [],
    supplier: "",
    sup: {
      code: "",
      itemCode: "",
      punit: "",
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
      demo: p.demo,
      desc: p.desc,
      cls: { ...p.detail.cls },
      unit: p.unit,
      weight: p.weight,
      dim: p.dim,
      units: p.detail.units.filter((u) => u.type !== "Base Unit").map((u) => ({ ...u })),
      price: p.price,
      pricing: {
        currency: p.pricing.currency,
        retail: p.pricing.retail,
        dealer: p.pricing.dealer,
        gov: p.pricing.gov,
        lastCost: p.pricing.lastCost,
        avgCost: p.pricing.avgCost,
        vat: p.pricing.vat,
        effective: dmyToIso(p.pricing.effective),
      },
      tiers: p.detail.tiers.map((t) => ({ ...t })),
      lowLevel: p.lowLevel,
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
            {
              type: "toggle",
              path: "demo",
              label: "Demo Product",
              onText: "เป็นสินค้าตัวอย่าง",
              offText: "สินค้าปกติ",
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
      blocks: () => [
        {
          type: "card",
          title: "Base Unit",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "unit",
              label: "Base Unit",
              required: true,
              options: opts(OPT.unit),
              hint: "หน่วยที่ใช้นับสต๊อก",
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
          hint: "หน่วยขายหรือหน่วยซื้อที่แปลงกลับเป็นหน่วยหลักได้",
          cols: [
            { key: "unit", label: "Unit", type: "select", options: opts(OPT.unit), required: true },
            { key: "type", label: "Unit Type", type: "select", options: opts(OPT.unitType) },
            { key: "conv", label: "Conversion", type: "text", placeholder: "1 Box = 12 Tube" },
            { key: "barcode", label: "Barcode", type: "text", placeholder: "8850001234570" },
            { key: "active", label: "Active", type: "check", align: "right", width: "70px" },
          ],
        },
      ],
    },

    /* ---------- 3. PRICE ---------- */
    {
      key: "price",
      label: "Price",
      railLabel: "ราคา",
      labelTh: "ราคาขายและต้นทุน",
      blocks: (s) => [
        {
          type: "card",
          title: "Selling Price",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "price",
              label: "Standard Selling Price",
              required: true,
              min: 0,
              step: "0.01",
            },
            {
              type: "select",
              path: "pricing.currency",
              label: "Currency",
              required: true,
              options: opts(OPT.currency),
            },
            { type: "select", path: "pricing.vat", label: "VAT", options: opts(OPT.vat) },
            {
              type: "number",
              path: "pricing.dealer",
              label: "Dealer Price",
              min: 0,
              step: "0.01",
            },
            {
              type: "number",
              path: "pricing.gov",
              label: "Government Price",
              min: 0,
              step: "0.01",
            },
            { type: "date", path: "pricing.effective", label: "Price Effective Date" },
          ],
        },
        {
          type: "card",
          title: "Cost",
          cols: "3",
          fields: [
            {
              type: "secure",
              as: "number",
              permission: "canViewCost",
              path: "pricing.lastCost",
              label: "Latest Purchase Price",
              min: 0,
              step: "0.01",
            },
            {
              type: "secure",
              as: "number",
              permission: "canViewCost",
              path: "pricing.avgCost",
              label: "Moving Average Cost",
              min: 0,
              step: "0.01",
            },
            {
              type: "static",
              label: "Gross Margin",
              value: (s) => {
                const cost = num(s.pricing?.lastCost);
                const price = num(s.price);
                if (!cost || !price) return "—";
                return `${marginPct(cost, price)}% (markup ${markupPct(cost, price)}%)`;
              },
            },
          ],
        },
        {
          type: "grid",
          path: "tiers",
          label: "Tier Price",
          addLabel: "เพิ่มขั้นราคา",
          empty: "ไม่มีราคาขั้นบันได",
          hint: "เว้น Maximum Qty ว่างไว้สำหรับขั้นสูงสุด (ไม่จำกัด)",
          cols: [
            { key: "min", label: "Minimum Qty", type: "number", align: "right", required: true },
            { key: "max", label: "Maximum Qty", type: "number", align: "right" },
            { key: "price", label: "Unit Price", type: "number", align: "right", required: true },
            {
              key: "saving",
              label: "ส่วนต่างจากราคามาตรฐาน",
              type: "computed",
              align: "right",
              muted: true,
              /* blocks() closes over the draft, so the comparison reads the
                 live standard price without stashing a copy on every row. */
              get: (r) => {
                const std = num(s.price);
                const p = num(r.price);
                if (!std || !p) return "—";
                return `${(((std - p) / std) * 100).toFixed(1)}%`;
              },
            },
          ],
        },
      ],
    },

    /* ---------- 4. STOCK ---------- */
    {
      key: "stock",
      label: "Stock",
      railLabel: "คลังสินค้า",
      labelTh: "จุดสั่งซื้อและคลัง",
      blocks: () => [
        {
          type: "card",
          title: "Replenishment",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "lowLevel",
              label: "Reorder Point",
              required: true,
              min: 0,
              hint: "แจ้งเตือนเมื่อ Available ต่ำกว่าค่านี้",
            },
            {
              type: "static",
              label: "Suggested Target",
              value: (s) => `${Math.round(num(s.lowLevel) * 1.5)} ${s.unit ?? ""}`,
              hint: "1.5 เท่าของจุดสั่งซื้อ",
            },
          ],
        },
        {
          type: "grid",
          path: "stocks",
          label: "Warehouse Assignment",
          addLabel: "ผูกคลังสินค้า",
          empty: "ยังไม่ได้ผูกคลังสินค้า — สินค้าจะยังรับเข้าไม่ได้",
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

    /* ---------- 5. SUPPLIER ---------- */
    {
      key: "supplier",
      label: "Supplier",
      railLabel: "ผู้ขายสินค้า",
      labelTh: "ผู้ขายหลักและเงื่อนไข",
      blocks: () => [
        {
          type: "card",
          title: "Main Supplier",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "supplier",
              label: "Supplier",
              options: opts(OPT.supplier),
            },
            /*
               Read-only, and this is the point rather than a limitation.

               These five were text boxes, and the same five facts were also
               a row on the supplier's own record. Nothing kept the two in
               step and they had drifted: this product read "240 Tube / 21
               วัน" here while the supplier's row said 24 and 14. Whoever
               read one of them was wrong half the time.

               The purchase terms now have one home — the supplier item on
               the Business Partner, which is keyed by (partner, product),
               the grain these facts actually have. What shows here is that
               row, rendered. Editing it belongs where it lives, so the hint
               says so rather than the field silently discarding what
               somebody types.
            */
            { type: "static", path: "sup.code", label: "Supplier Code" },
            { type: "static", path: "sup.itemCode", label: "Supplier Item Code" },
            { type: "static", path: "sup.punit", label: "Purchase Unit" },
            {
              type: "static",
              path: "sup.moq",
              label: "MOQ",
              hint: "แก้ที่ Business Partner → ข้อมูลผู้ขาย → Supplier Items",
            },
            { type: "static", path: "sup.lead", label: "Lead Time" },
            {
              type: "secure",
              as: "static",
              permission: "canViewCost",
              path: "sup.lastPrice",
              label: "Latest Purchase Price",
            },
            { type: "text", path: "sup.warranty", label: "Supplier Warranty", placeholder: "12 เดือน" },
            {
              type: "select",
              path: "sup.country",
              label: "Country",
              options: opts(OPT.country),
            },
          ],
        },
        {
          type: "grid",
          path: "altSuppliers",
          label: "Alternative Suppliers",
          addLabel: "เพิ่มผู้ขายสำรอง",
          empty: "ยังไม่มีผู้ขายสินค้าสำรอง",
          cols: [
            { key: "name", label: "Supplier", type: "select", options: opts(OPT.supplier) },
            { key: "code", label: "Supplier Code", type: "text" },
            { key: "lead", label: "Lead Time", type: "text", placeholder: "21 วัน" },
            { key: "price", label: "Latest Price", type: "text", align: "right" },
          ],
        },
      ],
    },

    /* ---------- 6. REGISTRATION ---------- */
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
    { path: "price", label: "Standard Selling Price", step: "price" },
    { path: "pricing.currency", label: "Currency", step: "price" },
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
    {
      label: "ราคาขายต้องมากกว่า 0",
      step: "price",
      test: (s) => num(s.price) > 0,
    },
    {
      label: "ราคาตัวแทนจำหน่ายต้องไม่สูงกว่าราคามาตรฐาน",
      step: "price",
      test: (s) => !num(s.pricing?.dealer) || num(s.pricing.dealer) <= num(s.price),
    },
    {
      label: "ราคาขายต้องไม่ต่ำกว่าต้นทุนล่าสุด",
      step: "price",
      test: (s) =>
        !checkPermission("canViewCost") ||
        !num(s.pricing?.lastCost) ||
        num(s.price) >= num(s.pricing.lastCost),
    },
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
  },

  newRow: (path, isFirst) => {
    switch (path) {
      case "units":
        return { unit: "", type: "Sales Unit", conv: "", barcode: "", active: true };
      case "tiers":
        return { min: isFirst ? 1 : "", max: "", price: "" };
      case "stocks":
        return { wh: "", loc: "", avail: 0, res: 0, lot: "", exp: "" };
      case "altSuppliers":
        return { name: "", code: "", lead: "", price: "" };
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
        {row("Standard Selling Price", num(s.price) ? money(s.price) : "", "price")}
        {row("Currency", s.pricing?.currency, "price")}
        {row("Tier Price", s.tiers, "price")}
        {row("Reorder Point", s.lowLevel, "stock")}
        {row("Warehouse Assignment", s.stocks, "stock")}
      </ReviewCard>
      <ReviewCard title="Supplier">
        {row("Main Supplier", s.supplier, "supplier")}
        {row("Purchase Unit", s.sup?.punit, "supplier")}
        {row("Lead Time", s.sup?.lead, "supplier")}
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

    const pricing = {
      currency: String(s.pricing?.currency ?? "THB"),
      retail: num(s.price),
      dealer: num(s.pricing?.dealer),
      gov: num(s.pricing?.gov),
      lastCost: num(s.pricing?.lastCost),
      avgCost: num(s.pricing?.avgCost),
      vat: String(s.pricing?.vat ?? ""),
      effective: isoToDmy(s.pricing?.effective),
      contract: existing?.pricing.contract ?? null,
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
      demo: Boolean(s.demo),
      price: num(s.price),
      lowLevel: num(s.lowLevel),
      status: String(s.status ?? "Draft"),
      desc: String(s.desc ?? ""),
      supplier: String(s.supplier ?? ""),
      pricing,
      stocks,
      onHand: stocks.reduce((t, r) => t + r.avail + r.res, 0),
      reserved: stocks.reduce((t, r) => t + r.res, 0),
      sup: {
        code: String(s.sup?.code ?? ""),
        itemCode: String(s.sup?.itemCode ?? ""),
        lead: String(s.sup?.lead ?? ""),
        moq: String(s.sup?.moq ?? ""),
        punit: String(s.sup?.punit ?? ""),
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
        {
          unit: patch.unit,
          type: "Base Unit",
          conv: `1 ${patch.unit}`,
          barcode: patch.barcode,
          active: true,
        },
        ...((s.units ?? []) as GridRow[]).map((u) => ({
          unit: String(u.unit ?? ""),
          type: String(u.type ?? "Sales Unit"),
          conv: String(u.conv ?? ""),
          barcode: String(u.barcode ?? ""),
          active: Boolean(u.active),
        })),
      ];
      rec.detail.tiers = ((s.tiers ?? []) as GridRow[]).map((t) => ({
        min: num(t.min),
        max: t.max === "" || t.max === null || t.max === undefined ? null : num(t.max),
        price: num(t.price),
      }));
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
