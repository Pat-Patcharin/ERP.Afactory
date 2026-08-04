import {
  ALERT_WAREHOUSE,
  EMPTY_HOLD,
  INV_HEALTH_MOCK,
  INV_OPS,
  INV_TRENDS,
  WH_HOLDS,
  type InvHealthMetric,
} from "@/data/inventory";
import type { BadgeTone } from "@/lib/types";
import { PRODUCTS, productStock, stockedProducts } from "./product";
import { WAREHOUSES } from "./warehouse";
import { GOODS_RECEIPTS, QC_INSPECTIONS, PUTAWAY_TASKS } from "./inbound";
import { PICKING_TASKS, PACKING_TASKS } from "./outbound";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";

/* ============================================================
   INVENTORY — the read model behind the Warehouse Command Center.

   Inventory owns no documents of its own. It is the operational
   center where Inbound (receipt → QC → put away) hands stock over
   to Outbound (picking → packing → shipment), and where returns
   come back. So every figure here is DERIVED from the documents
   those modules already own — nothing is a second copy of the
   truth that could drift from them. What genuinely has no source
   yet comes from data/inventory.ts and is marked as declared.

   One data caveat, left deliberately visible rather than papered
   over: documents carry the warehouse as a free-text label
   ("WH01 Main Warehouse") whose codes predate the warehouse
   master ("WH-BKK"). Per-warehouse figures therefore come from the
   warehouse master's own inventory block, and document rows show
   the label they actually carry. Reconciling the two is a master
   data job, not a workspace job.
   ============================================================ */

/** Statuses that take a document out of the live pipeline, per module. */
const CLOSED_GR = ["Completed", "Cancelled"];
const CLOSED_QC = ["Completed", "Cancelled"];
const CLOSED_PA = ["Completed", "Cancelled"];
const CLOSED_PICK = ["Completed", "Cancelled"];
const CLOSED_PACK = ["Completed", "Cancelled"];
const CLOSED_SHP = ["Delivered", "Cancelled", "Returned"];
const CLOSED_RTN = ["Closed", "Cancelled", "Rejected", "Credited"];

export const openGoodsReceipts = () =>
  GOODS_RECEIPTS.filter((g) => !CLOSED_GR.includes(g.status));
export const openInspections = () =>
  QC_INSPECTIONS.filter((q) => !CLOSED_QC.includes(q.status));
export const openPutAways = () =>
  PUTAWAY_TASKS.filter((p) => !CLOSED_PA.includes(p.status));
export const openPickings = () =>
  PICKING_TASKS.filter((p) => !CLOSED_PICK.includes(p.status));
export const openPackings = () =>
  PACKING_TASKS.filter((p) => !CLOSED_PACK.includes(p.status));
export const openShipments = () =>
  SHIPMENTS.filter((s) => !CLOSED_SHP.includes(s.status));
export const openReturns = () =>
  SALES_RETURNS.filter((r) => !CLOSED_RTN.includes(r.status));

const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

/**
 * Audit stamps are "dd/mm/yyyy HH:mm" but the mock data mixes AD and BE
 * years across modules. Normalise both so the activity feed sorts as one
 * timeline; used for ordering only, never for display.
 */
export function parseStamp(v: string | undefined): number {
  if (!v) return 0;
  const [date, time = "00:00"] = String(v).trim().split(" ");
  const [d, m, y] = date.split("/").map(Number);
  if (!d || !m || !y) return 0;
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y > 2400 ? y - 543 : y, m - 1, d, hh || 0, mm || 0).getTime();
}

/** Days from today to a dd/mm/yyyy expiry, BE years included. */
function daysTo(v: string | undefined): number | null {
  const t = parseStamp(v);
  return t ? Math.ceil((t - Date.now()) / 86_400_000) : null;
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
};

/**
 * How many documents moved on the module's most recent active day.
 *
 * The mock data was authored across 2025–2026, so a literal "today" would
 * read zero on every stage. The workspace reports the last day the module
 * actually worked, which is the operational question a warehouse asks.
 */
function lastDayCount<T>(rows: T[], ts: (r: T) => number): number {
  const stamps = rows.map(ts).filter(Boolean);
  if (!stamps.length) return 0;
  const latest = dayKey(Math.max(...stamps));
  return stamps.filter((s) => dayKey(s) === latest).length;
}

/* ---------- Stock health, product side ---------- */

export interface StockHealthRow {
  code: string;
  name: string;
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
  projected: number;
  onOrder: number;
  rop: number;
  suggested: number;
  status: string;
  tone: BadgeTone;
  /** Available stock valued at the selling price — an indicative figure. */
  value: number;
  whCount: number;
  topWh: string;
}

/** Every product's stock position, worst first. The ROP maths lives in
 *  productStock() so the workspace and the product module always agree. */
export function invStockHealth(): StockHealthRow[] {
  const rank: Record<string, number> = {
    Critical: 0,
    "Below ROP": 1,
    Watch: 2,
    Healthy: 3,
  };

  /* Stocked products only. The price list master contributes hundreds of
     catalogue rows the warehouse has never held; listing them here would
     read as "out of stock" when the truth is "no stock record yet". */
  return stockedProducts().map((p) => {
    const s = productStock(p.code)!;
    const stocks = p.stocks ?? [];
    const top = [...stocks].sort((a, b) => b.avail - a.avail)[0];
    return {
      code: s.code,
      name: s.name,
      unit: s.unit,
      onHand: s.onHand,
      reserved: s.reserved,
      available: s.available,
      projected: s.projected,
      onOrder: s.onOrder,
      rop: s.rop,
      suggested: s.suggested,
      status: s.status,
      tone: s.tone as BadgeTone,
      value: s.available * (s.price || 0),
      whCount: stocks.length,
      topWh: top?.wh ?? "",
    };
  }).sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      a.available - b.available,
  );
}

/* ---------- Lot expiry ---------- */

export interface LotAlertRow {
  productCode: string;
  product: string;
  lot: string;
  exp: string;
  wh: string;
  loc: string;
  qty: number;
  days: number;
  kind: "Expired" | "Near Expiry";
}

/** Lots already expired or expiring inside the window, soonest first. */
export function invLotAlerts(withinDays = 180): LotAlertRow[] {
  const rows: LotAlertRow[] = [];
  for (const p of PRODUCTS) {
    for (const s of p.stocks ?? []) {
      if (!s.lot || s.lot === "—" || !s.exp) continue;
      const days = daysTo(s.exp);
      if (days === null || days > withinDays) continue;
      rows.push({
        productCode: p.code,
        product: p.name,
        lot: s.lot,
        exp: s.exp,
        wh: s.wh,
        loc: s.loc,
        qty: s.avail,
        days,
        kind: days < 0 ? "Expired" : "Near Expiry",
      });
    }
  }
  return rows.sort((a, b) => a.days - b.days);
}

/** Lot-tracked products holding stock that carries no lot number. */
export function invMissingLot(): number {
  return PRODUCTS.filter(
    (p) =>
      p.detail?.lotTracked &&
      (p.stocks ?? []).some((s) => s.avail > 0 && (!s.lot || s.lot === "—")),
  ).length;
}

/* ---------- Headline snapshot ---------- */

export interface InvSnapshot {
  warehouses: number;
  bins: number;
  skus: number;
  onHand: number;
  reserved: number;
  available: number;
  value: number;
  util: number;
  pendingIn: number;
  pendingOut: number;
  qcHold: number;
  returnHold: number;
  inTransit: number;
  pendingCount: number;
  outOfStock: number;
  negative: number;
  belowRop: number;
  watch: number;
  healthy: number;
  lotsExpired: number;
  lotsNearExpiry: number;
  expiredProducts: number;
  inboundDocs: number;
  outboundDocs: number;
  /** Documents and quantity moved on the most recent active day. */
  movementDocs: number;
  movementQty: number;
}

export function invSnapshot(): InvSnapshot {
  const active = WAREHOUSES.filter((w) => w.status === "Active");
  const health = invStockHealth();
  const lots = invLotAlerts();
  const holds = active.map((w) => WH_HOLDS[w.code] ?? EMPTY_HOLD);

  const capacity = sum(active, (w) => w.rules?.maxCap ?? 0);
  const used = sum(active, (w) => w.rules?.curCap ?? 0);

  const feed = invMovementFeed();
  const latestDay = feed.length ? dayKey(Math.max(...feed.map((r) => r.ts))) : 0;
  const onLatest = feed.filter((r) => dayKey(r.ts) === latestDay);

  return {
    warehouses: active.length,
    bins: sum(active, (w) => w.binCount),
    skus: stockedProducts().length,
    onHand: sum(active, (w) => w.inv.qty),
    reserved: sum(active, (w) => w.inv.reserved),
    available: sum(active, (w) => w.inv.available),
    value: sum(active, (w) => w.inv.value),
    util: capacity > 0 ? Math.round((used / capacity) * 100) : 0,
    pendingIn: sum(active, (w) => w.inv.pendingIn),
    pendingOut: sum(active, (w) => w.inv.pendingOut),
    qcHold: sum(holds, (h) => h.qcHold),
    returnHold: sum(holds, (h) => h.returnHold),
    inTransit: sum(holds, (h) => h.transit),
    pendingCount: sum(holds, (h) => h.pendingCount),
    outOfStock: health.filter((h) => h.available <= 0).length,
    negative: health.filter((h) => h.available < 0).length,
    belowRop: health.filter((h) => h.available > 0 && h.available <= h.rop)
      .length,
    watch: health.filter((h) => h.status === "Watch").length,
    healthy: health.filter((h) => h.status === "Healthy").length,
    lotsExpired: lots.filter((l) => l.kind === "Expired").length,
    lotsNearExpiry: lots.filter((l) => l.kind === "Near Expiry").length,
    expiredProducts: new Set(
      lots.filter((l) => l.kind === "Expired").map((l) => l.productCode),
    ).size,
    inboundDocs:
      openGoodsReceipts().length + openInspections().length + openPutAways().length,
    outboundDocs:
      openPickings().length + openPackings().length + openShipments().length,
    movementDocs: onLatest.length,
    movementQty: sum(onLatest, (r) => r.qty),
  };
}

/* ---------- KPI dashboard ---------- */

export interface InvKpi {
  key: string;
  icon: string;
  value: string;
  unit?: string;
  title: string;
  desc: string;
  /** Percentage change against the previous period — declared, see data/inventory.ts. */
  delta: number;
  points: number[];
  goto: string;
  tone: string;
}

const fmtInt = (n: number) => n.toLocaleString("en-US");

const compactBaht = (n: number) =>
  n >= 1_000_000
    ? `฿${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `฿${Math.round(n / 1_000)}K`
      : `฿${fmtInt(n)}`;

/** The twelve headline figures a warehouse manager opens the day with. */
export function invKpis(): InvKpi[] {
  const s = invSnapshot();
  const t = (key: string) => INV_TRENDS[key] ?? { delta: 0, points: [] };

  const rows: [string, string, string, string | undefined, string, string, string, string][] = [
    ["onHand", "box", fmtInt(s.onHand), "ชิ้น", "Stock On Hand", `${fmtInt(s.skus)} SKU ใน ${s.warehouses} คลัง`, "Stock Inquiry", "info"],
    ["available", "checkCircle", fmtInt(s.available), "ชิ้น", "Available Stock", `พร้อมขายทันที ${Math.round((s.available / (s.onHand || 1)) * 100)}% ของสต๊อก`, "Stock Inquiry", "success"],
    ["reserved", "lock", fmtInt(s.reserved), "ชิ้น", "Reserved Stock", `กันไว้ให้ ${s.outboundDocs} งานฝั่งจ่ายออก`, "Sales Order", "warning"],
    ["qcHold", "shield", fmtInt(s.qcHold), "ชิ้น", "QC Hold", `รอผลตรวจ ${openInspections().length} ใบ`, "QC Inspection", "danger"],
    ["returnHold", "return", fmtInt(s.returnHold), "ชิ้น", "Return Hold", `ของคืน ${openReturns().length} ใบยังไม่คืนสู่สต๊อก`, "Sales Return", "warning"],
    ["inTransit", "truck", fmtInt(s.inTransit), "ชิ้น", "In Transit", `ระหว่างขนย้าย ${openShipments().length} เที่ยว`, "Stock Transfer", "info"],
    ["lowStock", "alert", String(s.belowRop), "SKU", "Low Stock Items", `เฝ้าระวังอีก ${s.watch} SKU ใกล้ถึงจุดสั่งซื้อ`, "Stock Inquiry", "warning"],
    ["outOfStock", "xCircle", String(s.outOfStock), "SKU", "Out of Stock Items", `รอเข้า ${fmtInt(s.pendingIn)} ชิ้นจากงานรับเข้า`, "Stock Inquiry", "danger"],
    ["nearExpiry", "calendar", String(s.lotsNearExpiry), "Lot", "Near Expiry", `หมดอายุแล้วอีก ${s.lotsExpired} Lot`, "Lot Tracking", "warning"],
    ["movement", "sort", fmtInt(s.movementQty), "ชิ้น", "Today's Movement", `${s.movementDocs} เอกสารในวันทำการล่าสุด`, "Stock Card", "info"],
    ["value", "pricing", compactBaht(s.value), undefined, "Inventory Value", `มูลค่ารวมของ ${s.warehouses} คลังที่เปิดใช้งาน`, "Inventory Reports", "success"],
    ["pendingCount", "barcode", String(s.pendingCount), "ใบ", "Pending Stock Count", `นับสต๊อกค้างใน ${Object.values(WH_HOLDS).filter((h) => h.pendingCount > 0).length} คลัง`, "Cycle Count", "info"],
  ];

  return rows.map(([key, icon, value, unit, title, desc, goto, tone]) => ({
    key,
    icon,
    value,
    unit,
    title,
    desc,
    delta: t(key).delta,
    points: t(key).points,
    goto,
    tone,
  }));
}

/* ---------- Warehouse operations pipeline ---------- */

export interface InvStage {
  key: string;
  label: string;
  icon: string;
  /** Quantity waiting at this stage. */
  pending: number;
  /** Documents worked on the module's most recent active day. */
  today: number;
  /** How the backlog reads: Clear / Normal / Backlog. */
  badge: string;
  badgeTone: BadgeTone;
  caption: string;
  goto: string;
  tone: string;
}

/** Backlog wording shared by every stage, so one bar means one thing. */
function stageBadge(pending: number, busyAt: number): [string, BadgeTone] {
  if (pending <= 0) return ["Clear", "success"];
  if (pending < busyAt) return ["Normal", "info"];
  return ["Backlog", "warning"];
}

/**
 * The physical journey of stock through the warehouse, in the order the
 * spec names it: receipt puts stock in, adjustment corrects what is left.
 */
export function invPipeline(): InvStage[] {
  const gr = openGoodsReceipts();
  const pa = openPutAways();
  const pick = openPickings();
  const shp = openShipments();
  const rtn = openReturns();
  const s = invSnapshot();

  const build = (
    key: string,
    label: string,
    icon: string,
    pending: number,
    today: number,
    busyAt: number,
    caption: string,
    goto: string,
    tone: string,
  ): InvStage => {
    const [badge, badgeTone] = stageBadge(pending, busyAt);
    return { key, label, icon, pending, today, badge, badgeTone, caption, goto, tone };
  };

  return [
    build(
      "gr",
      "Goods Receipt",
      "goodsReceipt",
      sum(gr, (g) => g.totalReceiving),
      lastDayCount(GOODS_RECEIPTS, (g) => parseStamp(g.updated)),
      500,
      "รอรับเข้า",
      "Goods Receipt",
      "info",
    ),
    build(
      "pa",
      "Put Away",
      "putAway",
      sum(pa, (p) => p.remainingQty),
      lastDayCount(PUTAWAY_TASKS, (p) => parseStamp(p.updated)),
      300,
      "รอจัดเก็บเข้าบิน",
      "Put Away",
      "warning",
    ),
    build(
      "available",
      "Available Stock",
      "checkCircle",
      s.available,
      s.skus,
      Number.MAX_SAFE_INTEGER,
      "พร้อมขาย",
      "Stock Inquiry",
      "success",
    ),
    build(
      "reserved",
      "Reserved",
      "lock",
      s.reserved,
      s.outboundDocs,
      Number.MAX_SAFE_INTEGER,
      "ถูกจองแล้ว",
      "Sales Order",
      "warning",
    ),
    build(
      "pick",
      "Picking",
      "picking",
      sum(pick, (p) => Math.max(0, p.orderedQty - p.pickedQty)),
      lastDayCount(PICKING_TASKS, (p) => parseStamp(p.updated)),
      200,
      "รอจัดของ",
      "Picking",
      "info",
    ),
    build(
      "shp",
      "Shipment",
      "truck",
      sum(shp, (x) => x.remainingQty),
      lastDayCount(SHIPMENTS, (x) => parseStamp(x.updated)),
      400,
      "รอจัดส่ง",
      "Shipment",
      "info",
    ),
    build(
      "rtn",
      "Sales Return",
      "return",
      sum(rtn, (r) => r.pendingQty),
      lastDayCount(SALES_RETURNS, (r) => parseStamp(r.updated)),
      100,
      "รอรับคืน",
      "Sales Return",
      "danger",
    ),
    build(
      "adj",
      "Adjustment",
      "sliders",
      INV_OPS.pendingAdjustmentQty,
      INV_OPS.adjustmentToday,
      200,
      "รอปรับปรุงยอด",
      "Stock Adjustment",
      "warning",
    ),
  ];
}

/* ---------- Warehouse alerts ---------- */

export interface InvAlert {
  key: string;
  icon: string;
  count: number;
  unit: string;
  title: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  warehouse: string;
  action: string;
  goto: string;
  tone: string;
}

/**
 * What the warehouse must act on, ordered by how quickly the problem turns
 * into a stockout, a write-off, or a late delivery.
 */
export function invAlerts(): InvAlert[] {
  const s = invSnapshot();
  const lots = invLotAlerts();
  const qcWaiting = openInspections().filter(
    (q) => q.status === "Waiting" || q.status === "Hold" || q.result === "Fail",
  ).length;
  const rtnWaiting = openReturns().filter(
    (r) => r.holdQty > 0 || r.status === "Pending QC" || r.status === "Received",
  ).length;

  /** The warehouse a derived alert points at — whichever holds the most of it. */
  const topWh = (rows: { wh: string }[]) => {
    const tally = new Map<string, number>();
    for (const r of rows) tally.set(r.wh, (tally.get(r.wh) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "ทุกคลัง";
  };

  const alerts: InvAlert[] = [
    {
      key: "lowStock",
      icon: "alert",
      count: s.belowRop,
      unit: "SKU",
      title: "Low Stock",
      priority: "High",
      warehouse: topWh(invStockHealth().filter((h) => h.available > 0 && h.available <= h.rop).map((h) => ({ wh: h.topWh }))),
      action: "สร้างใบขอซื้อ",
      goto: "Purchase Request",
      tone: "warning",
    },
    {
      key: "negative",
      icon: "xCircle",
      count: s.negative,
      unit: "SKU",
      title: "Negative Stock",
      priority: "Critical",
      warehouse: "ทุกคลัง",
      action: "ปรับปรุงยอด",
      goto: "Stock Adjustment",
      tone: "danger",
    },
    {
      key: "qcHold",
      icon: "shield",
      count: qcWaiting,
      unit: "ใบ",
      title: "QC Hold Waiting",
      priority: "Critical",
      warehouse: "WH-QTY Quarantine",
      action: "ไปที่ QC",
      goto: "QC Inspection",
      tone: "danger",
    },
    {
      key: "returnQc",
      icon: "return",
      count: rtnWaiting,
      unit: "ใบ",
      title: "Return Waiting QC",
      priority: "High",
      warehouse: "WH-RET Returns",
      action: "ตรวจของคืน",
      goto: "Sales Return",
      tone: "warning",
    },
    {
      key: "transfer",
      icon: "truck",
      count: INV_OPS.pendingTransfer,
      unit: "ใบ",
      title: "Pending Transfer",
      priority: "Medium",
      warehouse: ALERT_WAREHOUSE.pendingTransfer,
      action: "ดูใบโอนย้าย",
      goto: "Stock Transfer",
      tone: "info",
    },
    {
      key: "adjustment",
      icon: "sliders",
      count: INV_OPS.pendingAdjustment,
      unit: "ใบ",
      title: "Pending Adjustment",
      priority: "Medium",
      warehouse: ALERT_WAREHOUSE.pendingAdjustment,
      action: "อนุมัติการปรับ",
      goto: "Stock Adjustment",
      tone: "info",
    },
    {
      key: "cycleCount",
      icon: "barcode",
      count: INV_OPS.pendingCycleCount,
      unit: "ใบ",
      title: "Pending Cycle Count",
      priority: "Medium",
      warehouse: ALERT_WAREHOUSE.pendingCycleCount,
      action: "เริ่มนับสต๊อก",
      goto: "Cycle Count",
      tone: "info",
    },
    {
      key: "nearExpiry",
      icon: "calendar",
      count: s.lotsNearExpiry,
      unit: "Lot",
      title: "Near Expiry",
      priority: "High",
      warehouse: topWh(lots.filter((l) => l.kind === "Near Expiry")),
      action: "เร่งระบาย",
      goto: "Lot Tracking",
      tone: "warning",
    },
    {
      key: "expired",
      icon: "clock",
      count: s.lotsExpired,
      unit: "Lot",
      title: "Expired Products",
      priority: "Critical",
      warehouse: topWh(lots.filter((l) => l.kind === "Expired")),
      action: "ตัดออกจากสต๊อก",
      goto: "Stock Adjustment",
      tone: "danger",
    },
    {
      key: "missingSerial",
      icon: "barcode",
      count: INV_OPS.missingSerial,
      unit: "รายการ",
      title: "Missing Serial",
      priority: "Low",
      warehouse: ALERT_WAREHOUSE.missingSerial,
      action: "บันทึก Serial",
      goto: "Serial Tracking",
      tone: "info",
    },
    {
      key: "missingLot",
      icon: "layers",
      count: invMissingLot(),
      unit: "SKU",
      title: "Missing Lot",
      priority: "Medium",
      warehouse: "ทุกคลัง",
      action: "บันทึก Lot",
      goto: "Lot Tracking",
      tone: "warning",
    },
    {
      key: "damaged",
      icon: "trash",
      count: INV_OPS.damagedStock,
      unit: "ชิ้น",
      title: "Damaged Stock",
      priority: "High",
      warehouse: ALERT_WAREHOUSE.damagedStock,
      action: "ตั้งเรื่องเคลม",
      goto: "Stock Adjustment",
      tone: "warning",
    },
  ];

  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return alerts.sort(
    (a, b) => rank[a.priority] - rank[b.priority] || b.count - a.count,
  );
}

/* ---------- Recent inventory activities ---------- */

export interface InvActivityRow {
  ts: number;
  when: string;
  /** Clock only — the timeline rail already groups by document. */
  time: string;
  date: string;
  doc: string;
  ref: string;
  kind: string;
  icon: string;
  dir: "In" | "Out" | "Hold";
  qty: number;
  warehouse: string;
  user: string;
  status: string;
  goto: string;
}

/** Every stock movement any module recorded, newest first. */
export function invMovementFeed(): InvActivityRow[] {
  const rows: InvActivityRow[] = [];

  const push = (
    stamp: string,
    doc: string,
    ref: string,
    kind: string,
    icon: string,
    dir: InvActivityRow["dir"],
    qty: number,
    warehouse: string,
    user: string,
    status: string,
    goto: string,
  ) => {
    const [date, time = ""] = String(stamp ?? "").trim().split(" ");
    rows.push({
      ts: parseStamp(stamp),
      when: stamp,
      time,
      date,
      doc,
      ref,
      kind,
      icon,
      dir,
      qty,
      warehouse,
      user,
      status,
      goto,
    });
  };

  for (const g of GOODS_RECEIPTS)
    push(g.updated, g.code, g.poRef, "Goods Receipt", "goodsReceipt", "In", g.totalReceiving, g.warehouse, g.receiver || g.updatedBy, g.status, "Goods Receipt");

  for (const q of QC_INSPECTIONS)
    push(q.updated, q.code, q.grRef, "QC Inspection", "qc", q.result === "Pass" ? "In" : "Hold", q.receivedQty, q.warehouse, q.inspector || q.updatedBy, q.status, "QC Inspection");

  for (const p of PUTAWAY_TASKS)
    push(p.updated, p.code, p.grRef, "Put Away", "putAway", "In", p.completedQty || p.totalQty, p.warehouse, p.assignedTo || p.updatedBy, p.status, "Put Away");

  for (const p of PICKING_TASKS)
    push(p.updated, p.code, p.soRef, "Picking", "picking", "Out", p.pickedQty || p.orderedQty, p.warehouse, p.assignedTo || p.updatedBy, p.status, "Picking");

  for (const p of PACKING_TASKS)
    push(p.updated, p.code, p.pickRef, "Packing", "packing", "Out", p.packedQty || p.totalQty, p.warehouse, p.packer || p.updatedBy, p.status, "Packing");

  for (const x of SHIPMENTS)
    push(x.updated, x.code, x.doRef, "Shipment", "truck", "Out", x.totalQty, x.warehouse, x.driver || x.updatedBy, x.status, "Shipment");

  for (const r of SALES_RETURNS) {
    if (!r.receivedQty) continue;
    push(r.updated, r.code, r.invoiceRef || r.soRef, "Sales Return", "return", r.acceptedQty > 0 ? "In" : "Hold", r.receivedQty, r.receiving?.warehouse ?? "", r.receiving?.receiver || r.updatedBy, r.status, "Sales Return");
  }

  return rows.sort((a, b) => b.ts - a.ts);
}

/**
 * The timeline the workspace shows. Direction is the warehouse's point of
 * view: In adds, Out removes, Hold is quantity present but not sellable.
 *
 * Selection is round-robin by module before it is strict recency: the busiest
 * module would otherwise fill the whole feed and hide the rest of the
 * warehouse, which is the one thing a command center must not do.
 */
export function invActivities(limit = 20): InvActivityRow[] {
  const byKind = new Map<string, InvActivityRow[]>();
  for (const r of invMovementFeed()) {
    const bucket = byKind.get(r.kind);
    if (bucket) bucket.push(r);
    else byKind.set(r.kind, [r]);
  }

  const picked: InvActivityRow[] = [];
  const queues = [...byKind.values()];
  for (let round = 0; picked.length < limit; round++) {
    const before = picked.length;
    for (const q of queues) {
      if (picked.length >= limit) break;
      if (q[round]) picked.push(q[round]);
    }
    if (picked.length === before) break;
  }

  return picked.sort((a, b) => b.ts - a.ts);
}

/* ---------- Warehouse overview ---------- */

export interface WhOverviewRow {
  code: string;
  name: string;
  type: string;
  status: string;
  sku: number;
  qty: number;
  reserved: number;
  available: number;
  value: number;
  qcHold: number;
  returnHold: number;
  transit: number;
  pendingCount: number;
  util: number;
  bins: number;
  /** Share of the group's total value — how much of the business sits here. */
  share: number;
  tone: BadgeTone;
}

/**
 * Stock by warehouse, biggest holding first. Quantity, value and utilisation
 * come from the warehouse master; the hold columns are Inventory's own
 * overlay because the master does not model them yet.
 */
export function invWarehouseOverview(): WhOverviewRow[] {
  const active = WAREHOUSES.filter((w) => w.status === "Active");
  const total = sum(active, (w) => w.inv.value) || 1;

  return active
    .map((w) => {
      const h = WH_HOLDS[w.code] ?? EMPTY_HOLD;
      return {
        code: w.code,
        name: w.name,
        type: w.type,
        status: w.status,
        sku: w.inv.sku,
        qty: w.inv.qty,
        reserved: w.inv.reserved,
        available: w.inv.available,
        value: w.inv.value,
        qcHold: h.qcHold,
        returnHold: h.returnHold,
        transit: h.transit,
        pendingCount: h.pendingCount,
        util: w.util,
        bins: w.binCount,
        share: Math.round((w.inv.value / total) * 100),
        tone: (w.util >= 90
          ? "danger"
          : w.util >= 75
            ? "warning"
            : "success") as BadgeTone,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/* ---------- Inventory health ---------- */

/**
 * Eight health gauges. Accuracy, turnover and movement class are declared —
 * they need a costing and history engine Phase 2 has not built. The expiry
 * and negative-stock gauges are real.
 */
export function invHealth(): InvHealthMetric[] {
  const s = invSnapshot();
  const m = INV_HEALTH_MOCK;
  const skus = s.skus || 1;
  /** A gauge is a share of a whole — a mock can never push it past full. */
  const gauge = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

  return [
    {
      key: "accuracy",
      title: "Stock Accuracy",
      value: `${m.stockAccuracy}%`,
      pct: gauge(m.stockAccuracy),
      target: `เป้าหมาย ${m.accuracyTarget}%`,
      desc: "ผลนับสต๊อกตรงกับระบบ",
      icon: "checkCircle",
      tone: m.stockAccuracy >= m.accuracyTarget ? "success" : "warning",
      goto: "Cycle Count",
    },
    {
      key: "turnover",
      title: "Inventory Turnover",
      value: `${m.turnover}x`,
      pct: gauge((m.turnover / m.turnoverTarget) * 100),
      target: `เป้าหมาย ${m.turnoverTarget}x ต่อปี`,
      desc: "รอบการหมุนเวียนสต๊อก",
      icon: "refresh",
      tone: m.turnover >= m.turnoverTarget ? "success" : "warning",
      goto: "Inventory Reports",
    },
    {
      key: "days",
      title: "Average Days in Stock",
      value: `${m.avgDaysInStock} วัน`,
      pct: gauge((m.avgDaysTarget / m.avgDaysInStock) * 100),
      target: `เป้าหมาย ${m.avgDaysTarget} วัน`,
      desc: "ยิ่งสั้นยิ่งดี",
      icon: "clock",
      tone: m.avgDaysInStock <= m.avgDaysTarget ? "success" : "warning",
      goto: "Inventory Reports",
    },
    {
      key: "expired",
      title: "Expired Products",
      value: `${s.expiredProducts} SKU`,
      pct: gauge((s.expiredProducts / skus) * 100),
      target: `${s.lotsExpired} Lot หมดอายุ`,
      desc: "ต้องตัดออกจากสต๊อก",
      icon: "trash",
      tone: s.expiredProducts > 0 ? "danger" : "success",
      goto: "Lot Tracking",
    },
    {
      key: "nearExpiry",
      title: "Near Expiry",
      value: `${s.lotsNearExpiry} Lot`,
      pct: gauge((s.lotsNearExpiry / Math.max(1, s.lotsNearExpiry + s.healthy)) * 100),
      target: "ภายใน 180 วัน",
      desc: "ควรเร่งระบายก่อนหมดอายุ",
      icon: "calendar",
      tone: s.lotsNearExpiry > 0 ? "warning" : "success",
      goto: "Lot Tracking",
    },
    {
      key: "negative",
      title: "Negative Inventory",
      value: `${s.negative} SKU`,
      pct: gauge((s.negative / skus) * 100),
      target: "ต้องเป็นศูนย์เสมอ",
      desc: "ยอดติดลบต้องปรับปรุงทันที",
      icon: "alert",
      tone: s.negative > 0 ? "danger" : "success",
      goto: "Stock Adjustment",
    },
    {
      key: "slow",
      title: "Slow Moving",
      value: `${m.slowMoving} SKU`,
      pct: gauge((m.slowMoving / skus) * 100),
      target: "ไม่เคลื่อนไหวเกิน 90 วัน",
      desc: "จมทุนอยู่ในคลัง",
      icon: "arrowDown",
      tone: "warning",
      goto: "Inventory Reports",
    },
    {
      key: "fast",
      title: "Fast Moving",
      value: `${m.fastMoving} SKU`,
      pct: gauge((m.fastMoving / skus) * 100),
      target: "หมุนเวียนสูงสุด",
      desc: "ต้องคุมไม่ให้ขาด",
      icon: "trend",
      tone: "success",
      goto: "Inventory Reports",
    },
  ];
}

/* ---------- Shortcut panels ---------- */

export interface InvShortcut {
  key: string;
  title: string;
  icon: string;
  count: number;
  unit: string;
  desc: string;
  goto: string;
  tone: string;
}

/** Everything queued against Inventory, each one click from its module. */
export function invShortcuts(): InvShortcut[] {
  const pa = openPutAways();
  const qc = openInspections();
  const rtn = openReturns();

  return [
    {
      key: "transfer",
      title: "Pending Transfers",
      icon: "truck",
      count: INV_OPS.pendingTransfer,
      unit: "ใบ",
      desc: `${fmtInt(INV_OPS.pendingTransferQty)} ชิ้นรอโอนย้าย`,
      goto: "Stock Transfer",
      tone: "info",
    },
    {
      key: "adjustment",
      title: "Pending Adjustments",
      icon: "sliders",
      count: INV_OPS.pendingAdjustment,
      unit: "ใบ",
      desc: `${fmtInt(INV_OPS.pendingAdjustmentQty)} ชิ้นรออนุมัติ`,
      goto: "Stock Adjustment",
      tone: "warning",
    },
    {
      key: "count",
      title: "Pending Counts",
      icon: "barcode",
      count: INV_OPS.pendingCycleCount,
      unit: "ใบ",
      desc: "ใบนับสต๊อกที่ยังไม่ปิด",
      goto: "Cycle Count",
      tone: "info",
    },
    {
      key: "qc",
      title: "Pending QC",
      icon: "shield",
      count: qc.length,
      unit: "ใบ",
      desc: `${fmtInt(sum(qc, (q) => q.receivedQty))} ชิ้นรอผลตรวจ`,
      goto: "QC Inspection",
      tone: "danger",
    },
    {
      key: "returns",
      title: "Pending Returns",
      icon: "return",
      count: rtn.length,
      unit: "ใบ",
      desc: `${fmtInt(sum(rtn, (r) => r.pendingQty))} ชิ้นรอรับคืน`,
      goto: "Sales Return",
      tone: "warning",
    },
    {
      key: "claim",
      title: "Pending Supplier Claims",
      icon: "file",
      count: INV_OPS.supplierClaims,
      unit: "เรื่อง",
      desc: "เคลมของเสียกับผู้ขาย",
      goto: "Supplier Claim",
      tone: "info",
    },
    {
      key: "putAway",
      title: "Pending Put Away",
      icon: "putAway",
      count: pa.length,
      unit: "ใบ",
      desc: `${fmtInt(sum(pa, (p) => p.remainingQty))} ชิ้นรอเก็บเข้าบิน`,
      goto: "Put Away",
      tone: "warning",
    },
  ];
}
