import { printActions } from "@/lib/print/actions";
import {
  SALES_RETURNS,
  duplicateSerials,
  lineCredit,
  remainingReturnable,
  returnsForSource,
  serialMismatches,
  stockEligibility,
  submitReadiness,
  type RtnRow,
} from "@/lib/domain/sales-return";
import { RTN_STATUS, RTN_TYPES } from "@/data/sales-returns";
import {
  PRIORITY_TONE,
  RTN_APPROVAL_TONE,
  RTN_CREDIT_TONE,
  RTN_DISPOSITION_TONE,
  RTN_QC_TONE,
  RTN_RECEIVING_TONE,
  RTN_TONE,
  tone,
} from "@/lib/badges";
import { DASH, fmt, money, money0 } from "@/lib/format";
import {
  rtnApprove,
  rtnAuthorize,
  rtnBulk,
  rtnCancel,
  rtnClose,
  rtnCreditNote,
  rtnDisposition,
  rtnException,
  rtnPrintRma,
  rtnReceive,
  rtnReject,
  rtnReplacement,
  rtnStartQc,
  rtnSubmit,
} from "@/lib/workflows-return";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { RTN_FORM } from "./forms/sales-return";

/* ============================================================
   SALES RETURN — the operational return process.

   Draft → Pending Approval → Approved → Authorized → Waiting Return
        → Received → Pending QC → QC Completed → Disposition Completed
        → Credit Note Pending → Credited → Closed

   Returned goods only reach available stock through an accepted QC
   result plus a confirmed disposition.
   ============================================================ */

export const RTN_LIST: ListSchema<RtnRow> = {
  key: "sales-return",
  entity: "Sales Return",
  entityPlural: "Sales Returns",
  title: "Sales Return",
  subtitle:
    "Manage customer return requests, returned goods receiving, return QC, disposition, and credit note handoff.",
  crumb: "Sales Return",
  primaryLabel: "Create Return Request",
  searchPlaceholder: "ค้นหาเลขที่คำขอคืน ลูกค้า เอกสารต้นทาง RMA สินค้า Serial หรือ Lot...",
  emptyTitle: "ไม่พบคำขอคืนที่ตรงกับเงื่อนไข",
  hideImportExport: false,

  source: () => SALES_RETURNS,
  searchFields: [
    "code",
    "rmaNo",
    "customer",
    "customerCode",
    "sourceDoc",
    "shipmentRef",
    "invoiceRef",
    "soRef",
    "returnReason",
    "salesRep",
  ],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (r) => r.status === "Draft" },
    { key: "pending", label: "Pending Approval", test: (r) => r.approvalStatus === "Pending Approval" },
    {
      key: "approved",
      label: "Approved",
      test: (r) => ["Approved", "Partially Approved"].includes(r.approvalStatus),
    },
    { key: "waiting", label: "Waiting Return", test: (r) => r.receivingStatus === "Waiting Return" },
    {
      key: "received",
      label: "Received",
      test: (r) => ["Received", "Partially Received"].includes(r.receivingStatus),
    },
    { key: "qc", label: "Pending QC", test: (r) => r.qcStatus === "Pending QC" },
    {
      key: "disposition",
      label: "Disposition Pending",
      test: (r) => r.dispositionStatus === "Disposition Pending",
    },
    { key: "credit", label: "Credit Note Pending", test: (r) => r.creditNoteStatus === "Pending" },
    { key: "closed", label: "Closed", test: (r) => ["Closed", "Credited"].includes(r.status) },
    { key: "rejected", label: "Rejected", test: (r) => r.status === "Rejected" },
    { key: "cancelled", label: "Cancelled", test: (r) => r.status === "Cancelled" },
  ],

  filters: [
    { id: "status", label: "Return Status", options: () => [...RTN_STATUS], test: (r, v) => r.status === v },
    { id: "returnType", label: "Return Type", options: () => [...RTN_TYPES], test: (r, v) => r.returnType === v },
    {
      id: "approvalStatus",
      label: "Approval Status",
      options: () => [...new Set(SALES_RETURNS.map((r) => r.approvalStatus))],
      test: (r, v) => r.approvalStatus === v,
    },
    {
      id: "qcStatus",
      label: "QC Status",
      options: () => [...new Set(SALES_RETURNS.map((r) => r.qcStatus))],
      test: (r, v) => r.qcStatus === v,
    },
    {
      id: "dispositionStatus",
      label: "Disposition",
      options: () => [...new Set(SALES_RETURNS.map((r) => r.dispositionStatus))],
      test: (r, v) => r.dispositionStatus === v,
    },
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(SALES_RETURNS.map((r) => r.customer))],
      test: (r, v) => r.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Representative",
      options: () => [...new Set(SALES_RETURNS.map((r) => r.salesRep).filter(Boolean))],
      test: (r, v) => r.salesRep === v,
    },
    {
      id: "warehouse",
      label: "Return Warehouse",
      options: () => [...new Set(SALES_RETURNS.map((r) => r.returnWarehouse).filter(Boolean))],
      test: (r, v) => r.returnWarehouse === v,
    },
    {
      id: "hasCredit",
      label: "Has Credit Note",
      options: () => ["Has credit note"],
      test: (r) => Boolean(r.creditNoteRef),
    },
    {
      id: "warranty",
      label: "Warranty Return",
      options: () => ["Warranty only"],
      test: (r) => r.returnType === "Warranty Return",
    },
    {
      id: "transit",
      label: "Transit Damage",
      options: () => ["Transit damage only"],
      test: (r) => r.returnType === "Transit Damage",
    },
  ],

  columns: [
    {
      key: "code",
      label: "Return Number",
      sortable: true,
      cell: (r) => (
        <CellMedia>
          <Thumb>{r.icon}</Thumb>
          <span className="font-medium">{r.code}</span>
        </CellMedia>
      ),
    },
    { key: "returnDate", label: "Return Date", sortable: true, muted: true, cell: (r) => r.returnDate },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (r) => (
        <>
          {r.customer}
          <CellSub>{r.customerCode}</CellSub>
        </>
      ),
    },
    {
      key: "sourceDoc",
      label: "Source Document",
      muted: true,
      cell: (r) =>
        r.sourceDoc ? (
          <>
            <span className="tnum">{r.sourceDoc}</span>
            <CellSub>{r.sourceType}</CellSub>
          </>
        ) : (
          <span className="text-ink-3">Manual</span>
        ),
    },
    { key: "returnType", label: "Return Type", cell: (r) => r.returnType },
    { key: "itemCount", label: "Items", align: "right", cell: (r) => fmt(r.itemCount) },
    { key: "requestedQty", label: "Return Qty", align: "right", sortable: true, cell: (r) => fmt(r.requestedQty) },
    {
      key: "returnValue",
      label: "Return Value (THB)",
      align: "right",
      sortable: true,
      cell: (r) => money(r.returnValue),
    },
    {
      key: "approvalStatus",
      label: "Approval Status",
      cell: (r) =>
        r.approvalStatus === "Not Submitted" ? (
          <span className="text-ink-3">{DASH}</span>
        ) : (
          <Badge tone={tone(RTN_APPROVAL_TONE, r.approvalStatus)}>{r.approvalStatus}</Badge>
        ),
    },
    {
      key: "receivingStatus",
      label: "Receiving Status",
      cell: (r) =>
        r.receivingStatus === "Not Applicable" ? (
          <span className="text-ink-3">{DASH}</span>
        ) : (
          <Badge tone={tone(RTN_RECEIVING_TONE, r.receivingStatus)}>{r.receivingStatus}</Badge>
        ),
    },
    {
      key: "qcStatus",
      label: "QC Status",
      cell: (r) =>
        r.qcStatus === "Not Applicable" ? (
          <span className="text-ink-3">{DASH}</span>
        ) : (
          <Badge tone={tone(RTN_QC_TONE, r.qcStatus)}>{r.qcStatus}</Badge>
        ),
    },
    {
      key: "dispositionStatus",
      label: "Disposition",
      cell: (r) =>
        r.dispositionStatus === "Not Applicable" ? (
          <span className="text-ink-3">{DASH}</span>
        ) : (
          <Badge tone={tone(RTN_DISPOSITION_TONE, r.dispositionStatus)}>
            {r.dispositionStatus.replace("Disposition ", "")}
          </Badge>
        ),
    },
    {
      key: "creditNoteStatus",
      label: "Credit Note Status",
      cell: (r) =>
        ["Not Applicable"].includes(r.creditNoteStatus) ? (
          <span className="text-ink-3">{DASH}</span>
        ) : (
          <Badge tone={tone(RTN_CREDIT_TONE, r.creditNoteStatus)}>{r.creditNoteStatus}</Badge>
        ),
    },
    {
      key: "status",
      label: "Return Status",
      cell: (r) => <Badge tone={tone(RTN_TONE, r.status)}>{r.status}</Badge>,
    },
    { key: "salesRep", label: "Sales Rep", muted: true, cell: (r) => r.salesRep || DASH },
    { key: "updated", label: "Updated At", muted: true, sortable: true, cell: (r) => r.updated },
  ],

  hero: () => ({
    kpis: [
      { label: "Total Returns", value: fmt(SALES_RETURNS.length), sub: "Returns", icon: "return" },
      {
        label: "Draft",
        value: fmt(SALES_RETURNS.filter((r) => r.status === "Draft").length),
        sub: "Returns",
        goTab: "draft",
      },
      {
        label: "Pending Approval",
        value: fmt(SALES_RETURNS.filter((r) => r.approvalStatus === "Pending Approval").length),
        sub: "Returns",
        tone: "warn",
        goTab: "pending",
      },
      {
        label: "Waiting Return",
        value: fmt(SALES_RETURNS.filter((r) => r.receivingStatus === "Waiting Return").length),
        sub: "Returns",
        goTab: "waiting",
      },
      {
        label: "Received",
        value: fmt(
          SALES_RETURNS.filter((r) => ["Received", "Partially Received"].includes(r.receivingStatus)).length,
        ),
        sub: "Returns",
        goTab: "received",
      },
      {
        label: "Pending QC",
        value: fmt(SALES_RETURNS.filter((r) => r.qcStatus === "Pending QC").length),
        sub: "Returns",
        tone: "warn",
        goTab: "qc",
      },
      {
        label: "Disposition Pending",
        value: fmt(SALES_RETURNS.filter((r) => r.dispositionStatus === "Disposition Pending").length),
        sub: "Returns",
        tone: "warn",
        goTab: "disposition",
      },
      {
        label: "Credit Note Pending",
        value: fmt(SALES_RETURNS.filter((r) => r.creditNoteStatus === "Pending").length),
        sub: "Returns",
        tone: "warn",
        goTab: "credit",
      },
      {
        label: "Closed",
        value: fmt(SALES_RETURNS.filter((r) => ["Closed", "Credited"].includes(r.status)).length),
        sub: "Returns",
        tone: "ok",
        goTab: "closed",
      },
      {
        label: "Total Return Value",
        value: money0(
          SALES_RETURNS.filter((r) => !["Cancelled", "Rejected"].includes(r.status)).reduce(
            (t, r) => t + r.returnValue,
            0,
          ),
        ),
        sub: "THB",
      },
    ],
  }),

  secondaryActions: (ctx) => [
    { label: "Create From Source", icon: "link", run: () => ctx.goto("/m/sales-return/new") },
    {
      label: "Receive Return",
      icon: "goodsReceipt",
      run: () =>
        ctx.toast(
          "รับคืนสินค้า",
          "เลือกคำขอคืนที่อยู่ในสถานะ Waiting Return แล้วกด Receive Return",
          "info",
        ),
    },
  ],

  bulkActions: (rows, ctx) => [
    { label: "Submit for Approval", icon: "send", run: () => rtnBulk(rows, "submit", ctx) },
    { label: "Approve", icon: "checkCircle", run: () => rtnBulk(rows, "approve", ctx) },
    { label: "Assign Return Warehouse", icon: "warehouse", run: () => rtnBulk(rows, "warehouse", ctx) },
    { label: "Assign Inspector", icon: "qc", run: () => rtnBulk(rows, "inspector", ctx) },
    { label: "Cancel Drafts", icon: "circleSlash", danger: true, run: () => rtnBulk(rows, "cancel", ctx) },
  ],

  rowActions: (r, ctx) => {
    const acts: RowAction<RtnRow>[] = [
      { label: "View", icon: "eye", run: (x) => ctx.openEntity("sales-return", x.code) },
      { label: "Open Full Detail", icon: "external", run: (x) => ctx.goto(`/m/sales-return/${x.code}`) },
    ];

    if (r.isEditable)
      acts.push({ label: "Edit", icon: "edit", run: (x) => ctx.goto(`/m/sales-return/${x.code}/edit`) });

    acts.push({ sep: true });

    if (r.canSubmit) acts.push({ label: "Submit for Approval", icon: "send", run: (x) => rtnSubmit(x, ctx) });
    if (r.canApprove) {
      acts.push({ label: "Approve", icon: "checkCircle", run: (x) => rtnApprove(x, ctx) });
      acts.push({ label: "Reject", icon: "xCircle", danger: true, run: (x) => rtnReject(x, ctx) });
    }
    if (r.canAuthorize) acts.push({ label: "Authorize Return", icon: "shield", run: (x) => rtnAuthorize(x, ctx) });
    if (r.canReceive) acts.push({ label: "Receive Return", icon: "goodsReceipt", run: (x) => rtnReceive(x, ctx) });
    if (r.canQc) acts.push({ label: "Start QC", icon: "qc", run: (x) => rtnStartQc(x, ctx) });
    if (r.canDisposition)
      acts.push({ label: "Complete Disposition", icon: "putAway", run: (x) => rtnDisposition(x, ctx) });
    if (r.canCreditNote)
      acts.push({ label: "Create Credit Note", icon: "creditNote", run: (x) => rtnCreditNote(x, ctx) });

    if (r.rmaNo) acts.push({ label: "Print RMA", icon: "printer", run: (x) => rtnPrintRma(x, ctx) });

    if (r.sourceDoc) {
      const entity =
        r.sourceType === "Shipment"
          ? "shipment"
          : r.sourceType === "Delivery Order"
            ? "delivery-order"
            : r.sourceType === "Sales Invoice"
              ? "sales-invoice"
              : "sales-order";
      acts.push({
        label: `ดู ${r.sourceDoc}`,
        icon: "link",
        run: () => ctx.openEntity(entity, r.sourceDoc),
      });
    }

    acts.push({ sep: true });
    if (!["Received", "Partially Received", "QC Completed", "Disposition Completed", "Credited", "Closed", "Cancelled"].includes(r.status))
      acts.push({ label: "Cancel Return", icon: "circleSlash", danger: true, run: (x) => rtnCancel(x, ctx) });

    return acts;
  },
};

export const RTN_DETAIL: DetailSchema<RtnRow> = {
  key: "sales-return",
  entityLabel: "Sales Return",

  identity: (r) => ({
    image: r.icon,
    code: r.code,
    title: r.customer,
    copyFields: [
      { label: "Return number", value: r.code },
      { label: "RMA", value: r.rmaNo || r.sourceDoc },
    ],
    badges: [
      { text: r.status, tone: tone(RTN_TONE, r.status) },
      ...(r.approvalStatus !== "Not Submitted"
        ? ([{ text: r.approvalStatus, tone: tone(RTN_APPROVAL_TONE, r.approvalStatus) }] as const)
        : []),
      ...(r.qcStatus !== "Not Applicable"
        ? ([{ text: r.qcStatus, tone: tone(RTN_QC_TONE, r.qcStatus) }] as const)
        : []),
      ...(r.openExceptions > 0
        ? ([{ text: `${r.openExceptions} exception`, tone: "warning" }] as const)
        : []),
    ],
    tags: [r.customerCode, r.returnType, r.rmaNo].filter(Boolean),
  }),

  kpis: (r) => [
    { icon: "return", label: "Return Value", value: money0(r.returnValue), sub: "THB", goTab: "items" },
    { icon: "box", label: "Requested Qty", value: fmt(r.requestedQty), sub: `อนุมัติ ${fmt(r.approvedQty)}`, goTab: "items" },
    {
      icon: "goodsReceipt",
      label: "Received Qty",
      value: fmt(r.receivedQty),
      sub: `ค้าง ${fmt(r.pendingQty)}`,
      goTab: "receiving",
    },
    {
      icon: "qc",
      label: "QC Result",
      value: r.qcStatus === "QC Completed" ? `รับ ${fmt(r.acceptedQty)}` : r.qcStatus,
      sub: r.qcStatus === "QC Completed" ? `ไม่รับ ${fmt(r.rejectedQty)}` : "รอตรวจ",
      wide: true,
      goTab: "qc",
    },
  ],

  tabs: [
    /* ---------- 1. OVERVIEW ---------- */
    {
      key: "overview",
      label: "Overview",
      aside: (r) => ({
        rows: [
          { icon: "calendar", label: "Return Date", value: r.returnDate },
          { icon: "return", label: "Return Type", value: r.returnType },
          { icon: "link", label: "Source Document", value: r.sourceDoc || "Manual", muted: !r.sourceDoc },
          { icon: "invoice", label: "Invoice Number", value: r.invoiceRef || DASH, muted: !r.invoiceRef },
          { icon: "shield", label: "RMA Number", value: r.rmaNo || DASH, muted: !r.rmaNo },
          { icon: "user", label: "Sales Representative", value: r.salesRep || DASH },
          { icon: "warehouse", label: "Return Warehouse", value: r.returnWarehouse || DASH },
        ],
      }),
      blocks: (r) => {
        const issues = submitReadiness(r);
        const blocking = issues.filter((i) => i.blocking);
        const mismatch = serialMismatches(r);

        return [
          r.status === "Rejected" && {
            type: "alert",
            tone: "danger",
            title: "คำขอคืนไม่ได้รับอนุมัติ",
            message: r.rejectReason || "ไม่ระบุเหตุผล",
          },
          r.status === "Cancelled" && {
            type: "alert",
            tone: "warn",
            title: "คำขอคืนถูกยกเลิก",
            message: r.cancelReason || "ไม่ระบุเหตุผล",
          },
          r.openExceptions > 0 && {
            type: "alert",
            tone: "warn",
            title: `มีเหตุผิดปกติที่ยังไม่ปิด ${r.openExceptions} รายการ`,
            message: (r.exceptions ?? []).find((e) => e.status !== "Resolved")?.desc ?? "",
          },
          r.periodExceeded && {
            type: "alert",
            tone: "warn",
            title: "เกินระยะเวลารับคืนมาตรฐาน",
            message: "คำขอนี้เกิน 30 วันนับจากวันที่ในใบแจ้งหนี้ — ต้องมีเหตุผลอนุมัติพิเศษ",
          },
          mismatch.length > 0 && {
            type: "alert",
            tone: "warn",
            title: "Serial ไม่ตรงกับใบขนส่งต้นทาง",
            message: mismatch.join(", "),
          },
          r.isEditable && blocking.length > 0 && {
            type: "alert",
            tone: "warn",
            title: `ยังส่งขออนุมัติไม่ได้ (${blocking.length} เรื่อง)`,
            message: blocking.map((b) => b.label).join(" · "),
          },
          {
            type: "note",
            title: "Stock",
            text: "สินค้าที่รับคืนจะเข้าคลังรับคืน / QC Hold เท่านั้น — จะกลายเป็นสต๊อกพร้อมขายก็ต่อเมื่อ QC รับและยืนยัน Disposition แล้ว",
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Return Information",
                items: [
                  { label: "Return Number", value: r.code },
                  { label: "Return Date", value: r.returnDate },
                  { label: "Return Type", value: r.returnType },
                  { label: "Status", value: <Badge tone={tone(RTN_TONE, r.status)}>{r.status}</Badge> },
                  { label: "Priority", value: <Badge tone={tone(PRIORITY_TONE, r.priority)}>{r.priority}</Badge> },
                  { label: "RMA Number", value: r.rmaNo || DASH },
                  { label: "Source Document Type", value: r.sourceType },
                  { label: "Source Document Number", value: r.sourceDoc || DASH },
                  { label: "Return Reason", value: r.returnReason, span: true },
                  { label: "Created By", value: r.createdBy, muted: true },
                ],
              },
              {
                type: "fields",
                title: "Customer Information",
                items: [
                  { label: "Customer Code", value: r.customerCode },
                  { label: "Customer Name", value: r.customer },
                  { label: "Customer Group", value: r.customerGroup || DASH },
                  { label: "Contact Person", value: r.contactPerson || DASH },
                  { label: "Contact Phone", value: r.contactPhone || DASH },
                  { label: "Email", value: r.email || DASH },
                  { label: "Sales Representative", value: r.salesRep || DASH },
                  { label: "Return Pickup Address", value: r.pickupAddress || DASH, span: true },
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
                  { label: "Original Invoice", value: r.invoiceRef || DASH },
                  { label: "Original Invoice Date", value: r.originalInvoiceDate || DASH },
                  { label: "Original Sales Order", value: r.soRef || DASH },
                  { label: "Original Shipment", value: r.shipmentRef || DASH },
                  { label: "Original Amount", value: r.originalAmount ? money(r.originalAmount) : DASH },
                  { label: "Estimated Return Value", value: <strong>{money(r.returnValue)}</strong> },
                  {
                    label: "Tax Impact",
                    value: money(Math.round(r.returnValue * 0.07 * 100) / 100),
                    muted: true,
                  },
                  {
                    label: "Credit Note Status",
                    value:
                      r.creditNoteStatus === "Not Applicable" ? (
                        DASH
                      ) : (
                        <Badge tone={tone(RTN_CREDIT_TONE, r.creditNoteStatus)}>{r.creditNoteStatus}</Badge>
                      ),
                  },
                ],
              },
              {
                type: "cards",
                title: "Operational Summary",
                cols: 2,
                items: [
                  { label: "Total Return Items", value: fmt(r.itemCount) },
                  { label: "Requested Qty", value: fmt(r.requestedQty) },
                  { label: "Approved Qty", value: fmt(r.approvedQty) },
                  { label: "Received Qty", value: fmt(r.receivedQty), tone: "accent" },
                  { label: "Accepted Qty", value: fmt(r.acceptedQty), tone: "accent" },
                  { label: "Rejected Qty", value: fmt(r.rejectedQty), tone: r.rejectedQty > 0 ? "warn" : undefined },
                  { label: "Pending Qty", value: fmt(r.pendingQty), tone: r.pendingQty > 0 ? "warn" : undefined },
                  { label: "Return Progress", value: `${r.progress}%` },
                ],
              },
            ],
          },
          { type: "note", title: "Notes", text: r.note || DASH },
        ];
      },
    },

    /* ---------- 2. RETURN ITEMS ---------- */
    {
      key: "items",
      label: "Return Items",
      blocks: (r) => {
        const dupes = duplicateSerials(r);
        return [
          dupes.length > 0 && {
            type: "alert",
            tone: "danger",
            title: "พบ Serial Number ซ้ำ",
            message: dupes.join(", "),
          },
          {
            type: "table",
            title: `Return Items (${r.itemCount})`,
            rows: (r.items ?? []).map((it) => ({
              ...it,
              remaining: remainingReturnable(it),
              over: Math.max(0, it.requestedQty - remainingReturnable(it)),
              credit: lineCredit(it),
              eligible: stockEligibility(it).filter((e) => e.blocking).length === 0,
            })),
            empty: "ไม่มีรายการ",
            cols: [
              { key: "line", label: "#", align: "right", muted: true },
              { key: "code", label: "Product Code", cell: (x) => <span className="tnum">{x.code}</span> },
              { key: "name", label: "Product Name" },
              { key: "sourceLine", label: "Source Line", align: "right", muted: true },
              { key: "shippedQty", label: "Shipped Qty", align: "right", muted: true, cell: (x) => fmt(x.shippedQty) },
              { key: "prevReturnedQty", label: "Prev. Returned", align: "right", muted: true, cell: (x) => fmt(x.prevReturnedQty) },
              {
                key: "remaining",
                label: "Remaining Returnable",
                align: "right",
                cell: (x) => <span className={x.remaining === 0 ? "text-ink-3" : ""}>{fmt(x.remaining)}</span>,
              },
              { key: "requestedQty", label: "Requested Qty", align: "right", cell: (x) => <strong>{fmt(x.requestedQty)}</strong> },
              {
                key: "over",
                label: "เกิน",
                align: "right",
                cell: (x) => (x.over > 0 ? <span className="font-semibold text-danger">{fmt(x.over)}</span> : DASH),
              },
              { key: "approvedQty", label: "Approved Qty", align: "right", cell: (x) => fmt(x.approvedQty) },
              { key: "receivedQty", label: "Received Qty", align: "right", cell: (x) => fmt(x.receivedQty) },
              { key: "acceptedQty", label: "Accepted", align: "right", cell: (x) => fmt(x.acceptedQty) },
              {
                key: "rejectedQty",
                label: "Rejected",
                align: "right",
                cell: (x) => (x.rejectedQty > 0 ? <span className="text-warning-text">{fmt(x.rejectedQty)}</span> : fmt(0)),
              },
              { key: "unit", label: "UOM", muted: true },
              { key: "serial", label: "Serial Number", muted: true, cell: (x) => x.serial || DASH },
              { key: "lot", label: "Lot Number", muted: true, cell: (x) => x.lot || DASH },
              { key: "expiry", label: "Expiry Date", muted: true, cell: (x) => x.expiry || DASH },
              { key: "condition", label: "Product Condition" },
              { key: "reason", label: "Return Reason", muted: true },
              { key: "credit", label: "Estimated Credit", align: "right", cell: (x) => <strong>{money(x.credit)}</strong> },
              {
                key: "disposition",
                label: "Disposition",
                cell: (x) => (x.disposition ? <Badge tone="info">{x.disposition}</Badge> : DASH),
              },
              {
                key: "eligible",
                label: "คืนเข้าสต๊อกได้?",
                cell: (x) =>
                  x.eligible ? (
                    <span className="text-success-text">ได้</span>
                  ) : (
                    <span className="text-warning-text">
                      {stockEligibility(x).find((e) => e.blocking)?.label ?? "ไม่ได้"}
                    </span>
                  ),
              },
              { key: "note", label: "Notes", muted: true, cell: (x) => x.note || DASH },
            ],
          },
          {
            type: "cards",
            title: "Item Totals",
            cols: 4,
            items: [
              { label: "Total Requested Qty", value: fmt(r.requestedQty), unit: "หน่วย" },
              { label: "Total Approved Qty", value: fmt(r.approvedQty), unit: "หน่วย" },
              { label: "Total Received Qty", value: fmt(r.receivedQty), unit: "หน่วย", tone: "accent" },
              { label: "Estimated Credit", value: money(r.returnValue), unit: "THB", tone: "accent" },
            ],
          },
        ];
      },
    },

    /* ---------- 3. APPROVAL ---------- */
    {
      key: "approval",
      label: "Approval",
      blocks: (r) => [
        {
          type: "fields",
          title: "Approval Summary",
          cols: 2,
          items: [
            {
              label: "Approval Status",
              value: <Badge tone={tone(RTN_APPROVAL_TONE, r.approvalStatus)}>{r.approvalStatus}</Badge>,
            },
            { label: "Requested Qty", value: fmt(r.requestedQty) },
            { label: "Approved Qty", value: fmt(r.approvedQty) },
            { label: "Estimated Credit", value: money(r.returnValue) },
            r.rejectReason ? { label: "Reject Reason", value: r.rejectReason, span: true } : null,
          ],
        },
        {
          type: "table",
          title: `Approval Steps (${r.approvals?.length ?? 0})`,
          rows: r.approvals ?? [],
          empty: "ยังไม่ได้ส่งขออนุมัติ",
          cols: [
            { key: "step", label: "Step", cell: (x) => <strong>{x.step}</strong> },
            { key: "role", label: "Approver Role", muted: true },
            { key: "approver", label: "Approver Name" },
            {
              key: "status",
              label: "Status",
              cell: (x) => (
                <Badge tone={x.status === "done" ? "success" : x.status === "rejected" ? "danger" : "warning"}>
                  {x.status === "done" ? "Approved" : x.status === "rejected" ? "Rejected" : "Pending"}
                </Badge>
              ),
            },
            { key: "requestedAt", label: "Requested At", muted: true },
            { key: "respondedAt", label: "Responded At", muted: true, cell: (x) => x.respondedAt || DASH },
            { key: "comment", label: "Comment", muted: true, cell: (x) => x.comment || DASH },
          ],
        },
        {
          type: "note",
          title: "Approval Policy",
          text: "ต้องขออนุมัติเมื่อ: มูลค่าคืนสูงกว่าเกณฑ์ · เกินระยะเวลารับคืน · สินค้าเปิดใช้แล้วหรือหมดอายุ · ขอเปลี่ยนสินค้า · เคลมประกัน · ลูกค้าขอเงินคืนเป็นเงินสด",
        },
      ],
    },

    /* ---------- 4. RETURN AUTHORIZATION ---------- */
    {
      key: "authorization",
      label: "Return Authorization",
      blocks: (r) => [
        !r.rmaNo && {
          type: "empty",
          title: "Return Authorization",
          icon: "shield",
          heading: "ยังไม่ได้ออก Return Authorization",
          message: "อนุมัติคำขอคืนก่อน แล้วจึงออก RMA เพื่อให้ลูกค้าส่งของกลับ",
        },
        Boolean(r.rmaNo) && {
          type: "fields",
          title: "Authorization",
          cols: 2,
          items: [
            { label: "RMA Number", value: <Badge tone="info">{r.rmaNo}</Badge> },
            { label: "Authorized Return Qty", value: fmt(r.approvedQty || r.requestedQty) },
            { label: "Return Warehouse", value: r.returnWarehouse },
            { label: "Return Method", value: r.returnMethod },
            { label: "Pickup Required", value: r.pickupRequired ? "ต้องไปรับ" : "ลูกค้าส่งกลับเอง" },
            { label: "Expected Return Date", value: r.expectedReturnDate || DASH },
            { label: "Authorization Expiry", value: r.authExpiryDate || DASH },
            { label: "Authorized By", value: r.authorizedBy || DASH },
            { label: "Authorized At", value: r.authorizedAt || DASH, muted: true },
            { label: "Contact Person", value: r.contactPerson || DASH },
            { label: "Return Instructions", value: r.returnInstructions || DASH, span: true },
            { label: "Packing Instructions", value: r.packingInstructions || DASH, span: true },
          ],
        },
      ],
    },

    /* ---------- 5. RECEIVING ---------- */
    {
      key: "receiving",
      label: "Receiving",
      blocks: (r) => {
        const rc = r.receiving;
        return [
          !rc && {
            type: "empty",
            title: "Receiving",
            icon: "goodsReceipt",
            heading: "ยังไม่ได้รับสินค้าคืน",
            message: "เมื่อสินค้ามาถึงคลัง ให้กด Receive Return เพื่อบันทึกจำนวนและสภาพพัสดุ",
          },
          Boolean(rc) && {
            type: "fields",
            title: "Receiving Information",
            cols: 2,
            items: [
              { label: "Received Date", value: rc!.receivedDate },
              { label: "Receiving Warehouse", value: rc!.warehouse },
              { label: "Receiver", value: rc!.receiver },
              { label: "Package Count", value: fmt(rc!.packageCount) },
              {
                label: "Package Condition",
                value: (
                  <Badge tone={rc!.packageCondition === "Good" ? "success" : "warning"}>
                    {rc!.packageCondition}
                  </Badge>
                ),
              },
              { label: "Delivery Reference", value: rc!.deliveryRef || DASH },
              { label: "Carrier", value: rc!.carrier || DASH },
              { label: "Tracking Number", value: rc!.trackingNo || DASH },
              { label: "Remark", value: rc!.remark || DASH, span: true },
            ],
          },
          {
            type: "cards",
            title: "Receiving Summary",
            cols: 4,
            items: [
              { label: "Approved Qty", value: fmt(r.approvedQty || r.requestedQty), unit: "หน่วย" },
              { label: "Received Qty", value: fmt(r.receivedQty), unit: "หน่วย", tone: "accent" },
              {
                label: "Missing Qty",
                value: fmt(r.pendingQty),
                unit: "หน่วย",
                tone: r.pendingQty > 0 ? "warn" : undefined,
              },
              {
                label: "Receiving Status",
                value: r.receivingStatus,
                tone: r.receivingStatus === "Received" ? "accent" : "warn",
              },
            ],
          },
          {
            type: "note",
            title: "Stock Location",
            text: `สินค้าที่รับคืนอยู่ที่ ${r.returnWarehouse || "คลังรับคืน"} ในสถานะ QC Hold — ยังไม่นับเป็นสต๊อกพร้อมขาย`,
          },
        ];
      },
    },

    /* ---------- 6. RETURN QC ---------- */
    {
      key: "qc",
      label: "Return QC",
      blocks: (r) => {
        const q = r.qc;
        return [
          !q && {
            type: "empty",
            title: "Return QC",
            icon: "qc",
            heading: "ยังไม่ได้ตรวจ QC",
            message: "รับสินค้าคืนแล้วจึงเริ่มตรวจ QC เพื่อกำหนดจำนวนที่รับได้และปลายทางของสินค้า",
          },
          Boolean(q) && {
            type: "fields",
            title: "QC Result",
            cols: 2,
            items: [
              { label: "QC Status", value: <Badge tone={tone(RTN_QC_TONE, r.qcStatus)}>{r.qcStatus}</Badge> },
              { label: "QC Result", value: <Badge tone="info">{q!.result}</Badge> },
              { label: "Inspector", value: q!.inspector },
              { label: "Inspection Date", value: q!.inspectionDate },
              { label: "QC Comment", value: q!.comment || DASH, span: true },
            ],
          },
          {
            type: "cards",
            title: "QC Quantities",
            cols: 4,
            items: [
              { label: "Received Qty", value: fmt(r.receivedQty), unit: "หน่วย" },
              { label: "Accepted Qty", value: fmt(r.acceptedQty), unit: "หน่วย", tone: "accent" },
              {
                label: "Rejected Qty",
                value: fmt(r.rejectedQty),
                unit: "หน่วย",
                tone: r.rejectedQty > 0 ? "warn" : undefined,
              },
              { label: "Hold Qty", value: fmt(r.holdQty), unit: "หน่วย", tone: r.holdQty > 0 ? "warn" : undefined },
            ],
          },
          Boolean(q) && {
            type: "table",
            title: "QC Checklist",
            rows: (q!.checklist ?? []).filter((c) => c.result),
            empty: "ไม่ได้บันทึกผลรายการตรวจ",
            cols: [
              { key: "item", label: "Checklist Item" },
              {
                key: "result",
                label: "Result",
                cell: (c) => (
                  <Badge tone={c.result === "pass" ? "success" : c.result === "fail" ? "danger" : "neutral"}>
                    {String(c.result).toUpperCase()}
                  </Badge>
                ),
              },
              { key: "comment", label: "Comment", muted: true, cell: (c) => c.comment || DASH },
            ],
          },
          {
            type: "note",
            title: "Stock Rule",
            text: "ผล QC ยังไม่คืนของเข้าสต๊อกขาย — ต้องยืนยัน Disposition อีกขั้นหนึ่ง",
          },
        ];
      },
    },

    /* ---------- 7. DISPOSITION ---------- */
    {
      key: "disposition",
      label: "Disposition",
      blocks: (r) => [
        {
          type: "fields",
          title: "Disposition Summary",
          cols: 2,
          items: [
            {
              label: "Disposition Status",
              value: (
                <Badge tone={tone(RTN_DISPOSITION_TONE, r.dispositionStatus)}>{r.dispositionStatus}</Badge>
              ),
            },
            { label: "Accepted Qty", value: fmt(r.acceptedQty) },
            { label: "Rejected Qty", value: fmt(r.rejectedQty) },
            { label: "Hold Qty", value: fmt(r.holdQty) },
            r.supplierClaimRef
              ? { label: "Supplier Claim", value: <Badge tone="info">{r.supplierClaimRef}</Badge> }
              : null,
          ],
        },
        {
          type: "table",
          title: "Line Disposition",
          rows: (r.items ?? []).filter((it) => it.inspectedQty > 0 || it.disposition),
          empty: "ยังไม่ได้กำหนด Disposition",
          cols: [
            { key: "code", label: "Product Code", cell: (x) => <span className="tnum">{x.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "acceptedQty", label: "Accepted", align: "right", cell: (x) => fmt(x.acceptedQty) },
            { key: "rejectedQty", label: "Rejected", align: "right", cell: (x) => fmt(x.rejectedQty) },
            { key: "holdQty", label: "Hold", align: "right", cell: (x) => fmt(x.holdQty) },
            {
              key: "disposition",
              label: "Disposition",
              cell: (x) => (x.disposition ? <Badge tone="info">{x.disposition}</Badge> : DASH),
            },
            { key: "destWarehouse", label: "Destination Warehouse", muted: true, cell: (x) => x.destWarehouse || DASH },
            { key: "destLocation", label: "Destination Location", muted: true, cell: (x) => x.destLocation || DASH },
          ],
        },
        {
          type: "note",
          title: "Disposition Rules",
          text: "คืนเข้าสต๊อกพร้อมขายได้เฉพาะเมื่อ QC รับ · ไม่หมดอายุ · ซีลปลอดเชื้อไม่ถูกเปิด · สินค้าขายต่อได้ · Serial/Lot ถูกต้อง",
        },
        {
          type: "planned",
          title: "Stock Ledger",
          label: "Stock movement posting",
          message: "การเดินบัญชีคลังจริงจะเชื่อมในเฟสถัดไป — เฟสนี้บันทึกเป็น stock movement จำลอง",
        },
      ],
    },

    /* ---------- 8. CREDIT NOTE ---------- */
    {
      key: "credit",
      label: "Credit Note",
      blocks: (r, ctx) => [
        {
          type: "fields",
          title: "Credit Note Handoff",
          cols: 2,
          items: [
            {
              label: "Credit Note Status",
              value:
                r.creditNoteStatus === "Not Applicable" ? (
                  DASH
                ) : (
                  <Badge tone={tone(RTN_CREDIT_TONE, r.creditNoteStatus)}>{r.creditNoteStatus}</Badge>
                ),
            },
            {
              label: "Credit Note Number",
              value: r.creditNoteRef ? <Badge tone="info">{r.creditNoteRef}</Badge> : DASH,
            },
            { label: "Source Invoice", value: r.invoiceRef || DASH },
            { label: "Requested Resolution", value: r.requestedResolution },
            { label: "Estimated Credit", value: <strong>{money(r.returnValue)}</strong> },
            { label: "Tax (7%)", value: money(Math.round(r.returnValue * 0.07 * 100) / 100), muted: true },
          ],
        },
        {
          type: "node",
          title: "Actions",
          node: (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => rtnCreditNote(r, ctx)}
                className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                Create Credit Note
              </button>
              <button
                type="button"
                onClick={() => rtnReplacement(r, ctx)}
                className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                Create Replacement Sales Order
              </button>
            </div>
          ),
        },
        {
          type: "note",
          title: "Policy",
          text: "การสร้างคำขอคืนไม่ได้สร้างใบลดหนี้ให้อัตโนมัติ — ใบลดหนี้ออกหลังอนุมัติหรือรับของคืนแล้วตามนโยบายบริษัท และเป็นเอกสารคนละใบ",
        },
        {
          type: "planned",
          title: "Credit Note Module",
          label: "Full credit note",
          message: "การออกใบลดหนี้เต็มรูปแบบและการตัดยอดลูกหนี้จะทำในโมดูล Credit Note",
        },
      ],
    },

    /* ---------- 9. SOURCE DOCUMENTS ---------- */
    {
      key: "source",
      label: "Source Documents",
      blocks: (r, ctx) => {
        const siblings = r.sourceDoc ? returnsForSource(r.sourceDoc) : [];
        const items = [
          r.shipmentRef && {
            name: r.shipmentRef,
            sub: `Shipment · ${r.customer}`,
            avatar: "SH",
            end: <Badge tone="info">Source</Badge>,
            onClick: () => ctx.openEntity("shipment", r.shipmentRef),
          },
          r.invoiceRef && {
            name: r.invoiceRef,
            sub: `Sales Invoice · ${r.originalInvoiceDate || ""}`,
            avatar: "IN",
            end: <Badge tone="neutral">Billing</Badge>,
            onClick: () => ctx.openEntity("sales-invoice", r.invoiceRef),
          },
          r.soRef && {
            name: r.soRef,
            sub: `Sales Order · ${r.customer}`,
            avatar: "SO",
            end: <Badge tone="neutral">Upstream</Badge>,
            onClick: () => ctx.openEntity("sales-order", r.soRef),
          },
        ].filter(Boolean) as { name: string; sub: string; avatar: string; end: React.ReactNode; onClick: () => void }[];

        return [
          {
            type: "entity",
            title: "Source Documents",
            empty: "คำขอคืนนี้เป็นแบบ Manual — ไม่ได้อ้างอิงเอกสารต้นทาง",
            items,
          },
          siblings.length > 1 && {
            type: "table",
            title: `คำขอคืนอื่นจากเอกสารเดียวกัน (${siblings.length - 1})`,
            rows: siblings.filter((x) => x.code !== r.code),
            cols: [
              {
                key: "code",
                label: "Return Number",
                cell: (x) => (
                  <button
                    onClick={() => ctx.openEntity("sales-return", x.code)}
                    className="font-medium text-info hover:underline tnum"
                  >
                    {x.code}
                  </button>
                ),
              },
              { key: "returnDate", label: "Return Date", muted: true },
              { key: "requestedQty", label: "Qty", align: "right", cell: (x) => fmt(x.requestedQty) },
              { key: "status", label: "Status", cell: (x) => <Badge tone={tone(RTN_TONE, x.status)}>{x.status}</Badge> },
            ],
          },
          {
            type: "note",
            title: "Partial Return",
            text: "เอกสารต้นทางหนึ่งใบเปิดคำขอคืนได้หลายครั้ง — ระบบตัดจำนวนที่คืนไปแล้วออกจากยอดคงเหลือให้อัตโนมัติ",
          },
        ];
      },
    },

    /* ---------- 10. DOCUMENT RELATIONSHIP ---------- */
    {
      key: "relationship",
      label: "Document Relationship",
      blocks: (r, ctx) => {
        const soon = (name: string) => ctx.toast(name, `โมดูล ${name} กำลังจะมา — Coming Soon`, "info");
        return [
          {
            type: "note",
            title: "Document Flow",
            text: "Sales Request → Sales Order → Picking → Packing → Delivery Order → Sales Invoice → Shipment → Sales Return → Credit Note",
          },
          {
            type: "entity",
            title: "Source Documents",
            empty: "ไม่มีเอกสารต้นทาง",
            items: [
              r.shipmentRef && {
                name: r.shipmentRef,
                sub: `Shipment · ${r.returnDate} · ${fmt(r.requestedQty)} หน่วย · ${r.createdBy}`,
                avatar: "SH",
                end: <Badge tone="info">Source</Badge>,
                onClick: () => ctx.openEntity("shipment", r.shipmentRef),
              },
              r.invoiceRef && {
                name: r.invoiceRef,
                sub: `Sales Invoice · ${money0(r.originalAmount)} THB`,
                avatar: "IN",
                end: <Badge tone="neutral">Billing</Badge>,
                onClick: () => ctx.openEntity("sales-invoice", r.invoiceRef),
              },
              r.soRef && {
                name: r.soRef,
                sub: `Sales Order · ${r.customer}`,
                avatar: "SO",
                end: <Badge tone="neutral">Upstream</Badge>,
                onClick: () => ctx.openEntity("sales-order", r.soRef),
              },
            ].filter(Boolean) as { name: string; sub: string; avatar: string; end: React.ReactNode; onClick: () => void }[],
          },
          {
            type: "entity",
            title: "Target Documents",
            empty: "ยังไม่มีเอกสารปลายทาง",
            items: [
              {
                name: r.receiving ? `Return Receipt · ${r.receiving.deliveryRef || r.code}` : "Return Receipt",
                sub: r.receiving ? `รับคืน ${fmt(r.receivedQty)} หน่วย · ${r.receiving.receivedDate}` : "ยังไม่ได้รับของคืน",
                avatar: "RR",
                end: <Badge tone={r.receiving ? "success" : "neutral"}>{r.receiving ? "Received" : "Pending"}</Badge>,
                onClick: () => ctx.toast("Return Receipt", `${r.code} — ดูรายละเอียดในแท็บ Receiving`, "info"),
              },
              {
                name: r.qc ? `Return QC · ${r.qc.result}` : "Return QC",
                sub: r.qc ? `${r.qc.inspector} · ${r.qc.inspectionDate}` : "ยังไม่ได้ตรวจ QC",
                avatar: "QC",
                end: <Badge tone={r.qc ? "success" : "neutral"}>{r.qc ? "Completed" : "Pending"}</Badge>,
                onClick: () => ctx.toast("Return QC", `${r.code} — ดูรายละเอียดในแท็บ Return QC`, "info"),
              },
              {
                name: r.creditNoteRef || "Credit Note",
                sub: r.creditNoteRef ? "ออกใบลดหนี้แล้ว" : "ยังไม่ได้ออกใบลดหนี้",
                avatar: "CN",
                end: (
                  <Badge tone={r.creditNoteRef ? "info" : "neutral"}>
                    {r.creditNoteRef ? "Created" : "Coming Soon"}
                  </Badge>
                ),
                onClick: () => soon("Credit Note"),
              },
              {
                name: r.replacementRef || "Replacement Sales Order",
                sub: r.replacementRef ? "สร้างใบสั่งขายทดแทนแล้ว" : "ยังไม่ได้สร้างใบทดแทน",
                avatar: "SO",
                end: <Badge tone={r.replacementRef ? "info" : "neutral"}>{r.replacementRef ? "Created" : "—"}</Badge>,
                onClick: () =>
                  r.replacementRef
                    ? ctx.toast("Replacement", `${r.replacementRef} — เอกสารจำลอง`, "info")
                    : rtnReplacement(r, ctx),
              },
              {
                name: r.supplierClaimRef || "Supplier Claim",
                sub: r.supplierClaimRef ? "เปิดเคลมผู้ผลิตแล้ว" : "ยังไม่ได้เปิดเคลม",
                avatar: "SC",
                end: <Badge tone="neutral">Coming Soon</Badge>,
                onClick: () => soon("Supplier Claim"),
              },
            ],
          },
        ];
      },
    },

    /* ---------- 11. TIMELINE ---------- */
    {
      key: "timeline",
      label: "Timeline",
      blocks: (r) => [
        {
          type: "timeline",
          title: "Activity",
          items: (r.history ?? []).map((h) => ({
            title: h.t,
            detail: h.d,
            user: h.u,
            when: h.when,
            kind: h.kind,
          })),
        },
        {
          type: "table",
          title: `Return Exceptions (${r.exceptions?.length ?? 0})`,
          rows: r.exceptions ?? [],
          empty: "ไม่มีเหตุผิดปกติ",
          cols: [
            { key: "type", label: "Exception Type", cell: (x) => <strong>{x.type}</strong> },
            { key: "when", label: "Date and Time", muted: true },
            {
              key: "severity",
              label: "Severity",
              cell: (x) => (
                <Badge tone={x.severity === "Critical" ? "danger" : x.severity === "High" ? "warning" : "neutral"}>
                  {x.severity}
                </Badge>
              ),
            },
            { key: "party", label: "Responsible", muted: true, cell: (x) => x.party || DASH },
            { key: "desc", label: "Description" },
            { key: "resolution", label: "Resolution", muted: true, cell: (x) => x.resolution || DASH },
            {
              key: "status",
              label: "Status",
              cell: (x) => <Badge tone={x.status === "Resolved" ? "success" : "warning"}>{x.status}</Badge>,
            },
          ],
        },
        {
          type: "planned",
          title: "Phase 2",
          label: "Rich activity feed",
          message: "ความคิดเห็น การแนบไฟล์ และการแจ้งเตือนลูกค้าจะเพิ่มในเฟสถัดไป",
        },
      ],
    },

    /* ---------- 12. AUDIT LOG ---------- */
    {
      key: "audit",
      label: "Audit Log",
      blocks: (r) => [
        { type: "audit", title: "Change History", items: r.audit ?? [] },
        {
          type: "planned",
          title: "Phase 2",
          label: "Field-level audit",
          message: "การบันทึกทุกการเปลี่ยนแปลงระดับฟิลด์พร้อมผู้ใช้และอุปกรณ์จะเพิ่มในเฟสถัดไป",
        },
      ],
    },
  ],

  actions: (r, ctx) => {
    const acts: RowAction<RtnRow>[] = [];

    if (r.canSubmit) acts.push({ label: "Submit for Approval", icon: "send", run: () => rtnSubmit(r, ctx) });
    if (r.canApprove) {
      acts.push({ label: "Approve", icon: "checkCircle", run: () => rtnApprove(r, ctx) });
      acts.push({ label: "Reject", icon: "xCircle", danger: true, run: () => rtnReject(r, ctx) });
    }
    if (r.canAuthorize) acts.push({ label: "Authorize Return", icon: "shield", run: () => rtnAuthorize(r, ctx) });
    if (r.canReceive) acts.push({ label: "Receive Returned Goods", icon: "goodsReceipt", run: () => rtnReceive(r, ctx) });
    if (r.canQc) acts.push({ label: "Start QC", icon: "qc", run: () => rtnStartQc(r, ctx) });
    if (r.canDisposition)
      acts.push({ label: "Complete Disposition", icon: "putAway", run: () => rtnDisposition(r, ctx) });
    if (r.canCreditNote)
      acts.push({ label: "Create Credit Note", icon: "creditNote", run: () => rtnCreditNote(r, ctx) });

    acts.push({ label: "Record Exception", icon: "alert", run: () => rtnException(r, ctx) });
    if (r.rmaNo) acts.push({ label: "Print RMA", icon: "printer", run: () => rtnPrintRma(r, ctx) });
    if (r.dispositionStatus === "Disposition Completed" && r.status !== "Closed")
      acts.push({ label: "Close Return", icon: "checkCircle", run: () => rtnClose(r, ctx) });

    if (!["Received", "Partially Received", "QC Completed", "Disposition Completed", "Credited", "Closed", "Cancelled"].includes(r.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Return", icon: "circleSlash", danger: true, run: () => rtnCancel(r, ctx) });
    }

    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("sales-return", r, ctx));
    return acts;
  },
};

export const rtnSchemas: EntitySchemas<RtnRow> = {
  list: RTN_LIST,
  detail: RTN_DETAIL,
  form: RTN_FORM,
};
