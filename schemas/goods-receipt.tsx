import {
  GOODS_RECEIPTS,
  grItemFinalRecv,
  grItemRemaining,
  grItemVariance,
  grTotalAccepted,
  grTotalRejected,
  type GrRow,
} from "@/lib/domain/inbound";
import { PURCHASE_ORDERS } from "@/lib/domain/purchase";
import { GR_QC_STATUS, GR_RECEIVERS, GR_STATUS } from "@/data/goods-receipts";
import { GR_QC_TONE, GR_TONE, tone } from "@/lib/badges";
import { DASH, daysUntil, fmt } from "@/lib/format";
import { grCancel, grDelete, grPassQC } from "@/lib/workflows";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, Thumb } from "@/components/ui";
import { GR_FORM } from "./forms/goods-receipt";
import { GoodsReceiptEditor } from "@/components/goods-receipt/GoodsReceiptEditor";

/* ============================================================
   GOODS RECEIPT
   Stock rule: goods requiring QC are received into QC Hold and do
   NOT become available inventory until QC passes.
   ============================================================ */

export const GR_LIST: ListSchema<GrRow> = {
  key: "goods-receipt",
  entity: "Goods Receipt",
  entityPlural: "Goods Receipts",
  title: "Goods Receipt",
  subtitle: "รับสินค้าเข้าคลัง ตรวจนับจำนวน ติดตาม Lot/Serial และส่งต่อ QC",
  crumb: "Goods Receipt",
  primaryLabel: "New Goods Receipt",
  searchPlaceholder: "ค้นหาเลขที่ GR, PO, ผู้ขายสินค้า, ผู้รับ...",
  emptyTitle: "ไม่พบใบรับของที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => GOODS_RECEIPTS,
  searchFields: ["code", "poRef", "supplier", "receiver", "warehouse", "deliveryNote"],

  hero: (ctx) => {
    const grs = GOODS_RECEIPTS;
    const waiting = grs.filter((g) => g.status === "Waiting").length;
    const partial = grs.filter((g) => g.status === "Partial").length;
    const pendingQc = grs.filter((g) => g.status === "Pending QC").length;
    const discrep = grs.filter((g) => g.discCount > 0).length;
    const completed = grs.filter((g) => g.status === "Completed").length;
    const expected = PURCHASE_ORDERS.filter((p) =>
      ["Open", "Partial Received"].includes(p.status),
    ).length;
    const overduePo = PURCHASE_ORDERS.filter((p) => p.isOverdue).length;

    return {
      banner: {
        title: "Inbound Receiving Summary",
        icon: "goodsReceipt",
        items: [
          `${expected} deliveries expected`,
          `${waiting} waiting to receive`,
          `${pendingQc} pending QC`,
          `${overduePo} overdue PO`,
          `${discrep} discrepancy to review`,
        ],
        action: "View Today's Deliveries",
        onAction: () =>
          ctx.toast("Today's Deliveries", "รายการที่คาดว่าจะรับวันนี้ — Future support", "info"),
      },
      kpis: [
        {
          label: "Expected Today",
          value: fmt(expected),
          sub: "PO waiting for delivery",
          link: "View POs",
          tone: "primary",
          icon: "calendar",
        },
        {
          label: "Waiting to Receive",
          value: fmt(waiting),
          sub: "Shipments inbound",
          link: "Open queue",
          goTab: "waiting",
          icon: "goodsReceipt",
        },
        {
          label: "Partial Received",
          value: fmt(partial),
          sub: "Awaiting balance",
          link: "Continue",
          goTab: "partial",
          tone: "warn",
          icon: "refresh",
        },
        {
          label: "Pending QC",
          value: fmt(pendingQc),
          sub: "Waiting for inspection",
          link: "Open QC queue",
          goTab: "pendingqc",
          tone: "warn",
          icon: "qc",
        },
        {
          label: "Completed",
          value: fmt(completed),
          sub: "Put away done",
          link: "View",
          goTab: "completed",
          tone: "ok",
          icon: "checkCircle",
        },
      ],
    };
  },

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (g) => g.status === "Draft" },
    { key: "waiting", label: "Waiting", test: (g) => g.status === "Waiting" },
    { key: "partial", label: "Partial", test: (g) => g.status === "Partial" },
    { key: "pendingqc", label: "Pending QC", test: (g) => g.status === "Pending QC" },
    /* No "Ready for Put Away" — receiving ends at this document now. */
    { key: "completed", label: "Completed", test: (g) => g.status === "Completed" },
    { key: "discrepancy", label: "Discrepancy", test: (g) => g.discCount > 0 },
  ],

  filters: [
    {
      id: "supplier",
      label: "Supplier",
      options: () => [...new Set(GOODS_RECEIPTS.map((g) => g.supplier))],
      test: (g, v) => g.supplier === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(GOODS_RECEIPTS.map((g) => g.warehouse))],
      test: (g, v) => g.warehouse === v,
    },
    { id: "receiver", label: "Receiver", options: () => [...GR_RECEIVERS], test: (g, v) => g.receiver === v },
    { id: "status", label: "Status", options: () => [...GR_STATUS], test: (g, v) => g.status === v },
    { id: "qc", label: "QC Status", options: () => [...GR_QC_STATUS], test: (g, v) => g.qcStatus === v },
    {
      id: "type",
      label: "Receipt Type",
      options: () => ["With PO", "Without PO"],
      test: (g, v) => g.type === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "GR Number",
      sortable: true,
      cell: (g) => (
        <CellMedia>
          <Thumb>{g.icon}</Thumb>
          <span className="font-medium">{g.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "type",
      label: "Type",
      cell: (g) => (
        <Badge tone={g.type === "With PO" ? "info" : "neutral"}>{g.type}</Badge>
      ),
    },
    { key: "poRef", label: "PO Number", muted: true, cell: (g) => g.poRef || DASH },
    { key: "supplier", label: "Supplier", sortable: true, cell: (g) => g.supplier },
    { key: "receiptDate", label: "Receipt Date", muted: true, sortable: true, cell: (g) => g.receiptDate },
    { key: "warehouse", label: "Warehouse", muted: true, cell: (g) => g.warehouse },
    {
      key: "totalReceiving",
      label: "Received",
      align: "right",
      cell: (g) => fmt(g.totalReceiving),
    },
    {
      key: "qcStatus",
      label: "QC Status",
      cell: (g) => <Badge tone={tone(GR_QC_TONE, g.qcStatus)}>{g.qcStatus}</Badge>,
    },
    {
      key: "discCount",
      label: "Discrepancy",
      align: "center",
      cell: (g) =>
        g.discCount ? (
          <Badge tone="danger">{g.discCount}</Badge>
        ) : (
          <span className="text-ink-2">{DASH}</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      cell: (g) => <Badge tone={tone(GR_TONE, g.status)}>{g.status}</Badge>,
    },
    { key: "receiver", label: "Receiver", muted: true, cell: (g) => g.receiver },
  ],

  rowActions: (gr, ctx) => {
    const acts: RowAction<GrRow>[] = [
      { label: "Open Detail", icon: "eye", run: (r) => ctx.openEntity("goods-receipt", r.code) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/goods-receipt/${r.code}`),
      },
    ];

    if (gr.status === "Draft" || gr.status === "Partial")
      acts.push({
        label: gr.status === "Draft" ? "Edit Draft" : "Continue Receiving",
        icon: "edit",
        run: (r) => ctx.goto(`/m/goods-receipt/${r.code}/edit`),
      });

    acts.push({ sep: true });

    if (gr.status === "Pending QC")
      acts.push({ label: "Open QC", icon: "qc", run: (r) => grPassQC(r, ctx) });

    if (gr.poRef)
      acts.push({
        label: `View ${gr.poRef}`,
        icon: "purchaseOrder",
        run: () => ctx.openEntity("purchase-order", gr.poRef),
      });

    acts.push({
      label: "Print GR",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบรับของ", `${r.code} — Future support`, "info"),
    });

    acts.push({ sep: true });
    if (gr.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => grDelete(r, ctx) });
    else if (!["Completed", "Cancelled"].includes(gr.status))
      acts.push({ label: "Cancel", icon: "circleSlash", danger: true, run: (r) => grCancel(r, ctx) });

    return acts;
  },
};

export const GR_DETAIL: DetailSchema<GrRow> = {
  key: "goods-receipt",
  entityLabel: "Goods Receipt",

  identity: (gr) => ({
    image: gr.icon,
    code: gr.code,
    title: gr.supplier,
    copyFields: [
      { label: "GR number", value: gr.code },
      { label: "PO number", value: gr.poRef || DASH },
    ],
    badges: [
      { text: gr.status, tone: tone(GR_TONE, gr.status) },
      { text: `QC: ${gr.qcStatus}`, tone: tone(GR_QC_TONE, gr.qcStatus) },
      ...(gr.discCount
        ? ([{ text: `${gr.discCount} discrepancy`, tone: "danger" }] as const)
        : []),
    ],
    tags: [gr.type, gr.warehouse, gr.receiver].filter(Boolean),
  }),

  kpis: (gr) => [
    { icon: "box", label: "Total Items", value: fmt(gr.itemCount), sub: "รายการ", goTab: "items" },
    { icon: "cart", label: "Received Qty", value: fmt(gr.totalReceiving), sub: "หน่วย", goTab: "items" },
    {
      icon: "shield",
      label: "Accepted",
      value: fmt(grTotalAccepted(gr)),
      sub: `Rejected ${fmt(grTotalRejected(gr))}`,
      goTab: "items",
    },
    {
      icon: "alert",
      label: "Discrepancies",
      value: fmt(gr.discCount),
      sub: "รายการ",
      wide: true,
      goTab: "quality",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (gr) => [
        gr.forceClosed && {
          /* The one thing on this document that was a decision rather than a
             count — who made it, and why, on the page rather than only in
             the history. */
          type: "alert",
          tone: "warn",
          title: `ปิดยอดคงเหลือของ ${gr.poRef} แล้ว`,
          message: `รับน้อยกว่าจำนวนที่สั่ง และปิดใบสั่งซื้อส่วนที่เหลือโดย ${
            gr.forceClosedBy || DASH
          } เมื่อ ${gr.forceClosedAt || DASH} · เหตุผล: ${gr.forceCloseReason || DASH}`,
        },
        gr.type === "Without PO" && {
          type: "alert",
          tone: "warn",
          title: "ใบรับของนี้ไม่ถูกผูกกับใบสั่งซื้อ",
          message: `เหตุผล: ${gr.nonPoReason || DASH} · เอกสารอ้างอิง: ${
            gr.refDoc || DASH
          } · อนุมัติ: ${gr.approvalRef || DASH}`,
        },
        {
          type: "fields",
          title: "Document Information",
          cols: 2,
          items: [
            { label: "GR Number", value: gr.code },
            {
              label: "Receipt Type",
              value: <Badge tone={gr.type === "With PO" ? "info" : "neutral"}>{gr.type}</Badge>,
            },
            { label: "Receipt Date", value: gr.receiptDate },
            { label: "Expected Date", value: gr.expectedDate },
            { label: "Receiver", value: gr.receiver },
            { label: "Warehouse", value: gr.warehouse },
            {
              label: "Source PO",
              value: gr.poRef ? <Badge tone="info">{gr.poRef}</Badge> : DASH,
            },
            { label: "Supplier", value: gr.supplier },
            { label: "Delivery Note", value: gr.deliveryNote || DASH },
            { label: "Supplier Invoice Ref", value: gr.invoiceRef || DASH },
            { label: "Transporter", value: gr.transporter || DASH },
            { label: "Vehicle Number", value: gr.vehicle || DASH },
          ],
        },
        { type: "note", title: "Remark", text: gr.remark || DASH },
        {
          type: "cards",
          title: "Receiving Summary",
          items: [
            { label: "Ordered Qty", value: fmt(gr.totalOrdered) },
            { label: "Received Qty", value: fmt(gr.totalReceiving), tone: "accent" },
            { label: "Accepted", value: fmt(grTotalAccepted(gr)) },
            { label: "Rejected", value: fmt(grTotalRejected(gr)) },
          ],
        },
      ],
    },

    {
      key: "items",
      label: "Items",
      blocks: (gr) => [
        {
          type: "table",
          title: `Received Items (${gr.itemCount})`,
          rows: (gr.items ?? []).map((it) => ({
            ...it,
            remaining: grItemRemaining(it),
            finalRecv: grItemFinalRecv(it),
            variance: grItemVariance(it),
          })),
          empty: "ไม่มีรายการ",
          cols: [
            { key: "line", label: "#", muted: true },
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            {
              key: "ordered",
              label: "Ordered",
              align: "right",
              cell: (r) => (r.ordered ? fmt(r.ordered) : DASH),
            },
            { key: "prevRecv", label: "Prev. Recv", align: "right", cell: (r) => fmt(r.prevRecv) },
            {
              key: "receiveNow",
              label: "Received",
              align: "right",
              cell: (r) => <span className="font-medium">{fmt(r.receiveNow)}</span>,
            },
            { key: "accepted", label: "Accepted", align: "right", cell: (r) => fmt(r.accepted) },
            {
              key: "rejected",
              label: "Rejected",
              align: "right",
              cell: (r) =>
                r.rejected ? (
                  <span className="font-bold text-danger-text">{fmt(r.rejected)}</span>
                ) : (
                  "0"
                ),
            },
            {
              key: "variance",
              label: "Variance",
              align: "right",
              cell: (r) =>
                r.variance > 0 ? (
                  <span className="font-bold text-danger-text">+{fmt(r.variance)}</span>
                ) : r.variance < 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(r.variance)}</span>
                ) : (
                  "0"
                ),
            },
            { key: "unit", label: "UOM", muted: true },
            {
              key: "ctl",
              label: "Control",
              cell: (r) => (
                <span className="inline-flex flex-wrap gap-1">
                  {r.lot && <Badge tone="neutral">Lot</Badge>}
                  {r.serial && <Badge tone="neutral">Serial</Badge>}
                  {r.qc && <Badge tone="warning">QC</Badge>}
                  {!r.lot && !r.serial && !r.qc && DASH}
                </span>
              ),
            },
            { key: "warehouse", label: "Warehouse", muted: true },
            {
              key: "disc",
              label: "Discrepancy",
              cell: (r) =>
                r.disc ? <Badge tone="danger">{r.disc}</Badge> : <span className="text-ink-2">{DASH}</span>,
            },
          ],
        },
      ],
    },

    {
      key: "lotserial",
      label: "Lot / Serial",
      blocks: (gr) => {
        const lots = (gr.items ?? []).flatMap((it) =>
          (it.lots ?? []).map((l) => ({ code: it.code, name: it.name, ...l })),
        );
        const serials = (gr.items ?? []).flatMap((it) =>
          (it.serials ?? []).map((sn) => ({ code: it.code, name: it.name, serial: sn })),
        );
        return [
          {
            type: "table",
            title: `Lot Tracking (${lots.length})`,
            rows: lots,
            empty: "ไม่มีสินค้าที่ควบคุม Lot",
            cols: [
              { key: "code", label: "Product", cell: (r) => <span className="tnum">{r.code}</span> },
              { key: "lot", label: "Lot Number", cell: (r) => <span className="font-medium">{r.lot}</span> },
              { key: "mfg", label: "Mfg Date", muted: true },
              {
                key: "exp",
                label: "Expiry Date",
                cell: (r) => {
                  const d = daysUntil(r.exp);
                  return d !== null && d <= 180 ? (
                    <span className="font-semibold text-warning-text">{r.exp}</span>
                  ) : (
                    r.exp
                  );
                },
              },
              { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
              { key: "supplierLot", label: "Supplier Lot", muted: true },
              { key: "origin", label: "Origin", muted: true },
            ],
          },
          {
            type: "table",
            title: `Serial Tracking (${serials.length})`,
            rows: serials,
            empty: "ไม่มีสินค้าที่ควบคุม Serial",
            cols: [
              { key: "code", label: "Product", cell: (r) => <span className="tnum">{r.code}</span> },
              {
                key: "serial",
                label: "Serial Number",
                cell: (r) => <span className="font-medium tnum">{r.serial}</span>,
              },
            ],
          },
        ];
      },
    },

    {
      key: "quality",
      label: "Quality Control",
      blocks: (gr) => {
        const qcItems = (gr.items ?? []).filter((it) => it.qc);
        return [
          {
            type: "fields",
            title: "QC Summary",
            cols: 2,
            items: [
              {
                label: "QC Status",
                value: <Badge tone={tone(GR_QC_TONE, gr.qcStatus)}>{gr.qcStatus}</Badge>,
              },
              { label: "Inspection Type", value: gr.qc.type },
              { label: "Sampling Plan", value: gr.qc.plan },
              { label: "Inspector", value: gr.qc.inspector },
              { label: "Inspection Due", value: gr.qc.dueDate },
              { label: "QC Warehouse", value: gr.qc.qcWh || DASH },
              { label: "Claim Warehouse", value: gr.qc.claimWh || DASH },
            ],
          },
          qcItems.length
            ? {
                type: "alert",
                tone: "warn",
                title: `${qcItems.length} รายการต้องผ่าน QC ก่อนเข้าสต๊อก`,
                message:
                  "สินค้าถูกรับเข้า QC Hold — จะยังไม่พร้อมใช้งานจนกว่า QC จะผ่าน",
              }
            : {
                type: "alert",
                tone: "info",
                title: "ไม่มีสินค้าที่ต้องตรวจ QC",
                message: "สินค้าพร้อมจัดเก็บเข้าคลังได้ทันที",
              },
          {
            type: "table",
            title: "QC Items",
            rows: qcItems,
            empty: "ไม่มีสินค้าที่ต้อง QC",
            cols: [
              { key: "code", label: "Product", cell: (r) => <span className="tnum">{r.code}</span> },
              { key: "name", label: "Product Name" },
              { key: "accepted", label: "Qty in QC", align: "right", cell: (r) => fmt(r.accepted) },
              { key: "warehouse", label: "QC Location", muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "history",
      label: "History",
      blocks: (gr) => [
        {
          type: "timeline",
          title: "Activity",
          items: (gr.history ?? []).map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },
  ],
};

export const grSchemas: EntitySchemas<GrRow> = {
  list: GR_LIST,
  detail: GR_DETAIL,
  /* Kept beside the editor for the same reason the purchase request keeps
     its form: `GR_FORM` still supplies the `required` list, and it is the
     fallback if the document editor is ever rolled back. The route prefers
     `editor` when it is present. */
  form: GR_FORM,
  editor: ({ record }) => <GoodsReceiptEditor record={record} />,
};
