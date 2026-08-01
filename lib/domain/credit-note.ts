import {
  CN_APPROVAL_THRESHOLD,
  CREDIT_NOTES as RAW,
  type CnLine,
  type CreditNote,
} from "@/data/credit-notes";
import { SALES_RETURNS } from "./sales-return";
import { SALES_INVOICES } from "./invoice";
import { pctOf } from "./lines";
import { DASH } from "@/lib/format";

/* ============================================================
   CREDIT NOTE — the financial adjustment after an approved return.

   Reduces what the customer owes. It NEVER moves stock — Return
   Receiving, Return QC and Disposition already settled inventory —
   and it posts nothing to a ledger. AR posting, journals and tax
   filing belong to the future Finance module.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Line maths ---------- */

export const lineGross = (it: Partial<CnLine>) => num(it.creditQty) * num(it.unitPrice);

export const lineDiscount = (it: Partial<CnLine>) => round2(lineGross(it) * (num(it.disc) / 100));

/** Amount credited on the line, before tax is separated out. */
export const lineAmount = (it: Partial<CnLine>) => round2(lineGross(it) - lineDiscount(it));

export const netUnitPrice = (it: Partial<CnLine>) =>
  round2(num(it.unitPrice) * (1 - num(it.disc) / 100));

/**
 * Tax on one credit line.
 *
 *   Exclusive:  tax = amount × rate / 100
 *   Inclusive:  tax = amount × rate / (100 + rate)
 */
export function lineTax(it: Partial<CnLine>, mode: string): number {
  const amount = lineAmount(it);
  const rate = num(it.taxRate);
  if (!rate) return 0;
  return mode === "Tax Inclusive"
    ? round2((amount * rate) / (100 + rate))
    : round2((amount * rate) / 100);
}

export const lineTaxable = (it: Partial<CnLine>, mode: string) =>
  mode === "Tax Inclusive" ? round2(lineAmount(it) - lineTax(it, mode)) : lineAmount(it);

/** Rule: a line may never credit more than the return approved. */
export const isOverCredit = (it: Partial<CnLine>) => num(it.creditQty) > num(it.approvedQty);

/* ---------- Document totals ---------- */

export interface CnTotals {
  totalQty: number;
  subtotal: number;
  discount: number;
  headerDiscount: number;
  taxable: number;
  tax: number;
  rounding: number;
  totalCredit: number;
}

type TotalsInput = {
  items?: Partial<CnLine>[];
  taxMode?: string;
  headerDisc?: number;
  rounding?: number;
};

/** One pass produces every figure the summary, the list and the drawer read. */
export function creditTotals(cn: TotalsInput): CnTotals {
  const mode = cn.taxMode ?? "Tax Exclusive";
  const items = cn.items ?? [];

  const totalQty = items.reduce((t, it) => t + num(it.creditQty), 0);
  const gross = round2(items.reduce((t, it) => t + lineGross(it), 0));
  const lineDisc = round2(items.reduce((t, it) => t + lineDiscount(it), 0));
  const afterLine = round2(gross - lineDisc);

  const headerDisc = round2(afterLine * (num(cn.headerDisc) / 100));
  const afterHeader = round2(afterLine - headerDisc);
  const scale = afterLine ? afterHeader / afterLine : 1;

  const taxable = round2(items.reduce((t, it) => t + lineTaxable(it, mode) * scale, 0));
  const tax = round2(items.reduce((t, it) => t + lineTax(it, mode) * scale, 0));
  const rounding = num(cn.rounding);

  return {
    totalQty,
    subtotal: gross,
    discount: lineDisc,
    headerDiscount: headerDisc,
    taxable,
    tax,
    rounding,
    totalCredit: round2(taxable + tax + rounding),
  };
}

/* ---------- Approval policy ---------- */

/**
 * Which conditions force the full approval chain. Anything that changes what
 * the customer is charged without a physical return behind it needs sign-off.
 */
export function approvalTriggers(cn: {
  items?: Partial<CnLine>[];
  taxMode?: string;
  headerDisc?: number;
  rounding?: number;
  creditType?: string;
  sourceType?: string;
  vatRate?: number;
}): string[] {
  const out: string[] = [];
  const t = creditTotals(cn);

  if (t.totalCredit > CN_APPROVAL_THRESHOLD)
    out.push(`มูลค่าเกิน ${CN_APPROVAL_THRESHOLD.toLocaleString()} บาท`);
  if (cn.sourceType === "Manual") out.push("ใบลดหนี้แบบ Manual");
  if (cn.creditType === "Price Adjustment") out.push("ปรับราคาย้อนหลัง");
  if (cn.creditType === "Commercial Discount") out.push("ส่วนลดการค้า");
  if (num(cn.vatRate) !== 7) out.push("อัตราภาษีไม่ใช่ 7%");
  if (num(cn.headerDisc) > 0) out.push("มีส่วนลดท้ายบิล");
  if ((cn.items ?? []).some((it) => num(it.disc) > 0)) out.push("มีส่วนลดรายบรรทัด");

  return out;
}

export const needsApproval = (cn: Parameters<typeof approvalTriggers>[0]) =>
  approvalTriggers(cn).length > 0;

/* ---------- Row decoration ---------- */

export interface CnRow extends CreditNote {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  subtotal: number;
  discountTotal: number;
  taxable: number;
  taxAmount: number;
  totalCredit: number;
  outstandingCredit: number;
  appliedPct: number;
  /** Draft and Pending Approval are the only editable states. */
  isEditable: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canIssue: boolean;
  canApply: boolean;
  canCancel: boolean;
  canVoid: boolean;
  approvalReasons: string[];
  hasOverCredit: boolean;
}

export const CREDIT_NOTES = RAW as CnRow[];

export function decorateCreditNotes() {
  for (const cn of CREDIT_NOTES) {
    const t = creditTotals(cn);

    cn.name = cn.code;
    cn.icon = "🧾";
    cn.itemCount = cn.items?.length ?? 0;
    cn.totalQty = t.totalQty;
    cn.subtotal = t.subtotal;
    cn.discountTotal = round2(t.discount + t.headerDiscount);
    cn.taxable = t.taxable;
    cn.taxAmount = t.tax;
    cn.totalCredit = t.totalCredit;
    cn.outstandingCredit = round2(Math.max(0, t.totalCredit - num(cn.appliedAmount)));
    cn.appliedPct = pctOf(num(cn.appliedAmount), t.totalCredit);

    cn.isEditable = ["Draft", "Pending Approval"].includes(cn.status);
    cn.canSubmit = cn.status === "Draft";
    cn.canApprove = cn.status === "Pending Approval";
    cn.canIssue = cn.status === "Approved";
    cn.canApply = cn.status === "Issued" && cn.outstandingCredit > 0;
    cn.canCancel = ["Draft", "Pending Approval", "Approved"].includes(cn.status);
    cn.canVoid = ["Issued", "Applied"].includes(cn.status);

    cn.approvalReasons = approvalTriggers(cn);
    cn.hasOverCredit = (cn.items ?? []).some(isOverCredit);
  }
}

decorateCreditNotes();

export const getCreditNote = (code: string) => CREDIT_NOTES.find((c) => c.code === code) ?? null;

export function nextCreditNoteCode(): string {
  const n = CREDIT_NOTES.reduce((m, c) => {
    const tail = String(c.code).split("-").pop() ?? "0";
    return Math.max(m, parseInt(tail, 10) || 0);
  }, 0);
  return `CN-2026-${String(n + 1).padStart(6, "0")}`;
}

/* ---------- Source document adapters ---------- */

export interface CnSourceOption {
  code: string;
  customer: string;
  customerCode: string;
  date: string;
}

/** Credit notes already raised against one source — used to block duplicates. */
export const creditNotesForSource = (doc: string) =>
  CREDIT_NOTES.filter((c) => c.sourceDoc === doc && !["Cancelled", "Void"].includes(c.status));

/**
 * Returns worth crediting: approved and not already credited. Rule 16/17 of the
 * return module — a credit note is only raised after approval, never automatic.
 */
export function creditableReturns(exclude = ""): CnSourceOption[] {
  return SALES_RETURNS.filter(
    (r) =>
      ["Approved", "Partially Approved", "Received", "Partially Received", "Pending QC", "QC Completed", "Disposition Completed", "Credit Note Pending"].includes(
        r.status,
      ) && creditNotesForSource(r.code).every((c) => c.code === exclude),
  ).map((r) => ({
    code: r.code,
    customer: r.customer,
    customerCode: r.customerCode,
    date: r.returnDate,
  }));
}

/** Invoices a manual adjustment may be raised against. */
export function creditableInvoices(): CnSourceOption[] {
  return SALES_INVOICES.filter((i) => !["Draft", "Cancelled", "Void"].includes(i.status)).map((i) => ({
    code: i.code,
    customer: i.customer,
    customerCode: i.customerCode,
    date: i.invoiceDate,
  }));
}

export function cnSourceOptions(sourceType: string, exclude = ""): CnSourceOption[] {
  if (sourceType === "Sales Return") return creditableReturns(exclude);
  if (sourceType === "Sales Invoice") return creditableInvoices();
  return [];
}

/** Header defaults a source document hands to a new credit note. */
export function headerFromCnSource(sourceType: string, doc: string) {
  if (sourceType === "Sales Return") {
    const r = SALES_RETURNS.find((x) => x.code === doc);
    if (!r) return null;
    const inv = SALES_INVOICES.find((i) => i.code === r.invoiceRef);
    return {
      customer: r.customer,
      customerCode: r.customerCode,
      customerGroup: r.customerGroup,
      taxId: inv?.taxId ?? "",
      address: inv?.billingAddress ?? r.pickupAddress,
      contactPerson: r.contactPerson,
      phone: r.contactPhone,
      email: r.email,
      salesRep: r.salesRep,
      returnRef: r.code,
      invoiceRef: r.invoiceRef,
      soRef: r.soRef,
      creditType: "Return",
      reason: r.returnType === "Damaged Product" ? "Damaged Product" : "Customer Return",
      returnDate: r.returnDate,
      originalInvoiceDate: r.originalInvoiceDate,
      originalAmount: r.originalAmount,
    };
  }

  if (sourceType === "Sales Invoice") {
    const i = SALES_INVOICES.find((x) => x.code === doc);
    if (!i) return null;
    return {
      customer: i.customer,
      customerCode: i.customerCode,
      customerGroup: i.customerGroup,
      taxId: i.taxId,
      address: i.billingAddress,
      contactPerson: i.contactPerson,
      phone: i.phone,
      email: i.email,
      salesRep: i.salesRep,
      returnRef: "",
      invoiceRef: i.code,
      soRef: "",
      creditType: "Price Adjustment",
      reason: "Price Correction",
      returnDate: "",
      originalInvoiceDate: i.invoiceDate,
      originalAmount: i.grandTotal,
    };
  }

  return null;
}

/**
 * Creditable lines off a source document.
 *
 *   From a Sales Return: approved quantities set the ceiling.
 *   From an Invoice: the invoiced quantity is the ceiling — there is no return
 *   behind it, so the whole line is adjustable but the price is what changes.
 */
export function creditableLinesFrom(sourceType: string, doc: string): CnLine[] {
  if (sourceType === "Sales Return") {
    const r = SALES_RETURNS.find((x) => x.code === doc);
    if (!r) return [];
    return (r.items ?? [])
      .filter((it) => num(it.approvedQty) > 0 || num(it.requestedQty) > 0)
      .map((it, i) => {
        const approved = num(it.approvedQty) || num(it.requestedQty);
        return {
          line: i + 1,
          code: it.code,
          name: it.name,
          sourceQty: num(it.shippedQty),
          returnedQty: num(it.receivedQty) || approved,
          approvedQty: approved,
          /* QC-accepted quantity wins when inspection has happened. */
          creditQty: num(it.inspectedQty) > 0 ? num(it.acceptedQty) : approved,
          unit: it.unit,
          unitPrice: num(it.unitPrice),
          disc: 0,
          taxCode: "VAT7",
          taxRate: 7,
          reason: it.reason || r.returnType,
          note: it.note,
        } satisfies CnLine;
      });
  }

  if (sourceType === "Sales Invoice") {
    const inv = SALES_INVOICES.find((x) => x.code === doc);
    if (!inv) return [];
    return (inv.items ?? []).map((it, i) => ({
      line: i + 1,
      code: it.code,
      name: it.name,
      sourceQty: num(it.invoiceQty),
      returnedQty: 0,
      approvedQty: num(it.invoiceQty),
      creditQty: 0,
      unit: it.unit,
      unitPrice: 0,
      disc: 0,
      taxCode: it.taxCode || "VAT7",
      taxRate: num(it.taxRate) || 7,
      reason: "Price Correction",
      note: "ระบุส่วนต่างราคาต่อหน่วยที่ต้องการลดหนี้",
    }));
  }

  return [];
}

/* ---------- Readiness ---------- */

export interface CnIssue {
  label: string;
  blocking: boolean;
}

/** Everything stopping this credit note being submitted for approval. */
export function submitReadiness(cn: {
  items?: Partial<CnLine>[];
  customer?: string;
  creditType?: string;
  reason?: string;
  taxMode?: string;
  vatRate?: number;
  headerDisc?: number;
  rounding?: number;
  sourceType?: string;
}): CnIssue[] {
  const out: CnIssue[] = [];
  const items = (cn.items ?? []).filter((it) => String(it.code ?? "").trim());

  if (!items.length) out.push({ label: "ยังไม่มีรายการที่ลดหนี้", blocking: true });
  if (!String(cn.customer ?? "").trim()) out.push({ label: "ยังไม่ระบุลูกค้า", blocking: true });
  if (!String(cn.creditType ?? "").trim()) out.push({ label: "ยังไม่ระบุประเภทใบลดหนี้", blocking: true });
  if (!String(cn.reason ?? "").trim()) out.push({ label: "ยังไม่ระบุเหตุผล", blocking: true });

  const zero = items.filter((it) => num(it.creditQty) <= 0);
  if (zero.length) out.push({ label: `${zero.length} บรรทัดจำนวนลดหนี้เป็นศูนย์`, blocking: true });

  const over = items.filter(isOverCredit);
  if (over.length)
    out.push({ label: `${over.length} บรรทัดลดหนี้เกินจำนวนที่อนุมัติ`, blocking: true });

  const noPrice = items.filter((it) => num(it.unitPrice) <= 0);
  if (noPrice.length) out.push({ label: `${noPrice.length} บรรทัดยังไม่ระบุราคา`, blocking: true });

  const noTax = items.filter((it) => !String(it.taxCode ?? "").trim());
  if (noTax.length) out.push({ label: `${noTax.length} บรรทัดยังไม่ระบุรหัสภาษี`, blocking: true });

  const noReason = items.filter((it) => !String(it.reason ?? "").trim());
  if (noReason.length)
    out.push({ label: `${noReason.length} บรรทัดยังไม่ระบุเหตุผล`, blocking: true });

  if (creditTotals(cn).totalCredit <= 0)
    out.push({ label: "มูลค่าลดหนี้รวมต้องมากกว่า 0", blocking: true });

  for (const t of approvalTriggers(cn)) out.push({ label: `ต้องผ่านการอนุมัติ: ${t}`, blocking: false });

  return out;
}

export const blockingIssues = (issues: CnIssue[]) => issues.filter((i) => i.blocking);

/** Total credit still available to offset invoices for one customer. */
export function customerOutstandingCredit(customerCode: string): number {
  return round2(
    CREDIT_NOTES.filter(
      (c) => c.customerCode === customerCode && ["Issued", "Applied"].includes(c.status),
    ).reduce((t, c) => t + c.outstandingCredit, 0),
  );
}

export { DASH, CN_APPROVAL_THRESHOLD };
