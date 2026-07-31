import {
  PURCHASE_ORDERS,
  poDiscTotal,
  poLineBase,
  poLineNet,
  poRemainingQty,
  poSubtotal,
  poSupplierInfo,
  poTaxTotal,
  type PoRow,
} from "@/lib/domain/purchase";
import { PO_STATUS } from "@/data/purchase-orders";
import { PO_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import { poCancel, poDelete, poIssue, poReceive } from "@/lib/workflows";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { PO_FORM } from "./forms/purchase-order";

/* ============================================================
   PURCHASE ORDER
   Belongs to ONE supplier. Receiving is partial-aware:
   Draft → Open → Partial Received → Completed
   ============================================================ */

export const PO_LIST: ListSchema<PoRow> = {
  key: "purchase-order",
  entity: "Purchase Order",
  entityPlural: "Purchase Orders",
  title: "Purchase Orders",
  subtitle: "จัดการใบสั่งซื้อที่ส่งให้ผู้ขายสินค้า ติดตามการรับของและสถานะการจัดส่ง",
  crumb: "Purchase Order",
  primaryLabel: "New PO",
  searchPlaceholder: "ค้นหาเลขที่ PO ผู้ขายสินค้า ผู้ซื้อ หรือคลัง...",
  emptyTitle: "ไม่พบใบสั่งซื้อที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => PURCHASE_ORDERS,
  searchFields: ["code", "supplier", "buyer", "warehouse", "remark"],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (p) => p.status === "Draft" },
    { key: "open", label: "Open", test: (p) => p.status === "Open" },
    { key: "partial", label: "Partial Received", test: (p) => p.status === "Partial Received" },
    { key: "completed", label: "Completed", test: (p) => p.status === "Completed" },
    { key: "cancelled", label: "Cancelled", test: (p) => p.status === "Cancelled" },
  ],

  filters: [
    {
      id: "supplier",
      label: "Supplier",
      options: () => [...new Set(PURCHASE_ORDERS.map((p) => p.supplier))],
      test: (p, v) => p.supplier === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(PURCHASE_ORDERS.map((p) => p.warehouse))],
      test: (p, v) => p.warehouse === v,
    },
    {
      id: "buyer",
      label: "Buyer",
      options: () => [...new Set(PURCHASE_ORDERS.map((p) => p.buyer))],
      test: (p, v) => p.buyer === v,
    },
    { id: "status", label: "Status", options: () => [...PO_STATUS], test: (p, v) => p.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "PO Number",
      sortable: true,
      cell: (p) => (
        <CellMedia>
          <Thumb>{p.icon}</Thumb>
          <span className="font-medium">{p.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "supplier",
      label: "Supplier",
      sortable: true,
      cell: (p) => (
        <>
          {p.supplier}
          <CellSub>★ {poSupplierInfo(p.supplier).rating}</CellSub>
        </>
      ),
    },
    { key: "buyer", label: "Buyer", muted: true, cell: (p) => p.buyer },
    { key: "orderDate", label: "Order Date", muted: true, sortable: true, cell: (p) => p.orderDate },
    {
      key: "expectedDate",
      label: "Expected Date",
      sortable: true,
      cell: (p) =>
        p.isOverdue ? (
          <span className="font-semibold text-warning-text">{p.expectedDate}</span>
        ) : (
          p.expectedDate
        ),
    },
    { key: "warehouse", label: "Warehouse", muted: true, cell: (p) => p.warehouse },
    {
      key: "total",
      label: "Total Amount",
      align: "right",
      sortable: true,
      cell: (p) => (
        <>
          {money0(p.total)}
          <CellSub>{p.currency}</CellSub>
        </>
      ),
    },
    {
      key: "recvPct",
      label: "Received %",
      align: "right",
      sortable: true,
      sortValue: (p) => p.recvPct,
      cell: (p) => (
        <UtilBar pct={p.recvPct} tone={p.recvPct >= 100 ? "full" : p.recvPct > 0 ? "mid" : undefined} />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (p) =>
        p.isOverdue && p.status === "Open" ? (
          <Badge tone="danger">Overdue</Badge>
        ) : (
          <Badge tone={tone(PO_TONE, p.status)}>{p.status}</Badge>
        ),
    },
  ],

  rowActions: (po, ctx) => {
    const acts: RowAction<PoRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("purchase-order", r) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/purchase-order/${r.code}`),
      },
    ];

    if (po.status === "Draft" || po.status === "Open")
      acts.push({
        label: "Edit",
        icon: "edit",
        run: (r) => ctx.goto(`/m/purchase-order/${r.code}/edit`),
      });

    acts.push({ sep: true });

    if (po.status === "Draft")
      acts.push({ label: "Issue PO", icon: "send", run: (r) => poIssue(r, ctx) });

    // Receiving stays available while there is outstanding quantity.
    if (["Open", "Partial Received"].includes(po.status) && poRemainingQty(po) > 0)
      acts.push({ label: "Receive Goods", icon: "goodsReceipt", run: (r) => poReceive(r, ctx) });

    if (po.prRef)
      acts.push({
        label: `ดู ${po.prRef}`,
        icon: "purchaseRequest",
        run: () => ctx.openEntity("purchase-request", po.prRef),
      });

    acts.push({
      label: "Print PDF",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ PDF", `${r.code} — Future support`, "info"),
    });
    acts.push({
      label: "Email Supplier",
      icon: "mail",
      run: (r) => ctx.toast("ส่งอีเมลถึงผู้ขายสินค้า", `${r.supplier} — Future support`, "info"),
    });

    acts.push({ sep: true });
    if (po.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => poDelete(r, ctx) });
    else if (!["Cancelled", "Completed", "Closed"].includes(po.status))
      acts.push({ label: "Cancel PO", icon: "circleSlash", danger: true, run: (r) => poCancel(r, ctx) });

    return acts;
  },
};

export const PO_DETAIL: DetailSchema<PoRow> = {
  key: "purchase-order",
  entityLabel: "Purchase Order",

  identity: (po) => ({
    image: po.icon,
    code: po.code,
    title: po.supplier,
    copyFields: [
      { label: "PO number", value: po.code },
      { label: "Total", value: `${money0(po.total)} ${po.currency}` },
    ],
    badges: [
      po.isOverdue && po.status === "Open"
        ? { text: "Overdue", tone: "danger" as const }
        : { text: po.status, tone: tone(PO_TONE, po.status) },
      { text: `★ ${poSupplierInfo(po.supplier).rating}`, tone: "neutral" },
    ],
    tags: [po.buyer, po.warehouse, po.currency].filter(Boolean),
  }),

  kpis: (po) => [
    { icon: "cart", label: "Total Amount", value: money0(po.total), sub: po.currency, goTab: "items" },
    { icon: "box", label: "Total Items", value: fmt(po.itemCount), sub: "รายการ", goTab: "items" },
    { icon: "truck", label: "Received", value: `${po.recvPct}%`, sub: po.status, goTab: "receiving" },
    {
      icon: "clock",
      label: "Remaining Qty",
      value: fmt(poRemainingQty(po)),
      sub: "รอรับ",
      wide: true,
      goTab: "receiving",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (po) => {
        const s = poSupplierInfo(po.supplier);
        return [
          {
            type: "fields",
            title: "Supplier Information",
            cols: 2,
            items: [
              { label: "Supplier", value: po.supplier },
              {
                label: "Supplier Rating",
                value: (
                  <Badge tone="success">
                    ★ {s.rating} · {s.ratingLabel}
                  </Badge>
                ),
              },
              { label: "Average Lead Time", value: `${s.lead} วัน` },
              { label: "On-Time Delivery", value: `${s.otd}%` },
              { label: "Last Purchase Price", value: s.lastPrice ? `${money0(s.lastPrice)} THB` : DASH },
              { label: "Outstanding Balance", value: `${money0(s.outstanding)} THB` },
            ],
          },
          {
            type: "fields",
            title: "Order Information",
            cols: 2,
            items: [
              { label: "PO Number", value: po.code },
              { label: "Status", value: <Badge tone={tone(PO_TONE, po.status)}>{po.status}</Badge> },
              { label: "Buyer", value: po.buyer },
              { label: "Warehouse", value: po.warehouse },
              { label: "Currency", value: po.currency },
              { label: "Exchange Rate", value: po.fx },
              { label: "Payment Terms", value: po.payTerm },
              { label: "Incoterms", value: po.incoterm },
              { label: "Order Date", value: po.orderDate },
              {
                label: "Expected Delivery",
                value: po.isOverdue ? (
                  <span className="font-semibold text-warning-text">{po.expectedDate}</span>
                ) : (
                  po.expectedDate
                ),
              },
              po.prRef ? { label: "Source PR", value: <Badge tone="info">{po.prRef}</Badge> } : null,
            ],
          },
          { type: "note", title: "Remark", text: po.remark || DASH },
          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created By", value: po.createdBy, muted: true },
              { label: "Created Date", value: po.created, muted: true },
              { label: "Last Updated By", value: po.updatedBy, muted: true },
              { label: "Last Updated", value: po.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "items",
      label: "Items",
      blocks: (po) => [
        {
          type: "table",
          title: `Order Items (${po.itemCount})`,
          rows: (po.items ?? []).map((it) => ({
            ...it,
            base: poLineBase(it),
            net: poLineNet(it),
            remain: Math.max(0, (Number(it.qty) || 0) - (Number(it.recv) || 0)),
            pct: Number(it.qty)
              ? Math.round(((Number(it.recv) || 0) / (Number(it.qty) || 1)) * 100)
              : 0,
          })),
          empty: "ไม่มีรายการสินค้า",
          cols: [
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "qty", label: "Ordered", align: "right", cell: (r) => fmt(r.qty) },
            { key: "recv", label: "Received", align: "right", cell: (r) => fmt(r.recv) },
            {
              key: "remain",
              label: "Remaining",
              align: "right",
              cell: (r) => (
                <span className={r.remain > 0 ? "font-semibold text-warning-text" : ""}>
                  {fmt(r.remain)}
                </span>
              ),
            },
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
            {
              key: "pct",
              label: "Received %",
              align: "right",
              cell: (r) => (
                <UtilBar pct={r.pct} tone={r.pct >= 100 ? "full" : r.pct > 0 ? "mid" : undefined} />
              ),
            },
          ],
        },
        {
          type: "cards",
          title: "Totals",
          items: [
            { label: "Subtotal", value: money0(poSubtotal(po)), unit: po.currency },
            { label: "Discount", value: money0(poDiscTotal(po)), unit: po.currency },
            { label: "Tax", value: money0(poTaxTotal(po)), unit: po.currency },
            { label: "Grand Total", value: money0(po.total), unit: po.currency, tone: "accent" },
          ],
        },
      ],
    },

    {
      key: "receiving",
      label: "Receiving",
      blocks: (po) => [
        {
          type: "cards",
          title: "Receiving Progress",
          cols: 3,
          items: [
            {
              label: "Ordered Qty",
              value: fmt((po.items ?? []).reduce((s, it) => s + (Number(it.qty) || 0), 0)),
            },
            {
              label: "Received Qty",
              value: fmt((po.items ?? []).reduce((s, it) => s + (Number(it.recv) || 0), 0)),
              tone: "accent",
            },
            { label: "Remaining Qty", value: fmt(poRemainingQty(po)) },
          ],
        },
        {
          type: "table",
          title: `Goods Receipt History (${po.receipts?.length ?? 0})`,
          rows: po.receipts ?? [],
          empty: "ยังไม่มีการรับของ",
          cols: [
            {
              key: "grn",
              label: "Goods Receipt No.",
              cell: (r) => <span className="font-medium tnum">{r.grn}</span>,
            },
            { key: "date", label: "Date", muted: true },
            { key: "warehouse", label: "Warehouse", muted: true },
            { key: "qty", label: "Qty Received", align: "right", cell: (r) => fmt(r.qty) },
            { key: "receiver", label: "Receiver", muted: true },
            { key: "status", label: "Status", cell: (r) => <Badge tone="success">{r.status}</Badge> },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (po) => [
        {
          type: "timeline",
          title: "Activity",
          items: [
            {
              title: "Last updated",
              detail: `โดย ${po.updatedBy}`,
              user: po.updatedBy,
              when: po.updated,
              kind: "primary",
            },
            ...(po.receipts ?? []).map((r) => ({
              title: `รับของ ${r.grn}`,
              detail: `${fmt(r.qty)} หน่วย เข้า ${r.warehouse}`,
              user: r.receiver,
              when: r.date,
              kind: "info",
            })),
            {
              title: "PO created",
              detail: "สร้างใบสั่งซื้อเข้าระบบ",
              user: po.createdBy,
              when: po.created,
            },
          ],
        },
      ],
    },
  ],
};

export const poSchemas: EntitySchemas<PoRow> = {
  list: PO_LIST,
  detail: PO_DETAIL,
  form: PO_FORM,
};
