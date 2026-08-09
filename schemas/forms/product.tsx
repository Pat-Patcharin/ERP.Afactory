import type { Product } from "@/data/products";
import { OPT } from "@/data/options";
import { PRODUCTS, decorateProducts, type ProductRow } from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { marginPct, markupPct } from "@/lib/domain/pricing";
import { money, stamp, isoToDmy, dmyToIso } from "@/lib/format";
import { checkPermission } from "@/lib/permissions";
import type { FormSchema, GridRow } from "@/lib/types";
import { Badge } from "@/components/ui";
import {
  FORM_USER,
  RailCard,
  RailRow,
  ReviewCard,
  isCreate,
  opts,
  saved,
} from "./common";

/* ============================================================
   PRODUCT FORM — eight steps mirroring the eight detail tabs,
   so a user who knows the read screen already knows the form.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const whOptions = () => WAREHOUSES.map((w) => `${w.code} ${w.name}`);

export const PRODUCT_FORM: FormSchema<ProductRow> = {
  key: "product",
  entityLabel: "Product",
  titleField: "name",
  saveButton: "Save Product",
  statusBadge: { Active: "success", Draft: "warning", Inactive: "neutral" },

  blank: () => ({
    _mode: "create",
    icon: "📦",
    code: "",
    barcode: "",
    name: "",
    nameTh: "",
    nameEn: "",
    cat: "",
    brand: "",
    series: "",
    status: "Draft",
    demo: false,
    desc: "",
    cls: {
      ptype: "",
      devClass: "",
      storage: "",
      origin: "ประเทศไทย",
      maker: "",
      inv: true,
      buy: true,
      sell: true,
    },
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

  toState: (p) => ({
    _mode: "edit",
    icon: p.icon,
    code: p.code,
    barcode: p.barcode,
    name: p.name,
    nameTh: p.nameTh,
    nameEn: p.nameEn,
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
  }),

  steps: [
    /* ---------- 1. GENERAL ---------- */
    {
      key: "general",
      label: "General",
      railLabel: "ข้อมูลทั่วไป",
      labelTh: "รหัส ชื่อ และหมวดหมู่",
      blocks: () => [
        {
          type: "card",
          title: "Identity",
          cols: "2",
          fields: [
            { type: "image", path: "icon", label: "Product Image", span: true },
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
              path: "name",
              label: "Product Name",
              required: true,
              span: true,
              placeholder: "A-FLEX Sealant PU40 2ml",
            },
            { type: "text", path: "nameTh", label: "ชื่อภาษาไทย" },
            { type: "text", path: "nameEn", label: "English Name" },
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
          title: "Grouping",
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

    /* ---------- 2. CLASSIFICATION ---------- */
    {
      key: "classification",
      label: "Classification",
      railLabel: "การจัดประเภท",
      labelTh: "ประเภทและการจัดเก็บ",
      blocks: () => [
        {
          type: "card",
          title: "Product Classification",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "cls.ptype",
              label: "Product Type",
              required: true,
              options: opts(OPT.ptype),
            },
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
              type: "select",
              path: "cls.origin",
              label: "Country of Origin",
              options: opts(OPT.country),
            },
            {
              type: "text",
              path: "cls.maker",
              label: "Manufacturer",
              span: true,
              placeholder: "A-FLEX Co., Ltd.",
            },
          ],
        },
        {
          type: "card",
          title: "Transaction Roles",
          cols: "3",
          badge: <Badge tone="info">ใช้กำหนดว่าสินค้านี้เข้าเอกสารใดได้บ้าง</Badge>,
          fields: [
            {
              type: "toggle",
              path: "cls.inv",
              label: "Inventory Item",
              onText: "นับสต๊อก",
              offText: "ไม่นับสต๊อก",
            },
            {
              type: "toggle",
              path: "cls.buy",
              label: "Purchase Item",
              onText: "ซื้อได้",
              offText: "ซื้อไม่ได้",
            },
            {
              type: "toggle",
              path: "cls.sell",
              label: "Sales Item",
              onText: "ขายได้",
              offText: "ขายไม่ได้",
            },
          ],
        },
      ],
    },

    /* ---------- 3. UNITS & BARCODE ---------- */
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

    /* ---------- 4. PRICE ---------- */
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

    /* ---------- 5. STOCK ---------- */
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

    /* ---------- 6. SUPPLIER ---------- */
    {
      key: "supplier",
      label: "Supplier",
      railLabel: "ผู้ขายสินค้า",
      labelTh: "ผู้ขายหลักและเงื่อนไข",
      when: (s) => Boolean(s.cls?.buy),
      blocks: () => [
        {
          type: "note",
          label: "ขั้นตอนนี้แสดงเพราะสินค้านี้ตั้งเป็น Purchase Item",
          text: "ปิด Purchase Item ในขั้นตอน Classification หากสินค้านี้ไม่ได้สั่งซื้อจากภายนอก",
        },
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

    /* ---------- 7. REGISTRATION ---------- */
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
    { path: "name", label: "Product Name", step: "general" },
    { path: "status", label: "Status", step: "general" },
    { path: "cat", label: "Category", step: "general" },
    { path: "brand", label: "Brand", step: "general" },
    { path: "cls.ptype", label: "Product Type", step: "classification" },
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
    {
      label: "สินค้าที่ตั้งเป็น Purchase Item ต้องระบุผู้ขายสินค้าหลัก",
      step: "supplier",
      test: (s) => !s.cls?.buy || Boolean(String(s.supplier ?? "").trim()),
    },
  ],

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

  previewCard: (s) => (
    <div className="flex-1 rounded-card border border-line bg-card p-5 shadow-xs max-[1280px]:min-w-[280px]">
      <div className="mb-3 grid h-[110px] w-full place-items-center rounded-btn border border-line bg-surface text-[44px]">
        {String(s.icon ?? "📦")}
      </div>
      <p className="truncate text-[13px] font-semibold tnum">
        {String(s.code ?? "") || "รหัสสินค้าใหม่"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-cap text-ink-2">
        {String(s.name ?? "") || "ยังไม่ได้ตั้งชื่อสินค้า"}
      </p>
      <p className="mt-3 text-lg font-semibold tracking-[-0.02em] tnum">
        {num(s.price) ? money(s.price) : "—"}
        <span className="ml-1 text-cap font-normal text-ink-2">
          {String(s.pricing?.currency ?? "")}
        </span>
      </p>
    </div>
  ),

  sidePanel: (s) => {
    const cost = num(s.pricing?.lastCost);
    const price = num(s.price);
    const margin = cost && price ? marginPct(cost, price) : null;

    return (
      <RailCard icon="trend" title="Pricing Insight" tone={margin !== null && margin < 15 ? "warn" : "default"}>
        <RailRow label="ราคามาตรฐาน" value={price ? money(price) : "—"} />
        <RailRow
          label="ต้นทุนล่าสุด"
          value={checkPermission("canViewCost") ? (cost ? money(cost) : "—") : "••••"}
        />
        <RailRow
          label="กำไรขั้นต้น"
          value={margin === null ? "—" : `${margin}%`}
          tone={margin === null ? undefined : margin < 15 ? "warn" : "ok"}
        />
        <RailRow label="ราคาตัวแทน" value={num(s.pricing?.dealer) ? money(s.pricing.dealer) : "—"} />
        <RailRow label="จุดสั่งซื้อ" value={`${num(s.lowLevel)} ${String(s.unit ?? "")}`} />
        {margin !== null && margin < 15 && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            กำไรขั้นต้นต่ำกว่า 15% — ตรวจสอบราคาขายหรือเจรจาต้นทุนกับผู้ขายอีกครั้ง
          </p>
        )}
      </RailCard>
    );
  },

  reviewCards: (s, row) => (
    <>
      <ReviewCard title="General">
        {row("Product Code", s.code, "general")}
        {row("Product Name", s.name, "general")}
        {row("Category", s.cat, "general")}
        {row("Brand", s.brand, "general")}
        {row("Status", s.status, "general")}
      </ReviewCard>
      <ReviewCard title="Classification & Units">
        {row("Product Type", s.cls?.ptype, "classification")}
        {row("Storage Condition", s.cls?.storage, "classification")}
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
      {Boolean(s.cls?.buy) && (
        <ReviewCard title="Supplier">
          {row("Main Supplier", s.supplier, "supplier")}
          {row("Purchase Unit", s.sup?.punit, "supplier")}
          {row("Lead Time", s.sup?.lead, "supplier")}
        </ReviewCard>
      )}
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
      icon: String(s.icon ?? "📦"),
      barcode: String(s.barcode ?? ""),
      name: String(s.name ?? "").trim(),
      nameTh: String(s.nameTh ?? ""),
      nameEn: String(s.nameEn ?? ""),
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
        ptype: String(s.cls?.ptype ?? ""),
        devClass: String(s.cls?.devClass ?? ""),
        storage: String(s.cls?.storage ?? ""),
        origin: String(s.cls?.origin ?? ""),
        maker: String(s.cls?.maker ?? ""),
        inv: Boolean(s.cls?.inv),
        buy: Boolean(s.cls?.buy),
        sell: Boolean(s.cls?.sell),
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
