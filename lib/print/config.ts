import type { CopyType, PrintConfig, PrintDocType } from "./types";

/* ============================================================
   DOCUMENT CONFIGURATION

   Eighteen documents, one engine. Everything that differs between
   a Picking List and a Tax Invoice is declared here — which
   columns exist, whether money is shown at all, how many row
   units fit on each page, who signs.

   Row counts are per DOCUMENT because the space below the table
   differs: a Picking List has no totals block, so it fits more
   rows on its final page than an Invoice does.
   ============================================================ */

/** Defaults every document starts from; each then overrides what differs. */
const BASE: Omit<PrintConfig, "documentType" | "entity" | "titleTH" | "titleEN"> = {
  showPrice: true,
  showDiscount: true,
  showTax: true,
  showTotals: true,
  showPayment: true,
  showLot: false,
  showSerial: false,
  showWarehouse: false,
  showLocation: false,
  showPackage: false,
  showBarcode: true,
  showQRCode: true,
  showDueDate: true,
  showCustomerTaxId: true,
  showAmountInWords: true,
  showSignatures: true,
  showShipTo: true,
  itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "discount", "netPrice", "amount"],
  /* Row units, chosen so a page still fits when a third of the item names
     wrap onto a second printed line — the planner counts one unit per item,
     and a capacity tuned to the best case overflows in the real one. */
  firstPageRows: 14,
  continuationPageRows: 20,
  lastPageRows: 13,
  remarks: [],
  signatureRoles: ["preparedBy", "checkedBy", "authorizedBy", "customer"],
  supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "COMPANY", "ACCOUNTING", "REPRINT"],
  metaFields: ["docNo", "docDate", "customerCode", "salesRep", "payTerm", "currency"],
};

/** Operational documents: no money anywhere, warehouse detail instead. */
const OPERATIONAL = {
  showPrice: false,
  showDiscount: false,
  showTax: false,
  showTotals: false,
  showPayment: false,
  showAmountInWords: false,
  showCustomerTaxId: false,
  showDueDate: false,
} as const;

const DELIVERY_REMARKS = [
  "สินค้ารับประกัน 6 เดือน นับจากวันที่ส่งมอบสินค้า",
  "กรุณาตรวจสอบสินค้าก่อนรับมอบ หากมีปัญหา กรุณาแจ้งภายใน 7 วัน",
  "ใบส่งนี้ใช้แทนใบกำกับภาษี จะจัดส่งให้หลังจากได้รับชำระเงินเรียบร้อยแล้ว",
];

const TAX_REMARKS = [
  "กรุณาชำระเงินภายในวันที่ครบกำหนด",
  "การชำระเงินโดยเช็ค กรุณาสั่งจ่ายในนามบริษัทตามที่ระบุด้านล่าง",
  "เอกสารฉบับนี้เป็นใบกำกับภาษีตามประมวลรัษฎากร",
];

export const PRINT_CONFIGS: Record<PrintDocType, PrintConfig> = {
  /* ---------- Buy side ---------- */

  /**
   * The purchase request, printed to be signed and filed.
   *
   * Everything that assumes a customer is off. There is no CUSTOMER copy
   * because there is no customer on this side of the business — the three
   * copies are the one that gets signed, the one the department keeps, and a
   * reprint. No tax and no due date either: what the company will actually be
   * charged is settled on the purchase order against the supplier's terms.
   *
   * The QR and barcode go for the same reason they are off on screen: this
   * sheet never leaves the company, so a verify mark would verify nothing.
   * Signatures stay, because they are the entire purpose of printing it.
   */
  "purchase-request": {
    ...BASE,
    documentType: "purchase-request",
    entity: "purchase-request",
    titleTH: "ใบขอซื้อ",
    titleEN: "PURCHASE REQUEST",
    family: "inbound",
    showTax: false,
    showPayment: false,
    showDueDate: false,
    showCustomerTaxId: false,
    showAmountInWords: false,
    showShipTo: false,
    showBarcode: false,
    showQRCode: false,
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "amount"],
    signatureRoles: ["preparedBy", "checkedBy", "approvedBy"],
    supportedCopyTypes: ["ORIGINAL", "COMPANY", "REPRINT"],
    metaFields: ["docNo", "docDate", "deliveryDate", "warehouse", "currency"],
    remarks: [
      "ใบขอซื้อนี้เป็นเอกสารภายใน ใช้ประกอบการอนุมัติการจัดซื้อเท่านั้น",
      "ราคาที่ระบุเป็นราคาประมาณการ ราคาจริงยืนยันในใบสั่งซื้อ",
    ],
  },

  /* ---------- Sell-side offers ---------- */
  quotation: {
    ...BASE,
    documentType: "quotation",
    entity: "quotation",
    titleTH: "ใบเสนอราคา",
    titleEN: "QUOTATION",
    showPayment: false,
    showDueDate: false,
    /* Revision and approver sit on the sheet itself: a customer holding two
       issues of the same quotation number must be able to tell them apart,
       and "who signed this" must be answerable from the paper. */
    metaFields: [
      "docNo",
      "revision",
      "docDate",
      "customerCode",
      "salesRep",
      "payTerm",
      "currency",
      "reference",
      "approvedBy",
      "approvedAt",
    ],
    remarks: [
      "ราคานี้ยืนราคาตามวันที่ระบุในเอกสาร",
      "ราคาดังกล่าวยังไม่รวมค่าขนส่ง เว้นแต่ระบุไว้เป็นอย่างอื่น",
    ],
    signatureRoles: ["preparedBy", "approvedBy", "customer"],
    supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "COMPANY", "REPRINT"],
    appliesTo: (r) => r.billType !== "Non VAT",
  },

  /**
   * The same quotation for a customer who is not VAT registered.
   *
   * Every line is already at 0% — `billType` enforces that where the document
   * is written — so a VAT row would print "0.00" and invite the question of
   * why. It is dropped instead, and the header says plainly what kind of sheet
   * this is so nobody files it as a tax document.
   */
  "quotation-non-vat": {
    ...BASE,
    documentType: "quotation-non-vat",
    entity: "quotation",
    titleTH: "ใบเสนอราคา (ไม่มีภาษีมูลค่าเพิ่ม)",
    titleEN: "QUOTATION — NON VAT",
    showTax: false,
    showPayment: false,
    showDueDate: false,
    metaFields: [
      "docNo",
      "revision",
      "docDate",
      "customerCode",
      "salesRep",
      "payTerm",
      "currency",
      "reference",
      "approvedBy",
      "approvedAt",
    ],
    remarks: [
      "ราคานี้ยืนราคาตามวันที่ระบุในเอกสาร",
      "ราคาดังกล่าวยังไม่รวมค่าขนส่ง เว้นแต่ระบุไว้เป็นอย่างอื่น",
      "เอกสารฉบับนี้ไม่ใช่ใบกำกับภาษี และราคาไม่รวมภาษีมูลค่าเพิ่ม",
    ],
    signatureRoles: ["preparedBy", "approvedBy", "customer"],
    /* Deliberately the same four as the VAT quotation, not BASE's five. Being
       Non VAT is no reason for a quotation to have MORE copies than a VAT one.
       Whether a quotation should carry an ACCOUNTING copy at all is a separate
       question about the VAT form — see the backlog. */
    supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "COMPANY", "REPRINT"],
    appliesTo: (r) => r.billType === "Non VAT",
  },

  "sales-request": {
    ...BASE,
    documentType: "sales-request",
    entity: "sales-request",
    titleTH: "ใบขอขาย",
    titleEN: "SALES REQUEST",
    showPayment: false,
    showDueDate: false,
    showAmountInWords: false,
    metaFields: ["docNo", "docDate", "customerCode", "salesRep", "quotationNo", "currency"],
    signatureRoles: ["preparedBy", "approvedBy"],
    supportedCopyTypes: ["ORIGINAL", "COMPANY", "REPRINT"],
  },

  "sales-order": {
    ...BASE,
    documentType: "sales-order",
    entity: "sales-order",
    titleTH: "ใบสั่งขาย",
    titleEN: "SALES ORDER",
    metaFields: [
      "docNo", "docDate", "customerCode", "customerPo", "requestNo",
      "salesRep", "payTerm", "deliveryDate", "warehouse", "currency",
    ],
    signatureRoles: ["preparedBy", "approvedBy", "customer"],
    appliesTo: (r) => r.billType !== "Non VAT",
  },

  /** The same order for a customer who is not VAT registered. */
  "sales-order-non-vat": {
    ...BASE,
    documentType: "sales-order-non-vat",
    entity: "sales-order",
    titleTH: "ใบสั่งขาย (ไม่มีภาษีมูลค่าเพิ่ม)",
    titleEN: "SALES ORDER — NON VAT",
    showTax: false,
    metaFields: [
      "docNo", "docDate", "customerCode", "customerPo", "requestNo",
      "salesRep", "payTerm", "deliveryDate", "warehouse", "currency",
    ],
    remarks: ["เอกสารฉบับนี้ไม่ใช่ใบกำกับภาษี และราคาไม่รวมภาษีมูลค่าเพิ่ม"],
    signatureRoles: ["preparedBy", "approvedBy", "customer"],
    appliesTo: (r) => r.billType === "Non VAT",
  },

  /* ---------- Warehouse operations ---------- */
  picking: {
    ...BASE,
    ...OPERATIONAL,
    documentType: "picking",
    entity: "picking",
    titleTH: "ใบจัดสินค้า",
    titleEN: "PICKING LIST",
    showLot: true,
    showSerial: true,
    showWarehouse: true,
    showLocation: true,
    showShipTo: false,
    itemColumns: ["no", "code", "description", "warehouse", "bin", "lot", "serial", "requiredQty", "pickedQty", "uom"],
    /* No totals block, so more rows fit on the final page. */
    firstPageRows: 17,
    continuationPageRows: 22,
    lastPageRows: 18,
    metaFields: ["docNo", "docDate", "customerCode", "salesOrderNo", "warehouse"],
    remarks: ["กรุณาตรวจสอบ Lot และ Serial ให้ตรงกับที่ระบุก่อนจัดของ"],
    signatureRoles: ["preparedBy", "checkedBy"],
    supportedCopyTypes: ["ORIGINAL", "WAREHOUSE", "REPRINT"],
  },

  packing: {
    ...BASE,
    ...OPERATIONAL,
    documentType: "packing",
    entity: "packing",
    titleTH: "ใบบรรจุหีบห่อ",
    titleEN: "PACKING LIST",
    showLot: true,
    showSerial: true,
    showPackage: true,
    itemColumns: ["no", "code", "description", "lot", "serial", "qty", "uom", "package", "weight"],
    firstPageRows: 17,
    continuationPageRows: 22,
    lastPageRows: 18,
    metaFields: ["docNo", "docDate", "customerCode", "salesOrderNo", "warehouse"],
    remarks: ["กรุณาตรวจนับจำนวนหีบห่อให้ครบก่อนรับมอบ"],
    signatureRoles: ["preparedBy", "checkedBy", "receivedBy"],
    supportedCopyTypes: ["ORIGINAL", "WAREHOUSE", "DELIVERY", "REPRINT"],
  },

  /* ---------- Delivery ---------- */
  "delivery-order": {
    ...BASE,
    ...OPERATIONAL,
    documentType: "delivery-order",
    entity: "delivery-order",
    titleTH: "ใบส่งสินค้า",
    titleEN: "DELIVERY ORDER",
    showLot: true,
    showSerial: true,
    itemColumns: ["no", "code", "description", "lot", "serial", "qty", "uom"],
    firstPageRows: 16,
    continuationPageRows: 22,
    lastPageRows: 16,
    metaFields: ["docNo", "docDate", "customerCode", "salesOrderNo", "salesRep", "deliveryDate", "trackingNo"],
    remarks: DELIVERY_REMARKS,
    signatureRoles: ["receivedBy", "deliveredBy", "authorizedBy", "collectedBy"],
    supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "COMPANY", "WAREHOUSE", "DELIVERY", "REPRINT"],
    /* The driver needs a signature at handover, whatever page it lands on. */
    signaturesOnFirstPage: false,
  },

  "delivery-order-price": {
    ...BASE,
    documentType: "delivery-order-price",
    entity: "delivery-order",
    titleTH: "ใบส่งสินค้า (แสดงราคา)",
    titleEN: "DELIVERY ORDER",
    showLot: true,
    showSerial: true,
    itemColumns: ["no", "code", "description", "lot", "serial", "qty", "uom", "unitPrice", "discount", "netPrice", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "salesOrderNo", "salesRep", "payTerm", "dueDate", "currency"],
    remarks: DELIVERY_REMARKS,
    signatureRoles: ["receivedBy", "deliveredBy", "authorizedBy", "collectedBy"],
    supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "COMPANY", "ACCOUNTING", "REPRINT"],
  },

  "delivery-tax-invoice": {
    ...BASE,
    documentType: "delivery-tax-invoice",
    entity: "delivery-order",
    titleTH: "ใบส่งสินค้า / ใบกำกับภาษี",
    titleEN: "DELIVERY ORDER / TAX INVOICE",
    showLot: true,
    showSerial: true,
    itemColumns: ["no", "code", "description", "lot", "serial", "qty", "uom", "unitPrice", "discount", "netPrice", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "customerPo", "salesOrderNo", "salesRep", "payTerm", "dueDate", "currency"],
    remarks: [...DELIVERY_REMARKS, ...TAX_REMARKS],
    signatureRoles: ["receivedBy", "deliveredBy", "authorizedBy", "collectedBy"],
  },

  /* ---------- Billing ---------- */
  "sales-invoice": {
    ...BASE,
    documentType: "sales-invoice",
    entity: "sales-invoice",
    titleTH: "ใบแจ้งหนี้",
    titleEN: "SALES INVOICE",
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "discount", "netPrice", "vat", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "customerPo", "salesOrderNo", "salesRep", "payTerm", "dueDate", "currency"],
    remarks: TAX_REMARKS,
  },

  "tax-invoice": {
    ...BASE,
    documentType: "tax-invoice",
    entity: "sales-invoice",
    titleTH: "ใบกำกับภาษี",
    titleEN: "TAX INVOICE",
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "discount", "netPrice", "vat", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "customerPo", "salesOrderNo", "payTerm", "dueDate", "currency"],
    remarks: TAX_REMARKS,
  },

  "invoice-tax-invoice": {
    ...BASE,
    documentType: "invoice-tax-invoice",
    entity: "sales-invoice",
    titleTH: "ใบแจ้งหนี้ / ใบกำกับภาษี",
    titleEN: "INVOICE / TAX INVOICE",
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "discount", "netPrice", "vat", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "customerPo", "salesOrderNo", "salesRep", "payTerm", "dueDate", "currency"],
    remarks: TAX_REMARKS,
  },

  receipt: {
    ...BASE,
    documentType: "receipt",
    entity: "sales-invoice",
    titleTH: "ใบเสร็จรับเงิน",
    titleEN: "RECEIPT",
    showDiscount: false,
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "invoiceNo", "payTerm", "currency", "reference"],
    remarks: ["ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์เมื่อเรียกเก็บเงินตามเช็คได้เรียบร้อยแล้ว"],
    signatureRoles: ["collectedBy", "authorizedBy", "customer"],
  },

  "receipt-tax-invoice": {
    ...BASE,
    documentType: "receipt-tax-invoice",
    entity: "sales-invoice",
    titleTH: "ใบเสร็จรับเงิน / ใบกำกับภาษี",
    titleEN: "RECEIPT / TAX INVOICE",
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "discount", "netPrice", "vat", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "invoiceNo", "payTerm", "currency", "reference"],
    remarks: [...TAX_REMARKS, "ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์เมื่อเรียกเก็บเงินตามเช็คได้เรียบร้อยแล้ว"],
    signatureRoles: ["collectedBy", "authorizedBy", "customer"],
  },

  /* ---------- Logistics and reversals ---------- */
  shipment: {
    ...BASE,
    ...OPERATIONAL,
    documentType: "shipment",
    entity: "shipment",
    titleTH: "ใบจัดส่งสินค้า",
    titleEN: "SHIPMENT DOCUMENT",
    showLot: true,
    showSerial: true,
    showPackage: true,
    showWarehouse: true,
    itemColumns: ["no", "code", "description", "warehouse", "lot", "serial", "package", "qty", "uom"],
    firstPageRows: 17,
    continuationPageRows: 22,
    lastPageRows: 18,
    metaFields: ["docNo", "docDate", "customerCode", "deliveryOrderNo", "salesRep", "warehouse", "trackingNo", "deliveryDate"],
    remarks: ["กรุณาตรวจสอบสภาพหีบห่อก่อนลงนามรับสินค้า"],
    signatureRoles: ["receivedBy", "deliveredBy", "authorizedBy"],
    supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "WAREHOUSE", "DELIVERY", "REPRINT"],
  },

  "sales-return": {
    ...BASE,
    documentType: "sales-return",
    entity: "sales-return",
    titleTH: "ใบรับคืนสินค้า",
    titleEN: "SALES RETURN",
    showPayment: false,
    showDueDate: false,
    showLot: true,
    showSerial: true,
    itemColumns: ["no", "code", "description", "lot", "serial", "qty", "uom", "unitPrice", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "invoiceNo", "salesOrderNo", "warehouse", "reference"],
    remarks: ["สินค้าที่รับคืนต้องอยู่ในสภาพสมบูรณ์และอยู่ในบรรจุภัณฑ์เดิม"],
    signatureRoles: ["receivedBy", "checkedBy", "authorizedBy", "customer"],
    supportedCopyTypes: ["ORIGINAL", "CUSTOMER", "COMPANY", "WAREHOUSE", "ACCOUNTING", "REPRINT"],
  },

  "credit-note": {
    ...BASE,
    documentType: "credit-note",
    entity: "credit-note",
    titleTH: "ใบลดหนี้",
    titleEN: "CREDIT NOTE",
    showPayment: false,
    showDueDate: false,
    itemColumns: ["no", "code", "description", "qty", "uom", "unitPrice", "discount", "vat", "amount"],
    metaFields: ["docNo", "docDate", "customerCode", "sourceInvoiceNo", "salesOrderNo", "currency", "reference"],
    remarks: [
      "ใบลดหนี้ฉบับนี้ออกเพื่อปรับปรุงมูลค่าตามใบกำกับภาษีที่อ้างถึง",
      "กรุณาเก็บเอกสารฉบับนี้ไว้เป็นหลักฐานทางภาษี",
    ],
    signatureRoles: ["preparedBy", "approvedBy", "customer"],
  },
};

export const PRINT_DOC_TYPES = Object.keys(PRINT_CONFIGS) as PrintDocType[];

export const getPrintConfig = (t: PrintDocType): PrintConfig | null => PRINT_CONFIGS[t] ?? null;

/** Every document type an entity can be printed as, in menu order. */
/**
 * The forms that can print a given entity.
 *
 * Pass the record too and forms that declare `appliesTo` are filtered to the
 * ones that suit it — which is how a Non VAT order is never offered the VAT
 * sheet. Called without a record the answer is every form for the entity, as
 * it always was.
 */
export function printTypesFor(entity: string, record?: { billType?: string }): PrintDocType[] {
  return PRINT_DOC_TYPES.filter((t) => {
    const config = PRINT_CONFIGS[t];
    if (config.entity !== entity) return false;
    if (!record || !config.appliesTo) return true;
    return config.appliesTo(record);
  });
}

/* ---------- Copy types ---------- */

export interface CopyDef {
  code: CopyType;
  labelEN: string;
  labelTH: string;
  audience: string;
  /** Money is stripped from the DATA for these — never hidden with CSS. */
  hidePrice?: boolean;
  hideTax?: boolean;
  hideSignatures?: boolean;
  /** Warehouse detail forced on regardless of the document config. */
  forceWarehouseDetail?: boolean;
  watermark?: string;
}

export const COPY_TYPES: Record<CopyType, CopyDef> = {
  ORIGINAL: { code: "ORIGINAL", labelEN: "ORIGINAL", labelTH: "ต้นฉบับ", audience: "สำหรับลูกค้า" },
  CUSTOMER: { code: "CUSTOMER", labelEN: "CUSTOMER COPY", labelTH: "สำเนา", audience: "สำหรับลูกค้า" },
  COMPANY: { code: "COMPANY", labelEN: "COMPANY COPY", labelTH: "สำเนา", audience: "สำหรับบริษัท" },
  ACCOUNTING: { code: "ACCOUNTING", labelEN: "ACCOUNTING COPY", labelTH: "สำเนา", audience: "สำหรับบัญชี" },
  WAREHOUSE: {
    code: "WAREHOUSE",
    labelEN: "WAREHOUSE COPY",
    labelTH: "สำเนา",
    audience: "สำหรับคลังสินค้า",
    /* The warehouse packs goods; it has no business with the selling price. */
    hidePrice: true,
    hideTax: true,
    forceWarehouseDetail: true,
  },
  DELIVERY: {
    code: "DELIVERY",
    labelEN: "DELIVERY COPY",
    labelTH: "สำเนา",
    audience: "สำหรับผู้จัดส่ง",
    hidePrice: true,
    hideTax: true,
  },
  REPRINT: {
    code: "REPRINT",
    labelEN: "REPRINT",
    labelTH: "พิมพ์ซ้ำ",
    audience: "เอกสารพิมพ์ซ้ำ",
    watermark: "REPRINT",
  },
};

export const getCopyDef = (c: CopyType): CopyDef => COPY_TYPES[c] ?? COPY_TYPES.ORIGINAL;

/* ---------- Signature and metadata labels ---------- */

export const SIGNATURE_LABELS: Record<string, { en: string; th: string }> = {
  receivedBy: { en: "RECEIVED BY", th: "ผู้รับสินค้า" },
  deliveredBy: { en: "DELIVERED BY", th: "ผู้ส่งสินค้า" },
  authorizedBy: { en: "AUTHORIZED BY", th: "ผู้อนุมัติ" },
  collectedBy: { en: "COLLECTED BY", th: "ผู้เก็บเงิน" },
  preparedBy: { en: "PREPARED BY", th: "ผู้จัดทำ" },
  checkedBy: { en: "CHECKED BY", th: "ผู้ตรวจสอบ" },
  approvedBy: { en: "APPROVED BY", th: "ผู้อนุมัติ" },
  salesRep: { en: "SALES REPRESENTATIVE", th: "พนักงานขาย" },
  customer: { en: "CUSTOMER / RECEIVER", th: "ลูกค้า / ผู้รับ" },
};

export const COLUMN_LABELS: Record<string, { en: string; th: string; align?: "right" | "center" }> = {
  no: { en: "No.", th: "ลำดับ", align: "center" },
  code: { en: "Item Code", th: "รหัสสินค้า" },
  description: { en: "Description", th: "รายละเอียด" },
  warehouse: { en: "Warehouse", th: "คลัง" },
  location: { en: "Location", th: "ตำแหน่ง" },
  bin: { en: "Bin", th: "บิน" },
  lot: { en: "Lot No.", th: "เลขที่ล็อต" },
  serial: { en: "Serial No.", th: "หมายเลขเครื่อง" },
  package: { en: "Package", th: "หีบห่อ" },
  qty: { en: "Quantity", th: "จำนวน", align: "right" },
  requiredQty: { en: "Required", th: "ต้องจัด", align: "right" },
  pickedQty: { en: "Picked", th: "จัดแล้ว", align: "right" },
  weight: { en: "Weight", th: "น้ำหนัก", align: "right" },
  uom: { en: "UOM", th: "หน่วย", align: "center" },
  unitPrice: { en: "Unit Price", th: "ราคาต่อหน่วย", align: "right" },
  discount: { en: "Discount", th: "ส่วนลด", align: "right" },
  netPrice: { en: "Net Price", th: "ราคาสุทธิ", align: "right" },
  vat: { en: "VAT", th: "ภาษี", align: "right" },
  amount: { en: "Amount", th: "จำนวนเงิน", align: "right" },
};

export const META_LABELS: Record<string, { en: string; th: string }> = {
  docNo: { en: "Document No.", th: "เลขที่เอกสาร" },
  revision: { en: "Revision", th: "ฉบับแก้ไขครั้งที่" },
  approvedBy: { en: "Approved By", th: "ผู้อนุมัติ" },
  approvedAt: { en: "Approved At", th: "วันเวลาที่อนุมัติ" },
  docDate: { en: "Document Date", th: "วันที่เอกสาร" },
  customerCode: { en: "Customer Code", th: "รหัสลูกค้า" },
  customerPo: { en: "Customer PO No.", th: "เลขที่ใบสั่งซื้อลูกค้า" },
  quotationNo: { en: "Quotation No.", th: "เลขที่ใบเสนอราคา" },
  salesOrderNo: { en: "Sales Order No.", th: "เลขที่ใบสั่งขาย" },
  requestNo: { en: "Request No.", th: "เลขที่ใบขอขาย" },
  deliveryOrderNo: { en: "Delivery Order No.", th: "เลขที่ใบส่งสินค้า" },
  invoiceNo: { en: "Invoice No.", th: "เลขที่ใบแจ้งหนี้" },
  shipmentNo: { en: "Shipment No.", th: "เลขที่ใบจัดส่ง" },
  sourceInvoiceNo: { en: "Source Invoice", th: "อ้างอิงใบกำกับภาษี" },
  salesRep: { en: "Sales Representative", th: "พนักงานขาย" },
  payTerm: { en: "Payment Term", th: "เงื่อนไขการชำระ" },
  dueDate: { en: "Due Date", th: "ครบกำหนด" },
  currency: { en: "Currency", th: "สกุลเงิน" },
  warehouse: { en: "Warehouse", th: "คลังสินค้า" },
  deliveryDate: { en: "Delivery Date", th: "วันที่ส่งมอบ" },
  trackingNo: { en: "Tracking No.", th: "เลขพัสดุ" },
  reference: { en: "Reference", th: "อ้างอิง" },
};
