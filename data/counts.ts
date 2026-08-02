/* eslint-disable */
/**
 * CYCLE COUNT (CNT) — mock documents.
 *
 * A count document records what was physically found and compares it with the
 * quantity the system held at snapshot time. It never changes stock: an
 * approved variance is handed to Stock Adjustment, and only a posted
 * adjustment moves a balance. That handoff is the whole point of the module,
 * so the link between the two documents is modelled explicitly.
 *
 * Product, warehouse, lot and serial codes are the real ones the other
 * Inventory modules use, so every line resolves to something that exists.
 */

export const COUNT_TYPES = [
  "Full Physical Count",
  "Cycle Count",
  "Spot Count",
  "Serial Verification",
  "Lot Verification",
  "Location Count",
  "Warehouse Count",
] as const;

export const COUNT_METHODS = [
  "Blind Count",
  "Non-Blind Count",
  "First Count",
  "Dual Count",
  "Serial Verification",
  "Lot Verification",
  "Location Verification",
  "Product Verification",
] as const;

export const COUNT_STATUSES = [
  "Draft",
  "Planned",
  "Assigned",
  "In Progress",
  "Paused",
  "Count Submitted",
  "Variance Review",
  "Recount Required",
  "Recount Submitted",
  "Approved",
  "Adjustment Pending",
  "Adjustment Created",
  "Completed",
  "Rejected",
  "Revision Requested",
  "Cancelled",
  "Exception",
  "Closed",
] as const;

export const COUNT_SCOPES = [
  "All Products in Warehouse",
  "All Products in Selected Locations",
  "Selected Products",
  "Selected Categories",
  "Random Sample",
  "Products Due for Count",
  "Products with Previous Variance",
  "Products with No Recent Movement",
  "Manual Selection",
] as const;

export const ABC_CLASSES = ["A", "B", "C"] as const;

export const COUNT_PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;

export const COUNT_STOCK_STATUSES = [
  "Available",
  "QC Hold",
  "Return Hold",
  "Damaged",
  "Blocked",
  "Expired",
] as const;

export const VARIANCE_TYPES = [
  "No Variance",
  "Positive Variance",
  "Negative Variance",
  "Unexpected Stock",
  "Missing Stock",
  "Serial Mismatch",
  "Lot Mismatch",
  "Location Mismatch",
  "Status Mismatch",
] as const;

export const ROOT_CAUSES = [
  "Counting Error",
  "Unposted Receipt",
  "Unposted Shipment",
  "Wrong Location",
  "Wrong Lot",
  "Wrong Serial",
  "Picking Error",
  "Return Not Posted",
  "Damage Not Recorded",
  "Loss",
  "Theft",
  "UOM Error",
  "Master Data Error",
  "Unknown",
] as const;

export const SERIAL_RESULTS = [
  "Found and Matched",
  "Missing",
  "Unexpected Serial",
  "Wrong Location",
  "Duplicate Scan",
  "Status Mismatch",
  "Damaged",
  "Other",
] as const;

export const COUNT_EXCEPTION_TYPES = [
  "Product Not Found",
  "Unexpected Product",
  "Wrong Location",
  "Wrong Lot",
  "Wrong Serial",
  "Duplicate Serial",
  "Damaged Product",
  "Expired Product",
  "UOM Mismatch",
  "Barcode Mismatch",
  "Movement During Count",
  "Location Inaccessible",
  "Count Sheet Error",
  "Missing Evidence",
  "Other",
] as const;

export const COUNT_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const COUNT_CANCEL_REASONS = [
  "ยกเลิกตามคำขอผู้วางแผน",
  "คลังไม่พร้อมให้ตรวจนับ",
  "กำลังคนไม่เพียงพอ",
  "สร้างแผนซ้ำ",
  "อื่น ๆ",
] as const;

export const COUNT_REJECT_REASONS = [
  "ผลนับไม่น่าเชื่อถือ ต้องนับใหม่",
  "หลักฐานไม่เพียงพอ",
  "ยังไม่ระบุสาเหตุของส่วนต่าง",
  "ผู้นับกับผู้อนุมัติเป็นคนเดียวกัน",
  "อื่น ๆ",
] as const;

export const RECOUNT_REASONS = [
  "ส่วนต่างเกินเกณฑ์ที่ยอมรับได้",
  "Serial ไม่ตรงกับระบบ",
  "สินค้ามูลค่าสูง",
  "พบสินค้าที่ไม่คาดคิด",
  "ผู้ตรวจสอบขอให้นับซ้ำ",
] as const;

/**
 * Mock tolerance. Real ERPs make these configurable per warehouse and ABC
 * class; Phase 1 keeps one set and labels it clearly as a mock rule.
 */
export const COUNT_TOLERANCE = {
  qty: 1,
  pct: 2,
  value: 5_000,
  /** Conditions that always force a recount, whatever the tolerance says. */
  alwaysRecount: [
    "Serial Mismatch",
    "Unexpected Stock",
    "Missing Stock",
  ] as string[],
  /** A line above this value is treated as high value. */
  highValue: 20_000,
} as const;

/* ---------- Shapes ---------- */

export interface CntSerial {
  serial: string;
  /** The serial the snapshot expected at this location. */
  expected: boolean;
  scanned: boolean;
  result: string;
  note: string;
}

export interface CntLine {
  line: number;
  code: string;
  name: string;
  barcode: string;
  unit: string;
  cat: string;
  brand: string;
  abc: string;

  warehouse: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;

  stockStatus: string;
  lot: string;
  mfg: string;
  exp: string;
  serialRequired: boolean;

  /** Quantity the system held when the snapshot was taken. */
  systemQty: number;
  unitCost: number;

  /** null until the counter enters a number. */
  firstCount: number | null;
  recount: number | null;
  /** What the supervisor settled on; falls back to the latest count. */
  finalCount: number | null;

  /** Package maths the counter may use instead of a flat number. */
  packages: number;
  unitsPerPackage: number;
  looseUnits: number;

  serials: CntSerial[];

  counter: string;
  countTime: string;
  rootCause: string;
  reviewStatus: string;
  /** Approved variance excluded from the adjustment handoff, with authority. */
  excluded: boolean;
  excludeReason: string;
  note: string;
}

export interface CntException {
  code: string;
  type: string;
  severity: string;
  product: string;
  location: string;
  expected: number;
  actual: number;
  description: string;
  responsible: string;
  resolution: string;
  followUp: string;
  status: string;
}

export interface CntMovementWarning {
  when: string;
  type: string;
  doc: string;
  product: string;
  qty: number;
  user: string;
  decision: string;
}

export interface Count {
  code: string;
  countDate: string;
  type: string;
  method: string;
  scope: string;
  priority: string;
  status: string;
  approvalStatus: string;

  scheduledStart: string;
  scheduledEnd: string;
  /** When the system quantities on the lines were frozen. */
  snapshotAt: string;

  warehouse: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  category: string;
  abcClass: string;
  statusScope: string;

  counter: string;
  secondaryCounter: string;
  supervisor: string;
  requestedBy: string;
  assignedAt: string;
  startedAt: string;
  submittedAt: string;
  reviewedAt: string;
  approvedBy: string;
  approvedAt: string;

  reference: string;
  description: string;
  instructions: string;

  rejectReason: string;
  cancelReason: string;
  reopenReason: string;
  recountReason: string;
  /** Count round: 1 for the first pass, 2 once a recount is under way. */
  round: number;

  /** Set once the variance has been handed to Stock Adjustment. */
  adjustmentRef: string;
  adjustmentStatus: string;

  lines: CntLine[];
  exceptions: CntException[];
  movements: CntMovementWarning[];
  evidence: { name: string; type: string; by: string; when: string }[];

  history: { t: string; d: string; u: string; when: string; kind: string }[];
  audit: {
    event: string;
    user: string;
    when: string;
    field: string;
    from: string;
    to: string;
    kind: string;
  }[];

  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

/* ---------- Seed helpers ---------- */

interface ProductRef {
  code: string;
  name: string;
  unit: string;
  cat: string;
  brand: string;
  barcode: string;
  abc: string;
  cost: number;
  serialTracked: boolean;
}

/** The real product master, in the shape the count sheet needs. */
const P: Record<string, ProductRef> = {
  "AA-TH003-WL": {
    code: "AA-TH003-WL",
    name: "A-FLEX PU40 (White)",
    unit: "Tube",
    cat: "Sealant",
    brand: "A-FLEX",
    barcode: "8851234000131",
    abc: "A",
    cost: 82,
    serialTracked: false,
  },
  "AA-TH003-GR": {
    code: "AA-TH003-GR",
    name: "A-FLEX PU40 (Grey)",
    unit: "Tube",
    cat: "Sealant",
    brand: "A-FLEX",
    barcode: "8851234000148",
    abc: "A",
    cost: 82,
    serialTracked: false,
  },
  "AA-TH004-BK": {
    code: "AA-TH004-BK",
    name: "A-FLEX PU40 (Black)",
    unit: "Tube",
    cat: "Sealant",
    brand: "A-FLEX",
    barcode: "8851234000155",
    abc: "B",
    cost: 104,
    serialTracked: false,
  },
  "AB-AC001": {
    code: "AB-AC001",
    name: "A-ACRYLIC 100% (White)",
    unit: "Tube",
    cat: "Acrylic",
    brand: "A-ACRYLIC",
    barcode: "8851234000162",
    abc: "B",
    cost: 61,
    serialTracked: false,
  },
  "AT-SL001": {
    code: "AT-SL001",
    name: "A-SILICONE Light Body",
    unit: "Tube",
    cat: "Silicone",
    brand: "A-SILICONE",
    barcode: "8851234000179",
    abc: "C",
    cost: 74,
    serialTracked: false,
  },
  "AT-GL001": {
    code: "AT-GL001",
    name: "A-FACTORY Curing Light Kit",
    unit: "Box",
    cat: "Accessory",
    brand: "A-FACTORY",
    barcode: "8851234000186",
    abc: "A",
    cost: 168,
    serialTracked: true,
  },
  "AT-MD001": {
    code: "AT-MD001",
    name: "A-FACTORY Mixing Pad",
    unit: "Box",
    cat: "Accessory",
    brand: "A-FACTORY",
    barcode: "8851234000193",
    abc: "C",
    cost: 98,
    serialTracked: true,
  },
  "AT-BR002": {
    code: "AT-BR002",
    name: "A-FACTORY Bracket Set",
    unit: "Set",
    cat: "Accessory",
    brand: "A-FACTORY",
    barcode: "8851234000209",
    abc: "A",
    cost: 610,
    serialTracked: true,
  },
};

interface LineSeed {
  code: string;
  wh: [string, string, string, string];
  status?: string;
  lot?: string;
  exp?: string;
  system: number;
  first?: number | null;
  recount?: number | null;
  final?: number | null;
  packages?: number;
  perPackage?: number;
  loose?: number;
  serials?: [string, boolean, boolean, string][];
  rootCause?: string;
  review?: string;
  excluded?: boolean;
  note?: string;
}

const mkLine = (n: number, s: LineSeed, counter: string, when: string): CntLine => {
  const p = P[s.code];
  const first = s.first ?? null;
  const recount = s.recount ?? null;
  return {
    line: n,
    code: p.code,
    name: p.name,
    barcode: p.barcode,
    unit: p.unit,
    cat: p.cat,
    brand: p.brand,
    abc: p.abc,

    warehouse: s.wh[0],
    zone: s.wh[1],
    rack: s.wh[2],
    shelf: "01",
    bin: s.wh[3],

    stockStatus: s.status ?? "Available",
    lot: s.lot ?? "",
    mfg: "",
    exp: s.exp ?? "",
    serialRequired: p.serialTracked,

    systemQty: s.system,
    unitCost: p.cost,

    firstCount: first,
    recount,
    finalCount: s.final ?? recount ?? first,

    packages: s.packages ?? 0,
    unitsPerPackage: s.perPackage ?? 0,
    looseUnits: s.loose ?? 0,

    serials: (s.serials ?? []).map(([serial, expected, scanned, result]) => ({
      serial,
      expected,
      scanned,
      result,
      note: "",
    })),

    counter: first === null ? "" : counter,
    countTime: first === null ? "" : when,
    rootCause: s.rootCause ?? "",
    reviewStatus: s.review ?? "Pending",
    excluded: s.excluded ?? false,
    excludeReason: "",
    note: s.note ?? "",
  };
};

interface Seed {
  code: string;
  date: string;
  type: string;
  method: string;
  scope: string;
  status: string;
  approval?: string;
  priority?: string;
  wh: [string, string, string, string];
  category?: string;
  abc?: string;
  statusScope?: string;
  counter: string;
  secondary?: string;
  supervisor: string;
  requestedBy: string;
  reference?: string;
  description: string;
  instructions?: string;
  round?: number;
  recountReason?: string;
  rejectReason?: string;
  cancelReason?: string;
  adjustmentRef?: string;
  adjustmentStatus?: string;
  lines: LineSeed[];
  exception?: [string, string, string];
  movement?: [string, string, string, number];
  evidence?: [string, string][];
}

const SEEDS: Seed[] = [
  {
    code: "CNT-2026-000021",
    date: "08/01/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "All Products in Selected Locations",
    status: "In Progress",
    priority: "Normal",
    wh: ["WH-BKK", "A", "", ""],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    reference: "CC-PLAN-2601",
    description: "ตรวจนับรอบประจำเดือน โซน A",
    instructions: "นับตามชั้นวางจากซ้ายไปขวา ห้ามดูยอดระบบ",
    lines: [
      { code: "AA-TH003-WL", wh: ["WH-BKK", "A", "01", "A01"], lot: "LOT-26001", exp: "31/12/2027", system: 120, first: 120 },
      { code: "AA-TH003-GR", wh: ["WH-BKK", "A", "02", "A07"], lot: "LOT-26002", exp: "30/06/2027", system: 85, first: 85 },
      { code: "AB-AC001", wh: ["WH-BKK", "A", "02", "A05"], lot: "LOT-26004", exp: "31/08/2027", system: 64 },
      { code: "AT-SL001", wh: ["WH-BKK", "A", "03", "A09"], lot: "LOT-26005", system: 40 },
    ],
  },
  {
    code: "CNT-2026-000022",
    date: "12/01/2026",
    type: "Spot Count",
    method: "Non-Blind Count",
    scope: "Selected Products",
    status: "Variance Review",
    approval: "Pending Approval",
    priority: "High",
    wh: ["WH-BKK", "A", "01", "A01"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Somchai B.",
    description: "ตรวจนับด่วนหลังลูกค้าแจ้งของขาด",
    lines: [
      {
        code: "AA-TH003-WL",
        wh: ["WH-BKK", "A", "01", "A01"],
        lot: "LOT-26001",
        exp: "31/12/2027",
        system: 100,
        first: 96,
        rootCause: "Picking Error",
        review: "Pending",
      },
    ],
    evidence: [["spot-count-a01.jpg", "Photo"]],
  },
  {
    code: "CNT-2026-000023",
    date: "19/01/2026",
    type: "Serial Verification",
    method: "Serial Verification",
    scope: "Selected Products",
    status: "Recount Required",
    priority: "Critical",
    wh: ["WH-SVC", "S", "01", "S01"],
    counter: "Nattapong K.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับ Serial ของชุดไฟฉายเรซิน",
    round: 1,
    recountReason: "Serial ไม่ตรงกับระบบ",
    lines: [
      {
        code: "AT-GL001",
        wh: ["WH-SVC", "S", "01", "S01"],
        system: 12,
        first: 11,
        serials: [
          ["SN-L001-0001", true, true, "Found and Matched"],
          ["SN-L001-0002", true, true, "Found and Matched"],
          ["SN-L001-0003", true, false, "Missing"],
          ["SN-L001-0004", true, true, "Found and Matched"],
        ],
        rootCause: "Unknown",
        review: "Recount Requested",
      },
    ],
    exception: ["Wrong Serial", "High", "ไม่พบ Serial SN-L001-0003 ที่ตำแหน่งที่ระบบระบุ"],
  },
  {
    code: "CNT-2026-000024",
    date: "26/01/2026",
    type: "Full Physical Count",
    method: "Blind Count",
    scope: "All Products in Warehouse",
    status: "Adjustment Pending",
    approval: "Approved",
    priority: "High",
    wh: ["WH-SVC", "", "", ""],
    counter: "Nattapong K.",
    secondary: "Suda R.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    reference: "FULL-2601",
    description: "ตรวจนับประจำปีคลังบริการ",
    adjustmentStatus: "Adjustment Pending",
    lines: [
      { code: "AT-MD001", wh: ["WH-SVC", "S", "01", "S01"], system: 60, first: 66, rootCause: "Unposted Receipt", review: "Accepted" },
      { code: "AT-GL001", wh: ["WH-SVC", "S", "02", "S08"], system: 24, first: 24, review: "Accepted" },
      { code: "AT-BR002", wh: ["WH-SVC", "S", "01", "S05"], system: 8, first: 6, rootCause: "Loss", review: "Accepted" },
      { code: "AT-SL001", wh: ["WH-SVC", "S", "01", "S02"], lot: "LOT-26005", system: 30, first: 30, review: "Accepted" },
    ],
    evidence: [["full-count-svc.xlsx", "Count Sheet"]],
  },
  {
    code: "CNT-2026-000025",
    date: "02/02/2026",
    type: "Lot Verification",
    method: "Lot Verification",
    scope: "Selected Products",
    status: "Completed",
    approval: "Approved",
    wh: ["WH-BKK", "A", "02", "A05"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับแยกตาม Lot ของกาวยึดติด",
    lines: [
      { code: "AB-AC001", wh: ["WH-BKK", "A", "02", "A05"], lot: "LOT-26004", exp: "31/08/2027", system: 120, first: 120, review: "Accepted" },
      { code: "AB-AC001", wh: ["WH-BKK", "A", "02", "A06"], lot: "LOT-26012", exp: "31/10/2027", system: 40, first: 40, review: "Accepted" },
    ],
  },
];

const MORE: Seed[] = [
  {
    code: "CNT-2026-000026",
    date: "09/02/2026",
    type: "Cycle Count",
    method: "Non-Blind Count",
    scope: "Products with Previous Variance",
    status: "Draft",
    wh: ["WH-BKK", "B", "", ""],
    counter: "",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ติดตามสินค้าที่เคยมีส่วนต่าง",
    lines: [{ code: "AT-SL001", wh: ["WH-BKK", "B", "01", "B01"], lot: "LOT-26005", system: 25 }],
  },
  {
    code: "CNT-2026-000027",
    date: "16/02/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Random Sample",
    status: "Planned",
    wh: ["WH-CNX", "C", "", ""],
    counter: "Suda R.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "สุ่มตรวจนับสาขาเชียงใหม่",
    lines: [
      { code: "AA-TH003-WL", wh: ["WH-CNX", "C", "01", "C01"], lot: "LOT-26001", system: 45 },
      { code: "AT-MD001", wh: ["WH-CNX", "C", "01", "C03"], system: 30 },
    ],
  },
  {
    code: "CNT-2026-000028",
    date: "23/02/2026",
    type: "Location Count",
    method: "Location Verification",
    scope: "All Products in Selected Locations",
    status: "Assigned",
    wh: ["WH-BKK", "B", "02", "B03"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจสอบตำแหน่งจัดเก็บโซน B",
    lines: [
      { code: "AT-SL001", wh: ["WH-BKK", "B", "02", "B03"], lot: "LOT-26005", system: 18 },
      { code: "AB-AC001", wh: ["WH-BKK", "B", "02", "B04"], lot: "LOT-26004", system: 22 },
    ],
  },
  {
    code: "CNT-2026-000029",
    date: "02/03/2026",
    type: "Spot Count",
    method: "Non-Blind Count",
    scope: "Selected Products",
    status: "Count Submitted",
    wh: ["WH-BKK", "A", "01", "A03"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Warin S.",
    description: "ตรวจนับหลังพบกล่องเปิด",
    lines: [
      {
        code: "AA-TH004-BK",
        wh: ["WH-BKK", "A", "01", "A03"],
        lot: "LOT-26003",
        system: 50,
        first: 50,
        review: "Pending",
      },
    ],
  },
  {
    code: "CNT-2026-000030",
    date: "09/03/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Selected Categories",
    status: "Variance Review",
    approval: "Pending Approval",
    wh: ["WH-BKK", "A", "", ""],
    category: "Accessory",
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับหมวดอุปกรณ์เสริม",
    lines: [
      { code: "AT-MD001", wh: ["WH-BKK", "A", "01", "A02"], system: 200, first: 203, rootCause: "Counting Error", review: "Pending" },
      { code: "AT-BR002", wh: ["WH-BKK", "A", "04", "A12"], system: 12, first: 12, review: "Accepted" },
    ],
  },
  {
    code: "CNT-2026-000031",
    date: "16/03/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Products Due for Count",
    status: "Recount Submitted",
    wh: ["WH-BKK", "A", "02", "A07"],
    counter: "Warin S.",
    secondary: "Suda R.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "นับซ้ำหลังพบส่วนต่างเกินเกณฑ์",
    round: 2,
    recountReason: "ส่วนต่างเกินเกณฑ์ที่ยอมรับได้",
    lines: [
      {
        code: "AA-TH003-GR",
        wh: ["WH-BKK", "A", "02", "A07"],
        lot: "LOT-26002",
        system: 90,
        first: 78,
        recount: 88,
        rootCause: "Counting Error",
        review: "Pending",
      },
    ],
  },
  {
    code: "CNT-2026-000032",
    date: "23/03/2026",
    type: "Cycle Count",
    method: "Non-Blind Count",
    scope: "Selected Products",
    status: "Adjustment Created",
    approval: "Approved",
    wh: ["WH-BKK", "A", "01", "A01"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    reference: "CC-PLAN-2603",
    description: "ตรวจนับสินค้าหมุนเวียนเร็ว",
    adjustmentRef: "ADJ-2026-000027",
    adjustmentStatus: "Adjustment Created",
    lines: [
      {
        code: "AA-TH003-GR",
        wh: ["WH-BKK", "A", "02", "A07"],
        lot: "LOT-26002",
        system: 100,
        first: 109,
        rootCause: "Unposted Receipt",
        review: "Accepted",
      },
    ],
    evidence: [["count-sheet-cc14.xlsx", "Count Sheet"]],
  },
  {
    code: "CNT-2026-000033",
    date: "30/03/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "All Products in Selected Locations",
    status: "Completed",
    approval: "Approved",
    wh: ["WH-CNX", "C", "01", "C01"],
    counter: "Suda R.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับโซน C สาขาเชียงใหม่",
    adjustmentRef: "ADJ-2026-000028",
    adjustmentStatus: "Adjustment Created",
    lines: [
      {
        code: "AA-TH003-WL",
        wh: ["WH-CNX", "C", "01", "C01"],
        lot: "LOT-26001",
        system: 60,
        first: 55,
        rootCause: "Loss",
        review: "Accepted",
      },
      { code: "AT-MD001", wh: ["WH-CNX", "C", "01", "C03"], system: 40, first: 40, review: "Accepted" },
    ],
    evidence: [["count-sheet-cc15.xlsx", "Count Sheet"]],
  },
  {
    code: "CNT-2026-000034",
    date: "06/04/2026",
    type: "Warehouse Count",
    method: "Dual Count",
    scope: "All Products in Warehouse",
    status: "Paused",
    wh: ["WH-BKK-COLD", "C", "01", "CO1"],
    counter: "Suda R.",
    secondary: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับห้องเย็น หยุดชั่วคราวเพราะระบบทำความเย็นขัดข้อง",
    lines: [
      { code: "AT-SL001", wh: ["WH-BKK-COLD", "C", "01", "CO1"], lot: "LOT-26005", exp: "31/12/2026", system: 35, first: 35 },
      { code: "AA-TH004-BK", wh: ["WH-BKK-COLD", "C", "01", "CO2"], lot: "LOT-26003", system: 28 },
    ],
    exception: ["Location Inaccessible", "Medium", "ห้องเย็นปิดซ่อมบำรุงระหว่างการนับ"],
  },
  {
    code: "CNT-2026-000035",
    date: "13/04/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Selected Products",
    status: "Variance Review",
    approval: "Pending Approval",
    priority: "High",
    wh: ["WH-QTY", "Q", "01", "QC-BAY"],
    statusScope: "QC Hold",
    counter: "Suda R.",
    supervisor: "Patcharin T.",
    requestedBy: "Suda R.",
    description: "ตรวจนับสินค้าที่รอผลตรวจคุณภาพ",
    lines: [
      {
        code: "AA-TH004-BK",
        wh: ["WH-QTY", "Q", "01", "QC-BAY"],
        status: "QC Hold",
        lot: "LOT-26003",
        system: 60,
        first: 0,
        rootCause: "Wrong Location",
        review: "Pending",
      },
    ],
    movement: ["05/04/2026 14:20", "Put Away", "PA25060015", 12],
  },
  {
    code: "CNT-2026-000036",
    date: "20/04/2026",
    type: "Spot Count",
    method: "Non-Blind Count",
    scope: "Selected Products",
    status: "Completed",
    approval: "Not Required",
    wh: ["WH-BKK", "A", "01", "A01"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Warin S.",
    description: "ตรวจนับยืนยันยอดก่อนส่งของ",
    lines: [
      { code: "AA-TH003-WL", wh: ["WH-BKK", "A", "01", "A01"], lot: "LOT-26001", system: 80, first: 80, review: "Accepted" },
    ],
  },
  {
    code: "CNT-2026-000037",
    date: "27/04/2026",
    type: "Serial Verification",
    method: "Serial Verification",
    scope: "Selected Products",
    status: "Completed",
    approval: "Approved",
    wh: ["WH-BKK", "A", "04", "A12"],
    counter: "Nattapong K.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ยืนยัน Serial ชุดเครื่องมือ",
    lines: [
      {
        code: "AT-BR002",
        wh: ["WH-BKK", "A", "04", "A12"],
        system: 3,
        first: 3,
        review: "Accepted",
        serials: [
          ["SN-R002-0001", true, true, "Found and Matched"],
          ["SN-R002-0002", true, true, "Found and Matched"],
          ["SN-R002-0003", true, true, "Found and Matched"],
        ],
      },
    ],
  },
  {
    code: "CNT-2026-000038",
    date: "04/05/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Products with No Recent Movement",
    status: "Rejected",
    approval: "Rejected",
    wh: ["WH-BKK", "B", "04", "B09"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    rejectReason: "ผลนับไม่น่าเชื่อถือ ต้องนับใหม่",
    description: "ตรวจนับสินค้าที่ไม่เคลื่อนไหว",
    lines: [
      { code: "AB-AC001", wh: ["WH-BKK", "B", "04", "B09"], lot: "LOT-26004", system: 30, first: 12, rootCause: "Unknown", review: "Rejected" },
    ],
  },
  {
    code: "CNT-2026-000039",
    date: "11/05/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Selected Products",
    status: "Cancelled",
    wh: ["WH-BKK", "A", "03", "A09"],
    counter: "",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    cancelReason: "กำลังคนไม่เพียงพอ",
    description: "ตรวจนับรอบเสริม",
    lines: [{ code: "AT-SL001", wh: ["WH-BKK", "A", "03", "A09"], lot: "LOT-26005", system: 20 }],
  },
  {
    code: "CNT-2026-000040",
    date: "18/05/2026",
    type: "Cycle Count",
    method: "Non-Blind Count",
    scope: "Selected Categories",
    status: "In Progress",
    wh: ["WH-BKK", "A", "", ""],
    category: "Sealant",
    abc: "A",
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับหมวด Sealant ระดับ A",
    lines: [
      { code: "AA-TH003-WL", wh: ["WH-BKK", "A", "01", "A01"], lot: "LOT-26001", system: 150, first: 150, packages: 12, perPackage: 12, loose: 6 },
      { code: "AA-TH003-GR", wh: ["WH-BKK", "A", "02", "A07"], lot: "LOT-26002", system: 95 },
      { code: "AA-TH004-BK", wh: ["WH-BKK", "A", "01", "A03"], lot: "LOT-26003", system: 45 },
    ],
  },
  {
    code: "CNT-2026-000041",
    date: "25/05/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Selected Products",
    status: "Approved",
    approval: "Approved",
    wh: ["WH-RET", "R", "01", "RET-HOLD"],
    statusScope: "Return Hold",
    counter: "Suda R.",
    supervisor: "Patcharin T.",
    requestedBy: "Suda R.",
    description: "ตรวจนับของคืนที่รอตรวจสอบ",
    lines: [
      {
        code: "AA-TH003-WL",
        wh: ["WH-RET", "R", "01", "RET-HOLD"],
        status: "Return Hold",
        system: 40,
        first: 38,
        rootCause: "Return Not Posted",
        review: "Accepted",
      },
    ],
  },
  {
    code: "CNT-2026-000042",
    date: "01/06/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Manual Selection",
    status: "Exception",
    wh: ["WH-BKK", "A", "01", "A01"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "พบสินค้าที่ไม่มีในระบบระหว่างการนับ",
    lines: [
      {
        code: "AT-SL001",
        wh: ["WH-BKK", "A", "01", "A01"],
        system: 0,
        first: 14,
        rootCause: "Master Data Error",
        review: "Pending",
        note: "พบสินค้าที่ระบบไม่ได้บันทึกไว้ที่บินนี้",
      },
    ],
    exception: ["Unexpected Product", "High", "พบสินค้า AT-SL001 ที่ระบบไม่ได้บันทึกไว้ที่บิน A01"],
  },
  {
    code: "CNT-2026-000043",
    date: "08/06/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Products Due for Count",
    status: "Revision Requested",
    approval: "Revision Requested",
    wh: ["WH-BKK", "B", "01", "B01"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    rejectReason: "กรุณาระบุสาเหตุของส่วนต่างให้ครบทุกบรรทัด",
    description: "ตรวจนับตามรอบที่ครบกำหนด",
    lines: [
      { code: "AT-SL001", wh: ["WH-BKK", "B", "01", "B01"], lot: "LOT-26005", system: 22, first: 19, review: "Pending" },
    ],
  },
  {
    code: "CNT-2026-000044",
    date: "15/06/2026",
    type: "Lot Verification",
    method: "Lot Verification",
    scope: "Selected Products",
    status: "Variance Review",
    approval: "Pending Approval",
    wh: ["WH-BKK", "A", "01", "A01"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "ตรวจนับแยก Lot พบ Lot ที่ไม่อยู่ในระบบ",
    lines: [
      { code: "AA-TH003-WL", wh: ["WH-BKK", "A", "01", "A01"], lot: "LOT-26001", exp: "31/12/2027", system: 70, first: 62, rootCause: "Wrong Lot", review: "Pending" },
      { code: "AA-TH003-WL", wh: ["WH-BKK", "A", "01", "A01"], lot: "LOT-26009", exp: "30/06/2028", system: 0, first: 8, rootCause: "Wrong Lot", review: "Pending" },
    ],
    exception: ["Wrong Lot", "Medium", "พบ LOT-26009 ที่ระบบไม่ได้บันทึกไว้ที่บินนี้"],
  },
  {
    code: "CNT-2026-000045",
    date: "22/06/2026",
    type: "Cycle Count",
    method: "Blind Count",
    scope: "Random Sample",
    status: "Completed",
    approval: "Not Required",
    wh: ["WH-BKK", "A", "02", "A05"],
    counter: "Warin S.",
    supervisor: "Patcharin T.",
    requestedBy: "Patcharin T.",
    description: "สุ่มตรวจนับรายสัปดาห์",
    lines: [
      { code: "AB-AC001", wh: ["WH-BKK", "A", "02", "A05"], lot: "LOT-26004", system: 55, first: 55, review: "Accepted" },
      { code: "AT-MD001", wh: ["WH-BKK", "A", "01", "A02"], system: 90, first: 90, review: "Accepted" },
    ],
  },
];

function build(s: Seed, idx: number): Count {
  const started = ["In Progress", "Paused", "Count Submitted", "Variance Review", "Recount Required", "Recount Submitted", "Approved", "Adjustment Pending", "Adjustment Created", "Completed", "Rejected", "Revision Requested", "Exception"].includes(
    s.status,
  );
  const submitted = ["Count Submitted", "Variance Review", "Recount Required", "Recount Submitted", "Approved", "Adjustment Pending", "Adjustment Created", "Completed", "Rejected", "Revision Requested", "Exception"].includes(
    s.status,
  );

  return {
    code: s.code,
    countDate: s.date,
    type: s.type,
    method: s.method,
    scope: s.scope,
    priority: s.priority ?? "Normal",
    status: s.status,
    approvalStatus: s.approval ?? (submitted ? "Not Submitted" : "Not Required"),

    scheduledStart: `${s.date} 08:00`,
    scheduledEnd: `${s.date} 17:00`,
    snapshotAt: `${s.date} 07:30`,

    warehouse: s.wh[0],
    zone: s.wh[1],
    rack: s.wh[2],
    shelf: "",
    bin: s.wh[3],
    category: s.category ?? "",
    abcClass: s.abc ?? "",
    statusScope: s.statusScope ?? "Available",

    counter: s.counter,
    secondaryCounter: s.secondary ?? "",
    supervisor: s.supervisor,
    requestedBy: s.requestedBy,
    assignedAt: s.counter ? `${s.date} 08:05` : "",
    startedAt: started ? `${s.date} 08:30` : "",
    submittedAt: submitted ? `${s.date} 15:40` : "",
    reviewedAt: ["Approved", "Adjustment Pending", "Adjustment Created", "Completed"].includes(s.status)
      ? `${s.date} 16:20`
      : "",
    approvedBy: s.approval === "Approved" ? "Patcharin T." : "",
    approvedAt: s.approval === "Approved" ? `${s.date} 16:40` : "",

    reference: s.reference ?? "",
    description: s.description,
    instructions: s.instructions ?? "",

    rejectReason: s.rejectReason ?? "",
    cancelReason: s.cancelReason ?? "",
    reopenReason: "",
    recountReason: s.recountReason ?? "",
    round: s.round ?? 1,

    adjustmentRef: s.adjustmentRef ?? "",
    adjustmentStatus: s.adjustmentStatus ?? "Not Required",

    lines: s.lines.map((l, i) => mkLine(i + 1, l, s.counter, `${s.date} 10:${String(10 + i).padStart(2, "0")}`)),

    exceptions: s.exception
      ? [
          {
            code: `CEX-2026-${String(100 + idx).padStart(6, "0")}`,
            type: s.exception[0],
            severity: s.exception[1],
            product: s.lines[0]?.code ?? "",
            location: `${s.wh[1]}-${s.wh[2]}-${s.wh[3]}`,
            expected: s.lines[0]?.system ?? 0,
            actual: s.lines[0]?.first ?? 0,
            description: s.exception[2],
            responsible: "Warehouse",
            resolution: "รอผลตรวจสอบ",
            followUp: s.date,
            status: "Open",
          },
        ]
      : [],

    movements: s.movement
      ? [
          {
            when: s.movement[0],
            type: s.movement[1],
            doc: s.movement[2],
            product: s.lines[0]?.code ?? "",
            qty: s.movement[3],
            user: "Nattapong K.",
            decision: "รอการตัดสินใจของผู้ตรวจสอบ",
          },
        ]
      : [],

    evidence: (s.evidence ?? []).map(([name, type]) => ({
      name,
      type,
      by: s.counter || s.requestedBy,
      when: `${s.date} 15:30`,
    })),

    history: [
      {
        t: s.status,
        d: `สถานะปัจจุบัน ${s.status}`,
        u: s.counter || s.requestedBy,
        when: `${s.date} 16:00`,
        kind: "primary",
      },
      {
        t: "Snapshot taken",
        d: `บันทึกยอดระบบ ณ ${s.date} 07:30`,
        u: "system",
        when: `${s.date} 07:30`,
        kind: "info",
      },
      {
        t: "Created",
        d: `สร้างแผนตรวจนับ · ${s.type} · ${s.method}`,
        u: s.requestedBy,
        when: `${s.date} 07:00`,
        kind: "",
      },
    ],
    audit: [
      {
        event: "Created",
        user: s.requestedBy,
        when: `${s.date} 07:00`,
        field: "Status",
        from: "—",
        to: "Draft",
        kind: "",
      },
    ],

    created: `${s.date} 07:00`,
    createdBy: s.requestedBy,
    updated: `${s.date} 16:00`,
    updatedBy: s.counter || s.requestedBy,
  };
}

export const COUNTS: Count[] = [...SEEDS, ...MORE].map(build);

/** Next document number in the CNT-2026-###### series. */
export function nextCountCode(): string {
  const max = COUNTS.reduce((m, c) => {
    const n = Number(c.code.split("-")[2]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `CNT-2026-${String(max + 1).padStart(6, "0")}`;
}

/** The product master in count-sheet shape, for the scope picker. */
export const COUNT_PRODUCTS = Object.values(P);
