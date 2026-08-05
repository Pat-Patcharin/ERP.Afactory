/**
 * Quotation — the OPTIONAL price offer sent to a customer before anything is
 * committed. Accepting one converts it into a Sales Request; a Sales Request
 * can equally be raised without a quotation ever existing.
 *
 * Draft → Sent → Accepted → Converted
 *              → Rejected / Expired
 *
 * Nothing here touches stock. Mock dataset; mutating these arrays is how the
 * prototype persists changes.
 */

export interface QtLine {
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  disc: number;
  tax: number;
  note: string;
}

export interface Quotation {
  code: string;
  customer: string;
  customerCode: string;
  salesRep: string;
  quoteDate: string;
  validUntil: string;
  /** Where the document has got to — see QT_STATUS. */
  status: string;
  /** Whether it cleared internal approval — see QT_APPROVAL_STATUS. */
  approvalStatus: string;
  /**
   * Which issue of this quotation the customer is looking at. Starts at 1 and
   * rises each time an approved quote is pulled back for edits, so the number
   * on a printed sheet identifies exactly which version was agreed.
   */
  revision: number;
  currency: string;
  payTerm: string;
  priceList: string;
  channel: string;
  customerRef: string;
  /** Why the customer said no — kept for win/loss reporting later. */
  rejectReason: string;
  note: string;
  items: QtLine[];
  /**
   * Where this quotation went. An accepted quote now converts straight to a
   * Sales Order, so `soRef` is the normal outcome; `srRef` is the fallback
   * route, still used when a customer wants the request raised internally
   * first. A quotation fills at most one of the two.
   */
  soRef: string;
  /** The Sales Request this quotation turned into, if any. */
  srRef: string;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

/**
 * Where the document has got to. Listed in the order it moves through them —
 * the two approval statuses sit between Draft and Sent, because a quote is now
 * approved internally before it may leave the building.
 *
 * Kept in step with `QT_TONE` in lib/badges.ts — a tone with no status is dead
 * code, and a status with no tone renders unstyled.
 */
export const QT_STATUS = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
  "Converted",
  "Cancelled",
] as const;

/**
 * Whether the document has cleared internal approval — the second dimension,
 * as Credit Note and Sales Return already model it.
 *
 * It exists because the two questions have different answers. A quote sent
 * back for edits returns to `Draft`, which is indistinguishable from one that
 * was never submitted; `approvalStatus` is what tells them apart. Equally,
 * `Rejected` here means the approver refused it, while `status: "Rejected"`
 * means the customer did — QT2506-0004 below is approved internally and
 * rejected by the customer at the same time.
 *
 * Paired with `QT_APPROVAL_TONE` in lib/badges.ts.
 */
export const QT_APPROVAL_STATUS = [
  "Not Submitted",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Revision Requested",
] as const;

/**
 * Statuses that seal the document. Once a quote has been approved, the figures
 * on it are what somebody signed off and, from `Sent` onward, what the customer
 * is holding — editing in place would silently change an agreed offer. Getting
 * back to editing means `qtRequestEdit`, which returns the quote to `Draft`,
 * raises the revision and sends it round the approval loop again.
 *
 * `Rejected`, `Expired` and `Cancelled` are not listed: those are dead ends
 * nobody reopens, and the Edit button is already hidden for them.
 */
export const QT_LOCKED_STATUS = ["Approved", "Sent", "Accepted", "Converted"] as const;

export const isQuotationLocked = (status: string): boolean =>
  (QT_LOCKED_STATUS as readonly string[]).includes(status);

export const QT_PRICE_LISTS = [
  "PL-STD-2026 Standard",
  "PL-CLINIC-2026 Clinic",
  "PL-DEALER-2026 Dealer",
  "PL-GOV-2026 Government",
] as const;

export const QT_CHANNELS = ["Direct", "Dealer", "Online", "Government", "Export"] as const;

export const QT_REJECT_REASONS = [
  "ราคาสูงเกินไป",
  "ลูกค้าเลื่อนการสั่งซื้อ",
  "เลือกผู้ขายรายอื่น",
  "สินค้าไม่ตรงความต้องการ",
  "ระยะเวลาส่งมอบไม่ทัน",
  "อื่น ๆ",
] as const;

/** How long a quote stays valid by default. */
export const QT_VALIDITY_DAYS = 30;

export const QUOTATIONS: Quotation[] = [
  {
    code: "QT2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    quoteDate: "22/06/2569",
    validUntil: "22/07/2569",
    status: "Converted",
    approvalStatus: "Approved",
    revision: 1,
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "RFQ-DS-6806",
    rejectReason: "",
    note: "ลูกค้าขอราคาพิเศษสำหรับออร์เดอร์ประจำเดือน",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, price: 120, disc: 5, tax: 7, note: "" },
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, price: 95, disc: 0, tax: 7, note: "" },
    ],
    soRef: "",
    srRef: "SR2506-0001",
    history: [
      { t: "Converted to Sales Request", d: "สร้าง SR2506-0001 จากใบเสนอราคานี้", u: "Patcharin T.", when: "24/06/2569 14:05", kind: "primary" },
      { t: "Accepted by customer", d: "ลูกค้ายืนยันราคาทางอีเมล", u: "Patcharin T.", when: "24/06/2569 09:40", kind: "primary" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคาให้ลูกค้า", u: "Patcharin T.", when: "22/06/2569 15:20", kind: "info" },
      { t: "Approved", d: "อนุมัติภายในโดย สมชาย ใจดี", u: "สมชาย ใจดี", when: "22/06/2569 15:00", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Patcharin T.", when: "22/06/2569 14:20", kind: "info" },
      { t: "Created", d: "สร้างใบเสนอราคา", u: "Patcharin T.", when: "22/06/2569 14:05", kind: "" },
    ],
    created: "22/06/2569 14:05",
    createdBy: "Patcharin T.",
    updated: "24/06/2569 14:05",
    updatedBy: "Patcharin T.",
  },
  {
    code: "QT2506-0002",
    customer: "โรงพยาบาลสมานบุญ 1",
    customerCode: "BP000119",
    salesRep: "SALE003 - Narin Chaiyawat",
    quoteDate: "24/06/2569",
    validUntil: "24/07/2569",
    status: "Converted",
    approvalStatus: "Approved",
    revision: 1,
    currency: "THB",
    payTerm: "เครดิต 60 วัน",
    priceList: "PL-GOV-2026 Government",
    channel: "Government",
    customerRef: "TOR-2569-114",
    rejectReason: "",
    note: "งานประมูลโรงพยาบาล ต้องแนบใบรับรอง อย. ทุกรายการ",
    items: [
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 300, price: 150, disc: 12, tax: 7, note: "ราคาประมูล" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 200, price: 110, disc: 10, tax: 7, note: "" },
    ],
    soRef: "",
    srRef: "SR2506-0002",
    history: [
      { t: "Converted to Sales Request", d: "สร้าง SR2506-0002 รออนุมัติภายใน", u: "Narin C.", when: "26/06/2569 11:15", kind: "primary" },
      { t: "Accepted by customer", d: "โรงพยาบาลแจ้งผลประมูล — ได้งาน", u: "Narin C.", when: "26/06/2569 10:00", kind: "primary" },
      { t: "Sent to customer", d: "ยื่นเอกสารประมูลพร้อมใบรับรอง", u: "Narin C.", when: "24/06/2569 16:30", kind: "info" },
      { t: "Approved", d: "อนุมัติภายในโดย สมชาย ใจดี", u: "สมชาย ใจดี", when: "24/06/2569 15:45", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Narin C.", when: "24/06/2569 11:30", kind: "info" },
      { t: "Created", d: "สร้างใบเสนอราคาสำหรับงานประมูล", u: "Narin C.", when: "24/06/2569 11:15", kind: "" },
    ],
    created: "24/06/2569 11:15",
    createdBy: "Narin C.",
    updated: "26/06/2569 11:15",
    updatedBy: "Narin C.",
  },
  {
    code: "QT2506-0003",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    salesRep: "SALE002 - Somchai Srisuk",
    quoteDate: "25/06/2569",
    validUntil: "09/07/2569",
    status: "Converted",
    approvalStatus: "Approved",
    revision: 1,
    currency: "THB",
    payTerm: "เครดิต 45 วัน",
    priceList: "PL-DEALER-2026 Dealer",
    channel: "Dealer",
    customerRef: "DMD-Q-0455",
    rejectReason: "",
    note: "ดีลเลอร์ขอเติมสต๊อกไตรมาส 3",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 240, price: 120, disc: 18, tax: 7, note: "ราคาดีลเลอร์" },
      { code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", qty: 120, price: 150, disc: 18, tax: 7, note: "" },
      { code: "AT-GL001", name: "A-GLASS IONOMER (Universal)", unit: "Set", qty: 30, price: 480, disc: 15, tax: 7, note: "" },
    ],
    soRef: "",
    srRef: "SR2506-0003",
    history: [
      { t: "Converted to Sales Request", d: "สร้าง SR2506-0003 จากใบเสนอราคานี้", u: "Somchai S.", when: "27/06/2569 13:10", kind: "primary" },
      { t: "Accepted by customer", d: "ดีลเลอร์ยืนยันแล้ว", u: "Somchai S.", when: "27/06/2569 09:05", kind: "primary" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคาทาง LINE", u: "Somchai S.", when: "25/06/2569 14:40", kind: "info" },
      { t: "Approved", d: "อนุมัติภายในโดย สมชาย ใจดี", u: "สมชาย ใจดี", when: "25/06/2569 14:10", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "25/06/2569 13:25", kind: "info" },
      { t: "Created", d: "สร้างใบเสนอราคา", u: "Somchai S.", when: "25/06/2569 13:10", kind: "" },
    ],
    created: "25/06/2569 13:10",
    createdBy: "Somchai S.",
    updated: "27/06/2569 13:10",
    updatedBy: "Somchai S.",
  },
  {
    code: "QT2506-0004",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    salesRep: "SALE002 - Somchai Srisuk",
    quoteDate: "18/06/2569",
    validUntil: "25/06/2569",
    status: "Rejected",
    approvalStatus: "Approved",
    revision: 1,
    currency: "THB",
    payTerm: "เครดิต 15 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "",
    rejectReason: "ราคาสูงเกินไป",
    note: "ลูกค้าแจ้งว่าราคาสูงกว่าคู่แข่ง",
    items: [
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 36, price: 110, disc: 0, tax: 7, note: "" },
    ],
    soRef: "",
    srRef: "",
    history: [
      { t: "Rejected by customer", d: "เหตุผล: ราคาสูงเกินไป", u: "Somchai S.", when: "24/06/2569 11:20", kind: "warn" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคา", u: "Somchai S.", when: "18/06/2569 10:00", kind: "info" },
      { t: "Approved", d: "อนุมัติภายในโดย สมชาย ใจดี", u: "สมชาย ใจดี", when: "18/06/2569 09:55", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "18/06/2569 09:40", kind: "info" },
      { t: "Created", d: "สร้างใบเสนอราคา", u: "Somchai S.", when: "18/06/2569 09:30", kind: "" },
    ],
    created: "18/06/2569 09:30",
    createdBy: "Somchai S.",
    updated: "24/06/2569 11:20",
    updatedBy: "Somchai S.",
  },
  {
    code: "QT2507-0005",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    salesRep: "SALE004 - Supavita Yothapun",
    quoteDate: "02/07/2569",
    validUntil: "09/07/2569",
    status: "Sent",
    approvalStatus: "Approved",
    revision: 1,
    currency: "THB",
    payTerm: "เงินสด",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "",
    rejectReason: "",
    note: "เสนอราคาชุดวัสดุอุดฟันสำหรับคลินิกสาขาใหม่ รอลูกค้าตอบกลับ",
    items: [
      { code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 48, price: 95, disc: 3, tax: 7, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 24, price: 110, disc: 3, tax: 7, note: "" },
    ],
    soRef: "",
    srRef: "",
    history: [
      { t: "Sent to customer", d: "ส่งใบเสนอราคาให้คลินิก", u: "Supavita Y.", when: "02/07/2569 10:30", kind: "info" },
      { t: "Approved", d: "อนุมัติภายในโดย สมชาย ใจดี", u: "สมชาย ใจดี", when: "02/07/2569 10:20", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Supavita Y.", when: "02/07/2569 10:00", kind: "info" },
      { t: "Created", d: "สร้างใบเสนอราคา", u: "Supavita Y.", when: "02/07/2569 09:50", kind: "" },
    ],
    created: "02/07/2569 09:50",
    createdBy: "Supavita Y.",
    updated: "02/07/2569 10:30",
    updatedBy: "Supavita Y.",
  },
  {
    code: "QT2507-0006",
    customer: "บริษัท เดนทัล สมายล์ จำกัด (สาขา 2)",
    customerCode: "BP000089",
    salesRep: "SALE001 - Patcharin Thiengkaew",
    quoteDate: "03/07/2569",
    validUntil: "02/08/2569",
    status: "Draft",
    approvalStatus: "Not Submitted",
    revision: 1,
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-CLINIC-2026 Clinic",
    channel: "Direct",
    customerRef: "",
    rejectReason: "",
    note: "ร่างใบเสนอราคาสาขา 2 รอยืนยันจำนวนจากลูกค้า",
    items: [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 60, price: 120, disc: 5, tax: 7, note: "" },
    ],
    soRef: "",
    srRef: "",
    history: [
      { t: "Created", d: "สร้างร่างใบเสนอราคา", u: "Patcharin T.", when: "03/07/2569 14:15", kind: "" },
    ],
    created: "03/07/2569 14:15",
    createdBy: "Patcharin T.",
    updated: "03/07/2569 14:15",
    updatedBy: "Patcharin T.",
  },
  {
    /* The direct route, and the only quotation in the set that took it: this
       one became SO2506-0005 without a Sales Request in between. The three
       older Converted quotes still point at their Sales Requests, so both
       paths have a worked example. Lines, customer and dates match that order
       exactly — the pair is meant to be read together. */
    code: "QT2507-0007",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    salesRep: "SALE002 - Somchai Srisuk",
    quoteDate: "01/07/2569",
    validUntil: "31/07/2569",
    status: "Converted",
    approvalStatus: "Approved",
    revision: 1,
    currency: "THB",
    payTerm: "เครดิต 15 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "KWN-0088",
    rejectReason: "",
    note: "ลูกค้ากลับมาสั่งใหม่หลังต่อรองราคารอบก่อนไม่สำเร็จ",
    items: [
      { code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 48, price: 120, disc: 3, tax: 7, note: "" },
      { code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 36, price: 110, disc: 3, tax: 7, note: "" },
    ],
    soRef: "SO2506-0005",
    srRef: "",
    history: [
      { t: "Converted to Sales Order", d: "สร้าง SO2506-0005 จากใบเสนอราคานี้", u: "Somchai S.", when: "01/07/2569 09:05", kind: "primary" },
      { t: "Accepted by customer", d: "ลูกค้ายืนยันราคาทางโทรศัพท์", u: "Somchai S.", when: "01/07/2569 08:55", kind: "primary" },
      { t: "Sent to customer", d: "ส่งใบเสนอราคาให้ลูกค้า", u: "Somchai S.", when: "01/07/2569 08:40", kind: "info" },
      { t: "Approved", d: "อนุมัติภายในโดย สมชาย ใจดี", u: "สมชาย ใจดี", when: "01/07/2569 08:35", kind: "primary" },
      { t: "Submitted for approval", d: "ส่งขออนุมัติภายใน", u: "Somchai S.", when: "01/07/2569 08:20", kind: "info" },
      { t: "Created", d: "สร้างใบเสนอราคา", u: "Somchai S.", when: "01/07/2569 08:10", kind: "" },
    ],
    created: "01/07/2569 08:10",
    createdBy: "Somchai S.",
    updated: "01/07/2569 09:05",
    updatedBy: "Somchai S.",
  },
];
