import type { BadgeTone } from "@/lib/types";

/* ============================================================
   OUTBOUND PRINT — the contract.

   One engine prints eighteen document types. It manages that by
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
  /* Buy side. Internal paperwork: no customer, and the sheet exists to be
     filed as the evidence that a spend was approved. */
  | "purchase-request"
  | "goods-receipt"
  | "quotation"
  | "quotation-non-vat"
  | "sales-request"
  | "sales-order"
  | "sales-order-non-vat"
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
  /**
   * Which document family the printed sheet belongs to, stamped onto
   * `.a4-root` so print.css can give it the same accent the screen has.
   *
   * Omitted means the sell side, which keeps the brand colour — every sheet
   * that existed before families did carries no value and is unaffected.
   */
  family?: "inbound";

  showPrice: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showTotals: boolean;
  showPayment: boolean;
  showLot: boolean;
  showSerial: boolean;
  showWarehouse: boolean;
  showLocation: boolean;
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
  /**
   * Which records this form is for, when it is not all of them.
   *
   * A Delivery Order may legitimately be printed with price, without price or
   * as a tax invoice — the user picks. VAT versus Non VAT is not a choice: the
   * document already says which it is, and offering the wrong form invites
   * someone to hand a customer a sheet that contradicts their own order.
   *
   * Omitted on every form that applies to its whole entity, which is most of
   * them, so nothing changes for them.
   */
  appliesTo?: (record: { billType?: string }) => boolean;
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
  | "reference"
  | "revision"
  | "approvedBy"
  | "approvedAt";

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
  /**
   * Present only once the document has actually cleared approval. The
   * signature block reads this: no approval, no signature image, whatever the
   * status field happens to say.
   */
  approval?: { by: string; at: string };
  /**
   * Who wrote the document, for the Prepared By panel.
   *
   * Printed beside the approver's on a document that cleared approval: a
   * sheet the customer holds should name both people, and the preparer is
   * not "whoever pressed print" — which is what the page footer says.
   */
  preparedBy?: { by: string; at: string };
  /**
   * Set when the sheet shows a stored earlier issue rather than the live
   * document, so the page can say so on its face. Absent on the current one.
   */
  supersededRevision?: { revision: number; closedAt: string; closedReason: string };
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
  /**
   * Diagonal stamp across every sheet. A reprint sets it automatically; an
   * unissued document sets it to DRAFT, so a preview can never be mistaken
   * for the real thing once it is on paper.
   */
  watermark?: string;
}

export interface PrintIssue {
  field: string;
  message: string;
  blocking: boolean;
}
