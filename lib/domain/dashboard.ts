import {
  DASH_TRENDS,
  FINANCE_DECLARED,
  FUTURE_QUEUES,
  INVENTORY_MIX,
  salesTrendSeries,
  type TrendPoint,
} from "@/data/dashboard";
import { INV_OPS } from "@/data/inventory";
import type { BadgeTone } from "@/lib/types";
import {
  CN_TONE,
  GR_TONE,
  INV_TONE,
  PA_TONE,
  PO_TONE,
  PR_TONE,
  QC_TONE,
  RTN_TONE,
  SHP_TONE,
  SO_TONE,
  tone,
} from "@/lib/badges";
import type { Action } from "@/data/admin";
import { applyScope, can } from "./admin";
import { maySignAt } from "./doc-draft";
import { BUSINESS_PARTNERS } from "./partner";
import { PURCHASE_ORDERS, PURCHASE_REQUESTS } from "./purchase";
import { GOODS_RECEIPTS, PUTAWAY_TASKS, QC_INSPECTIONS } from "./inbound";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
} from "./outbound";
import { SALES_INVOICES } from "./invoice";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";
import { CREDIT_NOTES } from "./credit-note";
import { TRANSFER_ROWS } from "./transfer";
import { ADJUSTMENT_ROWS } from "./adjustment";
import { COUNT_ROWS } from "./count";
import {
  invActivities,
  invLotAlerts,
  invSnapshot,
  openInspections,
  openPutAways,
  openReturns,
  openShipments,
  parseStamp,
  type InvActivityRow,
} from "./inventory";

/* ============================================================
   DASHBOARD — the read model behind the ERP Command Center.

   The dashboard owns no documents. Every figure is DERIVED from
   the module that owns the truth, so the Command Center can never
   disagree with the screen a user clicks through to. What has no
   source in Phase 1 comes from data/dashboard.ts and is marked
   as declared at the point of use.

   One convention worth stating plainly: "today".

   The mock order book was authored across 2025–2026 and each module
   dates its documents in its own era (purchase in AD, sales in BE).
   A literal calendar "today" would therefore read zero everywhere.
   So "today" here means THE MOST RECENT DAY THAT MODULE WORKED, and
   "yesterday" the working day before it — which is also the question
   an operator actually asks in the morning. The comparison is
   computed per module, never across them.
   ============================================================ */

const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
};

export interface DaySlice {
  day: number;
  total: number;
  count: number;
}

/**
 * One bucket per day the module was active, newest first. Days with no
 * document simply do not appear — a gap in the mock calendar is not a
 * zero-sales day and must not be reported as one.
 */
export function dailySeries<T>(
  rows: T[],
  when: (r: T) => string | undefined,
  value: (r: T) => number,
): DaySlice[] {
  const byDay = new Map<number, DaySlice>();
  for (const r of rows) {
    const ts = parseStamp(when(r));
    if (!ts) continue;
    const key = dayKey(ts);
    const slice = byDay.get(key);
    if (slice) {
      slice.total += value(r) || 0;
      slice.count += 1;
    } else {
      byDay.set(key, { day: key, total: value(r) || 0, count: 1 });
    }
  }
  return [...byDay.values()].sort((a, b) => b.day - a.day);
}

/** Percentage change, rounded to one decimal. Zero base reports flat. */
const deltaPct = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : 0;

/** Oldest → newest totals for a sparkline, at most `n` points. */
const sparkPoints = (series: DaySlice[], n = 8) =>
  series
    .slice(0, n)
    .map((s) => s.total)
    .reverse();

/* ---------- Open-work predicates, per module ---------- */

/* Each module's own closed set. Kept beside the dashboard rather than
   guessed inline, so "open" means the same thing here as in the module. */
/* "Open" is the purchase request's own word for waiting on a signature —
   it replaced "Pending Approval" on that document only. */
const OPEN_PR = ["Draft", "Open", "Approved"];
const OPEN_PO = ["Draft", "Open", "Partial Received"];
const OPEN_GR = ["Draft", "Waiting", "Partial", "Pending QC"];
const OPEN_PICK = ["Waiting", "Assigned", "In Progress"];
const OPEN_PACK = ["Waiting", "In Progress"];
const OPEN_DO = ["Draft", "Ready", "Shipped"];
const OPEN_SO = ["Draft", "Confirmed", "On Hold", "Picking", "Partially Delivered"];
const OPEN_QT = ["Draft", "Sent", "Accepted"];
const OPEN_CN = ["Draft", "Pending Approval", "Approved"];
const OPEN_INV = ["Draft", "Pending Review", "Approved", "Issued", "Partially Paid", "Overdue"];
const OPEN_TRF = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Ready to Transfer",
  "Partially Dispatched",
  "Dispatched",
  "In Transit",
  "Partially Received",
];
const OPEN_ADJ = ["Draft", "Pending Approval", "Approved", "Ready to Post"];
const OPEN_CNT = [
  "Draft",
  "Planned",
  "Assigned",
  "In Progress",
  "Paused",
  "Count Submitted",
  "Variance Review",
  "Recount Required",
  "Recount Submitted",
  "Adjustment Pending",
];

const openIn = <T extends { status: string }>(rows: T[], statuses: string[]) =>
  rows.filter((r) => statuses.includes(r.status));

/* ============================================================
   SECTION 1 — Global KPI
   ============================================================ */

export interface DashKpi {
  key: string;
  icon: string;
  title: string;
  value: string;
  unit?: string;
  /** Yesterday's figure, phrased for the card. */
  compare: string;
  delta: number;
  points: number[];
  goto: string;
  tone: string;
  /** True when the figure came from a module rather than data/dashboard.ts. */
  derived: boolean;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

const compactBaht = (n: number) =>
  n >= 1_000_000
    ? `฿${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `฿${Math.round(n / 1_000)}K`
      : `฿${fmtInt(n)}`;

/** Sales booked per working day, newest first. */
export const salesDaily = () =>
  dailySeries(SALES_ORDERS, (s) => s.orderDate, (s) => s.total);

/** Purchase committed per working day, newest first. */
export const purchaseDaily = () =>
  dailySeries(PURCHASE_ORDERS, (p) => p.orderDate, (p) => p.total);

/** Everything queued against the current user across every module. */
export function pendingApprovalCount(): number {
  return dashPendingTasks().reduce((t, r) => t + r.count, 0);
}

/** Warehouse and sell-side work in flight — the day's workload. */
export function openTaskCount(): number {
  return (
    openIn(GOODS_RECEIPTS, OPEN_GR).length +
    openInspections().length +
    openPutAways().length +
    openIn(PICKING_TASKS, OPEN_PICK).length +
    openIn(PACKING_TASKS, OPEN_PACK).length +
    openIn(DELIVERY_ORDERS, OPEN_DO).length +
    openShipments().length
  );
}

/** The eight figures the morning starts with. */
export function dashKpis(): DashKpi[] {
  const snap = invSnapshot();
  const sales = salesDaily();
  const purchase = purchaseDaily();
  const declared = (key: string) => DASH_TRENDS[key] ?? { delta: 0, points: [] };

  const salesToday = sales[0]?.total ?? 0;
  const salesPrev = sales[1]?.total ?? 0;
  const purchaseToday = purchase[0]?.total ?? 0;
  const purchasePrev = purchase[1]?.total ?? 0;

  const pending = pendingApprovalCount();
  const openTasks = openTaskCount();
  const shipments = openShipments().length;

  return [
    {
      key: "salesToday",
      icon: "cart",
      title: "Sales Today",
      value: compactBaht(salesToday),
      compare: `เมื่อวาน ${compactBaht(salesPrev)}`,
      delta: deltaPct(salesToday, salesPrev),
      points: sparkPoints(sales),
      goto: "Sales Order",
      tone: "info",
      derived: true,
    },
    {
      key: "purchaseToday",
      icon: "purchaseOrder",
      title: "Purchase Today",
      value: compactBaht(purchaseToday),
      compare: `เมื่อวาน ${compactBaht(purchasePrev)}`,
      delta: deltaPct(purchaseToday, purchasePrev),
      points: sparkPoints(purchase),
      goto: "Purchase Order",
      tone: "success",
      derived: true,
    },
    {
      key: "inventoryValue",
      icon: "box",
      title: "Inventory Value",
      value: compactBaht(snap.value),
      compare: `${fmtInt(snap.skus)} SKU ใน ${snap.warehouses} คลัง`,
      delta: declared("inventoryValue").delta,
      points: declared("inventoryValue").points,
      goto: "Stock Inquiry",
      tone: "info",
      derived: true,
    },
    {
      key: "lowStock",
      icon: "alert",
      title: "Low Stock Items",
      value: String(snap.belowRop),
      unit: "SKU",
      compare: `หมดสต๊อกแล้ว ${snap.outOfStock} SKU`,
      delta: declared("lowStock").delta,
      points: declared("lowStock").points,
      goto: "Stock Inquiry",
      tone: "warning",
      derived: true,
    },
    {
      key: "pendingApproval",
      icon: "checkCircle",
      title: "Pending Approvals",
      value: String(pending),
      unit: "รายการ",
      compare: "งานที่รอการอนุมัติของคุณ",
      delta: declared("pendingApproval").delta,
      points: declared("pendingApproval").points,
      goto: "Purchase Request",
      tone: "warning",
      derived: true,
    },
    {
      key: "openTasks",
      icon: "workspace",
      title: "Open Tasks",
      value: String(openTasks),
      unit: "งาน",
      compare: "งานรับเข้า–จ่ายออกที่ยังไม่ปิด",
      delta: declared("openTasks").delta,
      points: declared("openTasks").points,
      goto: "Inventory Workspace",
      tone: "info",
      derived: true,
    },
    {
      key: "nearExpiry",
      icon: "calendar",
      title: "Near Expiry",
      value: String(snap.lotsNearExpiry),
      unit: "Lot",
      compare: `หมดอายุแล้ว ${snap.lotsExpired} Lot`,
      delta: declared("nearExpiry").delta,
      points: declared("nearExpiry").points,
      goto: "Lot Tracking",
      tone: "danger",
      derived: true,
    },
    {
      key: "openShipments",
      icon: "truck",
      title: "Open Shipments",
      value: String(shipments),
      unit: "เที่ยว",
      compare: `ส่งช้า ${SHIPMENTS.filter((s) => s.isDelayed).length} เที่ยว`,
      delta: declared("openShipments").delta,
      points: declared("openShipments").points,
      goto: "Shipment",
      tone: "success",
      derived: true,
    },
  ];
}

/* ============================================================
   SECTION 2 — Quick actions
   ============================================================ */

export interface DashAction {
  label: string;
  desc: string;
  icon: string;
  goto: string;
  accent?: boolean;
}

/** The eight documents a user starts from scratch most often. */
export const DASH_ACTIONS: DashAction[] = [
  {
    label: "Purchase Request",
    desc: "ขอซื้อสินค้าเข้าคลัง",
    icon: "purchaseRequest",
    goto: "Purchase Request",
    accent: true,
  },
  { label: "Purchase Order", desc: "สั่งซื้อกับผู้ขาย", icon: "purchaseOrder", goto: "Purchase Order" },
  { label: "Goods Receipt", desc: "รับสินค้าเข้าคลัง", icon: "goodsReceipt", goto: "Goods Receipt" },
  { label: "Sales Order", desc: "เปิดออร์เดอร์ลูกค้า", icon: "salesOrder", goto: "Sales Order", accent: true },
  { label: "Shipment", desc: "จัดส่งสินค้าออก", icon: "truck", goto: "Shipment" },
  { label: "Stock Transfer", desc: "โอนย้ายระหว่างคลัง", icon: "sort", goto: "Stock Transfer" },
  { label: "Cycle Count", desc: "นับสต๊อกตามรอบ", icon: "checkCircle", goto: "Cycle Count" },
  { label: "Supplier Invoice", desc: "บันทึกใบวางบิลผู้ขาย", icon: "invoice", goto: "Supplier Invoice" },
];

/* ============================================================
   SECTION 3 — My pending tasks
   ============================================================ */

export interface DashTask {
  key: string;
  icon: string;
  title: string;
  count: number;
  priority: "Critical" | "High" | "Medium" | "Low";
  goto: string;
  tone: string;
  /** Set when the queue is declared because the module is not built. */
  future?: boolean;
  /**
   * The permission that decides whether this row is anybody's business.
   *
   * A module key and the action the row actually asks somebody to perform —
   * approving a purchase request needs `approve`, not `view`. Written as data
   * so the box never names a role: adding one is a permission change, and
   * this function does not have to hear about it.
   */
  needs: { module: string; action: Action };
  /**
   * A second gate for work the module permission alone does not settle.
   *
   * The price floor is the case: an administrator holds `approve` on a
   * quotation and still may not sign one priced under the floor. Asked of
   * `maySignAt`, the same authority the approve button consults — never of a
   * role code.
   */
  when?: () => boolean;
}

/* ============================================================
   SECTION 3 — MY pending tasks, and only mine

   The box used to be the same eleven rows for everybody, which
   made it a list of what the company owes rather than of what
   you owe. Two things now decide whether a row is yours:

     · the permission the row needs, asked of `can()`
     · for the price floor, `maySignAt()` — the same authority the
       approve button itself consults

   Neither is a role check. A row a person cannot act on is
   dropped entirely rather than shown greyed out: being told to do
   something and then refused at the door is worse than never
   having been told, and it is how a task box stops being read.
   ============================================================ */

/** Requests still waiting on a signature that THIS person is allowed to give. */
const signableRequests = () =>
  SALES_REQUESTS.filter((r) => r.status === "Submitted" && maySignAt(r.priceApprovalLevel));

const managerOnlyRequests = () =>
  SALES_REQUESTS.filter((r) => r.status === "Submitted" && r.priceApprovalLevel === "manager");

const managerOnlyQuotes = () =>
  QUOTATIONS.filter((q) => q.status === "Pending Approval" && q.priceApprovalLevel === "manager");

/**
 * Only work that is waiting on a decision, and only the part of it the acting
 * user may actually act on. Ordered by priority then size, so the top of the
 * list is always the thing to open first.
 */
export function dashPendingTasks(): DashTask[] {
  const tasks: DashTask[] = [
    /* ---------- The sell side ---------- */
    {
      key: "qtApproval",
      icon: "quotation",
      title: "ใบเสนอราคารออนุมัติ",
      /* Quotes priced under the floor are counted only for whoever may sign
         them, so an administrator is never sent to a document that will
         refuse them at the last click. */
      count: QUOTATIONS.filter(
        (q) => q.status === "Pending Approval" && maySignAt(q.priceApprovalLevel),
      ).length,
      priority: "High",
      goto: "Quotation",
      tone: "warning",
      needs: { module: "quotation", action: "approve" },
    },
    {
      key: "qtManager",
      icon: "alert",
      title: "ใบเสนอราคาราคาต่ำกว่าขั้นต่ำ",
      count: managerOnlyQuotes().length,
      priority: "Critical",
      goto: "Quotation",
      tone: "danger",
      needs: { module: "quotation", action: "approve" },
      /* The row disappears for anyone who cannot sign at this level. Showing
         it with a count of nought would be worse than useless: it would read
         as "nothing to do" on work that is in fact waiting. */
      when: () => maySignAt("manager"),
    },
    {
      key: "qtSent",
      icon: "send",
      title: "ใบเสนอราคารอลูกค้าตอบ",
      /* The rep's own follow-up list. Scoped rather than filtered by name:
         a rep sees their customers, a manager sees the team's, and the rule
         for which is which already exists. */
      count: applyScope(
        QUOTATIONS.filter((q) => q.status === "Sent"),
        (q) => ({ owner: q.createdBy, salesRep: q.salesRep }),
      ).length,
      priority: "Medium",
      goto: "Quotation",
      tone: "info",
      needs: { module: "quotation", action: "edit" },
    },
    {
      key: "srApproval",
      icon: "salesRequest",
      title: "คำขอขายรออนุมัติ",
      count: signableRequests().length,
      priority: "High",
      goto: "Sales Request",
      tone: "warning",
      needs: { module: "sales-request", action: "approve" },
    },
    {
      key: "srManager",
      icon: "alert",
      title: "คำขอขายราคาต่ำกว่าขั้นต่ำ",
      count: managerOnlyRequests().length,
      priority: "Critical",
      goto: "Sales Request",
      tone: "danger",
      needs: { module: "sales-request", action: "approve" },
      when: () => maySignAt("manager"),
    },
    {
      key: "bpDraft",
      icon: "partner",
      title: "คู่ค้ารอยืนยัน",
      /* A rep can raise a partner and quote against it the same afternoon,
         but no order can be opened until somebody confirms the record. */
      count: BUSINESS_PARTNERS.filter((b) => b.status === "Draft").length,
      priority: "High",
      goto: "Business Partner",
      tone: "warning",
      needs: { module: "business-partner", action: "approve" },
    },
    {
      key: "soPick",
      icon: "picking",
      title: "ใบสั่งขายรอเปิดใบหยิบสินค้า",
      count: SALES_ORDERS.filter(
        (s) =>
          s.status === "Confirmed" &&
          !PICKING_TASKS.some(
            (t) => t.soRef === s.code && !["Completed", "Cancelled"].includes(t.status),
          ),
      ).length,
      priority: "High",
      goto: "Sales Order",
      tone: "warning",
      needs: { module: "picking", action: "create" },
    },
    {
      key: "doInvoice",
      icon: "invoice",
      title: "ใบส่งของรอวางบิล",
      count: DELIVERY_ORDERS.filter(
        (d) =>
          ["Shipped", "Delivered"].includes(d.status) &&
          !SALES_INVOICES.some(
            (i) => i.sourceDoc === d.code && !["Cancelled", "Void"].includes(i.status),
          ),
      ).length,
      priority: "Medium",
      goto: "Sales Invoice",
      tone: "info",
      needs: { module: "sales-invoice", action: "create" },
    },

    /* ---------- The buy side and the warehouse ---------- */
    {
      key: "pr",
      icon: "purchaseRequest",
      title: "Purchase Request รออนุมัติ",
      count: PURCHASE_REQUESTS.filter((p) => p.status === "Pending Approval").length,
      priority: "High",
      goto: "Purchase Request",
      tone: "warning",
      needs: { module: "purchase-request", action: "approve" },
    },
    {
      key: "po",
      icon: "purchaseOrder",
      title: "Purchase Order รออนุมัติ",
      count: PURCHASE_ORDERS.filter((p) => p.status === "Draft").length,
      priority: "High",
      goto: "Purchase Order",
      tone: "warning",
      needs: { module: "purchase-order", action: "approve" },
    },
    {
      key: "qc",
      icon: "qc",
      title: "QC รอตรวจสอบ",
      count: QC_INSPECTIONS.filter((q) => q.status === "Waiting" || q.status === "Hold").length,
      priority: "Critical",
      goto: "QC Inspection",
      tone: "danger",
      needs: { module: "qc-inspection", action: "edit" },
    },
    /* No Put Away queue. Receiving ends at the goods receipt, so nothing
       creates these tasks any more — a queue that only ever counts down is
       a queue nobody should be sent to. */
    {
      key: "shipment",
      icon: "truck",
      title: "Shipment รอจัดส่ง",
      count: SHIPMENTS.filter((s) => s.status === "Ready to Dispatch" || s.status === "Draft").length,
      priority: "Critical",
      goto: "Shipment",
      tone: "danger",
      needs: { module: "shipment", action: "edit" },
    },
    {
      key: "count",
      icon: "checkCircle",
      title: "Cycle Count รอตรวจนับ",
      count: COUNT_ROWS.filter((c) =>
        ["Variance Review", "Count Submitted", "Recount Required", "Recount Submitted"].includes(
          c.status,
        ),
      ).length,
      priority: "Medium",
      goto: "Cycle Count",
      tone: "info",
      needs: { module: "cycle-count", action: "approve" },
    },
    {
      key: "claim",
      icon: "shield",
      title: "Supplier Claim รอดำเนินการ",
      count: FUTURE_QUEUES.supplierClaim,
      priority: "Medium",
      goto: "Supplier Claim",
      tone: "info",
      future: true,
      needs: { module: "purchase-order", action: "create" },
    },
    {
      key: "return",
      icon: "return",
      title: "Sales Return รออนุมัติ",
      count: SALES_RETURNS.filter((r) =>
        ["Pending Approval", "Pending QC", "Disposition Pending"].includes(r.status),
      ).length,
      priority: "High",
      goto: "Sales Return",
      tone: "warning",
      needs: { module: "sales-return", action: "approve" },
    },
    {
      key: "creditNote",
      icon: "creditNote",
      title: "Credit Note รออนุมัติ",
      count: CREDIT_NOTES.filter((c) => c.status === "Pending Approval").length,
      priority: "Medium",
      goto: "Credit Note",
      tone: "info",
      needs: { module: "credit-note", action: "approve" },
    },
    {
      key: "supplierInvoice",
      icon: "invoice",
      title: "Supplier Invoice รออนุมัติ",
      count: FUTURE_QUEUES.supplierInvoice,
      priority: "Low",
      goto: "Supplier Invoice",
      tone: "info",
      future: true,
      needs: { module: "finance", action: "approve" },
    },
  ];

  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return tasks
    .filter((t) => can(t.needs.module, t.needs.action) && (t.when?.() ?? true))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || b.count - a.count);
}

/* ============================================================
   SECTION 4 — Business alerts
   ============================================================ */

export interface DashAlert {
  key: string;
  icon: string;
  title: string;
  count: number;
  unit: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  goto: string;
  tone: string;
}

/** What the business must act on, worst consequence first. */
export function dashAlerts(): DashAlert[] {
  const snap = invSnapshot();
  const variance = COUNT_ROWS.filter(
    (c) => c.status === "Variance Review" || c.openRecountLines > 0,
  ).length;

  const alerts: DashAlert[] = [
    {
      key: "lowStock",
      icon: "alert",
      title: "สินค้าคงเหลือต่ำกว่าจุดสั่งซื้อ",
      count: snap.belowRop,
      unit: "SKU",
      severity: "High",
      goto: "Stock Inquiry",
      tone: "warning",
    },
    {
      key: "nearExpiry",
      icon: "calendar",
      title: "สินค้าใกล้หมดอายุ",
      count: snap.lotsNearExpiry,
      unit: "Lot",
      severity: "High",
      goto: "Lot Tracking",
      tone: "warning",
    },
    {
      key: "qcFailed",
      icon: "xCircle",
      title: "QC ไม่ผ่านการตรวจสอบ",
      count: QC_INSPECTIONS.filter((q) => q.result === "Fail" || q.result === "Partial Pass").length,
      unit: "ใบ",
      severity: "Critical",
      goto: "QC Inspection",
      tone: "danger",
    },
    {
      key: "lateShipment",
      icon: "clock",
      title: "การจัดส่งล่าช้า",
      count: SHIPMENTS.filter((s) => s.isDelayed).length,
      unit: "เที่ยว",
      severity: "Critical",
      goto: "Shipment",
      tone: "danger",
    },
    {
      key: "supplierClaim",
      icon: "shield",
      title: "Supplier Claim รอปิดเรื่อง",
      count: FUTURE_QUEUES.supplierClaim,
      unit: "เรื่อง",
      severity: "Medium",
      goto: "Supplier Claim",
      tone: "info",
    },
    {
      key: "countVariance",
      icon: "sliders",
      title: "ผลนับสต๊อกมีผลต่าง",
      count: variance,
      unit: "ใบ",
      severity: "Medium",
      goto: "Cycle Count",
      tone: "info",
    },
    {
      key: "blockedStock",
      icon: "lock",
      title: "สต๊อกถูกกันไว้ (QC / Return Hold)",
      count: snap.qcHold + snap.returnHold,
      unit: "ชิ้น",
      severity: "High",
      goto: "Stock Inquiry",
      tone: "warning",
    },
    {
      key: "highValueAdj",
      icon: "pricing",
      title: "ปรับปรุงยอดมูลค่าสูง",
      count: ADJUSTMENT_ROWS.filter(
        (a) => a.needsApproval && OPEN_ADJ.includes(a.status),
      ).length,
      unit: "ใบ",
      severity: "Critical",
      goto: "Stock Adjustment",
      tone: "danger",
    },
  ];

  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

/* ============================================================
   SECTIONS 5–7 — Module overviews
   ============================================================ */

export interface DashOverviewRow {
  key: string;
  label: string;
  icon: string;
  /** Every document the module holds. */
  total: number;
  /** Documents worked on the module's most recent active day. */
  today: number;
  /** Documents still waiting on someone. */
  pending: number;
  goto: string;
  tone: string;
}

/** Documents the module touched on its most recent working day. */
function todayCount<T>(rows: T[], when: (r: T) => string | undefined): number {
  const series = dailySeries(rows, when, () => 1);
  return series[0]?.count ?? 0;
}

function row<T extends { status: string }>(
  key: string,
  label: string,
  icon: string,
  rows: T[],
  openStatuses: string[],
  when: (r: T) => string | undefined,
  goto: string,
  tone: string,
): DashOverviewRow {
  return {
    key,
    label,
    icon,
    total: rows.length,
    today: todayCount(rows, when),
    pending: openIn(rows, openStatuses).length,
    goto,
    tone,
  };
}

export function dashPurchaseOverview(): DashOverviewRow[] {
  return [
    row("pr", "Purchase Request", "purchaseRequest", PURCHASE_REQUESTS, OPEN_PR, (r) => r.updated, "Purchase Request", "info"),
    row("po", "Purchase Order", "purchaseOrder", PURCHASE_ORDERS, OPEN_PO, (r) => r.updated, "Purchase Order", "info"),
    row("gr", "Goods Receipt", "goodsReceipt", GOODS_RECEIPTS, OPEN_GR, (r) => r.updated, "Goods Receipt", "success"),
    row("qc", "QC Inspection", "qc", QC_INSPECTIONS, ["Waiting", "In Progress", "Hold"], (r) => r.updated, "QC Inspection", "danger"),
    {
      key: "claim",
      label: "Supplier Claim",
      icon: "shield",
      total: FUTURE_QUEUES.supplierClaim,
      today: 0,
      pending: FUTURE_QUEUES.supplierClaim,
      goto: "Supplier Claim",
      tone: "warning",
    },
  ];
}

export function dashSalesOverview(): DashOverviewRow[] {
  return [
    row("qt", "Quotation", "quotation", QUOTATIONS, OPEN_QT, (r) => r.updated, "Quotation", "info"),
    row("so", "Sales Order", "salesOrder", SALES_ORDERS, OPEN_SO, (r) => r.updated, "Sales Order", "info"),
    row("pick", "Picking", "picking", PICKING_TASKS, OPEN_PICK, (r) => r.updated, "Picking", "warning"),
    row("pack", "Packing", "packing", PACKING_TASKS, OPEN_PACK, (r) => r.updated, "Packing", "warning"),
    row("do", "Delivery Order", "delivery", DELIVERY_ORDERS, OPEN_DO, (r) => r.updated, "Delivery Order", "info"),
    row("inv", "Sales Invoice", "invoice", SALES_INVOICES, OPEN_INV, (r) => r.updated, "Sales Invoice", "success"),
    row("shp", "Shipment", "truck", SHIPMENTS, ["Draft", "Ready to Dispatch", "Dispatched", "In Transit", "Out for Delivery", "Rescheduled", "Partially Delivered"], (r) => r.updated, "Shipment", "info"),
    row("rtn", "Sales Return", "return", SALES_RETURNS, ["Draft", "Submitted", "Pending Approval", "Approved", "Partially Approved", "Authorized", "Waiting Return", "Partially Received", "Received", "Pending QC", "QC Completed", "Disposition Pending", "Credit Note Pending"], (r) => r.updated, "Sales Return", "danger"),
    row("cn", "Credit Note", "creditNote", CREDIT_NOTES, OPEN_CN, (r) => r.updated, "Credit Note", "warning"),
  ];
}

export interface DashInventoryStat {
  key: string;
  label: string;
  icon: string;
  value: string;
  unit: string;
  goto: string;
  tone: string;
}

export function dashInventoryOverview(): DashInventoryStat[] {
  const snap = invSnapshot();
  return [
    { key: "value", label: "Inventory Value", icon: "pricing", value: compactBaht(snap.value), unit: "", goto: "Stock Inquiry", tone: "success" },
    { key: "available", label: "Available Qty", icon: "checkCircle", value: fmtInt(snap.available), unit: "ชิ้น", goto: "Stock Inquiry", tone: "success" },
    { key: "reserved", label: "Reserved Qty", icon: "lock", value: fmtInt(snap.reserved), unit: "ชิ้น", goto: "Sales Order", tone: "warning" },
    { key: "qcHold", label: "QC Hold", icon: "shield", value: fmtInt(snap.qcHold), unit: "ชิ้น", goto: "QC Inspection", tone: "danger" },
    { key: "damaged", label: "Damaged", icon: "trash", value: fmtInt(INV_OPS.damagedStock), unit: "ชิ้น", goto: "Stock Adjustment", tone: "danger" },
    { key: "lowStock", label: "Low Stock", icon: "alert", value: String(snap.belowRop), unit: "SKU", goto: "Stock Inquiry", tone: "warning" },
    { key: "nearExpiry", label: "Near Expiry", icon: "calendar", value: String(snap.lotsNearExpiry), unit: "Lot", goto: "Lot Tracking", tone: "warning" },
    { key: "count", label: "Cycle Count", icon: "checkCircle", value: String(openIn(COUNT_ROWS, OPEN_CNT).length), unit: "ใบ", goto: "Cycle Count", tone: "info" },
    { key: "transfer", label: "Stock Transfer", icon: "sort", value: String(openIn(TRANSFER_ROWS, OPEN_TRF).length), unit: "ใบ", goto: "Stock Transfer", tone: "info" },
    { key: "adjustment", label: "Stock Adjustment", icon: "sliders", value: String(openIn(ADJUSTMENT_ROWS, OPEN_ADJ).length), unit: "ใบ", goto: "Stock Adjustment", tone: "info" },
  ];
}

/* ============================================================
   SECTION 8 — Finance (placeholder)
   ============================================================ */

export interface DashFinanceStat {
  key: string;
  label: string;
  icon: string;
  value: string;
  desc: string;
  tone: string;
  /** False for AR, which Sales Invoice already owns. */
  declared: boolean;
}

/**
 * Finance has no module. Receivables are nevertheless real — a sales
 * invoice knows what it is owed — so AR is derived and only the payable
 * side, the payment runs and the cash position are declared.
 */
export function dashFinanceOverview(): DashFinanceStat[] {
  const open = SALES_INVOICES.filter((i) => OPEN_INV.includes(i.status));
  const ar = sum(open, (i) => i.outstanding);
  const overdue = open.filter((i) => i.isOverdue);
  const overdueAr = sum(overdue, (i) => i.outstanding);
  const f = FINANCE_DECLARED;

  return [
    { key: "ar", label: "Accounts Receivable", icon: "invoice", value: compactBaht(ar), desc: `${open.length} ใบแจ้งหนี้ค้างชำระ`, tone: "info", declared: false },
    { key: "ap", label: "Accounts Payable", icon: "creditNote", value: compactBaht(f.accountsPayable), desc: `${f.apInvoices} ใบวางบิลรอจ่าย`, tone: "warning", declared: true },
    { key: "overdueAr", label: "Overdue AR", icon: "clock", value: compactBaht(overdueAr), desc: `${overdue.length} ใบเกินกำหนดชำระ`, tone: "danger", declared: false },
    { key: "overdueAp", label: "Overdue AP", icon: "alert", value: compactBaht(f.overdueAp), desc: `${f.overdueApInvoices} ใบเกินกำหนดจ่าย`, tone: "danger", declared: true },
    { key: "receive", label: "Receive Payment", icon: "download", value: compactBaht(f.receivePayment), desc: `${f.receivePaymentCount} รายการรอรับชำระ`, tone: "success", declared: true },
    { key: "pay", label: "Supplier Payment", icon: "upload", value: compactBaht(f.supplierPayment), desc: `${f.supplierPaymentCount} รายการรอจ่าย`, tone: "warning", declared: true },
    { key: "cash", label: "Cash Position", icon: "pricing", value: compactBaht(f.cashPosition), desc: `เปลี่ยนแปลง ${f.cashDelta > 0 ? "+" : ""}${f.cashDelta}% จากเดือนก่อน`, tone: "success", declared: true },
  ];
}

/* ============================================================
   SECTION 9 — Sales trend
   ============================================================ */

export type TrendRange = 7 | 30 | 90;

export const TREND_RANGES: TrendRange[] = [7, 30, 90];

/** Declared — the mock order book is far shorter than 90 days. */
export function dashSalesTrend(range: TrendRange): TrendPoint[] {
  return salesTrendSeries(range);
}

export const trendTotal = (points: TrendPoint[]) => sum(points, (p) => p.value);

export const trendAverage = (points: TrendPoint[]) =>
  points.length ? Math.round(trendTotal(points) / points.length) : 0;

/* ============================================================
   SECTION 10 — Inventory value by category
   ============================================================ */

export interface DashMixSlice {
  key: string;
  label: string;
  value: number;
  share: number;
}

/** Declared shares applied to the real inventory value, so the donut
 *  always totals to the Inventory Value KPI. */
export function dashInventoryMix(): DashMixSlice[] {
  const total = invSnapshot().value;
  return INVENTORY_MIX.map((c) => ({
    key: c.key,
    label: c.label,
    share: c.share,
    value: Math.round((total * c.share) / 100),
  }));
}

/* ============================================================
   SECTION 11 — Recent activity
   ============================================================ */

/** The cross-module movement feed the Inventory Workspace already builds. */
export function dashActivities(limit = 8): InvActivityRow[] {
  return invActivities(limit);
}

/* ============================================================
   SECTION 12 — Recent documents
   ============================================================ */

export interface DashDocRow {
  code: string;
  party: string;
  date: string;
  amount: number;
  status: string;
  statusTone: BadgeTone;
  goto: string;
  /** Sort key. Taken from the date the row DISPLAYS, so the table is
   *  ordered by the column a reader can see; the audit stamp is only the
   *  fallback for a document that carries no date of its own. */
  ts: number;
}

/** Document date first, audit stamp second. Both eras parse. */
const docTs = (date: string | undefined, updated: string | undefined) =>
  parseStamp(date) || parseStamp(updated);

export type DocTab = "Purchase" | "Sales" | "Inventory" | "Finance";

export const DOC_TABS: DocTab[] = ["Purchase", "Sales", "Inventory", "Finance"];

/**
 * Newest first, but round-robin by source module before it is strict
 * recency. Each module dates its documents in its own era, so a straight
 * sort hands the whole tab to whichever module happens to run latest —
 * the Purchase tab becomes five purchase requests and the purchase orders
 * and receipts behind them disappear. Taking one document from each module
 * per round keeps the tab a picture of the group, which is the only reason
 * to group documents in the first place.
 */
function byNewest(rows: DashDocRow[], limit: number): DashDocRow[] {
  const queues = new Map<string, DashDocRow[]>();
  for (const r of [...rows].sort((a, b) => b.ts - a.ts)) {
    const q = queues.get(r.goto);
    if (q) q.push(r);
    else queues.set(r.goto, [r]);
  }

  const picked: DashDocRow[] = [];
  const lists = [...queues.values()];
  for (let round = 0; picked.length < limit; round++) {
    const before = picked.length;
    for (const q of lists) {
      if (picked.length >= limit) break;
      if (q[round]) picked.push(q[round]);
    }
    if (picked.length === before) break;
  }

  return picked.sort((a, b) => b.ts - a.ts);
}

/**
 * The last documents each group produced, newest first. Amount is the
 * document's own total — Inventory documents carry quantity instead, so
 * they report the value impact where one exists and zero where it does not.
 */
export function dashRecentDocuments(limit = 5): Record<DocTab, DashDocRow[]> {
  const purchase: DashDocRow[] = [
    ...PURCHASE_ORDERS.map((p) => ({
      code: p.code,
      party: p.supplier,
      date: p.orderDate,
      amount: p.total,
      status: p.status,
      statusTone: tone(PO_TONE, p.status),
      goto: "Purchase Order",
      ts: docTs(p.orderDate, p.updated),
    })),
    ...PURCHASE_REQUESTS.map((p) => ({
      code: p.code,
      party: p.supplier || p.dept,
      date: p.date,
      amount: p.amount,
      status: p.status,
      statusTone: tone(PR_TONE, p.status),
      goto: "Purchase Request",
      ts: docTs(p.date, p.updated),
    })),
    ...GOODS_RECEIPTS.map((g) => ({
      code: g.code,
      party: g.supplier,
      date: g.receiptDate,
      amount: 0,
      status: g.status,
      statusTone: tone(GR_TONE, g.status),
      goto: "Goods Receipt",
      ts: docTs(g.receiptDate, g.updated),
    })),
  ];

  const sales: DashDocRow[] = [
    ...SALES_ORDERS.map((s) => ({
      code: s.code,
      party: s.customer,
      date: s.orderDate,
      amount: s.total,
      status: s.status,
      statusTone: tone(SO_TONE, s.status),
      goto: "Sales Order",
      ts: docTs(s.orderDate, s.updated),
    })),
    ...SALES_INVOICES.map((i) => ({
      code: i.code,
      party: i.customer,
      date: i.invoiceDate,
      amount: i.grandTotal,
      status: i.status,
      statusTone: tone(INV_TONE, i.status),
      goto: "Sales Invoice",
      ts: docTs(i.invoiceDate, i.updated),
    })),
    ...SHIPMENTS.map((s) => ({
      code: s.code,
      party: s.customer,
      date: s.shipmentDate,
      amount: 0,
      status: s.status,
      statusTone: tone(SHP_TONE, s.status),
      goto: "Shipment",
      ts: docTs(s.shipmentDate, s.updated),
    })),
  ];

  const inventory: DashDocRow[] = [
    ...TRANSFER_ROWS.map((t) => ({
      code: t.code,
      party: `${t.srcLabel} → ${t.dstLabel}`,
      date: t.transferDate,
      amount: 0,
      status: t.status,
      statusTone: "info" as BadgeTone,
      goto: "Stock Transfer",
      ts: docTs(t.transferDate, t.updated),
    })),
    ...ADJUSTMENT_ROWS.map((a) => ({
      code: a.code,
      party: a.whLabel,
      date: a.adjDate,
      amount: a.valueImpact,
      status: a.status,
      statusTone: "warning" as BadgeTone,
      goto: "Stock Adjustment",
      ts: docTs(a.adjDate, a.updated),
    })),
    ...COUNT_ROWS.map((c) => ({
      code: c.code,
      party: c.whLabel,
      date: c.countDate,
      amount: c.acc.varianceValue,
      status: c.status,
      statusTone: "info" as BadgeTone,
      goto: "Cycle Count",
      ts: docTs(c.countDate, c.updated),
    })),
  ];

  /* Finance owns no documents yet. Receivables and credits are the only
     financial artefacts Phase 1 produces, and both belong to Outbound. */
  const finance: DashDocRow[] = [
    ...SALES_INVOICES.filter((i) => i.outstanding > 0).map((i) => ({
      code: i.code,
      party: i.customer,
      date: i.dueDate,
      amount: i.outstanding,
      status: i.paymentStatus,
      statusTone: tone(INV_TONE, i.status),
      goto: "Sales Invoice",
      ts: docTs(i.dueDate, i.updated),
    })),
    ...CREDIT_NOTES.map((c) => ({
      code: c.code,
      party: c.customer,
      date: c.creditDate,
      amount: c.totalCredit,
      status: c.status,
      statusTone: tone(CN_TONE, c.status),
      goto: "Credit Note",
      ts: docTs(c.creditDate, c.updated),
    })),
  ];

  return {
    Purchase: byNewest(purchase, limit),
    Sales: byNewest(sales, limit),
    Inventory: byNewest(inventory, limit),
    Finance: byNewest(finance, limit),
  };
}

/* ============================================================
   Morning brief
   ============================================================ */

export interface DashBrief {
  pendingApproval: number;
  openTasks: number;
  criticalAlerts: number;
  shipToday: number;
}

export function dashBrief(): DashBrief {
  return {
    pendingApproval: pendingApprovalCount(),
    openTasks: openTaskCount(),
    criticalAlerts: dashAlerts().filter((a) => a.severity === "Critical" && a.count > 0).length,
    shipToday: SHIPMENTS.filter((s) =>
      ["Ready to Dispatch", "Dispatched", "Out for Delivery"].includes(s.status),
    ).length,
  };
}

/* Re-exported so the page and its tests read one module. */
export { invLotAlerts, openReturns };
