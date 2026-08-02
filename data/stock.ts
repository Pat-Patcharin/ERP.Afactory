/**
 * STOCK INQUIRY — the mock inputs.
 *
 * Stock Inquiry displays inventory; it never owns it. Positions are built in
 * lib/domain/stock.ts by crossing the REAL Product and Warehouse masters with
 * the profiles below, so a row can always be traced back to a product that
 * exists and a bin that exists.
 *
 * Two things live here because no existing module records them:
 *   1. Per-product hold and cost profile (QC hold, return hold, damaged,
 *      in-transit, safety stock, serial tracking). The Product master tracks
 *      onHand / reserved / onOrder / lowLevel and nothing else.
 *   2. Lot and serial catalogues, which the master only hints at through a
 *      single lot per stock row.
 *
 * Generation is seeded, never random: the same seed yields the same 300 rows
 * on every render and in every test.
 */

/** Fixed seed — changing it reshuffles every generated position. */
export const STOCK_SEED = 20_260_801;

export const STOCK_TARGETS = {
  positions: 300,
  lots: 20,
  serials: 100,
  reservations: 30,
  incoming: 25,
  movements: 40,
} as const;

export interface StockProfile {
  /** Serial-tracked goods are the assembled kits and instruments. */
  serialTracked: boolean;
  /** Reorder buffer under the reorder point. */
  safetyStock: number;
  /** Held quantities, spread across the product's positions. */
  qcHold: number;
  returnHold: number;
  damaged: number;
  inTransit: number;
  backOrder: number;
  avgCost: number;
  /** Warehouses this product is stocked in, by master code. */
  warehouses: string[];
}

/**
 * Keyed by the real product codes in data/products.ts. A product missing
 * here still renders — it simply carries no holds.
 */
export const STOCK_PROFILES: Record<string, StockProfile> = {
  "AA-TH003-WL": {
    serialTracked: false,
    safetyStock: 120,
    qcHold: 180,
    returnHold: 60,
    damaged: 24,
    inTransit: 140,
    backOrder: 0,
    avgCost: 82,
    warehouses: ["WH-BKK", "WH-CNX", "WH-SVC", "WH-RET", "WH-TRN"],
  },
  "AA-TH003-GR": {
    serialTracked: false,
    safetyStock: 120,
    qcHold: 90,
    returnHold: 40,
    damaged: 12,
    inTransit: 80,
    backOrder: 0,
    avgCost: 82,
    warehouses: ["WH-BKK", "WH-CNX", "WH-SVC"],
  },
  "AA-TH004-BK": {
    serialTracked: false,
    safetyStock: 90,
    qcHold: 60,
    returnHold: 30,
    damaged: 8,
    inTransit: 0,
    backOrder: 40,
    avgCost: 104,
    warehouses: ["WH-BKK", "WH-BKK-COLD", "WH-QTY"],
  },
  "AB-AC001": {
    serialTracked: false,
    safetyStock: 240,
    qcHold: 40,
    returnHold: 20,
    damaged: 16,
    inTransit: 0,
    backOrder: 120,
    avgCost: 61,
    warehouses: ["WH-BKK", "WH-CNX"],
  },
  "AT-SL001": {
    serialTracked: false,
    safetyStock: 60,
    qcHold: 30,
    returnHold: 12,
    damaged: 6,
    inTransit: 0,
    backOrder: 0,
    avgCost: 74,
    warehouses: ["WH-BKK", "WH-BKK-COLD", "WH-SVC"],
  },
  "AT-GL001": {
    serialTracked: true,
    safetyStock: 120,
    qcHold: 70,
    returnHold: 45,
    damaged: 18,
    inTransit: 220,
    backOrder: 0,
    avgCost: 168,
    warehouses: ["WH-BKK", "WH-CNX", "WH-SVC", "WH-TRN"],
  },
  "AT-MD001": {
    serialTracked: true,
    safetyStock: 180,
    qcHold: 50,
    returnHold: 25,
    damaged: 10,
    inTransit: 0,
    backOrder: 0,
    avgCost: 98,
    warehouses: ["WH-BKK", "WH-SVC", "WH-RET"],
  },
  "AT-BR002": {
    serialTracked: true,
    safetyStock: 48,
    qcHold: 12,
    returnHold: 8,
    damaged: 4,
    inTransit: 36,
    backOrder: 24,
    avgCost: 610,
    warehouses: ["WH-BKK", "WH-SVC"],
  },
};

/** Lot state vocabulary — expiry decides the rest at read time. */
export const LOT_STATUSES = ["Released", "Quarantine", "Released", "Released"];

/** Where a serialised unit currently sits. */
export const SERIAL_STATUSES = [
  "In Stock",
  "Reserved",
  "Issued",
  "In Service",
  "Returned",
];

/** Inventory status vocabulary the table and filters share. */
export const STOCK_STATUSES = [
  "Available",
  "Reserved",
  "QC Hold",
  "Return Hold",
  "Damaged",
  "Blocked",
  "Expired",
  "Near Expiry",
  "Negative",
] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number];
