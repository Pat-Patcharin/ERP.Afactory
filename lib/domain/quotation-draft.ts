import { PAY_TERMS } from "@/data/partners";
import { QT_CHANNELS, QT_PRICE_LISTS, QT_VALIDITY_DAYS, type Quotation } from "@/data/quotations";
import { PRODUCTS, productStock } from "./product";
import { addressLine, bpBillingAddress, bpDeliveryAddress } from "./partner";
import { docDiscTotal, docGrandTotal, docSubtotal, docTaxTotal } from "./lines";
import {
  QUOTATIONS,
  creditCheck,
  decorateQuotations,
  getCustomer,
  nextQuotationCode,
  salesRepOptions,
  type QtRow,
} from "./outbound";
import { SALES_REPRESENTATIVES } from "./sales";
import { bpLatestSalesYear, bpSalesOrders } from "./partner-analytics";
import { SALES_INVOICES } from "./invoice";
import { toDisplayDate, toInputDate, stamp, today } from "@/lib/format";
import { META_LABELS } from "@/lib/print/config";
import { defaultBank, printCompany } from "@/lib/print/mapper";
import { bahtText } from "@/lib/print/words";
import type { PrintConfig, PrintDoc, PrintLine } from "@/lib/print/types";

/* ============================================================
   QUOTATION DRAFT

   The model behind the document editor. One shape drives three
   things — the editable canvas, the printed sheet and the saved
   record — so a field can never mean one thing on screen and
   another on paper.

   It owns no arithmetic of its own: totals come from
   lib/domain/lines.ts, credit from creditCheck(), prices from the
   product master. This file is the SHAPE, not a second engine.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? "").trim();

export interface DraftLine {
  /** Stable key so React rows survive reordering and deletion. */
  id: string;
  code: string;
  name: string;
  /** Extra lines printed under the item name. */
  desc: string;
  unit: string;
  qty: number | "";
  price: number | "";
  disc: number | "";
  tax: number | "";
  lot: string;
  serial: string;
  note: string;
}

export interface QuotationDraft {
  mode: "create" | "edit";
  code: string;
  status: string;

  /* Customer — "BP000123 - ชื่อ" as the picker holds it. */
  customerPick: string;
  customerCode: string;
  customer: string;
  taxId: string;
  billAddress: string;
  billContact: string;
  billPhone: string;

  /* Ship to */
  sameAsBill: boolean;
  shipAddressPick: string;
  shipName: string;
  shipAddress: string;
  shipContact: string;
  shipPhone: string;
  shipInstruction: string;

  /* Metadata */
  quoteDate: string;
  validUntil: string;
  customerRef: string;
  salesRep: string;
  priceList: string;
  currency: string;
  payTerm: string;
  channel: string;
  deliveryDate: string;
  warehouse: string;
  internalRef: string;

  items: DraftLine[];

  /* Money the header carries, on top of the lines. */
  headerDisc: number | "";
  freight: number | "";
  otherCharges: number | "";

  /** Printed under the item table. */
  remarks: string;
  /** Never printed — see draftToQuotation and the print mapper. */
  internalNote: string;
}

/* ---------- Defaults ---------- */

export const DEFAULT_REMARKS = [
  "สินค้ารับประกัน 6 เดือน นับจากวันที่ส่งมอบสินค้า",
  "กรุณาตรวจสอบสินค้า ก่อนรับมอบหากมีปัญหา กรุณาแจ้งภายใน 7 วัน",
  "ราคานี้ไม่รวมค่าจัดส่ง",
  `ใบเสนอราคานี้มีอายุ ${QT_VALIDITY_DAYS} วัน นับจากวันที่ออกเอกสาร`,
].join("\n");

let rowSeq = 0;
export const newLineId = () => `qtl-${++rowSeq}`;

export const blankLine = (): DraftLine => ({
  id: newLineId(),
  code: "",
  name: "",
  desc: "",
  unit: "",
  qty: "",
  price: "",
  disc: 0,
  tax: 7,
  lot: "",
  serial: "",
  note: "",
});

/** Default validity: today plus the standard window. */
export function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + QT_VALIDITY_DAYS);
  return d.toISOString().slice(0, 10);
}

export function blankDraft(): QuotationDraft {
  return {
    mode: "create",
    code: nextQuotationCode(),
    status: "Draft",
    customerPick: "",
    customerCode: "",
    customer: "",
    taxId: "",
    billAddress: "",
    billContact: "",
    billPhone: "",
    sameAsBill: true,
    shipAddressPick: "",
    shipName: "",
    shipAddress: "",
    shipContact: "",
    shipPhone: "",
    shipInstruction: "",
    quoteDate: toInputDate(today()),
    validUntil: defaultValidUntil(),
    customerRef: "",
    salesRep: "",
    priceList: QT_PRICE_LISTS[0],
    currency: "THB",
    payTerm: PAY_TERMS[0] ?? "เครดิต 30 วัน",
    channel: "Direct",
    deliveryDate: "",
    warehouse: "",
    internalRef: "",
    items: [blankLine()],
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    remarks: DEFAULT_REMARKS,
    internalNote: "",
  };
}

/**
 * Open an existing quotation in the editor.
 *
 * The stored record has no Bill To / Ship To of its own — a quotation names a
 * customer and the addresses are read from the partner. So the panels are
 * filled from the master here, exactly as the print mapper does.
 */
export function draftFromQuotation(q: Quotation): QuotationDraft {
  const base = blankDraft();
  const pick = `${q.customerCode} - ${q.customer}`;
  const draft: QuotationDraft = {
    ...base,
    mode: "edit",
    code: q.code,
    status: q.status,
    customerPick: pick,
    customerCode: q.customerCode,
    customer: q.customer,
    quoteDate: toInputDate(q.quoteDate),
    validUntil: toInputDate(q.validUntil),
    customerRef: q.customerRef,
    salesRep: q.salesRep,
    priceList: q.priceList,
    currency: q.currency,
    payTerm: q.payTerm,
    channel: q.channel,
    remarks: q.note || DEFAULT_REMARKS,
    internalNote: "",
    items: (q.items ?? []).map((it) => ({
      ...blankLine(),
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      disc: it.disc,
      tax: it.tax,
      note: it.note ?? "",
    })),
  };
  if (!draft.items.length) draft.items = [blankLine()];
  return applyCustomer(draft, pick);
}

/* ---------- Customer ---------- */

export interface ShipToOption {
  label: string;
  address: string;
  contact: string;
  phone: string;
  remark: string;
}

/** Every active address on the partner, for the Ship To selector. */
export function shipToChoices(customerPick: string): ShipToOption[] {
  const bp = getCustomer(customerPick);
  if (!bp) return [];
  return (bp.addresses ?? [])
    .filter((a) => a.active)
    .map((a) => ({
      label: `${a.name || a.type} — ${a.dist || a.prov}`.trim(),
      address: addressLine(a),
      contact: a.contact ?? "",
      phone: a.phone ?? "",
      remark: a.remark ?? "",
    }));
}

/**
 * Adopt everything the Business Partner master knows about this customer.
 *
 * Returns a NEW draft: the caller decides when to commit it, and a customer
 * change that half-applied would be worse than one that did not apply at all.
 * Values the user has already typed are not overwritten — only the fields
 * that belong to the customer.
 */
export function applyCustomer(draft: QuotationDraft, customerPick: string): QuotationDraft {
  const bp = getCustomer(customerPick);
  if (!bp) {
    return { ...draft, customerPick, customerCode: "", customer: "" };
  }

  const billing = bpBillingAddress(bp);
  const delivery = bpDeliveryAddress(bp) ?? billing;
  const contact = bp.contacts?.find((c) => c.primary) ?? bp.contacts?.[0] ?? null;
  const contactName = contact ? `${contact.prefix}${contact.first} ${contact.last}`.trim() : "";

  const next: QuotationDraft = {
    ...draft,
    customerPick,
    customerCode: bp.code,
    customer: bp.nameTh || bp.nameEn,
    taxId: bp.tax?.taxId ?? "",
    billAddress: billing ? addressLine(billing) : "",
    billContact: contactName,
    billPhone: billing?.phone || contact?.phone || contact?.mobile || "",
    shipName: bp.nameTh || bp.nameEn,
    shipAddressPick: delivery ? `${delivery.name || delivery.type} — ${delivery.dist || delivery.prov}`.trim() : "",
    shipAddress: delivery ? addressLine(delivery) : "",
    shipContact: delivery?.contact || contactName,
    shipPhone: delivery?.phone || contact?.mobile || "",
    shipInstruction: delivery?.remark ?? "",
  };

  /* Commercial terms the customer carries — but only ones the document can
     actually offer. See resolveRep / resolvePriceList: the partner master
     keeps these in an older value space, and writing an unrecognised value
     into a picker leaves the salesperson staring at a blank field. */
  if (bp.sales?.payTerm && PAY_TERMS.includes(bp.sales.payTerm as never)) {
    next.payTerm = bp.sales.payTerm;
  }
  const rep = resolveRep(bp.sales?.rep ?? "");
  if (rep) next.salesRep = rep;
  const list = resolvePriceList(bp.sales?.priceList ?? "");
  if (list) next.priceList = list;
  if (bp.cls?.channel && QT_CHANNELS.includes(bp.cls.channel as never)) {
    next.channel = bp.cls.channel;
  }

  return next;
}

/**
 * Match the partner's sales rep to a real one.
 *
 * The Business Partner master stores "SRE001 - สมชาย ใจดี" while the Sales Rep
 * master issues SALE001 and holds the name in English — two numbering schemes
 * that were never reconciled. Matching on the person, not the code, is what
 * makes the customer's own rep come through; an unmatched value is dropped
 * rather than written into a picker that cannot show it.
 */
export function resolveRep(stored: string): string {
  const value = str(stored);
  if (!value) return "";

  const options = salesRepOptions();
  if (options.includes(value)) return value;

  const name = value.split(" - ").slice(1).join(" - ").trim();
  if (!name) return "";

  const rep = SALES_REPRESENTATIVES.find(
    (r) => r.status === "Active" && (`${r.first} ${r.last}`.trim() === name || r.nick === name),
  );
  return rep ? `${rep.code} - ${rep.first} ${rep.last}` : "";
}

/**
 * Match the partner's price group to a quotation price list.
 *
 * "Dealer 2569" and "PL-DEALER-2026 Dealer" are the same commercial list under
 * two naming conventions; the group name is the part that carries meaning.
 */
export function resolvePriceList(stored: string): string {
  const value = str(stored);
  if (!value) return "";
  if (QT_PRICE_LISTS.includes(value as never)) return value;

  const group = value.split(/\s+/)[0].toLowerCase();
  return (
    QT_PRICE_LISTS.find((p) => p.toLowerCase().includes(group)) ?? ""
  );
}

/** Pick one of the customer's other addresses without leaving the page. */
export function applyShipTo(draft: QuotationDraft, label: string): QuotationDraft {
  const choice = shipToChoices(draft.customerPick).find((c) => c.label === label);
  if (!choice) return { ...draft, shipAddressPick: label };
  return {
    ...draft,
    sameAsBill: false,
    shipAddressPick: label,
    shipAddress: choice.address,
    shipContact: choice.contact || draft.shipContact,
    shipPhone: choice.phone || draft.shipPhone,
    shipInstruction: choice.remark || draft.shipInstruction,
  };
}

/* ---------- Products ---------- */

export interface ProductHit {
  code: string;
  name: string;
  unit: string;
  price: number;
  available: number;
  meta: string;
}

/** Product search for the item grid. Same source as the form schema's lookup. */
export function productSearch(q: string, limit = 12): ProductHit[] {
  const t = q.trim().toLowerCase();
  return PRODUCTS.filter(
    (p) =>
      !t ||
      p.code.toLowerCase().includes(t) ||
      p.name.toLowerCase().includes(t) ||
      p.nameTh.includes(q.trim()),
  )
    .slice(0, limit)
    .map((p) => ({
      code: p.code,
      name: p.name,
      unit: p.unit,
      price: p.price,
      available: p.availTotal,
      meta: p.nameTh,
    }));
}

/**
 * Fill a line from the product master.
 *
 * Price comes from the product; a price the user has already negotiated is
 * left alone, because overwriting a typed price on re-pick would quietly undo
 * the salesperson's work.
 */
export function applyProduct(line: DraftLine, code: string): DraftLine {
  const p = PRODUCTS.find((x) => x.code === code);
  if (!p) return { ...line, code };
  return {
    ...line,
    code: p.code,
    name: p.name,
    unit: p.unit,
    qty: num(line.qty) > 0 ? line.qty : 1,
    price: num(line.price) > 0 ? line.price : p.price,
    tax: line.tax === "" ? 7 : line.tax,
    disc: line.disc === "" ? 0 : line.disc,
  };
}

/** Stock summary for the reference column. A quotation reserves nothing. */
export function lineAvailability(code: string) {
  const st = productStock(str(code));
  return st ? { available: st.available, found: true } : { available: 0, found: false };
}

/* ---------- Totals ---------- */

export interface DraftTotals {
  subtotal: number;
  lineDiscount: number;
  headerDiscount: number;
  netAmount: number;
  vat: number;
  freight: number;
  otherCharges: number;
  rounding: number;
  grandTotal: number;
  itemCount: number;
  totalQty: number;
}

/**
 * Every figure the document shows, from the shared line maths.
 *
 * The header discount is applied after the line discounts and before VAT,
 * which is the order lib/domain/lines.ts already uses per line — so a
 * quotation and the sales order it becomes agree to the satang.
 */
export function draftTotals(draft: QuotationDraft): DraftTotals {
  const priced = draft.items.filter((l) => str(l.code));
  const items = priced.map((l) => ({
    qty: num(l.qty),
    price: num(l.price),
    disc: num(l.disc),
    tax: num(l.tax),
  }));

  const subtotal = docSubtotal({ items });
  const lineDiscount = docDiscTotal({ items });
  const afterLine = subtotal - lineDiscount;

  const headerDiscount = Math.min(num(draft.headerDisc), afterLine);
  const netAmount = afterLine - headerDiscount;

  /* VAT follows the goods, so a header discount reduces it proportionally.
     Freight and other charges are quoted VAT-inclusive in this prototype. */
  const lineTax = docTaxTotal({ items });
  const vat = afterLine > 0 ? lineTax * (netAmount / afterLine) : 0;

  const freight = num(draft.freight);
  const otherCharges = num(draft.otherCharges);
  const beforeRounding = netAmount + vat + freight + otherCharges;
  const grandTotal = Math.round(beforeRounding * 100) / 100;

  return {
    subtotal,
    lineDiscount,
    headerDiscount,
    netAmount,
    vat,
    freight,
    otherCharges,
    rounding: Math.round((grandTotal - beforeRounding) * 100) / 100,
    grandTotal,
    itemCount: priced.length,
    totalQty: items.reduce((t, i) => t + i.qty, 0),
  };
}

/** Grand total as the un-discounted document maths would read it. */
export const draftGrandTotal = (draft: QuotationDraft) =>
  docGrandTotal({
    items: draft.items
      .filter((l) => str(l.code))
      .map((l) => ({ qty: num(l.qty), price: num(l.price), disc: num(l.disc), tax: num(l.tax) })),
  });

/* ---------- Customer insight ---------- */

export interface DraftInsight {
  found: boolean;
  limit: number;
  outstanding: number;
  available: number;
  projected: number;
  overBy: number;
  withinLimit: boolean;
  cashOnly: boolean;
  status: string;
  priceList: string;
  payTerm: string;
  lastOrder: string;
  lastOrderDate: string;
  lastInvoice: string;
  outstandingInvoices: number;
  salesThisYear: number;
}

/** Read-only context for the customer panel. Never any cost or margin. */
export function draftInsight(draft: QuotationDraft): DraftInsight {
  const bp = getCustomer(draft.customerPick);
  const credit = creditCheck(draft.customerPick, draftTotals(draft).grandTotal);

  const orders = bp ? bpSalesOrders(bp) : [];
  const last = orders[0] ?? null;
  const invoices = bp
    ? SALES_INVOICES.filter((i) => i.customer === bp.nameTh || i.customer === bp.nameEn)
    : [];
  const year = bp ? bpLatestSalesYear(bp) : null;

  return {
    found: credit.found,
    limit: credit.limit,
    outstanding: credit.outstanding,
    available: credit.available,
    projected: credit.projected,
    overBy: credit.overBy,
    withinLimit: credit.withinLimit,
    cashOnly: credit.cashOnly,
    status: credit.status,
    priceList: bp?.sales?.priceList ?? draft.priceList,
    payTerm: bp?.sales?.payTerm ?? draft.payTerm,
    lastOrder: last?.code ?? "",
    lastOrderDate: last?.orderDate ?? "",
    lastInvoice: invoices[0]?.code ?? "",
    outstandingInvoices: invoices.filter((i) => i.paymentStatus !== "Paid").length,
    salesThisYear: year?.revenue ?? 0,
  };
}

/* ---------- Validation ---------- */

export interface DraftIssue {
  /** Anchor id on the document, so the summary can scroll to the field. */
  field: string;
  message: string;
  blocking: boolean;
}

/**
 * What must be true to issue a quotation, and what is merely worth knowing.
 *
 * Blocking issues stop Save Quotation. Save Draft ignores them entirely — a
 * draft that cannot be parked is a draft the salesperson will keep in a
 * spreadsheet instead.
 */
export function validateDraft(draft: QuotationDraft): DraftIssue[] {
  const out: DraftIssue[] = [];
  const block = (field: string, message: string) => out.push({ field, message, blocking: true });
  const warn = (field: string, message: string) => out.push({ field, message, blocking: false });

  if (!draft.customerPick) block("customer", "ยังไม่ได้เลือกลูกค้า");
  if (draft.customerPick && !draft.billAddress) block("billAddress", "ไม่พบที่อยู่สำหรับออกบิล");
  if (!draft.salesRep) block("salesRep", "ยังไม่ได้เลือกพนักงานขาย");
  if (!draft.quoteDate) block("quoteDate", "ยังไม่ได้ระบุวันที่เอกสาร");
  if (!draft.validUntil) block("validUntil", "ยังไม่ได้ระบุวันยืนราคา");
  if (draft.quoteDate && draft.validUntil && draft.validUntil <= draft.quoteDate) {
    block("validUntil", "วันยืนราคาต้องอยู่หลังวันที่เอกสาร");
  }
  if (!draft.priceList) block("priceList", "ยังไม่ได้เลือกรายการราคา");
  if (!draft.currency) block("currency", "ยังไม่ได้เลือกสกุลเงิน");

  const filled = draft.items.filter((l) => str(l.code));
  if (!filled.length) block("items", "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด");

  for (const [i, l] of filled.entries()) {
    const at = `item-${l.id}`;
    if (!PRODUCTS.some((p) => p.code === str(l.code))) {
      block(at, `บรรทัดที่ ${i + 1}: ไม่พบรหัสสินค้า ${l.code} ในระบบ`);
      continue;
    }
    if (num(l.qty) <= 0) block(at, `บรรทัดที่ ${i + 1}: จำนวนต้องมากกว่า 0`);
    if (num(l.price) <= 0) block(at, `บรรทัดที่ ${i + 1}: ราคาต่อหน่วยต้องมากกว่า 0`);
    if (num(l.disc) < 0 || num(l.disc) > 100) {
      block(at, `บรรทัดที่ ${i + 1}: ส่วนลดต้องอยู่ระหว่าง 0–100%`);
    } else if (num(l.disc) > DISCOUNT_THRESHOLD) {
      warn(at, `บรรทัดที่ ${i + 1}: ส่วนลด ${num(l.disc)}% สูงกว่าเกณฑ์ปกติ ${DISCOUNT_THRESHOLD}%`);
    }

    const stock = lineAvailability(str(l.code));
    if (stock.found && stock.available < num(l.qty)) {
      warn(at, `บรรทัดที่ ${i + 1}: คงเหลือ ${stock.available} น้อยกว่าที่เสนอ — ใบเสนอราคาไม่จองสต๊อก`);
    }
  }

  /* Non-blocking: none of these makes the document wrong, only thinner. */
  if (draft.customerPick && !draft.shipAddress && !draft.sameAsBill) {
    warn("shipAddress", "ยังไม่ได้ระบุที่อยู่จัดส่ง");
  }
  if (!draft.customerRef) warn("customerRef", "ยังไม่ได้ระบุเลขที่อ้างอิงของลูกค้า");
  if (draft.customerPick && !draft.billPhone) warn("billPhone", "ไม่พบเบอร์โทรของลูกค้า");

  const insight = draftInsight(draft);
  if (insight.found && !insight.withinLimit) {
    warn("credit", `เกินวงเงินเครดิต ${insight.overBy.toLocaleString("en-US")} บาท`);
  }

  return out;
}

/** Above this, a line discount needs a second look — warning, never a block. */
export const DISCOUNT_THRESHOLD = 30;

export const blockingIssues = (issues: DraftIssue[]) => issues.filter((i) => i.blocking);
export const warningIssues = (issues: DraftIssue[]) => issues.filter((i) => !i.blocking);

/* ---------- Printing an unsaved draft ---------- */

/**
 * Turn the editor's state into the print engine's neutral document.
 *
 * This is what makes Preview honest: it renders what is on the screen right
 * now, not the last saved version. It goes through the same `PrintDoc` every
 * other document uses, so the sheet is produced by the same renderer, the
 * same paginator and the same totals block.
 *
 * The internal note is deliberately absent — it is the one field that must
 * never reach paper.
 */
export function draftPrintDoc(draft: QuotationDraft, config: PrintConfig): PrintDoc {
  const t = draftTotals(draft);
  const meta = config.metaFields
    .map((field) => ({
      field,
      label: META_LABELS[field]?.en ?? field,
      labelTH: META_LABELS[field]?.th ?? "",
      value: str(
        (
          {
            docNo: draft.code,
            docDate: toDisplayDate(draft.quoteDate),
            dueDate: toDisplayDate(draft.validUntil),
            customerCode: draft.customerCode,
            salesRep: draft.salesRep,
            payTerm: draft.payTerm,
            currency: draft.currency,
            reference: draft.customerRef,
            deliveryDate: toDisplayDate(draft.deliveryDate),
            warehouse: draft.warehouse,
          } as Record<string, string>
        )[field],
      ),
    }))
    .filter((r) => r.value);

  const lines: PrintLine[] = draft.items
    .filter((l) => str(l.code))
    .map((l, i) => {
      const base = num(l.qty) * num(l.price);
      const disc = base * (num(l.disc) / 100);
      return {
        no: i + 1,
        code: str(l.code),
        description: str(l.name),
        extraLines: [str(l.desc), str(l.note)].filter(Boolean),
        warehouse: "",
        location: "",
        bin: "",
        lot: str(l.lot),
        serial: str(l.serial),
        packageNo: "",
        qty: num(l.qty),
        requiredQty: 0,
        pickedQty: 0,
        weight: 0,
        uom: str(l.unit),
        unitPrice: num(l.price),
        discount: num(l.disc),
        netPrice: num(l.price) * (1 - num(l.disc) / 100),
        vatRate: num(l.tax),
        amount: base - disc,
      };
    });

  return {
    entity: "quotation",
    code: draft.code,
    status: draft.status,
    statusTone: "info",
    date: toDisplayDate(draft.quoteDate),
    company: printCompany(),
    billTo: {
      name: draft.customer,
      code: draft.customerCode,
      address: draft.billAddress,
      taxId: draft.taxId,
      branch: "",
      phone: draft.billPhone,
      contact: draft.billContact,
    },
    shipTo: {
      name: draft.sameAsBill ? draft.customer : draft.shipName || draft.customer,
      code: draft.customerCode,
      address: draft.sameAsBill ? draft.billAddress : draft.shipAddress,
      taxId: "",
      branch: "",
      phone: draft.sameAsBill ? draft.billPhone : draft.shipPhone,
      contact: draft.sameAsBill ? draft.billContact : draft.shipContact,
      instruction: draft.sameAsBill ? "" : draft.shipInstruction,
    },
    meta,
    lines,
    totals: {
      subtotal: t.subtotal,
      lineDiscount: t.lineDiscount,
      headerDiscount: t.headerDiscount,
      freight: t.freight,
      otherCharges: t.otherCharges,
      netAmount: t.netAmount,
      vat: t.vat,
      withholding: 0,
      rounding: t.rounding,
      grandTotal: t.grandTotal,
      currency: draft.currency,
      amountInWords: bahtText(t.grandTotal),
    },
    bank: defaultBank(draft.code),
    /* Customer-visible remarks only. */
    remarks: str(draft.remarks)
      .split("\n")
      .map((r) => r.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean),
  };
}

/* ---------- Saving ---------- */

export interface SaveResult {
  code: string;
  created: boolean;
}

/**
 * Write the draft into the quotation store.
 *
 * `issue: false` parks a draft — same record, same number, status untouched.
 * There is exactly one record per quotation number, so autosave and Save Draft
 * update rather than pile up duplicates.
 */
export function saveQuotationDraft(
  draft: QuotationDraft,
  { issue = false, user = "Pimpaka S." }: { issue?: boolean; user?: string } = {},
): SaveResult {
  const now = stamp();
  const code = str(draft.code);
  const existing = QUOTATIONS.find((x) => x.code === code);

  const items = draft.items
    .filter((l) => str(l.code))
    .map((l) => ({
      code: str(l.code),
      name: str(l.name),
      unit: str(l.unit),
      qty: num(l.qty),
      price: num(l.price),
      disc: num(l.disc),
      tax: num(l.tax),
      /* The customer-facing line note. The internal note stays out of the
         record entirely, so it can never reach the printed sheet. */
      note: str(l.note),
    }));

  const patch = {
    customer: str(draft.customer),
    customerCode: str(draft.customerCode),
    salesRep: str(draft.salesRep),
    quoteDate: toDisplayDate(draft.quoteDate),
    validUntil: toDisplayDate(draft.validUntil),
    currency: str(draft.currency) || "THB",
    payTerm: str(draft.payTerm),
    priceList: str(draft.priceList),
    channel: str(draft.channel),
    customerRef: str(draft.customerRef),
    note: str(draft.remarks),
    items,
    updated: now,
    updatedBy: user,
  };

  if (existing) {
    Object.assign(existing, patch);
    (existing.history ??= []).unshift({
      t: issue ? "Quotation updated" : "Draft saved",
      d: issue ? "แก้ไขใบเสนอราคาจากตัวแก้ไขเอกสาร" : "บันทึกฉบับร่าง",
      u: user,
      when: now,
      kind: issue ? "primary" : "",
    });
    decorateQuotations();
    return { code, created: false };
  }

  QUOTATIONS.unshift({
    code,
    ...patch,
    status: "Draft",
    rejectReason: "",
    srRef: "",
    created: now,
    createdBy: user,
    history: [
      {
        t: issue ? "Created" : "Draft saved",
        d: issue ? "สร้างใบเสนอราคาจากตัวแก้ไขเอกสาร" : "บันทึกฉบับร่าง",
        u: user,
        when: now,
        kind: "primary",
      },
    ],
  } as unknown as QtRow);

  decorateQuotations();
  return { code, created: true };
}
