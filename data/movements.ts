/**
 * STOCK CARD — movement vocabulary.
 *
 * Stock Card owns no stock. It explains how the stock that Stock Inquiry
 * shows today came to be, so every movement type is declared here as a set
 * of deltas and the ledger applies them; nothing computes balances by hand.
 *
 * The balance equation the whole module obeys is the one Stock Inquiry
 * already uses:
 *
 *     On Hand = Available + Reserved + QC Hold + Return Hold
 *
 * Damaged and Blocked are TAGS on quantity that is already on hand, not
 * buckets of their own — exactly as in Stock Inquiry, where damaged stock is
 * reported separately rather than deducted from availability. Every effect
 * below preserves the equation, which is what lets the ledger replay from an
 * opening balance and land precisely on today's figures.
 */

export type MovementDirection =
  | "In"
  | "Out"
  | "Transfer"
  | "Status Change"
  | "No Quantity Change";

export type MovementGroup = "Inbound" | "Outbound" | "Status" | "Non-Quantity";

/** Per-unit deltas. Multiplied by the movement quantity at replay time. */
export interface MovementEffect {
  onHand?: number;
  avail?: number;
  res?: number;
  qc?: number;
  ret?: number;
  /** Tag, not a bucket — see the header note. */
  dmg?: number;
  blk?: number;
}

export interface MovementTypeDef {
  type: string;
  direction: MovementDirection;
  group: MovementGroup;
  effect: MovementEffect;
  /** Stock status the quantity carried before and after. */
  from?: string;
  to?: string;
  /** Registry key of the module that produces this movement, when one exists. */
  module?: string;
}

export const MOVEMENT_TYPES: MovementTypeDef[] = [
  /* ---------- Inbound ---------- */
  {
    type: "Goods Receipt",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, qc: 1 },
    from: "—",
    to: "QC Hold",
    module: "goods-receipt",
  },
  {
    type: "Put Away",
    direction: "Transfer",
    group: "Inbound",
    /* Quantity entered stock at receipt; put away only moves it to its bin. */
    effect: {},
    from: "QC Hold",
    to: "QC Hold",
    module: "put-away",
  },
  {
    type: "Return Receipt",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, ret: 1 },
    from: "—",
    to: "Return Hold",
    module: "sales-return",
  },
  {
    type: "Transfer In",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, avail: 1 },
    from: "In Transit",
    to: "Available",
  },
  {
    type: "Positive Adjustment",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, avail: 1 },
    from: "—",
    to: "Available",
  },
  {
    type: "Count Gain",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, avail: 1 },
    from: "—",
    to: "Available",
  },
  {
    type: "Rework Return",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, avail: 1 },
    from: "—",
    to: "Available",
  },
  {
    type: "Supplier Replacement",
    direction: "In",
    group: "Inbound",
    effect: { onHand: 1, avail: 1 },
    from: "—",
    to: "Available",
  },

  /* ---------- Outbound ---------- */
  {
    type: "Picking",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, res: -1 },
    from: "Reserved",
    to: "—",
    module: "picking",
  },
  {
    type: "Shipment",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1 },
    from: "Available",
    to: "Sold",
    module: "shipment",
  },
  {
    type: "Transfer Out",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1 },
    from: "Available",
    to: "In Transit",
  },
  {
    type: "Negative Adjustment",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1 },
    from: "Available",
    to: "—",
  },
  {
    type: "Count Loss",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1 },
    from: "Available",
    to: "—",
  },
  {
    type: "Scrap",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1, dmg: -1 },
    from: "Damaged",
    to: "—",
  },
  {
    type: "Return to Supplier",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1 },
    from: "Available",
    to: "—",
  },
  {
    type: "Service Consumption",
    direction: "Out",
    group: "Outbound",
    effect: { onHand: -1, avail: -1 },
    from: "Available",
    to: "—",
  },

  /* ---------- Status ---------- */
  {
    type: "Available to Reserved",
    direction: "Status Change",
    group: "Status",
    effect: { avail: -1, res: 1 },
    from: "Available",
    to: "Reserved",
    module: "sales-order",
  },
  {
    type: "Reserved to Available",
    direction: "Status Change",
    group: "Status",
    effect: { res: -1, avail: 1 },
    from: "Reserved",
    to: "Available",
    module: "sales-order",
  },
  {
    type: "Available to QC Hold",
    direction: "Status Change",
    group: "Status",
    effect: { avail: -1, qc: 1 },
    from: "Available",
    to: "QC Hold",
    module: "qc-inspection",
  },
  {
    type: "QC Hold to Available",
    direction: "Status Change",
    group: "Status",
    effect: { qc: -1, avail: 1 },
    from: "QC Hold",
    to: "Available",
    module: "qc-inspection",
  },
  {
    type: "Return Hold to Available",
    direction: "Status Change",
    group: "Status",
    effect: { ret: -1, avail: 1 },
    from: "Return Hold",
    to: "Available",
    module: "sales-return",
  },
  {
    type: "Available to Damaged",
    direction: "Status Change",
    group: "Status",
    effect: { dmg: 1 },
    from: "Available",
    to: "Damaged",
  },
  {
    type: "Damaged to Scrap",
    direction: "Out",
    group: "Status",
    effect: { onHand: -1, avail: -1, dmg: -1 },
    from: "Damaged",
    to: "—",
  },
  {
    type: "Available to Blocked",
    direction: "Status Change",
    group: "Status",
    effect: { blk: 1 },
    from: "Available",
    to: "Blocked",
  },
  {
    type: "Blocked to Available",
    direction: "Status Change",
    group: "Status",
    effect: { blk: -1 },
    from: "Blocked",
    to: "Available",
  },
  {
    type: "In Transit to Available",
    direction: "Status Change",
    group: "Status",
    effect: {},
    from: "In Transit",
    to: "Available",
  },

  /* ---------- Non-quantity ---------- */
  {
    type: "Location Change",
    direction: "No Quantity Change",
    group: "Non-Quantity",
    effect: {},
    from: "Available",
    to: "Available",
  },
  {
    type: "Lot Status Change",
    direction: "No Quantity Change",
    group: "Non-Quantity",
    effect: {},
  },
  {
    type: "Serial Status Change",
    direction: "No Quantity Change",
    group: "Non-Quantity",
    effect: {},
  },
  {
    type: "Cost Revaluation",
    direction: "No Quantity Change",
    group: "Non-Quantity",
    effect: {},
  },
];

export const MOVEMENT_TYPE_MAP = new Map(MOVEMENT_TYPES.map((t) => [t.type, t]));

/** Movement lifecycle. Posted rows are immutable; corrections are new rows. */
export const MOVEMENT_STATUSES = ["Posted", "Reversed", "Cancelled", "Pending"] as const;

/** Costing vocabulary for the operational preview — no engine behind it yet. */
export const COSTING_METHODS = [
  "Moving Average",
  "FIFO",
  "Standard Cost",
  "Specific Identification",
] as const;

export const MOVEMENT_TARGETS = {
  /** Synthetic events added per product on top of the real document trail. */
  syntheticPerProduct: 14,
  /** How many posted movements get a reversal pair. */
  reversals: 3,
  /** Minimum the module was specified with. */
  minMovements: 150,
} as const;

/** Seeded so the ledger is identical on every render and in every test. */
export const MOVEMENT_SEED = 20_260_802;

/** Who performs each kind of work — used when the source document has no user. */
export const MOVEMENT_USERS = [
  "Warin S.",
  "Somchai B.",
  "Patcharin T.",
  "Nattapong K.",
  "Suda R.",
];
