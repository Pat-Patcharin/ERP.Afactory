/**
 * INVENTORY — the declared mock overlay.
 *
 * The Inventory Workspace prefers DERIVED figures: anything the Inbound and
 * Outbound documents already know is read from them, never copied here. This
 * file holds only what no existing module models yet:
 *
 *   1. Hold dimensions per warehouse (QC / Return / Transit / pending count).
 *      The Warehouse master tracks qty, reserved and available but has no
 *      concept of stock held aside. Adding those fields to the master would
 *      be redesigning it, so Inventory carries its own overlay keyed by
 *      warehouse code.
 *   2. Trend history. There is no historical snapshot table, so KPI deltas
 *      and spark shapes are declared.
 *   3. Counters for modules that do not exist yet — Transfer, Adjustment,
 *      Cycle Count, Supplier Claim — and physical conditions nothing records
 *      yet (damaged stock, missing serial).
 *
 * Every number here is mock. Swap for API calls when the modules land.
 */

/* ---------- Per-warehouse hold breakdown ---------- */

export interface WhHold {
  /** Received but not cleared by QC. */
  qcHold: number;
  /** Physically returned, not yet dispositioned back to sellable. */
  returnHold: number;
  /** Moving between warehouses. */
  transit: number;
  /** Cycle count sheets open against this warehouse. */
  pendingCount: number;
}

export const WH_HOLDS: Record<string, WhHold> = {
  "WH-BKK": { qcHold: 1240, returnHold: 680, transit: 920, pendingCount: 3 },
  "WH-BKK-COLD": { qcHold: 180, returnHold: 45, transit: 60, pendingCount: 1 },
  "WH-CNX": { qcHold: 420, returnHold: 210, transit: 380, pendingCount: 2 },
  "WH-RET": { qcHold: 60, returnHold: 1180, transit: 0, pendingCount: 1 },
  "WH-QTY": { qcHold: 680, returnHold: 0, transit: 0, pendingCount: 0 },
  "WH-TRN": { qcHold: 0, returnHold: 0, transit: 2140, pendingCount: 0 },
  "WH-SVC": { qcHold: 240, returnHold: 120, transit: 180, pendingCount: 2 },
};

export const EMPTY_HOLD: WhHold = {
  qcHold: 0,
  returnHold: 0,
  transit: 0,
  pendingCount: 0,
};

/* ---------- KPI trend history ---------- */

export interface KpiTrend {
  /** Percentage change against the previous period. */
  delta: number;
  /** Seven readings, oldest first — the spark shape only. */
  points: number[];
}

export const INV_TRENDS: Record<string, KpiTrend> = {
  onHand: { delta: 2.4, points: [168, 170, 169, 172, 171, 174, 175] },
  available: { delta: 1.8, points: [130, 132, 129, 133, 132, 135, 136] },
  reserved: { delta: 6.1, points: [21, 22, 22, 23, 23, 24, 24] },
  qcHold: { delta: -12.5, points: [38, 36, 34, 33, 31, 29, 28] },
  returnHold: { delta: 8.3, points: [18, 19, 19, 20, 21, 22, 22] },
  inTransit: { delta: -4.2, points: [42, 41, 40, 39, 38, 37, 37] },
  lowStock: { delta: 15.0, points: [2, 2, 3, 3, 3, 4, 4] },
  outOfStock: { delta: -20.0, points: [3, 3, 2, 2, 2, 1, 1] },
  nearExpiry: { delta: 5.5, points: [4, 4, 5, 5, 5, 6, 6] },
  movement: { delta: 11.7, points: [48, 52, 47, 55, 51, 58, 62] },
  value: { delta: 3.1, points: [249, 252, 251, 256, 258, 260, 262] },
  pendingCount: { delta: 0, points: [9, 9, 8, 9, 9, 9, 9] },
};

/* ---------- Counters for modules not built yet ---------- */

export interface InvOps {
  pendingTransfer: number;
  pendingTransferQty: number;
  pendingAdjustment: number;
  pendingAdjustmentQty: number;
  pendingCycleCount: number;
  supplierClaims: number;
  damagedStock: number;
  missingSerial: number;
  /** Adjustments posted on the most recent working day. */
  adjustmentToday: number;
}

export const INV_OPS: InvOps = {
  pendingTransfer: 6,
  pendingTransferQty: 1840,
  pendingAdjustment: 4,
  pendingAdjustmentQty: 260,
  pendingCycleCount: 9,
  supplierClaims: 3,
  damagedStock: 12,
  missingSerial: 7,
  adjustmentToday: 2,
};

/* ---------- Inventory health ---------- */

export interface InvHealthMetric {
  key: string;
  title: string;
  /** Rendered figure. */
  value: string;
  /** 0–100 for the gauge; a ratio metric is scaled against its target. */
  pct: number;
  target: string;
  desc: string;
  icon: string;
  tone: "success" | "warning" | "danger" | "info";
  goto: string;
}

/**
 * Accuracy, turnover and movement classes need a costing and history engine
 * that Phase 2 has not built. Declared until it exists.
 */
export const INV_HEALTH_MOCK = {
  stockAccuracy: 98.2,
  accuracyTarget: 99.5,
  turnover: 4.6,
  turnoverTarget: 6,
  avgDaysInStock: 79,
  avgDaysTarget: 60,
  /** Counted against the live product master, so these must stay ≤ its size. */
  slowMoving: 2,
  fastMoving: 3,
};

/* ---------- Alert routing ---------- */

/** Which warehouse each declared alert belongs to. */
export const ALERT_WAREHOUSE: Record<string, string> = {
  pendingTransfer: "WH-BKK Bangkok Main",
  pendingAdjustment: "WH-CNX Chiangmai Branch",
  pendingCycleCount: "ทุกคลัง",
  damagedStock: "WH-RET Returns",
  missingSerial: "WH-SVC Service",
};
