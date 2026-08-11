import {
  DO_CARRIERS,
  DO_DRIVERS,
  DO_FAIL_REASONS,
  DO_PRIORITY,
  DO_SERVICES,
  DO_TIME_SLOTS,
} from "@/data/delivery-orders";
import type { DeliveryOrder } from "@/data/delivery-orders";
import {
  DELIVERY_ORDERS,
  decorateDOs,
  getPack,
  getSO,
  nextDOCode,
  shipToOptions,
  shippablePacks,
  warehouseOptions,
  type DoRow,
} from "@/lib/domain/outbound";
import { fmt, money0, stamp, isoToDmy, dmyToIso } from "@/lib/format";
import type { FormSchema, GridRow } from "@/lib/types";
import { FORM_USER, opts, saved } from "./common";

/* ============================================================
   DELIVERY ORDER FORM

   The last outbound document. Confirming receipt is handled by the
   workflow, not here — this form only decides what leaves, on whose
   truck, and to which address.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isSelfPickup = (s: { carrier?: string }) => s.carrier === "ลูกค้ามารับเอง";
const isFailed = (s: { status?: string }) => s.status === "Failed";

export const DO_FORM: FormSchema<DoRow> = {
  key: "delivery-order",
  entityLabel: "Delivery Order",
  saveButton: "Save Delivery Order",
  statusBadge: {
    Draft: "neutral",
    Ready: "info",
    Shipped: "warning",
    Delivered: "success",
    Failed: "danger",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextDOCode(),
    packRef: "",
    soRef: "",
    customer: "",
    customerCode: "",
    shipTo: "",
    contact: "",
    phone: "",
    warehouse: "",
    carrier: "A-Factory Fleet",
    service: "Standard",
    driver: "",
    vehicle: "",
    trackingNo: "",
    deliveryDate: "",
    deliveryTime: "09:00 - 11:00",
    status: "Draft",
    priority: "Normal",
    packages: 0,
    weight: 0,
    codAmount: 0,
    failReason: "",
    remark: "",
    items: [],
  }),

  toState: (d) => ({
    _mode: "edit",
    code: d.code,
    packRef: d.packRef,
    soRef: d.soRef,
    customer: d.customer,
    customerCode: d.customerCode,
    shipTo: d.shipTo,
    contact: d.contact,
    phone: d.phone,
    warehouse: d.warehouse,
    carrier: d.carrier,
    service: d.service,
    driver: d.driver,
    vehicle: d.vehicle,
    trackingNo: d.trackingNo,
    deliveryDate: dmyToIso(d.deliveryDate),
    deliveryTime: d.deliveryTime,
    status: d.status,
    priority: d.priority,
    packages: d.packages,
    weight: d.weight,
    codAmount: d.codAmount,
    failReason: d.failReason,
    remark: d.remark,
    items: (d.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. SHIPMENT ---------- */
    {
      key: "shipment",
      label: "Shipment",
      railLabel: "ข้อมูลการส่ง",
      labelTh: "งานแพ็คและปลายทาง",
      blocks: (s) => [
        {
          type: "card",
          title: "Shipment Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "DO Number" },
            {
              type: "select",
              path: "packRef",
              label: "Packing Task",
              options: shippablePacks().map((p) => p.code),
              hint: "เลือกงานแพ็คที่ปิดแล้ว ระบบจะดึงกล่อง น้ำหนัก และรายการมาให้",
              when: (st) => st._mode === "create",
            },
            {
              type: "static",
              path: "packRef",
              label: "Packing Task",
              when: (st) => st._mode !== "create",
            },
            { type: "static", path: "soRef", label: "Sales Order" },
            { type: "static", path: "customer", label: "Customer" },
            {
              type: "select",
              path: "warehouse",
              label: "Ship From Warehouse",
              required: true,
              options: warehouseOptions(),
            },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(DO_PRIORITY),
            },
            { type: "date", path: "deliveryDate", label: "Delivery Date", required: true },
            {
              type: "select",
              path: "deliveryTime",
              label: "Time Slot",
              required: true,
              options: opts(DO_TIME_SLOTS),
            },
          ],
        },
        {
          type: "card",
          title: "Deliver To",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "shipTo",
              label: "Ship To Address",
              required: true,
              options: shipToOptions(`${s.customerCode ?? ""} - ${s.customer ?? ""}`),
              hint: "ที่อยู่จากสมุดที่อยู่ของลูกค้า",
            },
            { type: "text", path: "contact", label: "Contact Person", required: true },
            { type: "text", path: "phone", label: "Contact Phone", placeholder: "081-234-5678" },
            {
              type: "number",
              path: "codAmount",
              label: "COD Amount",
              min: 0,
              hint: "ใส่ 0 หากไม่เก็บเงินปลายทาง",
            },
          ],
        },
      ],
    },

    /* ---------- 2. CARRIER ---------- */
    {
      key: "carrier",
      label: "Carrier",
      railLabel: "ผู้ขนส่ง",
      labelTh: "รถ คนขับ และเลขติดตาม",
      blocks: (s) => [
        {
          type: "card",
          title: "Carrier & Route",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "carrier",
              label: "Carrier",
              required: true,
              options: opts(DO_CARRIERS),
            },
            {
              type: "select",
              path: "service",
              label: "Service Level",
              required: true,
              options: opts(DO_SERVICES),
            },
            {
              type: "text",
              path: "trackingNo",
              label: "Tracking No.",
              placeholder: "AFT-2507-000112",
              when: (st) => !isSelfPickup(st),
            },
            {
              type: "select",
              path: "driver",
              label: "Driver",
              options: opts(DO_DRIVERS),
              when: (st) => !isSelfPickup(st),
            },
            {
              type: "text",
              path: "vehicle",
              label: "Vehicle Plate",
              placeholder: "1กก-1234",
              when: (st) => !isSelfPickup(st),
            },
            {
              type: "note",
              label: "ลูกค้ามารับเองที่คลัง",
              text: "ไม่ต้องระบุคนขับ ทะเบียนรถ หรือเลขติดตาม — เตรียมของไว้ที่จุดรับและแจ้งลูกค้า",
              when: isSelfPickup,
            },
          ],
        },
        {
          type: "card",
          title: "Load",
          cols: "3",
          fields: [
            { type: "number", path: "packages", label: "Packages", required: true, min: 0 },
            { type: "number", path: "weight", label: "Total Weight (กก.)", min: 0, step: "0.01" },
            {
              type: "select",
              path: "failReason",
              label: "Fail Reason",
              options: opts(DO_FAIL_REASONS),
              when: isFailed,
              hint: "บันทึกไว้เพื่อนัดส่งใหม่",
            },
            { type: "textarea", path: "remark", label: "Remark", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 3. LINES ---------- */
    {
      key: "lines",
      label: "Items",
      railLabel: "รายการที่ส่ง",
      labelTh: "สินค้าที่อยู่บนรถ",
      blocks: () => [
        {
          type: "note",
          label: "จำนวนที่ลูกค้ารับจริงบันทึกตอนยืนยันการส่งมอบ",
          text: "ฟอร์มนี้กำหนดว่าอะไรออกจากคลัง — ช่อง Received จะถูกเติมเมื่อกด Confirm Delivery ในหน้ารายละเอียด",
        },
        {
          type: "grid",
          path: "items",
          label: "Delivery Lines",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกงานแพ็คในขั้นตอนแรกเพื่อดึงรายการที่ต้องส่ง",
          cols: [
            { key: "line", label: "#", type: "static", align: "right", muted: true, width: "44px" },
            { key: "code", label: "Product", type: "static", width: "150px" },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "210px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "60px" },
            { key: "qty", label: "Shipped Qty", type: "number", align: "right", required: true, width: "110px" },
            { key: "box", label: "Box", type: "text", width: "100px" },
            { key: "note", label: "Note", type: "text" },
          ],
        },
      ],
    },

    {
      key: "review",
      label: "Review",
      railLabel: "ตรวจทาน",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "warehouse", label: "Ship From Warehouse", step: "shipment" },
    { path: "priority", label: "Priority", step: "shipment" },
    { path: "deliveryDate", label: "Delivery Date", step: "shipment" },
    { path: "deliveryTime", label: "Time Slot", step: "shipment" },
    { path: "shipTo", label: "Ship To Address", step: "shipment" },
    { path: "contact", label: "Contact Person", step: "shipment" },
    { path: "carrier", label: "Carrier", step: "carrier" },
    { path: "service", label: "Service Level", step: "carrier" },
    { path: "packages", label: "Packages", step: "carrier" },
    {
      path: "failReason",
      label: "Fail Reason",
      step: "carrier",
      test: (s) => !isFailed(s) || Boolean(s.failReason),
    },
    {
      path: "items",
      label: "รายการที่ส่งอย่างน้อย 1 บรรทัด",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.qty) > 0),
    },
  ],

  rules: [
    {
      label: "ต้องเลือกใบสั่งขายหรืองานแพ็คต้นทาง",
      step: "shipment",
      test: (s) => Boolean(String(s.soRef ?? "").trim() || String(s.packRef ?? "").trim()),
    },
    {
      label: "จำนวนกล่องต้องมากกว่า 0 เมื่อมีรายการที่ต้องส่ง",
      step: "carrier",
      test: (s) => {
        const hasLines = ((s.items ?? []) as GridRow[]).some((r) => num(r.qty) > 0);
        return !hasLines || num(s.packages) > 0;
      },
    },
    {
      label: "การส่งโดยผู้ขนส่งภายนอกต้องระบุเลขติดตาม",
      step: "carrier",
      test: (s) =>
        isSelfPickup(s) ||
        s.carrier === "A-Factory Fleet" ||
        Boolean(String(s.trackingNo ?? "").trim()),
    },
    {
      label: "การส่งด้วยรถบริษัทต้องระบุคนขับและทะเบียนรถ",
      step: "carrier",
      test: (s) =>
        s.carrier !== "A-Factory Fleet" ||
        (Boolean(String(s.driver ?? "").trim()) && Boolean(String(s.vehicle ?? "").trim())),
    },
    {
      label: "จำนวนที่ส่งต้องมากกว่า 0 ทุกบรรทัด",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.qty) > 0),
    },
  ],

  onChange: (path, s) => {
    if (path !== "packRef") return;
    const pack = getPack(String(s.packRef ?? ""));
    if (!pack) return;

    const so = getSO(pack.soRef);
    s.soRef = pack.soRef;
    s.customer = pack.customer;
    s.customerCode = pack.customerCode;
    s.warehouse = pack.warehouse;
    s.priority = pack.priority;
    s.packages = pack.boxCount;
    s.weight = pack.totalWeight;

    if (so) {
      s.deliveryDate = dmyToIso(so.deliveryDate);
      s.shipTo = so.shipTo || shipToOptions(`${so.customerCode} - ${so.customer}`)[0] || "";
      /* Cash customers pay on delivery — surface it rather than hide it. */
      s.codAmount = so.payTerm === "เงินสด" ? Math.round(so.total) : 0;
    }

    s.items = (pack.items ?? [])
      .filter((it) => num(it.packedQty) > 0)
      .map((it, i) => ({
        line: i + 1,
        code: it.code,
        name: it.name,
        unit: it.unit,
        qty: num(it.packedQty),
        delivered: 0,
        box: it.box,
        note: "",
      }));
  },

  newRow: () => ({ line: 0, code: "", name: "", unit: "", qty: "", delivered: 0, box: "", note: "" }),

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = DELIVERY_ORDERS.find((d) => d.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        qty: num(r.qty),
        delivered: num(r.delivered),
        box: String(r.box ?? ""),
        note: String(r.note ?? ""),
      }));

    const patch = {
      packRef: String(s.packRef ?? ""),
      soRef: String(s.soRef ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      shipTo: String(s.shipTo ?? ""),
      contact: String(s.contact ?? ""),
      phone: String(s.phone ?? ""),
      warehouse: String(s.warehouse ?? ""),
      carrier: String(s.carrier ?? ""),
      service: String(s.service ?? ""),
      driver: String(s.driver ?? ""),
      vehicle: String(s.vehicle ?? ""),
      trackingNo: String(s.trackingNo ?? ""),
      deliveryDate: isoToDmy(s.deliveryDate),
      deliveryTime: String(s.deliveryTime ?? ""),
      priority: String(s.priority ?? "Normal"),
      packages: num(s.packages),
      weight: num(s.weight),
      codAmount: num(s.codAmount),
      failReason: String(s.failReason ?? ""),
      remark: String(s.remark ?? ""),
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Delivery order updated",
        d: "แก้ไขใบส่งของจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      const fresh: DeliveryOrder = {
        code,
        ...patch,
        /* Shipping is a deliberate workflow step, never a side effect of saving. */
        status: "Draft",
        receivedBy: "",
        receivedDate: "",
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.packRef ? `Created from ${patch.packRef}` : "Created",
            d: "สร้างใบส่งของจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      };
      DELIVERY_ORDERS.unshift(fresh as DoRow);

      const pack = getPack(patch.packRef);
      if (pack && !pack.doRef) pack.doRef = code;
    }

    decorateDOs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบส่งของแล้ว",
      message: `${code} — ${patch.carrier} · ${fmt(patch.packages)} กล่อง`,
      goto: `/m/delivery-order/${encodeURIComponent(code)}`,
    });
  },
};
