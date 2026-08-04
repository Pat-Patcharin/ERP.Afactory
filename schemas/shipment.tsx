import { printActions } from "@/lib/print/actions";
import {
  SHIPMENTS,
  dispatchReadiness,
  duplicateSerials,
  itemsInPackage,
  remainingShippable,
  shipmentsForDO,
  unpackagedLines,
  volumetricWeight,
  type ShpRow,
} from "@/lib/domain/shipment";
import { SHP_STATUS } from "@/data/shipments";
import { DLV_TONE, PRIORITY_TONE, SHP_TONE, tone } from "@/lib/badges";
import { DASH, fmt } from "@/lib/format";
import {
  shpAddTracking,
  shpBulk,
  shpCancel,
  shpConfirmDelivery,
  shpCreateReturn,
  shpDispatch,
  shpMarkReady,
  shpPrintDocument,
  shpPrintLabel,
  shpRecordException,
  shpReschedule,
} from "@/lib/workflows-shipment";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { SHP_FORM } from "./forms/shipment";

/* ============================================================
   SHIPMENT — dispatch and delivery execution.

   Draft → Ready to Dispatch → Dispatched → In Transit
        → Out for Delivery → Delivered

   No pricing, no invoice amounts, no stock writes.
   ============================================================ */

const isToday = (stampStr: string) => {
  const d = String(stampStr ?? "").split(" ")[0];
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = now.getFullYear() + 543;
  return d === `${dd}/${mm}/${yy}` || d === `${dd}/${mm}/${now.getFullYear()}`;
};

export const SHP_LIST: ListSchema<ShpRow> = {
  key: "shipment",
  entity: "Shipment",
  entityPlural: "Shipments",
  title: "Shipments",
  subtitle:
    "Manage outbound dispatch, carrier assignments, delivery tracking, and proof of delivery.",
  crumb: "Shipment",
  primaryLabel: "Create Shipment",
  searchPlaceholder: "ค้นหาเลขที่ขนส่ง ใบส่งของ ลูกค้า ผู้ขนส่ง เลขติดตาม คนขับ หรือทะเบียนรถ...",
  emptyTitle: "ไม่พบใบขนส่งที่ตรงกับเงื่อนไข",
  hideImportExport: false,

  source: () => SHIPMENTS,
  searchFields: [
    "code",
    "doRef",
    "soRef",
    "invRef",
    "customer",
    "customerCode",
    "carrier",
    "trackingNo",
    "driver",
    "vehicleNo",
    "route",
  ],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (s) => s.status === "Draft" },
    { key: "ready", label: "Ready", test: (s) => s.status === "Ready to Dispatch" },
    { key: "dispatched", label: "Dispatched", test: (s) => s.status === "Dispatched" },
    { key: "transit", label: "In Transit", test: (s) => s.status === "In Transit" },
    { key: "ofd", label: "Out for Delivery", test: (s) => s.status === "Out for Delivery" },
    {
      key: "delivered",
      label: "Delivered",
      test: (s) => ["Delivered", "Partially Delivered"].includes(s.status),
    },
    { key: "failed", label: "Failed", test: (s) => s.status === "Delivery Failed" },
    { key: "delayed", label: "Delayed", test: (s) => s.isDelayed },
    { key: "cancelled", label: "Cancelled", test: (s) => s.status === "Cancelled" },
  ],

  filters: [
    { id: "status", label: "Shipment Status", options: () => [...SHP_STATUS], test: (s, v) => s.status === v },
    {
      id: "deliveryStatus",
      label: "Delivery Status",
      options: () => [...new Set(SHIPMENTS.map((s) => s.deliveryStatus))],
      test: (s, v) => s.deliveryStatus === v,
    },
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(SHIPMENTS.map((s) => s.customer))],
      test: (s, v) => s.customer === v,
    },
    {
      id: "carrier",
      label: "Carrier",
      options: () => [...new Set(SHIPMENTS.map((s) => s.carrier))],
      test: (s, v) => s.carrier === v,
    },
    {
      id: "shippingMethod",
      label: "Shipping Method",
      options: () => [...new Set(SHIPMENTS.map((s) => s.shippingMethod))],
      test: (s, v) => s.shippingMethod === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(SHIPMENTS.map((s) => s.warehouse))],
      test: (s, v) => s.warehouse === v,
    },
    {
      id: "branch",
      label: "Branch",
      options: () => [...new Set(SHIPMENTS.map((s) => s.branch))],
      test: (s, v) => s.branch === v,
    },
    {
      id: "salesRep",
      label: "Sales Representative",
      options: () => [...new Set(SHIPMENTS.map((s) => s.salesRep).filter(Boolean))],
      test: (s, v) => s.salesRep === v,
    },
    {
      id: "driver",
      label: "Driver",
      options: () => [...new Set(SHIPMENTS.map((s) => s.driver).filter((d) => d && d !== "—"))],
      test: (s, v) => s.driver === v,
    },
    {
      id: "route",
      label: "Route",
      options: () => [...new Set(SHIPMENTS.map((s) => s.route).filter(Boolean))],
      test: (s, v) => s.route === v,
    },
    {
      id: "priority",
      label: "Priority",
      options: () => ["Low", "Normal", "High", "Critical"],
      test: (s, v) => s.priority === v,
    },
    { id: "delayed", label: "Delayed Only", options: () => ["Delayed only"], test: (s) => s.isDelayed },
    {
      id: "failed",
      label: "Failed Only",
      options: () => ["Failed only"],
      test: (s) => s.status === "Delivery Failed",
    },
  ],

  columns: [
    {
      key: "code",
      label: "Shipment No.",
      sortable: true,
      cell: (s) => (
        <CellMedia>
          <Thumb>{s.icon}</Thumb>
          <span className="font-medium">{s.code}</span>
        </CellMedia>
      ),
    },
    { key: "doRef", label: "Delivery Order", muted: true, cell: (s) => s.doRef || DASH },
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
      key: "carrier",
      label: "Carrier",
      cell: (s) => (
        <>
          {s.carrier}
          <CellSub>{s.carrierService}</CellSub>
        </>
      ),
    },
    {
      key: "trackingNo",
      label: "Tracking No.",
      muted: true,
      cell: (s) => (s.trackingNo ? <span className="tnum">{s.trackingNo}</span> : DASH),
    },
    {
      key: "dispatchDate",
      label: "Dispatch Date",
      sortable: true,
      muted: true,
      cell: (s) => s.dispatchDate?.split(" ")[0] || DASH,
    },
    {
      key: "expectedDelivery",
      label: "Expected Delivery",
      sortable: true,
      cell: (s) =>
        s.isDelayed ? (
          <>
            <span className="font-semibold text-danger">{s.expectedDelivery}</span>
            <CellSub>ช้า {s.daysLate} วัน</CellSub>
          </>
        ) : (
          s.expectedDelivery
        ),
    },
    { key: "packageCount", label: "Packages", align: "right", sortable: true, cell: (s) => fmt(s.packageCount) },
    { key: "totalQty", label: "Total Qty", align: "right", sortable: true, cell: (s) => fmt(s.totalQty) },
    { key: "driver", label: "Driver", muted: true, cell: (s) => s.driver || DASH },
    {
      key: "deliveryProgress",
      label: "Progress",
      align: "right",
      sortable: true,
      cell: (s) => (
        <UtilBar
          pct={s.deliveryProgress}
          tone={s.deliveryProgress >= 100 ? "full" : s.deliveryProgress > 0 ? "mid" : undefined}
        />
      ),
    },
    {
      key: "status",
      label: "Shipment Status",
      cell: (s) => <Badge tone={tone(SHP_TONE, s.status)}>{s.status}</Badge>,
    },
    {
      key: "deliveryStatus",
      label: "Delivery Status",
      cell: (s) => <Badge tone={tone(DLV_TONE, s.deliveryStatus)}>{s.deliveryStatus}</Badge>,
    },
    {
      key: "priority",
      label: "Priority",
      cell: (s) => <Badge tone={tone(PRIORITY_TONE, s.priority)}>{s.priority}</Badge>,
    },
    { key: "updated", label: "Updated At", muted: true, sortable: true, cell: (s) => s.updated },
  ],

  hero: () => ({
    kpis: [
      { label: "Total Shipments", value: fmt(SHIPMENTS.length), sub: "Shipments", icon: "truck" },
      {
        label: "Ready to Dispatch",
        value: fmt(SHIPMENTS.filter((s) => s.status === "Ready to Dispatch").length),
        sub: "Shipments",
        goTab: "ready",
      },
      {
        label: "Dispatched Today",
        value: fmt(SHIPMENTS.filter((s) => isToday(s.dispatchDate)).length),
        sub: "Shipments",
        goTab: "dispatched",
      },
      {
        label: "In Transit",
        value: fmt(SHIPMENTS.filter((s) => s.status === "In Transit").length),
        sub: "Shipments",
        goTab: "transit",
      },
      {
        label: "Out for Delivery",
        value: fmt(SHIPMENTS.filter((s) => s.status === "Out for Delivery").length),
        sub: "Shipments",
        tone: "warn",
        goTab: "ofd",
      },
      {
        label: "Delivered Today",
        value: fmt(SHIPMENTS.filter((s) => isToday(s.actualDelivery)).length),
        sub: "Shipments",
        tone: "ok",
        goTab: "delivered",
      },
      {
        label: "Delivery Failed",
        value: fmt(SHIPMENTS.filter((s) => s.status === "Delivery Failed").length),
        sub: "Shipments",
        tone: "warn",
        goTab: "failed",
      },
      {
        label: "Delayed",
        value: fmt(SHIPMENTS.filter((s) => s.isDelayed).length),
        sub: "Shipments",
        tone: "warn",
        goTab: "delayed",
      },
      {
        label: "Total Packages",
        value: fmt(SHIPMENTS.reduce((t, s) => t + s.packageCount, 0)),
        sub: "Packages",
      },
    ],
  }),

  secondaryActions: (ctx) => [
    { label: "Create From Delivery Order", icon: "delivery", run: () => ctx.goto("/m/shipment/new") },
    {
      label: "Import Tracking",
      icon: "download",
      run: () => ctx.toast("นำเข้าเลขติดตาม", "การนำเข้าไฟล์เลขติดตาม — Future support", "info"),
    },
  ],

  bulkActions: (rows, ctx) => [
    { label: "Assign Carrier", icon: "truck", run: () => shpBulk(rows, "carrier", ctx) },
    { label: "Assign Driver", icon: "user", run: () => shpBulk(rows, "driver", ctx) },
    { label: "Mark Ready", icon: "checkCircle", run: () => shpBulk(rows, "ready", ctx) },
    { label: "Dispatch", icon: "send", run: () => shpBulk(rows, "dispatch", ctx) },
    { label: "Print Labels", icon: "printer", run: () => shpBulk(rows, "label", ctx) },
    { label: "Cancel Drafts", icon: "circleSlash", danger: true, run: () => shpBulk(rows, "cancel", ctx) },
  ],

  rowActions: (s, ctx) => {
    const acts: RowAction<ShpRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("shipment", r) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/shipment/${r.code}`) },
    ];

    if (s.isEditable)
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/shipment/${r.code}/edit`) });

    acts.push({ sep: true });

    if (["Draft", "Rescheduled"].includes(s.status))
      acts.push({ label: "Mark Ready", icon: "checkCircle", run: (r) => shpMarkReady(r, ctx) });
    if (s.canDispatch) acts.push({ label: "Dispatch", icon: "send", run: (r) => shpDispatch(r, ctx) });
    if (!["Draft", "Cancelled"].includes(s.status))
      acts.push({ label: "Update Tracking", icon: "refresh", run: (r) => shpAddTracking(r, ctx) });
    if (s.canDeliver)
      acts.push({ label: "Confirm Delivery", icon: "checkCircle", run: (r) => shpConfirmDelivery(r, ctx) });
    if (!["Draft", "Cancelled", "Delivered"].includes(s.status))
      acts.push({ label: "Record Exception", icon: "alert", run: (r) => shpRecordException(r, ctx) });
    if (s.canReschedule)
      acts.push({ label: "Reschedule", icon: "calendar", run: (r) => shpReschedule(r, ctx) });

    acts.push({ label: "Print Shipping Label", icon: "printer", run: (r) => shpPrintLabel(r, ctx) });

    if (s.doRef)
      acts.push({
        label: `ดู ${s.doRef}`,
        icon: "delivery",
        run: () => ctx.openEntity("delivery-order", s.doRef),
      });
    if (s.invRef)
      acts.push({
        label: `ดู ${s.invRef}`,
        icon: "invoice",
        run: () => ctx.openEntity("sales-invoice", s.invRef),
      });

    acts.push({ sep: true });
    if (!["Delivered", "Returned", "Cancelled"].includes(s.status))
      acts.push({ label: "Cancel Shipment", icon: "circleSlash", danger: true, run: (r) => shpCancel(r, ctx) });

    return acts;
  },
};

export const SHP_DETAIL: DetailSchema<ShpRow> = {
  key: "shipment",
  entityLabel: "Shipment",

  identity: (s) => ({
    image: s.icon,
    code: s.code,
    title: s.customer,
    copyFields: [
      { label: "Shipment number", value: s.code },
      { label: "Tracking", value: s.trackingNo || s.doRef },
    ],
    badges: [
      { text: s.status, tone: tone(SHP_TONE, s.status) },
      { text: s.deliveryStatus, tone: tone(DLV_TONE, s.deliveryStatus) },
      ...(s.isDelayed ? ([{ text: `ช้า ${s.daysLate} วัน`, tone: "danger" }] as const) : []),
      ...(s.openExceptions > 0
        ? ([{ text: `${s.openExceptions} exception`, tone: "warning" }] as const)
        : []),
    ],
    tags: [s.carrier, s.trackingNo, s.route].filter(Boolean),
  }),

  kpis: (s) => [
    { icon: "box", label: "Total Quantity", value: fmt(s.totalQty), sub: "หน่วย", goTab: "items" },
    { icon: "layers", label: "Packages", value: fmt(s.packageCount), sub: `${s.totalWeight} kg`, goTab: "packages" },
    {
      icon: "truck",
      label: "Delivery Progress",
      value: `${s.deliveryProgress}%`,
      sub: `${fmt(s.deliveredQty)} / ${fmt(s.totalQty)}`,
      goTab: "tracking",
    },
    {
      icon: "calendar",
      label: "Expected Delivery",
      value: s.expectedDelivery || DASH,
      sub: s.isDelayed ? `ช้า ${s.daysLate} วัน` : s.actualDelivery || s.carrier,
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    /* ---------- 1. OVERVIEW ---------- */
    {
      key: "overview",
      label: "Overview",
      aside: (s) => ({
        rows: [
          { icon: "delivery", label: "Delivery Order", value: s.doRef || DASH },
          { icon: "salesOrder", label: "Sales Order", value: s.soRef || DASH, muted: !s.soRef },
          { icon: "invoice", label: "Invoice", value: s.invRef || DASH, muted: !s.invRef },
          { icon: "truck", label: "Carrier", value: s.carrier },
          { icon: "user", label: "Driver", value: s.driver || DASH, muted: !s.driver },
          { icon: "barcode", label: "Tracking No.", value: s.trackingNo || DASH, muted: !s.trackingNo },
          { icon: "warehouse", label: "Warehouse", value: s.warehouse },
        ],
      }),
      blocks: (s) => {
        const issues = dispatchReadiness(s);
        const blocking = issues.filter((i) => i.blocking);

        return [
          s.status === "Cancelled" && {
            type: "alert",
            tone: "warn",
            title: "ใบขนส่งถูกยกเลิก",
            message: s.cancelReason || "ไม่ระบุเหตุผล",
          },
          s.openExceptions > 0 && {
            type: "alert",
            tone: "danger",
            title: `มีเหตุผิดปกติที่ยังไม่ปิด ${s.openExceptions} รายการ`,
            message: (s.exceptions ?? []).find((e) => e.status !== "Resolved")?.desc ?? "",
          },
          s.isDelayed && {
            type: "alert",
            tone: "warn",
            title: `เลยกำหนดส่ง ${s.daysLate} วัน`,
            message: `กำหนดส่ง ${s.expectedDelivery} — ยังอยู่ในสถานะ ${s.status}`,
          },
          s.isEditable && blocking.length > 0 && {
            type: "alert",
            tone: "warn",
            title: `ยังนำส่งไม่ได้ (${blocking.length} เรื่อง)`,
            message: blocking.map((b) => b.label).join(" · "),
          },
          Boolean(s.returnRef) && {
            type: "alert",
            tone: "info",
            title: "มีคำขอคืนสินค้าผูกอยู่",
            message: `เปิดคำขอคืน ${s.returnRef} จากใบขนส่งนี้แล้ว`,
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Shipment Information",
                items: [
                  { label: "Shipment Number", value: s.code },
                  { label: "Shipment Status", value: <Badge tone={tone(SHP_TONE, s.status)}>{s.status}</Badge> },
                  {
                    label: "Delivery Status",
                    value: <Badge tone={tone(DLV_TONE, s.deliveryStatus)}>{s.deliveryStatus}</Badge>,
                  },
                  { label: "Shipment Date", value: s.shipmentDate },
                  { label: "Dispatch Date", value: s.dispatchDate || DASH },
                  { label: "Expected Delivery", value: s.expectedDelivery },
                  { label: "Actual Delivery", value: s.actualDelivery || DASH },
                  { label: "Priority", value: <Badge tone={tone(PRIORITY_TONE, s.priority)}>{s.priority}</Badge> },
                  { label: "Shipping Method", value: s.shippingMethod },
                  { label: "Created By", value: s.createdBy, muted: true },
                ],
              },
              {
                type: "fields",
                title: "Customer and Destination",
                items: [
                  { label: "Customer Code", value: s.customerCode },
                  { label: "Customer Name", value: s.customer },
                  { label: "Delivery Address", value: s.deliveryAddress, span: true },
                  { label: "Contact Person", value: s.contactPerson || DASH },
                  { label: "Contact Phone", value: s.contactPhone || DASH },
                  { label: "Delivery Instruction", value: s.deliveryInstruction || DASH, span: true },
                  { label: "Customer Reference", value: s.customerRef || DASH },
                  { label: "Sales Representative", value: s.salesRep || DASH },
                ],
              },
            ],
          },
          {
            type: "grid",
            items: [
              {
                type: "fields",
                title: "Logistics Information",
                items: [
                  { label: "Carrier", value: s.carrier },
                  { label: "Carrier Service", value: s.carrierService },
                  { label: "Tracking Number", value: s.trackingNo || DASH },
                  { label: "Driver", value: s.driver || DASH },
                  { label: "Driver Phone", value: s.driverPhone || DASH },
                  { label: "Vehicle Type", value: s.vehicleType || DASH },
                  { label: "Vehicle Number", value: s.vehicleNo || DASH },
                  { label: "Route", value: s.route || DASH },
                  { label: "Warehouse", value: s.warehouse },
                  { label: "Loading Bay", value: s.loadingBay || DASH },
                  { label: "Dispatch Team", value: s.dispatchTeam || DASH },
                ],
              },
              {
                type: "cards",
                title: "Shipment Summary",
                cols: 2,
                items: [
                  { label: "Total Items", value: fmt(s.itemCount) },
                  { label: "Total Quantity", value: fmt(s.totalQty) },
                  { label: "Total Packages", value: fmt(s.packageCount) },
                  { label: "Total Weight", value: `${s.totalWeight}`, unit: "kg" },
                  { label: "Total Volume", value: `${s.totalVolume}`, unit: "m³" },
                  { label: "Delivered Qty", value: fmt(s.deliveredQty), tone: "accent" },
                  {
                    label: "Remaining Qty",
                    value: fmt(s.remainingQty),
                    tone: s.remainingQty > 0 ? "warn" : undefined,
                  },
                  { label: "Delivery Progress", value: `${s.deliveryProgress}%` },
                ],
              },
            ],
          },
          { type: "note", title: "Notes", text: s.note || DASH },
        ];
      },
    },

    /* ---------- 2. SHIPMENT ITEMS ---------- */
    {
      key: "items",
      label: "Shipment Items",
      blocks: (s) => {
        const dupes = duplicateSerials(s);
        const unpacked = unpackagedLines(s);
        return [
          unpacked.length > 0 && {
            type: "alert",
            tone: "warn",
            title: `${unpacked.length} บรรทัดยังไม่ได้ใส่กล่อง`,
            message: "ต้องกำหนดกล่องให้ครบทุกบรรทัดก่อน Dispatch",
          },
          dupes.length > 0 && {
            type: "alert",
            tone: "danger",
            title: "พบ Serial Number ซ้ำ",
            message: dupes.join(", "),
          },
          {
            type: "table",
            title: `Shipment Items (${s.itemCount})`,
            rows: (s.items ?? []).map((it) => ({
              ...it,
              remaining: remainingShippable(it),
              over: Math.max(0, it.shipmentQty - remainingShippable(it)),
            })),
            empty: "ไม่มีรายการ",
            cols: [
              { key: "line", label: "#", align: "right", muted: true },
              { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
              { key: "name", label: "Product Name" },
              { key: "doLine", label: "DO Line", align: "right", muted: true },
              { key: "orderedQty", label: "Ordered", align: "right", muted: true, cell: (r) => fmt(r.orderedQty) },
              { key: "prevShippedQty", label: "Prev. Shipped", align: "right", muted: true, cell: (r) => fmt(r.prevShippedQty) },
              {
                key: "remaining",
                label: "Remaining Shippable",
                align: "right",
                cell: (r) => <span className={r.remaining === 0 ? "text-ink-3" : ""}>{fmt(r.remaining)}</span>,
              },
              { key: "shipmentQty", label: "Shipment Qty", align: "right", cell: (r) => <strong>{fmt(r.shipmentQty)}</strong> },
              {
                key: "over",
                label: "เกิน",
                align: "right",
                cell: (r) =>
                  r.over > 0 ? <span className="font-semibold text-danger">{fmt(r.over)}</span> : DASH,
              },
              { key: "deliveredQty", label: "Delivered", align: "right", cell: (r) => fmt(r.deliveredQty) },
              { key: "unit", label: "UOM", muted: true },
              { key: "warehouse", label: "Warehouse", muted: true },
              { key: "bin", label: "Bin", muted: true, cell: (r) => r.bin || DASH },
              { key: "lot", label: "Lot", muted: true, cell: (r) => r.lot || DASH },
              { key: "serial", label: "Serial", muted: true, cell: (r) => r.serial || DASH },
              {
                key: "packageNo",
                label: "Package",
                cell: (r) =>
                  r.packageNo ? (
                    <Badge tone="neutral">{r.packageNo}</Badge>
                  ) : (
                    <span className="text-warning-text">ยังไม่ใส่กล่อง</span>
                  ),
              },
              {
                key: "deliveryStatus",
                label: "Delivery Status",
                cell: (r) => <Badge tone={tone(DLV_TONE, r.deliveryStatus)}>{r.deliveryStatus}</Badge>,
              },
              { key: "note", label: "Notes", muted: true, cell: (r) => r.note || DASH },
            ],
          },
          {
            type: "cards",
            title: "Item Totals",
            cols: 4,
            items: [
              { label: "Total Items", value: fmt(s.itemCount), unit: "รายการ" },
              { label: "Total Quantity", value: fmt(s.totalQty), unit: "หน่วย" },
              { label: "Delivered", value: fmt(s.deliveredQty), unit: "หน่วย", tone: "accent" },
              {
                label: "Remaining",
                value: fmt(s.remainingQty),
                unit: "หน่วย",
                tone: s.remainingQty > 0 ? "warn" : undefined,
              },
            ],
          },
          s.isQtyLocked && {
            type: "note",
            title: "Locked",
            text: "จำนวนสินค้าถูกล็อกหลัง Dispatch แล้ว — แก้ไขได้เฉพาะการเพิ่มเหตุการณ์ติดตามและการยืนยันส่งมอบ",
          },
        ];
      },
    },

    /* ---------- 3. PACKAGES ---------- */
    {
      key: "packages",
      label: "Packages",
      blocks: (s) => [
        {
          type: "table",
          title: `Packages (${s.packageCount})`,
          rows: (s.packages ?? []).map((p) => ({
            ...p,
            itemCount: itemsInPackage(s, p.no).length,
            dims: `${p.length}×${p.width}×${p.height}`,
            volWeight: volumetricWeight(p),
          })),
          empty: "ยังไม่ได้จัดกล่อง — เพิ่มกล่องในหน้าแก้ไข",
          cols: [
            { key: "no", label: "Package No.", cell: (r) => <span className="font-medium tnum">{r.no}</span> },
            { key: "type", label: "Package Type" },
            { key: "boxType", label: "Box Type", muted: true },
            { key: "dims", label: "Dimensions (cm)", muted: true, cell: (r) => <span className="tnum">{r.dims}</span> },
            { key: "weight", label: "Weight (kg)", align: "right", cell: (r) => r.weight },
            { key: "volWeight", label: "Vol. Weight", align: "right", muted: true, cell: (r) => r.volWeight },
            { key: "itemCount", label: "Item Count", align: "right", cell: (r) => fmt(r.itemCount) },
            { key: "trackingNo", label: "Tracking No.", muted: true, cell: (r) => r.trackingNo || DASH },
            { key: "sealNo", label: "Seal No.", muted: true, cell: (r) => r.sealNo || DASH },
            {
              key: "status",
              label: "Status",
              cell: (r) => (
                <Badge tone={r.status === "Damaged" ? "danger" : r.status === "Delivered" ? "success" : "info"}>
                  {r.status}
                </Badge>
              ),
            },
            { key: "note", label: "Notes", muted: true, cell: (r) => r.note || DASH },
          ],
        },
        {
          type: "cards",
          title: "Package Summary",
          cols: 3,
          items: [
            { label: "Total Packages", value: fmt(s.packageCount), unit: "กล่อง", tone: "accent" },
            { label: "Total Weight", value: `${s.totalWeight}`, unit: "kg" },
            { label: "Total Volume", value: `${s.totalVolume}`, unit: "m³" },
          ],
        },
      ],
    },

    /* ---------- 4. CARRIER AND ROUTE ---------- */
    {
      key: "carrier",
      label: "Carrier and Route",
      blocks: (s) => [
        {
          type: "fields",
          title: "Carrier",
          cols: 2,
          items: [
            { label: "Shipping Method", value: s.shippingMethod },
            { label: "Carrier", value: s.carrier },
            { label: "Carrier Service", value: s.carrierService },
            { label: "Tracking Number", value: s.trackingNo || DASH },
          ],
        },
        {
          type: "fields",
          title: "Driver and Vehicle",
          cols: 2,
          items: [
            { label: "Driver", value: s.driver || DASH },
            { label: "Driver Phone", value: s.driverPhone || DASH },
            { label: "Vehicle Type", value: s.vehicleType || DASH },
            { label: "Vehicle Number", value: s.vehicleNo || DASH },
            { label: "Route", value: s.route || DASH },
            { label: "Loading Bay", value: s.loadingBay || DASH },
          ],
        },
        {
          type: "fields",
          title: "Schedule",
          cols: 2,
          items: [
            { label: "Pickup Date and Time", value: s.pickupTime || DASH },
            { label: "Dispatch Date and Time", value: s.dispatchDate || DASH },
            { label: "Expected Delivery", value: s.expectedDelivery },
            { label: "Actual Delivery", value: s.actualDelivery || DASH },
            s.rescheduledFrom
              ? { label: "Rescheduled From", value: s.rescheduledFrom }
              : null,
            s.rescheduleReason
              ? { label: "Reschedule Reason", value: s.rescheduleReason, span: true }
              : null,
            { label: "Special Instructions", value: s.specialInstructions || DASH, span: true },
          ],
        },
        {
          type: "planned",
          title: "Cost",
          label: "Shipping Cost",
          message: "ค่าขนส่งและการกระทบยอดค่าระวางจะมาพร้อมโมดูล Finance",
        },
      ],
    },

    /* ---------- 5. TRACKING ---------- */
    {
      key: "tracking",
      label: "Tracking",
      blocks: (s, ctx) => [
        {
          type: "node",
          title: "Delivery Progress",
          node: (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <UtilBar
                  pct={s.deliveryProgress}
                  tone={s.deliveryProgress >= 100 ? "full" : s.deliveryProgress > 0 ? "mid" : undefined}
                />
              </div>
              <span className="flex-shrink-0 text-[13px] font-medium tnum">{s.deliveryProgress}%</span>
            </div>
          ),
        },
        {
          type: "timeline",
          title: `Tracking Timeline (${s.tracking?.length ?? 0})`,
          items: (s.tracking ?? []).map((e) => ({
            title: e.status,
            detail: [e.location, e.remark].filter(Boolean).join(" — "),
            user: e.by,
            when: e.when,
            kind:
              e.status === "Delivered"
                ? "primary"
                : e.status === "Delivery Failed" || e.status === "Returned"
                  ? "warn"
                  : "info",
          })),
        },
        {
          type: "node",
          title: "Add Tracking Update",
          node: (
            <button
              type="button"
              onClick={() => shpAddTracking(s, ctx)}
              className="inline-flex items-center gap-2 rounded-btn border border-line bg-card px-4 py-2 text-[13px] font-medium transition-colors hover:bg-surface"
            >
              เพิ่มสถานะติดตาม
            </button>
          ),
        },
      ],
    },

    /* ---------- 6. PROOF OF DELIVERY ---------- */
    {
      key: "pod",
      label: "Proof of Delivery",
      blocks: (s, ctx) => {
        if (!s.pod)
          return [
            {
              type: "empty",
              title: "Proof of Delivery",
              icon: "file",
              heading: "ยังไม่มีหลักฐานการส่งมอบ",
              message:
                "หลักฐานจะถูกบันทึกเมื่อยืนยันการส่งมอบ — ผู้รับ ลายเซ็น รูปถ่าย และพิกัด",
            },
          ];

        const p = s.pod;
        return [
          {
            type: "fields",
            title: "Proof of Delivery",
            cols: 2,
            items: [
              { label: "Recipient Name", value: p.recipient },
              { label: "Recipient Position", value: p.position || DASH },
              { label: "Recipient Phone", value: p.phone || DASH },
              { label: "Delivery Result", value: <Badge tone="success">{p.result}</Badge> },
              { label: "Delivery Date and Time", value: `${p.date} ${p.time}` },
              { label: "Delivery Address", value: s.deliveryAddress, span: true },
              { label: "Driver", value: s.driver || DASH },
              { label: "Vehicle", value: s.vehicleNo || DASH },
              { label: "Signature", value: p.signature || "ไม่มี", muted: !p.signature },
              { label: "Delivery Photo", value: p.photo || "ไม่มี", muted: !p.photo },
              { label: "GPS Location", value: p.gps || DASH, muted: true },
              { label: "Remarks", value: p.remark || DASH, span: true },
            ],
          },
          {
            type: "node",
            title: "Actions",
            node: (
              <div className="flex flex-wrap gap-2">
                {[
                  ["Print", () => shpPrintDocument(s, ctx)],
                  ["Download", () => ctx.toast("ดาวน์โหลดหลักฐาน", `${s.code} — Future support`, "info")],
                  [
                    "Replace Proof",
                    () =>
                      ctx.toast(
                        "แทนที่หลักฐาน",
                        "ต้องมีสิทธิ์ระดับหัวหน้างาน — Future support",
                        "info",
                      ),
                  ],
                ].map(([label, run]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={run as () => void}
                    className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
                  >
                    {String(label)}
                  </button>
                ))}
              </div>
            ),
          },
        ];
      },
    },

    /* ---------- 7. DELIVERY EXCEPTIONS ---------- */
    {
      key: "exceptions",
      label: "Delivery Exceptions",
      blocks: (s, ctx) => [
        {
          type: "table",
          title: `Exceptions (${s.exceptions?.length ?? 0})`,
          rows: s.exceptions ?? [],
          empty: "ไม่มีเหตุผิดปกติ",
          cols: [
            { key: "type", label: "Exception Type", cell: (r) => <strong>{r.type}</strong> },
            { key: "when", label: "Date and Time", muted: true },
            {
              key: "severity",
              label: "Severity",
              cell: (r) => (
                <Badge
                  tone={
                    r.severity === "Critical" ? "danger" : r.severity === "High" ? "warning" : "neutral"
                  }
                >
                  {r.severity}
                </Badge>
              ),
            },
            { key: "party", label: "Responsible", muted: true, cell: (r) => r.party || DASH },
            { key: "desc", label: "Description" },
            { key: "resolution", label: "Resolution", muted: true, cell: (r) => r.resolution || DASH },
            { key: "followUp", label: "Follow-Up", muted: true, cell: (r) => r.followUp || DASH },
            {
              key: "status",
              label: "Status",
              cell: (r) => (
                <Badge tone={r.status === "Resolved" ? "success" : "warning"}>{r.status}</Badge>
              ),
            },
          ],
        },
        {
          type: "node",
          title: "Actions",
          node: (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => shpRecordException(s, ctx)}
                className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                Record Exception
              </button>
              <button
                type="button"
                onClick={() => shpReschedule(s, ctx)}
                className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={() => shpCreateReturn(s, ctx)}
                className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                Create Return Request
              </button>
              <button
                type="button"
                onClick={() =>
                  ctx.toast("ติดต่อลูกค้า", `${s.contactPerson} · ${s.contactPhone}`, "info")
                }
                className="rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface"
              >
                Contact Customer
              </button>
            </div>
          ),
        },
      ],
    },

    /* ---------- 8. SOURCE DOCUMENTS ---------- */
    {
      key: "source",
      label: "Source Documents",
      blocks: (s, ctx) => {
        const siblings = s.doRef ? shipmentsForDO(s.doRef) : [];
        return [
          {
            type: "entity",
            title: "Source Documents",
            empty: "ใบขนส่งนี้ไม่ได้อ้างอิงเอกสารต้นทาง",
            items: [
              s.doRef && {
                name: s.doRef,
                sub: `Delivery Order · ${s.customer}`,
                avatar: "DO",
                end: <Badge tone="info">Source</Badge>,
                onClick: () => ctx.openEntity("delivery-order", s.doRef),
              },
              s.soRef && {
                name: s.soRef,
                sub: `Sales Order · ${s.customer}`,
                avatar: "SO",
                end: <Badge tone="neutral">Upstream</Badge>,
                onClick: () => ctx.openEntity("sales-order", s.soRef),
              },
              s.invRef && {
                name: s.invRef,
                sub: `Sales Invoice · ${s.customer}`,
                avatar: "IN",
                end: <Badge tone="neutral">Billing</Badge>,
                onClick: () => ctx.openEntity("sales-invoice", s.invRef),
              },
            ].filter(Boolean) as { name: string; sub: string; avatar: string; end: React.ReactNode; onClick: () => void }[],
          },
          siblings.length > 1 && {
            type: "table",
            title: `ใบขนส่งอื่นจากใบส่งของเดียวกัน (${siblings.length - 1})`,
            rows: siblings.filter((x) => x.code !== s.code),
            cols: [
              {
                key: "code",
                label: "Shipment No.",
                cell: (r) => (
                  <button
                    onClick={() => ctx.openEntity("shipment", r.code)}
                    className="font-medium text-info hover:underline tnum"
                  >
                    {r.code}
                  </button>
                ),
              },
              { key: "shipmentDate", label: "Shipment Date", muted: true },
              { key: "totalQty", label: "Qty", align: "right", cell: (r) => fmt(r.totalQty) },
              { key: "status", label: "Status", cell: (r) => <Badge tone={tone(SHP_TONE, r.status)}>{r.status}</Badge> },
            ],
          },
          {
            type: "note",
            title: "Partial Shipment",
            text: "ใบส่งของหนึ่งใบเปิดใบขนส่งได้หลายรอบ — ระบบตัดจำนวนที่ส่งไปแล้วออกจากยอดคงเหลือให้อัตโนมัติ",
          },
        ];
      },
    },

    /* ---------- 9. DOCUMENT RELATIONSHIP ---------- */
    {
      key: "relationship",
      label: "Document Relationship",
      blocks: (s, ctx) => {
        const soon = (name: string) => ctx.toast(name, `โมดูล ${name} กำลังจะมา — Coming Soon`, "info");
        return [
          {
            type: "note",
            title: "Document Flow",
            text: "Sales Request → Sales Order → Picking → Packing → Delivery Order → Sales Invoice → Shipment → Return → Credit Note",
          },
          {
            type: "entity",
            title: "Source Documents",
            empty: "ไม่มีเอกสารต้นทาง",
            items: [
              s.doRef && {
                name: s.doRef,
                sub: `Delivery Order · ${s.shipmentDate} · ${fmt(s.totalQty)} หน่วย · ${s.createdBy}`,
                avatar: "DO",
                end: <Badge tone="info">Source</Badge>,
                onClick: () => ctx.openEntity("delivery-order", s.doRef),
              },
              s.soRef && {
                name: s.soRef,
                sub: `Sales Order · ${s.customer}`,
                avatar: "SO",
                end: <Badge tone="neutral">Upstream</Badge>,
                onClick: () => ctx.openEntity("sales-order", s.soRef),
              },
              s.invRef && {
                name: s.invRef,
                sub: `Sales Invoice · ${s.customer}`,
                avatar: "IN",
                end: <Badge tone="neutral">Billing</Badge>,
                onClick: () => ctx.openEntity("sales-invoice", s.invRef),
              },
            ].filter(Boolean) as { name: string; sub: string; avatar: string; end: React.ReactNode; onClick: () => void }[],
          },
          {
            type: "entity",
            title: "Target Documents",
            empty: "ยังไม่มีเอกสารปลายทาง",
            items: [
              {
                name: s.returnRef || "Return Request",
                sub: s.returnRef ? "เปิดคำขอคืนแล้ว" : "ยังไม่ได้เปิดคำขอคืนสินค้า",
                avatar: "RT",
                end: (
                  <Badge tone={s.returnRef ? "info" : "neutral"}>
                    {s.returnRef ? "Created" : "Coming Soon"}
                  </Badge>
                ),
                onClick: () => soon("Return"),
              },
              {
                name: "Credit Note",
                sub: "ใบลดหนี้จากการคืนสินค้า",
                avatar: "CN",
                end: <Badge tone="neutral">Coming Soon</Badge>,
                onClick: () => soon("Credit Note"),
              },
              {
                name: "Receive Payment",
                sub: "การรับชำระจากใบแจ้งหนี้",
                avatar: "RP",
                end: <Badge tone="neutral">Coming Soon</Badge>,
                onClick: () => soon("Receive Payment"),
              },
            ],
          },
        ];
      },
    },

    /* ---------- 10. TIMELINE ---------- */
    {
      key: "timeline",
      label: "Timeline",
      blocks: (s) => [
        {
          type: "timeline",
          title: "Activity",
          items: (s.history ?? []).map((h) => ({
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
          message: "ความคิดเห็น การแนบไฟล์ และการแจ้งเตือนคนขับจะเพิ่มในเฟสถัดไป",
        },
      ],
    },

    /* ---------- 11. AUDIT LOG ---------- */
    {
      key: "audit",
      label: "Audit Log",
      blocks: (s) => [
        { type: "audit", title: "Change History", items: s.audit ?? [] },
        {
          type: "planned",
          title: "Phase 2",
          label: "Field-level audit",
          message: "การบันทึกทุกการเปลี่ยนแปลงระดับฟิลด์พร้อมผู้ใช้และอุปกรณ์จะเพิ่มในเฟสถัดไป",
        },
      ],
    },
  ],

  actions: (s, ctx) => {
    const acts: RowAction<ShpRow>[] = [];

    if (["Draft", "Rescheduled"].includes(s.status))
      acts.push({ label: "Mark Ready", icon: "checkCircle", run: () => shpMarkReady(s, ctx) });
    if (s.canDispatch) acts.push({ label: "Dispatch", icon: "send", run: () => shpDispatch(s, ctx) });
    if (!["Draft", "Cancelled"].includes(s.status))
      acts.push({ label: "Update Tracking", icon: "refresh", run: () => shpAddTracking(s, ctx) });
    if (s.canDeliver)
      acts.push({ label: "Confirm Delivery", icon: "checkCircle", run: () => shpConfirmDelivery(s, ctx) });
    if (!["Draft", "Cancelled", "Delivered"].includes(s.status))
      acts.push({ label: "Record Exception", icon: "alert", run: () => shpRecordException(s, ctx) });
    if (s.canReschedule)
      acts.push({ label: "Reschedule", icon: "calendar", run: () => shpReschedule(s, ctx) });

    acts.push({ label: "Print Shipping Label", icon: "printer", run: () => shpPrintLabel(s, ctx) });
    acts.push({ label: "Print Shipment Document", icon: "file", run: () => shpPrintDocument(s, ctx) });

    if (["Delivery Failed", "Delivered", "Partially Delivered", "Exception"].includes(s.status))
      acts.push({ label: "Create Return Request", icon: "return", run: () => shpCreateReturn(s, ctx) });

    if (!["Delivered", "Returned", "Cancelled"].includes(s.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Shipment", icon: "circleSlash", danger: true, run: () => shpCancel(s, ctx) });
    }

    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("shipment", s, ctx));
    return acts;
  },
};

export const shpSchemas: EntitySchemas<ShpRow> = {
  list: SHP_LIST,
  detail: SHP_DETAIL,
  form: SHP_FORM,
};
