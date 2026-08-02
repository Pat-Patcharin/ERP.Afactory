/* eslint-disable */
/**
 * STOCK ADJUSTMENT (ADJ) — mock documents and reason codes.
 *
 * An adjustment is a controlled correction. It never edits a balance in
 * place: it declares what should change, goes through approval where the
 * reason demands it, and on posting hands the change to Stock Card as a
 * movement. A posted adjustment is corrected by reversal, never by an edit.
 *
 * The reason code is the control point. Each one carries the metadata that
 * decides whether approval is needed, whether evidence is mandatory, which
 * stock statuses it may move between, and whether it may drive stock
 * negative — so the rules live in data, not scattered through the UI.
 */

export const ADJ_ACTIONS = [
  "Increase Quantity",
  "Decrease Quantity",
  "Change Stock Status",
  "Correct Location",
  "Correct Lot",
  "Correct Serial",
  "Correct Expiry",
  "Scrap",
  "Other",
] as const;

export type AdjAction = (typeof ADJ_ACTIONS)[number];

export const ADJ_TYPES = [
  "Positive Adjustment",
  "Negative Adjustment",
  "Stock Status Adjustment",
  "Location Correction",
  "Lot Correction",
  "Serial Correction",
  "Expiry Correction",
  "Scrap",
  "Opening Balance",
  "Cycle Count Variance",
  "Return Disposition",
  "Other",
] as const;

export const ADJ_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Ready to Post",
  "Posted",
  "Rejected",
  "Revision Requested",
  "Cancelled",
  "Reversed",
  "Exception",
  "Closed",
] as const;

export const ADJ_APPROVAL_STATUSES = [
  "Not Required",
  "Not Submitted",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Revision Requested",
] as const;

export const ADJ_PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;

export const ADJ_STOCK_STATUSES = [
  "Available",
  "Reserved",
  "QC Hold",
  "Return Hold",
  "Damaged",
  "Blocked",
  "Expired",
  "Scrap Hold",
  "Rejected",
] as const;

export const ADJ_REF_TYPES = [
  "Manual Request",
  "Cycle Count",
  "Sales Return",
  "Return QC",
  "Service Job",
  "Incident Report",
  "Migration / Opening Balance",
] as const;

export const ADJ_EVIDENCE_TYPES = [
  "Photo",
  "Damage Photo",
  "Expiry Photo",
  "Count Sheet",
  "Incident Report",
  "Approval Document",
  "PDF",
  "Excel",
  "Other File",
] as const;

export const ADJ_EXCEPTION_TYPES = [
  "Insufficient Stock",
  "Reserved Stock Conflict",
  "Negative Inventory Result",
  "Serial Not Found",
  "Duplicate Serial",
  "Lot Not Found",
  "Expired Product",
  "Missing Evidence",
  "Approval Missing",
  "Location Inactive",
  "Status Path Not Allowed",
  "High Value Impact",
  "Other",
] as const;

export const ADJ_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const ADJ_CANCEL_REASONS = [
  "ยกเลิกตามคำขอผู้ร้องขอ",
  "ข้อมูลไม่ถูกต้อง ต้องทำเอกสารใหม่",
  "ตรวจนับซ้ำแล้วยอดตรง",
  "สร้างเอกสารซ้ำ",
  "อื่น ๆ",
] as const;

export const ADJ_REJECT_REASONS = [
  "หลักฐานไม่เพียงพอ",
  "จำนวนไม่สมเหตุสมผล",
  "เส้นทางสถานะไม่ได้รับอนุญาต",
  "ต้องให้ QC ตรวจก่อน",
  "อื่น ๆ",
] as const;

/* ---------- Reason codes ---------- */

export type ReasonGroup = "Positive" | "Negative" | "Status" | "Correction";

export interface ReasonCode {
  code: string;
  group: ReasonGroup;
  /** Approval is forced regardless of quantity or value. */
  approvalRequired: boolean;
  evidenceRequired: boolean;
  roles: string[];
  /** Stock statuses this reason may draw from; empty means any. */
  fromStatus: string[];
  /** Stock statuses this reason may move into; empty means any. */
  toStatus: string[];
  /** Approval also kicks in above this value impact. */
  valueThreshold: number;
  negativeAllowed: boolean;
  defaultTo: string;
}

const WH_USER = ["Warehouse User", "Warehouse Supervisor", "Inventory Manager", "Admin"];
const SUP = ["Warehouse Supervisor", "Inventory Manager", "Admin"];
const MGR = ["Inventory Manager", "Admin"];
const QC = ["QC Inspector", "Inventory Manager", "Admin"];

const reason = (
  code: string,
  group: ReasonGroup,
  over: Partial<ReasonCode> = {},
): ReasonCode => ({
  code,
  group,
  approvalRequired: group === "Negative" || group === "Correction",
  evidenceRequired: false,
  roles: WH_USER,
  fromStatus: [],
  toStatus: [],
  valueThreshold: 20_000,
  negativeAllowed: false,
  defaultTo: "Available",
  ...over,
});

export const REASON_CODES: ReasonCode[] = [
  /* Positive */
  reason("Found Stock", "Positive", { approvalRequired: false, toStatus: ["Available"] }),
  reason("Opening Balance", "Positive", { approvalRequired: true, roles: MGR }),
  reason("Cycle Count Gain", "Positive", { approvalRequired: true, roles: SUP }),
  reason("Supplier Free Goods", "Positive", { approvalRequired: false }),
  reason("Data Correction", "Positive", { approvalRequired: true, roles: SUP }),
  reason("Return Accepted", "Positive", { approvalRequired: false, roles: QC }),
  reason("Other Positive", "Positive", { approvalRequired: true }),

  /* Negative */
  reason("Lost Stock", "Negative", { evidenceRequired: true, roles: SUP }),
  reason("Damaged", "Negative", { evidenceRequired: true, fromStatus: ["Available", "Damaged"] }),
  reason("Expired", "Negative", { evidenceRequired: true, fromStatus: ["Available", "Expired"] }),
  reason("Scrap", "Negative", { evidenceRequired: true, roles: SUP, fromStatus: ["Damaged", "Scrap Hold", "Expired"] }),
  reason("Internal Consumption", "Negative", { approvalRequired: false }),
  reason("Demo Usage", "Negative", { approvalRequired: false }),
  reason("Sample Usage", "Negative", { approvalRequired: false }),
  reason("Cycle Count Loss", "Negative", { roles: SUP }),
  reason("Theft", "Negative", { evidenceRequired: true, roles: MGR }),
  reason("Transit Loss", "Negative", { evidenceRequired: true, roles: SUP }),
  reason("Other Negative", "Negative", {}),

  /* Status */
  reason("QC Release", "Status", {
    approvalRequired: true,
    roles: QC,
    fromStatus: ["QC Hold"],
    toStatus: ["Available"],
  }),
  reason("QC Reject", "Status", {
    approvalRequired: true,
    roles: QC,
    fromStatus: ["QC Hold"],
    toStatus: ["Rejected"],
    defaultTo: "Rejected",
  }),
  reason("Return Accepted", "Status", {
    approvalRequired: true,
    roles: QC,
    fromStatus: ["Return Hold"],
    toStatus: ["Available"],
  }),
  reason("Return Rejected", "Status", {
    approvalRequired: true,
    roles: QC,
    fromStatus: ["Return Hold"],
    toStatus: ["Damaged", "Scrap Hold"],
    defaultTo: "Damaged",
  }),
  reason("Damage Isolation", "Status", {
    approvalRequired: false,
    evidenceRequired: true,
    fromStatus: ["Available"],
    toStatus: ["Damaged"],
    defaultTo: "Damaged",
  }),
  reason("Expiry Hold", "Status", {
    approvalRequired: false,
    evidenceRequired: true,
    fromStatus: ["Available"],
    toStatus: ["Expired"],
    defaultTo: "Expired",
  }),
  reason("Recall Hold", "Status", {
    approvalRequired: true,
    roles: MGR,
    fromStatus: ["Available"],
    toStatus: ["Blocked"],
    defaultTo: "Blocked",
  }),
  reason("Release Blocked Stock", "Status", {
    approvalRequired: true,
    roles: MGR,
    fromStatus: ["Blocked"],
    toStatus: ["Available"],
  }),
  reason("Management Hold", "Status", {
    approvalRequired: true,
    roles: MGR,
    fromStatus: ["Available"],
    toStatus: ["Blocked"],
    defaultTo: "Blocked",
  }),
  reason("Other Status Change", "Status", { approvalRequired: true }),

  /* Correction */
  reason("Wrong Location", "Correction", { approvalRequired: false, roles: SUP }),
  reason("Wrong Lot", "Correction", { evidenceRequired: true, roles: SUP }),
  reason("Wrong Serial", "Correction", { evidenceRequired: true, roles: SUP }),
  reason("Wrong Expiry", "Correction", { evidenceRequired: true, roles: SUP }),
  reason("Migration Correction", "Correction", { roles: MGR }),
  reason("Historical Data Correction", "Correction", { roles: MGR }),
  reason("Other Correction", "Correction", {}),
];

/** Reason lookup, keyed by "group|code" so QC Release and Return Accepted can
 *  appear in more than one group without colliding. */
export const REASON_MAP = new Map(REASON_CODES.map((r) => [`${r.group}|${r.code}`, r]));

export const reasonsFor = (group: ReasonGroup) =>
  REASON_CODES.filter((r) => r.group === group);

export const findReason = (code: string, group?: ReasonGroup) =>
  (group && REASON_MAP.get(`${group}|${code}`)) ??
  REASON_CODES.find((r) => r.code === code) ??
  null;

/** Approval also kicks in above this quantity, whatever the reason says. */
export const ADJ_APPROVAL_QTY = 50;

/* ---------- Document shape ---------- */

export interface AdjLine {
  line: number;
  code: string;
  name: string;
  unit: string;
  cat: string;
  action: string;
  qty: number;
  statusFrom: string;
  statusTo: string;
  locFrom: string;
  locTo: string;
  lot: string;
  lotTo: string;
  exp: string;
  expTo: string;
  serials: string[];
  serialsTo: string[];
  unitCost: number;
  reason: string;
  note: string;
}

export interface AdjEvidence {
  name: string;
  type: string;
  by: string;
  when: string;
  size: string;
}

export interface AdjException {
  code: string;
  type: string;
  severity: string;
  product: string;
  expected: number;
  actual: number;
  description: string;
  responsible: string;
  resolution: string;
  followUp: string;
  status: string;
}

export interface Adjustment {
  code: string;
  adjDate: string;
  type: string;
  reason: string;
  reasonGroup: ReasonGroup;
  priority: string;
  status: string;
  approvalStatus: string;

  requestedBy: string;
  reviewer: string;
  approvedBy: string;
  approvedDate: string;
  postedBy: string;
  postedDate: string;
  rejectReason: string;
  cancelReason: string;
  reversalReason: string;
  reversalOf: string;
  reversedBy: string;

  refType: string;
  refDoc: string;
  description: string;

  warehouse: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  branch: string;

  items: AdjLine[];
  evidence: AdjEvidence[];
  exceptions: AdjException[];

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

const blankLine = (
  n: number,
  code: string,
  name: string,
  unit: string,
  cat: string,
  action: string,
  qty: number,
  over: Partial<AdjLine> = {},
): AdjLine => ({
  line: n,
  code,
  name,
  unit,
  cat,
  action,
  qty,
  statusFrom: "Available",
  statusTo: "Available",
  locFrom: "",
  locTo: "",
  lot: "",
  lotTo: "",
  exp: "",
  expTo: "",
  serials: [],
  serialsTo: [],
  unitCost: 0,
  reason: "",
  note: "",
  ...over,
});

/* ---------- Seeds ---------- */

interface Seed {
  code: string;
  date: string;
  type: string;
  reason: string;
  group: ReasonGroup;
  status: string;
  approval: string;
  priority?: string;
  wh: [string, string, string, string];
  requestedBy: string;
  reviewer?: string;
  approvedBy?: string;
  postedBy?: string;
  refType?: string;
  refDoc?: string;
  description: string;
  item: [string, string, string, string, number];
  action: string;
  statusFrom?: string;
  statusTo?: string;
  locFrom?: string;
  locTo?: string;
  lot?: string;
  lotTo?: string;
  exp?: string;
  expTo?: string;
  serials?: string[];
  serialsTo?: string[];
  unitCost?: number;
  evidence?: [string, string][];
  exception?: [string, string, string];
  cancelReason?: string;
  rejectReason?: string;
  reversalOf?: string;
  reversedBy?: string;
  reversalReason?: string;
}

const SEEDS: Seed[] = [
  {
    code: "ADJ-2026-000021",
    date: "09/01/2026",
    type: "Negative Adjustment",
    reason: "Damaged",
    group: "Negative",
    status: "Pending Approval",
    approval: "Pending Approval",
    priority: "High",
    wh: ["WH-BKK", "A", "01", "A01"],
    requestedBy: "Warin S.",
    reviewer: "Patcharin T.",
    description: "พบสินค้าหลอดแตกระหว่างจัดเรียงชั้นวาง",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 4],
    action: "Decrease Quantity",
    lot: "LOT-26001",
    exp: "31/12/2027",
    unitCost: 82,
    evidence: [["damage-a01-01.jpg", "Damage Photo"]],
  },
  {
    code: "ADJ-2026-000022",
    date: "15/01/2026",
    type: "Positive Adjustment",
    reason: "Found Stock",
    group: "Positive",
    status: "Posted",
    approval: "Not Required",
    wh: ["WH-BKK", "B", "02", "B03"],
    requestedBy: "Warin S.",
    postedBy: "Warin S.",
    description: "พบสินค้าตกหล่นหลังชั้นวาง นับเพิ่มเข้าระบบ",
    item: ["AB-AC001", "A-ACRYLIC 100% (White)", "Tube", "Acrylic", 6],
    action: "Increase Quantity",
    lot: "LOT-26004",
    exp: "31/08/2027",
    unitCost: 61,
  },
  {
    code: "ADJ-2026-000023",
    date: "22/01/2026",
    type: "Stock Status Adjustment",
    reason: "QC Release",
    group: "Status",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-QTY", "Q", "01", "QC-BAY"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    postedBy: "Suda R.",
    refType: "Return QC",
    refDoc: "QC25060032",
    description: "ปล่อยสินค้าที่ผ่านการตรวจคุณภาพเข้าสู่สต๊อกพร้อมขาย",
    item: ["AA-TH004-BK", "A-FLEX PU40 (Black)", "Tube", "Sealant", 12],
    action: "Change Stock Status",
    statusFrom: "QC Hold",
    statusTo: "Available",
    lot: "LOT-26003",
    unitCost: 104,
  },
  {
    code: "ADJ-2026-000024",
    date: "29/01/2026",
    type: "Location Correction",
    reason: "Wrong Location",
    group: "Correction",
    status: "Approved",
    approval: "Approved",
    wh: ["WH-BKK", "A", "01", "A01"],
    requestedBy: "Warin S.",
    approvedBy: "Patcharin T.",
    description: "บันทึกบินผิดตอนจัดเก็บ ต้องแก้ให้ตรงกับของจริง",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", "Silicone", 12],
    action: "Correct Location",
    locFrom: "A-01-A01",
    locTo: "B-03-B05",
    lot: "LOT-26005",
    unitCost: 74,
  },
  {
    code: "ADJ-2026-000025",
    date: "05/02/2026",
    type: "Serial Correction",
    reason: "Wrong Serial",
    group: "Correction",
    status: "Pending Approval",
    approval: "Pending Approval",
    priority: "High",
    wh: ["WH-SVC", "S", "01", "S01"],
    requestedBy: "Nattapong K.",
    reviewer: "Patcharin T.",
    description: "บันทึก Serial สลับตัวเลขตอนรับเข้า",
    item: ["AT-GL001", "A-FACTORY Curing Light Kit", "Box", "Accessory", 1],
    action: "Correct Serial",
    serials: ["SN-L001-0098"],
    serialsTo: ["SN-L001-0089"],
    unitCost: 168,
    evidence: [["serial-correction.pdf", "Approval Document"]],
  },
  {
    code: "ADJ-2026-000026",
    date: "12/02/2026",
    type: "Negative Adjustment",
    reason: "Expired",
    group: "Negative",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-BKK-COLD", "C", "01", "CO1"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    postedBy: "Suda R.",
    description: "ตัดสินค้าหมดอายุออกจากสต๊อก",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", "Silicone", 8],
    action: "Decrease Quantity",
    statusFrom: "Expired",
    lot: "LOT-26005",
    exp: "31/12/2025",
    unitCost: 74,
    evidence: [["expiry-lot26005.jpg", "Expiry Photo"]],
  },
  {
    code: "ADJ-2026-000027",
    date: "19/02/2026",
    type: "Cycle Count Variance",
    reason: "Cycle Count Gain",
    group: "Positive",
    status: "Approved",
    approval: "Approved",
    wh: ["WH-BKK", "A", "02", "A07"],
    requestedBy: "Warin S.",
    approvedBy: "Patcharin T.",
    refType: "Cycle Count",
    refDoc: "CC-2026-000014",
    description: "ผลนับรอบมากกว่ายอดระบบ 9 หน่วย",
    item: ["AA-TH003-GR", "A-FLEX PU40 (Grey)", "Tube", "Sealant", 9],
    action: "Increase Quantity",
    lot: "LOT-26002",
    unitCost: 82,
    evidence: [["count-sheet-cc14.xlsx", "Count Sheet"]],
  },
  {
    code: "ADJ-2026-000028",
    date: "26/02/2026",
    type: "Cycle Count Variance",
    reason: "Cycle Count Loss",
    group: "Negative",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-CNX", "C", "01", "C01"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    postedBy: "Suda R.",
    refType: "Cycle Count",
    refDoc: "CC-2026-000015",
    description: "ผลนับรอบน้อยกว่ายอดระบบ 5 หน่วย",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 5],
    action: "Decrease Quantity",
    lot: "LOT-26001",
    unitCost: 82,
    evidence: [["count-sheet-cc15.xlsx", "Count Sheet"]],
  },
  {
    code: "ADJ-2026-000029",
    date: "05/03/2026",
    type: "Stock Status Adjustment",
    reason: "Damage Isolation",
    group: "Status",
    status: "Posted",
    approval: "Not Required",
    wh: ["WH-BKK", "A", "01", "A02"],
    requestedBy: "Warin S.",
    postedBy: "Warin S.",
    description: "แยกสินค้าที่บรรจุภัณฑ์เสียหายออกจากยอดพร้อมขาย",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", "Accessory", 7],
    action: "Change Stock Status",
    statusFrom: "Available",
    statusTo: "Damaged",
    unitCost: 98,
    evidence: [["damaged-box.jpg", "Damage Photo"]],
  },
  {
    code: "ADJ-2026-000030",
    date: "12/03/2026",
    type: "Lot Correction",
    reason: "Wrong Lot",
    group: "Correction",
    status: "Draft",
    approval: "Not Submitted",
    wh: ["WH-BKK", "A", "01", "A01"],
    requestedBy: "Warin S.",
    description: "บันทึก Lot ผิดตอนรับเข้า ต้องย้ายไปยัง Lot ที่ถูกต้อง",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 15],
    action: "Correct Lot",
    lot: "LOT-26001",
    lotTo: "LOT-26009",
    exp: "31/12/2027",
    unitCost: 82,
    evidence: [["lot-label-photo.jpg", "Photo"]],
  },
  {
    code: "ADJ-2026-000031",
    date: "19/03/2026",
    type: "Return Disposition",
    reason: "Return Accepted",
    group: "Status",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-RET", "R", "01", "RET-HOLD"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    postedBy: "Suda R.",
    refType: "Sales Return",
    refDoc: "RTN-2026-000021",
    description: "ของคืนผ่านการตรวจแล้ว คืนเข้าสต๊อกพร้อมขาย",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 10],
    action: "Change Stock Status",
    statusFrom: "Return Hold",
    statusTo: "Available",
    unitCost: 82,
  },
  {
    code: "ADJ-2026-000032",
    date: "26/03/2026",
    type: "Scrap",
    reason: "Scrap",
    group: "Negative",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-QTY", "Q", "01", "QC-BAY"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    postedBy: "Suda R.",
    description: "ทำลายสินค้าเสียหายที่ซ่อมไม่ได้",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", "Accessory", 4],
    action: "Scrap",
    statusFrom: "Damaged",
    unitCost: 98,
    evidence: [["scrap-report.pdf", "Incident Report"]],
  },
  {
    code: "ADJ-2026-000033",
    date: "02/04/2026",
    type: "Negative Adjustment",
    reason: "Lost Stock",
    group: "Negative",
    status: "Rejected",
    approval: "Rejected",
    wh: ["WH-BKK", "A", "03", "A09"],
    requestedBy: "Warin S.",
    approvedBy: "Patcharin T.",
    rejectReason: "หลักฐานไม่เพียงพอ",
    description: "หาสินค้าไม่พบระหว่างตรวจนับประจำสัปดาห์",
    item: ["AT-BR002", "A-FACTORY Bracket Set", "Set", "Accessory", 2],
    action: "Decrease Quantity",
    unitCost: 610,
  },
  {
    code: "ADJ-2026-000034",
    date: "09/04/2026",
    type: "Stock Status Adjustment",
    reason: "Recall Hold",
    group: "Status",
    status: "Ready to Post",
    approval: "Approved",
    priority: "Critical",
    wh: ["WH-BKK", "A", "01", "A01"],
    requestedBy: "Patcharin T.",
    approvedBy: "Patcharin T.",
    description: "กันสินค้าล็อตที่ผู้ผลิตแจ้งเรียกคืน",
    item: ["AA-TH003-GR", "A-FLEX PU40 (Grey)", "Tube", "Sealant", 20],
    action: "Change Stock Status",
    statusFrom: "Available",
    statusTo: "Blocked",
    lot: "LOT-26002",
    unitCost: 82,
    evidence: [["recall-notice.pdf", "Approval Document"]],
  },
  {
    code: "ADJ-2026-000035",
    date: "16/04/2026",
    type: "Positive Adjustment",
    reason: "Opening Balance",
    group: "Positive",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-SVC", "S", "01", "S01"],
    requestedBy: "Patcharin T.",
    approvedBy: "Patcharin T.",
    postedBy: "Patcharin T.",
    refType: "Migration / Opening Balance",
    refDoc: "MIG-2026-001",
    description: "ตั้งยอดยกมาของคลังบริการ",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", "Accessory", 30],
    action: "Increase Quantity",
    unitCost: 98,
    evidence: [["opening-balance.xlsx", "Excel"]],
  },
  {
    code: "ADJ-2026-000036",
    date: "23/04/2026",
    type: "Negative Adjustment",
    reason: "Demo Usage",
    group: "Negative",
    status: "Posted",
    approval: "Not Required",
    wh: ["WH-BKK", "A", "01", "A03"],
    requestedBy: "Somchai B.",
    postedBy: "Somchai B.",
    description: "เบิกสินค้าไปสาธิตที่คลินิกลูกค้า",
    item: ["AB-AC001", "A-ACRYLIC 100% (White)", "Tube", "Acrylic", 3],
    action: "Decrease Quantity",
    unitCost: 61,
  },
  {
    code: "ADJ-2026-000037",
    date: "30/04/2026",
    type: "Stock Status Adjustment",
    reason: "QC Reject",
    group: "Status",
    status: "Exception",
    approval: "Approved",
    wh: ["WH-QTY", "Q", "01", "QC-BAY"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    description: "สินค้าไม่ผ่านการตรวจคุณภาพ",
    item: ["AA-TH004-BK", "A-FLEX PU40 (Black)", "Tube", "Sealant", 6],
    action: "Change Stock Status",
    statusFrom: "QC Hold",
    statusTo: "Rejected",
    unitCost: 104,
    exception: ["High Value Impact", "High", "มูลค่าผลกระทบสูงกว่าเกณฑ์ ต้องให้ฝ่ายการเงินตรวจสอบ"],
  },
  {
    code: "ADJ-2026-000038",
    date: "07/05/2026",
    type: "Location Correction",
    reason: "Wrong Location",
    group: "Correction",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-CNX", "C", "01", "C01"],
    requestedBy: "Suda R.",
    approvedBy: "Patcharin T.",
    postedBy: "Suda R.",
    description: "ย้ายบันทึกตำแหน่งให้ตรงกับของจริงที่หน้าคลัง",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 20],
    action: "Correct Location",
    locFrom: "C-01-C01",
    locTo: "C-02-C05",
    lot: "LOT-26001",
    unitCost: 82,
  },
  {
    code: "ADJ-2026-000039",
    date: "14/05/2026",
    type: "Positive Adjustment",
    reason: "Found Stock",
    group: "Positive",
    status: "Reversed",
    approval: "Not Required",
    wh: ["WH-BKK", "B", "01", "B01"],
    requestedBy: "Warin S.",
    postedBy: "Warin S.",
    description: "นับเพิ่มผิดพลาด ภายหลังพบว่าเป็นสินค้าของคลังอื่น",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", "Silicone", 5],
    action: "Increase Quantity",
    unitCost: 74,
    reversedBy: "ADJ-2026-000040",
  },
  {
    code: "ADJ-2026-000040",
    date: "15/05/2026",
    type: "Negative Adjustment",
    reason: "Data Correction",
    group: "Positive",
    status: "Posted",
    approval: "Approved",
    wh: ["WH-BKK", "B", "01", "B01"],
    requestedBy: "Warin S.",
    approvedBy: "Patcharin T.",
    postedBy: "Warin S.",
    refType: "Manual Request",
    refDoc: "ADJ-2026-000039",
    description: "กลับรายการของ ADJ-2026-000039",
    item: ["AT-SL001", "A-SILICONE Light Body", "Tube", "Silicone", 5],
    action: "Decrease Quantity",
    unitCost: 74,
    reversalOf: "ADJ-2026-000039",
    reversalReason: "นับเพิ่มผิดพลาด",
  },
  {
    code: "ADJ-2026-000041",
    date: "21/05/2026",
    type: "Expiry Correction",
    reason: "Wrong Expiry",
    group: "Correction",
    status: "Revision Requested",
    approval: "Revision Requested",
    wh: ["WH-BKK", "A", "01", "A01"],
    requestedBy: "Warin S.",
    approvedBy: "Patcharin T.",
    rejectReason: "กรุณาแนบรูปฉลากวันหมดอายุจากกล่องจริง",
    description: "บันทึกวันหมดอายุผิดจากฉลาก",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 18],
    action: "Correct Expiry",
    lot: "LOT-26001",
    exp: "31/12/2027",
    expTo: "30/06/2028",
    unitCost: 82,
  },
  {
    code: "ADJ-2026-000042",
    date: "28/05/2026",
    type: "Negative Adjustment",
    reason: "Internal Consumption",
    group: "Negative",
    status: "Cancelled",
    approval: "Not Required",
    wh: ["WH-SVC", "S", "01", "S01"],
    requestedBy: "Nattapong K.",
    cancelReason: "ตรวจนับซ้ำแล้วยอดตรง",
    description: "เบิกใช้ภายในทีมบริการ",
    item: ["AT-MD001", "A-FACTORY Mixing Pad", "Box", "Accessory", 5],
    action: "Decrease Quantity",
    unitCost: 98,
  },
  {
    code: "ADJ-2026-000043",
    date: "04/06/2026",
    type: "Stock Status Adjustment",
    reason: "Release Blocked Stock",
    group: "Status",
    status: "Draft",
    approval: "Not Submitted",
    wh: ["WH-QTY", "Q", "01", "QC-BAY"],
    requestedBy: "Patcharin T.",
    description: "ผู้ผลิตยืนยันว่าล็อตนี้ไม่อยู่ในข่ายเรียกคืน",
    item: ["AA-TH004-BK", "A-FLEX PU40 (Black)", "Tube", "Sealant", 5],
    action: "Change Stock Status",
    statusFrom: "Blocked",
    statusTo: "Available",
    lot: "LOT-26003",
    unitCost: 104,
  },
  {
    code: "ADJ-2026-000044",
    date: "11/06/2026",
    type: "Positive Adjustment",
    reason: "Supplier Free Goods",
    group: "Positive",
    status: "Ready to Post",
    approval: "Not Required",
    wh: ["WH-BKK", "A", "01", "A01"],
    requestedBy: "Somchai B.",
    description: "ผู้ขายแถมสินค้าเพิ่มตามโปรโมชั่น",
    item: ["AA-TH003-WL", "A-FLEX PU40 (White)", "Tube", "Sealant", 12],
    action: "Increase Quantity",
    lot: "LOT-26001",
    unitCost: 82,
  },
];

export const ADJUSTMENTS: Adjustment[] = SEEDS.map((s, idx) => {
  const [code, name, unit, cat, qty] = s.item;
  const reasonMeta = findReason(s.reason, s.group);

  const evidence: AdjEvidence[] = (s.evidence ?? []).map(([file, type]) => ({
    name: file,
    type,
    by: s.requestedBy,
    when: `${s.date} 09:20`,
    size: "1.2 MB",
  }));

  return {
    code: s.code,
    adjDate: s.date,
    type: s.type,
    reason: s.reason,
    reasonGroup: s.group,
    priority: s.priority ?? "Normal",
    status: s.status,
    approvalStatus: s.approval,

    requestedBy: s.requestedBy,
    reviewer: s.reviewer ?? "",
    approvedBy: s.approvedBy ?? "",
    approvedDate: s.approvedBy ? `${s.date} 11:00` : "",
    postedBy: s.postedBy ?? "",
    postedDate: s.postedBy ? `${s.date} 14:30` : "",
    rejectReason: s.rejectReason ?? "",
    cancelReason: s.cancelReason ?? "",
    reversalReason: s.reversalReason ?? "",
    reversalOf: s.reversalOf ?? "",
    reversedBy: s.reversedBy ?? "",

    refType: s.refType ?? "Manual Request",
    refDoc: s.refDoc ?? "",
    description: s.description,

    warehouse: s.wh[0],
    zone: s.wh[1],
    rack: s.wh[2],
    shelf: "01",
    bin: s.wh[3],
    branch: s.wh[0] === "WH-CNX" ? "Chiang Mai" : "Bangkok",

    items: [
      blankLine(1, code, name, unit, cat, s.action, qty, {
        statusFrom: s.statusFrom ?? "Available",
        statusTo: s.statusTo ?? reasonMeta?.defaultTo ?? "Available",
        locFrom: s.locFrom ?? "",
        locTo: s.locTo ?? "",
        lot: s.lot ?? "",
        lotTo: s.lotTo ?? "",
        exp: s.exp ?? "",
        expTo: s.expTo ?? "",
        serials: s.serials ?? [],
        serialsTo: s.serialsTo ?? [],
        unitCost: s.unitCost ?? 0,
        reason: s.reason,
      }),
    ],
    evidence,
    exceptions: s.exception
      ? [
          {
            code: `AEX-2026-${String(100 + idx).padStart(6, "0")}`,
            type: s.exception[0],
            severity: s.exception[1],
            product: code,
            expected: qty,
            actual: 0,
            description: s.exception[2],
            responsible: "Warehouse",
            resolution: "รอผลตรวจสอบ",
            followUp: s.date,
            status: "Open",
          },
        ]
      : [],

    history: [
      {
        t: s.status,
        d: `สถานะปัจจุบัน ${s.status}`,
        u: s.postedBy || s.approvedBy || s.requestedBy,
        when: `${s.date} 14:30`,
        kind: "primary",
      },
      {
        t: "Created",
        d: `สร้างใบปรับปรุงสต๊อก · เหตุผล ${s.reason}`,
        u: s.requestedBy,
        when: `${s.date} 09:00`,
        kind: "",
      },
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
    updated: `${s.date} 14:30`,
    updatedBy: s.postedBy || s.approvedBy || s.requestedBy,
  };
});

/** Next document number in the ADJ-2026-###### series. */
export function nextAdjustmentCode(): string {
  const max = ADJUSTMENTS.reduce((m, a) => {
    const n = Number(a.code.split("-")[2]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `ADJ-2026-${String(max + 1).padStart(6, "0")}`;
}
