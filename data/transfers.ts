/* eslint-disable */
/**
 * STOCK TRANSFER (TRF) — mock documents.
 *
 * Transfers move stock between warehouses, locations, bins and stock
 * statuses. They never create or destroy quantity: a direct transfer posts a
 * balanced Transfer Out / Transfer In pair, and a two-step transfer parks the
 * quantity In Transit between the two.
 *
 * Product and warehouse codes are the real ones from the masters, so every
 * line resolves to something that exists. Mutating these arrays is how the
 * prototype persists changes; swap for API calls when ready.
 */

export const TRANSFER_METHODS = ["Direct Transfer", "Two-Step Transfer"] as const;

export const TRANSFER_TYPES = [
  "Warehouse Transfer",
  "Location Transfer",
  "Bin Transfer",
  "Stock Status Transfer",
  "Branch Transfer",
  "Replenishment Transfer",
  "Emergency Transfer",
  "Return Relocation",
  "QC Release Transfer",
  "Damage Isolation Transfer",
  "Other",
] as const;

export const TRANSFER_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Ready to Transfer",
  "Partially Dispatched",
  "Dispatched",
  "In Transit",
  "Partially Received",
  "Received",
  "Completed",
  "Rejected",
  "Revision Requested",
  "Exception",
  "Cancelled",
  "Reversed",
  "Closed",
] as const;

export const TRF_APPROVAL_STATUSES = [
  "Not Required",
  "Not Submitted",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Revision Requested",
] as const;

export const TRF_PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;

export const TRF_STOCK_STATUSES = [
  "Available",
  "QC Hold",
  "Return Hold",
  "Damaged",
  "Blocked",
  "Scrap Hold",
  "In Transit",
] as const;

export const TRF_EXCEPTION_TYPES = [
  "Short Quantity",
  "Excess Quantity",
  "Damaged Product",
  "Wrong Product",
  "Serial Mismatch",
  "Lot Mismatch",
  "Missing Package",
  "Broken Seal",
  "Destination Rejected",
  "Transit Delay",
  "Other",
] as const;

export const TRF_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const TRF_RESPONSIBLE = [
  "Warehouse",
  "Carrier",
  "Destination Warehouse",
  "Supplier",
  "Unknown",
] as const;

export const TRF_CANCEL_REASONS = [
  "ยกเลิกตามคำขอผู้ร้องขอ",
  "สินค้าไม่พร้อมโอน",
  "ปลายทางไม่พร้อมรับ",
  "สร้างเอกสารซ้ำ",
  "เปลี่ยนแผนการกระจายสินค้า",
  "อื่น ๆ",
] as const;

export const TRF_REJECT_REASONS = [
  "ปริมาณสูงเกินความจำเป็น",
  "ปลายทางไม่เหมาะกับสินค้า",
  "ยังไม่ถึงรอบเติมสินค้า",
  "เอกสารข้อมูลไม่ครบ",
  "อื่น ๆ",
] as const;

/** Approval is required above this quantity, or by the rules in the domain. */
export const TRF_APPROVAL_THRESHOLD = 100;

export interface TrfLine {
  line: number;
  code: string;
  name: string;
  unit: string;
  /** Lot for lot-controlled goods; empty when the product is not lot tracked. */
  lot: string;
  exp: string;
  /** One entry per unit for serial-controlled goods. */
  serials: string[];
  requested: number;
  dispatched: number;
  received: number;
  short: number;
  damaged: number;
  /** Overrides the header destination when a line lands somewhere else. */
  dstBin: string;
  dstStatus: string;
  note: string;
}

export interface TrfDispatch {
  code: string;
  date: string;
  by: string;
  qty: number;
  packages: number;
  vehicle: string;
  driver: string;
  seal: string;
  note: string;
  lines: { line: number; qty: number }[];
}

export interface TrfReceipt {
  code: string;
  dispatchRef: string;
  date: string;
  by: string;
  qty: number;
  short: number;
  damaged: number;
  condition: string;
  seal: string;
  reference: string;
  note: string;
  lines: { line: number; qty: number; short: number; damaged: number }[];
}

export interface TrfException {
  code: string;
  type: string;
  severity: string;
  expected: number;
  actual: number;
  description: string;
  responsible: string;
  resolution: string;
  followUp: string;
  status: string;
}

export interface Transfer {
  code: string;
  transferDate: string;
  method: string;
  type: string;
  priority: string;
  status: string;
  approvalStatus: string;

  requestedBy: string;
  assignedTo: string;
  approvedBy: string;
  approvedDate: string;
  rejectReason: string;
  cancelReason: string;
  reversalReason: string;

  expectedDate: string;
  reason: string;
  reference: string;
  remark: string;

  srcWarehouse: string;
  srcZone: string;
  srcRack: string;
  srcShelf: string;
  srcBin: string;
  srcStatus: string;
  srcBranch: string;

  dstWarehouse: string;
  dstZone: string;
  dstRack: string;
  dstShelf: string;
  dstBin: string;
  dstStatus: string;
  dstBranch: string;

  items: TrfLine[];
  dispatches: TrfDispatch[];
  receipts: TrfReceipt[];
  exceptions: TrfException[];

  /** Set when this document reverses another, and on the one reversed. */
  reversalOf: string;
  reversedBy: string;

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

const h = (t: string, d: string, u: string, when: string, kind = "primary") => ({
  t,
  d,
  u,
  when,
  kind,
});

const line = (
  n: number,
  code: string,
  name: string,
  unit: string,
  requested: number,
  extra: Partial<TrfLine> = {},
): TrfLine => ({
  line: n,
  code,
  name,
  unit,
  lot: "",
  exp: "",
  serials: [],
  requested,
  dispatched: 0,
  received: 0,
  short: 0,
  damaged: 0,
  dstBin: "",
  dstStatus: "",
  note: "",
  ...extra,
});

export const TRANSFERS: Transfer[] = [
  /* ---------- Completed direct bin transfer ---------- */
  {
    code: "TRF-2026-000021",
    transferDate: "12/01/2026",
    method: "Direct Transfer",
    type: "Bin Transfer",
    priority: "Normal",
    status: "Completed",
    approvalStatus: "Not Required",
    requestedBy: "Warin S.",
    assignedTo: "Warin S.",
    approvedBy: "",
    approvedDate: "",
    rejectReason: "",
    cancelReason: "",
    reversalReason: "",
    expectedDate: "12/01/2026",
    reason: "จัดโซนหยิบสินค้าใหม่ให้ใกล้จุดแพ็ค",
    reference: "WH-REORG-01",
    remark: "",
    srcWarehouse: "WH-BKK",
    srcZone: "A",
    srcRack: "01",
    srcShelf: "01",
    srcBin: "A01",
    srcStatus: "Available",
    srcBranch: "Bangkok",
    dstWarehouse: "WH-BKK",
    dstZone: "B",
    dstRack: "03",
    dstShelf: "02",
    dstBin: "B05",
    dstStatus: "Available",
    dstBranch: "Bangkok",
    items: [
      line(1, "AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", 12, {
        lot: "LOT-26001",
        exp: "31/12/2027",
        dispatched: 12,
        received: 12,
      }),
    ],
    dispatches: [],
    receipts: [],
    exceptions: [],
    reversalOf: "",
    reversedBy: "",
    history: [
      h("Posted", "โอนย้ายสำเร็จ 12 Tube", "Warin S.", "12/01/2026 09:40", "primary"),
      h("Created", "สร้างใบโอนย้ายแบบตรง", "Warin S.", "12/01/2026 09:32", ""),
    ],
    audit: [
      {
        event: "Posted",
        user: "Warin S.",
        when: "12/01/2026 09:40",
        field: "Status",
        from: "Ready to Transfer",
        to: "Completed",
        kind: "primary",
      },
    ],
    created: "12/01/2026 09:32",
    createdBy: "Warin S.",
    updated: "12/01/2026 09:40",
    updatedBy: "Warin S.",
  },

  /* ---------- Two-step, in transit ---------- */
  {
    code: "TRF-2026-000022",
    transferDate: "05/02/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    priority: "High",
    status: "In Transit",
    approvalStatus: "Approved",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    approvedDate: "05/02/2026 11:20",
    rejectReason: "",
    cancelReason: "",
    reversalReason: "",
    expectedDate: "08/02/2026",
    reason: "เติมสินค้าให้ศูนย์บริการ",
    reference: "REPL-2602-004",
    remark: "ขนส่งรอบบ่าย",
    srcWarehouse: "WH-BKK",
    srcZone: "A",
    srcRack: "01",
    srcShelf: "01",
    srcBin: "A01",
    srcStatus: "Available",
    srcBranch: "Bangkok",
    dstWarehouse: "WH-SVC",
    dstZone: "S",
    dstRack: "01",
    dstShelf: "01",
    dstBin: "S03",
    dstStatus: "Available",
    dstBranch: "Bangkok",
    items: [
      line(1, "AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", 20, {
        lot: "LOT-26001",
        exp: "31/12/2027",
        dispatched: 20,
      }),
    ],
    dispatches: [
      {
        code: "TRD-2026-000012",
        date: "06/02/2026",
        by: "Nattapong K.",
        qty: 20,
        packages: 2,
        vehicle: "1กก-2345",
        driver: "สมพงษ์ ว.",
        seal: "SEAL-004512",
        note: "",
        lines: [{ line: 1, qty: 20 }],
      },
    ],
    receipts: [],
    exceptions: [],
    reversalOf: "",
    reversedBy: "",
    history: [
      h("Dispatched", "จ่ายออก 20 Tube · ซีล SEAL-004512", "Nattapong K.", "06/02/2026 14:10", "warn"),
      h("Approved", "อนุมัติโดยผู้จัดการคลัง", "Patcharin T.", "05/02/2026 11:20", "primary"),
      h("Submitted", "ส่งขออนุมัติ", "Somchai B.", "05/02/2026 10:05", "info"),
      h("Created", "สร้างใบโอนย้ายสองขั้นตอน", "Somchai B.", "05/02/2026 09:50", ""),
    ],
    audit: [
      {
        event: "Dispatched",
        user: "Nattapong K.",
        when: "06/02/2026 14:10",
        field: "Status",
        from: "Ready to Transfer",
        to: "In Transit",
        kind: "warn",
      },
    ],
    created: "05/02/2026 09:50",
    createdBy: "Somchai B.",
    updated: "06/02/2026 14:10",
    updatedBy: "Nattapong K.",
  },

  /* ---------- Partially received with a shortage exception ---------- */
  {
    code: "TRF-2026-000023",
    transferDate: "18/02/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    priority: "Normal",
    status: "Partially Received",
    approvalStatus: "Approved",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    approvedDate: "18/02/2026 10:40",
    rejectReason: "",
    cancelReason: "",
    reversalReason: "",
    expectedDate: "21/02/2026",
    reason: "กระจายสินค้าไปสาขาเชียงใหม่",
    reference: "REPL-2602-011",
    remark: "",
    srcWarehouse: "WH-BKK",
    srcZone: "A",
    srcRack: "02",
    srcShelf: "01",
    srcBin: "A07",
    srcStatus: "Available",
    srcBranch: "Bangkok",
    dstWarehouse: "WH-CNX",
    dstZone: "C",
    dstRack: "01",
    dstShelf: "01",
    dstBin: "C01",
    dstStatus: "Available",
    dstBranch: "Chiang Mai",
    items: [
      line(1, "AA-TH003-GR", "A-FLEX PU40 (Grey)", "Tube", 30, {
        lot: "LOT-26002",
        exp: "30/06/2027",
        dispatched: 30,
        received: 24,
        short: 6,
      }),
    ],
    dispatches: [
      {
        code: "TRD-2026-000015",
        date: "19/02/2026",
        by: "Nattapong K.",
        qty: 30,
        packages: 3,
        vehicle: "2ขข-7788",
        driver: "ประยุทธ ส.",
        seal: "SEAL-004690",
        note: "",
        lines: [{ line: 1, qty: 30 }],
      },
    ],
    receipts: [
      {
        code: "TRR-2026-000009",
        dispatchRef: "TRD-2026-000015",
        date: "21/02/2026",
        by: "Suda R.",
        qty: 24,
        short: 6,
        damaged: 0,
        condition: "Good",
        seal: "Intact",
        reference: "DN-2602-0091",
        note: "ขาด 6 Tube รอตรวจสอบกับต้นทาง",
        lines: [{ line: 1, qty: 24, short: 6, damaged: 0 }],
      },
    ],
    exceptions: [
      {
        code: "TRX-2026-000004",
        type: "Short Quantity",
        severity: "Medium",
        expected: 30,
        actual: 24,
        description: "รับจริงน้อยกว่าที่จ่ายออก 6 Tube",
        responsible: "Carrier",
        resolution: "รอผลตรวจสอบจากผู้ขนส่ง",
        followUp: "28/02/2026",
        status: "Open",
      },
    ],
    reversalOf: "",
    reversedBy: "",
    history: [
      h("Exception raised", "Short Quantity 6 Tube", "Suda R.", "21/02/2026 15:05", "danger"),
      h("Partially received", "รับเข้า 24 จาก 30 Tube", "Suda R.", "21/02/2026 15:00", "warn"),
      h("Dispatched", "จ่ายออก 30 Tube", "Nattapong K.", "19/02/2026 13:20", "warn"),
      h("Approved", "อนุมัติโดยผู้จัดการคลัง", "Patcharin T.", "18/02/2026 10:40", "primary"),
      h("Created", "สร้างใบโอนย้าย", "Somchai B.", "18/02/2026 09:15", ""),
    ],
    audit: [
      {
        event: "Partially received",
        user: "Suda R.",
        when: "21/02/2026 15:00",
        field: "Received Qty",
        from: "0",
        to: "24",
        kind: "warn",
      },
    ],
    created: "18/02/2026 09:15",
    createdBy: "Somchai B.",
    updated: "21/02/2026 15:05",
    updatedBy: "Suda R.",
  },

  /* ---------- QC release status transfer ---------- */
  {
    code: "TRF-2026-000024",
    transferDate: "02/03/2026",
    method: "Direct Transfer",
    type: "QC Release Transfer",
    priority: "High",
    status: "Completed",
    approvalStatus: "Approved",
    requestedBy: "Suda R.",
    assignedTo: "Suda R.",
    approvedBy: "Patcharin T.",
    approvedDate: "02/03/2026 11:00",
    rejectReason: "",
    cancelReason: "",
    reversalReason: "",
    expectedDate: "02/03/2026",
    reason: "ปล่อยสินค้าที่ผ่านการตรวจคุณภาพเข้าสู่สต๊อกพร้อมขาย",
    reference: "QC25060032",
    remark: "",
    srcWarehouse: "WH-QTY",
    srcZone: "Q",
    srcRack: "01",
    srcShelf: "01",
    srcBin: "QC-BAY",
    srcStatus: "QC Hold",
    srcBranch: "Bangkok",
    dstWarehouse: "WH-BKK",
    dstZone: "A",
    dstRack: "01",
    dstShelf: "01",
    dstBin: "A01",
    dstStatus: "Available",
    dstBranch: "Bangkok",
    items: [
      line(1, "AA-TH004-BK", "A-FLEX PU40 (Black)", "Tube", 40, {
        lot: "LOT-26003",
        exp: "31/03/2027",
        dispatched: 40,
        received: 40,
      }),
    ],
    dispatches: [],
    receipts: [],
    exceptions: [],
    reversalOf: "",
    reversedBy: "",
    history: [
      h("Posted", "เปลี่ยนสถานะ QC Hold → Available 40 Tube", "Suda R.", "02/03/2026 11:15", "primary"),
      h("Approved", "อนุมัติการปล่อยสินค้า", "Patcharin T.", "02/03/2026 11:00", "primary"),
      h("Created", "สร้างใบเปลี่ยนสถานะสต๊อก", "Suda R.", "02/03/2026 10:40", ""),
    ],
    audit: [
      {
        event: "Posted",
        user: "Suda R.",
        when: "02/03/2026 11:15",
        field: "Stock Status",
        from: "QC Hold",
        to: "Available",
        kind: "primary",
      },
    ],
    created: "02/03/2026 10:40",
    createdBy: "Suda R.",
    updated: "02/03/2026 11:15",
    updatedBy: "Suda R.",
  },

  /* ---------- Serial-controlled two-step, fully received ---------- */
  {
    code: "TRF-2026-000025",
    transferDate: "10/03/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    priority: "Normal",
    status: "Completed",
    approvalStatus: "Approved",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    approvedDate: "10/03/2026 09:30",
    rejectReason: "",
    cancelReason: "",
    reversalReason: "",
    expectedDate: "12/03/2026",
    reason: "ส่งเครื่องมือไปศูนย์บริการ",
    reference: "SVC-2603-002",
    remark: "",
    srcWarehouse: "WH-BKK",
    srcZone: "A",
    srcRack: "04",
    srcShelf: "01",
    srcBin: "A12",
    srcStatus: "Available",
    srcBranch: "Bangkok",
    dstWarehouse: "WH-SVC",
    dstZone: "S",
    dstRack: "02",
    dstShelf: "01",
    dstBin: "S08",
    dstStatus: "Available",
    dstBranch: "Bangkok",
    items: [
      line(1, "AT-GL001", "A-FACTORY Curing Light Kit", "Box", 3, {
        serials: ["SN-L001-0001", "SN-L001-0002", "SN-L001-0003"],
        dispatched: 3,
        received: 3,
      }),
    ],
    dispatches: [
      {
        code: "TRD-2026-000018",
        date: "11/03/2026",
        by: "Nattapong K.",
        qty: 3,
        packages: 1,
        vehicle: "3คค-1122",
        driver: "วิชัย ก.",
        seal: "SEAL-004811",
        note: "",
        lines: [{ line: 1, qty: 3 }],
      },
    ],
    receipts: [
      {
        code: "TRR-2026-000012",
        dispatchRef: "TRD-2026-000018",
        date: "12/03/2026",
        by: "Suda R.",
        qty: 3,
        short: 0,
        damaged: 0,
        condition: "Good",
        seal: "Intact",
        reference: "DN-2603-0022",
        note: "",
        lines: [{ line: 1, qty: 3, short: 0, damaged: 0 }],
      },
    ],
    exceptions: [],
    reversalOf: "",
    reversedBy: "",
    history: [
      h("Completed", "รับเข้าครบ 3 Box · Serial ตรงทั้งหมด", "Suda R.", "12/03/2026 10:20", "primary"),
      h("Dispatched", "จ่ายออก 3 Box", "Nattapong K.", "11/03/2026 15:40", "warn"),
      h("Approved", "อนุมัติโดยผู้จัดการคลัง", "Patcharin T.", "10/03/2026 09:30", "primary"),
      h("Created", "สร้างใบโอนย้าย", "Somchai B.", "10/03/2026 08:55", ""),
    ],
    audit: [
      {
        event: "Completed",
        user: "Suda R.",
        when: "12/03/2026 10:20",
        field: "Status",
        from: "In Transit",
        to: "Completed",
        kind: "primary",
      },
    ],
    created: "10/03/2026 08:55",
    createdBy: "Somchai B.",
    updated: "12/03/2026 10:20",
    updatedBy: "Suda R.",
  },
];

/* ------------------------------------------------------------------
   The remaining documents are generated from a compact table: same
   shape, less repetition, and every code still resolves to a real
   product and warehouse.
   ------------------------------------------------------------------ */

interface Seed {
  code: string;
  date: string;
  method: string;
  type: string;
  status: string;
  approval: string;
  priority: string;
  src: [string, string, string, string];
  dst: [string, string, string, string];
  srcStatus?: string;
  dstStatus?: string;
  reason: string;
  reference: string;
  requestedBy: string;
  assignedTo: string;
  approvedBy?: string;
  item: [string, string, string, number];
  lot?: string;
  exp?: string;
  serials?: string[];
  dispatched?: number;
  received?: number;
  short?: number;
  damaged?: number;
  exception?: [string, string, string];
  cancelReason?: string;
  rejectReason?: string;
  reversalOf?: string;
  reversedBy?: string;
  reversalReason?: string;
}

const SEEDS: Seed[] = [
  {
    code: "TRF-2026-000026",
    date: "16/03/2026",
    method: "Direct Transfer",
    type: "Location Transfer",
    status: "Completed",
    approval: "Not Required",
    priority: "Low",
    src: ["WH-BKK", "A", "02", "A07"],
    dst: ["WH-BKK", "C", "01", "C02"],
    reason: "ย้ายสินค้าเคลื่อนไหวช้าไปโซนด้านหลัง",
    reference: "WH-REORG-02",
    requestedBy: "Warin S.",
    assignedTo: "Warin S.",
    item: ["AB-AC001", "A-ACRYLIC 100% (White)", "Tube", 25],
    lot: "LOT-26004",
    exp: "31/08/2027",
    dispatched: 25,
    received: 25,
  },
  {
    code: "TRF-2026-000027",
    date: "24/03/2026",
    method: "Two-Step Transfer",
    type: "Replenishment Transfer",
    status: "Partially Dispatched",
    approval: "Approved",
    priority: "High",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-CNX", "C", "01", "C03"],
    reason: "เติมสินค้าขายดีให้สาขา",
    reference: "REPL-2603-021",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", 60],
    dispatched: 35,
  },
  {
    code: "TRF-2026-000028",
    date: "02/04/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Ready to Transfer",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-BKK", "A", "03", "A09"],
    dst: ["WH-SVC", "S", "01", "S05"],
    reason: "สำรองอะไหล่ให้ทีมบริการ",
    reference: "SVC-2604-005",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AT-BR002", "A-FACTORY Bracket Set", "Set", 8],
    serials: ["SN-R002-0001", "SN-R002-0002", "SN-R002-0003"],
  },
  {
    code: "TRF-2026-000029",
    date: "09/04/2026",
    method: "Direct Transfer",
    type: "Damage Isolation Transfer",
    status: "Completed",
    approval: "Approved",
    priority: "High",
    src: ["WH-BKK", "A", "01", "A02"],
    dst: ["WH-QTY", "Q", "01", "QC-BAY"],
    srcStatus: "Available",
    dstStatus: "Damaged",
    reason: "แยกสินค้าที่บรรจุภัณฑ์เสียหายออกจากสต๊อกพร้อมขาย",
    reference: "DMG-2604-003",
    requestedBy: "Warin S.",
    assignedTo: "Warin S.",
    approvedBy: "Patcharin T.",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", 6],
    lot: "LOT-26005",
    exp: "31/12/2026",
    dispatched: 6,
    received: 6,
  },
  {
    code: "TRF-2026-000030",
    date: "15/04/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Pending Approval",
    approval: "Pending Approval",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-CNX", "C", "02", "C05"],
    reason: "เตรียมสินค้ารองรับงานแสดงสินค้า",
    reference: "EVENT-2604",
    requestedBy: "Somchai B.",
    assignedTo: "",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", 150],
    lot: "LOT-26001",
    exp: "31/12/2027",
  },
  {
    code: "TRF-2026-000031",
    date: "21/04/2026",
    method: "Direct Transfer",
    type: "Bin Transfer",
    status: "Draft",
    approval: "Not Submitted",
    priority: "Low",
    src: ["WH-BKK", "B", "02", "B02"],
    dst: ["WH-BKK", "B", "04", "B09"],
    reason: "รวมสินค้ากระจัดกระจายเข้าบินเดียว",
    reference: "",
    requestedBy: "Warin S.",
    assignedTo: "",
    item: ["AB-AC001", "A-ACRYLIC 100% (White)", "Tube", 15],
    lot: "LOT-26004",
    exp: "31/08/2027",
  },
  {
    code: "TRF-2026-000032",
    date: "28/04/2026",
    method: "Two-Step Transfer",
    type: "Emergency Transfer",
    status: "Dispatched",
    approval: "Approved",
    priority: "Critical",
    src: ["WH-BKK", "A", "01", "A03"],
    dst: ["WH-SVC", "S", "01", "S01"],
    reason: "งานซ่อมด่วนที่ศูนย์บริการ",
    reference: "URGENT-2604-01",
    requestedBy: "Nattapong K.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AT-GL001", "A-FACTORY Curing Light Kit", "Box", 2],
    serials: ["SN-L001-0004", "SN-L001-0005"],
    dispatched: 2,
  },
  {
    code: "TRF-2026-000033",
    date: "06/05/2026",
    method: "Direct Transfer",
    type: "Return Relocation",
    status: "Completed",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-RET", "R", "01", "RET-HOLD"],
    dst: ["WH-BKK", "A", "01", "A01"],
    srcStatus: "Return Hold",
    dstStatus: "Available",
    reason: "ของคืนผ่านการตรวจแล้ว คืนสู่สต๊อกพร้อมขาย",
    reference: "RTN-2026-000021",
    requestedBy: "Suda R.",
    assignedTo: "Suda R.",
    approvedBy: "Patcharin T.",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", 18],
    lot: "LOT-26001",
    exp: "31/12/2027",
    dispatched: 18,
    received: 18,
  },
  {
    code: "TRF-2026-000034",
    date: "13/05/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Rejected",
    approval: "Rejected",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-CNX", "C", "01", "C01"],
    reason: "ขอเติมสินค้าเพิ่มรอบพิเศษ",
    reference: "REPL-2605-002",
    requestedBy: "Somchai B.",
    assignedTo: "",
    approvedBy: "Patcharin T.",
    rejectReason: "ยังไม่ถึงรอบเติมสินค้า",
    item: ["AA-TH003-GR", "A-FLEX PU40 (Grey)", "Tube", 120],
    lot: "LOT-26002",
    exp: "30/06/2027",
  },
  {
    code: "TRF-2026-000035",
    date: "20/05/2026",
    method: "Direct Transfer",
    type: "Stock Status Transfer",
    status: "Completed",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-BKK", "A", "02", "A05"],
    dst: ["WH-BKK", "A", "02", "A05"],
    srcStatus: "Blocked",
    dstStatus: "Available",
    reason: "ปลดล็อกสินค้าหลังตรวจสอบเอกสารครบ",
    reference: "BLK-2605-001",
    requestedBy: "Suda R.",
    assignedTo: "Suda R.",
    approvedBy: "Patcharin T.",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", 30],
    dispatched: 30,
    received: 30,
  },
  {
    code: "TRF-2026-000036",
    date: "27/05/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Cancelled",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-SVC", "S", "01", "S02"],
    reason: "เติมสินค้าศูนย์บริการรอบเดือน",
    reference: "REPL-2605-014",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    cancelReason: "เปลี่ยนแผนการกระจายสินค้า",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", 40],
    lot: "LOT-26005",
    exp: "31/12/2026",
  },
  {
    code: "TRF-2026-000037",
    date: "03/06/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Exception",
    approval: "Approved",
    priority: "High",
    src: ["WH-BKK", "A", "01", "A04"],
    dst: ["WH-CNX", "C", "01", "C04"],
    reason: "กระจายสินค้าไปสาขา",
    reference: "REPL-2606-003",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AA-TH004-BK", "A-FLEX PU40 (Black)", "Tube", 24],
    lot: "LOT-26003",
    exp: "31/03/2027",
    dispatched: 24,
    received: 18,
    damaged: 6,
    exception: ["Damaged Product", "High", "กล่องสินค้าเปียกน้ำระหว่างขนส่ง 6 Tube"],
  },
  {
    code: "TRF-2026-000038",
    date: "11/06/2026",
    method: "Direct Transfer",
    type: "Bin Transfer",
    status: "Completed",
    approval: "Not Required",
    priority: "Low",
    src: ["WH-SVC", "S", "01", "S01"],
    dst: ["WH-SVC", "S", "02", "S06"],
    reason: "จัดบินตามความถี่การใช้งาน",
    reference: "",
    requestedBy: "Suda R.",
    assignedTo: "Suda R.",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", 10],
    dispatched: 10,
    received: 10,
  },
  {
    code: "TRF-2026-000039",
    date: "18/06/2026",
    method: "Two-Step Transfer",
    type: "Branch Transfer",
    status: "In Transit",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-CNX", "C", "01", "C01"],
    reason: "ย้ายสต๊อกระหว่างสาขา",
    reference: "BR-2606-001",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", 45],
    lot: "LOT-26001",
    exp: "31/12/2027",
    dispatched: 45,
  },
  {
    code: "TRF-2026-000040",
    date: "25/06/2026",
    method: "Direct Transfer",
    type: "Location Transfer",
    status: "Revision Requested",
    approval: "Revision Requested",
    priority: "Normal",
    src: ["WH-BKK", "B", "01", "B01"],
    dst: ["WH-BKK", "B", "03", "B07"],
    reason: "ปรับผังการจัดเก็บ",
    reference: "WH-REORG-03",
    requestedBy: "Warin S.",
    assignedTo: "",
    approvedBy: "Patcharin T.",
    rejectReason: "ระบุบินปลายทางไม่ชัดเจน กรุณาแก้ไข",
    item: ["AB-AC001", "A-ACRYLIC 100% (White)", "Tube", 20],
    lot: "LOT-26004",
    exp: "31/08/2027",
  },
  {
    code: "TRF-2026-000041",
    date: "02/07/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Received",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-SVC", "S", "01", "S04"],
    reason: "เติมสินค้าศูนย์บริการ",
    reference: "REPL-2607-002",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AA-TH003-GR", "A-FLEX PU40 (Grey)", "Tube", 16],
    lot: "LOT-26002",
    exp: "30/06/2027",
    dispatched: 16,
    received: 16,
  },
  {
    code: "TRF-2026-000042",
    date: "09/07/2026",
    method: "Direct Transfer",
    type: "Bin Transfer",
    status: "Reversed",
    approval: "Not Required",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-BKK", "B", "02", "B03"],
    reason: "ย้ายบินผิดตำแหน่ง",
    reference: "",
    requestedBy: "Warin S.",
    assignedTo: "Warin S.",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", 10],
    lot: "LOT-26005",
    exp: "31/12/2026",
    dispatched: 10,
    received: 10,
    reversedBy: "TRF-2026-000043",
  },
  {
    code: "TRF-2026-000043",
    date: "09/07/2026",
    method: "Direct Transfer",
    type: "Bin Transfer",
    status: "Completed",
    approval: "Approved",
    priority: "High",
    src: ["WH-BKK", "B", "02", "B03"],
    dst: ["WH-BKK", "A", "01", "A01"],
    reason: "กลับรายการโอนย้ายที่ระบุบินผิด",
    reference: "TRF-2026-000042",
    requestedBy: "Warin S.",
    assignedTo: "Warin S.",
    approvedBy: "Patcharin T.",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", 10],
    lot: "LOT-26005",
    exp: "31/12/2026",
    dispatched: 10,
    received: 10,
    reversalOf: "TRF-2026-000042",
    reversalReason: "ระบุบินปลายทางผิด",
  },
  {
    code: "TRF-2026-000044",
    date: "16/07/2026",
    method: "Two-Step Transfer",
    type: "Warehouse Transfer",
    status: "Approved",
    approval: "Approved",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A06"],
    dst: ["WH-CNX", "C", "01", "C06"],
    reason: "เติมสินค้าประจำเดือน",
    reference: "REPL-2607-018",
    requestedBy: "Somchai B.",
    assignedTo: "Nattapong K.",
    approvedBy: "Patcharin T.",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", 50],
  },
  {
    code: "TRF-2026-000045",
    date: "23/07/2026",
    method: "Direct Transfer",
    type: "Bin Transfer",
    status: "Ready to Transfer",
    approval: "Not Required",
    priority: "Normal",
    src: ["WH-BKK", "A", "01", "A01"],
    dst: ["WH-BKK", "A", "02", "A08"],
    reason: "ย้ายสินค้าใกล้หมดอายุมาโซนหน้า",
    reference: "FEFO-2607",
    requestedBy: "Warin S.",
    assignedTo: "",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", 22],
    lot: "LOT-26001",
    exp: "31/12/2027",
  },
];

for (const s of SEEDS) {
  const [code, name, unit, qty] = s.item;
  const dispatched = s.dispatched ?? 0;
  const received = s.received ?? 0;
  const short = s.short ?? 0;
  const damaged = s.damaged ?? 0;
  const twoStep = s.method === "Two-Step Transfer";
  const n = TRANSFERS.length;

  TRANSFERS.push({
    code: s.code,
    transferDate: s.date,
    method: s.method,
    type: s.type,
    priority: s.priority,
    status: s.status,
    approvalStatus: s.approval,
    requestedBy: s.requestedBy,
    assignedTo: s.assignedTo,
    approvedBy: s.approvedBy ?? "",
    approvedDate: s.approvedBy ? `${s.date} 10:00` : "",
    rejectReason: s.rejectReason ?? "",
    cancelReason: s.cancelReason ?? "",
    reversalReason: s.reversalReason ?? "",
    expectedDate: s.date,
    reason: s.reason,
    reference: s.reference,
    remark: "",

    srcWarehouse: s.src[0],
    srcZone: s.src[1],
    srcRack: s.src[2],
    srcShelf: "01",
    srcBin: s.src[3],
    srcStatus: s.srcStatus ?? "Available",
    srcBranch: s.src[0] === "WH-CNX" ? "Chiang Mai" : "Bangkok",

    dstWarehouse: s.dst[0],
    dstZone: s.dst[1],
    dstRack: s.dst[2],
    dstShelf: "01",
    dstBin: s.dst[3],
    dstStatus: s.dstStatus ?? "Available",
    dstBranch: s.dst[0] === "WH-CNX" ? "Chiang Mai" : "Bangkok",

    items: [
      line(1, code, name, unit, qty, {
        lot: s.lot ?? "",
        exp: s.exp ?? "",
        serials: s.serials ?? [],
        dispatched,
        received,
        short,
        damaged,
      }),
    ],

    dispatches:
      twoStep && dispatched > 0
        ? [
            {
              code: `TRD-2026-${String(100 + n).padStart(6, "0")}`,
              date: s.date,
              by: s.assignedTo || s.requestedBy,
              qty: dispatched,
              packages: Math.max(1, Math.ceil(dispatched / 20)),
              vehicle: "1กก-2345",
              driver: "สมพงษ์ ว.",
              seal: `SEAL-${String(5000 + n).padStart(6, "0")}`,
              note: "",
              lines: [{ line: 1, qty: dispatched }],
            },
          ]
        : [],

    receipts:
      twoStep && received > 0
        ? [
            {
              code: `TRR-2026-${String(100 + n).padStart(6, "0")}`,
              dispatchRef: `TRD-2026-${String(100 + n).padStart(6, "0")}`,
              date: s.date,
              by: "Suda R.",
              qty: received,
              short,
              damaged,
              condition: damaged ? "Damaged" : "Good",
              seal: "Intact",
              reference: "",
              note: "",
              lines: [{ line: 1, qty: received, short, damaged }],
            },
          ]
        : [],

    exceptions: s.exception
      ? [
          {
            code: `TRX-2026-${String(100 + n).padStart(6, "0")}`,
            type: s.exception[0],
            severity: s.exception[1],
            expected: dispatched,
            actual: received,
            description: s.exception[2],
            responsible: "Carrier",
            resolution: "รอผลตรวจสอบ",
            followUp: s.date,
            status: "Open",
          },
        ]
      : [],

    reversalOf: s.reversalOf ?? "",
    reversedBy: s.reversedBy ?? "",

    history: [
      h(s.status, `สถานะปัจจุบัน ${s.status}`, s.assignedTo || s.requestedBy, `${s.date} 10:30`, "primary"),
      h("Created", "สร้างใบโอนย้าย", s.requestedBy, `${s.date} 09:00`, ""),
    ],
    audit: [
      {
        event: "Created",
        user: s.requestedBy,
        when: `${s.date} 09:00`,
        field: "Status",
        from: "—",
        to: "Draft",
        kind: "",
      },
    ],

    created: `${s.date} 09:00`,
    createdBy: s.requestedBy,
    updated: `${s.date} 10:30`,
    updatedBy: s.assignedTo || s.requestedBy,
  });
}

/** Next document number in the TRF-2026-###### series. */
export function nextTransferCode(): string {
  const max = TRANSFERS.reduce((m, t) => {
    const n = Number(t.code.split("-")[2]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `TRF-2026-${String(max + 1).padStart(6, "0")}`;
}
