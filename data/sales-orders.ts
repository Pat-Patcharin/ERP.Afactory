/**
 * Sales Order — the confirmed commitment to the customer. Everything
 * downstream (Picking, Packing, Delivery) is generated from one of these.
 *
 * Draft → Confirmed → Picking → Partially Delivered → Completed
 *       → On Hold (credit)      → Cancelled
 *
 * Mock dataset; mutating these arrays is how the prototype persists changes.
 */

import { BULK_ORDER_ITEMS } from "./bulk-order";

export interface SoLine {
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  disc: number;
  tax: number;
  /** Quantity already pulled from the bins. */
  picked: number;
  /** Quantity already handed to the customer. */
  delivered: number;
  note: string;
  /** Salesperson's own name for the line. Blank falls back to `name` —
   *  read it through displayName(), never directly. */
  customName?: string;
  /** Whether customName and note reach customer-facing paper. Undefined = yes. */
  showOnBill?: boolean;
}

export interface SalesOrder {
  code: string;
  customer: string;
  customerCode: string;
  salesRep: string;
  orderDate: string;
  deliveryDate: string;
  warehouse: string;
  currency: string;
  fx: number;
  payTerm: string;
  incoterm: string;
  shipTo: string;
  status: string;
  priority: string;
  channel: string;
  /** The Sales Request this order came from, when it took that route. */
  srRef: string;
  /**
   * The Quotation this order came from, when the quote converted straight to
   * an order. Optional: orders raised from a Sales Request or by hand leave
   * it empty, and every order predating the direct route has none.
   */
  quotationRef?: string;
  customerPo: string;
  remark: string;
  /** Cleared by sales admin when the order exceeds the credit limit. */
  creditApproved: boolean;
  creditNote: string;
  items: SoLine[];
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const SO_STATUS = [
  "Draft",
  "Confirmed",
  "On Hold",
  "Picking",
  "Partially Delivered",
  "Completed",
  "Cancelled",
] as const;

export const SO_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const SO_INCOTERMS = ["EXW", "FOB", "CIF", "DDP", "DAP", "FCA"] as const;

export const SO_CHANNELS = ["Direct", "Dealer", "Online", "Government", "Export"] as const;

export const SALES_ORDERS: SalesOrder[] = [
  {
    code: "SO2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    orderDate: "25/06/2569",
    deliveryDate: "02/07/2569",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 30 วัน",
    incoterm: "DDP",
    shipTo: "119/25 อาคารเดนทัลทาวเวอร์ ชั้น 8 คลองเตย กรุงเทพมหานคร 10110",
    status: "Partially Delivered",
    priority: "High",
    channel: "Direct",
    srRef: "SR2506-0001",
    customerPo: "PO-DS-69-0331",
    remark: "ส่งของช่วงเช้าเท่านั้น ลูกค้ารับของ 09:00–11:00",
    creditApproved: true,
    creditNote: "อยู่ในวงเงิน",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, price: 120, disc: 5, tax: 7, picked: 120, delivered: 120, note: "" },
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, price: 120, disc: 5, tax: 7, picked: 60, delivered: 40, note: "ทยอยส่ง" },
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, price: 95, disc: 0, tax: 7, picked: 40, delivered: 0, note: "" },
    ],
    history: [
      { t: "Partially delivered", d: "ส่งมอบงวดแรก 160 หน่วย", u: "Somchai B.", when: "01/07/2569 10:45", kind: "info" },
      { t: "Picking completed", d: "หยิบสินค้าครบตามใบสั่งขาย", u: "Warin S.", when: "30/06/2569 16:10", kind: "info" },
      { t: "Confirmed", d: "ยืนยันคำสั่งขาย เครดิตผ่าน", u: "Patcharin T.", when: "25/06/2569 10:30", kind: "primary" },
      { t: "Created from SR2506-0001", d: "แปลงจากใบขอเสนอราคา", u: "Patcharin T.", when: "25/06/2569 10:12", kind: "" },
    ],
    created: "25/06/2569 10:12",
    createdBy: "Patcharin T.",
    updated: "01/07/2569 10:45",
    updatedBy: "Somchai B.",
  },
  {
    code: "SO2506-0002",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    salesRep: "SALE002 - Somchai Srisuk",
    orderDate: "28/06/2569",
    deliveryDate: "05/07/2569",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 45 วัน",
    incoterm: "DAP",
    shipTo: "45/7 ถนนพระราม 2 บางขุนเทียน กรุงเทพมหานคร 10150",
    status: "Picking",
    priority: "Normal",
    channel: "Dealer",
    srRef: "SR2506-0003",
    customerPo: "DMD-PO-0912",
    remark: "แบ่งกล่องตามสาขาปลายทาง",
    creditApproved: true,
    creditNote: "อยู่ในวงเงิน",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 240, price: 120, disc: 18, tax: 7, picked: 180, delivered: 0, note: "" },
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 120, price: 150, disc: 18, tax: 7, picked: 0, delivered: 0, note: "" },
      { code: "AT-GL001", name: "A-GLASS IONOMER (Universal)", unit: "Set", qty: 30, price: 480, disc: 15, tax: 7, picked: 0, delivered: 0, note: "" },
    ],
    history: [
      { t: "Picking started", d: "มอบหมายงานหยิบสินค้าให้ Warin S.", u: "Warin S.", when: "29/06/2569 09:20", kind: "info" },
      { t: "Confirmed", d: "ยืนยันคำสั่งขาย", u: "Somchai S.", when: "28/06/2569 09:30", kind: "primary" },
      { t: "Created from SR2506-0003", d: "แปลงจากใบขอเสนอราคา", u: "Somchai S.", when: "28/06/2569 09:20", kind: "" },
    ],
    created: "28/06/2569 09:20",
    createdBy: "Somchai S.",
    updated: "29/06/2569 09:20",
    updatedBy: "Warin S.",
  },
  {
    code: "SO2506-0003",
    customer: "โรงพยาบาลสมานบุญ 1",
    customerCode: "BP000119",
    salesRep: "SALE003 - Narin Chaiyawat",
    orderDate: "29/06/2569",
    deliveryDate: "08/07/2569",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 60 วัน",
    incoterm: "DDP",
    shipTo: "88 หมู่ 4 ถนนติวานนท์ เมืองนนทบุรี นนทบุรี 11000",
    status: "On Hold",
    priority: "Critical",
    channel: "Government",
    srRef: "",
    customerPo: "HOSP-PO-2569-0771",
    remark: "รอฝ่ายบัญชีอนุมัติวงเงินก่อนจึงจะยืนยันได้",
    creditApproved: false,
    creditNote: "ยอดสั่งซื้อทำให้เกินวงเงินเครดิตที่อนุมัติไว้",
    items: [
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 300, price: 150, disc: 12, tax: 7, picked: 0, delivered: 0, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 200, price: 110, disc: 10, tax: 7, picked: 0, delivered: 0, note: "" },
    ],
    history: [
      { t: "Put on credit hold", d: "ยอดรวมเกินวงเงินเครดิตคงเหลือ", u: "ระบบ", when: "29/06/2569 14:05", kind: "warn" },
      { t: "Created", d: "สร้างใบสั่งขายจากใบสั่งซื้อของโรงพยาบาล", u: "Narin C.", when: "29/06/2569 14:00", kind: "" },
    ],
    created: "29/06/2569 14:00",
    createdBy: "Narin C.",
    updated: "29/06/2569 14:05",
    updatedBy: "ระบบ",
  },
  {
    code: "SO2506-0004",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    salesRep: "SALE004 - Supavita Yothapun",
    orderDate: "30/06/2569",
    deliveryDate: "03/07/2569",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "เงินสด",
    incoterm: "EXW",
    shipTo: "212/9 ถนนนิมมานเหมินท์ เมืองเชียงใหม่ เชียงใหม่ 50200",
    status: "Completed",
    priority: "Normal",
    channel: "Direct",
    srRef: "",
    customerPo: "",
    remark: "ลูกค้ามารับเองที่คลัง",
    creditApproved: true,
    creditNote: "ชำระเงินสด",
    items: [
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, price: 95, disc: 0, tax: 7, picked: 24, delivered: 24, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 12, price: 110, disc: 0, tax: 7, picked: 12, delivered: 12, note: "" },
    ],
    history: [
      { t: "Completed", d: "ส่งมอบครบถ้วน ลูกค้ารับของแล้ว", u: "Supavita Y.", when: "03/07/2569 11:20", kind: "primary" },
      { t: "Confirmed", d: "ยืนยันคำสั่งขาย ชำระเงินสด", u: "Supavita Y.", when: "30/06/2569 16:00", kind: "primary" },
      { t: "Created", d: "สร้างใบสั่งขาย", u: "Supavita Y.", when: "30/06/2569 15:45", kind: "" },
    ],
    created: "30/06/2569 15:45",
    createdBy: "Supavita Y.",
    updated: "03/07/2569 11:20",
    updatedBy: "Supavita Y.",
  },
  {
    code: "SO2506-0005",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    salesRep: "SALE002 - Somchai Srisuk",
    orderDate: "01/07/2569",
    deliveryDate: "09/07/2569",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 15 วัน",
    incoterm: "DAP",
    shipTo: "9/12 ถนนเพชรเกษม หาดใหญ่ สงขลา 90110",
    status: "Confirmed",
    priority: "Normal",
    channel: "Direct",
    srRef: "",
    /* Came straight from the quotation — no Sales Request in between. */
    quotationRef: "QT2507-0007",
    customerPo: "KWN-0088",
    remark: "สร้างจากใบเสนอราคา QT2507-0007",
    creditApproved: true,
    creditNote: "อยู่ในวงเงิน",
    items: [
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 48, price: 120, disc: 3, tax: 7, picked: 0, delivered: 0, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 36, price: 110, disc: 3, tax: 7, picked: 0, delivered: 0, note: "" },
    ],
    history: [
      { t: "Confirmed", d: "ยืนยันคำสั่งขาย รอจัดของ", u: "Somchai S.", when: "01/07/2569 09:15", kind: "primary" },
      { t: "Created from QT2507-0007", d: "แปลงจากใบเสนอราคา", u: "Somchai S.", when: "01/07/2569 09:05", kind: "primary" },
    ],
    created: "01/07/2569 09:05",
    createdBy: "Somchai S.",
    updated: "01/07/2569 09:15",
    updatedBy: "Somchai S.",
  },
  {
    /* The annual stock-up order — 38 lines, which is what makes it useful:
       it is the only document in the mock set that cannot be printed on a
       single page. See data/bulk-order.ts. */
    code: "SO2506-0009",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    orderDate: "26/06/2569",
    deliveryDate: "08/07/2569",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 30 วัน",
    incoterm: "DAP",
    shipTo: "45/7 ถนนพระราม 2 บางขุนเทียน กรุงเทพมหานคร 10150",
    status: "Partially Delivered",
    priority: "High",
    channel: "Dealer",
    srRef: "",
    customerPo: "DMX-PO-2569-0442",
    remark: "คำสั่งซื้อประจำไตรมาส ขอให้ส่งครบทุกรายการในรอบเดียว",
    creditApproved: true,
    creditNote: "อนุมัติเกินวงเงินชั่วคราวโดยผู้จัดการฝ่ายขาย",
    items: BULK_ORDER_ITEMS.map((it) => ({
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      disc: it.disc,
      tax: it.tax,
      picked: it.qty,
      delivered: 0,
      note: it.note,
    })),
    history: [
      { t: "Partially Delivered", d: "ส่งงวดแรกตาม DO2507-0006", u: "Pimlada P.", when: "06/07/2569 09:30", kind: "info" },
      { t: "Confirmed", d: "ยืนยันคำสั่งขาย 38 รายการ", u: "Patcharin T.", when: "26/06/2569 14:20", kind: "primary" },
      { t: "Created", d: "สร้างใบสั่งขายจากใบสั่งซื้อของลูกค้า", u: "Patcharin T.", when: "26/06/2569 13:55", kind: "" },
    ],
    created: "26/06/2569 13:55",
    createdBy: "Patcharin T.",
    updated: "06/07/2569 09:30",
    updatedBy: "Pimlada P.",
  },
];
