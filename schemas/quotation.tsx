import { printActions } from "@/lib/print/actions";
import { QUOTATIONS, creditCheck, getCustomer, type QtRow } from "@/lib/domain/outbound";
import { docDiscTotal, docSubtotal, docTaxTotal, lineNet } from "@/lib/domain/lines";
import { QT_STATUS } from "@/data/quotations";
import { QT_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import {
  qtAccept,
  qtCancel,
  qtConvert,
  qtDelete,
  qtReject,
  qtSend,
} from "@/lib/workflows-outbound";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";

/* ============================================================
   QUOTATION — optional. The price offer that may precede a Sales
   Request. Nothing here reserves stock or commits the company.
   Draft → Sent → Accepted → Converted / Rejected / Expired
   ============================================================ */

export const QT_LIST: ListSchema<QtRow> = {
  key: "quotation",
  entity: "Quotation",
  entityPlural: "Quotations",
  title: "Quotations",
  subtitle: "ใบเสนอราคาที่ส่งให้ลูกค้า — ขั้นตอนนี้ไม่บังคับ ลูกค้าตอบรับแล้วจึงเปิดคำขอขาย",
  crumb: "Quotation",
  primaryLabel: "New Quotation",
  searchPlaceholder: "ค้นหาเลขที่ใบเสนอราคา ลูกค้า หรือพนักงานขาย...",
  emptyTitle: "ไม่พบใบเสนอราคาที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => QUOTATIONS,
  searchFields: ["code", "customer", "salesRep", "customerRef", "note"],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (q) => q.status === "Draft" },
    { key: "sent", label: "Sent", test: (q) => q.status === "Sent" },
    { key: "accepted", label: "Accepted", test: (q) => q.status === "Accepted" },
    { key: "expiring", label: "ใกล้หมดอายุ", test: (q) => q.isExpiring || q.isExpired },
    { key: "rejected", label: "Rejected", test: (q) => q.status === "Rejected" },
    { key: "converted", label: "Converted", test: (q) => q.status === "Converted" },
  ],

  filters: [
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(QUOTATIONS.map((q) => q.customer))],
      test: (q, v) => q.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Rep",
      options: () => [...new Set(QUOTATIONS.map((q) => q.salesRep))],
      test: (q, v) => q.salesRep === v,
    },
    {
      id: "channel",
      label: "Channel",
      options: () => [...new Set(QUOTATIONS.map((q) => q.channel))],
      test: (q, v) => q.channel === v,
    },
    { id: "status", label: "Status", options: () => [...QT_STATUS], test: (q, v) => q.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Quotation No.",
      sortable: true,
      cell: (q) => (
        <CellMedia>
          <Thumb>{q.icon}</Thumb>
          <span className="font-medium">{q.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (q) => (
        <>
          {q.customer}
          <CellSub>{q.customerCode}</CellSub>
        </>
      ),
    },
    {
      key: "salesRep",
      label: "Sales Rep",
      muted: true,
      cell: (q) => q.salesRep.split(" - ")[1] ?? q.salesRep,
    },
    { key: "quoteDate", label: "Quote Date", muted: true, sortable: true, cell: (q) => q.quoteDate },
    {
      key: "validUntil",
      label: "Valid Until",
      sortable: true,
      cell: (q) =>
        q.isExpired || q.isExpiring ? (
          <span className="font-semibold text-warning-text">{q.validUntil}</span>
        ) : (
          q.validUntil
        ),
    },
    { key: "itemCount", label: "Items", align: "right", cell: (q) => fmt(q.itemCount) },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortable: true,
      cell: (q) => (
        <>
          {money0(q.amount)}
          <CellSub>{q.currency}</CellSub>
        </>
      ),
    },
    {
      key: "srRef",
      label: "Sales Request",
      muted: true,
      cell: (q) => (q.srRef ? <Badge tone="info">{q.srRef}</Badge> : DASH),
    },
    {
      key: "status",
      label: "Status",
      cell: (q) =>
        q.isExpired ? (
          <Badge tone="danger">Expired</Badge>
        ) : (
          <Badge tone={tone(QT_TONE, q.status)}>{q.status}</Badge>
        ),
    },
  ],

  rowActions: (qt, ctx) => {
    const acts: RowAction<QtRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("quotation", r) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/quotation/${r.code}`) },
    ];

    if (["Draft", "Sent"].includes(qt.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/quotation/${r.code}/edit`) });

    acts.push({ sep: true });

    if (qt.status === "Draft")
      acts.push({ label: "Send to Customer", icon: "send", run: (r) => qtSend(r, ctx) });

    if (qt.status === "Sent") {
      acts.push({ label: "Mark Accepted", icon: "checkCircle", run: (r) => qtAccept(r, ctx) });
      acts.push({ label: "Mark Rejected", icon: "xCircle", danger: true, run: (r) => qtReject(r, ctx) });
    }

    if (qt.status === "Accepted")
      acts.push({ label: "Convert to Sales Request", icon: "salesRequest", run: (r) => qtConvert(r, ctx) });

    if (qt.srRef)
      acts.push({
        label: `ดู ${qt.srRef}`,
        icon: "salesRequest",
        run: () => ctx.openEntity("sales-request", qt.srRef),
      });

    acts.push({
      label: "Print Quotation",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบเสนอราคา", `${r.code} — Future support`, "info"),
    });

    acts.push({ sep: true });
    if (qt.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => qtDelete(r, ctx) });
    else if (!["Cancelled", "Converted"].includes(qt.status))
      acts.push({ label: "Cancel", icon: "circleSlash", danger: true, run: (r) => qtCancel(r, ctx) });

    return acts;
  },
};

export const QT_DETAIL: DetailSchema<QtRow> = {
  key: "quotation",
  entityLabel: "Quotation",

  identity: (q) => ({
    image: q.icon,
    code: q.code,
    title: q.customer,
    copyFields: [
      { label: "Quotation number", value: q.code },
      { label: "Amount", value: `${money0(q.amount)} ${q.currency}` },
    ],
    badges: [
      { text: q.status, tone: tone(QT_TONE, q.status) },
      ...(q.isExpired ? ([{ text: "Expired", tone: "danger" }] as const) : []),
      ...(q.isExpiring ? ([{ text: `อีก ${q.daysLeft} วัน`, tone: "warning" }] as const) : []),
    ],
    tags: [q.customerCode, q.channel, q.priceList].filter(Boolean),
  }),

  kpis: (q) => [
    { icon: "tag", label: "Quotation Value", value: money0(q.amount), sub: q.currency, goTab: "items" },
    { icon: "box", label: "Line Items", value: fmt(q.itemCount), sub: "รายการ", goTab: "items" },
    {
      icon: "clock",
      label: "Valid Until",
      value: q.validUntil,
      sub: q.daysLeft === null ? DASH : q.daysLeft < 0 ? "หมดอายุแล้ว" : `อีก ${q.daysLeft} วัน`,
      goTab: "overview",
    },
    {
      icon: "salesRep",
      label: "Sales Rep",
      value: q.salesRep.split(" - ")[1] ?? q.salesRep,
      sub: q.srRef || "ยังไม่ได้แปลง",
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      aside: (q) => {
        const credit = creditCheck(`${q.customerCode} - ${q.customer}`, q.amount);
        return {
          rows: [
            { icon: "partner", label: "Customer", value: q.customer },
            { icon: "user", label: "Sales Rep", value: q.salesRep.split(" - ")[1] ?? q.salesRep },
            { icon: "priceList", label: "Price List", value: q.priceList },
            { icon: "tag", label: "Payment Term", value: q.payTerm },
            {
              icon: "pricing",
              label: "Credit Available",
              value: credit.cashOnly ? "เงินสด" : money0(credit.available),
              muted: credit.cashOnly,
            },
            { icon: "salesRequest", label: "Sales Request", value: q.srRef || DASH, muted: !q.srRef },
            { icon: "clock", label: "Last Updated", value: q.updated, muted: true },
          ],
        };
      },
      blocks: (q) => {
        const bp = getCustomer(`${q.customerCode} - ${q.customer}`);
        return [
          {
            type: "note",
            title: "ขั้นตอนนี้ไม่บังคับ",
            text: "ใบเสนอราคาเป็นทางเลือก คำขอขายเปิดตรงโดยไม่มีใบเสนอราคาก็ได้ — และเอกสารนี้ไม่จองสต๊อก",
          },
          q.isExpired && {
            type: "alert",
            tone: "danger",
            title: "ใบเสนอราคาหมดอายุแล้ว",
            message: `หมดอายุเมื่อ ${q.validUntil} — ต้องออกใบเสนอราคาใหม่ก่อนเปิดคำขอขาย`,
          },
          q.isExpiring && {
            type: "alert",
            tone: "warn",
            title: "ใบเสนอราคาใกล้หมดอายุ",
            message: `เหลืออีก ${q.daysLeft} วัน (หมดอายุ ${q.validUntil}) — ควรติดตามลูกค้า`,
          },
          q.status === "Rejected" && {
            type: "alert",
            tone: "warn",
            title: "ลูกค้าไม่รับข้อเสนอ",
            message: `เหตุผล: ${q.rejectReason || "ไม่ระบุ"}`,
          },
          {
            type: "fields",
            title: "Customer Information",
            cols: 2,
            items: [
              { label: "Customer", value: q.customer },
              { label: "Customer Code", value: q.customerCode },
              { label: "Tax ID", value: bp?.tax?.taxId || DASH },
              { label: "Customer Reference", value: q.customerRef || DASH },
              { label: "Sales Channel", value: q.channel },
              { label: "Payment Term", value: q.payTerm },
            ],
          },
          {
            type: "fields",
            title: "Quotation Information",
            cols: 2,
            items: [
              { label: "Quotation No.", value: q.code },
              { label: "Status", value: <Badge tone={tone(QT_TONE, q.status)}>{q.status}</Badge> },
              { label: "Sales Rep", value: q.salesRep },
              { label: "Price List", value: q.priceList },
              { label: "Quote Date", value: q.quoteDate },
              { label: "Valid Until", value: q.validUntil },
              { label: "Currency", value: q.currency },
              q.srRef ? { label: "Sales Request", value: <Badge tone="info">{q.srRef}</Badge> } : null,
              q.rejectReason ? { label: "Reject Reason", value: q.rejectReason, span: true } : null,
            ],
          },
          { type: "note", title: "Note", text: q.note || DASH },
          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created By", value: q.createdBy, muted: true },
              { label: "Created Date", value: q.created, muted: true },
              { label: "Last Updated By", value: q.updatedBy, muted: true },
              { label: "Last Updated", value: q.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "items",
      label: "Items",
      blocks: (q) => [
        {
          type: "table",
          title: `Quoted Items (${q.itemCount})`,
          rows: (q.items ?? []).map((it) => ({ ...it, net: lineNet(it) })),
          empty: "ไม่มีรายการสินค้า",
          cols: [
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
            { key: "unit", label: "UOM", muted: true },
            { key: "price", label: "Unit Price", align: "right", cell: (r) => money0(r.price) },
            { key: "disc", label: "Disc %", align: "right", cell: (r) => (r.disc ? `${r.disc}%` : DASH) },
            { key: "tax", label: "Tax %", align: "right", cell: (r) => `${r.tax}%` },
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
            { label: "Subtotal", value: money0(docSubtotal(q)), unit: q.currency },
            { label: "Discount", value: money0(docDiscTotal(q)), unit: q.currency },
            { label: "Tax", value: money0(docTaxTotal(q)), unit: q.currency },
            { label: "Grand Total", value: money0(q.amount), unit: q.currency, tone: "accent" },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (q) => [
        {
          type: "timeline",
          title: "Activity",
          items: (q.history ?? []).map((h) => ({
            title: h.t,
            detail: h.d,
            user: h.u,
            when: h.when,
            kind: h.kind,
          })),
        },
      ],
    },
  ],

  actions: (qt, ctx) => {
    const acts: RowAction<QtRow>[] = [];
    if (qt.status === "Draft") acts.push({ label: "Send to Customer", icon: "send", run: () => qtSend(qt, ctx) });
    if (qt.status === "Sent") {
      acts.push({ label: "Mark Accepted", icon: "checkCircle", run: () => qtAccept(qt, ctx) });
      acts.push({ label: "Mark Rejected", icon: "xCircle", danger: true, run: () => qtReject(qt, ctx) });
    }
    if (qt.status === "Accepted")
      acts.push({ label: "Convert to Sales Request", icon: "salesRequest", run: () => qtConvert(qt, ctx) });
    acts.push({
      label: "Print Quotation",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ใบเสนอราคา", `${qt.code} — Future support`, "info"),
    });
    if (!["Cancelled", "Converted"].includes(qt.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Quotation", icon: "circleSlash", danger: true, run: () => qtCancel(qt, ctx) });
    }
    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("quotation", qt, ctx));
    return acts;
  },
};

export const qtSchemas: EntitySchemas<QtRow> = {
  list: QT_LIST,
  detail: QT_DETAIL,
  /* No `form`: a quotation is created and edited as the document itself.
     The three-step wizard is gone, and with it the schema that described it —
     its validation and save now live in lib/domain/quotation-draft.ts, which
     the editor and the print preview both read. */
  editor: ({ record }) => <QuotationEditor record={record} />,
};
