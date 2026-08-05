/**
 * Sales Request — the REQUIRED entry point of the outbound process. It records
 * what a customer wants and carries it through internal approval; converting an
 * approved request produces the Sales Order.
 *
 *   Quotation (optional) → Sales Request → Sales Order
 *
 *   Draft → Submitted → Approved → Converted
 *                     → Rejected
 *
 * A Sales Request does NOT reserve stock. Availability shown against a request
 * is indicative only — reservation happens when the Sales Order is confirmed.
 *
 * Mock dataset; mutating these arrays is how the prototype persists changes.
 */

export interface SrLine {
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  disc: number;
  tax: number;
  note: string;
  /** Salesperson's own name for the line. Blank falls back to `name` —
   *  read it through displayName(), never directly. */
  customName?: string;
  /** Whether customName and note reach customer-facing paper. Undefined = yes. */
  showOnBill?: boolean;
}

export interface SalesRequest {
  code: string;
  customer: string;
  customerCode: string;
  salesRep: string;
  requestDate: string;
  /** When the customer needs the goods — drives the Sales Order delivery date. */
  requiredDate: string;
  status: string;
  priority: string;
  warehouse: string;
  currency: string;
  payTerm: string;
  priceList: string;
  channel: string;
  /** The customer's own reference (PO number, RFQ number, email subject). */
  customerRef: string;
  /** Optional upstream quotation. Empty when the request came in directly. */
  quotationRef: string;
  note: string;
  items: SrLine[];
  /** Internal approval trail. */
  approvedBy: string;
  approvedDate: string;
  rejectReason: string;
  soRef: string;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const SR_STATUS = [
  "Draft",
  "Submitted",
  "Approved",
  "Rejected",
  "Converted",
  "Cancelled",
] as const;

export const SR_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const SR_CHANNELS = ["Direct", "Dealer", "Online", "Government", "Export"] as const;

export const SR_PRICE_LISTS = [
  "PL-STD-2026 Standard",
  "PL-CLINIC-2026 Clinic",
  "PL-DEALER-2026 Dealer",
  "PL-GOV-2026 Government",
] as const;

/** How the request reached us — useful for source reporting in Phase 2. */
export const SR_SOURCES = [
  "Quotation",
  "โทรศัพท์",
  "อีเมล",
  "LINE",
  "พนักงานขายเข้าพบ",
  "หน้าร้าน",
  "เว็บไซต์",
] as const;

export const SR_APPROVERS = ["Pimpaka S.", "Patcharin T.", "Narin C."] as const;

export const SR_REJECT_REASONS = [
  "ลูกค้าเกินวงเงินเครดิต",
  "สินค้าไม่พอและรอของนาน",
  "ราคาต่ำกว่าเกณฑ์กำไรขั้นต่ำ",
  "ข้อมูลลูกค้าไม่ครบ",
  "ลูกค้ายกเลิกคำขอ",
  "อื่น ๆ",
] as const;

export const SALES_REQUESTS: SalesRequest[] = [
  {
    code: "SR2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    requestDate: "24/06/2569",
    requiredDate: "02/07/2569",
    status: "Converted",
    priority: "High",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "PO-DS-69-0331",
    quotationRef: "QT2506-0001",
    note: "ลูกค้ายืนยันตามใบเสนอราคา ขอรับของช่วงเช้า",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, price: 95, disc: 0, tax: 7, note: "" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "25/06/2569 09:50",
    rejectReason: "",
    soRef: "SO2506-0001",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0001 จากคำขอนี้", u: "Patcharin T.", when: "25/06/2569 10:12", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S. — เครดิตอยู่ในวงเงิน", u: "Pimpaka S.", when: "25/06/2569 09:50", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Patcharin T.", when: "24/06/2569 15:20", kind: "info" },
      { t: "Created from QT2506-0001", d: "สร้างคำขอขายจากใบเสนอราคาที่ลูกค้าตอบรับ", u: "Patcharin T.", when: "24/06/2569 14:05", kind: "" },
    ],
    created: "24/06/2569 14:05",
    createdBy: "Patcharin T.",
    updated: "25/06/2569 10:12",
    updatedBy: "Patcharin T.",
  },
  {
    code: "SR2506-0002",
    customer: "โรงพยาบาลสมานบุญ 1",
    customerCode: "BP000119",
    salesRep: "SALE003 - Narin Chaiyawat",
    requestDate: "26/06/2569",
    requiredDate: "08/07/2569",
    status: "Submitted",
    priority: "Critical",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 60 วัน",
    priceList: "PL-GOV-2026 Government",
    channel: "Government",
    customerRef: "HOSP-PO-2569-0771",
    quotationRef: "QT2506-0002",
    note: "ได้งานประมูลแล้ว รอฝ่ายบัญชีตรวจวงเงินเครดิตก่อนอนุมัติ",
    items: [
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 300, price: 150, disc: 12, tax: 7, note: "ราคาประมูล" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 200, price: 110, disc: 10, tax: 7, note: "" },
    ],
    approvedBy: "",
    approvedDate: "",
    rejectReason: "",
    soRef: "",
    history: [
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน — ยอดสูง ต้องตรวจเครดิต", u: "Narin C.", when: "26/06/2569 16:30", kind: "info" },
      { t: "Created from QT2506-0002", d: "สร้างคำขอขายจากใบเสนอราคางานประมูล", u: "Narin C.", when: "26/06/2569 11:15", kind: "" },
    ],
    created: "26/06/2569 11:15",
    createdBy: "Narin C.",
    updated: "26/06/2569 16:30",
    updatedBy: "Narin C.",
  },
  {
    code: "SR2506-0003",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    salesRep: "SALE002 - Somchai Srisuk",
    requestDate: "27/06/2569",
    requiredDate: "05/07/2569",
    status: "Converted",
    priority: "Normal",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 45 วัน",
    priceList: "PL-DEALER-2026 Dealer",
    channel: "Dealer",
    customerRef: "DMD-PO-0912",
    quotationRef: "QT2506-0003",
    note: "ดีลเลอร์เติมสต๊อกไตรมาส 3 แบ่งกล่องตามสาขาปลายทาง",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 240, price: 120, disc: 18, tax: 7, note: "ราคาดีลเลอร์" },
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 120, price: 150, disc: 18, tax: 7, note: "" },
      { code: "AT-GL001", name: "A-GLASS IONOMER (Universal)", unit: "Set", qty: 30, price: 480, disc: 15, tax: 7, note: "" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "28/06/2569 08:55",
    rejectReason: "",
    soRef: "SO2506-0002",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0002 จากคำขอนี้", u: "Somchai S.", when: "28/06/2569 09:20", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S.", u: "Pimpaka S.", when: "28/06/2569 08:55", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "27/06/2569 14:40", kind: "info" },
      { t: "Created from QT2506-0003", d: "สร้างคำขอขายจากใบเสนอราคา", u: "Somchai S.", when: "27/06/2569 13:10", kind: "" },
    ],
    created: "27/06/2569 13:10",
    createdBy: "Somchai S.",
    updated: "28/06/2569 09:20",
    updatedBy: "Somchai S.",
  },
  {
    code: "SR2507-0004",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    salesRep: "SALE004 - Supavita Yothapun",
    requestDate: "01/07/2569",
    requiredDate: "10/07/2569",
    status: "Draft",
    priority: "Normal",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    currency: "THB",
    payTerm: "เงินสด",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "",
    /* No quotation — the clinic phoned the order in directly. */
    quotationRef: "",
    note: "ลูกค้าโทรสั่งตรง ไม่ได้ผ่านใบเสนอราคา รอยืนยันจำนวนอีกครั้ง",
    items: [
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, price: 95, disc: 0, tax: 7, note: "" },
    ],
    approvedBy: "",
    approvedDate: "",
    rejectReason: "",
    soRef: "",
    history: [
      { t: "Created", d: "สร้างคำขอขายจากการโทรสั่งของลูกค้า", u: "Supavita Y.", when: "01/07/2569 15:50", kind: "" },
    ],
    created: "01/07/2569 15:50",
    createdBy: "Supavita Y.",
    updated: "01/07/2569 15:50",
    updatedBy: "Supavita Y.",
  },
  {
    code: "SR2507-0005",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    salesRep: "SALE002 - Somchai Srisuk",
    requestDate: "02/07/2569",
    requiredDate: "12/07/2569",
    status: "Rejected",
    priority: "Low",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 15 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "",
    quotationRef: "",
    note: "ลูกค้าขอส่วนลดเกินเกณฑ์ที่พนักงานขายอนุมัติได้",
    items: [
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 36, price: 110, disc: 25, tax: 7, note: "ขอส่วนลด 25%" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "",
    rejectReason: "ราคาต่ำกว่าเกณฑ์กำไรขั้นต่ำ",
    soRef: "",
    history: [
      { t: "Rejected", d: "ไม่อนุมัติ: ส่วนลด 25% ทำให้กำไรต่ำกว่าเกณฑ์", u: "Pimpaka S.", when: "02/07/2569 16:40", kind: "warn" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "02/07/2569 14:10", kind: "info" },
      { t: "Created", d: "สร้างคำขอขาย", u: "Somchai S.", when: "02/07/2569 13:30", kind: "" },
    ],
    created: "02/07/2569 13:30",
    createdBy: "Somchai S.",
    updated: "02/07/2569 16:40",
    updatedBy: "Pimpaka S.",
  },
];
