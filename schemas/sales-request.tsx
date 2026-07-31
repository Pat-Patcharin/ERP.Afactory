import {
  SALES_REQUESTS,
  creditCheck,
  getCustomer,
  type SrRow,
} from "@/lib/domain/outbound";
import { docDiscTotal, docSubtotal, docTaxTotal, lineNet } from "@/lib/domain/lines";
import { SR_STATUS } from "@/data/sales-requests";
import { PRIORITY_TONE, SRQ_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import { srAccept, srCancel, srConvert, srDelete, srReject, srSend } from "@/lib/workflows-outbound";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { SR_FORM } from "./forms/sales-request";

/* ============================================================
   SALES REQUEST — the quotation sent to the customer.
   Draft → Sent → Accepted → Converted to Sales Order
                → Rejected / Expired
   ============================================================ */

const validityBadge = (sr: SrRow) => {
  if (sr.isExpired) return <Badge tone="danger">Expired</Badge>;
  if (sr.isExpiring) return <Badge tone="warning">อีก {sr.daysLeft} วัน</Badge>;
  return <Badge tone={tone(SRQ_TONE, sr.status)}>{sr.status}</Badge>;
};

export const SR_LIST: ListSchema<SrRow> = {
  key: "sales-request",
  entity: "Sales Request",
  entityPlural: "Sales Requests",
  title: "Sales Requests",
  subtitle: "ใบขอเสนอราคาที่ส่งให้ลูกค้า ติดตามการตอบรับและแปลงเป็นใบสั่งขาย",
  crumb: "Sales Request",
  primaryLabel: "New Quotation",
  searchPlaceholder: "ค้นหาเลขที่ใบเสนอราคา ลูกค้า หรือพนักงานขาย...",
  emptyTitle: "ไม่พบใบเสนอราคาที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => SALES_REQUESTS,
  searchFields: ["code", "customer", "salesRep", "customerRef", "note"],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (s) => s.status === "Draft" },
    { key: "sent", label: "Sent", test: (s) => s.status === "Sent" },
    { key: "accepted", label: "Accepted", test: (s) => s.status === "Accepted" },
    { key: "expiring", label: "ใกล้หมดอายุ", test: (s) => s.isExpiring || s.isExpired },
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
      id: "channel",
      label: "Channel",
      options: () => [...new Set(SALES_REQUESTS.map((s) => s.channel))],
      test: (s, v) => s.channel === v,
    },
    { id: "status", label: "Status", options: () => [...SR_STATUS], test: (s, v) => s.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Quotation No.",
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
    { key: "salesRep", label: "Sales Rep", muted: true, cell: (s) => s.salesRep.split(" - ")[1] ?? s.salesRep },
    { key: "requestDate", label: "Request Date", muted: true, sortable: true, cell: (s) => s.requestDate },
    {
      key: "validUntil",
      label: "Valid Until",
      sortable: true,
      cell: (s) =>
        s.isExpired || s.isExpiring ? (
          <span className="font-semibold text-warning-text">{s.validUntil}</span>
        ) : (
          s.validUntil
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
    { key: "status", label: "Status", cell: (s) => validityBadge(s) },
  ],

  rowActions: (sr, ctx) => {
    const acts: RowAction<SrRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("sales-request", r) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/sales-request/${r.code}`),
      },
    ];

    if (["Draft", "Sent"].includes(sr.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/sales-request/${r.code}/edit`) });

    acts.push({ sep: true });

    if (sr.status === "Draft")
      acts.push({ label: "Send to Customer", icon: "send", run: (r) => srSend(r, ctx) });

    if (sr.status === "Sent") {
      acts.push({ label: "Mark Accepted", icon: "checkCircle", run: (r) => srAccept(r, ctx) });
      acts.push({ label: "Mark Rejected", icon: "xCircle", danger: true, run: (r) => srReject(r, ctx) });
    }

    if (sr.status === "Accepted")
      acts.push({ label: "Convert to Sales Order", icon: "salesOrder", run: (r) => srConvert(r, ctx) });

    if (sr.soRef)
      acts.push({
        label: `ดู ${sr.soRef}`,
        icon: "salesOrder",
        run: () => ctx.openEntity("sales-order", sr.soRef),
      });

    acts.push({
      label: "Print Quotation",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบเสนอราคา", `${r.code} — Future support`, "info"),
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
      { label: "Quotation number", value: sr.code },
      { label: "Amount", value: `${money0(sr.amount)} ${sr.currency}` },
    ],
    badges: [
      { text: sr.status, tone: tone(SRQ_TONE, sr.status) },
      ...(sr.isExpired ? ([{ text: "Expired", tone: "danger" }] as const) : []),
      ...(sr.isExpiring ? ([{ text: `อีก ${sr.daysLeft} วัน`, tone: "warning" }] as const) : []),
      { text: sr.priority, tone: tone(PRIORITY_TONE, sr.priority) },
    ],
    tags: [sr.customerCode, sr.channel, sr.priceList].filter(Boolean),
  }),

  kpis: (sr) => [
    { icon: "tag", label: "Quotation Value", value: money0(sr.amount), sub: sr.currency, goTab: "items" },
    { icon: "box", label: "Line Items", value: fmt(sr.itemCount), sub: "รายการ", goTab: "items" },
    {
      icon: "clock",
      label: "Valid Until",
      value: sr.validUntil,
      sub: sr.daysLeft === null ? DASH : sr.daysLeft < 0 ? "หมดอายุแล้ว" : `อีก ${sr.daysLeft} วัน`,
      goTab: "overview",
    },
    {
      icon: "salesRep",
      label: "Sales Rep",
      value: sr.salesRep.split(" - ")[1] ?? sr.salesRep,
      sub: sr.customerCode,
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
            { icon: "warehouse", label: "Warehouse", value: sr.warehouse },
            { icon: "priceList", label: "Price List", value: sr.priceList },
            { icon: "tag", label: "Payment Term", value: sr.payTerm },
            {
              icon: "circleSlash",
              label: "Credit Available",
              value: credit.cashOnly ? "เงินสด" : money0(credit.available),
              muted: credit.cashOnly,
            },
            { icon: "clock", label: "Last Updated", value: sr.updated, muted: true },
          ],
        };
      },
      blocks: (sr) => {
        const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);
        const bp = getCustomer(`${sr.customerCode} - ${sr.customer}`);

        return [
          sr.isExpired && {
            type: "alert",
            tone: "danger",
            title: "ใบเสนอราคาหมดอายุแล้ว",
            message: `หมดอายุเมื่อ ${sr.validUntil} — ต้องออกใบเสนอราคาใหม่ก่อนแปลงเป็นใบสั่งขาย`,
          },
          sr.isExpiring && {
            type: "alert",
            tone: "warn",
            title: "ใบเสนอราคาใกล้หมดอายุ",
            message: `เหลืออีก ${sr.daysLeft} วัน (หมดอายุ ${sr.validUntil}) — ควรติดตามลูกค้า`,
          },
          !credit.withinLimit && {
            type: "alert",
            tone: "warn",
            title: "มูลค่าเกินวงเงินเครดิตของลูกค้า",
            message: `วงเงินคงเหลือ ${money0(credit.available)} บาท — หากแปลงเป็นใบสั่งขาย ระบบจะตั้งเป็น On Hold รอฝ่ายบัญชีอนุมัติ`,
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
            title: "Quotation Information",
            cols: 2,
            items: [
              { label: "Quotation No.", value: sr.code },
              { label: "Status", value: <Badge tone={tone(SRQ_TONE, sr.status)}>{sr.status}</Badge> },
              { label: "Sales Rep", value: sr.salesRep },
              { label: "Priority", value: <Badge tone={tone(PRIORITY_TONE, sr.priority)}>{sr.priority}</Badge> },
              { label: "Request Date", value: sr.requestDate },
              { label: "Valid Until", value: sr.validUntil },
              { label: "Price List", value: sr.priceList },
              { label: "Warehouse", value: sr.warehouse },
              sr.soRef ? { label: "Sales Order", value: <Badge tone="info">{sr.soRef}</Badge> } : null,
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
          title: `Quoted Items (${sr.itemCount})`,
          rows: (sr.items ?? []).map((it) => ({ ...it, net: lineNet(it) })),
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
            { label: "Subtotal", value: money0(docSubtotal(sr)), unit: sr.currency },
            { label: "Discount", value: money0(docDiscTotal(sr)), unit: sr.currency },
            { label: "Tax", value: money0(docTaxTotal(sr)), unit: sr.currency },
            { label: "Grand Total", value: money0(sr.amount), unit: sr.currency, tone: "accent" },
          ],
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
      ],
    },
  ],

  actions: (sr, ctx) => {
    const acts: RowAction<SrRow>[] = [];
    if (sr.status === "Draft") acts.push({ label: "Send to Customer", icon: "send", run: () => srSend(sr, ctx) });
    if (sr.status === "Sent") {
      acts.push({ label: "Mark Accepted", icon: "checkCircle", run: () => srAccept(sr, ctx) });
      acts.push({ label: "Mark Rejected", icon: "xCircle", danger: true, run: () => srReject(sr, ctx) });
    }
    if (sr.status === "Accepted")
      acts.push({ label: "Convert to Sales Order", icon: "salesOrder", run: () => srConvert(sr, ctx) });
    acts.push({
      label: "Print Quotation",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ใบเสนอราคา", `${sr.code} — Future support`, "info"),
    });
    if (!["Cancelled", "Converted"].includes(sr.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Quotation", icon: "circleSlash", danger: true, run: () => srCancel(sr, ctx) });
    }
    return acts;
  },
};

export const srSchemas: EntitySchemas<SrRow> = {
  list: SR_LIST,
  detail: SR_DETAIL,
  form: SR_FORM,
};
