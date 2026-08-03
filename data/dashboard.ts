/* ============================================================
   DASHBOARD — declared figures.

   The Command Center derives everything it can from the documents
   the modules already own (see lib/domain/dashboard.ts). What lands
   here is only what has NO source in Phase 1:

     · trends for stock-level KPIs — there is no history table yet,
       only the current position, so the shape is declared
     · the sales trend windows — the mock order book spans a handful
       of days, far short of 90
     · the inventory category mix — the product master's categories
       predate the reporting groups the dashboard reports on
     · Finance — the module does not exist; AR is the one figure with
       a real source (sales invoices) and is derived, not declared
     · queues owned by modules the roadmap has not built

   Nothing here is a second copy of a figure a module already owns.
   ============================================================ */

export interface DeclaredTrend {
  /** Percentage change against the comparison period. */
  delta: number;
  /** Oldest → newest, for the card's sparkline. */
  points: number[];
}

/**
 * Trends for the KPIs that report a position rather than a day's flow.
 * Sales Today and Purchase Today are absent on purpose — those two are
 * measured from the order book itself.
 */
export const DASH_TRENDS: Record<string, DeclaredTrend> = {
  inventoryValue: { delta: 2.4, points: [11.8, 11.9, 12.1, 12.0, 12.3, 12.4, 12.5, 12.6] },
  lowStock: { delta: -12.5, points: [24, 23, 22, 21, 20, 19, 18, 18] },
  pendingApproval: { delta: 20.0, points: [12, 13, 15, 14, 16, 15, 17, 18] },
  openTasks: { delta: 8.3, points: [21, 23, 22, 24, 23, 25, 24, 26] },
  nearExpiry: { delta: 9.1, points: [8, 9, 9, 10, 11, 11, 12, 12] },
  openShipments: { delta: -5.9, points: [19, 18, 18, 17, 17, 16, 16, 16] },
};

/* ---------- Sales trend ---------- */

/**
 * Deterministic pseudo-random series. A seeded generator rather than
 * Math.random so the chart is stable across re-renders and test runs —
 * a dashboard that redraws differently on every keystroke is unreadable.
 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

export interface TrendPoint {
  /** dd/mm — the axis label. */
  label: string;
  value: number;
}

/**
 * Daily sales for the last `days` days, ending today. Weekends run light
 * and the month closes strong, so the bars read like a real order book
 * rather than noise.
 */
export function salesTrendSeries(days: number): TrendPoint[] {
  const rand = seeded(20260803 + days);
  const out: TrendPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    /* Month-end push: the last five days of a month run ~25% hotter. */
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const monthEnd = d.getDate() > daysInMonth - 5 ? 1.25 : 1;

    const base = weekend ? 60_000 : 240_000;
    const spread = weekend ? 45_000 : 150_000;
    out.push({
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      value: Math.round((base + rand() * spread) * monthEnd),
    });
  }
  return out;
}

/* ---------- Inventory value by category ---------- */

/**
 * Share of inventory value per reporting category. Shares are declared;
 * the baht figures are these shares applied to the real inventory value,
 * so the donut always totals to the Inventory Value KPI.
 */
export const INVENTORY_MIX: { key: string; label: string; share: number }[] = [
  { key: "equipment", label: "Dental Equipment", share: 33.8 },
  { key: "consumable", label: "Consumables", share: 24.6 },
  { key: "material", label: "Materials", share: 17.1 },
  { key: "accessory", label: "Accessories", share: 13.4 },
  { key: "spare", label: "Spare Parts", share: 7.0 },
  { key: "other", label: "Others", share: 4.1 },
];

/* ---------- Finance ---------- */

/**
 * Finance has no module. Accounts Receivable and its overdue split are
 * derived from Sales Invoices instead — the payable side, the payment
 * runs and the cash position have no source at all and sit here.
 */
export const FINANCE_DECLARED = {
  accountsPayable: 2_450_780,
  overdueAp: 486_200,
  apInvoices: 24,
  overdueApInvoices: 4,
  receivePayment: 1_240_500,
  receivePaymentCount: 9,
  supplierPayment: 880_000,
  supplierPaymentCount: 6,
  cashPosition: 8_640_000,
  cashDelta: 3.2,
};

/* ---------- Queues owned by unbuilt modules ---------- */

export const FUTURE_QUEUES = {
  /** Supplier Claim — Purchase group, roadmap. */
  supplierClaim: 2,
  /** Supplier Invoice — Finance group, roadmap. */
  supplierInvoice: 1,
  /** Adjustments above the high-value threshold awaiting a finance sign-off. */
  highValueAdjustment: 3,
};
