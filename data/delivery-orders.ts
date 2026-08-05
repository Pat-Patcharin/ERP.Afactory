/**
 * Delivery Order — the shipment itself. Generated from a completed Packing
 * task; confirming delivery is what finally decrements the sales order.
 *
 * Draft → Ready → Shipped → Delivered
 *                         → Failed / Cancelled
 *
 * Mock dataset; mutating these arrays is how the prototype persists changes.
 */

import { BULK_ORDER_ITEMS } from "./bulk-order";

export interface DoLine {
  line: number;
  code: string;
  name: string;
  unit: string;
  qty: number;
  delivered: number;
  box: string;
  note: string;
  /** Traceability, carried onto the printed delivery note. Empty when the
   *  item is not lot- or serial-controlled. */
  lot?: string;
  serial?: string;
  /** Salesperson's own name for the line. Blank falls back to `name` —
   *  read it through displayName(), never directly. */
  customName?: string;
  /** Whether customName and note reach customer-facing paper. Undefined = yes. */
  showOnBill?: boolean;
}

export interface DeliveryOrder {
  code: string;
  soRef: string;
  packRef: string;
  customer: string;
  customerCode: string;
  shipTo: string;
  contact: string;
  phone: string;
  warehouse: string;
  carrier: string;
  service: string;
  driver: string;
  vehicle: string;
  trackingNo: string;
  deliveryDate: string;
  deliveryTime: string;
  status: string;
  priority: string;
  packages: number;
  weight: number;
  codAmount: number;
  receivedBy: string;
  receivedDate: string;
  failReason: string;
  remark: string;
  items: DoLine[];
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const DO_STATUS = [
  "Draft",
  "Ready",
  "Shipped",
  "Delivered",
  "Failed",
  "Cancelled",
] as const;

export const DO_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const DO_CARRIERS = [
  "A-Factory Fleet",
  "Kerry Express",
  "Flash Express",
  "SCG Express",
  "DHL",
  "ลูกค้ามารับเอง",
] as const;

export const DO_SERVICES = [
  "Standard",
  "Express",
  "Same Day",
  "Cold Chain",
  "Self Pickup",
] as const;

export const DO_DRIVERS = ["Anan P.", "Somchai B.", "Teerapat K.", "—"] as const;

export const DO_TIME_SLOTS = [
  "09:00 - 11:00",
  "11:00 - 13:00",
  "13:00 - 15:00",
  "15:00 - 17:00",
  "ทั้งวัน",
] as const;

export const DO_FAIL_REASONS = [
  "ไม่มีผู้รับ",
  "ที่อยู่ไม่ถูกต้อง",
  "ลูกค้าปฏิเสธรับของ",
  "สินค้าเสียหายระหว่างขนส่ง",
  "รถเสีย / เหตุสุดวิสัย",
] as const;

export const DELIVERY_ORDERS: DeliveryOrder[] = [
  {
    code: "DO2507-0001",
    soRef: "SO2506-0001",
    packRef: "PACK2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    shipTo: "119/25 อาคารเดนทัลทาวเวอร์ ชั้น 8 คลองเตย กรุงเทพมหานคร 10110",
    contact: "คุณวราภรณ์ ใจดี",
    phone: "081-123-4567",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    carrier: "A-Factory Fleet",
    service: "Standard",
    driver: "Anan P.",
    vehicle: "1กก-1234",
    trackingNo: "AFT-2507-000112",
    deliveryDate: "01/07/2569",
    deliveryTime: "09:00 - 11:00",
    status: "Delivered",
    priority: "High",
    packages: 2,
    weight: 17.6,
    codAmount: 0,
    receivedBy: "คุณวราภรณ์ ใจดี",
    receivedDate: "01/07/2569 10:45",
    failReason: "",
    remark: "ลูกค้ารับของครบ เซ็นรับเรียบร้อย",
    items: [
      { line: 1, code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, delivered: 120, box: "BOX-01", note: "" },
      { line: 2, code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, delivered: 40, box: "BOX-01", note: "ลูกค้าขอรับบางส่วน" },
      { line: 3, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, delivered: 0, box: "BOX-02", note: "เลื่อนรอบถัดไป" },
    ],
    history: [
      { t: "Delivered", d: "ผู้รับ: คุณวราภรณ์ ใจดี — รับ 160 จาก 220 หน่วย", u: "Anan P.", when: "01/07/2569 10:45", kind: "primary" },
      { t: "Shipped", d: "ออกจากคลัง 2 กล่อง น้ำหนัก 17.6 กก.", u: "Anan P.", when: "01/07/2569 08:15", kind: "info" },
      { t: "Ready to ship", d: "จัดของขึ้นรถเรียบร้อย", u: "Pimlada P.", when: "30/06/2569 17:40", kind: "info" },
      { t: "Created from PACK2506-0001", d: "สร้างใบส่งของจากงานแพ็ค", u: "Pimlada P.", when: "30/06/2569 17:25", kind: "" },
    ],
    created: "30/06/2569 17:25",
    createdBy: "Pimlada P.",
    updated: "01/07/2569 10:45",
    updatedBy: "Anan P.",
  },
  {
    code: "DO2507-0002",
    soRef: "SO2506-0004",
    packRef: "PACK2506-0002",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    shipTo: "212/9 ถนนนิมมานเหมินท์ เมืองเชียงใหม่ เชียงใหม่ 50200",
    contact: "คุณสุดา ทองดี",
    phone: "089-555-1212",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    carrier: "ลูกค้ามารับเอง",
    service: "Self Pickup",
    driver: "—",
    vehicle: "—",
    trackingNo: "",
    deliveryDate: "03/07/2569",
    deliveryTime: "11:00 - 13:00",
    status: "Delivered",
    priority: "Normal",
    packages: 1,
    weight: 3.1,
    codAmount: 3852,
    receivedBy: "คุณสุดา ทองดี",
    receivedDate: "03/07/2569 11:20",
    failReason: "",
    remark: "ลูกค้ามารับเองที่คลังเชียงใหม่ ชำระเงินสด",
    items: [
      { line: 1, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, delivered: 24, box: "BOX-01", note: "" },
      { line: 2, code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 12, delivered: 12, box: "BOX-01", note: "" },
    ],
    history: [
      { t: "Delivered", d: "ลูกค้ารับของครบ ชำระเงินสด 3,852 บาท", u: "Supavita Y.", when: "03/07/2569 11:20", kind: "primary" },
      { t: "Ready to ship", d: "เตรียมของรอลูกค้ามารับ", u: "Nattapong K.", when: "02/07/2569 10:45", kind: "info" },
      { t: "Created from PACK2506-0002", d: "สร้างใบส่งของจากงานแพ็ค", u: "Nattapong K.", when: "02/07/2569 10:40", kind: "" },
    ],
    created: "02/07/2569 10:40",
    createdBy: "Nattapong K.",
    updated: "03/07/2569 11:20",
    updatedBy: "Supavita Y.",
  },
  {
    code: "DO2507-0003",
    soRef: "SO2506-0002",
    packRef: "",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    shipTo: "45/7 ถนนพระราม 2 บางขุนเทียน กรุงเทพมหานคร 10150",
    contact: "คุณธนา แม็กซ์",
    phone: "086-321-9988",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    carrier: "Kerry Express",
    service: "Standard",
    driver: "—",
    vehicle: "—",
    trackingNo: "",
    deliveryDate: "05/07/2569",
    deliveryTime: "13:00 - 15:00",
    status: "Draft",
    priority: "Normal",
    packages: 0,
    weight: 0,
    codAmount: 0,
    receivedBy: "",
    receivedDate: "",
    failReason: "",
    remark: "รอฝ่ายแพ็คปิดงานก่อนจึงจะออกใบส่งของได้",
    items: [
      { line: 1, code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 180, delivered: 0, box: "", note: "" },
    ],
    history: [
      { t: "Created", d: "ตั้งใบส่งของล่วงหน้ารอของจากฝ่ายแพ็ค", u: "Somchai S.", when: "29/06/2569 12:00", kind: "" },
    ],
    created: "29/06/2569 12:00",
    createdBy: "Somchai S.",
    updated: "29/06/2569 12:00",
    updatedBy: "Somchai S.",
  },
  {
    code: "DO2507-0004",
    soRef: "SO2506-0001",
    packRef: "PACK2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    shipTo: "88/9 หมู่ 5 ซอยบางนา-ตราด 25 บางนา กรุงเทพมหานคร 10260",
    contact: "คุณสมหญิง รักงาน",
    phone: "089-222-3344",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    carrier: "A-Factory Fleet",
    service: "Express",
    driver: "Somchai B.",
    vehicle: "2ขข-5678",
    trackingNo: "AFT-2507-000118",
    deliveryDate: "04/07/2569",
    deliveryTime: "09:00 - 11:00",
    status: "Shipped",
    priority: "High",
    packages: 1,
    weight: 5.2,
    codAmount: 0,
    receivedBy: "",
    receivedDate: "",
    failReason: "",
    remark: "ส่งของงวดที่สองที่คลังบางนา",
    items: [
      { line: 1, code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 20, delivered: 0, box: "BOX-01", note: "ส่วนที่ค้างจากงวดแรก" },
      { line: 2, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, delivered: 0, box: "BOX-02", note: "" },
    ],
    history: [
      { t: "Shipped", d: "ออกจากคลัง มุ่งหน้าคลังบางนา", u: "Somchai B.", when: "04/07/2569 08:05", kind: "info" },
      { t: "Ready to ship", d: "จัดของขึ้นรถ", u: "Pimlada P.", when: "03/07/2569 16:50", kind: "info" },
      { t: "Created from PACK2506-0001", d: "สร้างใบส่งของงวดที่สอง", u: "Pimlada P.", when: "03/07/2569 16:30", kind: "" },
    ],
    created: "03/07/2569 16:30",
    createdBy: "Pimlada P.",
    updated: "04/07/2569 08:05",
    updatedBy: "Somchai B.",
  },
  {
    code: "DO2507-0005",
    soRef: "SO2506-0005",
    packRef: "",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    shipTo: "9/12 ถนนเพชรเกษม หาดใหญ่ สงขลา 90110",
    contact: "คุณก้าวหน้า ทันตภัณฑ์",
    phone: "074-221-8899",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    carrier: "Flash Express",
    service: "Standard",
    driver: "—",
    vehicle: "—",
    trackingNo: "FL2507889221",
    deliveryDate: "02/07/2569",
    deliveryTime: "ทั้งวัน",
    status: "Failed",
    priority: "Normal",
    packages: 1,
    weight: 4.4,
    codAmount: 0,
    receivedBy: "",
    receivedDate: "",
    failReason: "ไม่มีผู้รับ",
    remark: "ขนส่งแจ้งว่าร้านปิด นัดส่งใหม่วันถัดไป",
    items: [
      { line: 1, code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 48, delivered: 0, box: "BOX-01", note: "" },
    ],
    history: [
      { t: "Delivery failed", d: "เหตุผล: ไม่มีผู้รับ — นัดส่งใหม่", u: "Flash Express", when: "02/07/2569 15:30", kind: "warn" },
      { t: "Shipped", d: "ส่งมอบให้ขนส่งแล้ว", u: "Pimlada P.", when: "02/07/2569 09:00", kind: "info" },
      { t: "Created", d: "สร้างใบส่งของ", u: "Somchai S.", when: "01/07/2569 14:20", kind: "" },
    ],
    created: "01/07/2569 14:20",
    createdBy: "Somchai S.",
    updated: "02/07/2569 15:30",
    updatedBy: "Flash Express",
  },
  {
    /* The 38-line delivery against SO2506-0009 — the multi-page print
       fixture. It is the only document here that spills onto continuation
       pages, so the pagination rules are exercised by real data rather than
       only by the test suite. */
    code: "DO2507-0006",
    soRef: "SO2506-0009",
    packRef: "",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    shipTo: "45/7 ถนนพระราม 2 บางขุนเทียน กรุงเทพมหานคร 10150",
    contact: "คุณธนา แม็กซ์",
    phone: "086-321-9988",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    carrier: "A-Factory Fleet",
    service: "Standard",
    driver: "Teerapat K.",
    vehicle: "3คค-9012",
    trackingNo: "AFT-2507-000140",
    deliveryDate: "06/07/2569",
    deliveryTime: "09:00 - 11:00",
    status: "Shipped",
    priority: "High",
    packages: 14,
    weight: 486.5,
    codAmount: 0,
    receivedBy: "",
    receivedDate: "",
    failReason: "",
    remark: "ของ 38 รายการ 14 หีบห่อ กรุณาตรวจนับให้ครบก่อนลงนามรับ",
    items: BULK_ORDER_ITEMS.map((it, i) => ({
      line: i + 1,
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      delivered: 0,
      box: it.box,
      note: it.note,
      lot: it.lot,
      serial: it.serial,
    })),
    history: [
      { t: "Shipped", d: "ออกจากคลัง 14 หีบห่อ น้ำหนักรวม 486.5 กก.", u: "Teerapat K.", when: "06/07/2569 08:20", kind: "info" },
      { t: "Ready to ship", d: "จัดของขึ้นรถครบ 38 รายการ", u: "Pimlada P.", when: "05/07/2569 17:10", kind: "info" },
      { t: "Created from SO2506-0009", d: "สร้างใบส่งของจากใบสั่งขาย 38 รายการ", u: "Pimlada P.", when: "05/07/2569 16:40", kind: "" },
    ],
    created: "05/07/2569 16:40",
    createdBy: "Pimlada P.",
    updated: "06/07/2569 08:20",
    updatedBy: "Teerapat K.",
  },
];
