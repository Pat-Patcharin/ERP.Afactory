/* eslint-disable */
/**
 * LOT TRACKING — the overlay that turns scattered lot numbers into traceable
 * lots.
 *
 * A finding worth stating plainly: the modules built before this one number
 * their lots independently. Stock Inquiry generates LOT-260xx, Put Away writes
 * LOT-AFX-2506, Picking writes LOT-2506-A1, Sales Return writes LOT-2412-009.
 * Nothing joined them, so no lot could be followed from supplier to customer.
 *
 * Lot Tracking does not rewrite those documents. It builds the lot master as
 * the UNION of every lot number the ERP has ever written, and declares the
 * equivalences below so the lots that genuinely are the same physical batch
 * trace end to end. Everything else traces as far as its own data allows and
 * shows an honest empty state beyond that.
 *
 * Nothing in this module edits inventory. Recall Hold hands off to Stock
 * Adjustment exactly like Cycle Count does.
 */

export const LOT_STATUSES = [
  "Active",
  "Near Expiry",
  "Expired",
  "QC Hold",
  "Released",
  "Blocked",
  "Recall Hold",
  "Under Investigation",
  "Depleted",
  "Closed",
  "Corrected",
] as const;

export const LOT_STOCK_STATUSES = [
  "Available",
  "Reserved",
  "QC Hold",
  "Return Hold",
  "Damaged",
  "Blocked",
  "Expired",
  "Recall Hold",
  "In Transit",
] as const;

export const EXPIRY_CLASSES = [
  "Expired",
  "Expires within 30 days",
  "Expires within 60 days",
  "Expires within 90 days",
  "Expires within 180 days",
  "More than 180 days",
  "No Expiry Date",
] as const;

export const RECALL_TYPES = [
  "Internal Investigation",
  "Supplier Recall",
  "Manufacturer Recall",
  "Regulatory Recall",
  "Quality Alert",
  "Safety Alert",
  "Product Complaint Investigation",
] as const;

export const RECALL_STATUSES = [
  "Draft Review",
  "Under Investigation",
  "Hold Recommended",
  "Hold Applied",
  "Customer Trace Complete",
  "Supplier Contact Pending",
  "Closed",
] as const;

export const RECALL_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const GENEALOGY_TYPES = [
  "Split",
  "Merge",
  "Repack",
  "Relabel",
  "Rework",
  "Replacement",
  "Correction",
] as const;

/* ---------- Suppliers and manufacturers ---------- */

export interface LotSource {
  supplier: string;
  supplierCode: string;
  supplierLot: string;
  manufacturer: string;
  country: string;
  contact: string;
}

const SUPPLIERS: LotSource[] = [
  {
    supplier: "DentCare Co., Ltd.",
    supplierCode: "SUP-DC01",
    supplierLot: "DC-A-2601",
    manufacturer: "DentCare Manufacturing",
    country: "Thailand",
    contact: "02-555-0101",
  },
  {
    supplier: "Mega Dental Supply",
    supplierCode: "SUP-MD02",
    supplierLot: "MDS-77120",
    manufacturer: "Mega Industrial",
    country: "Malaysia",
    contact: "02-555-0202",
  },
  {
    supplier: "Apex Dental Co., Ltd.",
    supplierCode: "SUP-AX03",
    supplierLot: "AX-5580",
    manufacturer: "Apex Polymer",
    country: "Japan",
    contact: "02-555-0303",
  },
  {
    supplier: "Global Dental Ltd.",
    supplierCode: "SUP-GD04",
    supplierLot: "GD-2026-11",
    manufacturer: "Global Dental Works",
    country: "Germany",
    contact: "02-555-0404",
  },
  {
    supplier: "Siam Medical Supply",
    supplierCode: "SUP-SM05",
    supplierLot: "SMS-0091",
    manufacturer: "Siam Medical Plant",
    country: "Thailand",
    contact: "02-555-0505",
  },
];

export const lotSource = (i: number): LotSource => SUPPLIERS[i % SUPPLIERS.length];

/* ---------- Lot profile overlay ---------- */

export interface LotProfile {
  /** Manufacturer / supplier batch printed on the carton. */
  supplierLot?: string;
  supplierIndex?: number;
  mfg?: string;
  exp?: string;
  received?: string;
  originalQty?: number;
  /** Buckets no existing module models yet. */
  recallHold?: number;
  blocked?: number;
  scrapped?: number;
  /** Overrides the status the domain would otherwise derive. */
  status?: string;
  poRef?: string;
  grRef?: string;
  qcRef?: string;
  note?: string;
}

/**
 * Keyed by lot number. A lot with no entry still works — it simply inherits
 * the defaults and derives everything from the documents that mention it.
 */
export const LOT_PROFILES: Record<string, LotProfile> = {
  /* --- Inventory lots that Stock Inquiry already holds --- */
  "LOT-26001": {
    supplierIndex: 0,
    mfg: "05/01/2026",
    exp: "31/12/2027",
    received: "08/01/2026",
    originalQty: 900,
    poRef: "PO2506124",
    grRef: "GR25060001",
    qcRef: "QC25060032",
  },
  "LOT-26002": {
    supplierIndex: 1,
    mfg: "12/01/2026",
    exp: "30/06/2027",
    received: "15/01/2026",
    originalQty: 640,
    poRef: "PO2506118",
    grRef: "GR25060002",
  },
  "LOT-26003": {
    supplierIndex: 2,
    mfg: "02/02/2026",
    exp: "31/03/2027",
    received: "05/02/2026",
    originalQty: 420,
    poRef: "PO2506122",
    grRef: "GR25060003",
    qcRef: "QC25060033",
  },
  "LOT-26004": {
    supplierIndex: 3,
    mfg: "20/02/2026",
    exp: "31/08/2027",
    received: "24/02/2026",
    originalQty: 380,
  },
  "LOT-26005": {
    supplierIndex: 4,
    mfg: "01/03/2026",
    exp: "31/12/2026",
    received: "04/03/2026",
    originalQty: 300,
    note: "ล็อตอายุสั้น ต้องเร่งระบายตามหลัก FEFO",
  },
  "LOT-26009": {
    supplierIndex: 0,
    mfg: "01/04/2026",
    exp: "30/06/2028",
    received: "05/04/2026",
    originalQty: 260,
    note: "ล็อตที่ถูกต้องหลังการแก้ไข Lot จาก LOT-26001",
  },

  /* --- Lots the operational documents wrote under their own numbering --- */
  "LOT-AFX-2506": {
    supplierIndex: 0,
    supplierLot: "DC-A-2506",
    mfg: "01/06/2025",
    exp: "31/05/2027",
    received: "15/06/2025",
    originalQty: 600,
    poRef: "PO2506124",
    grRef: "GR25060001",
  },
  "LOT-AFXG-2506": {
    supplierIndex: 1,
    mfg: "01/06/2025",
    exp: "30/04/2027",
    received: "15/06/2025",
    originalQty: 420,
    grRef: "GR25060002",
  },
  "LOT-F240201": {
    supplierIndex: 4,
    mfg: "01/02/2024",
    exp: "31/07/2026",
    received: "10/02/2024",
    originalQty: 500,
    note: "ล็อตเก่า ใกล้หมดอายุ",
  },
  "LOT-2506-A1": {
    supplierIndex: 0,
    mfg: "01/06/2025",
    exp: "31/05/2027",
    received: "18/06/2025",
    originalQty: 480,
  },
  "LOT-2506-A2": {
    supplierIndex: 1,
    mfg: "01/06/2025",
    exp: "30/04/2027",
    received: "18/06/2025",
    originalQty: 320,
  },
  "LOT-2505-C7": {
    supplierIndex: 2,
    mfg: "01/05/2025",
    exp: "30/09/2026",
    received: "12/05/2025",
    originalQty: 260,
  },
  "LOT-2506-B3": {
    supplierIndex: 3,
    mfg: "01/06/2025",
    exp: "31/03/2027",
    received: "20/06/2025",
    originalQty: 200,
  },
  "LOT-2505-G2": {
    supplierIndex: 0,
    mfg: "01/05/2025",
    exp: "31/12/2026",
    received: "10/05/2025",
    originalQty: 120,
  },
  "LOT-2506-S5": {
    supplierIndex: 4,
    mfg: "01/06/2025",
    exp: "31/10/2026",
    received: "22/06/2025",
    originalQty: 180,
  },
  "LOT-2607-A1": {
    supplierIndex: 0,
    mfg: "01/07/2026",
    exp: "30/06/2028",
    received: "05/07/2026",
    originalQty: 500,
  },
  "LOT-A240501": {
    supplierIndex: 2,
    mfg: "01/05/2024",
    exp: "30/04/2026",
    received: "08/05/2024",
    originalQty: 240,
    status: "Expired",
  },
  "LOT-B240302": {
    supplierIndex: 3,
    mfg: "01/03/2024",
    exp: "28/02/2026",
    received: "06/03/2024",
    originalQty: 180,
    status: "Expired",
  },
  "LOT-CH240101": {
    supplierIndex: 1,
    mfg: "01/01/2024",
    exp: "31/12/2025",
    received: "05/01/2024",
    originalQty: 150,
    status: "Depleted",
  },
  "LOT-E240403": {
    supplierIndex: 4,
    mfg: "01/04/2024",
    exp: "31/03/2026",
    received: "07/04/2024",
    originalQty: 220,
    status: "Expired",
  },
  "LOT-2412-009": {
    supplierIndex: 2,
    mfg: "01/12/2024",
    exp: "30/11/2026",
    received: "10/12/2024",
    originalQty: 300,
  },
  "LOT-2503-044": {
    supplierIndex: 3,
    mfg: "01/03/2025",
    exp: "28/02/2027",
    received: "08/03/2025",
    originalQty: 260,
  },
  "LOT-2504-001": {
    supplierIndex: 0,
    mfg: "01/04/2025",
    exp: "31/03/2027",
    received: "09/04/2025",
    originalQty: 240,
  },
  "LOT-2604-R9": {
    supplierIndex: 1,
    mfg: "01/04/2026",
    exp: "31/03/2028",
    received: "08/04/2026",
    originalQty: 200,
  },
  "LOT-2605-E1": {
    supplierIndex: 4,
    mfg: "01/05/2026",
    exp: "30/04/2028",
    received: "07/05/2026",
    originalQty: 180,
  },
};

/**
 * Lots that are the same physical batch under different module numbering.
 * Declaring the equivalence is what lets a lot trace from supplier receipt
 * all the way to the customer without rewriting any existing document.
 */
/**
 * Product codes older documents use for a master SKU. Shipments, QC and
 * Sales Return were written against the prototype catalogue and never
 * renamed; declaring the equivalence joins their lots to the real product
 * instead of inventing a second one.
 */
export const PRODUCT_LINKS: Record<string, string> = {
  "CMP-A3-001": "AA-TH003-WL",
  "BND-001": "AA-TH003-GR",
  "BOND-01": "AA-TH004-BK",
  "ETCH-01": "AB-AC001",
  "AT-CH001": "AT-BR002",
  "SCT-001": "AA-TH004-BK",
};

export const LOT_LINKS: Record<string, string[]> = {
  "LOT-26001": ["LOT-AFX-2506", "LOT-2506-A1", "LOT-2607-A1"],
  "LOT-26002": ["LOT-AFXG-2506", "LOT-2506-A2"],
  "LOT-26003": ["LOT-2506-B3"],
  "LOT-26004": ["LOT-2505-C7"],
  "LOT-26005": ["LOT-2506-S5"],
};

/* ---------- Which lot supplied which shipment ---------- */

export interface LotDelivery {
  lot: string;
  product: string;
  shipment: string;
  qty: number;
}

/**
 * Shipment documents were written before lot capture existed and leave the
 * lot field empty on nearly every line. Declaring the allocation here
 * restores the forward trace — lot to customer — without editing a single
 * shipment. A line that already names its lot is not repeated below.
 */
export const LOT_DELIVERIES: LotDelivery[] = [
  /* A-FLEX PU40 (White) — LOT-26001 reached three customers. */
  { lot: "LOT-26001", product: "AA-TH003-WL", shipment: "SHP-2026-000033", qty: 5 },
  { lot: "LOT-26001", product: "AA-TH003-WL", shipment: "SHP-2026-000036", qty: 8 },
  { lot: "LOT-26006", product: "AA-TH003-WL", shipment: "SHP-2026-000038", qty: 12 },
  { lot: "LOT-26006", product: "AA-TH003-WL", shipment: "SHP-2026-000043", qty: 4 },
  { lot: "LOT-26016", product: "AA-TH003-WL", shipment: "SHP-2026-000041", qty: 6 },

  /* A-FLEX PU40 (Grey). */
  { lot: "LOT-26002", product: "AA-TH003-GR", shipment: "SHP-2026-000031", qty: 15 },
  { lot: "LOT-26002", product: "AA-TH003-GR", shipment: "SHP-2026-000032", qty: 10 },
  { lot: "LOT-26002", product: "AA-TH003-GR", shipment: "SHP-2026-000035", qty: 10 },
  { lot: "LOT-26012", product: "AA-TH003-GR", shipment: "SHP-2026-000033", qty: 50 },
  { lot: "LOT-26012", product: "AA-TH003-GR", shipment: "SHP-2026-000037", qty: 20 },
  { lot: "LOT-26007", product: "AA-TH003-GR", shipment: "SHP-2026-000036", qty: 10 },
  { lot: "LOT-26007", product: "AA-TH003-GR", shipment: "SHP-2026-000038", qty: 9 },
  { lot: "LOT-26017", product: "AA-TH003-GR", shipment: "SHP-2026-000040", qty: 12 },
  { lot: "LOT-26017", product: "AA-TH003-GR", shipment: "SHP-2026-000045", qty: 6 },

  /* A-FLEX PU50 (Black) — the recalled batch went out to three customers. */
  { lot: "LOT-25003", product: "AA-TH004-BK", shipment: "SHP-2026-000031", qty: 20 },
  { lot: "LOT-25003", product: "AA-TH004-BK", shipment: "SHP-2026-000032", qty: 18 },
  { lot: "LOT-25003", product: "AA-TH004-BK", shipment: "SHP-2026-000035", qty: 20 },
  { lot: "LOT-26008", product: "AA-TH004-BK", shipment: "SHP-2026-000036", qty: 12 },
  { lot: "LOT-26008", product: "AA-TH004-BK", shipment: "SHP-2026-000037", qty: 5 },
  { lot: "LOT-26013", product: "AA-TH004-BK", shipment: "SHP-2026-000039", qty: 6 },
  { lot: "LOT-26013", product: "AA-TH004-BK", shipment: "SHP-2026-000042", qty: 15 },
];

/* ---------- Extra lots with no live stock ---------- */

export interface DeclaredLot {
  lot: string;
  product: string;
  profile: LotProfile;
}

/**
 * Lots the ERP has fully consumed, expired or recalled. They carry no stock
 * position, which is exactly why they have to be declared: a depleted lot is
 * still part of the traceability record.
 */
export const DECLARED_LOTS: DeclaredLot[] = [
  {
    lot: "LOT-25001",
    product: "AA-TH003-WL",
    profile: {
      supplierIndex: 0,
      mfg: "01/01/2025",
      exp: "31/12/2026",
      received: "06/01/2025",
      originalQty: 720,
      status: "Depleted",
      grRef: "GR25060001",
    },
  },
  {
    lot: "LOT-25002",
    product: "AA-TH003-GR",
    profile: {
      supplierIndex: 1,
      mfg: "01/02/2025",
      exp: "31/01/2027",
      received: "05/02/2025",
      originalQty: 540,
      status: "Depleted",
    },
  },
  {
    lot: "LOT-25003",
    product: "AA-TH004-BK",
    profile: {
      supplierIndex: 2,
      mfg: "01/03/2025",
      exp: "31/08/2026",
      received: "07/03/2025",
      originalQty: 400,
      recallHold: 40,
      status: "Recall Hold",
      note: "ผู้ผลิตแจ้งเรียกคืนล็อตนี้",
    },
  },
  {
    lot: "LOT-25004",
    product: "AB-AC001",
    profile: {
      supplierIndex: 3,
      mfg: "01/04/2025",
      exp: "31/03/2026",
      received: "08/04/2025",
      originalQty: 300,
      status: "Expired",
    },
  },
  {
    lot: "LOT-25005",
    product: "AT-SL001",
    profile: {
      supplierIndex: 4,
      mfg: "01/05/2025",
      exp: "31/08/2026",
      received: "09/05/2025",
      originalQty: 260,
      note: "ใกล้หมดอายุ ต้องเร่งระบาย",
    },
  },
  {
    lot: "LOT-25006",
    product: "AT-GL001",
    profile: {
      supplierIndex: 0,
      mfg: "01/06/2025",
      exp: "31/05/2027",
      received: "10/06/2025",
      originalQty: 180,
      blocked: 12,
      status: "Under Investigation",
      note: "อยู่ระหว่างสอบสวนคุณภาพ",
    },
  },
  {
    lot: "LOT-25007",
    product: "AT-MD001",
    profile: {
      supplierIndex: 1,
      mfg: "01/07/2025",
      exp: "30/06/2027",
      received: "11/07/2025",
      originalQty: 600,
      status: "Closed",
    },
  },
  {
    lot: "LOT-25008",
    product: "AT-BR002",
    profile: {
      supplierIndex: 2,
      mfg: "01/08/2025",
      exp: "",
      received: "12/08/2025",
      originalQty: 90,
      note: "สินค้าไม่มีวันหมดอายุ",
    },
  },
  {
    lot: "LOT-26010",
    product: "AA-TH003-WL",
    profile: {
      supplierIndex: 3,
      mfg: "01/05/2026",
      exp: "30/09/2026",
      received: "05/05/2026",
      originalQty: 240,
      note: "ล็อตใหม่ อายุสั้น",
    },
  },
  {
    lot: "LOT-26011",
    product: "AA-TH003-GR",
    profile: {
      supplierIndex: 4,
      mfg: "01/06/2026",
      exp: "31/10/2026",
      received: "06/06/2026",
      originalQty: 200,
    },
  },
  {
    lot: "LOT-26012",
    product: "AB-AC001",
    profile: {
      supplierIndex: 0,
      mfg: "01/06/2026",
      exp: "31/10/2027",
      received: "07/06/2026",
      originalQty: 180,
    },
  },
  {
    lot: "LOT-26013",
    product: "AA-TH004-BK",
    profile: {
      supplierIndex: 1,
      mfg: "01/07/2026",
      exp: "31/12/2026",
      received: "08/07/2026",
      originalQty: 160,
    },
  },
];

/* ---------- Recall reviews ---------- */

export interface RecallReview {
  code: string;
  lot: string;
  product: string;
  type: string;
  severity: string;
  reason: string;
  initiatedBy: string;
  initiatedDate: string;
  status: string;
  holdStatus: string;
  affectedQty: number;
  availableQty: number;
  shippedQty: number;
  customerCount: number;
  /** Set once the hold has been handed to Stock Adjustment. */
  adjustmentRef: string;
  notes: { note: string; by: string; when: string }[];
}

export const RECALL_REVIEWS: RecallReview[] = [
  {
    code: "RCL-2026-000001",
    lot: "LOT-25003",
    product: "AA-TH004-BK",
    type: "Manufacturer Recall",
    severity: "High",
    reason: "ผู้ผลิตแจ้งพบปัญหาการยึดเกาะในล็อตการผลิตนี้",
    initiatedBy: "Patcharin T.",
    initiatedDate: "12/06/2026",
    status: "Hold Applied",
    holdStatus: "Recall Hold",
    affectedQty: 118,
    availableQty: 40,
    shippedQty: 58,
    customerCount: 3,
    adjustmentRef: "",
    notes: [
      {
        note: "ได้รับหนังสือแจ้งเรียกคืนจากผู้ผลิต เลขที่ MR-2026-118",
        by: "Patcharin T.",
        when: "12/06/2026 09:30",
      },
      {
        note: "กันสต๊อกคงเหลือทั้งหมดเข้าสถานะ Recall Hold แล้ว",
        by: "Suda R.",
        when: "12/06/2026 14:10",
      },
    ],
  },
  {
    code: "RCL-2026-000002",
    lot: "LOT-26015",
    product: "AT-SL001",
    type: "Product Complaint Investigation",
    severity: "Medium",
    reason: "ลูกค้าแจ้งว่าซิลิโคนบางหลอดเซ็ตตัวช้ากว่าที่ระบุ",
    initiatedBy: "Suda R.",
    initiatedDate: "20/06/2026",
    status: "Under Investigation",
    holdStatus: "Blocked",
    affectedQty: 180,
    availableQty: 47,
    shippedQty: 110,
    customerCount: 3,
    adjustmentRef: "",
    notes: [
      {
        note: "ส่งตัวอย่าง 2 หลอดให้ฝ่าย QC ตรวจสอบ ยังไม่กันสต๊อก",
        by: "Suda R.",
        when: "20/06/2026 11:00",
      },
    ],
  },
  {
    code: "RCL-2026-000003",
    lot: "LOT-F240201",
    product: "AT-MD001",
    type: "Quality Alert",
    severity: "Low",
    reason: "พบบรรจุภัณฑ์ชำรุดในบางกล่องของล็อตนี้",
    initiatedBy: "Warin S.",
    initiatedDate: "01/07/2026",
    status: "Closed",
    holdStatus: "Released",
    affectedQty: 500,
    availableQty: 0,
    shippedQty: 480,
    customerCount: 5,
    adjustmentRef: "",
    notes: [
      {
        note: "ตรวจสอบแล้วเป็นความเสียหายระหว่างขนส่ง ไม่ใช่ปัญหาการผลิต ปิดเรื่อง",
        by: "Patcharin T.",
        when: "05/07/2026 16:20",
      },
    ],
  },
];

/* ---------- Genealogy ---------- */

export interface LotGenealogy {
  parent: string;
  child: string;
  type: string;
  qty: number;
  date: string;
  document: string;
  user: string;
}

/** Phase 1 traceability placeholder — no production processing behind it. */
export const LOT_GENEALOGY: LotGenealogy[] = [
  {
    parent: "LOT-AFX-2506",
    child: "LOT-26001",
    type: "Relabel",
    qty: 600,
    date: "08/01/2026",
    document: "GR25060001",
    user: "Warin S.",
  },
  {
    parent: "LOT-26001",
    child: "LOT-26009",
    type: "Correction",
    qty: 15,
    date: "12/03/2026",
    document: "ADJ-2026-000030",
    user: "Warin S.",
  },
  {
    parent: "LOT-26001",
    child: "LOT-26010",
    type: "Split",
    qty: 240,
    date: "05/05/2026",
    document: "TRF-2026-000022",
    user: "Nattapong K.",
  },
  {
    parent: "LOT-2412-009",
    child: "LOT-2604-R9",
    type: "Rework",
    qty: 60,
    date: "08/04/2026",
    document: "RTN-2026-000021",
    user: "Suda R.",
  },
  {
    parent: "LOT-25003",
    child: "LOT-26013",
    type: "Replacement",
    qty: 160,
    date: "08/07/2026",
    document: "PO2506120",
    user: "Somchai B.",
  },
];

/* ---------- Corrections ---------- */

export interface LotCorrection {
  code: string;
  date: string;
  fromLot: string;
  toLot: string;
  product: string;
  qty: number;
  warehouse: string;
  location: string;
  reason: string;
  approvedBy: string;
  status: string;
}

/** Mirrors the lot-correction adjustments; the original lot is never erased. */
export const LOT_CORRECTIONS: LotCorrection[] = [
  {
    code: "ADJ-2026-000030",
    date: "12/03/2026",
    fromLot: "LOT-26001",
    toLot: "LOT-26009",
    product: "AA-TH003-WL",
    qty: 15,
    warehouse: "WH-BKK",
    location: "A-01-A01",
    reason: "Wrong Lot",
    approvedBy: "Patcharin T.",
    status: "Draft",
  },
  {
    code: "ADJ-2025-000112",
    date: "18/11/2025",
    fromLot: "LOT-25001",
    toLot: "LOT-26001",
    product: "AA-TH003-WL",
    qty: 40,
    warehouse: "WH-BKK",
    location: "A-01-A02",
    reason: "Migration Correction",
    approvedBy: "Patcharin T.",
    status: "Posted",
  },
  {
    code: "ADJ-2025-000098",
    date: "02/10/2025",
    fromLot: "LOT-2505-C7",
    toLot: "LOT-26004",
    product: "AB-AC001",
    qty: 25,
    warehouse: "WH-BKK",
    location: "A-02-A05",
    reason: "Historical Data Correction",
    approvedBy: "Patcharin T.",
    status: "Posted",
  },
  {
    code: "ADJ-2025-000075",
    date: "14/08/2025",
    fromLot: "LOT-2506-A2",
    toLot: "LOT-26002",
    product: "AA-TH003-GR",
    qty: 30,
    warehouse: "WH-CNX",
    location: "C-01-C01",
    reason: "Wrong Lot",
    approvedBy: "Patcharin T.",
    status: "Posted",
  },
  {
    code: "ADJ-2025-000061",
    date: "27/06/2025",
    fromLot: "LOT-F240201",
    toLot: "LOT-25007",
    product: "AT-MD001",
    qty: 20,
    warehouse: "WH-SVC",
    location: "S-01-S01",
    reason: "Wrong Lot",
    approvedBy: "Patcharin T.",
    status: "Posted",
  },
];

/** Minimum remaining shelf life a customer order will accept — mock rule. */
export const MIN_SHELF_LIFE_PCT = 30;

export function nextRecallCode(): string {
  const max = RECALL_REVIEWS.reduce((m, r) => {
    const n = Number(r.code.split("-")[2]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `RCL-2026-${String(max + 1).padStart(6, "0")}`;
}
