import { printActions } from "@/lib/print/actions";
import { can } from "@/lib/domain/admin";
import {
  SALES_REQUESTS,
  availabilityFor,
  creditCheck,
  getCustomer,
  getQT,
  type SrRow,
} from "@/lib/domain/outbound";
import { displayName, docDiscTotal, docSubtotal, docTaxTotal, lineNet } from "@/lib/domain/lines";
import { SR_STATUS } from "@/data/sales-requests";
import { PRIORITY_TONE, QT_TONE, SRQ_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import {
  srApprove,
  srCancel,
  srConvert,
  srDelete,
  srReject,
  srReopen,
  srSubmit,
} from "@/lib/workflows-outbound";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { SalesRequestDocument } from "@/components/sales-request/SalesRequestDocument";
import { SalesRequestEditor } from "@/components/sales-request/SalesRequestEditor";
import { CommentThread } from "@/components/document/CommentThread";

/* ============================================================
   SALES REQUEST — the REQUIRED first operational document.

     Quotation (optional) → Sales Request → Sales Order

   Draft → Submitted → Approved → Converted
                     → Rejected

   A Sales Request never reserves stock. Availability shown here is
   indicative; the Sales Order is what commits inventory.
   ============================================================ */

export const SR_LIST: ListSchema<SrRow> = {
  key: "sales-request",
  entity: "Sales Request",
  entityPlural: "Sales Requests",
  title: "Sales Requests",
  subtitle:
    "คำขอขายจากลูกค้า ผ่านการอนุมัติภายในก่อนแปลงเป็นใบสั่งขาย — เอกสารนี้ยังไม่จองสต๊อก",
  crumb: "Sales Request",
  primaryLabel: "New Sales Request",
  searchPlaceholder: "ค้นหาเลขที่คำขอ ลูกค้า พนักงานขาย หรือใบเสนอราคา...",
  emptyTitle: "ไม่พบคำขอขายที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => SALES_REQUESTS,
  searchFields: ["code", "customer", "salesRep", "customerRef", "quotationRef", "note"],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (s) => s.status === "Draft" },
    { key: "submitted", label: "รออนุมัติ", test: (s) => s.status === "Submitted" },
    { key: "approved", label: "Approved", test: (s) => s.status === "Approved" },
    { key: "urgent", label: "ใกล้ถึงกำหนด", test: (s) => s.isUrgent },
    { key: "rejected", label: "Rejected", test: (s) => s.status === "Rejected" },
    { key: "converted", label: "Converted", test: (s) => s.status === "Converted" },
  ],

  filters: [
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(SALES_REQUESTS.map((s) => s.customer))],
      test: (s, v) => s.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Rep",
      options: () => [...new Set(SALES_REQUESTS.map((s) => s.salesRep))],
      test: (s, v) => s.salesRep === v,
    },
    {
      id: "source",
      label: "Source",
      options: () => ["จากใบเสนอราคา", "ลูกค้าติดต่อตรง"],
      test: (s, v) => (v === "จากใบเสนอราคา" ? Boolean(s.quotationRef) : !s.quotationRef),
    },
    { id: "status", label: "Status", options: () => [...SR_STATUS], test: (s, v) => s.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Request No.",
      sortable: true,
      cell: (s) => (
        <CellMedia>
          <Thumb>{s.icon}</Thumb>
          <span className="font-medium">{s.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (s) => (
        <>
          {s.customer}
          <CellSub>{s.customerCode}</CellSub>
        </>
      ),
    },
    {
      key: "salesRep",
      label: "Sales Rep",
      muted: true,
      cell: (s) => s.salesRep.split(" - ")[1] ?? s.salesRep,
    },
    {
      key: "quotationRef",
      label: "Quotation",
      muted: true,
      cell: (s) =>
        s.quotationRef ? (
          <Badge tone="info">{s.quotationRef}</Badge>
        ) : (
          <span className="text-ink-3">ติดต่อตรง</span>
        ),
    },
    { key: "requestDate", label: "Request Date", muted: true, sortable: true, cell: (s) => s.requestDate },
    {
      key: "requiredDate",
      label: "Required Date",
      sortable: true,
      cell: (s) =>
        s.isUrgent ? (
          <span className="font-semibold text-warning-text">{s.requiredDate}</span>
        ) : (
          s.requiredDate
        ),
    },
    { key: "itemCount", label: "Items", align: "right", cell: (s) => fmt(s.itemCount) },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortable: true,
      cell: (s) => (
        <>
          {money0(s.amount)}
          <CellSub>{s.currency}</CellSub>
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (s) => <Badge tone={tone(SRQ_TONE, s.status)}>{s.status}</Badge>,
    },
  ],

  rowActions: (sr, ctx) => {
    const acts: RowAction<SrRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.openEntity("sales-request", r.code) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/sales-request/${r.code}`),
      },
    ];

    if (["Draft", "Submitted"].includes(sr.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/sales-request/${r.code}/edit`) });

    acts.push({ sep: true });

    if (sr.status === "Draft")
      acts.push({ label: "Submit for Approval", icon: "send", run: (r) => srSubmit(r, ctx) });

    /* The rep raises and submits; only an approver sees the rest. A button
       nobody may press is worse than no button — it reads as a bug. */
    const mayApprove = can("sales-request", "approve");

    if (sr.status === "Submitted" && mayApprove) {
      acts.push({ label: "Approve", icon: "checkCircle", run: (r) => srApprove(r, ctx) });
      acts.push({ label: "Reject", icon: "xCircle", danger: true, run: (r) => srReject(r, ctx) });
    }

    if (sr.isConvertible && mayApprove)
      acts.push({ label: "Convert to Sales Order", icon: "salesOrder", run: (r) => srConvert(r, ctx) });

    if (sr.status === "Approved" && !sr.soRef && mayApprove)
      acts.push({ label: "Reopen as Draft", icon: "refresh", run: (r) => srReopen(r, ctx) });

    if (sr.quotationRef)
      acts.push({
        label: `ดู ${sr.quotationRef}`,
        icon: "quotation",
        run: () => ctx.openEntity("quotation", sr.quotationRef),
      });

    if (sr.soRef)
      acts.push({
        label: `ดู ${sr.soRef}`,
        icon: "salesOrder",
        run: () => ctx.openEntity("sales-order", sr.soRef),
      });

    acts.push({
      label: "Print Request",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์คำขอขาย", `${r.code} — Future support`, "info"),
    });

    acts.push({ sep: true });
    if (sr.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => srDelete(r, ctx) });
    else if (!["Cancelled", "Converted"].includes(sr.status))
      acts.push({ label: "Cancel", icon: "circleSlash", danger: true, run: (r) => srCancel(r, ctx) });

    return acts;
  },
};

export const SR_DETAIL: DetailSchema<SrRow> = {
  key: "sales-request",
  entityLabel: "Sales Request",

  identity: (sr) => ({
    image: sr.icon,
    code: sr.code,
    title: sr.customer,
    copyFields: [
      { label: "Request number", value: sr.code },
      { label: "Amount", value: `${money0(sr.amount)} ${sr.currency}` },
    ],
    badges: [
      { text: sr.status, tone: tone(SRQ_TONE, sr.status) },
      ...(sr.isUrgent ? ([{ text: "ใกล้ถึงกำหนด", tone: "warning" }] as const) : []),
      { text: sr.priority, tone: tone(PRIORITY_TONE, sr.priority) },
    ],
    tags: [sr.customerCode, sr.channel, sr.quotationRef || "ติดต่อตรง"].filter(Boolean),
  }),

  kpis: (sr) => [
    { icon: "tag", label: "Request Value", value: money0(sr.amount), sub: sr.currency, goTab: "items" },
    { icon: "box", label: "Line Items", value: fmt(sr.itemCount), sub: "รายการ", goTab: "items" },
    {
      icon: "calendar",
      label: "Required Date",
      value: sr.requiredDate,
      sub:
        sr.daysToRequired === null
          ? DASH
          : sr.daysToRequired < 0
            ? "เลยกำหนดแล้ว"
            : `อีก ${sr.daysToRequired} วัน`,
      goTab: "overview",
    },
    {
      icon: "shield",
      label: "Approval",
      value: sr.status === "Approved" || sr.status === "Converted" ? "Approved" : sr.status,
      sub: sr.approvedBy || "ยังไม่ได้อนุมัติ",
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      aside: (sr) => {
        const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);
        return {
          rows: [
            { icon: "partner", label: "Customer", value: sr.customer },
            { icon: "user", label: "Sales Rep", value: sr.salesRep.split(" - ")[1] ?? sr.salesRep },
            {
              icon: "quotation",
              label: "Quotation",
              value: sr.quotationRef || "ไม่มี (ติดต่อตรง)",
              muted: !sr.quotationRef,
            },
            { icon: "warehouse", label: "Warehouse", value: sr.warehouse || DASH, muted: !sr.warehouse },
            { icon: "priceList", label: "Price List", value: sr.priceList },
            {
              icon: "pricing",
              label: "Credit Available",
              value: credit.cashOnly ? "เงินสด" : money0(credit.available),
              muted: credit.cashOnly,
            },
            { icon: "salesOrder", label: "Sales Order", value: sr.soRef || DASH, muted: !sr.soRef },
          ],
        };
      },
      blocks: (sr) => {
        const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);
        const bp = getCustomer(`${sr.customerCode} - ${sr.customer}`);
        const qt = sr.quotationRef ? getQT(sr.quotationRef) : null;

        return [
          {
            type: "note",
            title: "คำขอขายไม่จองสต๊อก",
            text: "จำนวนคงเหลือที่แสดงเป็นข้อมูลอ้างอิงเท่านั้น สต๊อกจะถูกจองเมื่อยืนยันใบสั่งขาย",
          },
          sr.status === "Submitted" && {
            type: "alert",
            tone: "info",
            title: "รออนุมัติภายใน",
            message: `ส่งขออนุมัติเมื่อ ${sr.updated} — ผู้อนุมัติต้องตรวจเครดิตและเงื่อนไขราคาก่อนกด Approve`,
          },
          sr.status === "Rejected" && {
            type: "alert",
            tone: "danger",
            title: "คำขอขายไม่ได้รับอนุมัติ",
            message: `เหตุผล: ${sr.rejectReason || "ไม่ระบุ"} — แก้ไขแล้วส่งขออนุมัติใหม่ได้`,
          },
          sr.isUrgent && {
            type: "alert",
            tone: "warn",
            title: "ใกล้ถึงกำหนดที่ลูกค้าต้องการ",
            message: `ลูกค้าต้องการของวันที่ ${sr.requiredDate}${
              sr.daysToRequired !== null && sr.daysToRequired >= 0
                ? ` — เหลืออีก ${sr.daysToRequired} วัน`
                : " — เลยกำหนดแล้ว"
            }`,
          },
          !credit.withinLimit && {
            type: "alert",
            tone: "warn",
            title: "มูลค่าเกินวงเงินเครดิตของลูกค้า",
            message: `วงเงินคงเหลือ ${money0(credit.available)} บาท — อนุมัติได้ แต่ใบสั่งขายที่แปลงออกมาจะถูกตั้งเป็น On Hold`,
          },
          {
            type: "fields",
            title: "Customer Information",
            cols: 2,
            items: [
              { label: "Customer", value: sr.customer },
              { label: "Customer Code", value: sr.customerCode },
              { label: "Tax ID", value: bp?.tax?.taxId || DASH },
              { label: "Customer Reference", value: sr.customerRef || DASH },
              { label: "Sales Channel", value: sr.channel },
              { label: "Payment Term", value: sr.payTerm },
            ],
          },
          {
            type: "fields",
            title: "Request Information",
            cols: 2,
            items: [
              { label: "Request No.", value: sr.code },
              { label: "Status", value: <Badge tone={tone(SRQ_TONE, sr.status)}>{sr.status}</Badge> },
              { label: "Sales Rep", value: sr.salesRep },
              {
                label: "Priority",
                value: <Badge tone={tone(PRIORITY_TONE, sr.priority)}>{sr.priority}</Badge>,
              },
              { label: "Request Date", value: sr.requestDate },
              { label: "Required Date", value: sr.requiredDate },
              { label: "Price List", value: sr.priceList },
              { label: "Warehouse", value: sr.warehouse || DASH },
              {
                label: "Source Quotation",
                value: qt ? (
                  <Badge tone={tone(QT_TONE, qt.status)}>{qt.code}</Badge>
                ) : (
                  "ไม่มี — ลูกค้าติดต่อตรง"
                ),
              },
              sr.soRef ? { label: "Sales Order", value: <Badge tone="info">{sr.soRef}</Badge> } : null,
            ],
          },
          {
            type: "fields",
            title: "Internal Approval",
            cols: 2,
            items: [
              { label: "Approved By", value: sr.approvedBy || DASH, muted: !sr.approvedBy },
              { label: "Approved Date", value: sr.approvedDate || DASH, muted: !sr.approvedDate },
              {
                label: "Credit Check",
                value: (
                  <Badge tone={credit.withinLimit ? "success" : "warning"}>
                    {credit.cashOnly
                      ? "เงินสด"
                      : credit.withinLimit
                        ? "อยู่ในวงเงิน"
                        : `เกิน ${money0(credit.overBy)}`}
                  </Badge>
                ),
              },
              sr.rejectReason
                ? { label: "Reject Reason", value: sr.rejectReason, span: true }
                : null,
            ],
          },
          { type: "note", title: "Note", text: sr.note || DASH },
          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created By", value: sr.createdBy, muted: true },
              { label: "Created Date", value: sr.created, muted: true },
              { label: "Last Updated By", value: sr.updatedBy, muted: true },
              { label: "Last Updated", value: sr.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "items",
      label: "Items",
      blocks: (sr) => [
        {
          type: "table",
          title: `Requested Items (${sr.itemCount})`,
          rows: (sr.items ?? []).map((it) => {
            const a = availabilityFor(it.code, it.qty);
            return { ...it, net: lineNet(it), avail: a?.available ?? null, short: a?.shortBy ?? 0 };
          }),
          empty: "ไม่มีรายการสินค้า",
          cols: [
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            {
              key: "name",
              label: "Product Name",
              /* Always the salesperson's wording on screen, whatever showOnBill says:
                 the people handling the order need to see what the customer was told. */
              cell: (it) => displayName(it),
            },
            { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
            { key: "unit", label: "UOM", muted: true },
            {
              key: "avail",
              label: "Available",
              align: "right",
              muted: true,
              cell: (r) => (r.avail === null ? DASH : fmt(r.avail)),
            },
            {
              key: "short",
              label: "ขาด",
              align: "right",
              cell: (r) =>
                r.short > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(r.short)}</span>
                ) : (
                  DASH
                ),
            },
            { key: "price", label: "Unit Price", align: "right", cell: (r) => money0(r.price) },
            { key: "disc", label: "Disc %", align: "right", cell: (r) => (r.disc ? `${r.disc}%` : DASH) },
            {
              key: "net",
              label: "Net Amount",
              align: "right",
              cell: (r) => <span className="font-medium">{money0(r.net)}</span>,
            },
            { key: "note", label: "Note", muted: true },
          ],
        },
        {
          type: "cards",
          title: "Totals",
          items: [
            { label: "Subtotal", value: money0(docSubtotal(sr)), unit: sr.currency },
            { label: "Discount", value: money0(docDiscTotal(sr)), unit: sr.currency },
            { label: "Tax", value: money0(docTaxTotal(sr)), unit: sr.currency },
            { label: "Grand Total", value: money0(sr.amount), unit: sr.currency, tone: "accent" },
          ],
        },
        {
          type: "note",
          title: "Stock",
          text: "คอลัมน์ Available และ ขาด เป็นภาพสต๊อก ณ ขณะนี้ ไม่ได้ถูกจองไว้ให้คำขอนี้",
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (sr) => [
        {
          type: "timeline",
          title: "Activity",
          items: (sr.history ?? []).map((h) => ({
            title: h.t,
            detail: h.d,
            user: h.u,
            when: h.when,
            kind: h.kind,
          })),
        },
        {
          /* Under the history rather than in a tab of its own: a question
             about this request is usually a question about something in the
             list above it, and the two read as one column. Same thread the
             quotation and the purchase request carry. */
          type: "node",
          node: (
            <CommentThread
              docCode={sr.code}
              people={[
                sr.createdBy,
                sr.salesRep,
                sr.updatedBy,
                ...(sr.history ?? []).map((h) => h.u),
              ]}
              departments={["Sales"]}
            />
          ),
        },
      ],
    },
  ],

  actions: (sr, ctx) => {
    const acts: RowAction<SrRow>[] = [];
    if (sr.status === "Draft")
      acts.push({ label: "Submit for Approval", icon: "send", run: () => srSubmit(sr, ctx) });
    const mayApprove = can("sales-request", "approve");
    if (sr.status === "Submitted" && mayApprove) {
      acts.push({ label: "Approve", icon: "checkCircle", run: () => srApprove(sr, ctx) });
      acts.push({ label: "Reject", icon: "xCircle", danger: true, run: () => srReject(sr, ctx) });
    }
    if (sr.isConvertible && mayApprove)
      acts.push({ label: "Convert to Sales Order", icon: "salesOrder", run: () => srConvert(sr, ctx) });
    if (sr.status === "Approved" && !sr.soRef && mayApprove)
      acts.push({ label: "Reopen as Draft", icon: "refresh", run: () => srReopen(sr, ctx) });
    acts.push({
      label: "Print Request",
      icon: "printer",
      run: () => ctx.toast("พิมพ์คำขอขาย", `${sr.code} — Future support`, "info"),
    });
    if (!["Cancelled", "Converted"].includes(sr.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Request", icon: "circleSlash", danger: true, run: () => srCancel(sr, ctx) });
    }
    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("sales-request", sr, ctx));
    return acts;
  },
};

export const srSchemas: EntitySchemas<SrRow> = {
  list: SR_LIST,
  detail: SR_DETAIL,
  /* Read as the request. The tabbed profile above stays as what the Quick
     View drawer renders — a glance from the list is a different job from
     standing in front of the paper with a signature to give. */
  document: ({ record }) => <SalesRequestDocument record={record} />,
  /* No `form`: a sales request is created and edited as the document itself.
     The three-step wizard is gone, and with it the schema that described it —
     validation and save now live in lib/domain/sales-request-draft.ts, which
     the editor and the print preview both read. */
  editor: ({ record }) => <SalesRequestEditor record={record} />,
};
