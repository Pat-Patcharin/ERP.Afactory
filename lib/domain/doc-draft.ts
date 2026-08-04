import { PAY_TERMS } from "@/data/partners";
import { QT_CHANNELS, QT_PRICE_LISTS } from "@/data/quotations";
import { PRODUCTS, productStock } from "./product";
import { addressLine, bpBillingAddress, bpDeliveryAddress } from "./partner";
import { docDiscTotal, docSubtotal, docTaxTotal } from "./lines";
import { creditCheck, getCustomer, salesRepOptions } from "./outbound";
import { TIER_TH, tierForPartner, tierNotices, type TierNotice } from "./price-tier";
import { SALES_REPRESENTATIVES } from "./sales";
import { bpLatestSalesYear, bpSalesOrders } from "./partner-analytics";
import { SALES_INVOICES } from "./invoice";

/* ============================================================
   SELL-SIDE DOCUMENT DRAFT — the parts every outbound document
   editor shares.

   A quotation and a sales request name the same customer, price
   the same products with the same line maths and check the same
   credit. Only the header dates and the approval trail differ.

   So everything below is written once. A document-specific model
   (quotation-draft.ts, sales-request-draft.ts) adds its own
   fields and its own validation on top; nothing here knows which
   document it is serving.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? "").trim();

/* ---------- Lines ---------- */

export interface DraftLine {
  /** Stable key so React rows survive reordering and deletion. */
  id: string;
  code: string;
  name: string;
  /** Extra line printed under the item name. */
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

let rowSeq = 0;
export const newLineId = () => `docl-${++rowSeq}`;

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

/** Above this, a line discount needs a second look — a warning, never a block. */
export const DISCOUNT_THRESHOLD = 30;

/* ---------- Parties ---------- */

/** The customer half of any sell-side document. */
export interface PartyFields {
  customerPick: string;
  customerCode: string;
  customer: string;
  taxId: string;
  billAddress: string;
  billContact: string;
  billPhone: string;

  sameAsBill: boolean;
  shipAddressPick: string;
  shipName: string;
  shipAddress: string;
  shipContact: string;
  shipPhone: string;
  shipInstruction: string;
}

/** The commercial terms a customer carries onto a document. */
export interface TermFields {
  salesRep: string;
  priceList: string;
  payTerm: string;
  channel: string;
}

export const blankParty = (): PartyFields => ({
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
});

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
 * Returns a NEW draft: a customer change that half-applied would be worse than
 * one that did not apply at all. Only the fields that belong to the customer
 * are written; anything the user typed stays as typed.
 */
export function applyCustomerTo<T extends PartyFields & TermFields>(
  draft: T,
  customerPick: string,
): T {
  const bp = getCustomer(customerPick);
  if (!bp) return { ...draft, customerPick, customerCode: "", customer: "" };

  const billing = bpBillingAddress(bp);
  const delivery = bpDeliveryAddress(bp) ?? billing;
  const contact = bp.contacts?.find((c) => c.primary) ?? bp.contacts?.[0] ?? null;
  const contactName = contact ? `${contact.prefix}${contact.first} ${contact.last}`.trim() : "";

  const next: T = {
    ...draft,
    customerPick,
    customerCode: bp.code,
    customer: bp.nameTh || bp.nameEn,
    taxId: bp.tax?.taxId ?? "",
    billAddress: billing ? addressLine(billing) : "",
    billContact: contactName,
    billPhone: billing?.phone || contact?.phone || contact?.mobile || "",
    shipName: bp.nameTh || bp.nameEn,
    shipAddressPick: delivery
      ? `${delivery.name || delivery.type} — ${delivery.dist || delivery.prov}`.trim()
      : "",
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

/** Pick one of the customer's other addresses without leaving the page. */
export function applyShipToOn<T extends PartyFields>(draft: T, label: string): T {
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
  if (salesRepOptions().includes(value)) return value;

  const name = value.split(" - ").slice(1).join(" - ").trim();
  if (!name) return "";

  const rep = SALES_REPRESENTATIVES.find(
    (r) => r.status === "Active" && (`${r.first} ${r.last}`.trim() === name || r.nick === name),
  );
  return rep ? `${rep.code} - ${rep.first} ${rep.last}` : "";
}

/**
 * Match the partner's price group to a document price list.
 *
 * "Dealer 2569" and "PL-DEALER-2026 Dealer" are the same commercial list under
 * two naming conventions; the group name is the part that carries meaning.
 */
export function resolvePriceList(stored: string): string {
  const value = str(stored);
  if (!value) return "";
  if (QT_PRICE_LISTS.includes(value as never)) return value;

  const group = value.split(/\s+/)[0].toLowerCase();
  return QT_PRICE_LISTS.find((p) => p.toLowerCase().includes(group)) ?? "";
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

/** Product search for the item grid. */
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

/** Stock summary for the reference column. Neither document reserves stock. */
export function lineAvailability(code: string) {
  const st = productStock(str(code));
  return st ? { available: st.available, found: true } : { available: 0, found: false };
}

/* ---------- Totals ---------- */

export interface DocTotals {
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

export interface ChargeFields {
  headerDisc: number | "";
  freight: number | "";
  otherCharges: number | "";
}

/**
 * Every figure a document shows, from the shared line maths.
 *
 * The header discount is applied after the line discounts and before VAT, so a
 * quotation, the request it becomes and the order after that agree to the
 * satang. Nothing here is a second calculation engine — the per-line work is
 * lib/domain/lines.ts.
 */
export function docTotals(items: DraftLine[], charges: ChargeFields): DocTotals {
  const priced = items.filter((l) => str(l.code));
  const lines = priced.map((l) => ({
    qty: num(l.qty),
    price: num(l.price),
    disc: num(l.disc),
    tax: num(l.tax),
  }));

  const subtotal = docSubtotal({ items: lines });
  const lineDiscount = docDiscTotal({ items: lines });
  const afterLine = subtotal - lineDiscount;

  const headerDiscount = Math.min(num(charges.headerDisc), afterLine);
  const netAmount = afterLine - headerDiscount;

  /* VAT follows the goods, so a header discount reduces it proportionally.
     Freight and other charges are quoted VAT-inclusive in this prototype. */
  const lineTax = docTaxTotal({ items: lines });
  const vat = afterLine > 0 ? lineTax * (netAmount / afterLine) : 0;

  const freight = num(charges.freight);
  const otherCharges = num(charges.otherCharges);
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
    totalQty: lines.reduce((t, i) => t + i.qty, 0),
  };
}

/* ---------- Customer insight ---------- */

export interface DocInsight {
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
  /** ชั้นราคาที่ลูกค้ารายนี้ได้รับ — private / government / dealer */
  priceTier: string;
  priceTierLabel: string;
  /** ข้อสังเกตที่คนขายต้องเห็นตอนออกเอกสาร ไม่ใช่แค่ในหน้า BP */
  tierNotices: TierNotice[];
}

/** Read-only context for the customer panel. Never any cost or margin. */
export function docInsight(customerPick: string, documentValue: number, fallback: TermFields): DocInsight {
  const bp = getCustomer(customerPick);
  const credit = creditCheck(customerPick, documentValue);

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
    priceList: resolvePriceList(bp?.sales?.priceList ?? "") || fallback.priceList,
    payTerm: bp?.sales?.payTerm ?? fallback.payTerm,
    lastOrder: last?.code ?? "",
    lastOrderDate: last?.orderDate ?? "",
    lastInvoice: invoices[0]?.code ?? "",
    outstandingInvoices: invoices.filter((i) => i.paymentStatus !== "Paid").length,
    salesThisYear: year?.revenue ?? 0,
    priceTier: bp ? tierForPartner(bp) : "private",
    priceTierLabel: bp ? TIER_TH[tierForPartner(bp)] : TIER_TH.private,
    tierNotices: bp ? tierNotices(bp) : [],
  };
}

/* ---------- Validation ---------- */

export interface DraftIssue {
  /** Anchor id on the document, so the summary can scroll to the field. */
  field: string;
  message: string;
  blocking: boolean;
}

export const blockingIssues = (issues: DraftIssue[]) => issues.filter((i) => i.blocking);
export const warningIssues = (issues: DraftIssue[]) => issues.filter((i) => !i.blocking);

/**
 * The line-level checks every sell-side document makes.
 *
 * A document adds its own header rules; these are the ones that would be
 * wrong to state twice.
 */
export function validateLines(items: DraftLine[]): DraftIssue[] {
  const out: DraftIssue[] = [];
  const filled = items.filter((l) => str(l.code));

  if (!filled.length) {
    out.push({ field: "items", message: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด", blocking: true });
    return out;
  }

  for (const [i, l] of filled.entries()) {
    const at = `item-${l.id}`;
    const n = i + 1;
    if (!PRODUCTS.some((p) => p.code === str(l.code))) {
      out.push({ field: at, message: `บรรทัดที่ ${n}: ไม่พบรหัสสินค้า ${l.code} ในระบบ`, blocking: true });
      continue;
    }
    if (num(l.qty) <= 0) {
      out.push({ field: at, message: `บรรทัดที่ ${n}: จำนวนต้องมากกว่า 0`, blocking: true });
    }
    if (num(l.price) <= 0) {
      out.push({ field: at, message: `บรรทัดที่ ${n}: ราคาต่อหน่วยต้องมากกว่า 0`, blocking: true });
    }
    if (num(l.disc) < 0 || num(l.disc) > 100) {
      out.push({ field: at, message: `บรรทัดที่ ${n}: ส่วนลดต้องอยู่ระหว่าง 0–100%`, blocking: true });
    } else if (num(l.disc) > DISCOUNT_THRESHOLD) {
      out.push({
        field: at,
        message: `บรรทัดที่ ${n}: ส่วนลด ${num(l.disc)}% สูงกว่าเกณฑ์ปกติ ${DISCOUNT_THRESHOLD}%`,
        blocking: false,
      });
    }

    const stock = lineAvailability(str(l.code));
    if (stock.found && stock.available < num(l.qty)) {
      out.push({
        field: at,
        message: `บรรทัดที่ ${n}: คงเหลือ ${stock.available} น้อยกว่าที่ขอ — เอกสารนี้ไม่จองสต๊อก`,
        blocking: false,
      });
    }
  }

  return out;
}

/** The customer checks every sell-side document makes. */
export function validateParty(party: PartyFields): DraftIssue[] {
  const out: DraftIssue[] = [];
  const bp = getCustomer(party.customerPick);

  if (!party.customerPick) {
    out.push({ field: "customer", message: "ยังไม่ได้เลือกลูกค้า", blocking: true });
    return out;
  }
  if (!party.billAddress) {
    out.push({ field: "billAddress", message: "ไม่พบที่อยู่สำหรับออกบิล", blocking: true });
  }
  if (bp && bp.status === "Blocked") {
    out.push({ field: "customer", message: "ลูกค้ารายนี้อยู่ในสถานะ Blocked", blocking: true });
  }
  if (bp && !(bp.roles?.customer || bp.roles?.dealer)) {
    out.push({
      field: "customer",
      message: "คู่ค้ารายนี้ไม่มีบทบาท Customer หรือ Dealer",
      blocking: true,
    });
  }
  if (!party.shipAddress && !party.sameAsBill) {
    out.push({ field: "shipAddress", message: "ยังไม่ได้ระบุที่อยู่จัดส่ง", blocking: false });
  }
  if (!party.billPhone) {
    out.push({ field: "billPhone", message: "ไม่พบเบอร์โทรของลูกค้า", blocking: false });
  }

  return out;
}
