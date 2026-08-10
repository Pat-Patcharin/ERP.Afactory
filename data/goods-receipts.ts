/* eslint-disable */
/**
 * Goods Receipt. Goods that require QC are received into QC Hold and do
 * NOT become available inventory until QC passes.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface GoodsReceipt {
  code: string;
  type: string;
  poRef: string;
  supplier: string;
  warehouse: string;
  receiptDate: string;
  expectedDate: string;
  receiver: string;
  status: string;
  qcStatus: string;
  discrepancy: string;
  deliveryNote: string;
  invoiceRef: string;
  transporter: string;
  driver: string;
  vehicle: string;
  dock: string;
  packages: number;
  pkgCondition: string;
  seal: string;
  remark: string;
  items: {
    line: number;
    code: string;
    name: string;
    unit: string;
    ordered: number;
    prevRecv: number;
    receiveNow: number;
    accepted: number;
    rejected: number;
    warehouse: string;
    location: string;
    qc: boolean;
    lot: boolean;
    serial: boolean;
    expiry: boolean;
    lots: {
      lot: string;
      mfg: string;
      exp: string;
      qty: number;
      supplierLot: string;
      origin: string;
    }[];
    serials: unknown[];
    disc: string;
  }[];
  qc: {
    type: string;
    plan: string;
    inspector: string;
    dueDate: string;
    qcWh: string;
    claimWh: string;
  };
  history: {
    t: string;
    d: string;
    u: string;
    when: string;
    kind: string;
  }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
  nonPoReason?: string;
  refDoc?: string;
  approvalRef?: string;
  /**
   * Receiving less than the order asked for CLOSES the rest of it.
   *
   * A short receipt is not a partial one: partial means "more is coming",
   * short means "this is all that is coming, close the order". The system
   * cannot tell them apart from the numbers, so the person receiving says
   * which — and saying "close it" is a commercial decision about giving up
   * on goods already ordered, which is why it needs the approve right on
   * this module rather than the receiving right.
   */
  forceClosed?: boolean;
  forceClosedBy?: string;
  forceClosedAt?: string;
  forceCloseReason?: string;
}

/**
 * Two receipts, two number series.
 *
 * A receipt against a purchase order is the closing half of a spend somebody
 * approved. A receipt without one — goods back from a claim, a repair
 * returning to the shelf — has no order behind it and no spend to close, and
 * mixing the two in one series makes "what did we order and get" unanswerable
 * without reading every document.
 */
export const GR_TYPES = ["With PO", "Without PO"] as const;

export type GrType = (typeof GR_TYPES)[number];

export const GR_STATUS = [
  "Draft",
  "Waiting",
  "Partial",
  "Pending QC",
  "Completed",
  "Cancelled",
] as const;

export const GR_QC_STATUS = ["Not Required", "Pending", "In Inspection", "Passed", "Failed", "Partial Pass"] as const;

export const GR_DISCREPANCY = [
  "None",
  "Quantity Difference",
  "Damaged Goods",
  "Wrong Item",
  "Missing Document",
  "Expiry Issue",
  "Serial Issue",
] as const;

export const GR_WAREHOUSES = [
  "WH01 Main Warehouse",
  "WH02 Raw Material Warehouse",
  "WH-QC Quality Hold",
  "WH-CLAIM Claim Warehouse",
] as const;

export const GR_RECEIVERS = ["Somchai B.", "Warin S.", "Nattapong K.", "Pimlada P."] as const;

export const GR_PKG_CONDITION = ["Good", "Damaged", "Wet", "Opened", "Incomplete"] as const;

export const GR_NONPO_REASONS = [
  "Sample",
  "Free Goods",
  "Replacement",
  "Warranty Replacement",
  "Emergency Purchase",
  "Consignment",
  "Donation",
  "Other",
] as const;

export const GOODS_RECEIPTS: GoodsReceipt[] = [
  {
    code: "GR25060001",
    type: "With PO",
    poRef: "PO2506123",
    supplier: "Mega Dental Supply",
    warehouse: "WH01 Main Warehouse",
    receiptDate: "14/06/2025",
    expectedDate: "16/06/2025",
    receiver: "Somchai B.",
    status: "Pending QC",
    qcStatus: "Pending",
    discrepancy: "None",
    deliveryNote: "DN-MDS-4471",
    invoiceRef: "INV-MDS-2201",
    transporter: "Kerry Express",
    driver: "สมพงษ์ ก.",
    vehicle: "2กท-1234",
    dock: "Dock 2",
    packages: 8,
    pkgCondition: "Good",
    seal: "SL-88231",
    remark: "",
    items: [
      {
        line: 1,
        code: "IMP-01",
        name: "Impression Material",
        unit: "Set",
        ordered: 100,
        prevRecv: 0,
        receiveNow: 60,
        accepted: 60,
        rejected: 0,
        warehouse: "WH-QC Quality Hold",
        location: "QC-A-01",
        qc: true,
        lot: true,
        serial: false,
        expiry: true,
        lots: [
          {
            lot: "LOT-IMP-2506",
            mfg: "01/05/2025",
            exp: "01/05/2027",
            qty: 60,
            supplierLot: "MDS-77",
            origin: "ประเทศไทย",
          },
        ],
        serials: [],
        disc: "",
      },
    ],
    qc: {
      type: "Sampling",
      plan: "AQL 2.5",
      inspector: "—",
      dueDate: "17/06/2025",
      qcWh: "WH-QC Quality Hold",
      claimWh: "WH-CLAIM Claim Warehouse",
    },
    history: [
      {
        t: "Receipt posted",
        d: "รับของเข้า QC Hold 60 หน่วย",
        u: "Somchai B.",
        when: "14/06/2025 15:30",
        kind: "primary",
      },
      {
        t: "PO loaded",
        d: "โหลดข้อมูลจาก PO2506123",
        u: "Somchai B.",
        when: "14/06/2025 15:10",
        kind: "info",
      },
      {
        t: "Draft created",
        d: "สร้างใบรับของ",
        u: "Somchai B.",
        when: "14/06/2025 15:00",
        kind: "",
      },
    ],
    created: "14/06/2025 15:00",
    createdBy: "Somchai B.",
    updated: "14/06/2025 15:30",
    updatedBy: "Somchai B.",
  },
  {
    code: "GR25060002",
    type: "With PO",
    poRef: "PO2506122",
    supplier: "Apex Dental Co., Ltd.",
    warehouse: "WH02 Raw Material Warehouse",
    receiptDate: "15/06/2025",
    expectedDate: "15/06/2025",
    receiver: "Warin S.",
    status: "Completed",
    qcStatus: "Not Required",
    discrepancy: "None",
    deliveryNote: "DN-APX-3320",
    invoiceRef: "INV-APX-1180",
    transporter: "Flash Express",
    driver: "อนุชา ป.",
    vehicle: "3ขค-5678",
    dock: "Dock 1",
    packages: 12,
    pkgCondition: "Good",
    seal: "SL-77120",
    remark: "ครบตามจำนวน",
    items: [
      {
        line: 1,
        code: "AA-TH003-WL",
        name: "A-FLEX PU40 (White)",
        unit: "Syringe",
        ordered: 300,
        prevRecv: 0,
        receiveNow: 300,
        accepted: 300,
        rejected: 0,
        warehouse: "WH02 Raw Material Warehouse",
        location: "A-01-05",
        qc: false,
        lot: true,
        serial: false,
        expiry: true,
        lots: [
          {
            lot: "LOT-AFX-2506",
            mfg: "10/05/2025",
            exp: "31/12/2026",
            qty: 300,
            supplierLot: "APX-101",
            origin: "ประเทศไทย",
          },
        ],
        serials: [],
        disc: "",
      },
      {
        line: 2,
        code: "ETCH-01",
        name: "Etching Gel 37%",
        unit: "Syringe",
        ordered: 200,
        prevRecv: 0,
        receiveNow: 200,
        accepted: 200,
        rejected: 0,
        warehouse: "WH02 Raw Material Warehouse",
        location: "A-02-03",
        qc: false,
        lot: true,
        serial: false,
        expiry: true,
        lots: [
          {
            lot: "LOT-ETCH-2506",
            mfg: "05/05/2025",
            exp: "30/06/2027",
            qty: 200,
            supplierLot: "APX-102",
            origin: "ประเทศไทย",
          },
        ],
        serials: [],
        disc: "",
      },
    ],
    qc: {
      type: "—",
      plan: "—",
      inspector: "—",
      dueDate: "—",
      qcWh: "",
      claimWh: "",
    },
    history: [
      {
        t: "Put Away created",
        d: "สร้างงานจัดเก็บเข้า WH02",
        u: "Warin S.",
        when: "15/06/2025 16:05",
        kind: "primary",
      },
      {
        t: "Receipt posted",
        d: "รับของครบ 500 หน่วย",
        u: "Warin S.",
        when: "15/06/2025 16:00",
        kind: "primary",
      },
      {
        t: "Draft created",
        d: "สร้างใบรับของ",
        u: "Warin S.",
        when: "15/06/2025 15:40",
        kind: "",
      },
    ],
    created: "15/06/2025 15:40",
    createdBy: "Warin S.",
    updated: "15/06/2025 16:05",
    updatedBy: "Warin S.",
  },
  {
    code: "GR25060003",
    type: "With PO",
    poRef: "PO2506121",
    supplier: "DentCare Co., Ltd.",
    warehouse: "WH01 Main Warehouse",
    receiptDate: "12/06/2025",
    expectedDate: "14/06/2025",
    receiver: "Somchai B.",
    status: "Partial",
    qcStatus: "Pending",
    discrepancy: "Quantity Difference",
    deliveryNote: "DN-DC-9910",
    invoiceRef: "",
    transporter: "บริษัทขนส่งเอง",
    driver: "—",
    vehicle: "—",
    dock: "Dock 2",
    packages: 2,
    pkgCondition: "Good",
    seal: "",
    remark: "ได้รับไม่ครบ รอส่งเพิ่ม",
    items: [
      {
        line: 1,
        code: "CEM-001",
        name: "Cement Universal",
        unit: "Box",
        ordered: 40,
        prevRecv: 0,
        receiveNow: 10,
        accepted: 10,
        rejected: 0,
        warehouse: "WH-QC Quality Hold",
        location: "QC-B-02",
        qc: true,
        lot: true,
        serial: false,
        expiry: true,
        lots: [
          {
            lot: "LOT-CEM-2506",
            mfg: "20/04/2025",
            exp: "20/04/2027",
            qty: 10,
            supplierLot: "DC-55",
            origin: "ประเทศไทย",
          },
        ],
        serials: [],
        disc: "Short Quantity",
      },
    ],
    qc: {
      type: "Full",
      plan: "100%",
      inspector: "—",
      dueDate: "13/06/2025",
      qcWh: "WH-QC Quality Hold",
      claimWh: "WH-CLAIM Claim Warehouse",
    },
    history: [
      {
        t: "Discrepancy created",
        d: "Short Quantity — สั่ง 40 รับ 10",
        u: "Somchai B.",
        when: "12/06/2025 10:20",
        kind: "warn",
      },
      {
        t: "Receipt posted",
        d: "รับบางส่วน 10 หน่วย เข้า QC Hold",
        u: "Somchai B.",
        when: "12/06/2025 10:15",
        kind: "primary",
      },
      {
        t: "Draft created",
        d: "สร้างใบรับของ",
        u: "Somchai B.",
        when: "12/06/2025 10:00",
        kind: "",
      },
    ],
    created: "12/06/2025 10:00",
    createdBy: "Somchai B.",
    updated: "12/06/2025 10:20",
    updatedBy: "Somchai B.",
  },
  {
    code: "GR25060004",
    type: "Without PO",
    poRef: "",
    supplier: "Siam Dental Group",
    warehouse: "WH01 Main Warehouse",
    receiptDate: "13/06/2025",
    expectedDate: "—",
    receiver: "Nattapong K.",
    status: "Draft",
    qcStatus: "Not Required",
    discrepancy: "None",
    deliveryNote: "DN-SDG-0021",
    invoiceRef: "",
    transporter: "—",
    driver: "—",
    vehicle: "—",
    dock: "—",
    packages: 1,
    pkgCondition: "Good",
    seal: "",
    remark: "สินค้าตัวอย่างจากซัพพลายเออร์",
    nonPoReason: "Sample",
    refDoc: "SAMPLE-REQ-118",
    approvalRef: "APR-2025-045",
    items: [
      {
        line: 1,
        code: "BOND-01",
        name: "Bonding Agent 5ml",
        unit: "Bottle",
        ordered: 0,
        prevRecv: 0,
        receiveNow: 5,
        accepted: 5,
        rejected: 0,
        warehouse: "WH01 Main Warehouse",
        location: "A-03-01",
        qc: false,
        lot: true,
        serial: false,
        expiry: true,
        lots: [],
        serials: [],
        disc: "",
      },
    ],
    qc: {
      type: "—",
      plan: "—",
      inspector: "—",
      dueDate: "—",
      qcWh: "",
      claimWh: "",
    },
    history: [
      {
        t: "Draft created",
        d: "สร้างใบรับของ (ไม่มี PO)",
        u: "Nattapong K.",
        when: "13/06/2025 11:00",
        kind: "",
      },
    ],
    created: "13/06/2025 11:00",
    createdBy: "Nattapong K.",
    updated: "13/06/2025 11:00",
    updatedBy: "Nattapong K.",
  },
  {
    code: "GR25060005",
    type: "With PO",
    poRef: "PO2506118",
    supplier: "DentCare Co., Ltd.",
    warehouse: "WH01 Main Warehouse",
    receiptDate: "10/06/2025",
    expectedDate: "11/06/2025",
    receiver: "Somchai B.",
    status: "Completed",
    qcStatus: "Passed",
    discrepancy: "None",
    deliveryNote: "DN-DC-8800",
    invoiceRef: "INV-DC-3390",
    transporter: "Kerry Express",
    driver: "วิชัย ม.",
    vehicle: "1กก-9999",
    dock: "Dock 1",
    packages: 5,
    pkgCondition: "Good",
    seal: "SL-66010",
    remark: "",
    items: [
      {
        line: 1,
        code: "AA-TH003-GR",
        name: "A-FLEX PU40 (Grey)",
        unit: "Syringe",
        ordered: 200,
        prevRecv: 0,
        receiveNow: 160,
        accepted: 160,
        rejected: 0,
        warehouse: "WH01 Main Warehouse",
        location: "A-01-08",
        qc: true,
        lot: true,
        serial: false,
        expiry: true,
        lots: [
          {
            lot: "LOT-AFXG-2506",
            mfg: "08/05/2025",
            exp: "31/12/2026",
            qty: 160,
            supplierLot: "DC-201",
            origin: "ประเทศไทย",
          },
        ],
        serials: [],
        disc: "",
      },
    ],
    qc: {
      type: "Sampling",
      plan: "AQL 2.5",
      inspector: "Warin S.",
      dueDate: "11/06/2025",
      qcWh: "WH-QC Quality Hold",
      claimWh: "WH-CLAIM Claim Warehouse",
    },
    history: [
      {
        t: "QC Passed",
        d: "ตรวจผ่าน 160 หน่วย พร้อมจัดเก็บ",
        u: "Warin S.",
        when: "11/06/2025 09:30",
        kind: "primary",
      },
      {
        t: "Submitted to QC",
        d: "ส่งตรวจ QC",
        u: "Somchai B.",
        when: "10/06/2025 11:05",
        kind: "info",
      },
      {
        t: "Receipt posted",
        d: "รับของ 160 หน่วย เข้า QC Hold",
        u: "Somchai B.",
        when: "10/06/2025 11:00",
        kind: "primary",
      },
      {
        t: "Draft created",
        d: "สร้างใบรับของ",
        u: "Somchai B.",
        when: "10/06/2025 10:40",
        kind: "",
      },
    ],
    created: "10/06/2025 10:40",
    createdBy: "Somchai B.",
    updated: "11/06/2025 09:30",
    updatedBy: "Warin S.",
  },
];
