/* eslint-disable */
/**
 * QC Inspection. Receives QC-Hold items from Goods Receipt and routes them
 * to Put Away (pass) or the Claim warehouse (fail).
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export type QcSupplierStatMap = Record<string, {
  failRate: number;
  openNcr: number;
  trend: string;
  passNorm: number;
}>;

export interface QcInspection {
  code: string;
  grRef: string;
  poRef: string;
  supplier: string;
  product: string;
  productName: string;
  lot: string;
  serial: string;
  warehouse: string;
  inspector: string;
  dueDate: string;
  priority: string;
  status: string;
  result: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unit: string;
  method: string;
  sampling: string;
  sampleSize: number;
  sampleAccept: number;
  sampleReject: number;
  expiry: string;
  inspectionDate: string;
  checklist: {
    item: string;
    result: string;
    comment: string;
  }[];
  reason: string;
  correctiveAction: string;
  failAction: string;
  ncrRef: string;
  claimRef: string;
  round: number;
  prevResult: string;
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
}

export const QC_STATUS = ["Waiting", "In Progress", "Hold", "Completed", "Cancelled"] as const;

export const QC_RESULT = ["Pending", "Pass", "Partial Pass", "Fail"] as const;

export const QC_PRIORITY = ["Low", "Medium", "High"] as const;

export const QC_INSPECTORS = ["S. Nattapong", "P. Patcharin", "K. Jirawat", "W. Warin"] as const;

export const QC_METHODS = ["Visual", "Dimensional", "Functional", "Documentation", "Sampling AQL", "Full 100%"] as const;

export const QC_SAMPLING = ["100%", "Random", "AQL 1.0", "AQL 2.5", "AQL 4.0", "Custom"] as const;

export const QC_DECISIONS = ["Pass", "Partial Pass", "Fail", "Hold", "Conditional Pass"] as const;

export const QC_FAIL_ACTIONS = ["Move to Claim Warehouse", "Return to Supplier", "Destroy", "Rework", "Hold"] as const;

export const NCR_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const QC_CHECKLIST_TEMPLATE = [
  "Packaging Condition",
  "Product Identity",
  "Quantity",
  "Appearance",
  "Dimension",
  "Color",
  "Function Test",
  "Expiry Date",
  "Lot Number",
  "Serial Number",
  "Certificate",
  "Label",
  "Sterilization",
  "Documentation",
] as const;

export const QC_SUPPLIER_STATS: QcSupplierStatMap = {
  "DentCare Co., Ltd.": {
    failRate: 6,
    openNcr: 2,
    trend: "up",
    passNorm: 94,
  },
  "Mega Dental Supply": {
    failRate: 2.5,
    openNcr: 0,
    trend: "flat",
    passNorm: 97,
  },
  "Apex Dental Co., Ltd.": {
    failRate: 1.8,
    openNcr: 0,
    trend: "down",
    passNorm: 98,
  },
  "Global Dental Ltd.": {
    failRate: 8.5,
    openNcr: 1,
    trend: "up",
    passNorm: 90,
  },
  "Siam Dental Group": {
    failRate: 3.2,
    openNcr: 1,
    trend: "flat",
    passNorm: 96,
  },
};

export const QC_INSPECTIONS: QcInspection[] = [
  {
    code: "QC25060032",
    grRef: "GR25060041",
    poRef: "PO2506124",
    supplier: "DentCare Co., Ltd.",
    product: "AB-AC001",
    productName: "Composite A3",
    lot: "LOT-A240501",
    serial: "",
    warehouse: "WH-QC Quality Hold",
    inspector: "S. Nattapong",
    dueDate: "12/06/2025",
    priority: "High",
    status: "In Progress",
    result: "Pending",
    receivedQty: 100,
    acceptedQty: 60,
    rejectedQty: 0,
    unit: "PCS",
    method: "Sampling AQL",
    sampling: "AQL 2.5",
    sampleSize: 13,
    sampleAccept: 13,
    sampleReject: 0,
    expiry: "01/05/2027",
    inspectionDate: "12/06/2025",
    checklist: [
      {
        item: "Packaging Condition",
        result: "pass",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "pass",
        comment: "",
      },
      {
        item: "Quantity",
        result: "pass",
        comment: "",
      },
      {
        item: "Appearance",
        result: "pass",
        comment: "",
      },
      {
        item: "Dimension",
        result: "na",
        comment: "",
      },
      {
        item: "Color",
        result: "pass",
        comment: "",
      },
      {
        item: "Function Test",
        result: "fail",
        comment: "สีเพี้ยนเล็กน้อย 1 หลอด",
      },
      {
        item: "Expiry Date",
        result: "pass",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "na",
        comment: "",
      },
      {
        item: "Certificate",
        result: "",
        comment: "",
      },
      {
        item: "Label",
        result: "",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "",
        comment: "",
      },
      {
        item: "Documentation",
        result: "",
        comment: "",
      },
    ],
    reason: "",
    correctiveAction: "",
    failAction: "",
    ncrRef: "",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Photo added",
        d: "Photo_Packaging.jpg",
        u: "S. Nattapong",
        when: "12/06/2025 09:32",
        kind: "info",
      },
      {
        t: "Checklist item updated",
        d: "Appearance → Pass",
        u: "S. Nattapong",
        when: "12/06/2025 09:30",
        kind: "info",
      },
      {
        t: "Inspection started",
        d: "เริ่มตรวจ QC",
        u: "S. Nattapong",
        when: "12/06/2025 09:15",
        kind: "primary",
      },
    ],
    created: "12/06/2025 09:10",
    createdBy: "S. Nattapong",
    updated: "12/06/2025 09:32",
    updatedBy: "S. Nattapong",
  },
  {
    code: "QC25060031",
    grRef: "GR25060040",
    poRef: "PO2506124",
    supplier: "DentCare Co., Ltd.",
    product: "BOND-01",
    productName: "Bonding Agent 5ml",
    lot: "LOT-B240302",
    serial: "",
    warehouse: "WH-QC Quality Hold",
    inspector: "P. Patcharin",
    dueDate: "12/06/2025",
    priority: "Medium",
    status: "Waiting",
    result: "Pending",
    receivedQty: 50,
    acceptedQty: 0,
    rejectedQty: 0,
    unit: "PCS",
    method: "Visual",
    sampling: "Random",
    sampleSize: 8,
    sampleAccept: 0,
    sampleReject: 0,
    expiry: "15/03/2027",
    inspectionDate: "",
    checklist: [
      {
        item: "Packaging Condition",
        result: "",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "",
        comment: "",
      },
      {
        item: "Quantity",
        result: "",
        comment: "",
      },
      {
        item: "Appearance",
        result: "",
        comment: "",
      },
      {
        item: "Dimension",
        result: "",
        comment: "",
      },
      {
        item: "Color",
        result: "",
        comment: "",
      },
      {
        item: "Function Test",
        result: "",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "",
        comment: "",
      },
      {
        item: "Certificate",
        result: "",
        comment: "",
      },
      {
        item: "Label",
        result: "",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "",
        comment: "",
      },
      {
        item: "Documentation",
        result: "",
        comment: "",
      },
    ],
    reason: "",
    correctiveAction: "",
    failAction: "",
    ncrRef: "",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Inspection created",
        d: "สร้างจาก GR25060040",
        u: "System",
        when: "12/06/2025 08:00",
        kind: "",
      },
    ],
    created: "12/06/2025 08:00",
    createdBy: "System",
    updated: "12/06/2025 08:00",
    updatedBy: "System",
  },
  {
    code: "QC25060030",
    grRef: "GR25060039",
    poRef: "PO2506123",
    supplier: "Mega Dental Supply",
    product: "ETCH-01",
    productName: "Etching Gel 37%",
    lot: "LOT-E240403",
    serial: "",
    warehouse: "WH-QC Quality Hold",
    inspector: "K. Jirawat",
    dueDate: "11/06/2025",
    priority: "Medium",
    status: "Waiting",
    result: "Pending",
    receivedQty: 60,
    acceptedQty: 0,
    rejectedQty: 0,
    unit: "PCS",
    method: "Visual",
    sampling: "AQL 2.5",
    sampleSize: 8,
    sampleAccept: 0,
    sampleReject: 0,
    expiry: "30/06/2027",
    inspectionDate: "",
    checklist: [
      {
        item: "Packaging Condition",
        result: "",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "",
        comment: "",
      },
      {
        item: "Quantity",
        result: "",
        comment: "",
      },
      {
        item: "Appearance",
        result: "",
        comment: "",
      },
      {
        item: "Dimension",
        result: "",
        comment: "",
      },
      {
        item: "Color",
        result: "",
        comment: "",
      },
      {
        item: "Function Test",
        result: "",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "",
        comment: "",
      },
      {
        item: "Certificate",
        result: "",
        comment: "",
      },
      {
        item: "Label",
        result: "",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "",
        comment: "",
      },
      {
        item: "Documentation",
        result: "",
        comment: "",
      },
    ],
    reason: "",
    correctiveAction: "",
    failAction: "",
    ncrRef: "",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Inspection created",
        d: "สร้างจาก GR25060039",
        u: "System",
        when: "11/06/2025 08:00",
        kind: "",
      },
    ],
    created: "11/06/2025 08:00",
    createdBy: "System",
    updated: "11/06/2025 08:00",
    updatedBy: "System",
  },
  {
    code: "QC25060029",
    grRef: "GR25060038",
    poRef: "PO2506122",
    supplier: "Apex Dental Co., Ltd.",
    product: "AT-MD001",
    productName: "Endodontic File 25mm",
    lot: "LOT-F240201",
    serial: "",
    warehouse: "WH02 Raw Material Warehouse",
    inspector: "S. Nattapong",
    dueDate: "11/06/2025",
    priority: "Medium",
    status: "Completed",
    result: "Pass",
    receivedQty: 120,
    acceptedQty: 120,
    rejectedQty: 0,
    unit: "PCS",
    method: "Sampling AQL",
    sampling: "AQL 2.5",
    sampleSize: 13,
    sampleAccept: 13,
    sampleReject: 0,
    expiry: "—",
    inspectionDate: "11/06/2025",
    checklist: [
      {
        item: "Packaging Condition",
        result: "pass",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "pass",
        comment: "",
      },
      {
        item: "Quantity",
        result: "pass",
        comment: "",
      },
      {
        item: "Appearance",
        result: "pass",
        comment: "",
      },
      {
        item: "Dimension",
        result: "pass",
        comment: "",
      },
      {
        item: "Color",
        result: "pass",
        comment: "",
      },
      {
        item: "Function Test",
        result: "pass",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "pass",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Certificate",
        result: "pass",
        comment: "",
      },
      {
        item: "Label",
        result: "pass",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "pass",
        comment: "",
      },
      {
        item: "Documentation",
        result: "pass",
        comment: "",
      },
    ],
    reason: "",
    correctiveAction: "",
    failAction: "",
    ncrRef: "",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Put Away",
        d: "จัดเก็บเข้า WH02",
        u: "Warin S.",
        when: "11/06/2025 14:00",
        kind: "primary",
      },
      {
        t: "Passed",
        d: "ตรวจผ่าน 120 หน่วย",
        u: "S. Nattapong",
        when: "11/06/2025 13:30",
        kind: "primary",
      },
      {
        t: "Started",
        d: "เริ่มตรวจ",
        u: "S. Nattapong",
        when: "11/06/2025 13:00",
        kind: "info",
      },
    ],
    created: "11/06/2025 12:50",
    createdBy: "S. Nattapong",
    updated: "11/06/2025 14:00",
    updatedBy: "Warin S.",
  },
  {
    code: "QC25060028",
    grRef: "GR25060037",
    poRef: "PO2506122",
    supplier: "Apex Dental Co., Ltd.",
    product: "AT-HP001",
    productName: "Dental Handpiece",
    lot: "",
    serial: "SN-HP2405001",
    warehouse: "WH02 Raw Material Warehouse",
    inspector: "P. Patcharin",
    dueDate: "10/06/2025",
    priority: "Medium",
    status: "Completed",
    result: "Pass",
    receivedQty: 10,
    acceptedQty: 10,
    rejectedQty: 0,
    unit: "PCS",
    method: "Functional",
    sampling: "100%",
    sampleSize: 10,
    sampleAccept: 10,
    sampleReject: 0,
    expiry: "—",
    inspectionDate: "10/06/2025",
    checklist: [
      {
        item: "Packaging Condition",
        result: "pass",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "pass",
        comment: "",
      },
      {
        item: "Quantity",
        result: "pass",
        comment: "",
      },
      {
        item: "Appearance",
        result: "pass",
        comment: "",
      },
      {
        item: "Dimension",
        result: "pass",
        comment: "",
      },
      {
        item: "Color",
        result: "pass",
        comment: "",
      },
      {
        item: "Function Test",
        result: "pass",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "pass",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Certificate",
        result: "pass",
        comment: "",
      },
      {
        item: "Label",
        result: "pass",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "pass",
        comment: "",
      },
      {
        item: "Documentation",
        result: "pass",
        comment: "",
      },
    ],
    reason: "",
    correctiveAction: "",
    failAction: "",
    ncrRef: "",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Passed",
        d: "ตรวจผ่าน 10 เครื่อง",
        u: "P. Patcharin",
        when: "10/06/2025 15:00",
        kind: "primary",
      },
    ],
    created: "10/06/2025 14:30",
    createdBy: "P. Patcharin",
    updated: "10/06/2025 15:00",
    updatedBy: "P. Patcharin",
  },
  {
    code: "QC25060027",
    grRef: "GR25060036",
    poRef: "PO2506121",
    supplier: "Global Dental Ltd.",
    product: "AT-AL001",
    productName: "Apex Locator",
    lot: "",
    serial: "SN-AL240301",
    warehouse: "WH02 Raw Material Warehouse",
    inspector: "K. Jirawat",
    dueDate: "10/06/2025",
    priority: "Low",
    status: "Completed",
    result: "Partial Pass",
    receivedQty: 5,
    acceptedQty: 4,
    rejectedQty: 1,
    unit: "PCS",
    method: "Functional",
    sampling: "100%",
    sampleSize: 5,
    sampleAccept: 4,
    sampleReject: 1,
    expiry: "—",
    inspectionDate: "10/06/2025",
    checklist: [
      {
        item: "Packaging Condition",
        result: "pass",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "pass",
        comment: "",
      },
      {
        item: "Quantity",
        result: "pass",
        comment: "",
      },
      {
        item: "Appearance",
        result: "pass",
        comment: "",
      },
      {
        item: "Dimension",
        result: "pass",
        comment: "",
      },
      {
        item: "Color",
        result: "pass",
        comment: "",
      },
      {
        item: "Function Test",
        result: "fail",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "pass",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Certificate",
        result: "pass",
        comment: "",
      },
      {
        item: "Label",
        result: "pass",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "pass",
        comment: "",
      },
      {
        item: "Documentation",
        result: "pass",
        comment: "",
      },
    ],
    reason: "1 เครื่องหน้าจอไม่ติด",
    correctiveAction: "ส่งคืน 1 เครื่อง",
    failAction: "Return to Supplier",
    ncrRef: "NCR2506-004",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Claim Created",
        d: "NCR2506-004",
        u: "K. Jirawat",
        when: "10/06/2025 16:30",
        kind: "warn",
      },
      {
        t: "Failed",
        d: "1/5 ไม่ผ่าน",
        u: "K. Jirawat",
        when: "10/06/2025 16:00",
        kind: "warn",
      },
    ],
    created: "10/06/2025 15:30",
    createdBy: "K. Jirawat",
    updated: "10/06/2025 16:30",
    updatedBy: "K. Jirawat",
  },
  {
    code: "QC25060026",
    grRef: "GR25060035",
    poRef: "PO2506121",
    supplier: "Global Dental Ltd.",
    product: "AT-SL001",
    productName: "Scaler Tip",
    lot: "LOT-ST240404",
    serial: "",
    warehouse: "WH-CLAIM Claim Warehouse",
    inspector: "S. Nattapong",
    dueDate: "09/06/2025",
    priority: "High",
    status: "Completed",
    result: "Fail",
    receivedQty: 200,
    acceptedQty: 0,
    rejectedQty: 200,
    unit: "PCS",
    method: "Sampling AQL",
    sampling: "AQL 2.5",
    sampleSize: 20,
    sampleAccept: 0,
    sampleReject: 20,
    expiry: "—",
    inspectionDate: "09/06/2025",
    checklist: [
      {
        item: "Packaging Condition",
        result: "pass",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "pass",
        comment: "",
      },
      {
        item: "Quantity",
        result: "pass",
        comment: "",
      },
      {
        item: "Appearance",
        result: "fail",
        comment: "",
      },
      {
        item: "Dimension",
        result: "fail",
        comment: "",
      },
      {
        item: "Color",
        result: "pass",
        comment: "",
      },
      {
        item: "Function Test",
        result: "fail",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "pass",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Certificate",
        result: "pass",
        comment: "",
      },
      {
        item: "Label",
        result: "pass",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "pass",
        comment: "",
      },
      {
        item: "Documentation",
        result: "pass",
        comment: "",
      },
    ],
    reason: "ปลายไม่ได้มาตรฐาน แตกหักง่าย",
    correctiveAction: "ตีกลับทั้งล็อต",
    failAction: "Move to Claim Warehouse",
    ncrRef: "NCR2506-003",
    claimRef: "CLM2506-002",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Claim Created",
        d: "CLM2506-002 · NCR2506-003",
        u: "S. Nattapong",
        when: "09/06/2025 11:00",
        kind: "warn",
      },
      {
        t: "Failed",
        d: "ตรวจไม่ผ่านทั้งล็อต ย้ายเข้า Claim",
        u: "S. Nattapong",
        when: "09/06/2025 10:30",
        kind: "warn",
      },
    ],
    created: "09/06/2025 10:00",
    createdBy: "S. Nattapong",
    updated: "09/06/2025 11:00",
    updatedBy: "S. Nattapong",
  },
  {
    code: "QC25060025",
    grRef: "GR25060034",
    poRef: "PO2506120",
    supplier: "Siam Dental Group",
    product: "AT-CH001",
    productName: "Dental Chair Spare Part",
    lot: "LOT-CH240101",
    serial: "",
    warehouse: "WH-QC Quality Hold",
    inspector: "P. Patcharin",
    dueDate: "09/06/2025",
    priority: "High",
    status: "Hold",
    result: "Pending",
    receivedQty: 15,
    acceptedQty: 0,
    rejectedQty: 0,
    unit: "PCS",
    method: "Documentation",
    sampling: "Custom",
    sampleSize: 15,
    sampleAccept: 0,
    sampleReject: 0,
    expiry: "—",
    inspectionDate: "09/06/2025",
    checklist: [
      {
        item: "Packaging Condition",
        result: "pass",
        comment: "",
      },
      {
        item: "Product Identity",
        result: "pass",
        comment: "",
      },
      {
        item: "Quantity",
        result: "pass",
        comment: "",
      },
      {
        item: "Appearance",
        result: "pass",
        comment: "",
      },
      {
        item: "Dimension",
        result: "pass",
        comment: "",
      },
      {
        item: "Color",
        result: "pass",
        comment: "",
      },
      {
        item: "Function Test",
        result: "pass",
        comment: "",
      },
      {
        item: "Expiry Date",
        result: "pass",
        comment: "",
      },
      {
        item: "Lot Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Serial Number",
        result: "pass",
        comment: "",
      },
      {
        item: "Certificate",
        result: "fail",
        comment: "",
      },
      {
        item: "Label",
        result: "pass",
        comment: "",
      },
      {
        item: "Sterilization",
        result: "pass",
        comment: "",
      },
      {
        item: "Documentation",
        result: "fail",
        comment: "",
      },
    ],
    reason: "รอเอกสาร COA จากซัพพลายเออร์",
    correctiveAction: "",
    failAction: "Hold",
    ncrRef: "",
    claimRef: "",
    round: 1,
    prevResult: "",
    history: [
      {
        t: "Hold",
        d: "พักการตรวจ รอ COA",
        u: "P. Patcharin",
        when: "09/06/2025 13:00",
        kind: "warn",
      },
    ],
    created: "09/06/2025 12:30",
    createdBy: "P. Patcharin",
    updated: "09/06/2025 13:00",
    updatedBy: "P. Patcharin",
  },
];
