import {
  COSTING_METHODS,
  MOVEMENT_SEED,
  MOVEMENT_TARGETS,
  MOVEMENT_TYPE_MAP,
  MOVEMENT_USERS,
  type MovementDirection,
  type MovementTypeDef,
} from "@/data/movements";
import type { BadgeTone, RecordBase } from "@/lib/types";
import { PRODUCTS } from "./product";
import { WAREHOUSES } from "./warehouse";
import { parseStamp } from "./inventory";
import { GOODS_RECEIPTS, PUTAWAY_TASKS, QC_INSPECTIONS } from "./inbound";
import { PICKING_TASKS, SALES_ORDERS } from "./outbound";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";
import {
  STOCK_LOTS,
  STOCK_POSITIONS,
  STOCK_SERIALS,
  productIncoming,
  productReservations,
  productTotals,
} from "./stock";

/* ============================================================
   STOCK CARD — the inventory ledger.

   Read-only by construction: nothing in this file mutates, and no
   schema built on it offers an edit action. Corrections are new
   rows (reversals), never changes to a posted one.

   The ledger is generated once, per product, and REPLAYED forward
   so every row carries the balance before and after it. Opening
   balance is derived as `today − net effect of every movement`,
   which means the last row of every product's card lands exactly on
   the figures Stock Inquiry and the Product master already show.
   That reconciliation is the point of the module, so it is asserted
   in the regression suite rather than left to trust.
   ============================================================ */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

const stampOf = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(
    d.getHours(),
    2,
  )}:${pad(d.getMinutes(), 2)}`;
};

/* ---------- Ledger state ---------- */

export interface StockState {
  onHand: number;
  avail: number;
  res: number;
  qc: number;
  ret: number;
  dmg: number;
  blk: number;
}

const zeroState = (): StockState => ({
  onHand: 0,
  avail: 0,
  res: 0,
  qc: 0,
  ret: 0,
  dmg: 0,
  blk: 0,
});

/** Deltas of one movement, quantity applied. */
function deltaOf(def: MovementTypeDef, qty: number): StockState {
  const e = def.effect;
  return {
    onHand: (e.onHand ?? 0) * qty,
    avail: (e.avail ?? 0) * qty,
    res: (e.res ?? 0) * qty,
    qc: (e.qc ?? 0) * qty,
    ret: (e.ret ?? 0) * qty,
    dmg: (e.dmg ?? 0) * qty,
    blk: (e.blk ?? 0) * qty,
  };
}

const addState = (a: StockState, b: StockState): StockState => ({
  onHand: a.onHand + b.onHand,
  avail: a.avail + b.avail,
  res: a.res + b.res,
  qc: a.qc + b.qc,
  ret: a.ret + b.ret,
  dmg: a.dmg + b.dmg,
  blk: a.blk + b.blk,
});

/* ---------- Row shape ---------- */

export interface MovementRow extends RecordBase {
  /** MOV-2026-000101 */
  code: string;
  seq: number;

  ts: number;
  when: string;
  date: string;
  time: string;

  product: string;
  productName: string;
  barcode: string;
  icon: string;
  cat: string;
  brand: string;
  unit: string;

  type: string;
  direction: MovementDirection;
  group: string;

  sourceModule: string;
  sourceModuleLabel: string;
  sourceDoc: string;
  sourceLine: number;
  sourceStatus: string;
  partner: string;

  warehouse: string;
  whName: string;
  whLabel: string;
  fromLoc: string;
  toLoc: string;
  zone: string;
  rack: string;
  bin: string;

  lot: string;
  serial: string;

  qtyIn: number;
  qtyOut: number;

  balanceBefore: number;
  balanceAfter: number;
  availBefore: number;
  availAfter: number;
  resBefore: number;
  resAfter: number;
  qcBefore: number;
  qcAfter: number;
  retBefore: number;
  retAfter: number;
  dmgBefore: number;
  dmgAfter: number;
  blkBefore: number;
  blkAfter: number;

  statusBefore: string;
  statusAfter: string;

  /* Operational cost preview — mock figures, no costing engine behind them. */
  unitCost: number;
  valueIn: number;
  valueOut: number;
  balanceValue: number;
  costingMethod: string;
  currency: string;

  user: string;
  reference: string;

  status: string;
  /** Set on the original when a reversal exists. */
  reversedBy: string;
  /** Set on the reversal, pointing back at the original. */
  reversalOf: string;
}

export const DIRECTION_TONE: Record<string, BadgeTone> = {
  In: "success",
  Out: "info",
  Transfer: "primary",
  "Status Change": "warning",
  "No Quantity Change": "neutral",
};

export const MOVEMENT_STATUS_TONE: Record<string, BadgeTone> = {
  Posted: "success",
  Reversed: "danger",
  Cancelled: "neutral",
  Pending: "warning",
};

const MODULE_LABEL: Record<string, string> = {
  "goods-receipt": "Goods Receipt",
  "qc-inspection": "QC Inspection",
  "put-away": "Put Away",
  "sales-order": "Sales Order",
  picking: "Picking",
  shipment: "Shipment",
  "sales-return": "Sales Return",
  "purchase-order": "Purchase Order",
};

/* ---------- Event collection ---------- */

interface Event {
  ts: number;
  type: string;
  qty: number;
  doc: string;
  /**
   * Overrides the module the movement type normally comes from. A receipt
   * that releases its own goods without an inspection still points at the
   * receipt, never at a QC document that does not exist.
   */
  module?: string;
  line: number;
  docStatus: string;
  partner: string;
  warehouse: string;
  fromLoc: string;
  toLoc: string;
  lot: string;
  serial: string;
  user: string;
  reference: string;
}

const whOf = (label: string) => {
  const hit = WAREHOUSES.find(
    (w) => label.startsWith(w.code) || label.includes(w.name),
  );
  return hit ?? WAREHOUSES.find((w) => w.code === "WH-BKK")!;
};

/**
 * Events the ERP can prove happened, read from the line items of documents
 * that already exist. Transfer, Adjustment and Cycle Count have no module
 * yet, so those arrive as synthetic events below and are labelled as such.
 */
function realEvents(product: string): Event[] {
  const out: Event[] = [];
  const pos = STOCK_POSITIONS.filter((r) => r.product === product);
  const home = pos[0];
  const bin = (i: number) => {
    const p = pos[i % Math.max(1, pos.length)];
    return p ? `${p.zone}-${p.rack}-${p.bin}` : "GEN-R1-BULK";
  };

  for (const g of GOODS_RECEIPTS)
    for (const [i, it] of (g.items ?? []).entries()) {
      if (it.code !== product || !(it.receiveNow > 0)) continue;
      out.push({
        ts: parseStamp(g.updated),
        type: "Goods Receipt",
        qty: it.receiveNow,
        doc: g.code,
        line: it.line ?? i + 1,
        docStatus: g.status,
        partner: g.supplier,
        warehouse: g.warehouse,
        fromLoc: "—",
        toLoc: "RECV-DOCK",
        lot: "",
        serial: "",
        user: g.receiver || g.updatedBy,
        reference: g.poRef,
      });

      /* Receipt parks quantity in QC Hold. Goods with a QC document are
         released by that document below; anything not inspected is released
         here, or the hold would grow forever and never match today's figure. */
      const inspected = QC_INSPECTIONS.some(
        (q) => q.grRef === g.code && q.product === product,
      );
      if (!inspected)
        out.push({
          ts: parseStamp(g.updated) + 30_000,
          type: "QC Hold to Available",
          qty: it.receiveNow,
          doc: g.code,
          module: "goods-receipt",
          line: it.line ?? i + 1,
          docStatus: g.status,
          partner: g.supplier,
          warehouse: g.warehouse,
          fromLoc: "RECV-DOCK",
          toLoc: "RECV-DOCK",
          lot: "",
          serial: "",
          user: g.receiver || g.updatedBy,
          reference: g.code,
        });
    }

  for (const q of QC_INSPECTIONS) {
    if (q.product !== product || q.result !== "Pass" || !(q.acceptedQty > 0)) continue;
    out.push({
      ts: parseStamp(q.updated) + 60_000,
      type: "QC Hold to Available",
      qty: q.acceptedQty,
      doc: q.code,
      line: 1,
      docStatus: q.status,
      partner: q.supplier,
      warehouse: q.warehouse,
      fromLoc: "QC-BAY",
      toLoc: "QC-BAY",
      lot: q.lot ?? "",
      serial: q.serial ?? "",
      user: q.inspector || q.updatedBy,
      reference: q.grRef,
    });
  }

  for (const p of PUTAWAY_TASKS)
    for (const [i, it] of (p.items ?? []).entries()) {
      if (it.code !== product) continue;
      out.push({
        ts: parseStamp(p.updated) + 120_000,
        type: "Put Away",
        qty: it.qty ?? 0,
        doc: p.code,
        line: it.line ?? i + 1,
        docStatus: p.status,
        partner: "",
        warehouse: p.warehouse,
        fromLoc: it.curLoc || "RECV-DOCK",
        toLoc: it.destBin || it.suggestBin || bin(i),
        lot: it.lot ?? "",
        serial: it.serial ?? "",
        user: p.assignedTo || p.updatedBy,
        reference: p.grRef,
      });
    }

  for (const so of SALES_ORDERS)
    for (const [i, it] of (so.items ?? []).entries()) {
      if (it.code !== product) continue;
      /* The whole line is reserved when the order is confirmed; picking
         releases it again. Reserving only the undelivered remainder would
         let picking take away a reservation that was never recorded. */
      const ordered = it.qty ?? 0;
      if (!ordered) continue;
      out.push({
        ts: parseStamp(so.updated),
        type: "Available to Reserved",
        qty: ordered,
        doc: so.code,
        line: i + 1,
        docStatus: so.status,
        partner: so.customer,
        warehouse: home?.whLabel ?? "",
        fromLoc: bin(i),
        toLoc: bin(i),
        lot: "",
        serial: "",
        user: so.updatedBy,
        reference: so.customerPo ?? "",
      });
    }

  /** Orders that already went through picking — their shipment only traces. */
  const pickedOrders = new Set(PICKING_TASKS.map((p) => p.soRef));

  for (const p of PICKING_TASKS)
    for (const [i, it] of (p.items ?? []).entries()) {
      if (it.code !== product || !(it.picked > 0)) continue;
      out.push({
        ts: parseStamp(p.updated),
        type: "Picking",
        qty: it.picked,
        doc: p.code,
        line: it.line ?? i + 1,
        docStatus: p.status,
        partner: p.customer,
        warehouse: p.warehouse,
        fromLoc: it.bin || bin(i),
        toLoc: "PACK-STATION",
        lot: it.lot ?? "",
        serial: "",
        user: p.assignedTo || p.updatedBy,
        reference: p.soRef,
      });
    }

  for (const s of SHIPMENTS)
    for (const [i, it] of (s.items ?? []).entries()) {
      if (it.code !== product) continue;
      const qty = it.shipmentQty || it.orderedQty || 0;
      if (!qty) continue;
      /* Picking already took the quantity out; this shipment only records
         that the goods left the site. */
      const traced = pickedOrders.has(s.soRef);
      out.push({
        ts: parseStamp(s.updated),
        type: traced ? "In Transit to Available" : "Shipment",
        qty,
        doc: s.code,
        line: it.line ?? i + 1,
        docStatus: s.status,
        partner: s.customer,
        warehouse: s.warehouse,
        fromLoc: it.bin || "PACK-STATION",
        toLoc: "DISPATCH",
        lot: it.lot ?? "",
        serial: it.serial ?? "",
        user: s.driver || s.updatedBy,
        reference: s.doRef,
      });
    }

  for (const r of SALES_RETURNS)
    for (const [i, it] of (r.items ?? []).entries()) {
      if (it.code !== product) continue;
      if (it.receivedQty > 0)
        out.push({
          ts: parseStamp(r.updated),
          type: "Return Receipt",
          qty: it.receivedQty,
          doc: r.code,
          line: i + 1,
          docStatus: r.status,
          partner: r.customer,
          warehouse: r.receiving?.warehouse ?? "WH-RET Returns",
          fromLoc: "—",
          toLoc: "RET-HOLD",
          lot: "",
          serial: "",
          user: r.receiving?.receiver || r.updatedBy,
          reference: r.invoiceRef || r.soRef,
        });
      if (it.acceptedQty > 0)
        out.push({
          ts: parseStamp(r.updated) + 180_000,
          type: "Return Hold to Available",
          qty: it.acceptedQty,
          doc: r.code,
          line: i + 1,
          docStatus: r.status,
          partner: r.customer,
          warehouse: r.receiving?.warehouse ?? "WH-RET Returns",
          fromLoc: "RET-HOLD",
          toLoc: bin(i),
          lot: "",
          serial: "",
          user: r.updatedBy,
          reference: r.invoiceRef || r.soRef,
        });
    }

  return out;
}

/**
 * Movements for the operations the ERP does not model yet. They are the only
 * invented rows in the ledger, and they are paired so the closing balance is
 * still the one Stock Inquiry reports.
 */
const SYNTHETIC_PLAN: { type: string; share: number }[] = [
  { type: "Transfer Out", share: 0.04 },
  { type: "Transfer In", share: 0.04 },
  { type: "Positive Adjustment", share: 0.02 },
  { type: "Negative Adjustment", share: 0.02 },
  { type: "Count Gain", share: 0.015 },
  { type: "Count Loss", share: 0.015 },
  { type: "Available to Damaged", share: 0.01 },
  { type: "Damaged to Scrap", share: 0.005 },
  { type: "Available to Blocked", share: 0.01 },
  { type: "Blocked to Available", share: 0.01 },
  { type: "Rework Return", share: 0.01 },
  { type: "Supplier Replacement", share: 0.01 },
  { type: "Return to Supplier", share: 0.01 },
  { type: "Service Consumption", share: 0.01 },
  { type: "Location Change", share: 0 },
  { type: "Lot Status Change", share: 0 },
  { type: "Serial Status Change", share: 0 },
  { type: "Cost Revaluation", share: 0 },
];

function syntheticEvents(product: string, rand: () => number): Event[] {
  const pos = STOCK_POSITIONS.filter((r) => r.product === product);
  if (!pos.length) return [];
  const base = productTotals(product).onHand || 100;
  const lots = STOCK_LOTS.filter((l) => l.product === product);
  const serials = STOCK_SERIALS.filter((s) => s.product === product);

  /* Spread across the first eight months of 2026. */
  const start = new Date(2026, 0, 8).getTime();
  const span = 200 * 86_400_000;

  return SYNTHETIC_PLAN.slice(0, MOVEMENT_TARGETS.syntheticPerProduct).map((plan, i) => {
    const p = pos[i % pos.length];
    const qty = plan.share ? Math.max(1, Math.round(base * plan.share)) : 0;
    const ts = start + Math.floor(rand() * span);
    return {
      ts,
      type: plan.type,
      qty,
      doc: "",
      line: 1,
      docStatus: "Posted",
      partner: "",
      warehouse: p.whLabel,
      fromLoc: `${p.zone}-${p.rack}-${p.bin}`,
      toLoc:
        plan.type === "Location Change"
          ? `${p.zone}-${p.rack}-${pos[(i + 1) % pos.length].bin}`
          : `${p.zone}-${p.rack}-${p.bin}`,
      lot: lots.length ? lots[i % lots.length].lot : p.lot,
      serial: serials.length ? serials[i % serials.length].serial : p.serial,
      user: MOVEMENT_USERS[i % MOVEMENT_USERS.length],
      reference: "",
    };
  });
}

/* ---------- Ledger build ---------- */

function buildLedger(): MovementRow[] {
  const rand = rng(MOVEMENT_SEED);
  const rows: MovementRow[] = [];
  let seq = 100;

  for (const p of PRODUCTS) {
    const events = [...realEvents(p.code), ...syntheticEvents(p.code, rand)]
      .filter((e) => MOVEMENT_TYPE_MAP.has(e.type))
      .sort((a, b) => a.ts - b.ts);
    if (!events.length) continue;

    /* Reversal pairs: an original stays posted-but-reversed, and a new row
       carries the opposite effect. Both are in the net, so they cancel. */
    const reversalAt = new Set<number>();
    for (let i = 0; i < MOVEMENT_TARGETS.reversals; i++) {
      const idx = Math.floor(rand() * events.length);
      const e = events[idx];
      if (!e || !e.qty || reversalAt.has(idx)) continue;
      if (MOVEMENT_TYPE_MAP.get(e.type)!.direction === "No Quantity Change") continue;
      reversalAt.add(idx);
    }

    const current = productTotals(p.code);
    const target: StockState = {
      onHand: current.onHand,
      avail: current.available,
      res: current.reserved,
      qc: current.qcHold,
      ret: current.returnHold,
      dmg: current.damaged,
      blk: 0,
    };

    /* Expand reversals into the timeline before the opening is derived. Each
       row carries an id so the reversal can point back at its original after
       the timeline is sorted. */
    interface Planned extends Event {
      id: number;
      reversalOfId?: number;
    }
    let nextId = 0;
    const planned: Planned[] = [];
    events.forEach((e, i) => {
      const id = nextId++;
      planned.push({ ...e, id });
      if (reversalAt.has(i))
        planned.push({ ...e, id: nextId++, reversalOfId: id, ts: e.ts + 3_600_000 });
    });
    const reversed = new Set(
      planned.filter((e) => e.reversalOfId !== undefined).map((e) => e.reversalOfId!),
    );
    planned.sort((a, b) => a.ts - b.ts || a.id - b.id);

    const netOf = () => {
      let net = zeroState();
      for (const e of planned) {
        const def = MOVEMENT_TYPE_MAP.get(e.type)!;
        net = addState(
          net,
          deltaOf(def, e.reversalOfId !== undefined ? -e.qty : e.qty),
        );
      }
      return net;
    };
    let net = netOf();

    let state: StockState = {
      onHand: target.onHand - net.onHand,
      avail: target.avail - net.avail,
      res: target.res - net.res,
      qc: target.qc - net.qc,
      ret: target.ret - net.ret,
      dmg: target.dmg - net.dmg,
      blk: target.blk - net.blk,
    };

    /**
     * An opening balance can be zero but never negative. Shrink the invented
     * rows — never the real documents — until it is not.
     *
     * The opening is deliberately NOT clamped: clamping would break the
     * equation and the closing balance would stop matching Stock Inquiry,
     * which is the one property this module exists to guarantee.
     */
    const negative = (s: StockState) =>
      s.onHand < 0 || s.avail < 0 || s.res < 0 || s.qc < 0 || s.ret < 0 || s.dmg < 0;

    let guard = 0;
    while (negative(state) && guard++ < 60) {
      /* Only rows that stand alone: shrinking half of a reversal pair moves
         nothing, since the pair already nets to zero. */
      const victim = planned
        .filter(
          (e) => !e.doc && e.qty > 0 && e.reversalOfId === undefined && !reversed.has(e.id),
        )
        .sort((a, b) => b.qty - a.qty)[0];
      if (!victim) break;
      victim.qty = Math.floor(victim.qty / 2);
      net = netOf();
      state = {
        onHand: target.onHand - net.onHand,
        avail: target.avail - net.avail,
        res: target.res - net.res,
        qc: target.qc - net.qc,
        ret: target.ret - net.ret,
        dmg: target.dmg - net.dmg,
        blk: target.blk - net.blk,
      };
    }

    const codeOf = () => `MOV-2026-${pad(++seq, 6)}`;
    const byId = new Map<number, MovementRow>();

    for (const e of planned) {
      const def = MOVEMENT_TYPE_MAP.get(e.type)!;
      const qty = e.qty;
      const isReversal = e.reversalOfId !== undefined;
      const d = deltaOf(def, isReversal ? -qty : qty);
      const before = state;
      const after = addState(state, d);

      const wh = whOf(e.warehouse || "");
      const unitCost = Math.round((p.pricing?.avgCost || p.price || 0) * 100) / 100;
      const qtyIn = Math.max(0, d.onHand);
      const qtyOut = Math.max(0, -d.onHand);

      const row: MovementRow = {
        code: codeOf(),
        seq,
        ts: e.ts,
        when: stampOf(e.ts),
        date: stampOf(e.ts).split(" ")[0],
        time: stampOf(e.ts).split(" ")[1],

        product: p.code,
        productName: p.name,
        barcode: p.barcode,
        icon: p.icon,
        cat: p.cat,
        brand: p.brand,
        unit: p.unit,

        type: isReversal ? `${def.type} Reversal` : def.type,
        direction: isReversal ? flipDirection(def.direction) : def.direction,
        group: def.group,

        sourceModule: e.module ?? def.module ?? "",
        sourceModuleLabel: (() => {
          const mod = e.module ?? def.module;
          return mod ? MODULE_LABEL[mod] ?? mod : "Inventory";
        })(),
        sourceDoc: e.doc,
        sourceLine: e.line,
        sourceStatus: e.docStatus,
        partner: e.partner,

        warehouse: wh.code,
        whName: wh.name,
        whLabel: `${wh.code} ${wh.name}`,
        fromLoc: e.fromLoc,
        toLoc: e.toLoc,
        zone: (e.toLoc || "").split("-")[0] ?? "",
        rack: (e.toLoc || "").split("-")[1] ?? "",
        bin: (e.toLoc || "").split("-")[2] ?? "",

        lot: e.lot,
        serial: e.serial,

        qtyIn,
        qtyOut,

        balanceBefore: before.onHand,
        balanceAfter: after.onHand,
        availBefore: before.avail,
        availAfter: after.avail,
        resBefore: before.res,
        resAfter: after.res,
        qcBefore: before.qc,
        qcAfter: after.qc,
        retBefore: before.ret,
        retAfter: after.ret,
        dmgBefore: before.dmg,
        dmgAfter: after.dmg,
        blkBefore: before.blk,
        blkAfter: after.blk,

        statusBefore: isReversal ? def.to ?? "—" : def.from ?? "—",
        statusAfter: isReversal ? def.from ?? "—" : def.to ?? "—",

        unitCost,
        valueIn: Math.round(qtyIn * unitCost * 100) / 100,
        valueOut: Math.round(qtyOut * unitCost * 100) / 100,
        balanceValue: Math.round(after.onHand * unitCost * 100) / 100,
        costingMethod: COSTING_METHODS[0],
        currency: "THB",

        user: e.user || MOVEMENT_USERS[0],
        reference: e.reference,

        status: "Posted",
        reversedBy: "",
        reversalOf: "",
      };

      if (isReversal) {
        const original = byId.get(e.reversalOfId!);
        if (original) {
          original.status = "Reversed";
          original.reversedBy = row.code;
          row.reversalOf = original.code;
        }
      } else {
        byId.set(e.id, row);
      }

      rows.push(row);
      state = after;
    }
  }

  return rows.sort((a, b) => b.ts - a.ts || b.seq - a.seq);
}

const flipDirection = (d: MovementDirection): MovementDirection =>
  d === "In" ? "Out" : d === "Out" ? "In" : d;

export const MOVEMENTS: MovementRow[] = buildLedger();

export const movementRows = () => MOVEMENTS;

export const getMovement = (code: string) =>
  MOVEMENTS.find((m) => m.code === code) ?? null;

/* ---------- Product ledger ---------- */

/** One product's movements, oldest first — the order the balance is built in. */
export const productLedger = (product: string) =>
  MOVEMENTS.filter((m) => m.product === product).sort((a, b) => a.ts - b.ts || a.seq - b.seq);

export interface LedgerSummary {
  opening: number;
  totalIn: number;
  totalOut: number;
  net: number;
  closing: number;
  count: number;
}

export function ledgerSummary(rows: MovementRow[]): LedgerSummary {
  if (!rows.length)
    return { opening: 0, totalIn: 0, totalOut: 0, net: 0, closing: 0, count: 0 };
  const ordered = [...rows].sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  const totalIn = ordered.reduce((t, r) => t + r.qtyIn, 0);
  const totalOut = ordered.reduce((t, r) => t + r.qtyOut, 0);
  return {
    opening: ordered[0].balanceBefore,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    closing: ordered[ordered.length - 1].balanceAfter,
    count: ordered.length,
  };
}

/* ---------- Grouped views ---------- */

export interface WarehouseMovementRow {
  warehouse: string;
  whName: string;
  opening: number;
  inbound: number;
  outbound: number;
  transferIn: number;
  transferOut: number;
  adjustment: number;
  closing: number;
  lastMovement: string;
}

export function movementsByWarehouse(product: string): WarehouseMovementRow[] {
  const map = new Map<string, WarehouseMovementRow>();
  for (const m of productLedger(product)) {
    const hit =
      map.get(m.warehouse) ??
      {
        warehouse: m.warehouse,
        whName: m.whName,
        opening: m.balanceBefore,
        inbound: 0,
        outbound: 0,
        transferIn: 0,
        transferOut: 0,
        adjustment: 0,
        closing: 0,
        lastMovement: "",
      };
    hit.inbound += m.qtyIn;
    hit.outbound += m.qtyOut;
    if (m.type.startsWith("Transfer In")) hit.transferIn += m.qtyIn;
    if (m.type.startsWith("Transfer Out")) hit.transferOut += m.qtyOut;
    if (m.type.includes("Adjustment") || m.type.startsWith("Count")) {
      hit.adjustment += m.qtyIn - m.qtyOut;
    }
    hit.closing = m.balanceAfter;
    hit.lastMovement = m.when;
    map.set(m.warehouse, hit);
  }
  return [...map.values()].sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound));
}

export interface LocationMovementRow {
  location: string;
  warehouse: string;
  movementIn: number;
  movementOut: number;
  currentQty: number;
  lastMovement: string;
  lotCount: number;
  serialCount: number;
}

export function movementsByLocation(product: string): LocationMovementRow[] {
  const map = new Map<string, LocationMovementRow>();
  const touch = (loc: string, wh: string) => {
    if (!loc || loc === "—") return null;
    const key = `${wh}/${loc}`;
    const hit =
      map.get(key) ??
      {
        location: loc,
        warehouse: wh,
        movementIn: 0,
        movementOut: 0,
        currentQty: 0,
        lastMovement: "",
        lotCount: 0,
        serialCount: 0,
      };
    map.set(key, hit);
    return hit;
  };

  const lots = new Map<string, Set<string>>();
  const serials = new Map<string, Set<string>>();

  for (const m of productLedger(product)) {
    const into = touch(m.toLoc, m.warehouse);
    const from = touch(m.fromLoc, m.warehouse);
    if (into) {
      into.movementIn += m.qtyIn;
      into.lastMovement = m.when;
      if (m.lot) (lots.get(into.location) ?? lots.set(into.location, new Set()).get(into.location)!).add(m.lot);
      if (m.serial)
        (serials.get(into.location) ?? serials.set(into.location, new Set()).get(into.location)!).add(
          m.serial,
        );
    }
    if (from && from !== into) {
      from.movementOut += m.qtyOut;
      from.lastMovement = m.when;
    }
  }

  /* Current quantity per bin comes from Stock Inquiry, the module that owns it. */
  for (const p of STOCK_POSITIONS.filter((r) => r.product === product)) {
    const key = `${p.warehouse}/${p.zone}-${p.rack}-${p.bin}`;
    const hit = map.get(key);
    if (hit) hit.currentQty += p.onHand;
  }

  for (const [loc, set] of lots) {
    for (const row of map.values()) if (row.location === loc) row.lotCount = set.size;
  }
  for (const [loc, set] of serials) {
    for (const row of map.values()) if (row.location === loc) row.serialCount = set.size;
  }

  return [...map.values()].sort(
    (a, b) => b.movementIn + b.movementOut - (a.movementIn + a.movementOut),
  );
}

export interface LotMovementRow {
  lot: string;
  mfg: string;
  exp: string;
  warehouse: string;
  location: string;
  opening: number;
  qtyIn: number;
  qtyOut: number;
  closing: number;
  status: string;
  sourceReceipt: string;
  lastMovement: string;
}

export function movementsByLot(product: string): LotMovementRow[] {
  const rows = productLedger(product).filter((m) => m.lot);
  const map = new Map<string, LotMovementRow>();

  for (const m of rows) {
    const meta = STOCK_LOTS.find((l) => l.lot === m.lot);
    const pos = STOCK_POSITIONS.find((p) => p.product === product && p.lot === m.lot);
    const hit =
      map.get(m.lot) ??
      {
        lot: m.lot,
        mfg: meta?.mfg ?? "—",
        exp: meta?.exp ?? "—",
        warehouse: m.warehouse,
        location: pos ? `${pos.zone}-${pos.rack}-${pos.bin}` : m.toLoc,
        opening: 0,
        qtyIn: 0,
        qtyOut: 0,
        closing: 0,
        status: meta?.status ?? "Released",
        sourceReceipt: "",
        lastMovement: "",
      };
    hit.qtyIn += m.qtyIn;
    hit.qtyOut += m.qtyOut;
    if (!hit.sourceReceipt && m.sourceModule === "goods-receipt") hit.sourceReceipt = m.sourceDoc;
    hit.lastMovement = m.when;
    map.set(m.lot, hit);
  }

  for (const row of map.values()) {
    row.closing = STOCK_POSITIONS.filter(
      (p) => p.product === product && p.lot === row.lot,
    ).reduce((t, p) => t + p.onHand, 0);
    row.opening = row.closing - row.qtyIn + row.qtyOut;
  }

  return [...map.values()].sort((a, b) => b.closing - a.closing);
}

export interface SerialMovementRow {
  serial: string;
  product: string;
  productName: string;
  warehouse: string;
  location: string;
  status: string;
  sourceReceipt: string;
  customer: string;
  salesOrder: string;
  shipment: string;
  returnDoc: string;
  lastMovement: string;
}

export function movementsBySerial(product: string): SerialMovementRow[] {
  return STOCK_SERIALS.filter((s) => s.product === product).map((s) => {
    const trail = MOVEMENTS.filter((m) => m.serial === s.serial);
    const pick = (module: string) => trail.find((m) => m.sourceModule === module);
    return {
      serial: s.serial,
      product: s.product,
      productName: s.productName,
      warehouse: s.warehouse,
      location: s.location,
      status: s.status,
      sourceReceipt: pick("goods-receipt")?.sourceDoc ?? "—",
      customer: trail.find((m) => m.partner)?.partner ?? "—",
      salesOrder: pick("sales-order")?.sourceDoc ?? "—",
      shipment: pick("shipment")?.sourceDoc ?? "—",
      returnDoc: pick("sales-return")?.sourceDoc ?? "—",
      lastMovement: trail[0]?.when ?? "—",
    };
  });
}

/** The lifecycle a serialised unit walks through, as far as it has got. */
export function serialTimeline(serial: string) {
  const trail = MOVEMENTS.filter((m) => m.serial === serial).sort((a, b) => a.ts - b.ts);
  return trail.map((m) => ({
    title: m.type,
    detail: m.sourceDoc ? `${m.sourceModuleLabel} ${m.sourceDoc}` : m.whLabel,
    user: m.user,
    when: m.when,
    kind: m.direction === "In" ? "primary" : m.direction === "Out" ? "info" : "warn",
  }));
}

/* ---------- Headline ---------- */

export interface MovementSummary {
  total: number;
  inboundToday: number;
  outboundToday: number;
  transfers: number;
  adjustments: number;
  reservations: number;
  returns: number;
  counts: number;
  netToday: number;
  productsToday: number;
  valueToday: number;
  reversed: number;
  latestDay: number;
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
};

/**
 * "Today" is the most recent day the ledger actually recorded — the mock data
 * spans 2025–2026, so a literal today would read zero on every card.
 */
export function movementSummary(rows: MovementRow[] = MOVEMENTS): MovementSummary {
  const latest = rows.length ? dayKey(Math.max(...rows.map((r) => r.ts))) : 0;
  const today = rows.filter((r) => dayKey(r.ts) === latest);
  const inToday = today.reduce((t, r) => t + r.qtyIn, 0);
  const outToday = today.reduce((t, r) => t + r.qtyOut, 0);

  return {
    total: rows.length,
    inboundToday: inToday,
    outboundToday: outToday,
    transfers: rows.filter((r) => r.type.startsWith("Transfer")).length,
    adjustments: rows.filter(
      (r) => r.type.includes("Adjustment") || r.type === "Scrap",
    ).length,
    reservations: rows.filter((r) => r.type.includes("Reserved")).length,
    returns: rows.filter((r) => r.type.includes("Return")).length,
    counts: rows.filter((r) => r.type.startsWith("Count")).length,
    netToday: inToday - outToday,
    productsToday: new Set(today.map((r) => r.product)).size,
    valueToday:
      Math.round(today.reduce((t, r) => t + r.valueIn - r.valueOut, 0) * 100) / 100,
    reversed: rows.filter((r) => r.status === "Reversed").length,
    latestDay: latest,
  };
}

export const isToday = (r: MovementRow, latest = movementSummary().latestDay) =>
  dayKey(r.ts) === latest;

export const isThisWeek = (r: MovementRow) => {
  const latest = movementSummary().latestDay;
  const ref = MOVEMENTS.find((m) => dayKey(m.ts) === latest)?.ts ?? 0;
  return ref > 0 && ref - r.ts <= 7 * 86_400_000 && r.ts <= ref;
};

/* ---------- Product cards ---------- */

export interface ProductCardRow extends RecordBase {
  code: string;
  name: string;
  barcode: string;
  icon: string;
  cat: string;
  brand: string;
  unit: string;
  onHand: number;
  available: number;
  reserved: number;
  qcHold: number;
  returnHold: number;
  damaged: number;
  movements: number;
  totalIn: number;
  totalOut: number;
  lastMovement: string;
  lastType: string;
}

/** One row per product — the entry point to a full stock card. */
export const PRODUCT_CARDS: ProductCardRow[] = PRODUCTS.map((p) => {
  const ledger = productLedger(p.code);
  const s = ledgerSummary(ledger);
  const t = productTotals(p.code);
  const last = ledger[ledger.length - 1];
  return {
    code: p.code,
    name: p.name,
    barcode: p.barcode,
    icon: p.icon,
    cat: p.cat,
    brand: p.brand,
    unit: p.unit,
    onHand: t.onHand,
    available: t.available,
    reserved: t.reserved,
    qcHold: t.qcHold,
    returnHold: t.returnHold,
    damaged: t.damaged,
    movements: s.count,
    totalIn: s.totalIn,
    totalOut: s.totalOut,
    lastMovement: last?.when ?? "—",
    lastType: last?.type ?? "—",
  };
});

export const productCards = () => PRODUCT_CARDS;

export const getProductCard = (code: string) =>
  PRODUCT_CARDS.find((p) => p.code === code) ?? null;

/** Reservations and incoming come from Stock Inquiry — one source, not two. */
export const cardReservations = productReservations;
export const cardIncoming = productIncoming;
