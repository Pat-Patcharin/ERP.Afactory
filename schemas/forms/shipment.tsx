import type { Shipment } from "@/data/shipments";
import {
  SHP_BOX_TYPES,
  SHP_CARRIERS,
  SHP_CARRIER_SERVICES,
  SHP_DISPATCH_TEAMS,
  SHP_DRIVERS,
  SHP_DRIVER_PHONE,
  SHP_LOADING_BAYS,
  SHP_PACKAGE_STATUS,
  SHP_PACKAGE_TYPES,
  SHP_PRIORITY,
  SHP_ROUTES,
  SHP_SHIPPING_METHODS,
  SHP_VEHICLES,
  SHP_VEHICLE_TYPES,
} from "@/data/shipments";
import { INV_BRANCHES } from "@/data/sales-invoices";
import { SALES_INVOICES } from "@/lib/domain/invoice";
import { PRODUCTS } from "@/lib/domain/product";
import {
  SHIPMENTS,
  decorateShipments,
  dispatchReadiness,
  duplicateSerials,
  headerFromDO,
  isOwnFleet,
  needsTracking,
  nextPackageNo,
  nextShipmentCode,
  remainingShippable,
  shippableDeliveryOrders,
  shippableLinesFrom,
  volumetricWeight,
} from "@/lib/domain/shipment";
import type { ShpRow } from "@/lib/domain/shipment";
import { warehouseOptions } from "@/lib/domain/outbound";
import { fmt, stamp, isoToDmy, dmyToIso, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import { FORM_USER, ReviewCard, opts, saved } from "./common";

/* ============================================================
   SHIPMENT FORM

   Create Shipment and Create From Delivery Order are the same
   form: step 1 picks the Delivery Order and pulls its remaining
   shippable lines. Nothing here writes stock or pricing.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const packageNumbers = (s: { packages?: GridRow[] }) =>
  ((s.packages ?? []) as GridRow[]).map((p) => String(p.no ?? "").trim()).filter(Boolean);

const overShipped = (r: GridRow) => num(r.shipmentQty) > remainingShippable(r);

const draftWeight = (s: GridRow) =>
  Math.round(((s.packages ?? []) as GridRow[]).reduce((t, p) => t + num(p.weight), 0) * 100) / 100;

export const SHP_FORM: FormSchema<ShpRow> = {
  key: "shipment",
  entityLabel: "Shipment",
  saveButton: "Save Draft",
  statusBadge: {
    Draft: "neutral",
    "Ready to Dispatch": "info",
    Dispatched: "warning",
    "In Transit": "warning",
    "Out for Delivery": "warning",
    Delivered: "success",
    "Partially Delivered": "warning",
    "Delivery Failed": "danger",
    Rescheduled: "warning",
    Returned: "danger",
    Cancelled: "neutral",
    Exception: "danger",
  },

  /* Rule 15: quantities are locked once dispatched; delivered and beyond are
     read-only entirely. Tracking stays editable through its own action. */
  editGuard: (s) =>
    ["Draft", "Ready to Dispatch"].includes(s.status)
      ? null
      : `${s.code} อยู่ในสถานะ ${s.status} — ` +
        (["Delivered", "Returned", "Cancelled"].includes(s.status)
          ? "ใบขนส่งที่ส่งมอบ คืน หรือยกเลิกแล้วเป็นเอกสารอ่านอย่างเดียว"
          : "หลัง Dispatch แล้วแก้จำนวนไม่ได้ — ใช้ Update Tracking, Confirm Delivery หรือ Record Exception แทน"),

  blank: () => ({
    _mode: "create",
    code: nextShipmentCode(),
    doRef: "",
    soRef: "",
    invRef: "",
    customer: "",
    customerCode: "",
    deliveryAddress: "",
    contactPerson: "",
    contactPhone: "",
    deliveryInstruction: "",
    customerRef: "",
    salesRep: "",
    status: "Draft",
    deliveryStatus: "Pending",
    priority: "Normal",
    shippingMethod: "Company Vehicle",
    warehouse: "",
    branch: "Head Office",
    loadingBay: "",
    dispatchTeam: "",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "",
    driver: "",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "",
    route: "",
    shipmentDate: dmyToIso(today()),
    expectedDelivery: "",
    pickupTime: "",
    specialInstructions: "",
    note: "",
    items: [],
    packages: [],
  }),

  toState: (s) => ({
    _mode: "edit",
    code: s.code,
    doRef: s.doRef,
    soRef: s.soRef,
    invRef: s.invRef,
    customer: s.customer,
    customerCode: s.customerCode,
    deliveryAddress: s.deliveryAddress,
    contactPerson: s.contactPerson,
    contactPhone: s.contactPhone,
    deliveryInstruction: s.deliveryInstruction,
    customerRef: s.customerRef,
    salesRep: s.salesRep,
    status: s.status,
    deliveryStatus: s.deliveryStatus,
    priority: s.priority,
    shippingMethod: s.shippingMethod,
    warehouse: s.warehouse,
    branch: s.branch,
    loadingBay: s.loadingBay,
    dispatchTeam: s.dispatchTeam,
    carrier: s.carrier,
    carrierService: s.carrierService,
    trackingNo: s.trackingNo,
    driver: s.driver,
    driverPhone: s.driverPhone,
    vehicleType: s.vehicleType,
    vehicleNo: s.vehicleNo,
    route: s.route,
    shipmentDate: dmyToIso(s.shipmentDate),
    expectedDelivery: dmyToIso(s.expectedDelivery),
    pickupTime: s.pickupTime,
    specialInstructions: s.specialInstructions,
    note: s.note,
    items: (s.items ?? []).map((it) => ({ ...it })),
    packages: (s.packages ?? []).map((p) => ({ ...p })),
  }),

  steps: [
    /* ---------- 1. SOURCE DOCUMENT ---------- */
    {
      key: "source",
      label: "Source Document",
      railLabel: "Source Document",
      labelTh: "ใบส่งของต้นทาง",
      blocks: (s) => [
        {
          type: "note",
          label: "ใบขนส่งไม่คิดราคาและไม่แตะสต๊อก",
          text: "เอกสารนี้จัดการการนำส่งจริงเท่านั้น — ราคาอยู่ที่ใบแจ้งหนี้ และการตัดสต๊อกอยู่ที่ Picking / Delivery Order",
        },
        {
          type: "card",
          title: "Create From Delivery Order",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Shipment Number" },
            {
              type: "select",
              path: "doRef",
              label: "Delivery Order",
              required: true,
              options: shippableDeliveryOrders().map((d) => d.code),
              hint: "เลือกใบส่งของแล้วระบบจะดึงบรรทัดที่ยังส่งไม่ครบมาให้",
              when: (st) => st._mode === "create",
            },
            { type: "static", path: "doRef", label: "Delivery Order", when: (st) => st._mode !== "create" },
            { type: "static", path: "soRef", label: "Sales Order" },
            { type: "static", path: "invRef", label: "Sales Invoice" },
            {
              type: "static",
              label: "Source Summary",
              span: true,
              value: (st) => {
                if (!st.doRef) return "ยังไม่ได้เลือกใบส่งของ";
                const rows = (st.items ?? []) as GridRow[];
                const open = rows.filter((r) => remainingShippable(r) > 0).length;
                return `${st.doRef} · ดึงมา ${rows.length} บรรทัด · ยังส่งได้ ${open} บรรทัด`;
              },
            },
          ],
        },
      ],
    },

    /* ---------- 2. SHIPMENT INFORMATION ---------- */
    {
      key: "info",
      label: "Shipment Information",
      railLabel: "Shipment Information",
      labelTh: "วันที่และคลังต้นทาง",
      blocks: () => [
        {
          type: "card",
          title: "Shipment Information",
          cols: "3",
          fields: [
            { type: "date", path: "shipmentDate", label: "Shipment Date", required: true },
            { type: "date", path: "expectedDelivery", label: "Expected Delivery Date", required: true },
            { type: "select", path: "priority", label: "Priority", required: true, options: opts(SHP_PRIORITY) },
            {
              type: "select",
              path: "shippingMethod",
              label: "Shipping Method",
              required: true,
              options: opts(SHP_SHIPPING_METHODS),
            },
            {
              type: "select",
              path: "warehouse",
              label: "Warehouse",
              required: true,
              options: warehouseOptions(),
            },
            { type: "select", path: "branch", label: "Branch", options: opts(INV_BRANCHES) },
            { type: "text", path: "salesRep", label: "Sales Representative" },
            { type: "text", path: "customerRef", label: "Customer Reference" },
            { type: "select", path: "loadingBay", label: "Loading Bay", options: opts(SHP_LOADING_BAYS) },
            { type: "select", path: "dispatchTeam", label: "Dispatch Team", options: opts(SHP_DISPATCH_TEAMS) },
          ],
        },
      ],
    },

    /* ---------- 3. CUSTOMER AND DESTINATION ---------- */
    {
      key: "destination",
      label: "Customer and Destination",
      railLabel: "Customer and Destination",
      labelTh: "ปลายทางและผู้ติดต่อ",
      blocks: () => [
        {
          type: "card",
          title: "Destination",
          cols: "3",
          fields: [
            { type: "static", path: "customer", label: "Customer" },
            { type: "static", path: "customerCode", label: "Customer Code" },
            { type: "text", path: "contactPerson", label: "Contact Person", required: true },
            { type: "text", path: "contactPhone", label: "Contact Phone", required: true, placeholder: "02-123-4567" },
            {
              type: "textarea",
              path: "deliveryAddress",
              label: "Delivery Address",
              required: true,
              span: true,
              rows: 2,
            },
            {
              type: "textarea",
              path: "deliveryInstruction",
              label: "Delivery Instruction",
              span: true,
              rows: 2,
              placeholder: "เช่น ส่งที่คลังพัสดุกลาง อาคาร 2 · โทรแจ้งก่อนถึง 30 นาที",
            },
          ],
        },
      ],
    },

    /* ---------- 4. SHIPMENT ITEMS ---------- */
    {
      key: "items",
      label: "Shipment Items",
      railLabel: "Shipment Items",
      labelTh: "รายการและจำนวนที่ส่ง",
      blocks: (s) => [
        {
          type: "grid",
          path: "items",
          label: "Shipment Items",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกใบส่งของในขั้นตอนแรกเพื่อดึงบรรทัดที่ส่งได้",
          hint: "Remaining Shippable = Delivery Order Qty − Previously Shipped Qty — กำหนดกล่องให้ครบก่อน Dispatch",
          cols: [
            { key: "line", label: "#", type: "static", align: "right", muted: true, width: "42px" },
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "150px",
              placeholder: "ค้นหาสินค้า...",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "170px" },
            { key: "doLine", label: "DO Line", type: "static", align: "right", muted: true, width: "68px" },
            { key: "orderedQty", label: "Ordered", type: "static", align: "right", muted: true, width: "76px" },
            { key: "prevShippedQty", label: "Prev. Shipped", type: "static", align: "right", muted: true, width: "96px" },
            {
              key: "remaining",
              label: "Remaining",
              type: "computed",
              align: "right",
              get: (r) => fmt(remainingShippable(r)),
              cls: (r) => (remainingShippable(r) === 0 ? "text-ink-3" : ""),
            },
            { key: "shipmentQty", label: "Shipment Qty", type: "number", align: "right", required: true, width: "100px" },
            {
              key: "over",
              label: "เกิน",
              type: "computed",
              align: "right",
              get: (r) => {
                const over = num(r.shipmentQty) - remainingShippable(r);
                return over > 0 ? fmt(over) : "—";
              },
              cls: (r) => (overShipped(r) ? "font-semibold text-danger" : ""),
            },
            { key: "unit", label: "UOM", type: "static", muted: true, width: "58px" },
            { key: "warehouse", label: "Warehouse", type: "text", width: "170px" },
            { key: "bin", label: "Bin", type: "text", width: "90px" },
            { key: "lot", label: "Lot", type: "text", width: "120px" },
            { key: "serial", label: "Serial", type: "text", width: "150px" },
            {
              key: "packageNo",
              label: "Package",
              type: "select",
              options: packageNumbers(s),
              width: "110px",
              placeholder: "เลือกกล่อง",
            },
            { key: "note", label: "Notes", type: "text", width: "130px" },
          ],
        },
        {
          type: "card",
          title: "Item Totals",
          cols: "4",
          fields: [
            {
              type: "static",
              label: "Total Items",
              value: (st) => fmt(((st.items ?? []) as GridRow[]).length),
            },
            {
              type: "static",
              label: "Total Quantity",
              value: (st) => fmt(((st.items ?? []) as GridRow[]).reduce((t, r) => t + num(r.shipmentQty), 0)),
            },
            {
              type: "static",
              label: "Unpackaged Lines",
              value: (st) =>
                fmt(((st.items ?? []) as GridRow[]).filter((r) => !String(r.packageNo ?? "").trim()).length),
            },
            {
              type: "static",
              label: "Over-shipped Lines",
              value: (st) => fmt(((st.items ?? []) as GridRow[]).filter(overShipped).length),
            },
          ],
        },
      ],
    },

    /* ---------- 5. PACKAGES ---------- */
    {
      key: "packages",
      label: "Packages",
      railLabel: "Packages",
      labelTh: "กล่องและน้ำหนัก",
      blocks: () => [
        {
          type: "note",
          label: "สร้างกล่องก่อน แล้วค่อยจับสินค้าลงกล่อง",
          text: "หมายเลขกล่องที่สร้างที่นี่จะกลายเป็นตัวเลือกในคอลัมน์ Package ของขั้นตอน Shipment Items",
        },
        {
          type: "grid",
          path: "packages",
          label: "Packages",
          required: true,
          addLabel: "เพิ่มกล่อง",
          empty: "ยังไม่มีกล่อง — ต้องมีอย่างน้อย 1 ใบก่อน Dispatch",
          cols: [
            { key: "no", label: "Package No.", type: "text", required: true, width: "110px", placeholder: "PKG-01" },
            { key: "type", label: "Package Type", type: "select", options: opts(SHP_PACKAGE_TYPES), width: "120px" },
            { key: "boxType", label: "Box Type", type: "select", options: opts(SHP_BOX_TYPES), width: "200px" },
            { key: "length", label: "L (cm)", type: "number", align: "right", width: "84px" },
            { key: "width", label: "W (cm)", type: "number", align: "right", width: "84px" },
            { key: "height", label: "H (cm)", type: "number", align: "right", width: "84px" },
            { key: "weight", label: "Weight (kg)", type: "number", align: "right", width: "104px" },
            {
              key: "volWeight",
              label: "Vol. Weight",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => fmt(volumetricWeight(r)),
            },
            { key: "trackingNo", label: "Tracking No.", type: "text", width: "150px" },
            { key: "sealNo", label: "Seal No.", type: "text", width: "130px" },
            { key: "status", label: "Status", type: "select", options: opts(SHP_PACKAGE_STATUS), width: "110px" },
            { key: "note", label: "Notes", type: "text", width: "130px" },
          ],
        },
      ],
    },

    /* ---------- 6. CARRIER AND ROUTE ---------- */
    {
      key: "carrier",
      label: "Carrier and Route",
      railLabel: "Carrier and Route",
      labelTh: "ผู้ขนส่ง คนขับ และเส้นทาง",
      blocks: () => [
        {
          type: "card",
          title: "Carrier",
          cols: "3",
          fields: [
            { type: "select", path: "carrier", label: "Carrier", required: true, options: opts(SHP_CARRIERS) },
            {
              type: "select",
              path: "carrierService",
              label: "Carrier Service",
              required: true,
              options: opts(SHP_CARRIER_SERVICES),
            },
            {
              type: "text",
              path: "trackingNo",
              label: "Tracking Number",
              placeholder: "KER260801002",
              hint: "จำเป็นเมื่อใช้ผู้ขนส่งภายนอก",
            },
          ],
        },
        {
          type: "card",
          title: "Driver and Vehicle",
          cols: "3",
          badge: undefined,
          fields: [
            {
              type: "select",
              path: "driver",
              label: "Driver",
              options: opts(SHP_DRIVERS),
              hint: "จำเป็นเมื่อส่งด้วยรถบริษัท",
            },
            { type: "text", path: "driverPhone", label: "Driver Phone" },
            { type: "select", path: "vehicleType", label: "Vehicle Type", options: opts(SHP_VEHICLE_TYPES) },
            { type: "select", path: "vehicleNo", label: "Vehicle Number", options: opts(SHP_VEHICLES) },
            { type: "select", path: "route", label: "Route", options: opts(SHP_ROUTES) },
            { type: "text", path: "pickupTime", label: "Pickup Date and Time", placeholder: "01/08/2026 08:45" },
            {
              type: "textarea",
              path: "specialInstructions",
              label: "Special Instructions",
              span: true,
              rows: 2,
            },
            {
              type: "note",
              label: "Shipping Cost",
              text: "ค่าขนส่งจะบันทึกในโมดูล Finance — เฟสนี้ยังไม่คิดค่าระวาง",
            },
          ],
        },
      ],
    },

    /* ---------- 7. NOTES ---------- */
    {
      key: "notes",
      label: "Notes and Attachments",
      railLabel: "Notes and Attachments",
      labelTh: "หมายเหตุและไฟล์แนบ",
      blocks: () => [
        {
          type: "card",
          title: "Notes",
          cols: "2",
          fields: [
            {
              type: "textarea",
              path: "note",
              label: "Shipment Notes",
              span: true,
              rows: 3,
              placeholder: "ข้อมูลที่ฝ่ายขนส่งและคนขับควรรู้",
            },
            {
              type: "note",
              label: "Attachments",
              text: "การแนบเอกสารขนส่งและรูปถ่ายจะเปิดใช้พร้อมระบบจัดเก็บเอกสารในเฟสถัดไป",
            },
          ],
        },
      ],
    },

    /* ---------- 8. SUMMARY ---------- */
    {
      key: "review",
      label: "Summary",
      railLabel: "Summary",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "doRef", label: "Delivery Order", step: "source" },
    { path: "shipmentDate", label: "Shipment Date", step: "info" },
    { path: "expectedDelivery", label: "Expected Delivery Date", step: "info" },
    { path: "priority", label: "Priority", step: "info" },
    { path: "shippingMethod", label: "Shipping Method", step: "info" },
    { path: "warehouse", label: "Warehouse", step: "info" },
    { path: "deliveryAddress", label: "Delivery Address", step: "destination" },
    { path: "contactPerson", label: "Contact Person", step: "destination" },
    { path: "contactPhone", label: "Contact Phone", step: "destination" },
    {
      path: "items",
      label: "รายการที่ส่งอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.shipmentQty) > 0),
    },
    {
      path: "packages",
      label: "กล่องอย่างน้อย 1 ใบ",
      step: "packages",
      test: (s) => packageNumbers(s).length > 0,
    },
    { path: "carrier", label: "Carrier", step: "carrier" },
    { path: "carrierService", label: "Carrier Service", step: "carrier" },
    {
      path: "driver",
      label: "Driver",
      step: "carrier",
      /* Own fleet must name a driver; a courier need not. */
      test: (s) => !isOwnFleet(String(s.carrier ?? "")) || Boolean(String(s.driver ?? "").trim()),
    },
    {
      path: "vehicleNo",
      label: "Vehicle Number",
      step: "carrier",
      test: (s) => !isOwnFleet(String(s.carrier ?? "")) || Boolean(String(s.vehicleNo ?? "").trim()),
    },
    {
      path: "trackingNo",
      label: "Tracking Number",
      step: "carrier",
      test: (s) => !needsTracking(String(s.carrier ?? "")) || Boolean(String(s.trackingNo ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันที่คาดว่าจะส่งถึงต้องไม่อยู่ก่อนวันที่ออกใบขนส่ง",
      step: "info",
      test: (s) =>
        !s.expectedDelivery || !s.shipmentDate || String(s.expectedDelivery) >= String(s.shipmentDate),
    },
    {
      label: "ทุกบรรทัดต้องเลือกสินค้าที่มีอยู่ในระบบ",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) =>
          PRODUCTS.some((p) => p.code === String(r.code ?? "").trim()),
        ),
    },
    {
      label: "จำนวนที่ส่งต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.shipmentQty) > 0),
    },
    {
      label: "จำนวนที่ส่งต้องไม่เกินจำนวนคงเหลือที่ส่งได้",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => !overShipped(r)),
    },
    {
      label: "ทุกบรรทัดต้องถูกกำหนดกล่อง",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) => Boolean(String(r.packageNo ?? "").trim())),
    },
    {
      label: "กล่องที่ระบุในบรรทัดต้องมีอยู่ในรายการกล่อง",
      step: "items",
      test: (s) => {
        const boxes = packageNumbers(s);
        return ((s.items ?? []) as GridRow[]).every((r) => {
          const b = String(r.packageNo ?? "").trim();
          return !b || boxes.includes(b);
        });
      },
    },
    {
      label: "ห้ามมี Serial Number ซ้ำในใบขนส่งเดียวกัน",
      step: "items",
      test: (s) => duplicateSerials({ items: (s.items ?? []) as never }).length === 0,
    },
    {
      label: "หมายเลขกล่องต้องไม่ซ้ำกัน",
      step: "packages",
      test: (s) => {
        const list = packageNumbers(s);
        return new Set(list).size === list.length;
      },
    },
    {
      label: "น้ำหนักและขนาดกล่องต้องไม่ติดลบ",
      step: "packages",
      test: (s) =>
        ((s.packages ?? []) as GridRow[]).every(
          (p) => num(p.weight) >= 0 && num(p.length) >= 0 && num(p.width) >= 0 && num(p.height) >= 0,
        ),
    },
  ],

  lookup: {
    product: (q): LookupHit[] => {
      const t = q.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) =>
          !t ||
          p.code.toLowerCase().includes(t) ||
          p.name.toLowerCase().includes(t) ||
          p.nameTh.includes(q.trim()),
      )
        .slice(0, 20)
        .map((p) => ({ code: p.code, name: p.name, meta: p.unit }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const row = ((s[path] ?? []) as GridRow[])[index];
    if (!row) return;
    const p = PRODUCTS.find((x) => x.code === hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.unit = p?.unit ?? "";
    if (!num(row.shipmentQty)) row.shipmentQty = 1;
    /* A manually added line has no delivery-order backing, so everything it
       carries is shippable. */
    row.orderedQty = num(row.shipmentQty);
    row.prevShippedQty = 0;
    row.deliveredQty = 0;
    if (!row.warehouse) row.warehouse = String(s.warehouse ?? "");
    if (!row.deliveryStatus) row.deliveryStatus = "Pending";
  },

  onChange: (path, s) => {
    /* The delivery order supplies the destination and the shippable lines. */
    if (path === "doRef") {
      const doCode = String(s.doRef ?? "");
      if (!doCode) return;
      const head = headerFromDO(doCode);
      if (head) {
        s.customer = head.customer;
        s.customerCode = head.customerCode;
        s.deliveryAddress = head.deliveryAddress;
        s.contactPerson = head.contactPerson;
        s.contactPhone = head.contactPhone;
        s.warehouse = head.warehouse;
        s.soRef = head.soRef;
        s.invRef = head.invRef;
        s.salesRep = head.salesRep;
        s.customerRef = head.customerRef;
        s.priority = head.priority;
        s.expectedDelivery = dmyToIso(head.expectedDelivery);
        if (head.carrier) s.carrier = head.carrier;
        if (head.trackingNo) s.trackingNo = head.trackingNo;
      }
      s.items = shippableLinesFrom(doCode, String(s.code ?? "")).map((it) => ({ ...it }));
      return;
    }

    /* Picking a driver fills their phone; own fleet vs courier changes what is
       required, so clear what no longer applies. */
    if (path === "driver") {
      const d = String(s.driver ?? "");
      s.driverPhone = SHP_DRIVER_PHONE[d] ?? "";
      return;
    }

    if (path === "carrier") {
      const c = String(s.carrier ?? "");
      if (!isOwnFleet(c)) {
        s.driver = "";
        s.driverPhone = "";
        s.vehicleNo = "";
        s.route = "Courier Handover";
      }
      if (c === "Customer Pickup") {
        s.shippingMethod = "Customer Pickup";
        s.trackingNo = "";
      }
    }
  },

  newRow: (path, isFirst) => {
    if (path === "packages")
      return {
        no: `PKG-${isFirst ? "01" : "02"}`,
        type: "Carton",
        boxType: "Carton M (40×30×25 cm)",
        length: 40,
        width: 30,
        height: 25,
        weight: 0,
        trackingNo: "",
        sealNo: "",
        status: "Packed",
        note: "",
      };
    return {
      line: 0,
      code: "",
      name: "",
      doLine: 0,
      orderedQty: 0,
      prevShippedQty: 0,
      shipmentQty: "",
      deliveredQty: 0,
      unit: "",
      warehouse: "",
      bin: "",
      lot: "",
      serial: "",
      packageNo: "",
      deliveryStatus: "Pending",
      note: "",
    };
  },

  /* Keep package numbering tidy as rows are added. */
  onGridChange: (path, s) => {
    if (path !== "packages") return;
    const rows = (s.packages ?? []) as GridRow[];
    rows.forEach((p, i) => {
      if (!String(p.no ?? "").trim()) p.no = nextPackageNo({ packages: rows.slice(0, i) as never });
    });
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    const boxes = (s.packages ?? []) as GridRow[];
    return (
      <>
        <ReviewCard title="Shipment & Destination">
          {row("Shipment Number", s.code, "source")}
          {row("Delivery Order", s.doRef, "source")}
          {row("Customer", s.customer, "destination")}
          {row("Delivery Address", s.deliveryAddress, "destination")}
          {row("Contact", `${s.contactPerson ?? ""} · ${s.contactPhone ?? ""}`, "destination")}
          {row("Shipment Date", isoToDmy(s.shipmentDate), "info")}
          {row("Expected Delivery", isoToDmy(s.expectedDelivery), "info")}
          {row("Warehouse", s.warehouse, "info")}
        </ReviewCard>
        <ReviewCard title="Carrier">
          {row("Shipping Method", s.shippingMethod, "carrier")}
          {row("Carrier", `${s.carrier ?? ""} · ${s.carrierService ?? ""}`, "carrier")}
          {row("Tracking Number", s.trackingNo, "carrier")}
          {row("Driver", s.driver, "carrier")}
          {row("Vehicle", s.vehicleNo, "carrier")}
          {row("Route", s.route, "carrier")}
        </ReviewCard>
        <ReviewCard title="Items and Packages">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-[9px] text-[13px] last:border-b-0"
            >
              <span className="font-medium tnum">{String(r.code ?? "—")}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{String(r.name ?? "")}</span>
              <span className="tnum">
                {fmt(r.shipmentQty)} {String(r.unit ?? "")}
              </span>
              <span className="w-20 text-right text-ink-2">{String(r.packageNo ?? "—")}</span>
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-ink-2">Total Quantity</span>
              <span className="tnum">{fmt(rows.reduce((t, r) => t + num(r.shipmentQty), 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Packages</span>
              <span className="tnum">{boxes.length}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="font-semibold">Total Weight</span>
              <span className="text-lg font-semibold tnum">{draftWeight(s)} kg</span>
            </div>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = SHIPMENTS.find((x) => x.code === code);

    if (existing && !["Draft", "Ready to Dispatch"].includes(existing.status)) {
      ctx.toast(
        "แก้ไขไม่ได้",
        `${code} อยู่ในสถานะ ${existing.status} — จำนวนถูกล็อกหลัง Dispatch แล้ว`,
        "warning",
      );
      return;
    }

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim() && num(r.shipmentQty) > 0)
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        doLine: num(r.doLine) || i + 1,
        orderedQty: num(r.orderedQty),
        prevShippedQty: num(r.prevShippedQty),
        shipmentQty: num(r.shipmentQty),
        deliveredQty: num(r.deliveredQty),
        unit: String(r.unit ?? ""),
        warehouse: String(r.warehouse ?? s.warehouse ?? ""),
        bin: String(r.bin ?? ""),
        lot: String(r.lot ?? ""),
        serial: String(r.serial ?? ""),
        packageNo: String(r.packageNo ?? ""),
        deliveryStatus: String(r.deliveryStatus ?? "Pending"),
        note: String(r.note ?? ""),
      }));

    const packages = ((s.packages ?? []) as GridRow[])
      .filter((p) => String(p.no ?? "").trim())
      .map((p) => ({
        no: String(p.no).trim(),
        type: String(p.type ?? "Carton"),
        boxType: String(p.boxType ?? ""),
        length: num(p.length),
        width: num(p.width),
        height: num(p.height),
        weight: num(p.weight),
        trackingNo: String(p.trackingNo ?? ""),
        sealNo: String(p.sealNo ?? ""),
        status: String(p.status ?? "Packed"),
        note: String(p.note ?? ""),
      }));

    const patch = {
      doRef: String(s.doRef ?? ""),
      soRef: String(s.soRef ?? ""),
      invRef: String(s.invRef ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      deliveryAddress: String(s.deliveryAddress ?? ""),
      contactPerson: String(s.contactPerson ?? ""),
      contactPhone: String(s.contactPhone ?? ""),
      deliveryInstruction: String(s.deliveryInstruction ?? ""),
      customerRef: String(s.customerRef ?? ""),
      salesRep: String(s.salesRep ?? ""),
      priority: String(s.priority ?? "Normal"),
      shippingMethod: String(s.shippingMethod ?? ""),
      warehouse: String(s.warehouse ?? ""),
      branch: String(s.branch ?? ""),
      loadingBay: String(s.loadingBay ?? ""),
      dispatchTeam: String(s.dispatchTeam ?? ""),
      carrier: String(s.carrier ?? ""),
      carrierService: String(s.carrierService ?? ""),
      trackingNo: String(s.trackingNo ?? ""),
      driver: String(s.driver ?? ""),
      driverPhone: String(s.driverPhone ?? ""),
      vehicleType: String(s.vehicleType ?? ""),
      vehicleNo: String(s.vehicleNo ?? ""),
      route: String(s.route ?? ""),
      shipmentDate: isoToDmy(s.shipmentDate),
      expectedDelivery: isoToDmy(s.expectedDelivery),
      pickupTime: String(s.pickupTime ?? ""),
      specialInstructions: String(s.specialInstructions ?? ""),
      note: String(s.note ?? ""),
      items,
      packages,
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Shipment updated",
        d: "แก้ไขใบขนส่งจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
      (existing.audit ??= []).unshift({
        event: "Shipment edited",
        user: FORM_USER(),
        when: now,
        field: "items",
        from: `${existing.itemCount} lines`,
        to: `${items.length} lines`,
        kind: "info",
      });
    } else {
      const fresh: Shipment = {
        code,
        ...patch,
        /* Always Draft — Mark Ready and Dispatch are separate, deliberate steps. */
        status: "Draft",
        deliveryStatus: "Pending",
        dispatchDate: "",
        actualDelivery: "",
        rescheduleReason: "",
        rescheduledFrom: "",
        cancelReason: "",
        returnRef: "",
        tracking: [
          {
            status: "Shipment Created",
            when: now,
            location: patch.warehouse,
            by: FORM_USER(),
            remark: patch.doRef ? `From ${patch.doRef}` : "",
          },
        ],
        exceptions: [],
        pod: null,
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.doRef ? `Created from ${patch.doRef}` : "Shipment created",
            d: "สร้างใบขนส่งจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
        audit: [
          {
            event: "Shipment created",
            user: FORM_USER(),
            when: now,
            field: "—",
            from: "—",
            to: "Draft",
            kind: "",
          },
        ],
      };
      SHIPMENTS.unshift(fresh as ShpRow);
    }

    /* Point the invoice at this shipment, so the tracking number has one home
       and one reader. The pointer goes on the invoice rather than the number
       itself — see the field note on `SalesInvoice.shipmentRef`. Written here
       because this is where the two documents first know about each other. */
    const invRef = String(patch.invRef ?? "").trim();
    if (invRef) {
      const inv = SALES_INVOICES.find((i) => i.code === invRef);
      if (inv) inv.shipmentRef = code;
    }

    decorateShipments();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบขนส่งแล้ว",
      message: `${code} — ${packages.length} กล่อง · ${fmt(items.reduce((t, i) => t + i.shipmentQty, 0))} หน่วย`,
      goto: `/m/shipment/${encodeURIComponent(code)}`,
    });
  },
};
