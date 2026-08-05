import { QUOTATIONS as RAW_QT, type Quotation } from "@/data/quotations";
import { SALES_REQUESTS as RAW_SR, type SalesRequest } from "@/data/sales-requests";
import { SALES_ORDERS as RAW_SO, type SalesOrder } from "@/data/sales-orders";
import { PICKING_TASKS as RAW_PK, type PickingTask } from "@/data/picking";
import { PACKING_TASKS as RAW_PACK, type PackingTask } from "@/data/packing";
import { DELIVERY_ORDERS as RAW_DO, type DeliveryOrder } from "@/data/delivery-orders";
import { BUSINESS_PARTNERS } from "./partner";
import { SALES_REPRESENTATIVES } from "./sales";
import { PRODUCTS, productStock } from "./product";
import { WAREHOUSES } from "./warehouse";
import { docGrandTotal, pctOf } from "./lines";
import { DASH, daysUntil } from "@/lib/format";

/* ============================================================
   OUTBOUND — the sell side, mirroring the purchase chain:

     Sales Request → Sales Order → Picking → Packing → Delivery

   Every document resolves its customer, sales rep, warehouse and
   products against the same masters the buy side uses, so a rename
   in Business Partner shows up everywhere at once.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/* ---------- Shared master-data lookups ---------- */

/** Partners we may sell to — customers and dealers, never suppliers-only. */
export const outboundCustomers = () =>
  BUSINESS_PARTNERS.filter((b) => b.roles?.customer || b.roles?.dealer);

export const customerOptions = () =>
  outboundCustomers().map((b) => `${b.code} - ${b.nameTh}`);

/** "BP000123 - บริษัท ..." → the partner record. Accepts a bare code too. */
export const getCustomer = (label: string) => {
  const code = String(label ?? "").split(" - ")[0].trim();
  return BUSINESS_PARTNERS.find((b) => b.code === code) ?? null;
};

export const salesRepOptions = () =>
  SALES_REPRESENTATIVES.filter((r) => r.status === "Active").map(
    (r) => `${r.code} - ${r.first} ${r.last}`,
  );

export const getSalesRep = (label: string) => {
  const code = String(label ?? "").split(" - ")[0].trim();
  return SALES_REPRESENTATIVES.find((r) => r.code === code) ?? null;
};

export const warehouseOptions = () => WAREHOUSES.map((w) => `${w.code} ${w.name}`);

/** Ship-to choices come from the customer's own address book. */
export function shipToOptions(customerLabel: string): string[] {
  const bp = getCustomer(customerLabel);
  if (!bp) return [];
  return (bp.addresses ?? [])
    .filter((a) => a.active)
    .map((a) => [a.l1, a.sub, a.dist, a.prov, a.zip].filter(Boolean).join(" "));
}

/**
 * Credit position for a customer, with this order's value applied on top.
 * `limit === 0` means the customer trades on cash terms only.
 */
export function creditCheck(customerLabel: string, orderValue: number) {
  const bp = getCustomer(customerLabel);
  const limit = num(bp?.credit?.limit);
  const outstanding = num(bp?.credit?.outstanding);
  const projected = outstanding + orderValue;
  const available = Math.max(0, limit - outstanding);

  return {
    found: Boolean(bp),
    limit,
    outstanding,
    available,
    projected,
    /** Cash-only customers never block; everyone else must stay inside the limit. */
    withinLimit: limit === 0 || projected <= limit,
    cashOnly: limit === 0,
    status: bp?.credit?.status ?? "Not Applicable",
    overBy: Math.max(0, projected - limit),
  };
}

/** Can the warehouse actually serve this line today? */
export function availabilityFor(code: string, qty: number) {
  const st = productStock(code);
  if (!st) return null;
  return { ...st, shortBy: Math.max(0, qty - st.available), enough: st.available >= qty };
}

export const productOptions = () => PRODUCTS.map((p) => p.code);

const nextSeq = (codes: string[], prefix: string, pad: number) => {
  const n = codes.reduce((m, c) => {
    const digits = String(c).replace(/\D/g, "").slice(-4);
    return Math.max(m, parseInt(digits, 10) || 0);
  }, 0);
  return `${prefix}${String(n + 1).padStart(pad, "0")}`;
};

/* ============================================================
   QUOTATION — optional, and the only outbound document that
   carries a price validity window.
   ============================================================ */

export interface QtRow extends Quotation {
  amount: number;
  itemCount: number;
  name: string;
  icon: string;
  daysLeft: number | null;
  isExpiring: boolean;
  isExpired: boolean;
}

export const QUOTATIONS = RAW_QT as QtRow[];

export const qtTotal = (qt: { items?: Quotation["items"] }) => docGrandTotal(qt);

export function decorateQuotations() {
  for (const qt of QUOTATIONS) {
    qt.amount = qtTotal(qt);
    qt.itemCount = qt.items?.length ?? 0;
    qt.name = qt.code;
    qt.icon = "📝";
    qt.daysLeft = daysUntil(qt.validUntil);
    /* Only a quote still awaiting an answer can expire. */
    const open = ["Draft", "Sent", "Accepted"].includes(qt.status);
    qt.isExpired = open && qt.daysLeft !== null && qt.daysLeft < 0;
    qt.isExpiring = open && qt.daysLeft !== null && qt.daysLeft >= 0 && qt.daysLeft <= 7;
  }
}

decorateQuotations();

export const getQT = (code: string) => QUOTATIONS.find((q) => q.code === code) ?? null;

export const nextQuotationCode = () =>
  nextSeq(QUOTATIONS.map((q) => q.code), "QT2507-", 4);

/**
 * Quotes the customer accepted that have not been converted yet — by either
 * route. Checking only `srRef` would offer a quote that already became an
 * order straight from here.
 */
export const convertibleQuotations = () =>
  QUOTATIONS.filter((q) => q.status === "Accepted" && !q.srRef && !q.soRef);

/* ============================================================
   SALES REQUEST — required, internal, and deliberately free of
   any stock reservation. Availability shown against a request is
   indicative; the Sales Order is what commits inventory.
   ============================================================ */

export interface SrRow extends SalesRequest {
  amount: number;
  itemCount: number;
  name: string;
  icon: string;
  /** Days until the customer needs the goods; negative once overdue. */
  daysToRequired: number | null;
  isUrgent: boolean;
  awaitingApproval: boolean;
  isConvertible: boolean;
}

export const SALES_REQUESTS = RAW_SR as SrRow[];

export const srTotal = (sr: { items?: SalesRequest["items"] }) => docGrandTotal(sr);

export function decorateSalesRequests() {
  for (const sr of SALES_REQUESTS) {
    sr.amount = srTotal(sr);
    sr.itemCount = sr.items?.length ?? 0;
    sr.name = sr.code;
    sr.icon = "📄";
    sr.daysToRequired = daysUntil(sr.requiredDate);
    const open = ["Draft", "Submitted", "Approved"].includes(sr.status);
    sr.isUrgent = open && sr.daysToRequired !== null && sr.daysToRequired <= 3;
    sr.awaitingApproval = sr.status === "Submitted";
    sr.isConvertible = sr.status === "Approved" && !sr.soRef;
  }
}

decorateSalesRequests();

export const getSR = (code: string) => SALES_REQUESTS.find((s) => s.code === code) ?? null;

/** Named in full — `nextSRCode` already belongs to the Sales Rep master. */
export const nextSalesRequestCode = () =>
  nextSeq(SALES_REQUESTS.map((s) => s.code), "SR2507-", 4);

/** Approved requests waiting to become an order. */
export const convertibleRequests = () => SALES_REQUESTS.filter((s) => s.isConvertible);

/* ============================================================
   SALES ORDER
   ============================================================ */

export interface SoRow extends SalesOrder {
  total: number;
  itemCount: number;
  name: string;
  icon: string;
  orderedQty: number;
  pickedQty: number;
  deliveredQty: number;
  pickPct: number;
  deliverPct: number;
  outstandingQty: number;
  isOverdue: boolean;
}

export const SALES_ORDERS = RAW_SO as SoRow[];

export const soTotal = (so: { items?: SalesOrder["items"] }) => docGrandTotal(so);

const sumBy = (items: SalesOrder["items"] | undefined, pick: (it: SalesOrder["items"][number]) => number) =>
  (items ?? []).reduce((t, it) => t + pick(it), 0);

export const soOrderedQty = (so: { items?: SalesOrder["items"] }) =>
  sumBy(so.items, (it) => num(it.qty));
export const soPickedQty = (so: { items?: SalesOrder["items"] }) =>
  sumBy(so.items, (it) => num(it.picked));
export const soDeliveredQty = (so: { items?: SalesOrder["items"] }) =>
  sumBy(so.items, (it) => num(it.delivered));

/** What still has to leave the building. */
export const soOutstandingQty = (so: { items?: SalesOrder["items"] }) =>
  (so.items ?? []).reduce((t, it) => t + Math.max(0, num(it.qty) - num(it.delivered)), 0);

export function decorateSOs() {
  for (const so of SALES_ORDERS) {
    so.total = soTotal(so);
    so.itemCount = so.items?.length ?? 0;
    so.name = so.code;
    so.icon = "🧾";
    so.orderedQty = soOrderedQty(so);
    so.pickedQty = soPickedQty(so);
    so.deliveredQty = soDeliveredQty(so);
    so.pickPct = pctOf(so.pickedQty, so.orderedQty);
    so.deliverPct = pctOf(so.deliveredQty, so.orderedQty);
    so.outstandingQty = soOutstandingQty(so);

    const d = daysUntil(so.deliveryDate);
    so.isOverdue =
      d !== null &&
      d < 0 &&
      so.deliverPct < 100 &&
      ["Confirmed", "Picking", "Partially Delivered", "On Hold"].includes(so.status);
  }
}

decorateSOs();

export const getSO = (code: string) => SALES_ORDERS.find((s) => s.code === code) ?? null;

export const nextSOCode = () => nextSeq(SALES_ORDERS.map((s) => s.code), "SO2507-", 4);

/** Open orders are the only ones worth generating warehouse work from. */
export const openSalesOrders = () =>
  SALES_ORDERS.filter((s) => ["Confirmed", "Picking", "Partially Delivered"].includes(s.status));

/* ============================================================
   PICKING
   ============================================================ */

export interface PickRow extends PickingTask {
  name: string;
  icon: string;
  itemCount: number;
  orderedQty: number;
  pickedQty: number;
  pct: number;
  shortCount: number;
  headProduct: string;
}

export const PICKING_TASKS = RAW_PK as PickRow[];

export const pickOrderedQty = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.ordered), 0);
export const pickPickedQty = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.picked), 0);
/** Lines where the picker could not find everything the order asked for. */
export const pickShortLines = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).filter((it) => num(it.picked) < num(it.ordered));

export function decoratePicks() {
  for (const t of PICKING_TASKS) {
    t.name = t.code;
    t.icon = "📤";
    t.itemCount = t.items?.length ?? 0;
    t.orderedQty = pickOrderedQty(t);
    t.pickedQty = pickPickedQty(t);
    t.pct = pctOf(t.pickedQty, t.orderedQty);
    t.shortCount = pickShortLines(t).length;
    t.headProduct = t.items?.[0]?.name ?? DASH;
  }
}

decoratePicks();

export const getPick = (code: string) => PICKING_TASKS.find((t) => t.code === code) ?? null;

export const nextPickCode = () =>
  nextSeq(PICKING_TASKS.map((t) => t.code), "PK2507-", 4);

/* ============================================================
   PACKING
   ============================================================ */

export interface PackRow extends PackingTask {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  packedQty: number;
  pct: number;
  boxCount: number;
  totalWeight: number;
}

export const PACKING_TASKS = RAW_PACK as PackRow[];

export const packTotalQty = (t: { items?: PackingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.qty), 0);
export const packPackedQty = (t: { items?: PackingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.packedQty), 0);
export const packWeight = (t: { packages?: PackingTask["packages"] }) =>
  Math.round((t.packages ?? []).reduce((s, b) => s + num(b.weight), 0) * 100) / 100;

export function decoratePacks() {
  for (const t of PACKING_TASKS) {
    t.name = t.code;
    t.icon = "📦";
    t.itemCount = t.items?.length ?? 0;
    t.totalQty = packTotalQty(t);
    t.packedQty = packPackedQty(t);
    t.pct = pctOf(t.packedQty, t.totalQty);
    t.boxCount = t.packages?.length ?? 0;
    t.totalWeight = packWeight(t);
  }
}

decoratePacks();

export const getPack = (code: string) => PACKING_TASKS.find((t) => t.code === code) ?? null;

export const nextPackCode = () =>
  nextSeq(PACKING_TASKS.map((t) => t.code), "PACK2507-", 4);

/** Picking tasks that finished and have not been packed yet. */
export const packablePicks = () =>
  PICKING_TASKS.filter((t) => t.status === "Completed" && !t.packRef);

/* ============================================================
   DELIVERY ORDER
   ============================================================ */

export interface DoRow extends DeliveryOrder {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  deliveredTotal: number;
  pct: number;
  isLate: boolean;
  shortDelivery: boolean;
}

export const DELIVERY_ORDERS = RAW_DO as DoRow[];

export const doTotalQty = (d: { items?: DeliveryOrder["items"] }) =>
  (d.items ?? []).reduce((s, it) => s + num(it.qty), 0);
export const doDeliveredQty = (d: { items?: DeliveryOrder["items"] }) =>
  (d.items ?? []).reduce((s, it) => s + num(it.delivered), 0);

export function decorateDOs() {
  for (const d of DELIVERY_ORDERS) {
    d.name = d.code;
    d.icon = "🚚";
    d.itemCount = d.items?.length ?? 0;
    d.totalQty = doTotalQty(d);
    d.deliveredTotal = doDeliveredQty(d);
    d.pct = pctOf(d.deliveredTotal, d.totalQty);
    d.shortDelivery = d.status === "Delivered" && d.deliveredTotal < d.totalQty;

    const days = daysUntil(d.deliveryDate);
    d.isLate =
      days !== null && days < 0 && ["Draft", "Ready", "Shipped", "Failed"].includes(d.status);
  }
}

decorateDOs();

export const getDO = (code: string) => DELIVERY_ORDERS.find((d) => d.code === code) ?? null;

export const nextDOCode = () =>
  nextSeq(DELIVERY_ORDERS.map((d) => d.code), "DO2507-", 4);

/** Packing tasks that finished and have not been shipped yet. */
export const shippablePacks = () =>
  PACKING_TASKS.filter((t) => t.status === "Completed" && !t.doRef);

/* ---------- Cross-document rollups ---------- */

/** Every warehouse and shipping document raised against one sales order. */
export function soLinkedDocs(code: string) {
  return {
    picks: PICKING_TASKS.filter((t) => t.soRef === code),
    packs: PACKING_TASKS.filter((t) => t.soRef === code),
    deliveries: DELIVERY_ORDERS.filter((d) => d.soRef === code),
  };
}

/** Re-run every decorator — used after a workflow touches several documents. */
export function decorateOutbound() {
  decorateQuotations();
  decorateSalesRequests();
  decorateSOs();
  decoratePicks();
  decoratePacks();
  decorateDOs();
}
