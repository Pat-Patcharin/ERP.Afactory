import {
  LOT_STATUSES,
  SERIAL_STATUSES,
  STOCK_PROFILES,
  STOCK_SEED,
  STOCK_TARGETS,
  type StockProfile,
  type StockStatus,
} from "@/data/stock";
import type { BadgeTone, RecordBase } from "@/lib/types";
import { PRODUCTS, stockedProducts } from "./product";
import { WAREHOUSES, flattenBins, type WarehouseRow } from "./warehouse";
import { parseStamp } from "./inventory";
import { GOODS_RECEIPTS, PUTAWAY_TASKS, QC_INSPECTIONS } from "./inbound";
import { PICKING_TASKS, SALES_ORDERS } from "./outbound";
import { PURCHASE_ORDERS } from "./purchase";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";

/* ============================================================
   STOCK INQUIRY — inventory positions.

   A position is one product in one bin, optionally one lot or one
   serial. Stock Inquiry displays these; it never moves them, which
   is why nothing in this file mutates.

   Positions are GENERATED, not hand-written, but they are generated
   against the real masters and calibrated to them: the quantities
   for a product always sum back to that product's own onHand,
   reserved and onOrder in the Product master. Open a product's
   detail page and Stock Inquiry will agree with it.

   Generation is seeded, so the same 300 rows appear on every render
   and in every test. Nothing here uses Math.random.
   ============================================================ */

/** Mulberry32 — small, fast, and identical across runs. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Split a total into `n` parts that sum back to it exactly.
 * `weights` shapes the split; the remainder lands on the largest part so
 * rounding never loses or invents a unit.
 */
function share(total: number, weights: number[]): number[] {
  const wSum = weights.reduce((t, w) => t + w, 0) || 1;
  const parts = weights.map((w) => Math.floor((total * w) / wSum));
  let rest = total - parts.reduce((t, p) => t + p, 0);

  /* Hand the remainder out one unit at a time, heaviest weight first — and
     only to positions that were meant to receive any, so a zero weight
     really means zero. */
  const order = weights
    .map((w, i) => [w, i] as const)
    .filter(([w]) => w > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);
  const ring = order.length ? order : weights.map((_, i) => i);
  for (let i = 0; rest > 0; i = (i + 1) % ring.length) {
    parts[ring[i]] += 1;
    rest -= 1;
  }
  return parts;
}

/**
 * Share a total without ever exceeding a per-position ceiling. Anything a
 * capped position cannot take is redistributed to those with room left; a
 * total larger than every ceiling combined overflows onto the first slot,
 * which is the only case that can legitimately drive stock negative.
 */
function shareCapped(total: number, caps: number[]): number[] {
  const parts = share(total, caps);
  let spill = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] > caps[i]) {
      spill += parts[i] - caps[i];
      parts[i] = caps[i];
    }
  }
  for (let i = 0; spill > 0 && i < parts.length; i++) {
    const room = caps[i] - parts[i];
    if (room <= 0) continue;
    const take = Math.min(room, spill);
    parts[i] += take;
    spill -= take;
  }
  if (spill > 0) parts[0] += spill;
  return parts;
}

const pad = (n: number, w = 4) => String(n).padStart(w, "0");

const DEFAULT_PROFILE: StockProfile = {
  serialTracked: false,
  safetyStock: 0,
  qcHold: 0,
  returnHold: 0,
  damaged: 0,
  inTransit: 0,
  backOrder: 0,
  avgCost: 0,
  warehouses: [],
};

/* ---------- Row shape ---------- */

export interface StockRow extends RecordBase {
  /** Position id — STK-0001. */
  code: string;

  product: string;
  productName: string;
  barcode: string;
  icon: string;
  cat: string;
  brand: string;
  unit: string;

  warehouse: string;
  whName: string;
  whLabel: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;

  lot: string;
  mfg: string;
  exp: string;
  serial: string;

  onHand: number;
  reserved: number;
  qcHold: number;
  returnHold: number;
  damaged: number;
  inTransit: number;
  onOrder: number;
  backOrder: number;
  rop: number;
  safety: number;

  /** On Hand − Reserved − QC Hold − Return Hold. Damaged sits outside it. */
  available: number;
  avgCost: number;
  value: number;

  blocked: boolean;
  expDays: number | null;
  status: StockStatus;
  tone: BadgeTone;
  updated: string;
}

/* ---------- Status ---------- */

export const STOCK_TONE: Record<StockStatus, BadgeTone> = {
  Available: "success",
  Reserved: "info",
  "QC Hold": "warning",
  "Return Hold": "warning",
  Damaged: "danger",
  Blocked: "neutral",
  Expired: "danger",
  "Near Expiry": "warning",
  Negative: "danger",
};

/**
 * One row, one status. Ordered by what a warehouse must act on first — a
 * negative balance outranks an expiry, which outranks a hold.
 */
export function stockStatusOf(r: {
  available: number;
  expDays: number | null;
  blocked: boolean;
  qcHold: number;
  returnHold: number;
  damaged: number;
  reserved: number;
}): StockStatus {
  if (r.available < 0) return "Negative";
  if (r.expDays !== null && r.expDays < 0) return "Expired";
  if (r.blocked) return "Blocked";
  if (r.qcHold > 0) return "QC Hold";
  if (r.returnHold > 0) return "Return Hold";
  if (r.damaged > 0) return "Damaged";
  if (r.expDays !== null && r.expDays <= 90) return "Near Expiry";
  if (r.available === 0 && r.reserved > 0) return "Reserved";
  return "Available";
}

const daysTo = (v: string) => {
  const t = parseStamp(v);
  return t ? Math.ceil((t - Date.now()) / 86_400_000) : null;
};

/* ---------- Bins ---------- */

interface BinSlot {
  wh: string;
  whName: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
}

/** Pickable bins per warehouse; a warehouse with no location tree still works. */
function binsOf(w: WarehouseRow): BinSlot[] {
  const rows = flattenBins(w)
    .filter((b) => b.status === "Active")
    .map((b) => ({
      wh: w.code,
      whName: w.name,
      zone: b.zone,
      rack: b.rack,
      shelf: b.shelf,
      bin: b.bin,
    }));
  if (rows.length) return rows;
  return [
    { wh: w.code, whName: w.name, zone: "GEN", rack: "R1", shelf: "S1", bin: "BULK" },
  ];
}

/* ---------- Lot catalogue ---------- */

export interface LotRow {
  lot: string;
  product: string;
  productName: string;
  mfg: string;
  exp: string;
  status: string;
}

function buildLots(rand: () => number): LotRow[] {
  const out: LotRow[] = [];
  /* Only what the warehouse holds. The price list master puts hundreds of
     catalogue products in the master; inventing lots for stock nobody has
     would be fabricating the warehouse. */
  const lotProducts = stockedProducts().filter(
    (p) => !(STOCK_PROFILES[p.code] ?? DEFAULT_PROFILE).serialTracked,
  );
  if (!lotProducts.length) return out;

  for (let i = 0; i < STOCK_TARGETS.lots; i++) {
    const p = lotProducts[i % lotProducts.length];
    /* Spread expiry from already-expired out to two years ahead. */
    const offset = Math.round((rand() * 640 - 130) / 5) * 5;
    const exp = new Date(Date.now() + offset * 86_400_000);
    const mfg = new Date(exp.getTime() - 720 * 86_400_000);
    const d = (x: Date) =>
      `${pad(x.getDate(), 2)}/${pad(x.getMonth() + 1, 2)}/${x.getFullYear()}`;
    out.push({
      lot: `LOT-26${pad(i + 1, 3)}`,
      product: p.code,
      productName: p.name,
      mfg: d(mfg),
      exp: d(exp),
      status: LOT_STATUSES[i % LOT_STATUSES.length],
    });
  }
  return out;
}

/* ---------- Positions ---------- */

function buildPositions(rand: () => number, lots: LotRow[]): StockRow[] {
  const rows: StockRow[] = [];
  const byCode = new Map(WAREHOUSES.map((w) => [w.code, w]));
  const binCache = new Map<string, BinSlot[]>();

  /* How many positions each product gets, proportional to its warehouses. */
  const plans = stockedProducts().map((p) => {
    const prof = STOCK_PROFILES[p.code] ?? DEFAULT_PROFILE;
    const whs = (prof.warehouses.length ? prof.warehouses : ["WH-BKK"]).filter((c) =>
      byCode.has(c),
    );
    return { p, prof, whs, weight: whs.length };
  });

  const counts = share(
    STOCK_TARGETS.positions,
    plans.map((pl) => pl.weight),
  );

  let seq = 0;

  plans.forEach((pl, pi) => {
    const n = Math.max(pl.whs.length, counts[pi]);
    const productLots = lots.filter((l) => l.product === pl.p.code);
    const whAt = (i: number) => pl.whs[i % pl.whs.length];

    /* Weight positions so the split is uneven but reproducible. */
    const weights = Array.from({ length: n }, () => 1 + Math.floor(rand() * 9));

    const onHand = share(pl.p.onHand ?? 0, weights);
    const reserved = share(pl.p.reserved ?? 0, weights);
    const onOrder = share(pl.p.onOrder ?? 0, weights);

    /**
     * Holds concentrate where the stock physically sits: QC hold in the
     * quarantine warehouse, return hold in the returns warehouse, transit in
     * the transit warehouse. Weighting by on-hand keeps a hold from landing
     * on a position too thin to cover it — a negative balance is an anomaly
     * this generator creates deliberately, never by accident.
     */
    const holdWeights = (type: string, fallback: number) => {
      const w = new Array(n).fill(0);
      const room = (i: number) => Math.max(0, onHand[i] - reserved[i]);
      let hit = false;
      for (let i = 0; i < n; i++) {
        if (byCode.get(whAt(i))?.type === type && room(i) > 0) {
          w[i] = room(i);
          hit = true;
        }
      }
      if (hit) return w;

      /* No dedicated warehouse — fall back to the deepest positions. */
      const deepest = Array.from({ length: n }, (_, i) => i)
        .filter((i) => room(i) > 0)
        .sort((a, b) => room(b) - room(a))
        .slice(0, Math.max(1, fallback));
      for (const i of deepest) w[i] = room(i);
      return w;
    };

    /* QC hold takes its room first, return hold takes what is left. Neither
       may exceed it, so availability only goes negative where forced below. */
    const qcRoom = holdWeights("Quarantine", 2);
    const qc = shareCapped(pl.prof.qcHold, qcRoom);
    const retRoom = holdWeights("Returns", 2).map((r, i) =>
      Math.max(0, r - (qcRoom[i] ? qc[i] : 0)),
    );
    const ret = shareCapped(pl.prof.returnHold, retRoom);

    /* Transit, damage and back order sit outside the availability formula. */
    const transit = share(pl.prof.inTransit, holdWeights("Transit", 2));
    const dmg = share(pl.prof.damaged, holdWeights("__none__", 2));
    const back = share(pl.prof.backOrder, holdWeights("__none__", 2));

    for (let i = 0; i < n; i++) {
      const whCode = whAt(i);
      const w = byCode.get(whCode)!;
      if (!binCache.has(whCode)) binCache.set(whCode, binsOf(w));
      const bins = binCache.get(whCode)!;
      const slot = bins[Math.floor(rand() * bins.length) % bins.length];

      const lot = pl.prof.serialTracked
        ? null
        : (productLots[i % Math.max(1, productLots.length)] ?? null);
      const serial = pl.prof.serialTracked
        ? `SN-${pl.p.code.slice(-4)}-${pad(i + 1, 4)}`
        : "";

      const expDays = lot ? daysTo(lot.exp) : null;
      const blocked = w.type === "Quarantine";

      seq++;
      rows.push({
        code: `STK-${pad(seq)}`,
        product: pl.p.code,
        productName: pl.p.name,
        barcode: pl.p.barcode,
        icon: pl.p.icon,
        cat: pl.p.cat,
        brand: pl.p.brand,
        unit: pl.p.unit,
        warehouse: w.code,
        whName: w.name,
        whLabel: `${w.code} ${w.name}`,
        zone: slot.zone,
        rack: slot.rack,
        shelf: slot.shelf,
        bin: slot.bin,
        lot: lot?.lot ?? "",
        mfg: lot?.mfg ?? "",
        exp: lot?.exp ?? "",
        serial,
        onHand: onHand[i],
        reserved: reserved[i],
        qcHold: qc[i],
        returnHold: ret[i],
        damaged: dmg[i],
        inTransit: transit[i],
        onOrder: onOrder[i],
        backOrder: back[i],
        rop: pl.p.lowLevel ?? 0,
        safety: pl.prof.safetyStock,
        available: 0,
        avgCost: pl.prof.avgCost || pl.p.pricing?.avgCost || 0,
        value: 0,
        blocked,
        expDays,
        status: "Available",
        tone: "success",
        updated: pl.p.updated,
      });
    }
  });

  return rows.map(settle);
}

/** Apply the availability formula and derive the row's status from it. */
function settle(r: StockRow): StockRow {
  const available = r.onHand - r.reserved - r.qcHold - r.returnHold;
  const status = stockStatusOf({
    available,
    expDays: r.expDays,
    blocked: r.blocked,
    qcHold: r.qcHold,
    returnHold: r.returnHold,
    damaged: r.damaged,
    reserved: r.reserved,
  });
  return {
    ...r,
    available,
    value: available * r.avgCost,
    status,
    tone: STOCK_TONE[status],
  };
}

const seedRand = rng(STOCK_SEED);
export const STOCK_LOTS: LotRow[] = buildLots(seedRand);
export const STOCK_POSITIONS: StockRow[] = buildPositions(seedRand, STOCK_LOTS);

export const stockRows = () => STOCK_POSITIONS;

export const getStockRow = (code: string) =>
  STOCK_POSITIONS.find((r) => r.code === code) ?? null;

/* ---------- Serials ---------- */

export interface SerialRow {
  serial: string;
  product: string;
  productName: string;
  warehouse: string;
  whName: string;
  location: string;
  status: string;
  doc: string;
}

function buildSerials(): SerialRow[] {
  const tracked = STOCK_POSITIONS.filter((r) => r.serial);
  const docs = [...SALES_ORDERS.map((s) => s.code), ...SHIPMENTS.map((s) => s.code)];
  const out: SerialRow[] = [];

  for (let i = 0; i < STOCK_TARGETS.serials; i++) {
    const base = tracked[i % Math.max(1, tracked.length)];
    if (!base) break;
    const status = SERIAL_STATUSES[i % SERIAL_STATUSES.length];
    out.push({
      serial: `SN-${base.product.slice(-4)}-${pad(i + 1, 4)}`,
      product: base.product,
      productName: base.productName,
      warehouse: base.warehouse,
      whName: base.whName,
      location: `${base.zone}-${base.rack}-${base.bin}`,
      status,
      /* Only a serial that left the shelf carries a document. */
      doc: status === "In Stock" ? "" : docs[i % Math.max(1, docs.length)],
    });
  }
  return out;
}

export const STOCK_SERIALS: SerialRow[] = buildSerials();

/* ---------- Reservations ---------- */

export interface ReservationRow {
  soRef: string;
  product: string;
  customer: string;
  warehouse: string;
  qty: number;
  date: string;
  status: string;
}

/**
 * Reservations are allocations, so one order line reserved across two
 * warehouses is two rows. Every row points at a sales order that exists.
 */
function buildReservations(): ReservationRow[] {
  const out: ReservationRow[] = [];
  const byProduct = new Map<string, string[]>();
  for (const r of STOCK_POSITIONS) {
    const list = byProduct.get(r.product) ?? [];
    if (!list.includes(r.warehouse)) list.push(r.warehouse);
    byProduct.set(r.product, list);
  }

  for (const so of SALES_ORDERS) {
    for (const it of so.items ?? []) {
      const open = Math.max(0, (it.qty ?? 0) - (it.delivered ?? 0));
      if (!open) continue;
      const whs = byProduct.get(it.code) ?? [];
      if (!whs.length) continue;
      const split = share(open, whs.map((_, i) => (i === 0 ? 3 : 1)));
      whs.forEach((wh, i) => {
        if (!split[i]) return;
        out.push({
          soRef: so.code,
          product: it.code,
          customer: so.customer,
          warehouse: wh,
          qty: split[i],
          date: so.orderDate,
          status: so.status,
        });
      });
    }
  }
  return out.slice(0, STOCK_TARGETS.reservations);
}

export const STOCK_RESERVATIONS: ReservationRow[] = buildReservations();

/* ---------- Incoming ---------- */

export interface IncomingRow {
  poRef: string;
  product: string;
  supplier: string;
  warehouse: string;
  qty: number;
  eta: string;
  status: string;
  /** False when no purchase order documents this quantity yet. */
  documented: boolean;
}

/**
 * What is on its way in.
 *
 * Rows come from open purchase-order lines first, so every reference resolves
 * to a document that exists. The Product master's `onOrder` balance is often
 * larger than the Purchase Order module documents — pre-existing mock data
 * that was authored per module. Rather than hide the gap or invent PO lines
 * that would contradict the real order, the remainder is shown as planned
 * replenishment with no reference.
 */
function buildIncoming(): IncomingRow[] {
  const out: IncomingRow[] = [];
  const known = new Map(PRODUCTS.map((p) => [p.code, p]));
  const documented = new Map<string, number>();

  for (const po of PURCHASE_ORDERS) {
    for (const it of po.items ?? []) {
      if (!known.has(it.code)) continue;
      const open = Math.max(0, (it.qty ?? 0) - (it.recv ?? 0));
      if (!open) continue;
      documented.set(it.code, (documented.get(it.code) ?? 0) + open);

      const prof = STOCK_PROFILES[it.code] ?? DEFAULT_PROFILE;
      const whs = (prof.warehouses.length ? prof.warehouses : ["WH-BKK"]).slice(0, 2);
      const split = share(open, whs.map((_, i) => (i === 0 ? 3 : 1)));
      whs.forEach((wh, i) => {
        if (!split[i]) return;
        out.push({
          poRef: po.code,
          product: it.code,
          supplier: po.supplier,
          warehouse: wh,
          qty: split[i],
          eta: po.expectedDate,
          status: po.status,
          documented: true,
        });
      });
    }
  }

  for (const p of PRODUCTS) {
    const planned = (p.onOrder ?? 0) - (documented.get(p.code) ?? 0);
    if (planned <= 0) continue;
    const prof = STOCK_PROFILES[p.code] ?? DEFAULT_PROFILE;
    const whs = (prof.warehouses.length ? prof.warehouses : ["WH-BKK"]).slice(0, 3);
    const split = share(planned, whs.map((_, i) => (i === 0 ? 3 : 1)));
    whs.forEach((wh, i) => {
      if (!split[i]) return;
      out.push({
        poRef: "",
        product: p.code,
        supplier: p.supplier || "—",
        warehouse: wh,
        qty: split[i],
        eta: "—",
        status: "Planned",
        documented: false,
      });
    });
  }

  return out.slice(0, STOCK_TARGETS.incoming);
}

export const STOCK_INCOMING: IncomingRow[] = buildIncoming();

/* ---------- Movements ---------- */

export interface MovementRow {
  ts: number;
  when: string;
  doc: string;
  kind: string;
  icon: string;
  product: string;
  qty: number;
  dir: "In" | "Out" | "Hold";
  warehouse: string;
  user: string;
  status: string;
  entity: string;
}

/**
 * Product-level movements, read from the line items of documents that
 * actually exist. Transfer, Adjustment and Cycle Count appear in the spec's
 * list but have no module yet, so they contribute nothing rather than being
 * invented — the feed shows what the ERP can prove happened.
 */
function buildMovements(): MovementRow[] {
  const out: MovementRow[] = [];
  const push = (m: MovementRow) => out.push(m);

  for (const g of GOODS_RECEIPTS)
    for (const it of g.items ?? [])
      push({
        ts: parseStamp(g.updated),
        when: g.updated,
        doc: g.code,
        kind: "Goods Receipt",
        icon: "goodsReceipt",
        product: it.code,
        qty: it.receiveNow ?? 0,
        dir: "In",
        warehouse: g.warehouse,
        user: g.receiver || g.updatedBy,
        status: g.status,
        entity: "goods-receipt",
      });

  for (const q of QC_INSPECTIONS)
    push({
      ts: parseStamp(q.updated),
      when: q.updated,
      doc: q.code,
      kind: "QC Inspection",
      icon: "qc",
      product: q.product,
      qty: q.receivedQty ?? 0,
      dir: q.result === "Pass" ? "In" : "Hold",
      warehouse: q.warehouse,
      user: q.inspector || q.updatedBy,
      status: q.status,
      entity: "qc-inspection",
    });

  for (const p of PUTAWAY_TASKS)
    for (const it of p.items ?? [])
      push({
        ts: parseStamp(p.updated),
        when: p.updated,
        doc: p.code,
        kind: "Put Away",
        icon: "putAway",
        product: it.code,
        qty: it.qty ?? 0,
        dir: "In",
        warehouse: p.warehouse,
        user: p.assignedTo || p.updatedBy,
        status: p.status,
        entity: "put-away",
      });

  for (const so of SALES_ORDERS)
    for (const it of so.items ?? [])
      push({
        ts: parseStamp(so.updated),
        when: so.updated,
        doc: so.code,
        kind: "Reservation",
        icon: "lock",
        product: it.code,
        qty: Math.max(0, (it.qty ?? 0) - (it.delivered ?? 0)),
        dir: "Hold",
        warehouse: "",
        user: so.updatedBy,
        status: so.status,
        entity: "sales-order",
      });

  for (const p of PICKING_TASKS)
    for (const it of p.items ?? [])
      push({
        ts: parseStamp(p.updated),
        when: p.updated,
        doc: p.code,
        kind: "Picking",
        icon: "picking",
        product: it.code,
        qty: it.picked || it.ordered || 0,
        dir: "Out",
        warehouse: p.warehouse,
        user: p.assignedTo || p.updatedBy,
        status: p.status,
        entity: "picking",
      });

  for (const s of SHIPMENTS)
    for (const it of s.items ?? [])
      push({
        ts: parseStamp(s.updated),
        when: s.updated,
        doc: s.code,
        kind: "Shipment",
        icon: "truck",
        product: it.code,
        qty: it.shipmentQty || it.orderedQty || 0,
        dir: "Out",
        warehouse: s.warehouse,
        user: s.driver || s.updatedBy,
        status: s.status,
        entity: "shipment",
      });

  for (const r of SALES_RETURNS)
    for (const it of r.items ?? [])
      push({
        ts: parseStamp(r.updated),
        when: r.updated,
        doc: r.code,
        kind: "Sales Return",
        icon: "return",
        product: it.code,
        qty: it.receivedQty ?? it.requestedQty ?? 0,
        dir: "In",
        warehouse: r.receiving?.warehouse ?? "",
        user: r.updatedBy,
        status: r.status,
        entity: "sales-return",
      });

  /* Round-robin by kind before recency: shipments carry the newest stamps in
     the mock data and would otherwise be the only movement type on show. */
  const byKind = new Map<string, MovementRow[]>();
  for (const m of out
    .filter((m) => m.product && m.qty > 0)
    .sort((a, b) => b.ts - a.ts)) {
    const list = byKind.get(m.kind) ?? [];
    list.push(m);
    byKind.set(m.kind, list);
  }

  const picked: MovementRow[] = [];
  const queues = [...byKind.values()];
  for (let round = 0; picked.length < STOCK_TARGETS.movements; round++) {
    const before = picked.length;
    for (const q of queues) {
      if (picked.length >= STOCK_TARGETS.movements) break;
      if (q[round]) picked.push(q[round]);
    }
    if (picked.length === before) break;
  }

  return picked.sort((a, b) => b.ts - a.ts);
}

export const STOCK_MOVEMENTS: MovementRow[] = buildMovements();

export const stockMovements = (product?: string, limit = 20) =>
  (product ? STOCK_MOVEMENTS.filter((m) => m.product === product) : STOCK_MOVEMENTS).slice(
    0,
    limit,
  );

/* ---------- Rollups ---------- */

export interface StockTotals {
  onHand: number;
  reserved: number;
  qcHold: number;
  returnHold: number;
  damaged: number;
  inTransit: number;
  onOrder: number;
  backOrder: number;
  available: number;
  value: number;
  avgCost: number;
  positions: number;
  products: number;
}

const zero = (): StockTotals => ({
  onHand: 0,
  reserved: 0,
  qcHold: 0,
  returnHold: 0,
  damaged: 0,
  inTransit: 0,
  onOrder: 0,
  backOrder: 0,
  available: 0,
  value: 0,
  avgCost: 0,
  positions: 0,
  products: 0,
});

/** Sum any set of positions. Average cost is weighted by on-hand quantity. */
export function stockTotals(rows: StockRow[]): StockTotals {
  const t = zero();
  let costQty = 0;
  let costSum = 0;
  for (const r of rows) {
    t.onHand += r.onHand;
    t.reserved += r.reserved;
    t.qcHold += r.qcHold;
    t.returnHold += r.returnHold;
    t.damaged += r.damaged;
    t.inTransit += r.inTransit;
    t.onOrder += r.onOrder;
    t.backOrder += r.backOrder;
    t.available += r.available;
    t.value += r.value;
    costQty += r.onHand;
    costSum += r.onHand * r.avgCost;
  }
  t.positions = rows.length;
  t.products = new Set(rows.map((r) => r.product)).size;
  t.avgCost = costQty > 0 ? Math.round((costSum / costQty) * 100) / 100 : 0;
  return t;
}

export const productRows = (product: string) =>
  STOCK_POSITIONS.filter((r) => r.product === product);

export const productTotals = (product: string) => stockTotals(productRows(product));

export interface WhBreakdownRow {
  warehouse: string;
  whName: string;
  available: number;
  reserved: number;
  qcHold: number;
  returnHold: number;
  transit: number;
  total: number;
}

/** A product's stock split by warehouse — the drawer's Warehouse tab. */
export function productByWarehouse(product: string): WhBreakdownRow[] {
  const map = new Map<string, WhBreakdownRow>();
  for (const r of productRows(product)) {
    const hit =
      map.get(r.warehouse) ??
      {
        warehouse: r.warehouse,
        whName: r.whName,
        available: 0,
        reserved: 0,
        qcHold: 0,
        returnHold: 0,
        transit: 0,
        total: 0,
      };
    hit.available += r.available;
    hit.reserved += r.reserved;
    hit.qcHold += r.qcHold;
    hit.returnHold += r.returnHold;
    hit.transit += r.inTransit;
    hit.total += r.onHand;
    map.set(r.warehouse, hit);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export const productLots = (product: string) =>
  STOCK_LOTS.filter((l) => l.product === product).map((l) => ({
    ...l,
    qty: productRows(product)
      .filter((r) => r.lot === l.lot)
      .reduce((t, r) => t + r.onHand, 0),
    days: daysTo(l.exp),
  }));

export const productSerials = (product: string) =>
  STOCK_SERIALS.filter((s) => s.product === product);

export const productReservations = (product: string) =>
  STOCK_RESERVATIONS.filter((r) => r.product === product);

export const productIncoming = (product: string) =>
  STOCK_INCOMING.filter((r) => r.product === product);

/* ---------- Widgets ---------- */

/** Products whose available stock has fallen to or below the reorder point. */
export function lowStockProducts() {
  return stockedProducts().map((p) => {
    const t = productTotals(p.code);
    return {
      code: p.code,
      name: p.name,
      unit: p.unit,
      available: t.available,
      rop: p.lowLevel ?? 0,
      safety: (STOCK_PROFILES[p.code] ?? DEFAULT_PROFILE).safetyStock,
      onOrder: t.onOrder,
      gap: (p.lowLevel ?? 0) - t.available,
    };
  })
    .filter((r) => r.available <= r.rop)
    .sort((a, b) => b.gap - a.gap);
}

/** Lots expiring inside the window, bucketed the way the spec asks. */
export function nearExpiryLots(withinDays: 30 | 60 | 90 | number = 90) {
  return STOCK_LOTS.map((l) => {
    const days = daysTo(l.exp);
    const qty = STOCK_POSITIONS.filter((r) => r.lot === l.lot).reduce(
      (t, r) => t + r.onHand,
      0,
    );
    return { ...l, days: days ?? 0, qty };
  })
    .filter((l) => l.days >= 0 && l.days <= withinDays && l.qty > 0)
    .sort((a, b) => a.days - b.days);
}

export const expiredLots = () =>
  STOCK_LOTS.map((l) => ({
    ...l,
    days: daysTo(l.exp) ?? 0,
    qty: STOCK_POSITIONS.filter((r) => r.lot === l.lot).reduce((t, r) => t + r.onHand, 0),
  }))
    .filter((l) => l.days < 0 && l.qty > 0)
    .sort((a, b) => a.days - b.days);

export const negativePositions = () =>
  STOCK_POSITIONS.filter((r) => r.available < 0).sort((a, b) => a.available - b.available);

/* ---------- Headline ---------- */

export interface StockSummary extends StockTotals {
  lowStock: number;
  negative: number;
  nearExpiry: number;
  expired: number;
  movementToday: number;
  warehouses: number;
}

export function stockSummary(rows: StockRow[] = STOCK_POSITIONS): StockSummary {
  const t = stockTotals(rows);
  const latest = STOCK_MOVEMENTS.length ? STOCK_MOVEMENTS[0].ts : 0;
  const day = (ts: number) => new Date(ts).toDateString();

  return {
    ...t,
    lowStock: lowStockProducts().length,
    negative: rows.filter((r) => r.available < 0).length,
    nearExpiry: nearExpiryLots(90).length,
    expired: expiredLots().length,
    movementToday: latest
      ? STOCK_MOVEMENTS.filter((m) => day(m.ts) === day(latest)).reduce(
          (s, m) => s + m.qty,
          0,
        )
      : 0,
    warehouses: new Set(rows.map((r) => r.warehouse)).size,
  };
}
