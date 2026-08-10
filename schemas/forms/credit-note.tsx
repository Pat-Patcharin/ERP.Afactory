import type { CreditNote } from "@/data/credit-notes";
import {
  CN_BRANCHES,
  CN_REASONS,
  CN_SALES_REPS,
  CN_SOURCE_TYPES,
  CN_TAX_CODES,
  CN_TAX_MODES,
  CN_TYPES,
} from "@/data/credit-notes";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { PRODUCTS } from "@/lib/domain/product";
import {
  CREDIT_NOTES,
  approvalTriggers,
  cnSourceOptions,
  creditTotals,
  creditableLinesFrom,
  decorateCreditNotes,
  headerFromCnSource,
  isOverCredit,
  lineAmount,
  netUnitPrice,
  nextCreditNoteCode,
  submitReadiness,
  type CnRow,
} from "@/lib/domain/credit-note";
import { fmt, money, money0, stamp, isoToDmy, dmyToIso, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, RailTotal, ReviewCard, opts, saved } from "./common";
import { catalogPrice } from "@/lib/domain/pricing";

/* ============================================================
   CREDIT NOTE FORM

   Create From Return and Create From Invoice are the same form:
   step 1 picks the source and pulls its creditable lines. Credit
   quantity can never exceed what the return approved.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isManual = (s: { sourceType?: string }) => s.sourceType === "Manual";

const draftTotals = (s: GridRow) =>
  creditTotals({
    items: (s.items ?? []) as GridRow[],
    taxMode: String(s.taxMode ?? "Tax Exclusive"),
    headerDisc: num(s.headerDisc),
    rounding: num(s.rounding),
  });

export const CN_FORM: FormSchema<CnRow> = {
  key: "credit-note",
  entityLabel: "Credit Note",
  saveButton: "Save Draft",
  titleField: "customer",
  statusBadge: {
    Draft: "neutral",
    "Pending Approval": "warning",
    Approved: "info",
    Issued: "success",
    Applied: "success",
    Cancelled: "neutral",
    Void: "danger",
  },

  /* Edit rules: Draft and Pending Approval only. */
  editGuard: (c) =>
    ["Draft", "Pending Approval"].includes(c.status)
      ? null
      : `${c.code} อยู่ในสถานะ ${c.status} — ` +
        (["Cancelled", "Void"].includes(c.status)
          ? "ใบลดหนี้ที่ยกเลิกหรือ Void แล้วเป็นเอกสารอ่านอย่างเดียว"
          : c.status === "Approved"
            ? "ใบที่อนุมัติแล้วต้องขอแก้ไข (Request Revision) ก่อนจึงจะแก้ได้"
            : "ใบลดหนี้ที่ออกหรือตัดเครดิตแล้วถูกล็อก แก้ไขได้ผ่านการ Void เท่านั้น"),

  blank: () => ({
    _mode: "create",
    code: nextCreditNoteCode(),
    creditDate: dmyToIso(today()),
    sourceType: "Sales Return",
    sourceDoc: "",
    returnRef: "",
    invoiceRef: "",
    soRef: "",
    customer: "",
    customerCode: "",
    customerGroup: "",
    taxId: "",
    address: "",
    contactPerson: "",
    phone: "",
    email: "",
    creditType: "Return",
    reason: "",
    salesRep: "",
    branch: "Head Office",
    currency: "THB",
    fx: 1,
    status: "Draft",
    approvalStatus: "Not Submitted",
    headerDisc: 0,
    taxMode: "Tax Exclusive",
    vatRate: 7,
    rounding: 0,
    appliedAmount: 0,
    originalAmount: 0,
    originalInvoiceDate: "",
    returnDate: "",
    note: "",
    items: [],
  }),

  toState: (c) => ({
    _mode: "edit",
    code: c.code,
    creditDate: dmyToIso(c.creditDate),
    sourceType: c.sourceType,
    sourceDoc: c.sourceDoc,
    returnRef: c.returnRef,
    invoiceRef: c.invoiceRef,
    soRef: c.soRef,
    customer: c.customer,
    customerCode: c.customerCode,
    customerGroup: c.customerGroup,
    taxId: c.taxId,
    address: c.address,
    contactPerson: c.contactPerson,
    phone: c.phone,
    email: c.email,
    creditType: c.creditType,
    reason: c.reason,
    salesRep: c.salesRep,
    branch: c.branch,
    currency: c.currency,
    fx: c.fx,
    status: c.status,
    approvalStatus: c.approvalStatus,
    headerDisc: c.headerDisc,
    taxMode: c.taxMode,
    vatRate: c.vatRate,
    rounding: c.rounding,
    appliedAmount: c.appliedAmount,
    originalAmount: c.originalAmount,
    originalInvoiceDate: c.originalInvoiceDate,
    returnDate: c.returnDate,
    note: c.note,
    items: (c.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. CREDIT NOTE INFORMATION ---------- */
    {
      key: "info",
      label: "Credit Note Information",
      railLabel: "Credit Note Information",
      labelTh: "ข้อมูลใบลดหนี้",
      blocks: () => [
        {
          type: "note",
          label: "ใบลดหนี้ปรับเฉพาะยอดเงิน ไม่กระทบสต๊อก",
          text: "สต๊อกถูกจัดการไปแล้วที่ Return Receiving → Return QC → Disposition — เอกสารนี้ลดยอดที่ลูกค้าต้องชำระเท่านั้น และยังไม่ลงบัญชีในเฟสนี้",
        },
        {
          type: "card",
          title: "Credit Note Information",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Credit Note Number" },
            { type: "date", path: "creditDate", label: "Credit Date", required: true },
            {
              type: "select",
              path: "creditType",
              label: "Credit Type",
              required: true,
              options: opts(CN_TYPES),
            },
            {
              type: "select",
              path: "reason",
              label: "Reason",
              required: true,
              options: opts(CN_REASONS),
            },
            { type: "select", path: "salesRep", label: "Sales Representative", options: opts(CN_SALES_REPS) },
            { type: "select", path: "branch", label: "Branch", required: true, options: opts(CN_BRANCHES) },
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            { type: "number", path: "fx", label: "Exchange Rate", min: 0, step: "0.0001", hint: "THB = 1" },
          ],
        },
      ],
    },

    /* ---------- 2. CUSTOMER ---------- */
    {
      key: "customer",
      label: "Customer",
      railLabel: "Customer",
      labelTh: "ลูกค้าและข้อมูลภาษี",
      blocks: () => [
        {
          type: "card",
          title: "Customer",
          cols: "3",
          fields: [
            { type: "text", path: "customer", label: "Customer Name", required: true },
            { type: "static", path: "customerCode", label: "Customer Code" },
            { type: "static", path: "customerGroup", label: "Customer Group" },
            { type: "text", path: "taxId", label: "Tax ID", required: true, placeholder: "0105559107221" },
            { type: "text", path: "contactPerson", label: "Contact Person" },
            { type: "text", path: "phone", label: "Phone" },
            { type: "text", path: "email", label: "Email" },
            { type: "textarea", path: "address", label: "Address", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 3. SOURCE DOCUMENT ---------- */
    {
      key: "source",
      label: "Source Document",
      railLabel: "Source Document",
      labelTh: "เอกสารต้นทาง",
      blocks: (s) => [
        {
          type: "card",
          title: "Create From Source",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "sourceType",
              label: "Source Type",
              required: true,
              options: opts(CN_SOURCE_TYPES),
              hint: "Sales Return ใช้จำนวนที่อนุมัติเป็นเพดาน · Sales Invoice ใช้ปรับราคา · Manual ต้องผ่านการอนุมัติ",
            },
            {
              type: "select",
              path: "sourceDoc",
              label: "Source Document",
              required: true,
              options: cnSourceOptions(String(s.sourceType ?? ""), String(s.code ?? "")).map((o) => o.code),
              when: (st) => !isManual(st),
              hint: "เลือกเอกสารแล้วระบบจะดึงลูกค้า รายการ ราคา และภาษีมาให้",
            },
            { type: "static", path: "returnRef", label: "Return Number" },
            { type: "static", path: "invoiceRef", label: "Invoice Number" },
            { type: "static", path: "soRef", label: "Sales Order" },
            {
              type: "static",
              label: "Source Summary",
              span: true,
              value: (st) => {
                if (isManual(st)) return "ใบลดหนี้แบบ Manual — ต้องผ่านการอนุมัติทุกใบ";
                if (!st.sourceDoc) return "ยังไม่ได้เลือกเอกสารต้นทาง";
                const rows = (st.items ?? []) as GridRow[];
                return `${st.sourceDoc} · ดึงมา ${rows.length} บรรทัด · มูลค่าเดิม ${money0(st.originalAmount)} บาท`;
              },
            },
          ],
        },
      ],
    },

    /* ---------- 4. CREDIT ITEMS ---------- */
    {
      key: "items",
      label: "Credit Items",
      railLabel: "Credit Items",
      labelTh: "รายการที่ลดหนี้",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Credit Items",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกเอกสารต้นทางในขั้นตอน Source Document หรือค้นหาสินค้าที่นี่",
          hint: "Credit Qty ต้องไม่เกิน Approved Qty ที่คำขอคืนอนุมัติไว้",
          cols: [
            { key: "line", label: "#", type: "static", align: "right", muted: true, width: "42px" },
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "150px",
              placeholder: "ค้นหาสินค้า...",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "170px" },
            { key: "sourceQty", label: "Source Qty", type: "static", align: "right", muted: true, width: "88px" },
            { key: "returnedQty", label: "Returned Qty", type: "static", align: "right", muted: true, width: "100px" },
            { key: "approvedQty", label: "Approved Qty", type: "static", align: "right", muted: true, width: "104px" },
            { key: "creditQty", label: "Credit Qty", type: "number", align: "right", required: true, width: "96px" },
            {
              key: "over",
              label: "เกิน",
              type: "computed",
              align: "right",
              get: (r) => {
                const over = num(r.creditQty) - num(r.approvedQty);
                return over > 0 ? fmt(over) : "—";
              },
              cls: (r) => (isOverCredit(r) ? "font-semibold text-danger" : ""),
            },
            { key: "unit", label: "UOM", type: "static", muted: true, width: "58px" },
            { key: "unitPrice", label: "Unit Price", type: "number", align: "right", required: true, width: "105px" },
            { key: "disc", label: "Discount %", type: "number", align: "right", width: "92px" },
            {
              key: "netPrice",
              label: "Net Price",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => money(netUnitPrice(r)),
            },
            { key: "taxCode", label: "Tax Code", type: "select", options: opts(CN_TAX_CODES), width: "100px" },
            { key: "taxRate", label: "Tax %", type: "number", align: "right", width: "76px" },
            {
              key: "amount",
              label: "Credit Amount",
              type: "computed",
              align: "right",
              get: (r) => money(lineAmount(r)),
            },
            { key: "reason", label: "Reason", type: "select", options: opts(CN_REASONS), width: "170px" },
            { key: "note", label: "Notes", type: "text", width: "140px" },
          ],
        },
        {
          type: "card",
          title: "Item Totals",
          cols: "4",
          fields: [
            { type: "static", label: "Total Items", value: (s) => fmt(((s.items ?? []) as GridRow[]).length) },
            { type: "static", label: "Total Credit Qty", value: (s) => fmt(draftTotals(s).totalQty) },
            {
              type: "static",
              label: "Over-credit Lines",
              value: (s) => fmt(((s.items ?? []) as GridRow[]).filter(isOverCredit).length),
            },
            { type: "static", label: "Total Credit", value: (s) => money(draftTotals(s).totalCredit) },
          ],
        },
      ],
    },

    /* ---------- 5. TAX ---------- */
    {
      key: "tax",
      label: "Tax",
      railLabel: "Tax",
      labelTh: "ภาษีและส่วนลดท้ายบิล",
      blocks: () => [
        {
          type: "card",
          title: "Tax",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "taxMode",
              label: "Tax Included / Excluded",
              required: true,
              options: opts(CN_TAX_MODES),
              hint: "Inclusive: ภาษีถูกรวมอยู่ในราคาแล้ว",
            },
            { type: "number", path: "vatRate", label: "VAT Rate (%)", required: true, min: 0, max: 100, step: "0.01" },
            { type: "number", path: "headerDisc", label: "Header Discount (%)", min: 0, max: 100, step: "0.01" },
            { type: "number", path: "rounding", label: "Rounding", step: "0.01" },
          ],
        },
        {
          type: "card",
          title: "Calculated",
          cols: "4",
          fields: [
            { type: "static", label: "Taxable Amount", value: (s) => money(draftTotals(s).taxable) },
            { type: "static", label: "Tax Amount", value: (s) => money(draftTotals(s).tax) },
            {
              type: "static",
              label: "Discount",
              value: (s) => {
                const t = draftTotals(s);
                return money(t.discount + t.headerDiscount);
              },
            },
            { type: "static", label: "Total Credit", value: (s) => money(draftTotals(s).totalCredit) },
          ],
        },
      ],
    },

    /* ---------- 6. SUMMARY ---------- */
    {
      key: "summary",
      label: "Summary",
      railLabel: "Summary",
      labelTh: "สรุปยอดลดหนี้",
      blocks: () => [
        {
          type: "card",
          title: "Credit Summary",
          cols: "3",
          fields: [
            { type: "static", label: "Subtotal", value: (s) => money(draftTotals(s).taxable) },
            {
              type: "static",
              label: "Discount",
              value: (s) => {
                const t = draftTotals(s);
                return money(t.discount + t.headerDiscount);
              },
            },
            { type: "static", label: "Tax", value: (s) => money(draftTotals(s).tax) },
            { type: "static", label: "Total Credit", value: (s) => money(draftTotals(s).totalCredit) },
            { type: "static", path: "appliedAmount", label: "Applied Amount", value: (s) => money(s.appliedAmount) },
            {
              type: "static",
              label: "Remaining Credit",
              value: (s) => money(Math.max(0, draftTotals(s).totalCredit - num(s.appliedAmount))),
            },
          ],
        },
        {
          type: "note",
          label: "Approval",
          text: "ใบลดหนี้ที่เข้าเงื่อนไขต้องผ่านสายอนุมัติ Sales Manager → Finance ก่อนออกใบ — ดูเหตุผลที่ต้องอนุมัติในแถบด้านขวา",
        },
      ],
    },

    /* ---------- 7. NOTES & ATTACHMENTS ---------- */
    {
      key: "notes",
      label: "Notes and Attachments",
      railLabel: "Notes and Attachments",
      labelTh: "หมายเหตุและไฟล์แนบ",
      blocks: () => [
        {
          type: "card",
          title: "Notes",
          cols: "2",
          fields: [
            {
              type: "textarea",
              path: "note",
              label: "Credit Note Notes",
              span: true,
              rows: 3,
              placeholder: "ข้อความที่จะพิมพ์บนใบลดหนี้ หรือบริบทที่ฝ่ายบัญชีควรรู้",
            },
            {
              type: "note",
              label: "Attachments",
              text: "การแนบหลักฐาน เช่น รูปสินค้าที่คืน หรือเอกสารอนุมัติ จะเปิดใช้พร้อมระบบจัดเก็บเอกสารในเฟสถัดไป",
            },
          ],
        },
      ],
    },

    /* ---------- 8. REVIEW ---------- */
    {
      key: "review",
      label: "Review",
      railLabel: "Review",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "creditDate", label: "Credit Date", step: "info" },
    { path: "creditType", label: "Credit Type", step: "info" },
    { path: "reason", label: "Reason", step: "info" },
    { path: "branch", label: "Branch", step: "info" },
    { path: "currency", label: "Currency", step: "info" },
    { path: "customer", label: "Customer", step: "customer" },
    { path: "taxId", label: "Tax ID", step: "customer" },
    { path: "sourceType", label: "Source Type", step: "source" },
    {
      path: "sourceDoc",
      label: "Source Document",
      step: "source",
      test: (s) => isManual(s) || Boolean(String(s.sourceDoc ?? "").trim()),
    },
    {
      path: "items",
      label: "รายการที่ลดหนี้อย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.creditQty) > 0),
    },
    { path: "taxMode", label: "Tax Mode", step: "tax" },
    { path: "vatRate", label: "VAT Rate", step: "tax" },
  ],

  rules: [
    {
      label: "อัตราแลกเปลี่ยนของสกุลเงิน THB ต้องเป็น 1",
      step: "info",
      test: (s) => s.currency !== "THB" || num(s.fx) === 1,
    },
    {
      label: "ทุกบรรทัดต้องเลือกสินค้าที่มีอยู่ในระบบ",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) =>
          PRODUCTS.some((p) => p.code === String(r.code ?? "").trim()),
        ),
    },
    {
      label: "จำนวนที่ลดหนี้ต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.creditQty) > 0),
    },
    {
      label: "จำนวนที่ลดหนี้ต้องไม่เกินจำนวนที่อนุมัติ",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => !isOverCredit(r)),
    },
    {
      label: "ราคาต่อหน่วยต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.unitPrice) > 0),
    },
    {
      label: "ส่วนลดต้องอยู่ระหว่าง 0–100%",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.disc) >= 0 && num(r.disc) <= 100),
    },
    {
      label: "ทุกบรรทัดต้องระบุรหัสภาษี",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => Boolean(String(r.taxCode ?? "").trim())),
    },
    {
      label: "ทุกบรรทัดต้องระบุเหตุผลการลดหนี้",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => Boolean(String(r.reason ?? "").trim())),
    },
    {
      label: "ห้ามมีสินค้าซ้ำบรรทัดในใบเดียวกัน",
      step: "items",
      test: (s) => {
        const codes = ((s.items ?? []) as GridRow[])
          .map((r) => String(r.code ?? "").trim())
          .filter(Boolean);
        return new Set(codes).size === codes.length;
      },
    },
    {
      label: "อัตราภาษีต้องไม่ติดลบ",
      step: "tax",
      test: (s) =>
        num(s.vatRate) >= 0 && ((s.items ?? []) as GridRow[]).every((r) => num(r.taxRate) >= 0),
    },
    {
      label: "มูลค่าลดหนี้รวมต้องมากกว่า 0",
      step: "tax",
      test: (s) => draftTotals(s).totalCredit > 0,
    },
  ],

  lookup: {
    product: (q): LookupHit[] => {
      const t = q.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) =>
          !t ||
          p.code.toLowerCase().includes(t) ||
          p.name.toLowerCase().includes(t) ||
          p.nameTh.includes(q.trim()),
      )
        .slice(0, 20)
        .map((p) => ({ code: p.code, name: p.name, meta: money0(catalogPrice(p.code)) }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const row = ((s[path] ?? []) as GridRow[])[index];
    if (!row) return;
    const p = PRODUCTS.find((x) => x.code === hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.unit = p?.unit ?? "";
    if (!num(row.unitPrice)) row.unitPrice = catalogPrice(hit.code);
    if (!num(row.creditQty)) row.creditQty = 1;
    /* A manual line has no return behind it, so the requested qty is its own
       ceiling — the approval chain is what controls it instead. */
    row.sourceQty = num(row.creditQty);
    row.returnedQty = 0;
    row.approvedQty = num(row.creditQty);
    if (!row.taxCode) row.taxCode = "VAT7";
    if (row.taxRate === "" || row.taxRate === undefined) row.taxRate = num(s.vatRate) || 7;
    if (!row.reason) row.reason = String(s.reason ?? "");
  },

  onChange: (path, s) => {
    if (path === "sourceType") {
      s.sourceDoc = "";
      s.items = [];
      s.returnRef = "";
      s.invoiceRef = "";
      s.soRef = "";
      if (s.sourceType === "Manual") s.creditType = "Manual";
      return;
    }

    if (path === "sourceDoc") {
      const type = String(s.sourceType ?? "");
      const doc = String(s.sourceDoc ?? "");
      if (!doc) return;

      const head = headerFromCnSource(type, doc);
      if (head) {
        s.customer = head.customer;
        s.customerCode = head.customerCode;
        s.customerGroup = head.customerGroup;
        s.taxId = head.taxId;
        s.address = head.address;
        s.contactPerson = head.contactPerson;
        s.phone = head.phone;
        s.email = head.email;
        s.salesRep = head.salesRep;
        s.returnRef = head.returnRef;
        s.invoiceRef = head.invoiceRef;
        s.soRef = head.soRef;
        s.creditType = head.creditType;
        if (!s.reason) s.reason = head.reason;
        s.returnDate = head.returnDate;
        s.originalInvoiceDate = head.originalInvoiceDate;
        s.originalAmount = head.originalAmount;
      }
      s.items = creditableLinesFrom(type, doc).map((it) => ({ ...it }));
      return;
    }

    /* The header reason seeds any line that has none of its own. */
    if (path === "reason") {
      for (const r of (s.items ?? []) as GridRow[]) {
        if (!String(r.reason ?? "").trim()) r.reason = String(s.reason ?? "");
      }
      return;
    }

    /* Changing the header VAT rate follows through to untouched lines. */
    if (path === "vatRate") {
      for (const r of (s.items ?? []) as GridRow[]) r.taxRate = num(s.vatRate);
    }
  },

  newRow: () => ({
    line: 0,
    code: "",
    name: "",
    sourceQty: 0,
    returnedQty: 0,
    approvedQty: 0,
    creditQty: "",
    unit: "",
    unitPrice: "",
    disc: 0,
    taxCode: "VAT7",
    taxRate: 7,
    reason: "",
    note: "",
  }),

  previewCard: (s) => {
    const t = draftTotals(s);
    return (
      <RailCard icon="creditNote" title="Credit Note Preview" tone="accent">
        <RailRow label="เลขที่" value={String(s.code ?? "")} />
        <RailRow label="ลูกค้า" value={String(s.customer ?? "") || "ยังไม่ได้เลือก"} />
        <RailRow label="ต้นทาง" value={String(s.sourceDoc ?? "") || "Manual"} />
        <RailRow label="ประเภท" value={String(s.creditType ?? "")} />
        <RailRow label="Subtotal" value={money(t.taxable)} />
        <RailRow label={`Tax (${num(s.vatRate)}%)`} value={money(t.tax)} />
        <RailTotal label={`Total Credit (${String(s.currency ?? "THB")})`} value={money(t.totalCredit)} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const issues = submitReadiness({
      items: (s.items ?? []) as never,
      customer: String(s.customer ?? ""),
      creditType: String(s.creditType ?? ""),
      reason: String(s.reason ?? ""),
      taxMode: String(s.taxMode ?? ""),
      vatRate: num(s.vatRate),
      headerDisc: num(s.headerDisc),
      rounding: num(s.rounding),
      sourceType: String(s.sourceType ?? ""),
    });
    const blocking = issues.filter((i) => i.blocking);
    const triggers = approvalTriggers({
      items: (s.items ?? []) as never,
      taxMode: String(s.taxMode ?? ""),
      headerDisc: num(s.headerDisc),
      rounding: num(s.rounding),
      creditType: String(s.creditType ?? ""),
      sourceType: String(s.sourceType ?? ""),
      vatRate: num(s.vatRate),
    });
    const over = ((s.items ?? []) as GridRow[]).filter(isOverCredit);

    if (!s.sourceDoc && !isManual(s)) {
      return (
        <RailCard icon="shield" title="Credit Readiness">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกเอกสารต้นทางในขั้นตอน Source Document เพื่อดึงรายการและตรวจเพดานจำนวนที่ลดหนี้ได้
          </p>
        </RailCard>
      );
    }

    return (
      <RailCard icon="shield" title="Credit Readiness" tone={blocking.length ? "warn" : "default"}>
        <RailRow
          label="สถานะความพร้อม"
          value={blocking.length ? `ติด ${blocking.length} เรื่อง` : "ส่งขออนุมัติได้"}
          tone={blocking.length ? "danger" : "ok"}
        />
        <RailRow label="บรรทัดทั้งหมด" value={((s.items ?? []) as GridRow[]).length} />
        <RailRow
          label="ลดหนี้เกินสิทธิ์"
          value={`${over.length} บรรทัด`}
          tone={over.length ? "danger" : "ok"}
        />
        <RailRow label="ต้องผ่านการอนุมัติ" value={triggers.length ? "ใช่" : "ไม่ต้อง"} tone={triggers.length ? "warn" : "ok"} />
        {blocking.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-cap leading-relaxed text-warning-text">
            {blocking.slice(0, 5).map((b) => (
              <li key={b.label}>• {b.label}</li>
            ))}
          </ul>
        )}
        {blocking.length === 0 && triggers.length > 0 && (
          <p className="mt-3 text-cap leading-relaxed text-ink-2">
            เหตุที่ต้องอนุมัติ: {triggers.join(" · ")}
          </p>
        )}
      </RailCard>
    );
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    const t = draftTotals(s);
    return (
      <>
        <ReviewCard title="Credit Note & Customer">
          {row("Credit Note No.", s.code, "info")}
          {row("Credit Date", isoToDmy(s.creditDate), "info")}
          {row("Credit Type", s.creditType, "info")}
          {row("Reason", s.reason, "info")}
          {row("Customer", s.customer, "customer")}
          {row("Tax ID", s.taxId, "customer")}
          {row("Source Document", s.sourceDoc || "Manual", "source")}
          {row("Return Number", s.returnRef, "source")}
          {row("Invoice Number", s.invoiceRef, "source")}
        </ReviewCard>
        <ReviewCard title="Credit Items">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-[9px] text-[13px] last:border-b-0"
            >
              <span className="font-medium tnum">{String(r.code ?? "—")}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{String(r.name ?? "")}</span>
              <span className="tnum">
                {fmt(r.creditQty)} {String(r.unit ?? "")}
              </span>
              <span className="w-28 text-right font-medium tnum">{money(lineAmount(r))}</span>
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-ink-2">Subtotal</span>
              <span className="tnum">{money(t.taxable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Tax</span>
              <span className="tnum">{money(t.tax)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="font-semibold">Total Credit</span>
              <span className="text-lg font-semibold tnum">{money(t.totalCredit)}</span>
            </div>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = CREDIT_NOTES.find((x) => x.code === code);

    if (existing && !["Draft", "Pending Approval"].includes(existing.status)) {
      ctx.toast(
        "แก้ไขไม่ได้",
        `${code} อยู่ในสถานะ ${existing.status} — ใบลดหนี้ที่ออกแล้วแก้ไขไม่ได้`,
        "warning",
      );
      return;
    }

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim() && num(r.creditQty) > 0)
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        sourceQty: num(r.sourceQty),
        returnedQty: num(r.returnedQty),
        approvedQty: num(r.approvedQty),
        creditQty: num(r.creditQty),
        unit: String(r.unit ?? ""),
        unitPrice: num(r.unitPrice),
        disc: num(r.disc),
        taxCode: String(r.taxCode ?? "VAT7"),
        taxRate: num(r.taxRate),
        reason: String(r.reason ?? s.reason ?? ""),
        note: String(r.note ?? ""),
      }));

    const patch = {
      creditDate: isoToDmy(s.creditDate),
      sourceType: String(s.sourceType ?? "Manual"),
      sourceDoc: String(s.sourceDoc ?? ""),
      returnRef: String(s.returnRef ?? ""),
      invoiceRef: String(s.invoiceRef ?? ""),
      soRef: String(s.soRef ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      customerGroup: String(s.customerGroup ?? ""),
      taxId: String(s.taxId ?? ""),
      address: String(s.address ?? ""),
      contactPerson: String(s.contactPerson ?? ""),
      phone: String(s.phone ?? ""),
      email: String(s.email ?? ""),
      creditType: String(s.creditType ?? ""),
      reason: String(s.reason ?? ""),
      salesRep: String(s.salesRep ?? ""),
      branch: String(s.branch ?? ""),
      currency: String(s.currency ?? "THB"),
      fx: num(s.fx) || 1,
      headerDisc: num(s.headerDisc),
      taxMode: String(s.taxMode ?? "Tax Exclusive"),
      vatRate: num(s.vatRate),
      rounding: num(s.rounding),
      originalAmount: num(s.originalAmount),
      originalInvoiceDate: String(s.originalInvoiceDate ?? ""),
      returnDate: String(s.returnDate ?? ""),
      note: String(s.note ?? ""),
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    const triggers = approvalTriggers(patch);

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Credit note updated",
        d: "แก้ไขใบลดหนี้จากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
      (existing.audit ??= []).unshift({
        event: "Credit note edited",
        user: FORM_USER(),
        when: now,
        field: "items",
        from: `${existing.itemCount} lines`,
        to: `${items.length} lines`,
        kind: "info",
      });
    } else {
      const fresh: CreditNote = {
        code,
        ...patch,
        /* Always Draft — submitting and issuing are separate, deliberate steps
           and nothing here posts to a ledger. */
        status: "Draft",
        approvalStatus: triggers.length ? "Not Submitted" : "Not Required",
        appliedAmount: 0,
        appliedDate: "",
        appliedTo: "",
        cancelReason: "",
        voidReason: "",
        voidBy: "",
        approvals: [],
        attachments: [],
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.sourceDoc ? `Created from ${patch.sourceDoc}` : "Credit note created",
            d: patch.sourceDoc
              ? `สร้างจาก${patch.sourceType} ${patch.sourceDoc}`
              : "สร้างใบลดหนี้เอง (Manual)",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
        audit: [
          { event: "Credit note created", user: FORM_USER(), when: now, field: "—", from: "—", to: "Draft", kind: "" },
        ],
      };
      CREDIT_NOTES.unshift(fresh as CnRow);
    }

    decorateCreditNotes();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบลดหนี้แล้ว",
      message: triggers.length
        ? `${code} — ต้องผ่านการอนุมัติ (${triggers[0]})`
        : `${code} — ${money0(creditTotals(patch).totalCredit)} THB`,
      goto: `/m/credit-note/${encodeURIComponent(code)}`,
    });
  },
};
