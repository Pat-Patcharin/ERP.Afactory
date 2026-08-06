import { printActions } from "@/lib/print/actions";
import { displayName } from "@/lib/domain/lines";
import { DELIVERY_ORDERS, getSO, type DoRow } from "@/lib/domain/outbound";
import { DO_STATUS } from "@/data/delivery-orders";
import { DO_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import {
  doCancel,
  doConfirmDelivery,
  doCreateInvoice,
  doDelete,
  doFail,
  doReady,
  doShip,
} from "@/lib/workflows-outbound";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { DO_FORM } from "./forms/delivery-order";

/* ============================================================
   DELIVERY ORDER — the shipment. Confirming receipt is what
   finally posts quantities back to the sales order.
   Draft → Ready → Shipped → Delivered / Failed
   ============================================================ */

export const DO_LIST: ListSchema<DoRow> = {
  key: "delivery-order",
  entity: "Delivery Order",
  entityPlural: "Delivery Orders",
  title: "Delivery Orders",
  subtitle: "ใบส่งของและการจัดส่ง ติดตามสถานะรถ ผู้รับ และรายการที่ส่งไม่สำเร็จ",
  crumb: "Delivery Order",
  primaryLabel: "",
  searchPlaceholder: "ค้นหาเลขที่ DO ใบสั่งขาย ลูกค้า ผู้ขนส่ง หรือเลขติดตาม...",
  emptyTitle: "ไม่พบใบส่งของที่ตรงกับเงื่อนไข",
  hideImportExport: true,
  /* A delivery note raised on its own says goods left the building that no
     order asked for. It exists because a pack finished, and only then. */
  convertOnly: {
    from: "งานแพ็คที่ปิดงานแล้ว",
    goto: "/m/packing",
    gotoLabel: "ไปที่งานแพ็ค",
  },

  source: () => DELIVERY_ORDERS,
  searchFields: ["code", "soRef", "customer", "carrier", "trackingNo", "driver", "shipTo"],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (d) => d.status === "Draft" },
    { key: "ready", label: "Ready", test: (d) => d.status === "Ready" },
    { key: "shipped", label: "Shipped", test: (d) => d.status === "Shipped" },
    { key: "failed", label: "Failed", test: (d) => d.status === "Failed" },
    { key: "late", label: "เลยกำหนด", test: (d) => d.isLate },
    { key: "delivered", label: "Delivered", test: (d) => d.status === "Delivered" },
  ],

  filters: [
    {
      id: "carrier",
      label: "Carrier",
      options: () => [...new Set(DELIVERY_ORDERS.map((d) => d.carrier))],
      test: (d, v) => d.carrier === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(DELIVERY_ORDERS.map((d) => d.warehouse))],
      test: (d, v) => d.warehouse === v,
    },
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(DELIVERY_ORDERS.map((d) => d.customer))],
      test: (d, v) => d.customer === v,
    },
    { id: "status", label: "Status", options: () => [...DO_STATUS], test: (d, v) => d.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "DO Number",
      sortable: true,
      cell: (d) => (
        <CellMedia>
          <Thumb>{d.icon}</Thumb>
          <span className="font-medium">{d.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (d) => (
        <>
          {d.customer}
          <CellSub>{d.soRef}</CellSub>
        </>
      ),
    },
    {
      key: "carrier",
      label: "Carrier",
      cell: (d) => (
        <>
          {d.carrier}
          {d.trackingNo && <CellSub>{d.trackingNo}</CellSub>}
        </>
      ),
    },
    {
      key: "deliveryDate",
      label: "Delivery Date",
      sortable: true,
      cell: (d) =>
        d.isLate ? (
          <span className="font-semibold text-danger">{d.deliveryDate}</span>
        ) : (
          <>
            {d.deliveryDate}
            <CellSub>{d.deliveryTime}</CellSub>
          </>
        ),
    },
    { key: "packages", label: "Boxes", align: "right", cell: (d) => fmt(d.packages) },
    {
      key: "totalQty",
      label: "Qty",
      align: "right",
      sortable: true,
      cell: (d) => (
        <>
          {fmt(d.totalQty)}
          {d.shortDelivery && <CellSub>ส่งไม่ครบ</CellSub>}
        </>
      ),
    },
    {
      key: "pct",
      label: "Delivered %",
      align: "right",
      sortable: true,
      cell: (d) => (
        <UtilBar pct={d.pct} tone={d.pct >= 100 ? "full" : d.pct > 0 ? "mid" : undefined} />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (d) =>
        d.isLate && d.status !== "Failed" ? (
          <Badge tone="danger">Late</Badge>
        ) : (
          <Badge tone={tone(DO_TONE, d.status)}>{d.status}</Badge>
        ),
    },
  ],

  rowActions: (d, ctx) => {
    const acts: RowAction<DoRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("delivery-order", r) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/delivery-order/${r.code}`) },
    ];

    if (["Draft", "Ready", "Failed"].includes(d.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/delivery-order/${r.code}/edit`) });

    acts.push({ sep: true });

    if (d.status === "Draft")
      acts.push({ label: "Mark Ready", icon: "checkCircle", run: (r) => doReady(r, ctx) });

    if (d.status === "Ready")
      acts.push({ label: "Ship Now", icon: "truck", run: (r) => doShip(r, ctx) });

    if (["Shipped", "Failed"].includes(d.status)) {
      acts.push({ label: "Confirm Delivery", icon: "checkCircle", run: (r) => doConfirmDelivery(r, ctx) });
      if (d.status === "Shipped")
        acts.push({ label: "Mark Failed", icon: "xCircle", danger: true, run: (r) => doFail(r, ctx) });
    }

    if (["Shipped", "Delivered"].includes(d.status))
      acts.push({ label: "Create Invoice", icon: "invoice", run: (r) => doCreateInvoice(r, ctx) });

    acts.push({
      label: `ดู ${d.soRef}`,
      icon: "salesOrder",
      run: () => ctx.openEntity("sales-order", d.soRef),
    });

    if (d.packRef)
      acts.push({
        label: `ดู ${d.packRef}`,
        icon: "packing",
        run: () => ctx.openEntity("packing", d.packRef),
      });

    acts.push({
      label: "Print Delivery Note",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบส่งของ", `${r.code} — Future support`, "info"),
    });

    acts.push({ sep: true });
    if (d.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => doDelete(r, ctx) });
    else if (!["Cancelled", "Delivered"].includes(d.status))
      acts.push({ label: "Cancel DO", icon: "circleSlash", danger: true, run: (r) => doCancel(r, ctx) });

    return acts;
  },
};

export const DO_DETAIL: DetailSchema<DoRow> = {
  key: "delivery-order",
  entityLabel: "Delivery Order",

  identity: (d) => ({
    image: d.icon,
    code: d.code,
    title: d.customer,
    copyFields: [
      { label: "DO number", value: d.code },
      { label: "Tracking", value: d.trackingNo || d.soRef },
    ],
    badges: [
      { text: d.status, tone: tone(DO_TONE, d.status) },
      ...(d.isLate ? ([{ text: "Late", tone: "danger" }] as const) : []),
      ...(d.shortDelivery ? ([{ text: "ส่งไม่ครบ", tone: "warning" }] as const) : []),
      { text: d.priority, tone: tone(PRIORITY_TONE, d.priority) },
    ],
    tags: [d.soRef, d.carrier, d.warehouse].filter(Boolean),
  }),

  kpis: (d) => [
    { icon: "box", label: "Total Qty", value: fmt(d.totalQty), sub: "หน่วย", goTab: "lines" },
    { icon: "layers", label: "Packages", value: fmt(d.packages), sub: `${d.weight} กก.`, goTab: "overview" },
    {
      icon: "truck",
      label: "Delivered",
      value: `${d.pct}%`,
      sub: fmt(d.deliveredTotal) + " หน่วย",
      goTab: "lines",
    },
    {
      icon: "calendar",
      label: "Delivery Date",
      value: d.deliveryDate,
      sub: d.deliveryTime,
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      aside: (d) => ({
        rows: [
          { icon: "salesOrder", label: "Sales Order", value: d.soRef },
          { icon: "packing", label: "From Pack", value: d.packRef || DASH },
          { icon: "partner", label: "Customer", value: d.customer },
          { icon: "truck", label: "Carrier", value: d.carrier },
          { icon: "user", label: "Driver", value: d.driver || DASH, muted: !d.driver },
          { icon: "barcode", label: "Tracking No.", value: d.trackingNo || DASH, muted: !d.trackingNo },
          { icon: "phone", label: "Contact", value: d.phone || DASH, muted: !d.phone },
        ],
      }),
      blocks: (d) => {
        const so = getSO(d.soRef);
        return [
          d.status === "Failed" && {
            type: "alert",
            tone: "danger",
            title: "ส่งไม่สำเร็จ",
            message: `${d.failReason || "ไม่ระบุเหตุผล"} — ต้องนัดส่งใหม่หรือแจ้งฝ่ายขายติดต่อลูกค้า`,
          },
          d.isLate && d.status !== "Failed" && {
            type: "alert",
            tone: "warn",
            title: "เลยกำหนดส่งแล้ว",
            message: `กำหนดส่ง ${d.deliveryDate} แต่ยังอยู่ในสถานะ ${d.status}`,
          },
          d.shortDelivery && {
            type: "alert",
            tone: "warn",
            title: "ลูกค้ารับของไม่ครบ",
            message: `รับ ${fmt(d.deliveredTotal)} จาก ${fmt(d.totalQty)} หน่วย — ส่วนที่เหลือยังค้างอยู่ในใบสั่งขาย ${d.soRef}`,
          },
          {
            type: "fields",
            title: "Shipment Information",
            cols: 2,
            items: [
              { label: "DO Number", value: d.code },
              { label: "Status", value: <Badge tone={tone(DO_TONE, d.status)}>{d.status}</Badge> },
              { label: "Sales Order", value: <Badge tone="info">{d.soRef}</Badge> },
              { label: "Packing Task", value: d.packRef ? <Badge tone="info">{d.packRef}</Badge> : DASH },
              { label: "Warehouse", value: d.warehouse },
              { label: "Priority", value: <Badge tone={tone(PRIORITY_TONE, d.priority)}>{d.priority}</Badge> },
              { label: "Delivery Date", value: d.deliveryDate },
              { label: "Time Slot", value: d.deliveryTime },
              { label: "Packages", value: `${fmt(d.packages)} กล่อง` },
              { label: "Total Weight", value: `${d.weight} กก.` },
            ],
          },
          {
            type: "fields",
            title: "Carrier & Route",
            cols: 2,
            items: [
              { label: "Carrier", value: d.carrier },
              { label: "Service", value: d.service },
              { label: "Driver", value: d.driver || DASH },
              { label: "Vehicle", value: d.vehicle || DASH },
              { label: "Tracking No.", value: d.trackingNo || DASH },
              { label: "COD Amount", value: d.codAmount ? money0(d.codAmount) : DASH },
            ],
          },
          {
            type: "fields",
            title: "Deliver To",
            cols: 2,
            items: [
              { label: "Customer", value: d.customer },
              { label: "Customer Code", value: d.customerCode },
              { label: "Contact", value: d.contact || DASH },
              { label: "Phone", value: d.phone || DASH },
              { label: "Address", value: d.shipTo || DASH, span: true },
            ],
          },
          d.status === "Delivered"
            ? {
                type: "fields",
                title: "Proof of Delivery",
                cols: 2,
                items: [
                  { label: "Received By", value: d.receivedBy || DASH },
                  { label: "Received Date", value: d.receivedDate || DASH },
                  { label: "Delivered Qty", value: `${fmt(d.deliveredTotal)} / ${fmt(d.totalQty)}` },
                ],
              }
            : null,
          so
            ? {
                type: "fields",
                title: "Sales Order Context",
                cols: 2,
                items: [
                  { label: "Order Value", value: `${money0(so.total)} ${so.currency}` },
                  { label: "Payment Term", value: so.payTerm },
                  { label: "Sales Rep", value: so.salesRep },
                  { label: "Outstanding Qty", value: `${fmt(so.outstandingQty)} หน่วย` },
                ],
              }
            : null,
          { type: "note", title: "Remark", text: d.remark || DASH },
          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created By", value: d.createdBy, muted: true },
              { label: "Created Date", value: d.created, muted: true },
              { label: "Last Updated By", value: d.updatedBy, muted: true },
              { label: "Last Updated", value: d.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "lines",
      label: "Items",
      blocks: (d) => [
        {
          type: "table",
          title: `Delivery Lines (${d.itemCount})`,
          rows: (d.items ?? []).map((it) => ({
            ...it,
            short: Math.max(0, Number(it.qty) - Number(it.delivered)),
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
            { key: "qty", label: "Shipped", align: "right", cell: (r) => fmt(r.qty) },
            { key: "delivered", label: "Received", align: "right", cell: (r) => fmt(r.delivered) },
            {
              key: "short",
              label: "ไม่ได้รับ",
              align: "right",
              cell: (r) =>
                r.short > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(r.short)}</span>
                ) : (
                  DASH
                ),
            },
            { key: "unit", label: "UOM", muted: true },
            { key: "box", label: "Box", cell: (r) => (r.box ? <Badge tone="neutral">{r.box}</Badge> : DASH) },
            { key: "note", label: "Note", muted: true, cell: (r) => r.note || DASH },
          ],
        },
        {
          type: "cards",
          title: "Delivery Summary",
          cols: 3,
          items: [
            { label: "Shipped", value: fmt(d.totalQty), unit: "หน่วย" },
            { label: "Received", value: fmt(d.deliveredTotal), unit: "หน่วย", tone: "accent" },
            {
              label: "Not Received",
              value: fmt(d.totalQty - d.deliveredTotal),
              unit: "หน่วย",
              tone: d.deliveredTotal < d.totalQty ? "warn" : undefined,
            },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (d) => [
        {
          type: "timeline",
          title: "Activity",
          items: (d.history ?? []).map((h) => ({
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

  actions: (d, ctx) => {
    const acts: RowAction<DoRow>[] = [];
    if (d.status === "Draft") acts.push({ label: "Mark Ready", icon: "checkCircle", run: () => doReady(d, ctx) });
    if (d.status === "Ready") acts.push({ label: "Ship Now", icon: "truck", run: () => doShip(d, ctx) });
    if (["Shipped", "Failed"].includes(d.status)) {
      acts.push({ label: "Confirm Delivery", icon: "checkCircle", run: () => doConfirmDelivery(d, ctx) });
      if (d.status === "Shipped")
        acts.push({ label: "Mark Failed", icon: "xCircle", danger: true, run: () => doFail(d, ctx) });
    }
    /* Bills what this note carried — a short delivery bills short, and the
       back order bills on its own note later. */
    if (["Shipped", "Delivered"].includes(d.status))
      acts.push({ label: "Create Invoice", icon: "invoice", run: () => doCreateInvoice(d, ctx) });
    acts.push({
      label: "Print Delivery Note",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ใบส่งของ", `${d.code} — Future support`, "info"),
    });
    if (!["Cancelled", "Delivered"].includes(d.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel DO", icon: "circleSlash", danger: true, run: () => doCancel(d, ctx) });
    }
    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("delivery-order", d, ctx));
    return acts;
  },
};

export const doSchemas: EntitySchemas<DoRow> = {
  list: DO_LIST,
  detail: DO_DETAIL,
  form: DO_FORM,
};
