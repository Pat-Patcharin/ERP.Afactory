import {
  SHIPMENTS as RAW,
  SHP_OWN_FLEET,
  type Shipment,
  type ShpLine,
  type ShpPackage,
} from "@/data/shipments";
import { DELIVERY_ORDERS, SALES_ORDERS } from "./outbound";
import { SALES_INVOICES } from "./invoice";
import { pctOf } from "./lines";
import { DASH, daysUntil } from "@/lib/format";

/* ============================================================
   SHIPMENT — dispatch and delivery execution.

   Carries no pricing and never alters invoice amounts. Stock
   movement stays with the existing Delivery / Outbound rules;
   nothing here writes inventory.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Line quantities ---------- */

/** Remaining Shippable Qty = Delivery Order Qty − Previously Shipped Qty. */
export const remainingShippable = (it: Partial<ShpLine>) =>
  Math.max(0, num(it.orderedQty) - num(it.prevShippedQty));

export const isOverShipped = (it: Partial<ShpLine>) =>
  num(it.shipmentQty) > remainingShippable(it);

/** What a line still owes the customer after this shipment's delivery. */
export const lineOutstanding = (it: Partial<ShpLine>) =>
  Math.max(0, num(it.shipmentQty) - num(it.deliveredQty));

/**
 * How much of a delivery order has already gone out on other shipments.
 * Cancelled shipments release their claim; anything else holds it.
 */
export function shippedQtyForDO(doRef: string, productCode: string, exclude = ""): number {
  return SHIPMENTS.filter(
    (s) => s.doRef === doRef && s.code !== exclude && !["Cancelled"].includes(s.status),
  ).reduce(
    (t, s) =>
      t + (s.items ?? []).filter((l) => l.code === productCode).reduce((q, l) => q + num(l.shipmentQty), 0),
    0,
  );
}

/* ---------- Package helpers ---------- */

export const packageWeight = (s: { packages?: ShpPackage[] }) =>
  round2((s.packages ?? []).reduce((t, p) => t + num(p.weight), 0));

/** Volume in cubic metres — dimensions are captured in centimetres. */
export const packageVolume = (s: { packages?: ShpPackage[] }) =>
  round2(
    (s.packages ?? []).reduce(
      (t, p) => t + (num(p.length) * num(p.width) * num(p.height)) / 1_000_000,
      0,
    ),
  );

/** Courier volumetric weight, the usual /5000 divisor. */
export const volumetricWeight = (p: Partial<ShpPackage>) =>
  round2((num(p.length) * num(p.width) * num(p.height)) / 5000);

export const itemsInPackage = (s: { items?: ShpLine[] }, packageNo: string) =>
  (s.items ?? []).filter((it) => it.packageNo === packageNo);

/** Lines that have not been put in a box yet — these block dispatch. */
export const unpackagedLines = (s: { items?: ShpLine[] }) =>
  (s.items ?? []).filter((it) => !String(it.packageNo ?? "").trim());

/** Serial numbers entered twice across the whole shipment. */
export function duplicateSerials(s: { items?: ShpLine[] }): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const it of s.items ?? []) {
    for (const sn of String(it.serial ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (seen.has(sn)) dupes.add(sn);
      seen.add(sn);
    }
  }
  return [...dupes];
}

/* ---------- Carrier rules ---------- */

export const isOwnFleet = (carrier: string) =>
  (SHP_OWN_FLEET as readonly string[]).includes(carrier);

export const isCustomerPickup = (carrier: string) => carrier === "Customer Pickup";

/** Third-party carriers must carry a tracking number; our own fleet need not. */
export const needsTracking = (carrier: string) =>
  Boolean(carrier) && !isOwnFleet(carrier) && !isCustomerPickup(carrier);

/* ---------- Row decoration ---------- */

const OPEN_STATUSES = [
  "Draft",
  "Ready to Dispatch",
  "Dispatched",
  "In Transit",
  "Out for Delivery",
  "Rescheduled",
  "Exception",
];

const IN_FLIGHT = ["Dispatched", "In Transit", "Out for Delivery"];

export interface ShpRow extends Shipment {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  deliveredQty: number;
  remainingQty: number;
  packageCount: number;
  totalWeight: number;
  totalVolume: number;
  deliveryProgress: number;
  openExceptions: number;
  /** Past its expected delivery date and still not delivered. */
  isDelayed: boolean;
  daysLate: number | null;
  isEditable: boolean;
  /** Dispatched shipments allow tracking and delivery, never quantity edits. */
  isQtyLocked: boolean;
  canDispatch: boolean;
  canDeliver: boolean;
  canReschedule: boolean;
  hasPod: boolean;
}

export const SHIPMENTS = RAW as ShpRow[];

export function decorateShipments() {
  for (const s of SHIPMENTS) {
    s.name = s.code;
    s.icon = "🚚";
    s.itemCount = s.items?.length ?? 0;
    s.totalQty = (s.items ?? []).reduce((t, it) => t + num(it.shipmentQty), 0);
    s.deliveredQty = (s.items ?? []).reduce((t, it) => t + num(it.deliveredQty), 0);
    s.remainingQty = Math.max(0, s.totalQty - s.deliveredQty);
    s.packageCount = s.packages?.length ?? 0;
    s.totalWeight = packageWeight(s);
    s.totalVolume = packageVolume(s);
    s.deliveryProgress = pctOf(s.deliveredQty, s.totalQty);
    s.openExceptions = (s.exceptions ?? []).filter((e) => e.status !== "Resolved").length;

    const days = daysUntil(s.expectedDelivery);
    s.daysLate = days === null ? null : days < 0 ? Math.abs(days) : 0;
    s.isDelayed = days !== null && days < 0 && OPEN_STATUSES.includes(s.status);

    s.isEditable = ["Draft", "Ready to Dispatch"].includes(s.status);
    s.isQtyLocked = !s.isEditable;
    s.canDispatch = s.status === "Ready to Dispatch";
    s.canDeliver = IN_FLIGHT.includes(s.status);
    s.canReschedule = [...IN_FLIGHT, "Delivery Failed", "Ready to Dispatch", "Exception"].includes(
      s.status,
    );
    s.hasPod = Boolean(s.pod);
  }
}

decorateShipments();

export const getShipment = (code: string) => SHIPMENTS.find((s) => s.code === code) ?? null;

export function nextShipmentCode(): string {
  const n = SHIPMENTS.reduce((m, s) => {
    const tail = String(s.code).split("-").pop() ?? "0";
    return Math.max(m, parseInt(tail, 10) || 0);
  }, 0);
  return `SHP-2026-${String(n + 1).padStart(6, "0")}`;
}

/** Next free package number inside one shipment. */
export function nextPackageNo(s: { packages?: ShpPackage[] }): string {
  const n = (s.packages ?? []).reduce((m, p) => {
    const tail = String(p.no).replace(/\D/g, "");
    return Math.max(m, parseInt(tail, 10) || 0);
  }, 0);
  return `PKG-${String(n + 1).padStart(2, "0")}`;
}

/* ---------- Source document adapters ---------- */

export interface DoOption {
  code: string;
  customer: string;
  customerCode: string;
  date: string;
  warehouse: string;
  soRef: string;
}

/**
 * Delivery Orders worth shipping against. Cancelled ones are excluded outright —
 * rule 17 forbids dispatching a cancelled delivery order.
 */
export function shippableDeliveryOrders(): DoOption[] {
  return DELIVERY_ORDERS.filter((d) => !["Cancelled"].includes(d.status)).map((d) => ({
    code: d.code,
    customer: d.customer,
    customerCode: d.customerCode,
    date: d.deliveryDate,
    warehouse: d.warehouse,
    soRef: d.soRef,
  }));
}

/** Header defaults a Delivery Order hands to a new shipment. */
export function headerFromDO(doCode: string) {
  const d = DELIVERY_ORDERS.find((x) => x.code === doCode);
  if (!d) return null;
  const so = SALES_ORDERS.find((s) => s.code === d.soRef);
  const inv = SALES_INVOICES.find((i) => i.sourceDoc === doCode);

  return {
    customer: d.customer,
    customerCode: d.customerCode,
    deliveryAddress: d.shipTo,
    contactPerson: d.contact,
    contactPhone: d.phone,
    warehouse: d.warehouse,
    soRef: d.soRef,
    invRef: inv?.code ?? "",
    salesRep: (so?.salesRep ?? "").split(" - ")[1] ?? "",
    customerRef: so?.customerPo ?? "",
    priority: d.priority,
    expectedDelivery: d.deliveryDate,
    carrier: d.carrier,
    trackingNo: d.trackingNo,
  };
}

/**
 * Shippable lines off a Delivery Order, already netted against what earlier
 * shipments took. This is what stops the same goods going out twice.
 */
export function shippableLinesFrom(doCode: string, exclude = ""): ShpLine[] {
  const d = DELIVERY_ORDERS.find((x) => x.code === doCode);
  if (!d) return [];

  return (d.items ?? [])
    .map((it, i) => {
      const ordered = num(it.qty);
      const prev = shippedQtyForDO(doCode, it.code, exclude);
      return {
        line: i + 1,
        code: it.code,
        name: it.name,
        doLine: num(it.line) || i + 1,
        orderedQty: ordered,
        prevShippedQty: prev,
        shipmentQty: Math.max(0, ordered - prev),
        deliveredQty: 0,
        unit: it.unit,
        warehouse: d.warehouse,
        bin: "",
        lot: "",
        serial: "",
        packageNo: "",
        deliveryStatus: "Pending",
        note: "",
      } satisfies ShpLine;
    })
    .filter((l) => l.orderedQty > 0);
}

/** Every shipment raised against one delivery order. */
export const shipmentsForDO = (doCode: string) => SHIPMENTS.filter((s) => s.doRef === doCode);

/* ---------- Readiness ---------- */

export interface ReadinessIssue {
  label: string;
  blocking: boolean;
}

/**
 * Everything that would stop this shipment being dispatched, in one list the
 * form rail, the detail alert and the dispatch modal all read.
 */
export function dispatchReadiness(s: {
  items?: ShpLine[];
  packages?: ShpPackage[];
  carrier?: string;
  driver?: string;
  vehicleNo?: string;
  trackingNo?: string;
  shippingMethod?: string;
  deliveryAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
}): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  const items = s.items ?? [];

  if (!items.length) out.push({ label: "ยังไม่มีรายการสินค้า", blocking: true });
  if (!(s.packages ?? []).length) out.push({ label: "ยังไม่ได้จัดกล่อง", blocking: true });

  const unpacked = unpackagedLines(s);
  if (unpacked.length)
    out.push({ label: `${unpacked.length} บรรทัดยังไม่ได้ใส่กล่อง`, blocking: true });

  const over = items.filter(isOverShipped);
  if (over.length)
    out.push({ label: `${over.length} บรรทัดส่งเกินจำนวนคงเหลือ`, blocking: true });

  const dupes = duplicateSerials(s);
  if (dupes.length)
    out.push({ label: `Serial ซ้ำ: ${dupes.slice(0, 3).join(", ")}`, blocking: true });

  if (isOwnFleet(String(s.carrier ?? ""))) {
    if (!String(s.driver ?? "").trim()) out.push({ label: "รถบริษัทต้องระบุคนขับ", blocking: true });
    if (!String(s.vehicleNo ?? "").trim())
      out.push({ label: "รถบริษัทต้องระบุทะเบียนรถ", blocking: true });
  }
  if (needsTracking(String(s.carrier ?? "")) && !String(s.trackingNo ?? "").trim())
    out.push({ label: "ขนส่งภายนอกต้องมีเลขติดตาม", blocking: true });

  if (!String(s.deliveryAddress ?? "").trim())
    out.push({ label: "ยังไม่ระบุที่อยู่จัดส่ง", blocking: true });
  if (!String(s.contactPerson ?? "").trim())
    out.push({ label: "ยังไม่ระบุผู้ติดต่อปลายทาง", blocking: true });
  if (!String(s.contactPhone ?? "").trim())
    out.push({ label: "ยังไม่ระบุเบอร์ติดต่อปลายทาง", blocking: true });

  const noLot = items.filter((it) => !String(it.lot ?? "").trim() && !String(it.serial ?? "").trim());
  if (noLot.length)
    out.push({ label: `${noLot.length} บรรทัดไม่มี Lot / Serial`, blocking: false });

  return out;
}

export const blockingIssues = (issues: ReadinessIssue[]) => issues.filter((i) => i.blocking);

export { DASH };
