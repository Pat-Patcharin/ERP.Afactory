import {
  DECLARED_LOTS,
  LOT_CORRECTIONS,
  LOT_DELIVERIES,
  LOT_GENEALOGY,
  LOT_LINKS,
  LOT_PROFILES,
  MIN_SHELF_LIFE_PCT,
  PRODUCT_LINKS,
  RECALL_REVIEWS,
  lotSource,
  type LotProfile,
} from "@/data/lots";
import type { BadgeTone, RecordBase } from "@/lib/types";
import { PRODUCTS, getProduct } from "./product";
import { WAREHOUSES } from "./warehouse";
import { parseStamp } from "./inventory";
import { STOCK_LOTS, STOCK_POSITIONS } from "./stock";
import { movementRows } from "./movement";
import { GOODS_RECEIPTS, PUTAWAY_TASKS, QC_INSPECTIONS } from "./inbound";
import { PICKING_TASKS, SALES_ORDERS } from "./outbound";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";
import { PURCHASE_ORDERS } from "./purchase";

/* ============================================================
   LOT TRACKING — one batch, followed end to end.

   Read-only by construction. Nothing here mutates a document or a
   balance; the only thing that leaves the module is a Recall Hold
   handed to Stock Adjustment, the same way Cycle Count hands over a
   variance.

   The lot master is the UNION of every lot number the ERP has
   written — inventory positions, put away, picking, shipment, QC,
   returns — plus the depleted lots declared in data/lots.ts. Modules
   numbered their lots independently, so LOT_LINKS declares which of
   those numbers are the same physical batch. Traceability follows a
   lot and all of its aliases.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

/* ---------- Aliases ---------- */

/** Alias → canonical lot, so a document number resolves to its batch. */
const ALIAS_TO_CANON = new Map<string, string>();
for (const [canon, aliases] of Object.entries(LOT_LINKS)) {
  for (const a of aliases) ALIAS_TO_CANON.set(a, canon);
}

export const canonicalLot = (lot: string) => ALIAS_TO_CANON.get(lot) ?? lot;

export const lotAliases = (lot: string): string[] => [lot, ...(LOT_LINKS[lot] ?? [])];

/** Master product → every code older documents call it by. */
const PRODUCT_ALIASES = new Map<string, string[]>();
for (const [old, canon] of Object.entries(PRODUCT_LINKS)) {
  PRODUCT_ALIASES.set(canon, [...(PRODUCT_ALIASES.get(canon) ?? [canon]), old]);
}

export const canonicalProduct = (code: string) => PRODUCT_LINKS[code] ?? code;

/** Codes that all mean this product, for matching document lines. */
export const productAliases = (code: string): string[] =>
  PRODUCT_ALIASES.get(code) ?? [code];

/** True when a document line names this row's product under any of its codes. */
const isProduct = (r: { product: string }, code: string) =>
  productAliases(r.product).includes(code);

/** Quantity of this lot a shipment carried by declaration rather than by line. */
const declaredQty = (
  r: { product: string; aliases: string[] },
  shipment: string,
): number =>
  LOT_DELIVERIES.filter(
    (d) => d.product === r.product && d.shipment === shipment && r.aliases.includes(d.lot),
  ).reduce((t, d) => t + d.qty, 0);

/* ---------- Expiry ---------- */

export const daysToExpiry = (exp: string): number | null => {
  const t = parseStamp(exp);
  return t ? Math.ceil((t - Date.now()) / 86_400_000) : null;
};

export function expiryClass(exp: string): string {
  const d = daysToExpiry(exp);
  if (d === null) return "No Expiry Date";
  if (d < 0) return "Expired";
  if (d <= 30) return "Expires within 30 days";
  if (d <= 60) return "Expires within 60 days";
  if (d <= 90) return "Expires within 90 days";
  if (d <= 180) return "Expires within 180 days";
  return "More than 180 days";
}

/** How much of the original shelf life is left, 0–100. */
export function shelfLifePct(mfg: string, exp: string): number | null {
  const start = parseStamp(mfg);
  const end = parseStamp(exp);
  if (!start || !end || end <= start) return null;
  const left = end - Date.now();
  if (left <= 0) return 0;
  return Math.min(100, Math.round((left / (end - start)) * 1000) / 10);
}

export const EXPIRY_TONE: Record<string, BadgeTone> = {
  Expired: "danger",
  "Expires within 30 days": "danger",
  "Expires within 60 days": "warning",
  "Expires within 90 days": "warning",
  "Expires within 180 days": "info",
  "More than 180 days": "success",
  "No Expiry Date": "neutral",
};

/* ---------- Collecting every lot the ERP knows ---------- */

interface LotKey {
  lot: string;
  product: string;
}

/** Every (product, lot) pair any module has written. */
function collectKeys(): LotKey[] {
  const seen = new Map<string, LotKey>();
  const add = (rawProduct: string, lot: string) => {
    const product = canonicalProduct(rawProduct);
    if (!product || !lot || lot === "—") return;
    const canon = canonicalLot(lot);
    const key = `${product}|${canon}`;
    if (!seen.has(key)) seen.set(key, { lot: canon, product });
  };

  for (const p of STOCK_POSITIONS) add(p.product, p.lot);
  for (const l of STOCK_LOTS) add(l.product, l.lot);
  for (const t of PUTAWAY_TASKS) for (const i of t.items ?? []) add(i.code, i.lot);
  for (const t of PICKING_TASKS) for (const i of t.items ?? []) add(i.code, i.lot);
  for (const s of SHIPMENTS) for (const i of s.items ?? []) add(i.code, i.lot);
  for (const q of QC_INSPECTIONS) add(q.product, q.lot);
  for (const r of SALES_RETURNS) for (const i of r.items ?? []) add(i.code, (i as { lot?: string }).lot ?? "");
  for (const d of DECLARED_LOTS) add(d.product, d.lot);

  return [...seen.values()];
}

/* ---------- Row ---------- */

export interface LotRow extends RecordBase {
  /** Registry key: product and lot together, because a lot number alone
   *  is only unique within a product. */
  code: string;
  lot: string;
  aliases: string[];

  product: string;
  productName: string;
  barcode: string;
  icon: string;
  brand: string;
  cat: string;
  unit: string;

  supplier: string;
  supplierCode: string;
  supplierLot: string;
  manufacturer: string;
  country: string;
  supplierContact: string;

  mfg: string;
  exp: string;
  received: string;
  daysToExpiry: number | null;
  expiryClass: string;
  shelfLifePct: number | null;
  fefoRank: number;
  meetsMinShelfLife: boolean;

  originalQty: number;
  onHand: number;
  available: number;
  reserved: number;
  qcHold: number;
  returnHold: number;
  damaged: number;
  blocked: number;
  expiredQty: number;
  recallHold: number;
  inTransit: number;
  shippedQty: number;
  returnedQty: number;
  scrappedQty: number;

  warehouses: string[];
  locations: string[];
  warehouseCount: number;
  locationCount: number;

  lotStatus: string;
  /** True when the buckets add up to the on-hand figure. */
  reconciled: boolean;

  poRef: string;
  grRef: string;
  qcRef: string;
  note: string;

  customerCount: number;
  recallRef: string;
  correctionCount: number;
  lastMovement: string;
  unitCost: number;
  inventoryValue: number;
}

/**
 * Lot status is a property of the batch, not of the stock. It is kept
 * separate from the per-position stock status on purpose — a released lot can
 * still hold QC quantity, and an active lot can be partly damaged.
 */
function deriveStatus(
  profile: LotProfile,
  onHand: number,
  qcHold: number,
  recallHold: number,
  blocked: number,
  expiry: string,
): string {
  if (profile.status) return profile.status;
  if (recallHold > 0) return "Recall Hold";
  if (expiry === "Expired") return "Expired";
  if (onHand <= 0) return "Depleted";
  if (qcHold > 0 && qcHold === onHand) return "QC Hold";
  if (blocked > 0) return "Blocked";
  if (
    expiry === "Expires within 30 days" ||
    expiry === "Expires within 60 days" ||
    expiry === "Expires within 90 days"
  )
    return "Near Expiry";
  return "Active";
}

function build(key: LotKey): LotRow {
  const declared = DECLARED_LOTS.find((d) => d.lot === key.lot && d.product === key.product);
  const profile: LotProfile = { ...(LOT_PROFILES[key.lot] ?? {}), ...(declared?.profile ?? {}) };
  const src = lotSource(profile.supplierIndex ?? 0);
  const p = getProduct(key.product);
  const aliases = lotAliases(key.lot);

  /* Live stock comes from Stock Inquiry so the two screens agree. */
  const positions = STOCK_POSITIONS.filter(
    (r) => r.product === key.product && aliases.includes(r.lot),
  );
  const meta = STOCK_LOTS.find((l) => aliases.includes(l.lot));

  const exp = profile.exp ?? meta?.exp ?? "";
  const mfg = profile.mfg ?? meta?.mfg ?? "";
  const cls = expiryClass(exp);
  const expired = cls === "Expired";

  const onHandRaw = sum(positions, (r) => r.onHand);
  const reserved = sum(positions, (r) => r.reserved);
  const qcHold = sum(positions, (r) => r.qcHold);
  const returnHold = sum(positions, (r) => r.returnHold);
  const damaged = sum(positions, (r) => r.damaged);
  const inTransit = sum(positions, (r) => r.inTransit);
  const recallHold = num(profile.recallHold);
  const blocked = num(profile.blocked) + sum(positions.filter((r) => r.blocked), (r) => r.onHand);

  /* An expired lot never counts as available — the quantity moves bucket. */
  const availableRaw = Math.max(0, sum(positions, (r) => r.available));
  const expiredQty = expired ? availableRaw : 0;
  const available = Math.max(0, availableRaw - expiredQty - recallHold);
  const onHand = onHandRaw + recallHold;

  const keyRef = { product: key.product, aliases };
  const shipped =
    sum(
      SHIPMENTS.flatMap((s) =>
        (s.items ?? []).filter((i) => isProduct(key, i.code) && aliases.includes(i.lot)),
      ),
      (i) => i.shipmentQty || i.orderedQty || 0,
    ) + sum(SHIPMENTS, (s) => declaredQty(keyRef, s.code));
  const returned = sum(
    SALES_RETURNS.flatMap((r) =>
      (r.items ?? []).filter(
        (i) => isProduct(key, i.code) && aliases.includes((i as { lot?: string }).lot ?? ""),
      ),
    ),
    (i) => i.receivedQty ?? 0,
  );

  const warehouses = [...new Set(positions.map((r) => r.warehouse))];
  const locations = [...new Set(positions.map((r) => `${r.zone}-${r.rack}-${r.bin}`))];

  const lotStatus = deriveStatus(profile, onHand, qcHold, recallHold, blocked, cls);
  const bucketTotal = available + reserved + qcHold + returnHold + expiredQty + recallHold;

  const moves = movementRows().filter(
    (m) => m.product === key.product && aliases.includes(m.lot),
  );
  const recall = RECALL_REVIEWS.find((r) => aliases.includes(r.lot));
  const unitCost = positions[0]?.avgCost ?? p?.pricing?.avgCost ?? p?.price ?? 0;

  const customers = new Set(
    SHIPMENTS.filter(
      (s) =>
        (s.items ?? []).some((i) => isProduct(key, i.code) && aliases.includes(i.lot)) ||
        declaredQty(keyRef, s.code) > 0,
    ).map((s) => s.customerCode || s.customer),
  );

  return {
    code: `${key.product}|${key.lot}`,
    lot: key.lot,
    aliases,

    product: key.product,
    productName: p?.name ?? key.product,
    barcode: p?.barcode ?? "",
    icon: p?.icon ?? "📦",
    brand: p?.brand ?? "",
    cat: p?.cat ?? "",
    unit: p?.unit ?? "",

    supplier: src.supplier,
    supplierCode: src.supplierCode,
    supplierLot: profile.supplierLot ?? src.supplierLot,
    manufacturer: src.manufacturer,
    country: src.country,
    supplierContact: src.contact,

    mfg,
    exp,
    received: profile.received ?? "",
    daysToExpiry: daysToExpiry(exp),
    expiryClass: cls,
    shelfLifePct: shelfLifePct(mfg, exp),
    fefoRank: 0,
    meetsMinShelfLife: (shelfLifePct(mfg, exp) ?? 100) >= MIN_SHELF_LIFE_PCT,

    originalQty: num(profile.originalQty) || onHand + shipped,
    onHand,
    available,
    reserved,
    qcHold,
    returnHold,
    damaged,
    blocked,
    expiredQty,
    recallHold,
    inTransit,
    shippedQty: shipped,
    returnedQty: returned,
    scrappedQty: num(profile.scrapped),

    warehouses,
    locations,
    warehouseCount: warehouses.length,
    locationCount: locations.length,

    lotStatus,
    /* Same equation as Stock Card: Damaged and Blocked are tags on a
       position, not buckets of their own, and In Transit sits outside. */
    reconciled: bucketTotal === onHand,

    poRef: profile.poRef ?? "",
    grRef: profile.grRef ?? "",
    qcRef: profile.qcRef ?? "",
    note: profile.note ?? "",

    customerCount: customers.size,
    recallRef: recall?.code ?? "",
    correctionCount: LOT_CORRECTIONS.filter(
      (c) => aliases.includes(c.fromLot) || aliases.includes(c.toLot),
    ).length,
    lastMovement: moves[0]?.when ?? "",
    unitCost,
    inventoryValue: Math.round(available * unitCost * 100) / 100,
  };
}

function buildAll(): LotRow[] {
  const rows = collectKeys().map(build);

  /* FEFO: the soonest expiry inside a product picks first. */
  const byProduct = new Map<string, LotRow[]>();
  for (const r of rows) {
    const list = byProduct.get(r.product) ?? [];
    list.push(r);
    byProduct.set(r.product, list);
  }
  for (const list of byProduct.values()) {
    list
      .filter((r) => r.available > 0)
      .sort((a, b) => (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9))
      .forEach((r, i) => (r.fefoRank = i + 1));
  }

  return rows.sort(
    (a, b) => (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9) || a.lot.localeCompare(b.lot),
  );
}

let cache: LotRow[] | null = null;

export const lotRows = (): LotRow[] => (cache ??= buildAll());

/** Recall handoff rewrites the overlay — rebuild on the next read. */
export const invalidateLots = () => {
  cache = null;
};

export const getLot = (code: string) =>
  lotRows().find((l) => l.code === code) ?? null;

export const findLot = (product: string, lot: string) =>
  lotRows().find((l) => l.product === product && l.aliases.includes(lot)) ?? null;

/* ---------- Inventory breakdown ---------- */

export interface LotStockRow {
  warehouse: string;
  whName: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  location: string;
  stockStatus: string;
  available: number;
  reserved: number;
  qcHold: number;
  returnHold: number;
  damaged: number;
  blocked: number;
  expired: number;
  recallHold: number;
  onHand: number;
  inTransit: number;
  lastMovement: string;
}

/** Where the lot physically sits, one row per bin. */
export function lotInventory(r: LotRow): LotStockRow[] {
  const expired = r.expiryClass === "Expired";
  return STOCK_POSITIONS.filter(
    (p) => p.product === r.product && r.aliases.includes(p.lot),
  ).map((p) => {
    const wh = WAREHOUSES.find((w) => w.code === p.warehouse);
    return {
      warehouse: p.warehouse,
      whName: wh?.name ?? "",
      zone: p.zone,
      rack: p.rack,
      shelf: p.shelf,
      bin: p.bin,
      location: `${p.zone}-${p.rack}-${p.bin}`,
      stockStatus: expired ? "Expired" : p.status,
      available: expired ? 0 : Math.max(0, p.available),
      reserved: p.reserved,
      qcHold: p.qcHold,
      returnHold: p.returnHold,
      damaged: p.damaged,
      blocked: p.blocked ? p.onHand : 0,
      expired: expired ? Math.max(0, p.available) : 0,
      recallHold: 0,
      onHand: p.onHand,
      inTransit: p.inTransit,
      lastMovement: p.updated,
    };
  });
}

/* ---------- Traceability ---------- */

export interface TraceDoc {
  doc: string;
  type: string;
  entity: string;
  date: string;
  status: string;
  qty: number;
  warehouse: string;
  user: string;
  result: string;
}

/** Supplier → PO → GR → QC → Put Away. */
export function lotInbound(r: LotRow): TraceDoc[] {
  const out: TraceDoc[] = [];

  const po = PURCHASE_ORDERS.find((x) => x.code === r.poRef);
  if (po)
    out.push({
      doc: po.code,
      type: "Purchase Order",
      entity: "purchase-order",
      date: po.orderDate,
      status: po.status,
      qty: sum((po.items ?? []).filter((i) => isProduct(r, i.code)), (i) => i.qty),
      warehouse: po.warehouse,
      user: po.buyer,
      result: "—",
    });

  for (const g of GOODS_RECEIPTS) {
    const items = (g.items ?? []).filter((i) => isProduct(r, i.code));
    if (!items.length) continue;
    if (r.grRef && g.code !== r.grRef) continue;
    out.push({
      doc: g.code,
      type: "Goods Receipt",
      entity: "goods-receipt",
      date: g.receiptDate,
      status: g.status,
      qty: sum(items, (i) => i.receiveNow),
      warehouse: g.warehouse,
      user: g.receiver,
      result: g.qcStatus,
    });
  }

  for (const q of QC_INSPECTIONS) {
    if (q.product !== r.product) continue;
    if (q.lot && !r.aliases.includes(q.lot) && r.qcRef !== q.code) continue;
    out.push({
      doc: q.code,
      type: "QC Inspection",
      entity: "qc-inspection",
      date: q.inspectionDate || q.dueDate,
      status: q.status,
      qty: q.receivedQty,
      warehouse: q.warehouse,
      user: q.inspector,
      result: q.result,
    });
  }

  for (const t of PUTAWAY_TASKS) {
    const items = (t.items ?? []).filter(
      (i) => isProduct(r, i.code) && r.aliases.includes(i.lot),
    );
    if (!items.length) continue;
    out.push({
      doc: t.code,
      type: "Put Away",
      entity: "put-away",
      date: t.updated.split(" ")[0],
      status: t.status,
      qty: sum(items, (i) => i.qty),
      warehouse: t.warehouse,
      user: t.assignedTo,
      result: items[0].destBin || items[0].suggestBin || "—",
    });
  }

  return out;
}

export interface OutboundRow {
  soRef: string;
  customer: string;
  customerCode: string;
  reserved: number;
  picked: number;
  shipped: number;
  doRef: string;
  shipment: string;
  invoice: string;
  deliveryDate: string;
  returned: number;
  status: string;
  salesRep: string;
}

/** Reservation → Picking → Shipment → Customer, one row per shipment. */
export function lotOutbound(r: LotRow): OutboundRow[] {
  const rows: OutboundRow[] = [];

  for (const s of SHIPMENTS) {
    const items = (s.items ?? []).filter(
      (i) => isProduct(r, i.code) && r.aliases.includes(i.lot),
    );
    const declared = declaredQty(r, s.code);
    if (!items.length && !declared) continue;

    const shipped = sum(items, (i) => i.shipmentQty || i.orderedQty || 0) + declared;
    const pick = PICKING_TASKS.find((p) => p.soRef === s.soRef);
    const picked = pick
      ? sum(
          (pick.items ?? []).filter((i) => isProduct(r, i.code) && r.aliases.includes(i.lot)),
          (i) => i.picked || i.ordered || 0,
        )
      : 0;
    const so = SALES_ORDERS.find((o) => o.code === s.soRef);
    const reserved = so
      ? sum(
          (so.items ?? []).filter((i) => isProduct(r, i.code)),
          (i) => Math.max(0, (i.qty ?? 0) - (i.delivered ?? 0)),
        )
      : 0;
    const ret = sum(
      SALES_RETURNS.filter((x) => x.shipmentRef === s.code).flatMap((x) =>
        (x.items ?? []).filter((i) => isProduct(r, i.code)),
      ),
      (i) => i.receivedQty ?? 0,
    );

    rows.push({
      soRef: s.soRef,
      customer: s.customer,
      customerCode: s.customerCode,
      reserved,
      picked,
      shipped,
      doRef: s.doRef,
      shipment: s.code,
      invoice: s.invRef,
      deliveryDate: s.updated.split(" ")[0],
      returned: ret,
      status: s.status,
      salesRep: s.salesRep,
    });
  }

  /* Orders that reserved the lot but have not shipped yet still belong here. */
  for (const p of PICKING_TASKS) {
    const items = (p.items ?? []).filter(
      (i) => isProduct(r, i.code) && r.aliases.includes(i.lot),
    );
    if (!items.length) continue;
    if (rows.some((x) => x.soRef === p.soRef)) continue;
    rows.push({
      soRef: p.soRef,
      customer: p.customer,
      customerCode: p.customerCode,
      reserved: sum(items, (i) => i.ordered),
      picked: sum(items, (i) => i.picked),
      shipped: 0,
      doRef: "",
      shipment: "",
      invoice: "",
      deliveryDate: "",
      returned: 0,
      status: p.status,
      salesRep: "",
    });
  }

  return rows;
}

export interface CustomerTrace {
  customerCode: string;
  customer: string;
  type: string;
  contact: string;
  phone: string;
  email: string;
  orders: string[];
  invoices: string[];
  shipments: string[];
  shipmentDate: string;
  delivered: number;
  returned: number;
  net: number;
  salesRep: string;
  recallContact: string;
}

/** Who received the lot — the answer a recall actually needs. */
export function lotCustomers(r: LotRow): CustomerTrace[] {
  const map = new Map<string, CustomerTrace>();

  for (const o of lotOutbound(r)) {
    if (!o.shipment) continue;
    const key = o.customerCode || o.customer;
    const s = SHIPMENTS.find((x) => x.code === o.shipment);
    const hit =
      map.get(key) ??
      {
        customerCode: o.customerCode,
        customer: o.customer,
        type: "Customer",
        contact: s?.contactPerson ?? "—",
        phone: s?.contactPhone ?? "—",
        email: "—",
        orders: [],
        invoices: [],
        shipments: [],
        shipmentDate: o.deliveryDate,
        delivered: 0,
        returned: 0,
        net: 0,
        salesRep: o.salesRep,
        recallContact: "ยังไม่ได้ติดต่อ",
      };
    if (o.soRef && !hit.orders.includes(o.soRef)) hit.orders.push(o.soRef);
    if (o.invoice && !hit.invoices.includes(o.invoice)) hit.invoices.push(o.invoice);
    if (!hit.shipments.includes(o.shipment)) hit.shipments.push(o.shipment);
    hit.delivered += o.shipped;
    hit.returned += o.returned;
    hit.net = hit.delivered - hit.returned;
    map.set(key, hit);
  }

  return [...map.values()].sort((a, b) => b.delivered - a.delivered);
}

export interface ReturnTrace {
  code: string;
  customer: string;
  shipmentRef: string;
  requested: number;
  received: number;
  accepted: number;
  rejected: number;
  reason: string;
  disposition: string;
  creditNote: string;
  status: string;
}

export function lotReturns(r: LotRow): ReturnTrace[] {
  return SALES_RETURNS.filter((x) =>
    (x.items ?? []).some((i) => isProduct(r, i.code)),
  ).map((x) => {
    const items = (x.items ?? []).filter((i) => isProduct(r, i.code));
    return {
      code: x.code,
      customer: x.customer,
      shipmentRef: x.shipmentRef,
      requested: sum(items, (i) => i.requestedQty ?? 0),
      received: sum(items, (i) => i.receivedQty ?? 0),
      accepted: sum(items, (i) => i.acceptedQty ?? 0),
      rejected: sum(items, (i) => i.rejectedQty ?? 0),
      /* The reason lives on the line; the header only carries the disposition. */
      reason: items[0]?.reason ?? "",
      disposition: x.dispositionStatus ?? "—",
      creditNote: x.creditNoteRef ?? "",
      status: x.status,
    };
  });
}

export const lotMovements = (r: LotRow) =>
  movementRows().filter((m) => m.product === r.product && r.aliases.includes(m.lot));

export const lotGenealogy = (r: LotRow) =>
  LOT_GENEALOGY.filter(
    (g) => r.aliases.includes(g.parent) || r.aliases.includes(g.child),
  );

export const lotCorrections = (r: LotRow) =>
  LOT_CORRECTIONS.filter(
    (c) => r.aliases.includes(c.fromLot) || r.aliases.includes(c.toLot),
  );

export const lotRecall = (r: LotRow) =>
  RECALL_REVIEWS.find((x) => r.aliases.includes(x.lot)) ?? null;

/* ---------- Expiry monitoring ---------- */

export interface ExpiryRow extends LotRow {
  risk: "Low" | "Medium" | "High" | "Critical";
  action: string;
}

const RISK_BY_CLASS: Record<string, ExpiryRow["risk"]> = {
  Expired: "Critical",
  "Expires within 30 days": "Critical",
  "Expires within 60 days": "High",
  "Expires within 90 days": "Medium",
  "Expires within 180 days": "Low",
  "More than 180 days": "Low",
  "No Expiry Date": "Low",
};

/** Operational suggestions only — nothing here acts on stock. */
function recommendAction(r: LotRow): string {
  if (r.expiryClass === "Expired") return r.available > 0 ? "Move to Expired Status" : "Start Disposal Review";
  if (r.expiryClass === "Expires within 30 days")
    return r.reserved > 0 ? "Prioritize FEFO Picking" : "Block New Reservation";
  if (r.expiryClass === "Expires within 60 days") return "Prioritize FEFO Picking";
  if (r.expiryClass === "Expires within 90 days") return "Transfer to Fast-Moving Warehouse";
  return "ไม่ต้องดำเนินการ";
}

export const expiryWatch = (): ExpiryRow[] =>
  lotRows()
    .filter((r) => r.expiryClass !== "More than 180 days")
    .map((r) => ({ ...r, risk: RISK_BY_CLASS[r.expiryClass] ?? "Low", action: recommendAction(r) }))
    .sort((a, b) => (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9));

/* ---------- Summary ---------- */

export interface LotSummary {
  total: number;
  active: number;
  available: number;
  qcHold: number;
  recallHold: number;
  nearExpiry: number;
  expired: number;
  depleted: number;
  receivedThisMonth: number;
  shippedThisMonth: number;
  inventoryValue: number;
}

export function lotSummary(rows: LotRow[] = lotRows()): LotSummary {
  const monthOf = (v: string) => v.split("/").slice(1).join("/");
  const byMonth = new Map<string, number>();
  for (const r of rows.filter((x) => x.received)) {
    const m = monthOf(r.received);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }

  return {
    total: rows.length,
    active: rows.filter((r) => r.lotStatus === "Active").length,
    available: rows.filter((r) => r.available > 0).length,
    qcHold: rows.filter((r) => r.qcHold > 0).length,
    recallHold: rows.filter((r) => r.lotStatus === "Recall Hold" || r.recallHold > 0).length,
    nearExpiry: rows.filter((r) => r.lotStatus === "Near Expiry").length,
    expired: rows.filter((r) => r.expiryClass === "Expired").length,
    depleted: rows.filter((r) => r.lotStatus === "Depleted").length,
    receivedThisMonth: [...byMonth.values()].sort((a, b) => b - a)[0] ?? 0,
    shippedThisMonth: rows.filter((r) => r.shippedQty > 0).length,
    inventoryValue: Math.round(sum(rows, (r) => r.inventoryValue) * 100) / 100,
  };
}

/* ---------- Badges ---------- */

export const LOT_TONE: Record<string, BadgeTone> = {
  Active: "success",
  "Near Expiry": "warning",
  Expired: "danger",
  "QC Hold": "warning",
  Released: "success",
  Blocked: "neutral",
  "Recall Hold": "danger",
  "Under Investigation": "warning",
  Depleted: "neutral",
  Closed: "neutral",
  Corrected: "info",
};

export const RECALL_TONE: Record<string, BadgeTone> = {
  "Draft Review": "neutral",
  "Under Investigation": "warning",
  "Hold Recommended": "warning",
  "Hold Applied": "danger",
  "Customer Trace Complete": "info",
  "Supplier Contact Pending": "warning",
  Closed: "success",
};

export const RISK_TONE: Record<string, BadgeTone> = {
  Low: "success",
  Medium: "warning",
  High: "danger",
  Critical: "danger",
};

/* Product master is imported so a lot can never name a product that is gone. */
export const lotProducts = () => PRODUCTS.filter((p) => p.detail?.lotTracked);
