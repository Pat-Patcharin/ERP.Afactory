import type { BadgeTone } from "@/lib/types";

/* ============================================================
   OUTBOUND PRINT — the contract.

   One engine prints sixteen document types. It manages that by
   never knowing what a Sales Invoice is: every source document
   is mapped into the neutral `PrintDoc` below, and a `PrintConfig`
   says which parts of it to show.

   Adding a document type is a config entry plus a mapper case —
   never a new template.
   ============================================================ */

/** Every column the item table can render. A config picks a subset. */
export type ItemColumn =
  | "no"
  | "code"
  | "description"
  | "warehouse"
  | "location"
  | "bin"
  | "lot"
  | "serial"
  | "package"
  | "qty"
  | "requiredQty"
  | "pickedQty"
  | "weight"
  | "uom"
  | "unitPrice"
  | "discount"
  | "netPrice"
  | "vat"
  | "amount";

export type SignatureRole =
  | "receivedBy"
  | "deliveredBy"
  | "authorizedBy"
  | "collectedBy"
  | "preparedBy"
  | "checkedBy"
  | "approvedBy"
  | "salesRep"
  | "customer";

export type CopyType =
  | "ORIGINAL"
  | "CUSTOMER"
  | "COMPANY"
  | "ACCOUNTING"
  | "WAREHOUSE"
  | "DELIVERY"
  | "REPRINT";

/** Document types the engine prints. Keyed by the registry entity where one exists. */
export type PrintDocType =
  | "quotation"
  | "sales-request"
  | "sales-order"
  | "picking"
  | "packing"
  | "delivery-order"
  | "delivery-order-price"
  | "delivery-tax-invoice"
  | "sales-invoice"
  | "tax-invoice"
  | "invoice-tax-invoice"
  | "receipt"
  | "receipt-tax-invoice"
  | "shipment"
  | "sales-return"
  | "credit-note";

export interface PrintConfig {
  documentType: PrintDocType;
  /** Registry entity this document is built from. */
  entity: string;
  titleTH: string;
  titleEN: string;

  showPrice: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showTotals: boolean;
  showPayment: boolean;
  showLot: boolean;
  showSerial: boolean;
  showWarehouse: boolean;
  showLocation: boolean;
  showPackage: boolean;
  showBarcode: boolean;
  showQRCode: boolean;
  showDueDate: boolean;
  showCustomerTaxId: boolean;
  showAmountInWords: boolean;
  showSignatures: boolean;
  showShipTo: boolean;

  itemColumns: ItemColumn[];

  /** Row units, not items — a two-line item costs two. */
  firstPageRows: number;
  continuationPageRows: number;
  lastPageRows: number;

  /** Numbered remarks printed under the item table. */
  remarks: string[];
  signatureRoles: SignatureRole[];
  supportedCopyTypes: CopyType[];
  /** Operational documents put the signature block on page 1. */
  signaturesOnFirstPage?: boolean;
  /** Metadata rows this document shows, in order. */
  metaFields: MetaField[];
}

export type MetaField =
  | "docNo"
  | "docDate"
  | "customerCode"
  | "customerPo"
  | "quotationNo"
  | "salesOrderNo"
  | "requestNo"
  | "deliveryOrderNo"
  | "invoiceNo"
  | "shipmentNo"
  | "sourceInvoiceNo"
  | "salesRep"
  | "payTerm"
  | "dueDate"
  | "currency"
  | "warehouse"
  | "deliveryDate"
  | "trackingNo"
  | "reference";

/* ---------- The neutral document ---------- */

export interface PrintParty {
  name: string;
  code: string;
  address: string;
  taxId: string;
  branch: string;
  phone: string;
  contact: string;
  /** Ship-to only. */
  instruction?: string;
}

export interface PrintLine {
  no: number;
  code: string;
  description: string;
  /** Extra lines under the description. Each costs one more row unit. */
  extraLines: string[];
  warehouse: string;
  location: string;
  bin: string;
  lot: string;
  serial: string;
  packageNo: string;
  qty: number;
  requiredQty: number;
  pickedQty: number;
  weight: number;
  uom: string;
  /** null when the acting role or copy type may not see money. */
  unitPrice: number | null;
  discount: number | null;
  netPrice: number | null;
  vatRate: number | null;
  amount: number | null;
  /** Credit notes carry a reason per line. */
  reason?: string;
}

export interface PrintTotals {
  subtotal: number;
  lineDiscount: number;
  headerDiscount: number;
  freight: number;
  otherCharges: number;
  netAmount: number;
  vat: number;
  withholding: number;
  rounding: number;
  grandTotal: number;
  currency: string;
  /** Rendered from grandTotal at map time. */
  amountInWords: string;
}

export interface PrintCompany {
  logo: string;
  /** Official logo file under /public. Empty = the built-in vector mark. */
  logoUrl: string;
  nameTH: string;
  nameEN: string;
  address: string;
  branch: string;
  branchNo: string;
  taxId: string;
  phone: string;
  email: string;
  website: string;
  line: string;
  facebook: string;
  tagline: string;
}

export interface PrintBank {
  bank: string;
  branch: string;
  accountNo: string;
  accountName: string;
  method: string;
  reference: string;
}

export interface PrintDoc {
  entity: string;
  code: string;
  status: string;
  statusTone: BadgeTone;
  date: string;
  company: PrintCompany;
  billTo: PrintParty;
  shipTo: PrintParty;
  meta: { field: MetaField; label: string; labelTH: string; value: string }[];
  lines: PrintLine[];
  totals: PrintTotals | null;
  bank: PrintBank | null;
  /** Remarks from the config plus anything the source document carries. */
  remarks: string[];
}

/* ---------- Pagination result ---------- */

export interface PrintPage {
  /** 1-based. */
  page: number;
  lines: PrintLine[];
  /** Row units consumed, so the renderer can pad to a constant height. */
  used: number;
  capacity: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface PrintJob {
  config: PrintConfig;
  doc: PrintDoc;
  copyType: CopyType;
  copyLabelEN: string;
  copyLabelTH: string;
  copyAudience: string;
  /** Reprint sequence; 0 on the first print. */
  reprintOf: number;
  printedBy: string;
  printedAt: string;
  pages: PrintPage[];
  totalPages: number;
  /** Blocking problems found before printing. Non-empty means do not print. */
  issues: PrintIssue[];
}

export interface PrintIssue {
  field: string;
  message: string;
  blocking: boolean;
}
