import { printActions } from "@/lib/print/actions";
import {
  CREDIT_NOTES,
  approvalTriggers,
  creditTotals,
  customerOutstandingCredit,
  isOverCredit,
  lineAmount,
  lineDiscount,
  lineTax,
  netUnitPrice,
  submitReadiness,
  type CnRow,
} from "@/lib/domain/credit-note";
import { CN_REASONS, CN_STATUS, CN_TYPES } from "@/data/credit-notes";
import { CN_APPROVAL_TONE, CN_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money, money0 } from "@/lib/format";
import {
  cnApply,
  cnApprove,
  cnBulk,
  cnCancel,
  cnDuplicate,
  cnExportPdf,
  cnIssue,
  cnPrint,
  cnReceivePayment,
  cnReject,
  cnSubmit,
  cnVoid,
} from "@/lib/workflows-credit-note";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { CN_FORM } from "./forms/credit-note";

/* ============================================================
   CREDIT NOTE — the financial adjustment after an approved return.

   Draft → Pending Approval → Approved → Issued → Applied
        → Cancelled / Void

   No stock movement, no accounting posting.
   ============================================================ */

const live = () => CREDIT_NOTES.filter((c) => !["Cancelled", "Void"].includes(c.status));

export const CN_LIST: ListSchema<CnRow> = {
  key: "credit-note",
  entity: "Credit Note",
  entityPlural: "Credit Notes",
  title: "Credit Note",
  subtitle: "Manage customer credit note and financial adjustments.",
  crumb: "Credit Note",
  primaryLabel: "Create Credit Note",
  searchPlaceholder: "ค้นหาเลขที่ใบลดหนี้ ลูกค้า เลขที่คืนสินค้า ใบแจ้งหนี้ เลขภาษี หรือสินค้า...",
  emptyTitle: "ไม่พบใบลดหนี้ที่ตรงกับเงื่อนไข",
  hideImportExport: false,

  source: () => CREDIT_NOTES,
  searchFields: [
    "code",
    "customer",
    "customerCode",
    "returnRef",
    "invoiceRef",
    "sourceDoc",
    "taxId",
    "salesRep",
    "reason",
  ],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (c) => c.status === "Draft" },
    { key: "pending", label: "Pending Approval", test: (c) => c.status === "Pending Approval" },
    { key: "approved", label: "Approved", test: (c) => c.status === "Approved" },
    { key: "issued", label: "Issued", test: (c) => c.status === "Issued" },
    { key: "applied", label: "Applied", test: (c) => c.status === "Applied" },
    { key: "cancelled", label: "Cancelled", test: (c) => ["Cancelled", "Void"].includes(c.status) },
  ],

  filters: [
    { id: "status", label: "Status", options: () => [...CN_STATUS], test: (c, v) => c.status === v },
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(CREDIT_NOTES.map((c) => c.customer))],
      test: (c, v) => c.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Representative",
      options: () => [...new Set(CREDIT_NOTES.map((c) => c.salesRep).filter(Boolean))],
      test: (c, v) => c.salesRep === v,
    },
    { id: "creditType", label: "Credit Type", options: () => [...CN_TYPES], test: (c, v) => c.creditType === v },
    { id: "reason", label: "Reason", options: () => [...CN_REASONS], test: (c, v) => c.reason === v },
    {
      id: "sourceType",
      label: "Source Type",
      options: () => [...new Set(CREDIT_NOTES.map((c) => c.sourceType))],
      test: (c, v) => c.sourceType === v,
    },
    {
      id: "branch",
      label: "Branch",
      options: () => [...new Set(CREDIT_NOTES.map((c) => c.branch))],
      test: (c, v) => c.branch === v,
    },
    {
      id: "outstanding",
      label: "Has Outstanding Credit",
      options: () => ["Outstanding only"],
      test: (c) => c.outstandingCredit > 0 && ["Issued", "Applied"].includes(c.status),
    },
  ],

  columns: [
    {
      key: "code",
      label: "Credit Note No.",
      sortable: true,
      cell: (c) => (
        <CellMedia>
          <Thumb>{c.icon}</Thumb>
          <span className="font-medium">{c.code}</span>
        </CellMedia>
      ),
    },
    { key: "creditDate", label: "Credit Date", sortable: true, muted: true, cell: (c) => c.creditDate },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (c) => (
        <>
          {c.customer}
          <CellSub>{c.customerCode}</CellSub>
        </>
      ),
    },
    {
      key: "sourceDoc",
      label: "Source Document",
      muted: true,
      cell: (c) =>
        c.sourceDoc ? (
          <>
            <span className="tnum">{c.sourceDoc}</span>
            <CellSub>{c.sourceType}</CellSub>
          </>
        ) : (
          <span className="text-ink-3">Manual</span>
        ),
    },
    { key: "returnRef", label: "Return No.", muted: true, cell: (c) => c.returnRef || DASH },
    { key: "invoiceRef", label: "Invoice No.", muted: true, cell: (c) => c.invoiceRef || DASH },
    { key: "creditType", label: "Credit Type", cell: (c) => c.creditType },
    { key: "taxable", label: "Subtotal", align: "right", sortable: true, cell: (c) => money(c.taxable) },
    { key: "taxAmount", label: "Tax", align: "right", muted: true, cell: (c) => money(c.taxAmount) },
    {
      key: "totalCredit",
      label: "Total Credit (THB)",
      align: "right",
      sortable: true,
      cell: (c) => <strong>{money(c.totalCredit)}</strong>,
    },
    {
      key: "appliedAmount",
      label: "Applied",
      align: "right",
      sortable: true,
      muted: true,
      cell: (c) => money(c.appliedAmount),
    },
    {
      key: "outstandingCredit",
      label: "Outstanding",
      align: "right",
      sortable: true,
      cell: (c) => (
        <span className={c.outstandingCredit > 0 && c.status === "Issued" ? "font-semibold text-warning-text" : ""}>
          {money(c.outstandingCredit)}
        </span>
      ),
    },
    {
      key: "appliedPct",
      label: "Applied %",
      align: "right",
      sortable: true,
      cell: (c) => (
        <UtilBar
          pct={c.appliedPct}
          tone={c.appliedPct >= 100 ? "full" : c.appliedPct > 0 ? "mid" : undefined}
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (c) => <Badge tone={tone(CN_TONE, c.status)}>{c.status}</Badge>,
    },
    { key: "salesRep", label: "Sales Rep.", muted: true, cell: (c) => c.salesRep || DASH },
    { key: "updated", label: "Updated At", muted: true, sortable: true, cell: (c) => c.updated },
  ],

  hero: () => ({
    kpis: [
      { label: "Total Credit Notes", value: fmt(CREDIT_NOTES.length), sub: "Credit Notes", icon: "creditNote" },
      {
        label: "Draft",
        value: fmt(CREDIT_NOTES.filter((c) => c.status === "Draft").length),
        sub: "Credit Notes",
        goTab: "draft",
      },
      {
        label: "Pending Approval",
        value: fmt(CREDIT_NOTES.filter((c) => c.status === "Pending Approval").length),
        sub: "Credit Notes",
        tone: "warn",
        goTab: "pending",
      },
      {
        label: "Issued",
        value: fmt(CREDIT_NOTES.filter((c) => c.status === "Issued").length),
        sub: "Credit Notes",
        goTab: "issued",
      },
      {
        label: "Applied",
        value: fmt(CREDIT_NOTES.filter((c) => c.status === "Applied").length),
        sub: "Credit Notes",
        tone: "ok",
        goTab: "applied",
      },
      {
        label: "Cancelled",
        value: fmt(CREDIT_NOTES.filter((c) => ["Cancelled", "Void"].includes(c.status)).length),
        sub: "Credit Notes",
        goTab: "cancelled",
      },
      {
        label: "Total Credit Amount",
        value: money0(live().reduce((t, c) => t + c.totalCredit, 0)),
        sub: "THB",
      },
      {
        label: "Outstanding Credit",
        value: money0(
          CREDIT_NOTES.filter((c) => ["Issued", "Applied"].includes(c.status)).reduce(
            (t, c) => t + c.outstandingCredit,
            0,
          ),
        ),
        sub: "THB",
        tone: "warn",
      },
    ],
  }),

  secondaryActions: (ctx) => [
    { label: "Create From Return", icon: "return", run: () => ctx.goto("/m/credit-note/new") },
    { label: "Create From Invoice", icon: "invoice", run: () => ctx.goto("/m/credit-note/new") },
  ],

  bulkActions: (rows, ctx) => [
    { label: "Submit for Approval", icon: "send", run: () => cnBulk(rows, "submit", ctx) },
    { label: "Approve", icon: "checkCircle", run: () => cnBulk(rows, "approve", ctx) },
    { label: "Issue", icon: "creditNote", run: () => cnBulk(rows, "issue", ctx) },
    {
      label: "Print Selected",
      icon: "printer",
      run: () => ctx.toast("พิมพ์รายการที่เลือก", `${rows.length} ใบ — Future support`, "info"),
    },
    { label: "Cancel Drafts", icon: "circleSlash", danger: true, run: () => cnBulk(rows, "cancel", ctx) },
  ],

  rowActions: (c, ctx) => {
    const acts: RowAction<CnRow>[] = [
      { label: "View", icon: "eye", run: (x) => ctx.openEntity("credit-note", x.code) },
      { label: "Open Full Detail", icon: "external", run: (x) => ctx.goto(`/m/credit-note/${x.code}`) },
    ];

    if (c.isEditable)
      acts.push({ label: "Edit", icon: "edit", run: (x) => ctx.goto(`/m/credit-note/${x.code}/edit`) });

    acts.push({ sep: true });

    if (c.canSubmit) acts.push({ label: "Submit for Approval", icon: "send", run: (x) => cnSubmit(x, ctx) });
    if (c.canApprove) {
      acts.push({ label: "Approve", icon: "checkCircle", run: (x) => cnApprove(x, ctx) });
      acts.push({ label: "Request Revision", icon: "refresh", danger: true, run: (x) => cnReject(x, ctx) });
    }
    if (c.canIssue) acts.push({ label: "Issue Credit Note", icon: "creditNote", run: (x) => cnIssue(x, ctx) });
    if (c.canApply) acts.push({ label: "Apply Credit", icon: "pricing", run: (x) => cnApply(x, ctx) });

    acts.push({ label: "Print", icon: "printer", run: (x) => cnPrint(x, ctx) });
    acts.push({ label: "Export PDF", icon: "download", run: (x) => cnExportPdf(x, ctx) });
    acts.push({ label: "Duplicate", icon: "copy", run: (x) => cnDuplicate(x, ctx) });

    if (c.returnRef)
      acts.push({
        label: `ดู ${c.returnRef}`,
        icon: "return",
        run: () => ctx.openEntity("sales-return", c.returnRef),
      });
    if (c.invoiceRef)
      acts.push({
        label: `ดู ${c.invoiceRef}`,
        icon: "invoice",
        run: () => ctx.openEntity("sales-invoice", c.invoiceRef),
      });

    acts.push({ sep: true });
    if (c.canCancel)
      acts.push({ label: "Cancel Credit Note", icon: "circleSlash", danger: true, run: (x) => cnCancel(x, ctx) });
    else if (c.canVoid)
      acts.push({ label: "Void Credit Note", icon: "xCircle", danger: true, run: (x) => cnVoid(x, ctx) });

    return acts;
  },
};

export const CN_DETAIL: DetailSchema<CnRow> = {
  key: "credit-note",
  entityLabel: "Credit Note",

  identity: (c) => ({
    image: c.icon,
    code: c.code,
    title: c.customer,
    copyFields: [
      { label: "Credit note number", value: c.code },
      { label: "Total credit", value: `${money(c.totalCredit)} ${c.currency}` },
    ],
    badges: [
      { text: c.status, tone: tone(CN_TONE, c.status) },
      ...(c.approvalStatus !== "Not Submitted"
        ? ([{ text: c.approvalStatus, tone: tone(CN_APPROVAL_TONE, c.approvalStatus) }] as const)
        : []),
      ...(c.hasOverCredit ? ([{ text: "เกินจำนวนที่อนุมัติ", tone: "danger" }] as const) : []),
    ],
    tags: [c.customerCode, c.creditType, c.sourceDoc || "Manual"].filter(Boolean),
  }),

  kpis: (c) => [
    { icon: "creditNote", label: "Total Credit", value: money(c.totalCredit), sub: c.currency, goTab: "items" },
    { icon: "pricing", label: "Applied Amount", value: money(c.appliedAmount), sub: `${c.appliedPct}%`, goTab: "tax" },
    {
      icon: "clock",
      label: "Outstanding Credit",
      value: money(c.outstandingCredit),
      sub: c.appliedTo || "ยังไม่ได้ตัด",
      goTab: "tax",
    },
    {
      icon: "box",
      label: "Credit Items",
      value: fmt(c.itemCount),
      sub: `${fmt(c.totalQty)} หน่วย`,
      wide: true,
      goTab: "items",
    },
  ],

  tabs: [
    /* ---------- 1. OVERVIEW ---------- */
    {
      key: "overview",
      label: "Overview",
      aside: (c) => ({
        rows: [
          { icon: "calendar", label: "Credit Date", value: c.creditDate },
          { icon: "link", label: "Source Document", value: c.sourceDoc || "Manual", muted: !c.sourceDoc },
          { icon: "return", label: "Return Number", value: c.returnRef || DASH, muted: !c.returnRef },
          { icon: "invoice", label: "Invoice Number", value: c.invoiceRef || DASH, muted: !c.invoiceRef },
          { icon: "user", label: "Sales Representative", value: c.salesRep || DASH },
          { icon: "company", label: "Branch", value: c.branch },
          {
            icon: "pricing",
            label: "Customer Credit Available",
            value: money0(customerOutstandingCredit(c.customerCode)),
          },
        ],
      }),
      blocks: (c) => {
        const t = creditTotals(c);
        const issues = submitReadiness(c);
        const blocking = issues.filter((i) => i.blocking);

        return [
          c.status === "Void" && {
            type: "alert",
            tone: "danger",
            title: "ใบลดหนี้ถูก Void",
            message: `${c.voidReason} — อนุมัติโดย ${c.voidBy}`,
          },
          c.status === "Cancelled" && {
            type: "alert",
            tone: "warn",
            title: "ใบลดหนี้ถูกยกเลิก",
            message: c.cancelReason || "ไม่ระบุเหตุผล",
          },
          c.hasOverCredit && {
            type: "alert",
            tone: "danger",
            title: "มีบรรทัดลดหนี้เกินจำนวนที่อนุมัติ",
            message: "ตรวจสอบแท็บ Items — จำนวนลดหนี้ต้องไม่เกิน Approved Qty ของคำขอคืน",
          },
          c.isEditable && blocking.length > 0 && {
            type: "alert",
            tone: "warn",
            title: `ยังส่งขออนุมัติไม่ได้ (${blocking.length} เรื่อง)`,
            message: blocking.map((b) => b.label).join(" · "),
          },
          c.approvalReasons.length > 0 && c.status === "Draft" && {
            type: "alert",
            tone: "info",
            title: "ใบนี้ต้องผ่านการอนุมัติ",
            message: c.approvalReasons.join(" · "),
          },
          {
            type: "note",
            title: "Scope",
            text: "ใบลดหนี้ปรับเฉพาะยอดเงินที่ลูกค้าต้องชำระ — ไม่กระทบสต๊อก (จัดการไปแล้วที่ Return Receiving → QC → Disposition) และยังไม่ลงบัญชีในเฟสนี้",
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Credit Note Information",
                items: [
                  { label: "Credit Note No.", value: c.code },
                  { label: "Credit Date", value: c.creditDate },
                  { label: "Status", value: <Badge tone={tone(CN_TONE, c.status)}>{c.status}</Badge> },
                  { label: "Credit Type", value: c.creditType },
                  { label: "Reason", value: c.reason },
                  { label: "Source Type", value: c.sourceType },
                  { label: "Return Number", value: c.returnRef || DASH },
                  { label: "Invoice Number", value: c.invoiceRef || DASH },
                  { label: "Sales Representative", value: c.salesRep || DASH },
                  { label: "Branch", value: c.branch },
                  { label: "Currency", value: c.currency },
                  { label: "Created By", value: c.createdBy, muted: true },
                ],
              },
              {
                type: "fields",
                title: "Customer Information",
                items: [
                  { label: "Customer Code", value: c.customerCode },
                  { label: "Customer Name", value: c.customer },
                  { label: "Customer Group", value: c.customerGroup || DASH },
                  { label: "Tax ID", value: c.taxId || DASH },
                  { label: "Address", value: c.address || DASH, span: true },
                  { label: "Contact Person", value: c.contactPerson || DASH },
                  { label: "Phone", value: c.phone || DASH },
                  { label: "Email", value: c.email || DASH },
                ],
              },
            ],
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Source Information",
                items: [
                  { label: "Source Type", value: c.sourceType },
                  { label: "Return Number", value: c.returnRef || DASH },
                  { label: "Source Invoice", value: c.invoiceRef || DASH },
                  { label: "Invoice Date", value: c.originalInvoiceDate || DASH },
                  { label: "Original Sales Order", value: c.soRef || DASH },
                  { label: "Original Amount", value: c.originalAmount ? money(c.originalAmount) : DASH },
                  { label: "Return Amount", value: money(c.totalCredit) },
                  { label: "Return Date", value: c.returnDate || DASH },
                  {
                    label: "Credit Note Status",
                    value: <Badge tone={tone(CN_TONE, c.status)}>{c.status}</Badge>,
                  },
                ],
              },
              {
                type: "fields",
                title: "Credit Summary",
                items: [
                  { label: "Subtotal", value: money(t.taxable) },
                  { label: "Discount", value: money(t.discount + t.headerDiscount) },
                  { label: `Tax (${c.vatRate}%)`, value: money(t.tax) },
                  { label: "Rounding", value: money(t.rounding) },
                  { label: "Total Credit", value: <strong>{money(t.totalCredit)}</strong> },
                  { label: "Applied Amount", value: money(c.appliedAmount) },
                  { label: "Outstanding Amount", value: <strong>{money(c.outstandingCredit)}</strong> },
                  { label: "Applied Date", value: c.appliedDate || DASH, muted: !c.appliedDate },
                  { label: "Applied To", value: c.appliedTo || DASH, muted: !c.appliedTo },
                ],
              },
            ],
          },
          { type: "note", title: "Notes", text: c.note || DASH },
        ];
      },
    },

    /* ---------- 2. ITEMS ---------- */
    {
      key: "items",
      label: "Items",
      blocks: (c) => {
        const t = creditTotals(c);
        return [
          {
            type: "table",
            title: `Credit Items (${c.itemCount})`,
            rows: (c.items ?? []).map((it) => ({
              ...it,
              netPrice: netUnitPrice(it),
              discAmt: lineDiscount(it),
              taxAmt: lineTax(it, c.taxMode),
              amount: lineAmount(it),
              over: Math.max(0, it.creditQty - it.approvedQty),
            })),
            empty: "ไม่มีรายการ",
            cols: [
              { key: "line", label: "#", align: "right", muted: true },
              { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
              { key: "name", label: "Product Name" },
              { key: "sourceQty", label: "Source Qty", align: "right", muted: true, cell: (r) => fmt(r.sourceQty) },
              { key: "returnedQty", label: "Returned Qty", align: "right", muted: true, cell: (r) => fmt(r.returnedQty) },
              { key: "approvedQty", label: "Approved Qty", align: "right", cell: (r) => fmt(r.approvedQty) },
              { key: "creditQty", label: "Credit Qty", align: "right", cell: (r) => <strong>{fmt(r.creditQty)}</strong> },
              {
                key: "over",
                label: "เกิน",
                align: "right",
                cell: (r) => (r.over > 0 ? <span className="font-semibold text-danger">{fmt(r.over)}</span> : DASH),
              },
              { key: "unit", label: "UOM", muted: true },
              { key: "unitPrice", label: "Unit Price", align: "right", cell: (r) => money(r.unitPrice) },
              { key: "disc", label: "Discount", align: "right", cell: (r) => (r.disc ? `${r.disc}%` : DASH) },
              { key: "netPrice", label: "Net Price", align: "right", muted: true, cell: (r) => money(r.netPrice) },
              { key: "taxRate", label: "Tax", align: "right", muted: true, cell: (r) => `${r.taxRate}%` },
              {
                key: "amount",
                label: "Credit Amount",
                align: "right",
                cell: (r) => <strong>{money(r.amount)}</strong>,
              },
              { key: "reason", label: "Reason", muted: true },
              { key: "note", label: "Notes", muted: true, cell: (r) => r.note || DASH },
            ],
          },
          {
            type: "cards",
            title: "Item Totals",
            cols: 4,
            items: [
              { label: "Total Quantity", value: fmt(t.totalQty), unit: "หน่วย" },
              { label: "Subtotal", value: money(t.taxable), unit: c.currency },
              { label: "Tax", value: money(t.tax), unit: c.currency },
              { label: "Total Credit", value: money(t.totalCredit), unit: c.currency, tone: "accent" },
            ],
          },
          {
            type: "note",
            title: "Validation",
            text: "Credit Qty ต้องไม่เกิน Approved Qty ของคำขอคืน — ใบลดหนี้จากใบแจ้งหนี้ใช้จำนวนที่วางบิลเป็นเพดานแทน",
          },
        ];
      },
    },

    /* ---------- 3. APPROVAL ---------- */
    {
      key: "approval",
      label: "Approval",
      blocks: (c) => [
        {
          type: "fields",
          title: "Approval Summary",
          cols: 2,
          items: [
            {
              label: "Approval Status",
              value: <Badge tone={tone(CN_APPROVAL_TONE, c.approvalStatus)}>{c.approvalStatus}</Badge>,
            },
            { label: "Total Credit", value: money(c.totalCredit) },
            {
              label: "เหตุที่ต้องอนุมัติ",
              value: c.approvalReasons.length ? c.approvalReasons.join(" · ") : "ไม่เข้าเงื่อนไข",
              span: true,
              muted: !c.approvalReasons.length,
            },
          ],
        },
        {
          type: "table",
          title: `Approval Steps (${c.approvals?.length ?? 0})`,
          rows: c.approvals ?? [],
          empty: "ยังไม่ได้ส่งขออนุมัติ",
          cols: [
            { key: "step", label: "Step", cell: (a) => <strong>{a.step}</strong> },
            { key: "role", label: "Approver Role", muted: true },
            { key: "approver", label: "Approver Name" },
            {
              key: "status",
              label: "Status",
              cell: (a) => (
                <Badge tone={a.status === "done" ? "success" : a.status === "rejected" ? "danger" : "warning"}>
                  {a.status === "done" ? "Approved" : a.status === "rejected" ? "Rejected" : "Pending"}
                </Badge>
              ),
            },
            { key: "requestedAt", label: "Requested At", muted: true },
            { key: "respondedAt", label: "Responded At", muted: true, cell: (a) => a.respondedAt || DASH },
            { key: "comment", label: "Comment", muted: true, cell: (a) => a.comment || DASH },
          ],
        },
        {
          type: "note",
          title: "Approval Policy",
          text: "ต้องขออนุมัติเมื่อ: มูลค่าเกินเกณฑ์ · ใบลดหนี้แบบ Manual · ปรับราคาย้อนหลัง · ส่วนลดการค้า · อัตราภาษีไม่ใช่ 7% · มีส่วนลดท้ายบิลหรือรายบรรทัด",
        },
      ],
    },

    /* ---------- 4. TAX & SUMMARY ---------- */
    {
      key: "tax",
      label: "Tax & Summary",
      blocks: (c, ctx) => {
        const t = creditTotals(c);
        return [
          {
            type: "fields",
            title: "Tax",
            cols: 2,
            items: [
              { label: "Tax Mode", value: <Badge tone="neutral">{c.taxMode}</Badge> },
              { label: "VAT Rate", value: `${c.vatRate}%` },
              { label: "Taxable Amount", value: money(t.taxable) },
              { label: "Tax Amount", value: money(t.tax) },
              { label: "Tax ID", value: c.taxId || DASH },
              {
                label: "สูตรที่ใช้",
                value:
                  c.taxMode === "Tax Inclusive"
                    ? "Tax = Amount × Rate ÷ (100 + Rate)"
                    : "Tax = Amount × Rate ÷ 100",
                span: true,
                muted: true,
              },
            ],
          },
          {
            type: "cards",
            title: "Credit Summary",
            cols: 3,
            items: [
              { label: "Subtotal", value: money(t.taxable), unit: c.currency },
              { label: "Discount", value: money(t.discount + t.headerDiscount), unit: c.currency },
              { label: "Tax", value: money(t.tax), unit: c.currency },
              { label: "Total Credit", value: money(t.totalCredit), unit: c.currency, tone: "accent" },
              { label: "Applied Amount", value: money(c.appliedAmount), unit: c.currency },
              {
                label: "Remaining Credit",
                value: money(c.outstandingCredit),
                unit: c.currency,
                tone: c.outstandingCredit > 0 ? "warn" : undefined,
              },
            ],
          },
          {
            type: "node",
            title: "Applied Progress",
            node: (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <UtilBar
                    pct={c.appliedPct}
                    tone={c.appliedPct >= 100 ? "full" : c.appliedPct > 0 ? "mid" : undefined}
                  />
                </div>
                <span className="flex-shrink-0 text-[13px] font-medium tnum">{c.appliedPct}%</span>
              </div>
            ),
          },
          {
            type: "node",
            title: "Receive Payment",
            node: (
              <button
                type="button"
                onClick={() => cnReceivePayment(c, ctx)}
                className="inline-flex items-center gap-2 rounded-btn border border-line bg-card px-4 py-2 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                View Payment Application
              </button>
            ),
          },
          {
            type: "planned",
            title: "Finance",
            label: "AR posting and journal entry",
            message: "การตัดยอดลูกหนี้จริง การลงบัญชี และการยื่นภาษีจะทำในโมดูล Finance",
          },
        ];
      },
    },

    /* ---------- 5. SOURCE DOCUMENT ---------- */
    {
      key: "source",
      label: "Source Document",
      blocks: (c, ctx) => [
        !c.sourceDoc && {
          type: "alert",
          tone: "info",
          title: "ใบลดหนี้แบบ Manual",
          message: "ใบนี้ไม่ได้อ้างอิงเอกสารต้นทาง — สร้างรายการเองทั้งหมดและต้องผ่านการอนุมัติ",
        },
        Boolean(c.sourceDoc) && {
          type: "entity",
          title: "Source Document",
          items: [
            {
              name: c.sourceDoc,
              sub: `${c.sourceType} · ${c.customer}`,
              avatar: c.sourceType === "Sales Return" ? "RT" : "IN",
              end: <Badge tone="info">Source</Badge>,
              onClick: () =>
                ctx.openEntity(
                  c.sourceType === "Sales Return" ? "sales-return" : "sales-invoice",
                  c.sourceDoc,
                ),
            },
          ],
        },
        {
          type: "fields",
          title: "Source Chain",
          cols: 2,
          items: [
            { label: "Sales Order", value: c.soRef || DASH },
            { label: "Sales Invoice", value: c.invoiceRef || DASH },
            { label: "Sales Return", value: c.returnRef || DASH },
            { label: "Original Amount", value: c.originalAmount ? money(c.originalAmount) : DASH },
            { label: "Invoice Date", value: c.originalInvoiceDate || DASH },
            { label: "Return Date", value: c.returnDate || DASH },
          ],
        },
        {
          type: "note",
          title: "One Source Per Credit Note",
          text: "เฟส 1 อนุญาตให้ใบลดหนี้อ้างอิงเอกสารต้นทางได้เพียงใบเดียว — ระบบกันการออกใบลดหนี้ซ้ำจากคำขอคืนใบเดิม",
        },
      ],
    },

    /* ---------- 6. DOCUMENT RELATIONSHIP ---------- */
    {
      key: "relationship",
      label: "Document Relationship",
      blocks: (c, ctx) => {
        const soon = (name: string) => ctx.toast(name, `โมดูล ${name} กำลังจะมา — Coming Soon`, "info");
        return [
          {
            type: "note",
            title: "Document Flow",
            text: "Sales Order → Delivery Order → Sales Invoice → Shipment → Sales Return → Credit Note → Receive Payment",
          },
          {
            type: "entity",
            title: "Source Documents",
            empty: "ไม่มีเอกสารต้นทาง — ใบลดหนี้แบบ Manual",
            items: [
              c.soRef && {
                name: c.soRef,
                sub: `Sales Order · ${c.customer}`,
                avatar: "SO",
                end: <Badge tone="neutral">Upstream</Badge>,
                onClick: () => ctx.openEntity("sales-order", c.soRef),
              },
              c.invoiceRef && {
                name: c.invoiceRef,
                sub: `Sales Invoice · ${c.originalInvoiceDate || ""} · ${money0(c.originalAmount)}`,
                avatar: "IN",
                end: <Badge tone="info">Billing</Badge>,
                onClick: () => ctx.openEntity("sales-invoice", c.invoiceRef),
              },
              c.returnRef && {
                name: c.returnRef,
                sub: `Sales Return · ${c.returnDate || ""} · ${fmt(c.totalQty)} หน่วย`,
                avatar: "RT",
                end: <Badge tone="info">Source</Badge>,
                onClick: () => ctx.openEntity("sales-return", c.returnRef),
              },
            ].filter(Boolean) as { name: string; sub: string; avatar: string; end: React.ReactNode; onClick: () => void }[],
          },
          {
            type: "entity",
            title: "Target Documents",
            empty: "ยังไม่มีเอกสารปลายทาง",
            items: [
              {
                name: c.appliedTo || "Receive Payment",
                sub:
                  c.appliedAmount > 0
                    ? `ตัดเครดิตแล้ว ${money(c.appliedAmount)} · คงเหลือ ${money(c.outstandingCredit)}`
                    : "ยังไม่ได้ตัดเครดิตกับใบแจ้งหนี้",
                avatar: "RP",
                end: (
                  <Badge tone={c.appliedAmount > 0 ? "success" : "neutral"}>
                    {c.appliedAmount > 0 ? "Applied" : "Coming Soon"}
                  </Badge>
                ),
                onClick: () => soon("Receive Payment"),
              },
              {
                name: "AR Adjustment",
                sub: "การปรับยอดลูกหนี้ในระบบบัญชี",
                avatar: "AR",
                end: <Badge tone="neutral">Coming Soon</Badge>,
                onClick: () => soon("AR Adjustment"),
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
      blocks: (c) => [
        {
          type: "timeline",
          title: "Activity",
          items: (c.history ?? []).map((h) => ({
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
          message: "ความคิดเห็น การแนบไฟล์ และการแจ้งเตือนฝ่ายบัญชีจะเพิ่มในเฟสถัดไป",
        },
      ],
    },

    /* ---------- 8. AUDIT LOG ---------- */
    {
      key: "audit",
      label: "Audit Log",
      blocks: (c) => [
        { type: "audit", title: "Change History", items: c.audit ?? [] },
        {
          type: "planned",
          title: "Phase 2",
          label: "Field-level audit",
          message: "การบันทึกทุกการเปลี่ยนแปลงระดับฟิลด์พร้อมผู้ใช้และ IP จะเพิ่มในเฟสถัดไป",
        },
      ],
    },
  ],

  actions: (c, ctx) => {
    const acts: RowAction<CnRow>[] = [];

    if (c.canSubmit) acts.push({ label: "Submit for Approval", icon: "send", run: () => cnSubmit(c, ctx) });
    if (c.canApprove) {
      acts.push({ label: "Approve", icon: "checkCircle", run: () => cnApprove(c, ctx) });
      acts.push({ label: "Request Revision", icon: "refresh", danger: true, run: () => cnReject(c, ctx) });
    }
    if (c.canIssue) acts.push({ label: "Issue Credit Note", icon: "creditNote", run: () => cnIssue(c, ctx) });
    if (c.canApply) acts.push({ label: "Apply Credit", icon: "pricing", run: () => cnApply(c, ctx) });

    acts.push({ label: "Print", icon: "printer", run: () => cnPrint(c, ctx) });
    acts.push({ label: "Export PDF", icon: "download", run: () => cnExportPdf(c, ctx) });
    acts.push({ label: "Duplicate", icon: "copy", run: () => cnDuplicate(c, ctx) });

    acts.push({ sep: true });
    if (c.canCancel)
      acts.push({ label: "Cancel Credit Note", icon: "circleSlash", danger: true, run: () => cnCancel(c, ctx) });
    if (c.canVoid)
      acts.push({ label: "Void Credit Note", icon: "xCircle", danger: true, run: () => cnVoid(c, ctx) });

    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("credit-note", c, ctx));
    return acts;
  },
};

export const cnSchemas: EntitySchemas<CnRow> = {
  list: CN_LIST,
  detail: CN_DETAIL,
  form: CN_FORM,
};

export { approvalTriggers, isOverCredit };
