/* eslint-disable */
/**
 * Purchase Request — first transactional document.
 * Draft -> Pending Approval -> Approved -> Converted to PO
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface PurchaseRequest {
  code: string;
  dept: string;
  requester: string;
  priority: string;
  date: string;
  needBy: string;
  status: string;
  warehouse: string;
  supplier: string;
  note: string;
  items: {
    code: string;
    name: string;
    unit: string;
    qty: number;
    price: number;
    note: string;
  }[];
  approvals: {
    step: string;
    by: string;
    role: string;
    when: string;
    status: string;
    note: string;
  }[];
  createdBy: string;
  created: string;
  updatedBy: string;
  updated: string;
  poRef?: string;
}

export const PR_STATUS = ["Draft", "Pending Approval", "Approved", "Rejected", "Converted", "Cancelled"] as const;

export const PR_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const PR_DEPARTMENTS = [
  "Operation",
  "Sales",
  "Production",
  "Marketing",
  "IT",
  "Service",
  "Warehouse",
  "Procurement",
  "Accounting",
  "HR",
] as const;

export const PR_REQUESTERS = [
  "Nattapong K.",
  "Patcharin T.",
  "Wichai P.",
  "Supaporn S.",
  "Tanawat R.",
  "Pimpaka S.",
  "Somchai B.",
] as const;

export const PURCHASE_REQUESTS: PurchaseRequest[] = [
  {
    code: "PR2506-0124",
    dept: "Operation",
    requester: "Nattapong K.",
    priority: "Critical",
    date: "26/07/2025",
    needBy: "30/07/2025",
    status: "Pending Approval",
    warehouse: "WH-BKK Bangkok Main",
    supplier: "DentCare Co., Ltd.",
    note: "ของใกล้หมด ต้องใช้ด่วนสำหรับงานผ่าตัดสัปดาห์หน้า",
    items: [
      {
        code: "AA-TH003-WL",
        name: "A-FLEX PU40 (White)",
        unit: "Tube",
        qty: 200,
        price: 68.5,
        note: "",
      },
      {
        code: "AA-TH003-GR",
        name: "A-FLEX PU40 (Grey)",
        unit: "Tube",
        qty: 100,
        price: 68.5,
        note: "",
      },
    ],
    approvals: [
      {
        step: "สร้างเอกสาร",
        by: "Nattapong K.",
        role: "ผู้ขอซื้อ",
        when: "26/07/2025 09:12",
        status: "done",
        note: "",
      },
      {
        step: "หัวหน้าแผนก",
        by: "Somsak P.",
        role: "Operation Manager",
        when: "26/07/2025 10:40",
        status: "done",
        note: "อนุมัติ เร่งด่วน",
      },
      {
        step: "ผู้จัดการจัดซื้อ",
        by: "Pimpaka S.",
        role: "Purchasing Manager",
        when: "",
        status: "pending",
        note: "",
      },
    ],
    createdBy: "Nattapong K.",
    created: "26/07/2025 09:12",
    updatedBy: "Somsak P.",
    updated: "26/07/2025 10:40",
  },
  {
    code: "PR2506-0123",
    dept: "Sales",
    requester: "Patcharin T.",
    priority: "High",
    date: "26/07/2025",
    needBy: "05/08/2025",
    status: "Approved",
    warehouse: "WH-BKK Bangkok Main",
    supplier: "Siam Medical Supply",
    note: "เตรียมสต็อกสำหรับออกบูธ TDA",
    items: [
      {
        code: "CEM-001",
        name: "Cement Universal",
        unit: "Box",
        qty: 50,
        price: 210,
        note: "สำหรับงานออกบูธ",
      },
      {
        code: "BOND-01",
        name: "Bonding Agent 5ml",
        unit: "Piece",
        qty: 80,
        price: 145,
        note: "",
      },
    ],
    approvals: [
      {
        step: "สร้างเอกสาร",
        by: "Patcharin T.",
        role: "ผู้ขอซื้อ",
        when: "26/07/2025 08:30",
        status: "done",
        note: "",
      },
      {
        step: "หัวหน้าแผนก",
        by: "Wanida S.",
        role: "Sales Manager",
        when: "26/07/2025 09:15",
        status: "done",
        note: "",
      },
      {
        step: "ผู้จัดการจัดซื้อ",
        by: "Pimpaka S.",
        role: "Purchasing Manager",
        when: "26/07/2025 11:00",
        status: "done",
        note: "อนุมัติ พร้อมเปิด PO",
      },
    ],
    createdBy: "Patcharin T.",
    created: "26/07/2025 08:30",
    updatedBy: "Pimpaka S.",
    updated: "26/07/2025 11:00",
  },
  {
    code: "PR2506-0122",
    dept: "Production",
    requester: "Wichai P.",
    priority: "Normal",
    date: "25/07/2025",
    needBy: "10/08/2025",
    status: "Converted",
    warehouse: "WH-BKK Bangkok Main",
    supplier: "Perfect Supply Co., Ltd.",
    note: "",
    items: [
      {
        code: "ETCH-01",
        name: "Etching Gel 37%",
        unit: "Piece",
        qty: 120,
        price: 95,
        note: "",
      },
    ],
    approvals: [
      {
        step: "สร้างเอกสาร",
        by: "Wichai P.",
        role: "ผู้ขอซื้อ",
        when: "25/07/2025 14:00",
        status: "done",
        note: "",
      },
      {
        step: "หัวหน้าแผนก",
        by: "Prasit T.",
        role: "Production Manager",
        when: "25/07/2025 15:20",
        status: "done",
        note: "",
      },
      {
        step: "ผู้จัดการจัดซื้อ",
        by: "Pimpaka S.",
        role: "Purchasing Manager",
        when: "25/07/2025 16:30",
        status: "done",
        note: "เปิด PO2506-0290 แล้ว",
      },
    ],
    poRef: "PO2506-0290",
    createdBy: "Wichai P.",
    created: "25/07/2025 14:00",
    updatedBy: "Pimpaka S.",
    updated: "25/07/2025 16:30",
  },
  {
    code: "PR2506-0121",
    dept: "Marketing",
    requester: "Supaporn S.",
    priority: "High",
    date: "25/07/2025",
    needBy: "08/08/2025",
    status: "Approved",
    warehouse: "WH-CNX Chiangmai",
    supplier: "BKK Dental Lab",
    note: "สื่อการตลาดและตัวอย่างสินค้า",
    items: [
      {
        code: "IMP-01",
        name: "Impression Material",
        unit: "Set",
        qty: 40,
        price: 320,
        note: "",
      },
      {
        code: "AA-TH003-WL",
        name: "A-FLEX PU40 (White)",
        unit: "Tube",
        qty: 60,
        price: 68.5,
        note: "ตัวอย่างแจกลูกค้า",
      },
    ],
    approvals: [
      {
        step: "สร้างเอกสาร",
        by: "Supaporn S.",
        role: "ผู้ขอซื้อ",
        when: "25/07/2025 10:00",
        status: "done",
        note: "",
      },
      {
        step: "หัวหน้าแผนก",
        by: "Kanya M.",
        role: "Marketing Manager",
        when: "25/07/2025 11:30",
        status: "done",
        note: "",
      },
      {
        step: "ผู้จัดการจัดซื้อ",
        by: "Pimpaka S.",
        role: "Purchasing Manager",
        when: "25/07/2025 14:15",
        status: "done",
        note: "",
      },
    ],
    createdBy: "Supaporn S.",
    created: "25/07/2025 10:00",
    updatedBy: "Pimpaka S.",
    updated: "25/07/2025 14:15",
  },
  {
    code: "PR2506-0120",
    dept: "IT",
    requester: "Tanawat R.",
    priority: "Normal",
    date: "24/07/2025",
    needBy: "—",
    status: "Rejected",
    warehouse: "WH-BKK Bangkok Main",
    supplier: "",
    note: "ขอซื้ออุปกรณ์ไอที",
    items: [
      {
        code: "BOND-01",
        name: "Bonding Agent 5ml",
        unit: "Piece",
        qty: 20,
        price: 145,
        note: "ทดสอบ",
      },
    ],
    approvals: [
      {
        step: "สร้างเอกสาร",
        by: "Tanawat R.",
        role: "ผู้ขอซื้อ",
        when: "24/07/2025 13:00",
        status: "done",
        note: "",
      },
      {
        step: "หัวหน้าแผนก",
        by: "Anan K.",
        role: "IT Manager",
        when: "24/07/2025 14:00",
        status: "rejected",
        note: "ไม่อยู่ในงบประมาณไตรมาสนี้",
      },
    ],
    createdBy: "Tanawat R.",
    created: "24/07/2025 13:00",
    updatedBy: "Anan K.",
    updated: "24/07/2025 14:00",
  },
  {
    code: "PR2506-0119",
    dept: "Service",
    requester: "Somchai B.",
    priority: "Low",
    date: "24/07/2025",
    needBy: "15/08/2025",
    status: "Draft",
    warehouse: "WH-SVC Service",
    supplier: "",
    note: "ร่างเอกสาร รอตรวจสอบรายการ",
    items: [
      {
        code: "CEM-001",
        name: "Cement Universal",
        unit: "Box",
        qty: 15,
        price: 210,
        note: "",
      },
    ],
    approvals: [
      {
        step: "สร้างเอกสาร",
        by: "Somchai B.",
        role: "ผู้ขอซื้อ",
        when: "24/07/2025 16:00",
        status: "done",
        note: "",
      },
    ],
    createdBy: "Somchai B.",
    created: "24/07/2025 16:00",
    updatedBy: "Somchai B.",
    updated: "24/07/2025 16:00",
  },
];
