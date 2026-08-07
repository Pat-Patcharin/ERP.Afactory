import { printActions } from "@/lib/print/actions";
import { displayName } from "@/lib/domain/lines";
import {
  SALES_INVOICES,
  billingWarnings,
  customerOutstanding,
  invoiceTotals,
  invoicesForSource,
  lineAmount,
  lineDiscount,
  lineTaxAmount,
  netUnitPrice,
  remainingBillable,
  type InvRow,
} from "@/lib/domain/invoice";
import { INV_STATUS } from "@/data/sales-invoices";
import { invoiceShipping } from "@/lib/domain/shipment";
import { INV_TONE, PAY_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money, money0 } from "@/lib/format";
import {
  invApprove,
  invBulk,
  invCancel,
  invCreditNote,
  invDuplicate,
  invExportPdf,
  invIssue,
  invPreview,
  invReject,
  invSubmit,
  invViewPayments,
  invVoid,
} from "@/lib/workflows-invoice";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { INV_FORM } from "./forms/sales-invoice";

/* ============================================================
   SALES INVOICE — the billing document.

   Draft → Pending Review → Approved → Issued → Partially Paid → Paid
                                     → Cancelled / Void / Credited

   Billing only: an invoice never reserves or deducts stock.
   ============================================================ */

const sum = (pick: (i: InvRow) => number) => SALES_INVOICES.reduce((t, i) => t + pick(i), 0);
const live = () => SALES_INVOICES.filter((i) => !["Cancelled", "Void"].includes(i.status));

export const INV_LIST: ListSchema<InvRow> = {
  key: "sales-invoice",
  entity: "Sales Invoice",
  entityPlural: "Sales Invoices",
  title: "Sales Invoice",
  subtitle: "Manage customer billing documents, invoice status, due dates, and payment progress.",
  crumb: "Sales Invoice",
  primaryLabel: "",
  searchPlaceholder: "ค้นหาเลขที่ใบแจ้งหนี้ ลูกค้า SO, DO, PO, เลขภาษี หรือสินค้า...",
  emptyTitle: "ไม่พบใบแจ้งหนี้ที่ตรงกับเงื่อนไข",
  hideImportExport: false,
  /* Billing follows goods. The way in is the delivery note for what actually
     shipped, or the order itself when money is collected before it does. */
  convertOnly: {
    from: "ใบส่งของ หรือใบสั่งขาย",
    goto: "/m/delivery-order",
    gotoLabel: "ไปที่ใบส่งของ",
    /* The one document a conversion cannot write by itself — somebody still
       has to say what is being billed — so the form opens, but only with the
       source its own delivery note or order handed over. */
    allowSeeded: (p) => Boolean(p.sourceType?.trim() && p.sourceDoc?.trim()),
  },

  source: () => SALES_INVOICES,
  /* Product code and name are searched through the line items below. */
  searchFields: [
    "code",
    "customer",
    "customerCode",
    "sourceDoc",
    "customerPo",
    "taxId",
    "salesRep",
    "referenceNo",
  ],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (i) => i.status === "Draft" },
    { key: "review", label: "Pending Review", test: (i) => i.status === "Pending Review" },
    { key: "issued", label: "Issued", test: (i) => i.status === "Issued" },
    { key: "overdue", label: "Overdue", test: (i) => i.isOverdue },
    {
      key: "partial",
      label: "Partially Paid",
      test: (i) => i.paymentStatus === "Partially Paid",
    },
    { key: "paid", label: "Paid", test: (i) => i.paymentStatus === "Paid" },
    { key: "cancelled", label: "Cancelled", test: (i) => ["Cancelled", "Void"].includes(i.status) },
  ],

  filters: [
    { id: "status", label: "Status", options: () => [...INV_STATUS], test: (i, v) => i.status === v },
    {
      id: "paymentStatus",
      label: "Payment Status",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.paymentStatus))],
      test: (i, v) => i.paymentStatus === v,
    },
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.customer))],
      test: (i, v) => i.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Representative",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.salesRep))],
      test: (i, v) => i.salesRep === v,
    },
    {
      id: "branch",
      label: "Branch",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.branch))],
      test: (i, v) => i.branch === v,
    },
    {
      id: "channel",
      label: "Sales Channel",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.channel))],
      test: (i, v) => i.channel === v,
    },
    {
      id: "sourceType",
      label: "Source Document Type",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.sourceType))],
      test: (i, v) => i.sourceType === v,
    },
    {
      id: "currency",
      label: "Currency",
      options: () => [...new Set(SALES_INVOICES.map((i) => i.currency))],
      test: (i, v) => i.currency === v,
    },
    {
      id: "overdue",
      label: "Overdue Only",
      options: () => ["Overdue only"],
      test: (i) => i.isOverdue,
    },
  ],

  columns: [
    {
      key: "code",
      label: "Invoice Number",
      sortable: true,
      cell: (i) => (
        <CellMedia>
          <Thumb>{i.icon}</Thumb>
          <span className="font-medium">{i.code}</span>
        </CellMedia>
      ),
    },
    { key: "invoiceDate", label: "Invoice Date", sortable: true, muted: true, cell: (i) => i.invoiceDate },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (i) => (
        <>
          {i.customer}
          <CellSub>{i.customerCode}</CellSub>
        </>
      ),
    },
    {
      key: "sourceDoc",
      label: "Source Document",
      muted: true,
      cell: (i) =>
        i.sourceDoc ? (
          <>
            <span className="tnum">{i.sourceDoc}</span>
            <CellSub>{i.sourceType}</CellSub>
          </>
        ) : (
          <span className="text-ink-3">Manual</span>
        ),
    },
    { key: "customerPo", label: "Customer PO", muted: true, cell: (i) => i.customerPo || DASH },
    { key: "salesRep", label: "Sales Rep", muted: true, cell: (i) => i.salesRep },
    {
      key: "dueDate",
      label: "Due Date",
      sortable: true,
      cell: (i) =>
        i.isOverdue ? (
          <>
            <span className="font-semibold text-danger">{i.dueDate}</span>
            <CellSub>เกิน {i.daysOverdue} วัน</CellSub>
          </>
        ) : (
          i.dueDate
        ),
    },
    {
      key: "grandTotal",
      label: "Grand Total",
      align: "right",
      sortable: true,
      cell: (i) => (
        <>
          {money(i.grandTotal)}
          <CellSub>{i.currency}</CellSub>
        </>
      ),
    },
    {
      key: "paidAmount",
      label: "Paid Amount",
      align: "right",
      sortable: true,
      muted: true,
      cell: (i) => money(i.paidAmount),
    },
    {
      key: "outstanding",
      label: "Outstanding Amount",
      align: "right",
      sortable: true,
      cell: (i) => (
        <span className={i.outstanding > 0 && i.isOverdue ? "font-semibold text-danger" : ""}>
          {money(i.outstanding)}
        </span>
      ),
    },
    {
      key: "paymentStatus",
      label: "Payment Status",
      cell: (i) => <Badge tone={tone(PAY_TONE, i.paymentStatus)}>{i.paymentStatus}</Badge>,
    },
    {
      key: "status",
      label: "Invoice Status",
      cell: (i) => <Badge tone={tone(INV_TONE, i.status)}>{i.status}</Badge>,
    },
    { key: "updated", label: "Updated At", muted: true, sortable: true, cell: (i) => i.updated },
  ],

  /* KPI strip — the numbers a billing clerk checks before starting the day. */
  hero: () => ({
    kpis: [
      { label: "Total Invoices", value: fmt(SALES_INVOICES.length), sub: "Invoices", icon: "invoice" },
      {
        label: "Draft",
        value: fmt(SALES_INVOICES.filter((i) => i.status === "Draft").length),
        sub: "Invoices",
        goTab: "draft",
      },
      {
        label: "Pending Review",
        value: fmt(SALES_INVOICES.filter((i) => i.status === "Pending Review").length),
        sub: "Invoices",
        tone: "warn",
        goTab: "review",
      },
      {
        label: "Issued",
        value: fmt(SALES_INVOICES.filter((i) => i.status === "Issued").length),
        sub: "Invoices",
        goTab: "issued",
      },
      {
        label: "Overdue",
        value: fmt(SALES_INVOICES.filter((i) => i.isOverdue).length),
        sub: "Invoices",
        tone: "warn",
        goTab: "overdue",
      },
      {
        label: "Partially Paid",
        value: fmt(SALES_INVOICES.filter((i) => i.paymentStatus === "Partially Paid").length),
        sub: "Invoices",
        goTab: "partial",
      },
      {
        label: "Paid",
        value: fmt(SALES_INVOICES.filter((i) => i.paymentStatus === "Paid").length),
        sub: "Invoices",
        tone: "ok",
        goTab: "paid",
      },
      {
        label: "Total Invoice Value",
        value: money0(live().reduce((t, i) => t + i.grandTotal, 0)),
        sub: "THB",
      },
      {
        label: "Outstanding Amount",
        value: money0(sum((i) => (["Cancelled", "Void"].includes(i.status) ? 0 : i.outstanding))),
        sub: "THB",
        tone: "warn",
      },
    ],
  }),

  /* Billing starts at the document being billed, so this goes to the delivery
     notes rather than to a form with an empty source picker on it. */
  secondaryActions: (ctx) => [
    {
      label: "วางบิลจากใบส่งของ",
      icon: "link",
      run: () => ctx.goto("/m/delivery-order"),
    },
  ],

  bulkActions: (rows, ctx) => [
    { label: "Submit for Review", icon: "send", run: () => invBulk(rows, "submit", ctx) },
    { label: "Approve", icon: "checkCircle", run: () => invBulk(rows, "approve", ctx) },
    { label: "Issue Invoice", icon: "invoice", run: () => invBulk(rows, "issue", ctx) },
    {
      label: "Print Selected",
      icon: "printer",
      run: () => ctx.toast("พิมพ์รายการที่เลือก", `${rows.length} ใบ — Future support`, "info"),
    },
    { label: "Cancel Selected", icon: "circleSlash", danger: true, run: () => invBulk(rows, "cancel", ctx) },
  ],

  rowActions: (inv, ctx) => {
    const acts: RowAction<InvRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("sales-invoice", r) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/sales-invoice/${r.code}`) },
    ];

    if (inv.isEditable)
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/sales-invoice/${r.code}/edit`) });

    acts.push({ sep: true });

    if (inv.status === "Draft")
      acts.push({ label: "Submit for Review", icon: "send", run: (r) => invSubmit(r, ctx) });

    if (inv.status === "Pending Review") {
      acts.push({ label: "Approve", icon: "checkCircle", run: (r) => invApprove(r, ctx) });
      acts.push({ label: "Request Revision", icon: "refresh", danger: true, run: (r) => invReject(r, ctx) });
    }

    if (inv.isIssuable)
      acts.push({ label: "Issue Invoice", icon: "invoice", run: (r) => invIssue(r, ctx) });

    acts.push({ label: "Preview / Print", icon: "printer", run: (r) => invPreview(r, ctx) });
    acts.push({ label: "Export PDF", icon: "download", run: (r) => invExportPdf(r, ctx) });
    acts.push({ label: "Duplicate", icon: "copy", run: (r) => invDuplicate(r, ctx) });

    if (inv.canCreditNote)
      acts.push({ label: "Create Credit Note", icon: "creditNote", run: (r) => invCreditNote(r, ctx) });

    if (inv.sourceDoc)
      acts.push({
        label: `ดู ${inv.sourceDoc}`,
        icon: inv.sourceType === "Sales Order" ? "salesOrder" : "delivery",
        run: () =>
          ctx.openEntity(
            inv.sourceType === "Sales Order" ? "sales-order" : "delivery-order",
            inv.sourceDoc,
          ),
      });

    acts.push({ sep: true });
    if (["Draft", "Pending Review", "Approved"].includes(inv.status))
      acts.push({ label: "Cancel Invoice", icon: "circleSlash", danger: true, run: (r) => invCancel(r, ctx) });
    else if (["Issued", "Partially Paid", "Overdue"].includes(inv.status))
      acts.push({ label: "Void Invoice", icon: "xCircle", danger: true, run: (r) => invVoid(r, ctx) });

    return acts;
  },
};

export const INV_DETAIL: DetailSchema<InvRow> = {
  key: "sales-invoice",
  entityLabel: "Sales Invoice",

  identity: (inv) => ({
    image: inv.icon,
    code: inv.code,
    title: inv.customer,
    copyFields: [
      { label: "Invoice number", value: inv.code },
      { label: "Grand total", value: `${money(inv.grandTotal)} ${inv.currency}` },
    ],
    badges: [
      { text: inv.status, tone: tone(INV_TONE, inv.status) },
      { text: inv.paymentStatus, tone: tone(PAY_TONE, inv.paymentStatus) },
      ...(inv.hasPriceOverride ? ([{ text: "Price overridden", tone: "warning" }] as const) : []),
      ...(inv.billTypeDrift
        ? ([
            { text: `${inv.effectiveBillType} ≠ ${inv.billTypeDrift.code}`, tone: "warning" },
          ] as const)
        : []),
    ],
    tags: [inv.customerCode, inv.branch, inv.sourceDoc || "Manual"].filter(Boolean),
  }),

  kpis: (inv) => [
    { icon: "invoice", label: "Grand Total", value: money(inv.grandTotal), sub: inv.currency, goTab: "items" },
    { icon: "pricing", label: "Paid Amount", value: money(inv.paidAmount), sub: `${inv.paidPct}%`, goTab: "payment" },
    {
      icon: "clock",
      label: "Outstanding",
      value: money(inv.outstanding),
      sub: inv.isOverdue ? `เกิน ${inv.daysOverdue} วัน` : inv.dueDate,
      goTab: "payment",
    },
    {
      icon: "box",
      label: "Line Items",
      value: fmt(inv.itemCount),
      sub: `${fmt(inv.totalQty)} หน่วย`,
      wide: true,
      goTab: "items",
    },
  ],

  tabs: [
    /* ---------- 1. OVERVIEW ---------- */
    {
      key: "overview",
      label: "Overview",
      aside: (inv) => ({
        rows: [
          { icon: "calendar", label: "Invoice Date", value: inv.invoiceDate },
          {
            icon: "clock",
            label: "Due Date",
            value: inv.isOverdue ? (
              <span className="font-semibold text-danger">{inv.dueDate}</span>
            ) : (
              inv.dueDate
            ),
          },
          { icon: "partner", label: "Customer", value: inv.customer },
          { icon: "user", label: "Sales Rep", value: inv.salesRep },
          { icon: "company", label: "Branch", value: inv.branch },
          {
            icon: "link",
            label: "Source",
            value: inv.sourceDoc || "Manual",
            muted: !inv.sourceDoc,
          },
          {
            icon: "pricing",
            label: "Customer Outstanding",
            value: money0(customerOutstanding(inv.customerCode)),
          },
        ],
      }),
      blocks: (inv) => {
        const t = invoiceTotals(inv);
        const warnings = billingWarnings(inv);
        /* Read through `shipmentRef`; this invoice stores none of it. Null
           when the goods have not been handed to a carrier yet, and the whole
           panel is left off rather than shown as a column of dashes. */
        const ship = invoiceShipping(inv);

        return [
          inv.status === "Void" && {
            type: "alert",
            tone: "danger",
            title: "ใบแจ้งหนี้ถูก Void",
            message: `${inv.voidReason} — อนุมัติโดย ${inv.voidBy}`,
          },
          inv.status === "Cancelled" && {
            type: "alert",
            tone: "warn",
            title: "ใบแจ้งหนี้ถูกยกเลิก",
            message: inv.cancelReason || "ไม่ระบุเหตุผล",
          },
          Boolean(inv.creditNoteRef) && {
            type: "alert",
            tone: "info",
            title: "มีใบลดหนี้ผูกอยู่",
            message: `ออกใบลดหนี้ ${inv.creditNoteRef} จากใบแจ้งหนี้นี้แล้ว`,
          },
          inv.isOverdue && {
            type: "alert",
            tone: "danger",
            title: `เกินกำหนดชำระ ${inv.daysOverdue} วัน`,
            message: `ครบกำหนด ${inv.dueDate} — ค้างชำระ ${money(inv.outstanding)} ${inv.currency}`,
          },
          warnings.length > 0 && {
            type: "alert",
            tone: "warn",
            title: "ข้อมูลสำหรับออกใบกำกับภาษียังไม่ครบ",
            message: warnings.join(" · "),
          },
          inv.hasPriceOverride && {
            type: "alert",
            tone: "warn",
            title: "มีการแก้ราคาต่างจากเอกสารต้นทาง",
            message: "ตรวจสอบเหตุผลการแก้ราคาในแท็บ Invoice Items ก่อนอนุมัติ",
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Invoice Information",
                items: [
                  { label: "Invoice Number", value: inv.code },
                  { label: "Invoice Date", value: inv.invoiceDate },
                  { label: "Due Date", value: inv.dueDate },
                  { label: "Status", value: <Badge tone={tone(INV_TONE, inv.status)}>{inv.status}</Badge> },
                  { label: "Source Document Type", value: inv.sourceType },
                  { label: "Source Document No.", value: inv.sourceDoc || DASH },
                  { label: "Customer PO Number", value: inv.customerPo || DASH },
                  { label: "Reference Number", value: inv.referenceNo || DASH },
                  { label: "Branch", value: inv.branch },
                  { label: "Sales Channel", value: inv.channel },
                  { label: "Sales Representative", value: inv.salesRep },
                  { label: "Created By", value: inv.createdBy, muted: true },
                ],
              },
              ship && {
                type: "fields",
                title: "การจัดส่ง",
                items: [
                  { label: "รอบขนส่ง", value: <span className="tnum">{ship.shipmentCode}</span> },
                  { label: "ผู้ขนส่ง", value: ship.carrier || DASH },
                  { label: "บริการ", value: ship.carrierService || DASH },
                  {
                    label: "เลขพัสดุ",
                    value: ship.trackingNo ? (
                      <span className="tnum">{ship.trackingNo}</span>
                    ) : (
                      "ยังไม่ได้ใส่เลขพัสดุ"
                    ),
                    muted: !ship.trackingNo,
                  },
                  { label: "สถานะส่ง", value: ship.deliveryStatus || DASH },
                  {
                    label: "วันที่ส่งจริง",
                    value: ship.actualDelivery || "ยังไม่ถึงปลายทาง",
                    muted: !ship.actualDelivery,
                  },
                ],
              },
              {
                type: "fields",
                title: "Customer Information",
                items: [
                  { label: "Customer Code", value: inv.customerCode },
                  { label: "Customer Name", value: inv.customer },
                  { label: "Customer Type", value: inv.customerType },
                  { label: "Tax ID", value: inv.taxId || DASH },
                  { label: "Billing Address", value: inv.billingAddress, span: true },
                  { label: "Contact Person", value: inv.contactPerson || DASH },
                  { label: "Phone", value: inv.phone || DASH },
                  { label: "Email", value: inv.email || DASH },
                ],
              },
            ],
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Commercial Information",
                items: [
                  { label: "Price List", value: inv.priceList },
                  { label: "Payment Terms", value: inv.payTerm },
                  { label: "Currency", value: inv.currency },
                  { label: "Exchange Rate", value: inv.fx.toFixed(4) },
                  { label: "Credit Days", value: fmt(inv.creditDays) },
                  {
                    label: "Customer Credit Status",
                    value: (
                      <Badge tone={inv.creditStatus === "Normal" ? "success" : "warning"}>
                        {inv.creditStatus}
                      </Badge>
                    ),
                  },
                  { label: "Customer Group", value: inv.customerGroup },
                  { label: "Customer Tier", value: inv.customerTier },
                ],
              },
              {
                type: "fields",
                title: "Invoice Summary",
                items: [
                  { label: "Subtotal", value: money(t.subtotal) },
                  { label: "Header Discount", value: money(t.headerDiscount) },
                  { label: "Line Discount", value: money(t.lineDiscount) },
                  { label: "Freight", value: money(t.freight) },
                  { label: "Other Charges", value: money(t.otherCharges) },
                  { label: "Taxable Amount", value: money(t.taxable) },
                  { label: "Tax Amount", value: money(t.tax) },
                  {
                    label: "Withholding Tax",
                    value: inv.withholdingTax ? money(t.withholding) : "ยังไม่ใช้ในเฟสนี้",
                    muted: !inv.withholdingTax,
                  },
                  { label: "Rounding", value: money(t.rounding) },
                  { label: "Grand Total", value: <strong>{money(t.grandTotal)}</strong> },
                  { label: "Paid Amount", value: money(inv.paidAmount) },
                  { label: "Outstanding Amount", value: <strong>{money(inv.outstanding)}</strong> },
                ],
              },
            ],
          },
          { type: "note", title: "Notes", text: inv.note || DASH },
        ];
      },
    },

    /* ---------- 2. INVOICE ITEMS ---------- */
    {
      key: "items",
      label: "Invoice Items",
      blocks: (inv) => {
        const t = invoiceTotals(inv);
        return [
          {
            type: "table",
            title: `Invoice Items (${inv.itemCount})`,
            rows: (inv.items ?? []).map((it) => ({
              ...it,
              remaining: remainingBillable(it, inv.sourceType),
              netPrice: netUnitPrice(it),
              discAmt: lineDiscount(it),
              taxAmt: lineTaxAmount(it, inv.taxMode),
              total: lineAmount(it),
            })),
            empty: "ไม่มีรายการ",
            cols: [
              { key: "line", label: "#", align: "right", muted: true },
              { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
              {
                key: "name",
                label: "Product Name",
                /* Always the salesperson's wording on screen, whatever showOnBill says:
                   the people handling the order need to see what the customer was told. */
                cell: (it) => displayName(it),
              },
              { key: "sourceLine", label: "Source Line", align: "right", muted: true },
              { key: "orderedQty", label: "Ordered", align: "right", muted: true, cell: (r) => fmt(r.orderedQty) },
              { key: "deliveredQty", label: "Delivered", align: "right", muted: true, cell: (r) => fmt(r.deliveredQty) },
              { key: "prevInvoicedQty", label: "Prev. Invoiced", align: "right", muted: true, cell: (r) => fmt(r.prevInvoicedQty) },
              {
                key: "remaining",
                label: "Remaining Billable",
                align: "right",
                cell: (r) => (
                  <span className={r.remaining === 0 ? "text-ink-3" : ""}>{fmt(r.remaining)}</span>
                ),
              },
              {
                key: "invoiceQty",
                label: "Invoice Qty",
                align: "right",
                cell: (r) => <strong>{fmt(r.invoiceQty)}</strong>,
              },
              { key: "unit", label: "UOM", muted: true },
              {
                key: "unitPrice",
                label: "Unit Price",
                align: "right",
                cell: (r) =>
                  r.priceOverride ? (
                    <span className="font-semibold text-warning-text" title={r.overrideReason}>
                      {money(r.unitPrice)} *
                    </span>
                  ) : (
                    money(r.unitPrice)
                  ),
              },
              { key: "discType", label: "Disc Type", muted: true },
              { key: "discAmt", label: "Discount", align: "right", cell: (r) => money(r.discAmt) },
              { key: "netPrice", label: "Net Unit Price", align: "right", muted: true, cell: (r) => money(r.netPrice) },
              { key: "taxCode", label: "Tax Code", muted: true },
              { key: "taxRate", label: "Tax %", align: "right", muted: true, cell: (r) => `${r.taxRate}%` },
              { key: "total", label: "Line Total", align: "right", cell: (r) => <strong>{money(r.total)}</strong> },
              { key: "warehouse", label: "Warehouse", muted: true },
              { key: "lotSerial", label: "Serial / Lot", muted: true, cell: (r) => r.lotSerial || DASH },
              { key: "note", label: "Notes", muted: true, cell: (r) => r.note || DASH },
            ],
          },
          {
            type: "cards",
            title: "Item Totals",
            items: [
              { label: "Total Quantity", value: fmt(t.totalQty), unit: "หน่วย" },
              { label: "Subtotal", value: money(t.subtotal), unit: inv.currency },
              { label: "Discount", value: money(t.lineDiscount + t.headerDiscount), unit: inv.currency },
              { label: "Tax", value: money(t.tax), unit: inv.currency },
              { label: "Grand Total", value: money(t.grandTotal), unit: inv.currency, tone: "accent" },
            ],
          },
          inv.hasPriceOverride && {
            type: "note",
            title: "Price Override",
            text: (inv.items ?? [])
              .filter((it) => it.priceOverride)
              .map((it) => `${it.code}: ${it.overrideReason || "ไม่ระบุเหตุผล"}`)
              .join(" · "),
          },
        ];
      },
    },

    /* ---------- 3. BILLING & TAX ---------- */
    {
      key: "billing",
      label: "Billing and Tax",
      blocks: (inv) => {
        const t = invoiceTotals(inv);
        return [
          {
            type: "fields",
            title: "Tax Invoice",
            cols: 2,
            items: [
              { label: "Tax Invoice Type", value: <Badge tone="info">{inv.taxInvoiceType}</Badge> },
              { label: "Tax ID", value: inv.taxId || DASH },
              { label: "Branch Number", value: inv.branchNo || DASH },
              { label: "Billing Name", value: inv.billingName || inv.customer },
              { label: "Billing Address", value: inv.billingAddress, span: true },
            ],
          },
          {
            type: "fields",
            title: "Tax Calculation",
            cols: 2,
            items: [
              { label: "Tax Mode", value: <Badge tone="neutral">{inv.taxMode}</Badge> },
              {
                label: "Bill Type",
                /* Read off the lines, not from a field — see effectiveBillType.
                   Says what it differs from, so nobody has to open history. */
                value: inv.billTypeDrift ? (
                  <span className="font-semibold text-warning-text">
                    {inv.effectiveBillType} — ต่างจาก{inv.billTypeDrift.label}{" "}
                    {inv.billTypeDrift.code} ที่เป็น {inv.billTypeDrift.billType}
                  </span>
                ) : (
                  inv.effectiveBillType
                ),
              },
              { label: "VAT Rate", value: `${inv.vatRate}%` },
              { label: "Taxable Amount", value: money(t.taxable) },
              { label: "Tax Amount", value: money(t.tax) },
              {
                label: "สูตรที่ใช้",
                value:
                  inv.taxMode === "Tax Inclusive"
                    ? "Tax = Included Amount × Rate ÷ (100 + Rate)"
                    : "Tax = Taxable Amount × Rate ÷ 100",
                span: true,
                muted: true,
              },
              {
                label: "Withholding Tax",
                value: inv.withholdingTax
                  ? `${inv.withholdingTax}% = ${money(t.withholding)}`
                  : "ยังไม่ใช้ในเฟสนี้",
                muted: !inv.withholdingTax,
              },
            ],
          },
          {
            type: "fields",
            title: "Charges & Rounding",
            cols: 2,
            items: [
              { label: "Header Discount", value: `${inv.headerDisc}% = ${money(t.headerDiscount)}` },
              { label: "Freight", value: money(t.freight) },
              { label: "Other Charges", value: money(t.otherCharges) },
              { label: "Rounding", value: money(t.rounding) },
            ],
          },
          {
            type: "note",
            title: "Phase 1",
            text: "การคำนวณภาษีในเฟสนี้เป็นแบบจำลอง ยังไม่เชื่อมระบบยื่นภาษี e-Tax Invoice หรือบัญชีแยกประเภท",
          },
        ];
      },
    },

    /* ---------- 4. PAYMENT SUMMARY ---------- */
    {
      key: "payment",
      label: "Payment Summary",
      blocks: (inv, ctx) => [
        {
          type: "cards",
          title: "Payment Progress",
          cols: 3,
          items: [
            { label: "Invoice Total", value: money(inv.grandTotal), unit: inv.currency },
            { label: "Paid Amount", value: money(inv.paidAmount), unit: inv.currency, tone: "accent" },
            {
              label: "Outstanding Amount",
              value: money(inv.outstanding),
              unit: inv.currency,
              tone: inv.outstanding > 0 ? "warn" : undefined,
            },
          ],
        },
        {
          type: "node",
          title: "Progress",
          node: (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <UtilBar
                  pct={inv.paidPct}
                  tone={inv.paidPct >= 100 ? "full" : inv.paidPct > 0 ? "mid" : undefined}
                />
              </div>
              <span className="flex-shrink-0 text-[13px] font-medium tnum">{inv.paidPct}%</span>
            </div>
          ),
        },
        {
          type: "fields",
          title: "Payment Information",
          cols: 2,
          items: [
            {
              label: "Payment Status",
              value: <Badge tone={tone(PAY_TONE, inv.paymentStatus)}>{inv.paymentStatus}</Badge>,
            },
            { label: "Payment Method Preference", value: inv.paymentMethod || DASH },
            { label: "Last Payment Date", value: inv.lastPaymentDate || DASH, muted: !inv.lastPaymentDate },
            { label: "Payment Reference", value: inv.paymentRef || DASH, muted: !inv.paymentRef },
            { label: "Next Follow-Up Date", value: inv.nextFollowUp || DASH, muted: !inv.nextFollowUp },
            { label: "Bank Account", value: "ยังไม่ใช้ในเฟสนี้", muted: true },
            { label: "Collection Notes", value: inv.collectionNote || DASH, span: true, muted: !inv.collectionNote },
          ],
        },
        {
          type: "node",
          title: "Receive Payment",
          node: (
            <button
              type="button"
              onClick={() => invViewPayments(inv, ctx)}
              className="inline-flex items-center gap-2 rounded-btn border border-line bg-card px-4 py-2 text-[13px] font-medium transition-colors hover:bg-surface"
            >
              View Payments
            </button>
          ),
        },
        {
          type: "planned",
          title: "Finance",
          label: "Receive Payment",
          message: "Receive Payment will be available in the Finance module.",
        },
      ],
    },

    /* ---------- 5. SOURCE DOCUMENT ---------- */
    {
      key: "source",
      label: "Source Document",
      blocks: (inv, ctx) => {
        const siblings = inv.sourceDoc ? invoicesForSource(inv.sourceDoc) : [];
        return [
          !inv.sourceDoc && {
            type: "alert",
            tone: "info",
            title: "ใบแจ้งหนี้แบบ Manual",
            message: "ใบนี้ไม่ได้อ้างอิงเอกสารต้นทาง — สร้างรายการเองทั้งหมด",
          },
          Boolean(inv.sourceDoc) && {
            type: "entity",
            title: "Source Document",
            items: [
              {
                name: inv.sourceDoc,
                sub: `${inv.sourceType} · ${inv.customer}`,
                avatar: inv.sourceType === "Sales Order" ? "SO" : "DO",
                end: <Badge tone="info">{inv.sourceType}</Badge>,
                onClick: () =>
                  inv.sourceType === "Shipment"
                    ? ctx.toast("Shipment", "โมดูล Shipment กำลังจะมา — Coming Soon", "info")
                    : ctx.openEntity(
                        inv.sourceType === "Sales Order" ? "sales-order" : "delivery-order",
                        inv.sourceDoc,
                      ),
              },
            ],
          },
          siblings.length > 1 && {
            type: "table",
            title: `ใบแจ้งหนี้อื่นจากเอกสารเดียวกัน (${siblings.length - 1})`,
            rows: siblings.filter((s) => s.code !== inv.code),
            cols: [
              {
                key: "code",
                label: "Invoice No.",
                cell: (r) => (
                  <button
                    onClick={() => ctx.openEntity("sales-invoice", r.code)}
                    className="font-medium text-info hover:underline tnum"
                  >
                    {r.code}
                  </button>
                ),
              },
              { key: "invoiceDate", label: "Invoice Date", muted: true },
              { key: "grandTotal", label: "Grand Total", align: "right", cell: (r) => money(r.grandTotal) },
              { key: "status", label: "Status", cell: (r) => <Badge tone={tone(INV_TONE, r.status)}>{r.status}</Badge> },
            ],
          },
          {
            type: "note",
            title: "Partial Invoicing",
            text: "เอกสารต้นทางหนึ่งใบออกใบแจ้งหนี้ได้หลายใบ — ระบบตัดยอดที่วางบิลไปแล้วออกจากจำนวนคงเหลือให้อัตโนมัติ",
          },
        ];
      },
    },

    /* ---------- 6. DOCUMENT RELATIONSHIP ---------- */
    {
      key: "relationship",
      label: "Document Relationship",
      blocks: (inv, ctx) => {
        const soon = (name: string) =>
          ctx.toast(name, `โมดูล ${name} กำลังจะมา — Coming Soon`, "info");

        return [
          {
            type: "note",
            title: "Document Flow",
            text: "Sales Request → Sales Order → Picking → Packing → Delivery Order → Sales Invoice → Shipment → Receive Payment → Credit Note",
          },
          {
            type: "entity",
            title: "Source Documents",
            empty: "ใบแจ้งหนี้นี้ไม่ได้อ้างอิงเอกสารต้นทาง",
            items: inv.sourceDoc
              ? [
                  {
                    name: inv.sourceDoc,
                    sub: `${inv.sourceType} · ${inv.invoiceDate} · ${money0(inv.grandTotal)} · ${inv.createdBy}`,
                    avatar: inv.sourceType === "Sales Order" ? "SO" : "DO",
                    end: <Badge tone="info">Source</Badge>,
                    onClick: () =>
                      inv.sourceType === "Shipment"
                        ? soon("Shipment")
                        : ctx.openEntity(
                            inv.sourceType === "Sales Order" ? "sales-order" : "delivery-order",
                            inv.sourceDoc,
                          ),
                  },
                ]
              : [],
          },
          {
            type: "entity",
            title: "Target Documents",
            empty: "ยังไม่มีเอกสารปลายทาง",
            items: [
              {
                name: "Receive Payment",
                sub: `ค้างชำระ ${money(inv.outstanding)} ${inv.currency}`,
                avatar: "RP",
                end: <Badge tone="neutral">Coming Soon</Badge>,
                onClick: () => soon("Receive Payment"),
              },
              {
                name: inv.creditNoteRef || "Credit Note",
                sub: inv.creditNoteRef ? "ออกใบลดหนี้แล้ว" : "ยังไม่ได้ออกใบลดหนี้",
                avatar: "CN",
                end: (
                  <Badge tone={inv.creditNoteRef ? "info" : "neutral"}>
                    {inv.creditNoteRef ? "Created" : "Coming Soon"}
                  </Badge>
                ),
                onClick: () => soon("Credit Note"),
              },
              {
                name: "Shipment",
                sub: "การขนส่งที่ผูกกับใบส่งของนี้",
                avatar: "SH",
                end: <Badge tone="neutral">Coming Soon</Badge>,
                onClick: () => soon("Shipment"),
              },
            ],
          },
        ];
      },
    },

    /* ---------- 7. TIMELINE ---------- */
    {
      key: "timeline",
      label: "Timeline",
      blocks: (inv) => [
        {
          type: "timeline",
          title: "Activity",
          items: (inv.history ?? []).map((h) => ({
            title: h.t,
            detail: h.d,
            user: h.u,
            when: h.when,
            kind: h.kind,
          })),
        },
        {
          type: "planned",
          title: "Phase 2",
          label: "Rich activity feed",
          message: "ความคิดเห็น การแนบไฟล์ และการแจ้งเตือนจะเพิ่มในเฟสถัดไป",
        },
      ],
    },

    /* ---------- 8. AUDIT LOG ---------- */
    {
      key: "audit",
      label: "Audit Log",
      blocks: (inv) => [
        { type: "audit", title: "Change History", items: inv.audit ?? [] },
        {
          type: "planned",
          title: "Phase 2",
          label: "Field-level audit",
          message: "การบันทึกทุกการเปลี่ยนแปลงระดับฟิลด์พร้อมผู้ใช้และ IP จะเพิ่มในเฟสถัดไป",
        },
      ],
    },
  ],

  actions: (inv, ctx) => {
    const acts: RowAction<InvRow>[] = [];

    if (inv.status === "Draft")
      acts.push({ label: "Submit for Review", icon: "send", run: () => invSubmit(inv, ctx) });
    if (inv.status === "Pending Review") {
      acts.push({ label: "Approve", icon: "checkCircle", run: () => invApprove(inv, ctx) });
      acts.push({ label: "Request Revision", icon: "refresh", danger: true, run: () => invReject(inv, ctx) });
    }
    if (inv.isIssuable)
      acts.push({ label: "Issue Invoice", icon: "invoice", run: () => invIssue(inv, ctx) });

    acts.push({ label: "Preview / Print", icon: "printer", run: () => invPreview(inv, ctx) });
    acts.push({ label: "Export PDF", icon: "download", run: () => invExportPdf(inv, ctx) });
    acts.push({ label: "Duplicate", icon: "copy", run: () => invDuplicate(inv, ctx) });

    if (inv.canCreditNote)
      acts.push({ label: "Create Credit Note", icon: "creditNote", run: () => invCreditNote(inv, ctx) });

    acts.push({ sep: true });
    if (["Draft", "Pending Review", "Approved"].includes(inv.status))
      acts.push({ label: "Cancel Invoice", icon: "circleSlash", danger: true, run: () => invCancel(inv, ctx) });
    if (["Issued", "Partially Paid", "Overdue"].includes(inv.status))
      acts.push({ label: "Void Invoice", icon: "xCircle", danger: true, run: () => invVoid(inv, ctx) });

    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("sales-invoice", inv, ctx));
    return acts;
  },
};

export const invSchemas: EntitySchemas<InvRow> = {
  list: INV_LIST,
  detail: INV_DETAIL,
  form: INV_FORM,
};
