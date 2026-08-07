import {
  INV_BILLABLE_SOURCE_TYPES,
  INV_BRANCHES,
  INV_CHANNELS,
  INV_DISC_TYPES,
  INV_OVERRIDE_REASONS,
  INV_PAY_TERMS,
  INV_PAYMENT_METHODS,
  INV_ROUNDING,
  INV_TAX_CODES,
  INV_TAX_INVOICE_TYPES,
  INV_TAX_MODES,
} from "@/data/sales-invoices";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { PRODUCTS } from "@/lib/domain/product";
import {
  SALES_INVOICES,
  billableLinesFrom,
  billingCustomerOptions,
  billingWarnings,
  creditDaysFor,
  decorateInvoices,
  dueDateFrom,
  getBillingProfile,
  headerFromSource,
  invoiceTotals,
  isOverBilled,
  lineAmount,
  netUnitPrice,
  nextInvoiceCode,
  remainingBillable,
  sourceOptions,
  type InvRow,
} from "@/lib/domain/invoice";
import { fmt, money, money0, stamp, toDisplayDate, toInputDate, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import {
  FORM_USER,
  RailCard,
  RailRow,
  RailTotal,
  ReviewCard,
  opts,
  saved,
} from "./common";

/* ============================================================
   SALES INVOICE FORM

   One form covers both entry points the spec asks for: Create
   Invoice starts on Manual, Create From Source starts by picking
   a Sales Order or Delivery Order in step 1 and pulls the billable
   lines across. Nothing here touches stock.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isManual = (s: { sourceType?: string }) => s.sourceType === "Manual";
const isShipment = (s: { sourceType?: string }) => s.sourceType === "Shipment";

/**
 * Source types this document may be switched to.
 *
 * The two billable ones, plus whatever the record already says if that is
 * something else. An invoice booked against a shipment, or one of the manual
 * ones raised before billing had to follow a document, still has to open and
 * still has to save — dropping its own value out of the list would blank the
 * field the moment somebody edited the address. Nothing new can reach those
 * types, because a new invoice starts on a billable one and this list only
 * ever carries the value it was given.
 */
const sourceTypeChoices = (s: { sourceType?: string }): string[] => {
  const own = String(s.sourceType ?? "").trim();
  const offered: string[] = [...INV_BILLABLE_SOURCE_TYPES];
  return own && !offered.includes(own) ? [...offered, own] : offered;
};

/** Totals for whatever is currently in the draft grid. */
const draftTotals = (s: GridRow) =>
  invoiceTotals({
    items: (s.items ?? []) as GridRow[],
    taxMode: String(s.taxMode ?? "Tax Exclusive"),
    headerDisc: num(s.headerDisc),
    freight: num(s.freight),
    otherCharges: num(s.otherCharges),
    rounding: num(s.rounding),
    withholdingTax: num(s.withholdingTax),
  });

const overBilled = (r: GridRow, sourceType: string) =>
  num(r.invoiceQty) > remainingBillable(r, sourceType);

export const INV_FORM: FormSchema<InvRow> = {
  key: "sales-invoice",
  entityLabel: "Sales Invoice",
  saveButton: "Save Draft",
  statusBadge: {
    Draft: "neutral",
    "Pending Review": "warning",
    Approved: "info",
    Issued: "success",
    "Partially Paid": "warning",
    Paid: "success",
    Overdue: "danger",
    Cancelled: "neutral",
    Void: "danger",
    Credited: "info",
  },

  /* Rule 12: only Draft, Pending Review and Revision Requested are editable. */
  editGuard: (inv) =>
    ["Draft", "Pending Review"].includes(inv.status)
      ? null
      : `${inv.code} อยู่ในสถานะ ${inv.status} — ` +
        (inv.status === "Approved"
          ? "ใบที่อนุมัติแล้วต้องขอแก้ไข (Request Revision) ก่อนจึงจะแก้ได้"
          : ["Cancelled", "Void"].includes(inv.status)
            ? "ใบที่ยกเลิกหรือ Void แล้วเป็นเอกสารอ่านอย่างเดียว"
            : "ใบแจ้งหนี้ที่ออกแล้วถูกล็อก แก้ไขได้ผ่านการ Void หรือออกใบลดหนี้เท่านั้น"),

  blank: () => ({
    _mode: "create",
    code: nextInvoiceCode(),
    /* Billing follows goods, so the delivery note is the default way in. The
       seeded route overwrites both of these before the form is ever rendered. */
    sourceType: "Delivery Order",
    sourceDoc: "",
    customerPick: "",
    customer: "",
    customerCode: "",
    customerType: "",
    taxId: "",
    billingAddress: "",
    billingName: "",
    contactPerson: "",
    phone: "",
    email: "",
    invoiceDate: toInputDate(today()),
    dueDate: dueDateFrom(toInputDate(today()), 30),
    status: "Draft",
    paymentStatus: "Unpaid",
    approvalStatus: "Not Required",
    branch: "Head Office",
    channel: "Direct",
    salesRep: "",
    currency: "THB",
    fx: 1,
    customerPo: "",
    referenceNo: "",
    priceList: "Standard Price List",
    payTerm: "30 Days",
    creditDays: 30,
    creditStatus: "Normal",
    customerGroup: "",
    customerTier: "",
    taxInvoiceType: "Full Tax Invoice",
    branchNo: "00000",
    taxMode: "Tax Exclusive",
    vatRate: 7,
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    rounding: 0,
    withholdingTax: 0,
    paymentMethod: "Bank Transfer",
    collectionNote: "",
    note: "",
    items: [],
  }),

  toState: (inv) => ({
    _mode: "edit",
    code: inv.code,
    sourceType: inv.sourceType,
    sourceDoc: inv.sourceDoc,
    customerPick: `${inv.customerCode} - ${inv.customer}`,
    customer: inv.customer,
    customerCode: inv.customerCode,
    customerType: inv.customerType,
    taxId: inv.taxId,
    billingAddress: inv.billingAddress,
    billingName: inv.billingName,
    contactPerson: inv.contactPerson,
    phone: inv.phone,
    email: inv.email,
    invoiceDate: toInputDate(inv.invoiceDate),
    dueDate: toInputDate(inv.dueDate),
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    approvalStatus: inv.approvalStatus,
    branch: inv.branch,
    channel: inv.channel,
    salesRep: inv.salesRep,
    currency: inv.currency,
    fx: inv.fx,
    customerPo: inv.customerPo,
    referenceNo: inv.referenceNo,
    priceList: inv.priceList,
    payTerm: inv.payTerm,
    creditDays: inv.creditDays,
    creditStatus: inv.creditStatus,
    customerGroup: inv.customerGroup,
    customerTier: inv.customerTier,
    taxInvoiceType: inv.taxInvoiceType,
    branchNo: inv.branchNo,
    taxMode: inv.taxMode,
    vatRate: inv.vatRate,
    headerDisc: inv.headerDisc,
    freight: inv.freight,
    otherCharges: inv.otherCharges,
    rounding: inv.rounding,
    withholdingTax: inv.withholdingTax,
    paymentMethod: inv.paymentMethod,
    collectionNote: inv.collectionNote,
    note: inv.note,
    items: (inv.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. SOURCE DOCUMENT ---------- */
    {
      key: "source",
      label: "Source Document",
      railLabel: "Source Document",
      labelTh: "วางบิลจากเอกสารใด",
      blocks: (s) => [
        {
          type: "note",
          label: "ใบแจ้งหนี้ไม่จองและไม่ตัดสต๊อก",
          text: "การเคลื่อนไหวสต๊อกอยู่ที่ Picking, Delivery Order และ Shipment — เอกสารนี้บันทึกเฉพาะยอดที่เรียกเก็บจากลูกค้า",
        },
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
              options: opts(sourceTypeChoices(s)),
              hint: "วางบิลจากใบส่งของตามของที่ส่งจริง หรือจากใบสั่งขายเมื่อเก็บเงินก่อนส่ง",
            },
            {
              type: "select",
              path: "sourceDoc",
              label: "Source Document",
              required: true,
              options: sourceOptions(String(s.sourceType ?? "")).map((o) => o.code),
              when: (st) => !isManual(st) && !isShipment(st),
              hint: "เลือกเอกสารแล้วระบบจะดึงบรรทัดที่ยังวางบิลไม่ครบมาให้",
            },
            {
              type: "note",
              label: "โมดูล Shipment ยังไม่เปิดใช้งาน",
              text: "เลือก Delivery Order แทนได้ในเฟสนี้ — การวางบิลจากใบขนส่งจะเปิดพร้อมโมดูล Shipment",
              when: isShipment,
            },
            {
              type: "static",
              label: "Source Summary",
              span: true,
              value: (st) => {
                /* Only reachable on an invoice booked before billing had to
                   follow a document; new ones cannot select this type. */
                if (isManual(st)) return "ใบแจ้งหนี้แบบ Manual — ไม่อ้างอิงเอกสารต้นทาง";
                if (!st.sourceDoc) return "ยังไม่ได้เลือกเอกสารต้นทาง";
                const rows = (st.items ?? []) as GridRow[];
                const billable = rows.filter(
                  (r) => remainingBillable(r, String(st.sourceType)) > 0,
                ).length;
                return `${st.sourceDoc} · ดึงมา ${rows.length} บรรทัด · ยังวางบิลได้ ${billable} บรรทัด`;
              },
            },
          ],
        },
      ],
    },

    /* ---------- 2. INVOICE INFORMATION ---------- */
    {
      key: "invoice",
      label: "Invoice Information",
      railLabel: "Invoice Information",
      labelTh: "เลขที่ วันที่ และสาขา",
      blocks: () => [
        {
          type: "card",
          title: "Invoice Information",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Invoice Number" },
            { type: "date", path: "invoiceDate", label: "Invoice Date", required: true },
            {
              type: "date",
              path: "dueDate",
              label: "Due Date",
              required: true,
              hint: "คำนวณจาก Invoice Date + Credit Days แก้เองได้",
            },
            { type: "select", path: "branch", label: "Branch", required: true, options: opts(INV_BRANCHES) },
            { type: "select", path: "channel", label: "Sales Channel", options: opts(INV_CHANNELS) },
            { type: "text", path: "salesRep", label: "Sales Representative", required: true },
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            { type: "number", path: "fx", label: "Exchange Rate", min: 0, step: "0.0001", hint: "THB = 1" },
            { type: "text", path: "customerPo", label: "Customer PO Number" },
            { type: "text", path: "referenceNo", label: "Reference Number", placeholder: "REF-INV-0526-001" },
          ],
        },
      ],
    },

    /* ---------- 3. CUSTOMER AND BILLING ---------- */
    {
      key: "customer",
      label: "Customer and Billing",
      railLabel: "Customer and Billing",
      labelTh: "ผู้รับใบแจ้งหนี้",
      blocks: () => [
        {
          type: "card",
          title: "Customer",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "customerPick",
              label: "Customer",
              required: true,
              options: billingCustomerOptions(),
              hint: "เลือกลูกค้าแล้วระบบจะดึงเลขภาษี ที่อยู่ เงื่อนไขชำระ และเครดิตมาให้",
            },
            { type: "static", path: "customerCode", label: "Customer Code" },
            { type: "static", path: "customerType", label: "Customer Type" },
            { type: "text", path: "taxId", label: "Tax ID", required: true, placeholder: "0105559107221" },
            { type: "text", path: "billingName", label: "Billing Name" },
            { type: "text", path: "branchNo", label: "Branch Number", placeholder: "00000" },
            {
              type: "textarea",
              path: "billingAddress",
              label: "Billing Address",
              required: true,
              span: true,
              rows: 2,
            },
            { type: "text", path: "contactPerson", label: "Contact Person" },
            { type: "text", path: "phone", label: "Phone" },
            { type: "text", path: "email", label: "Email" },
          ],
        },
        {
          type: "card",
          title: "Commercial",
          cols: "3",
          fields: [
            { type: "text", path: "priceList", label: "Price List" },
            { type: "static", path: "creditStatus", label: "Customer Credit Status" },
            { type: "static", path: "customerGroup", label: "Customer Group" },
          ],
        },
      ],
    },

    /* ---------- 4. INVOICE ITEMS ---------- */
    {
      key: "items",
      label: "Invoice Items",
      railLabel: "Invoice Items",
      labelTh: "สินค้าและจำนวนที่เรียกเก็บ",
      blocks: (s) => [
        {
          type: "grid",
          path: "items",
          label: "Invoice Items",
          required: true,
          addLabel: "เพิ่มรายการ",
          empty: isManual(s)
            ? "ยังไม่มีรายการ — ค้นหาสินค้าในช่อง Product"
            : "เลือกเอกสารต้นทางในขั้นตอนแรกเพื่อดึงบรรทัดที่วางบิลได้",
          hint: "Remaining Billable = Delivered − Previously Invoiced (หรือ Ordered − Previously Invoiced เมื่อวางบิลจากใบสั่งขาย)",
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
            { key: "orderedQty", label: "Ordered", type: "static", align: "right", muted: true, width: "76px" },
            { key: "deliveredQty", label: "Delivered", type: "static", align: "right", muted: true, width: "80px" },
            { key: "prevInvoicedQty", label: "Prev. Inv.", type: "static", align: "right", muted: true, width: "80px" },
            {
              key: "remaining",
              label: "Remaining",
              type: "computed",
              align: "right",
              get: (r) => fmt(remainingBillable(r, String(s.sourceType ?? "Manual"))),
              cls: (r) =>
                remainingBillable(r, String(s.sourceType ?? "Manual")) === 0 ? "text-ink-3" : "",
            },
            {
              key: "invoiceQty",
              label: "Invoice Qty",
              type: "number",
              align: "right",
              required: true,
              width: "96px",
            },
            {
              key: "over",
              label: "เกินสิทธิ์",
              type: "computed",
              align: "right",
              get: (r) => {
                const over = num(r.invoiceQty) - remainingBillable(r, String(s.sourceType ?? "Manual"));
                return over > 0 ? fmt(over) : "—";
              },
              cls: (r) =>
                overBilled(r, String(s.sourceType ?? "Manual")) ? "font-semibold text-danger" : "",
            },
            { key: "unit", label: "UOM", type: "static", muted: true, width: "60px" },
            { key: "unitPrice", label: "Unit Price", type: "number", align: "right", required: true, width: "105px" },
            { key: "discType", label: "Disc Type", type: "select", options: opts(INV_DISC_TYPES), width: "105px" },
            { key: "disc", label: "Discount", type: "number", align: "right", width: "88px" },
            {
              key: "netPrice",
              label: "Net Unit Price",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => money(netUnitPrice(r)),
            },
            { key: "taxCode", label: "Tax Code", type: "select", options: opts(INV_TAX_CODES), width: "100px" },
            { key: "taxRate", label: "Tax %", type: "number", align: "right", width: "76px" },
            {
              key: "lineTotal",
              label: "Line Total",
              type: "computed",
              align: "right",
              get: (r) => money(lineAmount(r)),
            },
            { key: "warehouse", label: "Warehouse", type: "text", width: "160px" },
            { key: "lotSerial", label: "Serial / Lot", type: "text", width: "120px" },
            {
              key: "overrideReason",
              label: "เหตุผลที่แก้ราคา",
              type: "select",
              options: opts(INV_OVERRIDE_REASONS),
              width: "180px",
            },
            { key: "note", label: "Notes", type: "text", width: "130px" },
          ],
        },
        {
          type: "card",
          title: "Item Totals",
          cols: "5",
          fields: [
            { type: "static", label: "Total Quantity", value: (st) => fmt(draftTotals(st).totalQty) },
            { type: "static", label: "Subtotal", value: (st) => money(draftTotals(st).subtotal) },
            {
              type: "static",
              label: "Discount",
              value: (st) => {
                const t = draftTotals(st);
                return money(t.lineDiscount + t.headerDiscount);
              },
            },
            { type: "static", label: "Tax", value: (st) => money(draftTotals(st).tax) },
            { type: "static", label: "Grand Total", value: (st) => money(draftTotals(st).grandTotal) },
          ],
        },
      ],
    },

    /* ---------- 5. TAX AND CHARGES ---------- */
    {
      key: "tax",
      label: "Tax and Charges",
      railLabel: "Tax and Charges",
      labelTh: "VAT ค่าขนส่ง และการปัดเศษ",
      blocks: () => [
        {
          type: "card",
          title: "Tax Invoice",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "taxInvoiceType",
              label: "Tax Invoice Type",
              required: true,
              options: opts(INV_TAX_INVOICE_TYPES),
            },
            {
              type: "select",
              path: "taxMode",
              label: "Tax Included / Excluded",
              required: true,
              options: opts(INV_TAX_MODES),
              hint: "Inclusive: ภาษีถูกรวมอยู่ในราคาแล้ว",
            },
            { type: "number", path: "vatRate", label: "VAT Rate (%)", required: true, min: 0, max: 100, step: "0.01" },
          ],
        },
        {
          type: "card",
          title: "Charges & Rounding",
          cols: "3",
          fields: [
            { type: "number", path: "headerDisc", label: "Header Discount (%)", min: 0, max: 100, step: "0.01" },
            { type: "number", path: "freight", label: "Freight", min: 0, step: "0.01" },
            { type: "number", path: "otherCharges", label: "Other Charges", min: 0, step: "0.01" },
            { type: "select", path: "rounding", label: "Rounding Method", options: opts(INV_ROUNDING) },
            {
              type: "number",
              path: "withholdingTax",
              label: "Withholding Tax (%)",
              min: 0,
              max: 100,
              step: "0.01",
              hint: "ตัวเลขนี้ยังไม่ตัดยอด — เฟสนี้เป็นตัวแสดงผลเท่านั้น",
            },
          ],
        },
        {
          type: "card",
          title: "Calculated",
          cols: "4",
          fields: [
            { type: "static", label: "Taxable Amount", value: (st) => money(draftTotals(st).taxable) },
            { type: "static", label: "Tax Amount", value: (st) => money(draftTotals(st).tax) },
            { type: "static", label: "Withholding", value: (st) => money(draftTotals(st).withholding) },
            { type: "static", label: "Grand Total", value: (st) => money(draftTotals(st).grandTotal) },
          ],
        },
      ],
    },

    /* ---------- 6. PAYMENT TERMS ---------- */
    {
      key: "payment",
      label: "Payment Terms",
      railLabel: "Payment Terms",
      labelTh: "เครดิตและกำหนดชำระ",
      blocks: () => [
        {
          type: "card",
          title: "Payment Terms",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "payTerm",
              label: "Payment Terms",
              required: true,
              options: opts(INV_PAY_TERMS),
              hint: "เปลี่ยนแล้วระบบจะคำนวณ Due Date ใหม่",
            },
            { type: "number", path: "creditDays", label: "Credit Days", required: true, min: 0, max: 365 },
            { type: "static", path: "dueDate", label: "Due Date", value: (st) => toDisplayDate(st.dueDate) },
            {
              type: "select",
              path: "paymentMethod",
              label: "Payment Method Preference",
              options: opts(INV_PAYMENT_METHODS),
            },
            { type: "static", label: "Bank Account", value: () => "ยังไม่ใช้ในเฟสนี้" },
            { type: "textarea", path: "collectionNote", label: "Collection Notes", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 7. NOTES ---------- */
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
              label: "Invoice Notes",
              span: true,
              rows: 3,
              placeholder: "ข้อความที่จะพิมพ์บนใบแจ้งหนี้ เช่น เงื่อนไขการชำระหรือเลขที่อ้างอิง",
            },
            {
              type: "note",
              label: "Attachments",
              text: "การแนบไฟล์จะเปิดใช้พร้อมระบบจัดเก็บเอกสารในเฟสถัดไป",
            },
          ],
        },
      ],
    },

    /* ---------- 8. SUMMARY ---------- */
    {
      key: "review",
      label: "Summary",
      railLabel: "Summary",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "sourceType", label: "Source Type", step: "source" },
    {
      path: "sourceDoc",
      label: "Source Document",
      step: "source",
      test: (s) => isManual(s) || isShipment(s) || Boolean(String(s.sourceDoc ?? "").trim()),
    },
    { path: "invoiceDate", label: "Invoice Date", step: "invoice" },
    { path: "dueDate", label: "Due Date", step: "invoice" },
    { path: "branch", label: "Branch", step: "invoice" },
    { path: "salesRep", label: "Sales Representative", step: "invoice" },
    { path: "currency", label: "Currency", step: "invoice" },
    { path: "customerPick", label: "Customer", step: "customer" },
    {
      path: "taxId",
      label: "Tax ID",
      step: "customer",
      /* Only a real tax invoice needs a tax ID. */
      test: (s) => s.taxInvoiceType === "Non-Tax Invoice" || Boolean(String(s.taxId ?? "").trim()),
    },
    { path: "billingAddress", label: "Billing Address", step: "customer" },
    {
      path: "items",
      label: "รายการอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.invoiceQty) > 0),
    },
    { path: "taxInvoiceType", label: "Tax Invoice Type", step: "tax" },
    { path: "taxMode", label: "Tax Mode", step: "tax" },
    { path: "vatRate", label: "VAT Rate", step: "tax" },
    { path: "payTerm", label: "Payment Terms", step: "payment" },
    { path: "creditDays", label: "Credit Days", step: "payment" },
  ],

  rules: [
    {
      label: "วันครบกำหนดชำระต้องไม่อยู่ก่อนวันที่ใบแจ้งหนี้",
      step: "invoice",
      test: (s) => !s.dueDate || !s.invoiceDate || String(s.dueDate) >= String(s.invoiceDate),
    },
    {
      label: "อัตราแลกเปลี่ยนของสกุลเงิน THB ต้องเป็น 1",
      step: "invoice",
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
      label: "จำนวนที่วางบิลต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.invoiceQty) > 0),
    },
    {
      label: "จำนวนที่วางบิลต้องไม่เกินจำนวนที่ยังวางบิลได้",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => !overBilled(r, String(s.sourceType ?? "Manual")),
        ),
    },
    {
      label: "ราคาต่อหน่วยต้องไม่ติดลบ",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.unitPrice) >= 0),
    },
    {
      label: "ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100%",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => r.discType !== "Percent" || (num(r.disc) >= 0 && num(r.disc) <= 100),
        ),
    },
    {
      label: "ส่วนลดแบบจำนวนเงินต้องไม่เกินมูลค่าบรรทัด",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) =>
            r.discType !== "Amount" || num(r.disc) <= num(r.invoiceQty) * num(r.unitPrice),
        ),
    },
    {
      label: "การแก้ราคาต่างจากเอกสารต้นทางต้องระบุเหตุผล",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => !r.priceOverride || Boolean(String(r.overrideReason ?? "").trim()),
        ),
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
      test: (s) => num(s.vatRate) >= 0 && ((s.items ?? []) as GridRow[]).every((r) => num(r.taxRate) >= 0),
    },
    {
      label: "ยอดรวมสุทธิต้องไม่ติดลบ",
      step: "tax",
      test: (s) => draftTotals(s).grandTotal >= 0,
    },
    {
      label: "จำนวนวันเครดิตต้องไม่ติดลบ",
      step: "payment",
      test: (s) => num(s.creditDays) >= 0,
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
        .map((p) => ({ code: p.code, name: p.name, meta: money0(p.price) }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const row = ((s[path] ?? []) as GridRow[])[index];
    if (!row) return;
    const p = PRODUCTS.find((x) => x.code === hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.desc = hit.name;
    row.unit = p?.unit ?? "";
    if (!num(row.unitPrice)) row.unitPrice = p?.price ?? 0;
    if (!num(row.invoiceQty)) row.invoiceQty = 1;
    /* Manual lines have no source, so everything is billable. */
    row.orderedQty = num(row.invoiceQty);
    row.deliveredQty = num(row.invoiceQty);
    row.prevInvoicedQty = 0;
    if (!row.taxCode) row.taxCode = "VAT7";
    if (row.taxRate === "" || row.taxRate === undefined) row.taxRate = num(s.vatRate) || 7;
    if (!row.discType) row.discType = "None";
  },

  onChange: (path, s) => {
    /* Changing the source type invalidates whatever was pulled before. */
    if (path === "sourceType") {
      s.sourceDoc = "";
      s.items = [];
      return;
    }

    /* The source document supplies the header and the billable lines. */
    if (path === "sourceDoc") {
      const type = String(s.sourceType ?? "");
      const doc = String(s.sourceDoc ?? "");
      if (!doc) return;

      const head = headerFromSource(type, doc);
      if (head) {
        s.customerPick = `${head.customerCode} - ${head.customer}`;
        s.customerCode = head.customerCode;
        s.customer = head.customer;
        s.customerPo = head.customerPo;
        s.salesRep = head.salesRep;
        s.currency = head.currency;
        s.channel = head.channel;

        const profile = getBillingProfile(head.customerCode);
        if (profile) {
          s.customerType = profile.type;
          s.taxId = profile.taxId;
          s.billingAddress = profile.address;
          s.billingName = profile.name;
          s.contactPerson = profile.contact;
          s.phone = profile.phone;
          s.email = profile.email;
          s.priceList = profile.priceList;
          s.creditStatus = profile.creditStatus;
          s.customerGroup = profile.group;
          s.customerTier = profile.tier;
        }
      }

      s.items = billableLinesFrom(type, doc).map((it) => ({ ...it }));
      return;
    }

    /* Selecting a customer copies their billing profile onto the invoice. */
    if (path === "customerPick") {
      const p = getBillingProfile(String(s.customerPick ?? ""));
      if (!p) return;
      s.customerCode = p.code;
      s.customer = p.name;
      s.customerType = p.type;
      s.taxId = p.taxId;
      s.billingAddress = p.address;
      s.billingName = p.name;
      s.contactPerson = p.contact;
      s.phone = p.phone;
      s.email = p.email;
      s.priceList = p.priceList;
      s.creditStatus = p.creditStatus;
      s.customerGroup = p.group;
      s.customerTier = p.tier;
      if (!s.salesRep) s.salesRep = p.salesRep;
      s.payTerm = p.payTerm;
      s.creditDays = p.creditDays;
      s.dueDate = dueDateFrom(String(s.invoiceDate ?? ""), p.creditDays);
      return;
    }

    /* Due Date = Invoice Date + Credit Days, recomputed whenever either moves. */
    if (path === "payTerm") {
      s.creditDays = creditDaysFor(String(s.payTerm ?? ""), num(s.creditDays));
      s.dueDate = dueDateFrom(String(s.invoiceDate ?? ""), num(s.creditDays));
      return;
    }
    if (path === "invoiceDate" || path === "creditDays") {
      s.dueDate = dueDateFrom(String(s.invoiceDate ?? ""), num(s.creditDays));
    }
  },

  /** Flag any line whose price no longer matches the source document. */
  onGridChange: (path, s) => {
    if (path !== "items") return;
    const type = String(s.sourceType ?? "Manual");
    const doc = String(s.sourceDoc ?? "");
    const original = doc ? billableLinesFrom(type, doc) : [];

    for (const r of (s.items ?? []) as GridRow[]) {
      const src = original.find((o) => o.code === r.code);
      if (!src) {
        r.priceOverride = false;
        continue;
      }
      r.priceOverride = num(r.unitPrice) !== num(src.unitPrice) || num(r.disc) !== num(src.disc);
      if (!r.priceOverride) r.overrideReason = "";
    }
  },

  newRow: () => ({
    line: 0,
    code: "",
    name: "",
    desc: "",
    sourceLine: 0,
    orderedQty: 0,
    deliveredQty: 0,
    prevInvoicedQty: 0,
    invoiceQty: "",
    unit: "",
    unitPrice: "",
    discType: "None",
    disc: 0,
    taxCode: "VAT7",
    taxRate: 7,
    warehouse: "",
    lotSerial: "",
    note: "",
    priceOverride: false,
    overrideReason: "",
  }),

  previewCard: (s) => {
    const t = draftTotals(s);
    return (
      <RailCard icon="invoice" title="Invoice Preview" tone="accent">
        <RailRow label="เลขที่" value={String(s.code ?? "")} />
        <RailRow label="ลูกค้า" value={String(s.customer ?? "") || "ยังไม่ได้เลือก"} />
        <RailRow label="ต้นทาง" value={String(s.sourceDoc ?? "") || "Manual"} />
        <RailRow label="ครบกำหนด" value={toDisplayDate(s.dueDate) || "—"} />
        <RailRow label="Subtotal" value={money(t.taxable)} />
        <RailRow label={`Tax (${num(s.vatRate)}%)`} value={money(t.tax)} />
        <RailTotal label={`Grand Total (${String(s.currency ?? "THB")})`} value={money(t.grandTotal)} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const type = String(s.sourceType ?? "Manual");
    const over = rows.filter((r) => overBilled(r, type));
    const overrides = rows.filter((r) => r.priceOverride);
    const missingReason = overrides.filter((r) => !String(r.overrideReason ?? "").trim());
    const fullyBilled = rows.filter((r) => remainingBillable(r, type) === 0 && !isManual(s));
    const warnings = billingWarnings(s);

    const blocked = over.length > 0 || missingReason.length > 0 || warnings.length > 0;

    return (
      <RailCard icon="shield" title="Billing Check" tone={blocked ? "warn" : "default"}>
        <RailRow label="บรรทัดทั้งหมด" value={rows.length} />
        <RailRow
          label="วางบิลเกินสิทธิ์"
          value={`${over.length} บรรทัด`}
          tone={over.length ? "danger" : "ok"}
        />
        <RailRow
          label="แก้ราคาจากต้นทาง"
          value={`${overrides.length} บรรทัด`}
          tone={overrides.length ? "warn" : "ok"}
        />
        <RailRow label="วางบิลครบแล้ว" value={`${fullyBilled.length} บรรทัด`} />
        <RailRow
          label="ข้อมูลภาษีครบ"
          value={warnings.length ? "ยังไม่ครบ" : "ครบ"}
          tone={warnings.length ? "danger" : "ok"}
        />
        {over.length > 0 && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            {over.map((r) => r.code).slice(0, 3).join(", ")} วางบิลเกินจำนวนที่ส่งมอบ/สั่งไว้ —
            ลดจำนวนก่อนจึงจะบันทึกได้
          </p>
        )}
        {missingReason.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-warning-text">
            มี {missingReason.length} บรรทัดที่แก้ราคาแต่ยังไม่ระบุเหตุผล — ต้องเลือกเหตุผลในคอลัมน์สุดท้าย
          </p>
        )}
        {warnings.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">{warnings.join(" · ")}</p>
        )}
        {overrides.length > 0 && missingReason.length === 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            ใบนี้มีการแก้ราคา — ต้องผ่านการอนุมัติก่อนออกใบแจ้งหนี้
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
        <ReviewCard title="Invoice & Customer">
          {row("Invoice Number", s.code, "invoice")}
          {row("Invoice Date", toDisplayDate(s.invoiceDate), "invoice")}
          {row("Due Date", toDisplayDate(s.dueDate), "invoice")}
          {row("Source Document", s.sourceDoc || "Manual", "source")}
          {row("Customer", s.customer, "customer")}
          {row("Tax ID", s.taxId, "customer")}
          {row("Billing Address", s.billingAddress, "customer")}
          {row("Payment Terms", s.payTerm, "payment")}
        </ReviewCard>
        <ReviewCard title="Items">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-[9px] text-[13px] last:border-b-0"
            >
              <span className="font-medium tnum">{String(r.code ?? "—")}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{String(r.name ?? "")}</span>
              <span className="tnum">
                {fmt(r.invoiceQty)} {String(r.unit ?? "")}
              </span>
              <span className="w-28 text-right font-medium tnum">{money(lineAmount(r))}</span>
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-ink-2">Taxable Amount</span>
              <span className="tnum">{money(t.taxable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Tax</span>
              <span className="tnum">{money(t.tax)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="font-semibold">Grand Total</span>
              <span className="text-lg font-semibold tnum">{money(t.grandTotal)}</span>
            </div>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = SALES_INVOICES.find((x) => x.code === code);

    /* Issued and beyond are locked — the engine should never get here, but the
       save path is the last line of defence. */
    if (existing && !["Draft", "Pending Review"].includes(existing.status)) {
      ctx.toast(
        "แก้ไขไม่ได้",
        `${code} อยู่ในสถานะ ${existing.status} — ใบแจ้งหนี้ที่ออกแล้วแก้ไขไม่ได้`,
        "warning",
      );
      return;
    }

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim() && num(r.invoiceQty) > 0)
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        desc: String(r.desc ?? r.name ?? ""),
        sourceLine: num(r.sourceLine) || i + 1,
        orderedQty: num(r.orderedQty),
        deliveredQty: num(r.deliveredQty),
        prevInvoicedQty: num(r.prevInvoicedQty),
        invoiceQty: num(r.invoiceQty),
        unit: String(r.unit ?? ""),
        unitPrice: num(r.unitPrice),
        discType: String(r.discType ?? "None"),
        disc: num(r.disc),
        taxCode: String(r.taxCode ?? "VAT7"),
        taxRate: num(r.taxRate),
        warehouse: String(r.warehouse ?? ""),
        lotSerial: String(r.lotSerial ?? ""),
        note: String(r.note ?? ""),
        priceOverride: Boolean(r.priceOverride),
        overrideReason: String(r.overrideReason ?? ""),
      }));

    /* ----------------------------------------------------------
       You may not bill for more than was delivered.

       `isOverBilled()` and `remainingBillable()` have described
       this rule since the invoice module was written, and until
       now nothing called either of them: the form seeded a
       sensible invoiceQty and nobody checked what was saved. A
       default is a suggestion — this is the guard.

       It matters most on the delivery-order path, where the
       basis is what the warehouse confirmed leaving the
       building. Billing above it is billing for goods the
       customer does not have.
       ---------------------------------------------------------- */
    const sourceType = String(s.sourceType ?? "Manual");
    const overBilled = items.filter((it) => isOverBilled(it, sourceType));
    if (overBilled.length) {
      const first = overBilled[0];
      ctx.toast(
        "วางบิลเกินจำนวนที่ส่งได้",
        `${first.code} — วางบิล ${num(first.invoiceQty)} เกินจำนวนที่ยังวางบิลได้ ${remainingBillable(first, sourceType)} ${first.unit}`,
        "danger",
      );
      return;
    }

    const patch = {
      sourceType: String(s.sourceType ?? "Manual"),
      sourceDoc: String(s.sourceDoc ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      customerType: String(s.customerType ?? ""),
      taxId: String(s.taxId ?? ""),
      billingAddress: String(s.billingAddress ?? ""),
      billingName: String(s.billingName ?? s.customer ?? ""),
      contactPerson: String(s.contactPerson ?? ""),
      phone: String(s.phone ?? ""),
      email: String(s.email ?? ""),
      invoiceDate: toDisplayDate(s.invoiceDate),
      dueDate: toDisplayDate(s.dueDate),
      branch: String(s.branch ?? ""),
      channel: String(s.channel ?? ""),
      salesRep: String(s.salesRep ?? ""),
      currency: String(s.currency ?? "THB"),
      fx: num(s.fx) || 1,
      customerPo: String(s.customerPo ?? ""),
      referenceNo: String(s.referenceNo ?? ""),
      priceList: String(s.priceList ?? ""),
      payTerm: String(s.payTerm ?? ""),
      creditDays: num(s.creditDays),
      creditStatus: String(s.creditStatus ?? "Normal"),
      customerGroup: String(s.customerGroup ?? ""),
      customerTier: String(s.customerTier ?? ""),
      taxInvoiceType: String(s.taxInvoiceType ?? "Full Tax Invoice"),
      branchNo: String(s.branchNo ?? "00000"),
      taxMode: String(s.taxMode ?? "Tax Exclusive"),
      vatRate: num(s.vatRate),
      headerDisc: num(s.headerDisc),
      freight: num(s.freight),
      otherCharges: num(s.otherCharges),
      rounding: num(s.rounding),
      withholdingTax: num(s.withholdingTax),
      paymentMethod: String(s.paymentMethod ?? ""),
      collectionNote: String(s.collectionNote ?? ""),
      note: String(s.note ?? ""),
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    const hasOverride = items.some((it) => it.priceOverride);

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Invoice updated",
        d: "แก้ไขใบแจ้งหนี้จากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
      (existing.audit ??= []).unshift({
        event: "Invoice edited",
        user: FORM_USER(),
        when: now,
        field: "items",
        from: `${existing.itemCount} lines`,
        to: `${items.length} lines`,
        kind: "info",
      });
    } else {
      SALES_INVOICES.unshift({
        code,
        ...patch,
        /* Always Draft — submitting and issuing are separate, deliberate steps. */
        status: "Draft",
        paymentStatus: "Unpaid",
        /* A price that differs from the source has to be reviewed. */
        approvalStatus: hasOverride ? "Pending" : "Not Required",
        paidAmount: 0,
        lastPaymentDate: "",
        paymentRef: "",
        nextFollowUp: "",
        cancelReason: "",
        voidReason: "",
        voidBy: "",
        creditNoteRef: "",
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.sourceDoc ? `Created from ${patch.sourceDoc}` : "Created",
            d: patch.sourceDoc
              ? `สร้างจาก${patch.sourceType} ${patch.sourceDoc}`
              : "สร้างใบแจ้งหนี้เอง (Manual)",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
        audit: [
          {
            event: "Invoice created",
            user: FORM_USER(),
            when: now,
            field: "—",
            from: "—",
            to: "Draft",
            kind: "",
          },
        ],
      } as unknown as InvRow);
    }

    decorateInvoices();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบแจ้งหนี้แล้ว",
      message: hasOverride
        ? `${code} — มีการแก้ราคา ต้องผ่านการอนุมัติก่อนออกใบ`
        : `${code} — ${patch.customer}`,
      goto: `/m/sales-invoice/${encodeURIComponent(code)}`,
    });
  },
};
