import {
  INV_TERM_DAYS,
  SALES_INVOICES as RAW,
  type InvLine,
  type SalesInvoice,
} from "@/data/sales-invoices";
import { SALES_ORDERS, DELIVERY_ORDERS, getCustomer } from "./outbound";
import { BUSINESS_PARTNERS } from "./partner";
import { lineBase } from "./lines";
import { DASH, daysUntil, toDisplayDate, toInputDate } from "@/lib/format";

/* ============================================================
   SALES INVOICE — billing only.

   An invoice records what the customer is charged. It never
   reserves or deducts stock: Picking, Delivery Order and Shipment
   own inventory movement. Posting, payment and credit notes are
   placeholders in Phase 1.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Line maths ---------- */

/** Discount can be a percentage of the line or a flat amount off it. */
export function lineDiscount(it: Partial<InvLine>): number {
  const base = lineBase({ qty: num(it.invoiceQty), price: num(it.unitPrice) });
  if (it.discType === "Percent") return round2(base * (num(it.disc) / 100));
  if (it.discType === "Amount") return Math.min(base, num(it.disc));
  return 0;
}

export const lineGross = (it: Partial<InvLine>) =>
  lineBase({ qty: num(it.invoiceQty), price: num(it.unitPrice) });

/** Amount after discount, before tax is separated out. */
export const lineAmount = (it: Partial<InvLine>) =>
  round2(lineGross(it) - lineDiscount(it));

export const netUnitPrice = (it: Partial<InvLine>) => {
  const qty = num(it.invoiceQty);
  return qty ? round2(lineAmount(it) / qty) : num(it.unitPrice);
};

/**
 * Tax on one line.
 *
 *   Exclusive:  tax = amount × rate / 100
 *   Inclusive:  tax = amount × rate / (100 + rate)   — already inside the price
 */
export function lineTaxAmount(it: Partial<InvLine>, mode: string): number {
  const amount = lineAmount(it);
  const rate = num(it.taxRate);
  if (!rate) return 0;
  return mode === "Tax Inclusive"
    ? round2((amount * rate) / (100 + rate))
    : round2((amount * rate) / 100);
}

/** What the line contributes to the taxable base. */
export const lineTaxable = (it: Partial<InvLine>, mode: string) =>
  mode === "Tax Inclusive" ? round2(lineAmount(it) - lineTaxAmount(it, mode)) : lineAmount(it);

/* ---------- Document totals ---------- */

export interface InvoiceTotals {
  totalQty: number;
  subtotal: number;
  lineDiscount: number;
  headerDiscount: number;
  freight: number;
  otherCharges: number;
  taxable: number;
  tax: number;
  withholding: number;
  rounding: number;
  grandTotal: number;
}

type TotalsInput = {
  items?: Partial<InvLine>[];
  taxMode?: string;
  headerDisc?: number;
  freight?: number;
  otherCharges?: number;
  rounding?: number;
  withholdingTax?: number;
};

/**
 * One pass produces every figure the summary card, the preview and the list
 * column read, so they can never disagree.
 */
export function invoiceTotals(inv: TotalsInput): InvoiceTotals {
  const mode = inv.taxMode ?? "Tax Exclusive";
  const items = inv.items ?? [];

  const totalQty = items.reduce((t, it) => t + num(it.invoiceQty), 0);
  const gross = round2(items.reduce((t, it) => t + lineGross(it), 0));
  const lineDisc = round2(items.reduce((t, it) => t + lineDiscount(it), 0));
  const afterLine = round2(gross - lineDisc);

  /* Header discount is a percentage applied after line discounts. */
  const headerDisc = round2(afterLine * (num(inv.headerDisc) / 100));
  const afterHeader = round2(afterLine - headerDisc);

  /* Charges are taxable in this phase; a real engine would let each carry
     its own tax code. */
  const freight = num(inv.freight);
  const other = num(inv.otherCharges);

  const scale = afterLine ? afterHeader / afterLine : 1;
  const taxFromLines = round2(
    items.reduce((t, it) => t + lineTaxAmount(it, mode) * scale, 0),
  );
  const taxableFromLines = round2(
    items.reduce((t, it) => t + lineTaxable(it, mode) * scale, 0),
  );

  const chargeRate = items.length ? num(items[0].taxRate) : 7;
  const chargeTax =
    mode === "Tax Inclusive"
      ? round2(((freight + other) * chargeRate) / (100 + chargeRate))
      : round2(((freight + other) * chargeRate) / 100);
  const chargeTaxable =
    mode === "Tax Inclusive" ? round2(freight + other - chargeTax) : round2(freight + other);

  const taxable = round2(taxableFromLines + chargeTaxable);
  const tax = round2(taxFromLines + chargeTax);
  const withholding = round2(taxable * (num(inv.withholdingTax) / 100));
  const rounding = num(inv.rounding);

  const grandTotal = round2(taxable + tax + rounding);

  return {
    totalQty,
    subtotal: gross,
    lineDiscount: lineDisc,
    headerDiscount: headerDisc,
    freight,
    otherCharges: other,
    taxable,
    tax,
    withholding,
    rounding,
    grandTotal,
  };
}

/* ---------- Billable quantity ---------- */

/**
 * Remaining Billable Qty
 *   from a Delivery Order or Shipment: delivered − previously invoiced
 *   from a Sales Order (no delivery needed): ordered − previously invoiced
 */
export function remainingBillable(it: Partial<InvLine>, sourceType: string): number {
  const prev = num(it.prevInvoicedQty);
  const basis =
    sourceType === "Sales Order" || sourceType === "Manual"
      ? num(it.orderedQty)
      : num(it.deliveredQty);
  return Math.max(0, basis - prev);
}

export const isOverBilled = (it: Partial<InvLine>, sourceType: string) =>
  num(it.invoiceQty) > remainingBillable(it, sourceType);

/** How much of a source document has already been billed, across all invoices. */
export function invoicedQtyForSource(sourceDoc: string, productCode: string): number {
  return SALES_INVOICES.filter(
    (i) => i.sourceDoc === sourceDoc && !["Cancelled", "Void"].includes(i.status),
  ).reduce(
    (t, i) =>
      t + (i.items ?? []).filter((l) => l.code === productCode).reduce((s, l) => s + num(l.invoiceQty), 0),
    0,
  );
}

/* ---------- Due date & payment ---------- */

export const creditDaysFor = (payTerm: string, fallback = 30) =>
  INV_TERM_DAYS[payTerm] ?? fallback;

/** Due Date = Invoice Date + Credit Days. Works on yyyy-mm-dd form input values. */
export function dueDateFrom(invoiceDateIso: string, creditDays: number): string {
  if (!invoiceDateIso) return "";
  const d = new Date(invoiceDateIso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + (Number(creditDays) || 0));
  return d.toISOString().slice(0, 10);
}

/** Payment status is derived, never typed — paid amount against the total. */
export function derivePaymentStatus(
  grandTotal: number,
  paid: number,
  dueDate: string,
  status: string,
): string {
  if (["Cancelled", "Void"].includes(status)) return "Unpaid";
  if (paid >= grandTotal && grandTotal > 0) return "Paid";

  const days = daysUntil(dueDate);
  const past = days !== null && days < 0;
  const live = ["Issued", "Partially Paid", "Overdue", "Credited"].includes(status);

  if (past && live && paid < grandTotal) return "Overdue";
  if (paid > 0) return "Partially Paid";
  return "Unpaid";
}

/* ---------- Row decoration ---------- */

export interface InvRow extends SalesInvoice {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  subtotal: number;
  discountTotal: number;
  taxable: number;
  taxAmount: number;
  grandTotal: number;
  outstanding: number;
  paidPct: number;
  isOverdue: boolean;
  daysOverdue: number | null;
  /** Anything past Approved can no longer be edited freely. */
  isEditable: boolean;
  isIssuable: boolean;
  canCreditNote: boolean;
  hasPriceOverride: boolean;
}

export const SALES_INVOICES = RAW as InvRow[];

export function decorateInvoices() {
  for (const inv of SALES_INVOICES) {
    const t = invoiceTotals(inv);

    inv.name = inv.code;
    inv.icon = "🧾";
    inv.itemCount = inv.items?.length ?? 0;
    inv.totalQty = t.totalQty;
    inv.subtotal = t.subtotal;
    inv.discountTotal = round2(t.lineDiscount + t.headerDiscount);
    inv.taxable = t.taxable;
    inv.taxAmount = t.tax;
    inv.grandTotal = t.grandTotal;
    inv.outstanding = round2(Math.max(0, t.grandTotal - num(inv.paidAmount)));
    inv.paidPct = t.grandTotal ? Math.min(100, Math.round((num(inv.paidAmount) / t.grandTotal) * 100)) : 0;

    const days = daysUntil(inv.dueDate);
    inv.daysOverdue = days === null ? null : days < 0 ? Math.abs(days) : 0;
    inv.isOverdue =
      inv.outstanding > 0 &&
      days !== null &&
      days < 0 &&
      ["Issued", "Partially Paid", "Overdue"].includes(inv.status);

    inv.paymentStatus = derivePaymentStatus(
      t.grandTotal,
      num(inv.paidAmount),
      inv.dueDate,
      inv.status,
    );

    inv.isEditable = ["Draft", "Pending Review"].includes(inv.status);
    inv.isIssuable = inv.status === "Approved";
    inv.canCreditNote =
      ["Issued", "Partially Paid", "Paid", "Overdue"].includes(inv.status) && !inv.creditNoteRef;
    inv.hasPriceOverride = (inv.items ?? []).some((l) => l.priceOverride);
  }
}

decorateInvoices();

export const getInvoice = (code: string) =>
  SALES_INVOICES.find((i) => i.code === code) ?? null;

/** INV-2026-000026 — the year comes from the existing series, not the clock. */
export function nextInvoiceCode(): string {
  const n = SALES_INVOICES.reduce((m, i) => {
    const tail = String(i.code).split("-").pop() ?? "0";
    return Math.max(m, parseInt(tail, 10) || 0);
  }, 0);
  return `INV-2026-${String(n + 1).padStart(6, "0")}`;
}

/* ---------- Source document adapters ---------- */

export interface SourceDocOption {
  code: string;
  customer: string;
  customerCode: string;
  date: string;
  customerPo: string;
  salesRep: string;
  warehouse: string;
}

/** Sales Orders that still have something left to bill. */
export function invoiceableSalesOrders(): SourceDocOption[] {
  return SALES_ORDERS.filter((so) =>
    ["Confirmed", "Picking", "Partially Delivered", "Completed"].includes(so.status),
  ).map((so) => ({
    code: so.code,
    customer: so.customer,
    customerCode: so.customerCode,
    date: so.orderDate,
    customerPo: so.customerPo,
    salesRep: so.salesRep,
    warehouse: so.warehouse,
  }));
}

/** Delivery Orders that actually shipped something. */
export function invoiceableDeliveryOrders(): SourceDocOption[] {
  return DELIVERY_ORDERS.filter((d) => ["Shipped", "Delivered"].includes(d.status)).map((d) => ({
    code: d.code,
    customer: d.customer,
    customerCode: d.customerCode,
    date: d.deliveryDate,
    customerPo: "",
    salesRep: "",
    warehouse: d.warehouse,
  }));
}

export function sourceOptions(sourceType: string): SourceDocOption[] {
  if (sourceType === "Sales Order") return invoiceableSalesOrders();
  if (sourceType === "Delivery Order") return invoiceableDeliveryOrders();
  return [];
}

/**
 * Pull billable lines off a source document, already netted against whatever
 * previous invoices took. This is what stops the same goods being billed twice.
 */
export function billableLinesFrom(sourceType: string, sourceDoc: string): InvLine[] {
  const base: Omit<InvLine, "line" | "sourceLine">[] = [];

  if (sourceType === "Sales Order") {
    const so = SALES_ORDERS.find((s) => s.code === sourceDoc);
    if (!so) return [];
    for (const it of so.items ?? []) {
      const prev = invoicedQtyForSource(sourceDoc, it.code);
      base.push({
        code: it.code,
        name: it.name,
        desc: it.name,
        orderedQty: num(it.qty),
        deliveredQty: num(it.delivered),
        prevInvoicedQty: prev,
        invoiceQty: Math.max(0, num(it.qty) - prev),
        unit: it.unit,
        unitPrice: num(it.price),
        discType: num(it.disc) ? "Percent" : "None",
        disc: num(it.disc),
        taxCode: "VAT7",
        taxRate: num(it.tax) || 7,
        warehouse: so.warehouse,
        lotSerial: "",
        note: "",
        priceOverride: false,
        overrideReason: "",
      });
    }
  }

  if (sourceType === "Delivery Order") {
    const dobj = DELIVERY_ORDERS.find((d) => d.code === sourceDoc);
    if (!dobj) return [];
    const so = SALES_ORDERS.find((s) => s.code === dobj.soRef);
    for (const it of dobj.items ?? []) {
      const soLine = (so?.items ?? []).find((l) => l.code === it.code);
      const prev = invoicedQtyForSource(sourceDoc, it.code);
      const delivered = num(it.delivered) || num(it.qty);
      base.push({
        code: it.code,
        name: it.name,
        desc: it.name,
        orderedQty: num(soLine?.qty) || delivered,
        deliveredQty: delivered,
        prevInvoicedQty: prev,
        invoiceQty: Math.max(0, delivered - prev),
        unit: it.unit,
        unitPrice: num(soLine?.price),
        discType: num(soLine?.disc) ? "Percent" : "None",
        disc: num(soLine?.disc),
        taxCode: "VAT7",
        taxRate: num(soLine?.tax) || 7,
        warehouse: dobj.warehouse,
        lotSerial: "",
        /* The wording agreed with the customer, carried from the order the
           same way the price is. `it` is the delivery line, `soLine` the
           order line it came from. */
        note: it.note || soLine?.note || "",
        priceOverride: false,
        overrideReason: "",
        customName: it.customName || soLine?.customName || "",
        showOnBill: (it.showOnBill ?? soLine?.showOnBill) !== false,
      });
    }
  }

  return base.map((b, i) => ({ ...b, line: i + 1, sourceLine: i + 1 }));
}

/** Header defaults a source document hands to a new invoice. */
export function headerFromSource(sourceType: string, sourceDoc: string) {
  if (sourceType === "Sales Order") {
    const so = SALES_ORDERS.find((s) => s.code === sourceDoc);
    if (!so) return null;
    return {
      customer: so.customer,
      customerCode: so.customerCode,
      customerPo: so.customerPo,
      salesRep: so.salesRep.split(" - ")[1] ?? so.salesRep,
      currency: so.currency,
      payTerm: "30 Days",
      channel: so.channel,
      soRef: so.code,
    };
  }
  if (sourceType === "Delivery Order") {
    const d = DELIVERY_ORDERS.find((x) => x.code === sourceDoc);
    if (!d) return null;
    const so = SALES_ORDERS.find((s) => s.code === d.soRef);
    return {
      customer: d.customer,
      customerCode: d.customerCode,
      customerPo: so?.customerPo ?? "",
      salesRep: (so?.salesRep ?? "").split(" - ")[1] ?? "",
      currency: so?.currency ?? "THB",
      payTerm: "30 Days",
      channel: so?.channel ?? "Direct",
      soRef: d.soRef,
    };
  }
  return null;
}

/** Every invoice raised against one source document. */
export const invoicesForSource = (sourceDoc: string) =>
  SALES_INVOICES.filter((i) => i.sourceDoc === sourceDoc);

/* ---------- Customer billing profile ---------- */

export interface BillingProfile {
  code: string;
  name: string;
  type: string;
  taxId: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
  payTerm: string;
  creditDays: number;
  creditStatus: string;
  group: string;
  tier: string;
  priceList: string;
  salesRep: string;
}

/**
 * Who we can bill. Two sources on purpose: the Business Partner master, plus
 * the billing snapshots already frozen onto existing invoices — the spec's
 * customer set was defined against invoices, not against BP records.
 */
export function billingProfiles(): BillingProfile[] {
  const seen = new Map<string, BillingProfile>();

  for (const inv of SALES_INVOICES) {
    if (seen.has(inv.customerCode)) continue;
    seen.set(inv.customerCode, {
      code: inv.customerCode,
      name: inv.customer,
      type: inv.customerType,
      taxId: inv.taxId,
      address: inv.billingAddress,
      contact: inv.contactPerson,
      phone: inv.phone,
      email: inv.email,
      payTerm: inv.payTerm,
      creditDays: inv.creditDays,
      creditStatus: inv.creditStatus,
      group: inv.customerGroup,
      tier: inv.customerTier,
      priceList: inv.priceList,
      salesRep: inv.salesRep,
    });
  }

  for (const bp of BUSINESS_PARTNERS) {
    if (!(bp.roles?.customer || bp.roles?.dealer) || seen.has(bp.code)) continue;
    const addr = bp.addresses?.find((a) => a.primary) ?? bp.addresses?.[0];
    const c = bp.contacts?.find((x) => x.primary) ?? bp.contacts?.[0];
    seen.set(bp.code, {
      code: bp.code,
      name: bp.nameTh || bp.nameEn,
      type: bp.type,
      taxId: bp.tax?.taxId ?? "",
      address: addr ? [addr.l1, addr.sub, addr.dist, addr.prov, addr.zip].filter(Boolean).join(" ") : "",
      contact: c ? `${c.prefix}${c.first} ${c.last}` : "",
      phone: c?.mobile || c?.phone || "",
      email: c?.email ?? "",
      payTerm: "30 Days",
      creditDays: bp.credit?.days ?? 30,
      creditStatus: bp.credit?.status ?? "Normal",
      group: bp.cls?.custGroup ?? "",
      tier: bp.cls?.custLevel ?? "",
      priceList: "Standard Price List",
      salesRep: (bp.sales?.rep ?? "").split(" - ")[1] ?? "",
    });
  }

  return [...seen.values()];
}

export const billingCustomerOptions = () =>
  billingProfiles().map((p) => `${p.code} - ${p.name}`);

export const getBillingProfile = (label: string) => {
  const code = String(label ?? "").split(" - ")[0].trim();
  return billingProfiles().find((p) => p.code === code) ?? null;
};

/**
 * Warnings the biller must see before issuing: the customer masters and the
 * invoice header have to agree.
 */
export function billingWarnings(inv: {
  customerCode?: string;
  taxId?: string;
  billingAddress?: string;
  taxInvoiceType?: string;
  creditStatus?: string;
}): string[] {
  const out: string[] = [];
  const bp = inv.customerCode ? getCustomer(inv.customerCode) : null;

  if (bp && bp.status !== "Active") out.push(`ลูกค้าอยู่ในสถานะ ${bp.status}`);
  if (inv.creditStatus === "Credit Hold") out.push("ลูกค้าถูกระงับเครดิต");
  if (inv.creditStatus === "Over Limit") out.push("ลูกค้าใช้เครดิตเกินวงเงิน");
  if (!String(inv.taxId ?? "").trim() && inv.taxInvoiceType !== "Non-Tax Invoice")
    out.push("ยังไม่ระบุเลขประจำตัวผู้เสียภาษี");
  if (!String(inv.billingAddress ?? "").trim()) out.push("ยังไม่ระบุที่อยู่ออกใบกำกับภาษี");

  return out;
}

/** Total still owed to us across every live invoice for one customer. */
export function customerOutstanding(customerCode: string): number {
  return round2(
    SALES_INVOICES.filter(
      (i) => i.customerCode === customerCode && !["Cancelled", "Void"].includes(i.status),
    ).reduce((t, i) => t + i.outstanding, 0),
  );
}

export { DASH, toDisplayDate, toInputDate };
