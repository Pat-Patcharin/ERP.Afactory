/**
 * Sales Request — the first outbound document. What the customer asked for
 * and the price we quoted back. Accepting one converts it into a Sales Order.
 *
 * Draft → Sent → Accepted → Converted
 *              → Rejected / Expired
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
}

export interface SalesRequest {
  code: string;
  customer: string;
  customerCode: string;
  salesRep: string;
  requestDate: string;
  validUntil: string;
  status: string;
  priority: string;
  warehouse: string;
  currency: string;
  payTerm: string;
  priceList: string;
  channel: string;
  customerRef: string;
  note: string;
  items: SrLine[];
  soRef: string;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const SR_STATUS = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
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

export const SR_REJECT_REASONS = [
  "ราคาสูงเกินไป",
  "ลูกค้าเลื่อนการสั่งซื้อ",
  "เลือกผู้ขายรายอื่น",
  "สินค้าไม่ตรงความต้องการ",
  "ระยะเวลาส่งมอบไม่ทัน",
  "อื่น ๆ",
] as const;

export const SALES_REQUESTS: SalesRequest[] = [
  {
    code: "SR2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    requestDate: "24/06/2569",
    validUntil: "24/07/2569",
    status: "Converted",
    priority: "High",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "REQ-DS-6806",
    note: "ลูกค้าขอราคาพิเศษสำหรับออร์เดอร์ประจำเดือน",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, price: 95, disc: 0, tax: 7, note: "" },
    ],
    soRef: "SO2506-0001",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0001 จากใบขอเสนอราคานี้", u: "Patcharin T.", when: "25/06/2569 10:12", kind: "primary" },
      { t: "Accepted by customer", d: "ลูกค้ายืนยันราคาทางอีเมล", u: "Patcharin T.", when: "25/06/2569 09:40", kind: "primary" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคาให้ลูกค้า", u: "Patcharin T.", when: "24/06/2569 15:20", kind: "info" },
      { t: "Created", d: "สร้างใบขอเสนอราคา", u: "Patcharin T.", when: "24/06/2569 14:05", kind: "" },
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
    validUntil: "26/07/2569",
    status: "Sent",
    priority: "Critical",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 60 วัน",
    priceList: "PL-GOV-2026 Government",
    channel: "Government",
    customerRef: "TOR-2569-114",
    note: "งานประมูลโรงพยาบาล ต้องแนบใบรับรอง อย. ทุกรายการ",
    items: [
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 300, price: 150, disc: 12, tax: 7, note: "ราคาประมูล" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 200, price: 110, disc: 10, tax: 7, note: "" },
    ],
    soRef: "",
    history: [
      { t: "Sent to customer", d: "ยื่นเอกสารประมูลพร้อมใบรับรอง", u: "Narin C.", when: "26/06/2569 16:30", kind: "info" },
      { t: "Created", d: "สร้างใบขอเสนอราคาสำหรับงานประมูล", u: "Narin C.", when: "26/06/2569 11:15", kind: "" },
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
    validUntil: "11/07/2569",
    status: "Accepted",
    priority: "Normal",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 45 วัน",
    priceList: "PL-DEALER-2026 Dealer",
    channel: "Dealer",
    customerRef: "DMD-Q-0455",
    note: "ดีลเลอร์ขอเติมสต๊อกไตรมาส 3",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 240, price: 120, disc: 18, tax: 7, note: "ราคาดีลเลอร์" },
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 120, price: 150, disc: 18, tax: 7, note: "" },
      { code: "AT-GL001", name: "A-GLASS IONOMER (Universal)", unit: "Set", qty: 30, price: 480, disc: 15, tax: 7, note: "" },
    ],
    soRef: "",
    history: [
      { t: "Accepted by customer", d: "ดีลเลอร์ยืนยันแล้ว รอแปลงเป็นใบสั่งขาย", u: "Somchai S.", when: "28/06/2569 09:05", kind: "primary" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคาทาง LINE", u: "Somchai S.", when: "27/06/2569 14:40", kind: "info" },
      { t: "Created", d: "สร้างใบขอเสนอราคา", u: "Somchai S.", when: "27/06/2569 13:10", kind: "" },
    ],
    created: "27/06/2569 13:10",
    createdBy: "Somchai S.",
    updated: "28/06/2569 09:05",
    updatedBy: "Somchai S.",
  },
  {
    code: "SR2506-0004",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    salesRep: "SALE004 - Supavita Yothapun",
    requestDate: "28/06/2569",
    validUntil: "12/07/2569",
    status: "Draft",
    priority: "Normal",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    currency: "THB",
    payTerm: "เงินสด",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "",
    note: "รอยืนยันจำนวนจากคลินิกอีกครั้ง",
    items: [
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, price: 95, disc: 0, tax: 7, note: "" },
    ],
    soRef: "",
    history: [
      { t: "Created", d: "สร้างใบขอเสนอราคา", u: "Supavita Y.", when: "28/06/2569 15:50", kind: "" },
    ],
    created: "28/06/2569 15:50",
    createdBy: "Supavita Y.",
    updated: "28/06/2569 15:50",
    updatedBy: "Supavita Y.",
  },
  {
    code: "SR2506-0005",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    salesRep: "SALE002 - Somchai Srisuk",
    requestDate: "18/06/2569",
    validUntil: "25/06/2569",
    status: "Rejected",
    priority: "Low",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 15 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "",
    note: "ลูกค้าแจ้งว่าราคาสูงกว่าคู่แข่ง",
    items: [
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 36, price: 110, disc: 0, tax: 7, note: "" },
    ],
    soRef: "",
    history: [
      { t: "Rejected by customer", d: "เหตุผล: ราคาสูงเกินไป", u: "Somchai S.", when: "24/06/2569 11:20", kind: "warn" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคา", u: "Somchai S.", when: "18/06/2569 10:00", kind: "info" },
      { t: "Created", d: "สร้างใบขอเสนอราคา", u: "Somchai S.", when: "18/06/2569 09:30", kind: "" },
    ],
    created: "18/06/2569 09:30",
    createdBy: "Somchai S.",
    updated: "24/06/2569 11:20",
    updatedBy: "Somchai S.",
  },
];
