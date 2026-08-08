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

import { BULK_ORDER_ITEMS } from "./bulk-order";

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
  /**
   * Whether this document is billed with VAT. Defaulted from the customer's
   * `billType` when the document is created.
   *
   * "Non VAT" means every line carries tax 0 — the rule is enforced where the
   * document is written, not left to whoever types the lines.
   *
   * There is no way to change it after creation yet; the toggle, the recalc
   * and the warning dialog are step 8b.
   */
  billType: string;
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

  /**
   * Header charges on top of the lines — see the long note on `Quotation`,
   * which explains why these are required rather than optional.
   *
   * A request carries them so the figure agreed on the quotation survives the
   * conversion. A chain that drops them halfway is the same bug as never
   * storing them, found one document later.
   */
  headerDisc: number;
  freight: number;
  otherCharges: number;

  items: SrLine[];
  /** Internal approval trail. */
  approvedBy: string;
  approvedDate: string;
  rejectReason: string;
  /**
   * The lowest authority that may approve this request, frozen at submission.
   *
   * The quotation has carried one since the price floor was enforced; the
   * request did not, so a salesperson who skipped the quotation skipped the
   * floor with it. Same field, same two values ("admin" | "manager"), read
   * the same way — see `priceApproval` and `maySignAt` in doc-draft.
   *
   * Frozen rather than recomputed at approval time for the same reason as on
   * the quotation: the approver signs the document that was put in front of
   * them, not one re-judged against a price master that has moved since.
   */
  priceApprovalLevel: string;
  /** Lines the price master had nothing to compare against, at submission. */
  uncheckedPriceLines: number;
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
    requestDate: "24/06/2026",
    requiredDate: "02/07/2026",
    billType: "VAT",
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
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, price: 95, disc: 0, tax: 7, note: "" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "25/06/2026 09:50",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "SO2506-0001",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0001 จากคำขอนี้", u: "Patcharin T.", when: "25/06/2026 10:12", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S. — เครดิตอยู่ในวงเงิน", u: "Pimpaka S.", when: "25/06/2026 09:50", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Patcharin T.", when: "24/06/2026 15:20", kind: "info" },
      { t: "Created from QT2506-0001", d: "สร้างคำขอขายจากใบเสนอราคาที่ลูกค้าตอบรับ", u: "Patcharin T.", when: "24/06/2026 14:05", kind: "" },
    ],
    created: "24/06/2026 14:05",
    createdBy: "Patcharin T.",
    updated: "25/06/2026 10:12",
    updatedBy: "Patcharin T.",
  },
  {
    code: "SR2506-0002",
    customer: "โรงพยาบาลสมานบุญ 1",
    customerCode: "BP000119",
    salesRep: "SALE003 - Narin Chaiyawat",
    requestDate: "26/06/2026",
    requiredDate: "08/07/2026",
    billType: "Non VAT",
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
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 300, price: 150, disc: 12, tax: 0, note: "ราคาประมูล" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 200, price: 110, disc: 10, tax: 0, note: "" },
    ],
    approvedBy: "",
    approvedDate: "",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "",
    history: [
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน — ยอดสูง ต้องตรวจเครดิต", u: "Narin C.", when: "26/06/2026 16:30", kind: "info" },
      { t: "Created from QT2506-0002", d: "สร้างคำขอขายจากใบเสนอราคางานประมูล", u: "Narin C.", when: "26/06/2026 11:15", kind: "" },
    ],
    created: "26/06/2026 11:15",
    createdBy: "Narin C.",
    updated: "26/06/2026 16:30",
    updatedBy: "Narin C.",
  },
  {
    code: "SR2506-0003",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    salesRep: "SALE002 - Somchai Srisuk",
    requestDate: "27/06/2026",
    requiredDate: "05/07/2026",
    billType: "VAT",
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
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 240, price: 120, disc: 18, tax: 7, note: "ราคาดีลเลอร์" },
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 120, price: 150, disc: 18, tax: 7, note: "" },
      { code: "AT-GL001", name: "A-GLASS IONOMER (Universal)", unit: "Set", qty: 30, price: 480, disc: 15, tax: 7, note: "" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "28/06/2026 08:55",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "SO2506-0002",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0002 จากคำขอนี้", u: "Somchai S.", when: "28/06/2026 09:20", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S.", u: "Pimpaka S.", when: "28/06/2026 08:55", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "27/06/2026 14:40", kind: "info" },
      { t: "Created from QT2506-0003", d: "สร้างคำขอขายจากใบเสนอราคา", u: "Somchai S.", when: "27/06/2026 13:10", kind: "" },
    ],
    created: "27/06/2026 13:10",
    createdBy: "Somchai S.",
    updated: "28/06/2026 09:20",
    updatedBy: "Somchai S.",
  },
  {
    code: "SR2507-0004",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    salesRep: "SALE004 - Supavita Yothapun",
    requestDate: "01/07/2026",
    requiredDate: "10/07/2026",
    billType: "VAT",
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
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, price: 95, disc: 0, tax: 7, note: "" },
    ],
    approvedBy: "",
    approvedDate: "",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "",
    history: [
      { t: "Created", d: "สร้างคำขอขายจากการโทรสั่งของลูกค้า", u: "Supavita Y.", when: "01/07/2026 15:50", kind: "" },
    ],
    created: "01/07/2026 15:50",
    createdBy: "Supavita Y.",
    updated: "01/07/2026 15:50",
    updatedBy: "Supavita Y.",
  },
  {
    code: "SR2507-0005",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    salesRep: "SALE002 - Somchai Srisuk",
    requestDate: "02/07/2026",
    requiredDate: "12/07/2026",
    billType: "Non VAT",
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
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 36, price: 110, disc: 25, tax: 0, note: "ขอส่วนลด 25%" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "",
    rejectReason: "ราคาต่ำกว่าเกณฑ์กำไรขั้นต่ำ",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "",
    history: [
      { t: "Rejected", d: "ไม่อนุมัติ: ส่วนลด 25% ทำให้กำไรต่ำกว่าเกณฑ์", u: "Pimpaka S.", when: "02/07/2026 16:40", kind: "warn" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "02/07/2026 14:10", kind: "info" },
      { t: "Created", d: "สร้างคำขอขาย", u: "Somchai S.", when: "02/07/2026 13:30", kind: "" },
    ],
    created: "02/07/2026 13:30",
    createdBy: "Somchai S.",
    updated: "02/07/2026 16:40",
    updatedBy: "Pimpaka S.",
  },

  /* ============================================================
     THE THREE ORDERS THAT USED TO HAVE NO PAPER BEHIND THEM

     SO2506-0003, -0004 and -0009 were written straight into the
     order file, from the days when an order could be typed on a
     blank page. It cannot any more, so the requests that would
     have produced them are here — Converted, pointing at their
     order, and carrying the same lines at the same prices.

     Not decoration: the order detail links back to its source,
     and an order whose link goes nowhere is the first thing that
     makes somebody distrust the chain.
     ============================================================ */
  {
    code: "SR2506-0006",
    customer: "โรงพยาบาลสมานบุญ 1",
    customerCode: "BP000119",
    salesRep: "SALE003 - Narin Chaiyawat",
    requestDate: "28/06/2026",
    requiredDate: "08/07/2026",
    billType: "Non VAT",
    status: "Converted",
    priority: "Critical",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 60 วัน",
    priceList: "PL-GOV-2026 Government",
    channel: "Government",
    customerRef: "HOSP-PO-2569-0771",
    quotationRef: "",
    note: "ใบสั่งซื้อจากโรงพยาบาล ยอดสูงกว่าวงเงินเดิม ต้องให้บัญชีดูเครดิตก่อน",
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 300, price: 150, disc: 12, tax: 0, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 200, price: 110, disc: 10, tax: 0, note: "" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "29/06/2026 11:30",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "SO2506-0003",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0003 จากคำขอนี้ — ตั้งเป็น On Hold รอเครดิต", u: "Narin C.", when: "29/06/2026 14:00", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S. — เกินวงเงิน ให้เปิดใบสั่งขายไว้ก่อน", u: "Pimpaka S.", when: "29/06/2026 11:30", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Narin C.", when: "28/06/2026 16:20", kind: "info" },
      { t: "Created", d: "สร้างคำขอขายจากใบสั่งซื้อของโรงพยาบาล", u: "Narin C.", when: "28/06/2026 15:40", kind: "" },
    ],
    created: "28/06/2026 15:40",
    createdBy: "Narin C.",
    updated: "29/06/2026 14:00",
    updatedBy: "Narin C.",
  },
  {
    code: "SR2506-0007",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    salesRep: "SALE004 - Supavita Yothapun",
    requestDate: "30/06/2026",
    requiredDate: "03/07/2026",
    billType: "VAT",
    status: "Converted",
    priority: "Normal",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    currency: "THB",
    payTerm: "เงินสด",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "",
    quotationRef: "",
    note: "ลูกค้าโทรสั่งและจะมารับเองที่คลังเชียงใหม่",
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, price: 95, disc: 0, tax: 7, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 12, price: 110, disc: 0, tax: 7, note: "" },
    ],
    approvedBy: "Pimpaka S.",
    approvedDate: "30/06/2026 15:30",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "SO2506-0004",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0004 จากคำขอนี้", u: "Supavita Y.", when: "30/06/2026 15:45", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S. — ชำระเงินสด ไม่ใช้เครดิต", u: "Pimpaka S.", when: "30/06/2026 15:30", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Supavita Y.", when: "30/06/2026 14:50", kind: "info" },
      { t: "Created", d: "สร้างคำขอขายจากการโทรสั่งของลูกค้า", u: "Supavita Y.", when: "30/06/2026 14:30", kind: "" },
    ],
    created: "30/06/2026 14:30",
    createdBy: "Supavita Y.",
    updated: "30/06/2026 15:45",
    updatedBy: "Supavita Y.",
  },
  {
    code: "SR2506-0008",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    requestDate: "25/06/2026",
    requiredDate: "08/07/2026",
    billType: "VAT",
    status: "Converted",
    priority: "High",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-DEALER-2026 Dealer",
    channel: "Dealer",
    customerRef: "DMX-PO-2569-0442",
    quotationRef: "",
    note: "คำสั่งซื้อประจำไตรมาสของดีลเลอร์ ขอให้ส่งครบทุกรายการในรอบเดียว",
    /* The same 38 lines the order carries — the multi-page print fixture. */
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: BULK_ORDER_ITEMS.map((it) => ({
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      disc: it.disc,
      tax: it.tax,
      note: it.note,
    })),
    approvedBy: "Pimpaka S.",
    approvedDate: "26/06/2026 09:20",
    rejectReason: "",
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "SO2506-0009",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0009 จากคำขอนี้", u: "Patcharin T.", when: "26/06/2026 10:05", kind: "primary" },
      { t: "Approved", d: "อนุมัติภายในโดย Pimpaka S. — อนุมัติเกินวงเงินชั่วคราว", u: "Pimpaka S.", when: "26/06/2026 09:20", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Patcharin T.", when: "25/06/2026 17:10", kind: "info" },
      { t: "Created", d: "สร้างคำขอขายจากคำสั่งซื้อประจำไตรมาส", u: "Patcharin T.", when: "25/06/2026 16:30", kind: "" },
    ],
    created: "25/06/2026 16:30",
    createdBy: "Patcharin T.",
    updated: "26/06/2026 10:05",
    updatedBy: "Patcharin T.",
  },
];
