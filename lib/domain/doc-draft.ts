import { COMPANY } from "@/data/admin";
import { PAY_TERMS } from "@/data/partners";
import { QT_CHANNELS, QT_PRICE_LISTS } from "@/data/quotations";
import { PRODUCTS, productStock } from "./product";
import { priceMasterByProduct } from "./price-master";
import { checkQuotedPrice } from "./pricing-master";
import { addressLine, bpBillingAddress, bpDeliveryAddress } from "./partner";
import { docDiscTotal, docSubtotal, docTaxTotal } from "./lines";
import { creditCheck, getCustomer, salesRepOptions } from "./outbound";
import {
  TIER_TH,
  resolveCustomerPrice,
  tierForPartner,
  tierNotices,
  type TierNotice,
} from "./price-tier";
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
  /**
   * The extra description lines printed under the item, one per entry.
   *
   * The record keeps them in the single `note` field it has always had,
   * newline separated — see detailLines / joinDetails. The editor holds them
   * as a list because a list is what the salesperson is editing, and because
   * an empty row being typed into must survive until they finish typing.
   */
  details: string[];
  /** Salesperson's own name for the line. Blank falls back to `name`. */
  customName: string;
  /** Whether customName and note reach customer-facing paper. */
  showOnBill: boolean;
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
  details: [],
  customName: "",
  /* On by default: a salesperson who bothers to rename a line means the
     customer to read it. Hiding it is the deliberate act. */
  showOnBill: true,
});

/** Above this, a line discount needs a second look — a warning, never a block. */
export const DISCOUNT_THRESHOLD = 30;

/* ---------- Extra description lines ---------- */

/**
 * The stored note, read back as the list of lines it holds.
 *
 * The print mapper splits a note on the same characters, so three rows typed
 * into the editor come out as three rows on paper. Blank entries are dropped:
 * this is the reading side, and nothing prints an empty line.
 */
export const detailLines = (note: string): string[] =>
  String(note ?? "")
    .split(/\s*\|\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The list, written back into the one field the record has.
 *
 * A row still being typed can hold a pipe or a newline pasted in from
 * somewhere else; both are separators here, so they are flattened rather
 * than allowed to split one detail into two.
 */
export const joinDetails = (rows: readonly string[]): string =>
  rows
    .map((r) => String(r ?? "").replace(/[\r\n|]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/**
 * The extra lines an item prints under its name.
 *
 * The editor holds them as `details`; a line that arrived from a conversion
 * still carries them newline-joined in `note`. Reading both means neither a
 * converted document nor a typed one loses what was written under the item.
 *
 * Lives here rather than in one document's module because every sell-side
 * preview needs the same answer, and two copies would drift.
 */
export const lineExtras = (l: DraftLine): string[] =>
  detailLines(
    [String(l.desc ?? "").trim(), l.details.length ? joinDetails(l.details) : String(l.note ?? "").trim()]
      .filter(Boolean)
      .join("\n"),
  );

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
  /**
   * "VAT" or "Non VAT", defaulted from the customer. Not editable on the
   * document yet — the toggle and its recalculation are step 8b.
   */
  billType: string;
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

  /**
   * How this customer is billed. Unlike the terms above there is no older
   * value space to guard against — `billType` is derived on the partner
   * itself from `tax.vatReg`, so it is always one of the two the document
   * understands.
   *
   * A customer who is not VAT registered gets a document with no tax on any
   * line; `zeroTaxIfNonVat` below is what enforces that, so a line typed with
   * tax 7 cannot survive onto a Non VAT document.
   */
  if (bp.billType) next.billType = bp.billType;

  return next;
}

/**
 * Flatten the tax on every line of a Non VAT document.
 *
 * Called wherever a document's lines are written, rather than trusted to the
 * form: the rule is about what the document IS, and a line arriving from a
 * conversion or an import never passed through a form at all.
 */
export function zeroTaxIfNonVat<T extends { tax?: number | "" }>(
  billType: string,
  lines: T[],
): T[] {
  if (billType !== "Non VAT") return lines;
  return lines.map((l) => ({ ...l, tax: 0 }));
}

/* ============================================================
   WHO HAS TO SIGN THIS PRICE OFF

   CLAUDE.md states the rule as iron: nothing is sold below
   `price_last` without approval. `checkQuotedPrice()` in
   pricing-master.ts has always implemented it — and until now
   nothing called it, so the rule lived in a document rather than
   in the software. This is the wrapper that connects them.

   No pricing rule is restated here. Every verdict comes from
   `checkQuotedPrice`; this decides only who must sign, and it is
   the single place all three editing surfaces ask.

   The price compared is the NET unit price, after the line
   discount. Comparing the list price would make the rule
   meaningless: quote high, discount 60%, and the floor is never
   breached on paper.
   ============================================================ */

/**
 * Who has to sign.
 *
 * `admin` is the ordinary case — every quotation goes through approval
 * regardless of price, so there is no "nobody". `manager` is the escalation:
 * a price the ordinary approver may not wave through on their own.
 */
export type PriceApprovalLevel = "admin" | "manager";

/** One line the approver needs to look at, and why. */
export interface PriceApprovalLine {
  code: string;
  name: string;
  /** Net unit price after the line discount — what was actually checked. */
  quoted: number;
  /** `price_last` from the price master, when the row has one. */
  floor: number | null;
  /** Gross profit rate at the quoted price, as a decimal. */
  gp: number | null;
  /** Messages straight from checkQuotedPrice, not re-worded. */
  reasons: string[];
}

export interface PriceApproval {
  /** The lowest authority that may approve this document as it stands. */
  level: PriceApprovalLevel;
  /** Lines below the floor or under the GP threshold — a manager decides. */
  flagged: PriceApprovalLine[];
  /**
   * Lines whose product has no cost recorded. These stop the document being
   * submitted at all: approving a price whose cost is unknown is approving
   * with no information, and CLAUDE.md puts PENDING_COST behind a sales block
   * rather than an approval.
   */
  noCost: PriceApprovalLine[];
  /**
   * Lines with no row in the price master — a new product, or one of the
   * rows that never had a code. Not blocked, because refusing would make new
   * products unsellable, but carried onto the document so the approver knows
   * how much of it the system could not check.
   */
  uncheckable: PriceApprovalLine[];
}

/** Net unit price: what the customer pays per unit once the discount is off. */
const netUnitPrice = (l: PlanLine): number =>
  num(l.price) * (1 - num(l.disc) / 100);

/**
 * What this document's prices need before it can go out.
 *
 * Called by the quotation editor, the sales request editor and the sales
 * order form — all three read this, none of them works it out.
 */
export function priceApproval(items: readonly PlanLine[]): PriceApproval {
  const flagged: PriceApprovalLine[] = [];
  const noCost: PriceApprovalLine[] = [];
  const uncheckable: PriceApprovalLine[] = [];

  for (const l of items) {
    const code = str(l.code);
    if (!code) continue;

    const quoted = netUnitPrice(l);
    const base = { code, name: str(l.name), quoted };

    /* A product code can name more than one row — five are duplicated in the
       master — so prefer a sellable one, exactly as resolveCustomerPrice does. */
    const candidates = priceMasterByProduct(code);
    const row = candidates.find((r) => r.status === "OK") ?? candidates[0] ?? null;

    if (!row) {
      uncheckable.push({ ...base, floor: null, gp: null, reasons: ["ไม่มีราคากลางสำหรับสินค้านี้"] });
      continue;
    }

    const verdict = checkQuotedPrice(row, quoted);
    const line = {
      ...base,
      floor: row.price_last,
      gp: verdict.gp,
      reasons: verdict.violations.map((v) => v.message),
    };

    /* PR-06 is the no-cost case and is a different kind of problem: it is not
       that the price is too low, it is that nobody can tell. */
    if (verdict.violations.some((v) => v.rule === "PR-06")) noCost.push(line);
    else if (verdict.requiresApproval) flagged.push(line);
  }

  return {
    level: flagged.length ? "manager" : "admin",
    flagged,
    noCost,
    uncheckable,
  };
}

/* ============================================================
   CHANGING HOW A DOCUMENT IS BILLED

   Flipping VAT ⇄ Non VAT rewrites the tax on every line, so it
   is never done silently. Everything needed to warn about it —
   which lines change, by how much, and what the total becomes —
   is computed here, once.

   No surface may work any of this out for itself. The quotation
   editor, the sales request editor and the sales order form each
   read the same plan, so the figures a salesperson is shown
   before they commit cannot differ between the three screens.
   ============================================================ */

/** The rate a taxable line carries unless someone deliberately changed it. */
export const STANDARD_VAT_RATE = COMPANY.vatRate;

/** One line whose tax the change would overwrite. */
export interface BillTypeLineChange {
  code: string;
  name: string;
  from: number;
  to: number;
}

export interface BillTypeChangePlan {
  from: string;
  to: string;
  /** Priced lines on the document — the count the confirm button quotes. */
  lineCount: number;
  /**
   * Lines carrying a rate that is neither the standard one nor the one the
   * change is heading for. These are the dangerous ones: a product set to 0%
   * because it is tax-exempt looks identical to one nobody has touched, and
   * switching to VAT would quietly start charging it.
   */
  overwritten: BillTypeLineChange[];
  before: DocTotals;
  after: DocTotals;
  /** after − before. Negative when the change makes the document cheaper. */
  delta: number;
}

/**
 * The little a line has to expose to be planned over.
 *
 * Deliberately looser than `DraftLine`: the sales order form holds grid rows
 * and the stored record holds `SoLine`, and both must be able to ask the same
 * question without first converting into an editor's shape.
 */
export interface PlanLine {
  code?: string;
  name?: string;
  qty?: number | "";
  price?: number | "";
  disc?: number | "";
  tax?: number | "";
}

/** Whatever shape came in, as the lines the shared totals maths expects. */
const asDraftLines = (items: readonly PlanLine[]): DraftLine[] =>
  items.map((l) => ({
    ...blankLine(),
    code: str(l.code),
    name: str(l.name),
    qty: num(l.qty),
    price: num(l.price),
    disc: num(l.disc),
    tax: num(l.tax),
  }));

/**
 * What flipping a document's bill type would do.
 *
 * Returns null when there is nothing to decide — the value is unchanged, or
 * there are no priced lines yet, in which case the switch is free and asking
 * would be noise.
 */
export function planBillTypeChange(
  doc: ChargeFields & { items: readonly PlanLine[]; billType: string },
  to: string,
): BillTypeChangePlan | null {
  const from = str(doc.billType) || "VAT";
  if (to === from) return null;

  const priced = asDraftLines(doc.items.filter((l) => str(l.code)));
  if (!priced.length) return null;

  const target = to === "Non VAT" ? 0 : STANDARD_VAT_RATE;
  const next = priced.map((l) => ({ ...l, tax: target }));

  /* A line already sitting on the target rate is not being overwritten, and
     neither is one on the rate this document is supposed to carry. What is
     left is the deliberate exception. */
  const expected = from === "Non VAT" ? 0 : STANDARD_VAT_RATE;
  const overwritten = priced
    .filter((l) => num(l.tax) !== expected && num(l.tax) !== target)
    .map((l) => ({ code: str(l.code), name: str(l.name), from: num(l.tax), to: target }));

  const before = docTotals(priced, doc);
  const after = docTotals(next, doc);

  return {
    from,
    to,
    lineCount: priced.length,
    overwritten,
    before,
    after,
    delta: after.grandTotal - before.grandTotal,
  };
}

/**
 * Apply the change. Every priced line takes the new document's rate.
 *
 * Blank lines keep whatever they hold — they carry no money and rewriting
 * them would only make an untouched row look edited.
 */
export function applyBillType<T extends { items: DraftLine[]; billType: string }>(
  draft: T,
  to: string,
): T {
  const next = str(to) || "VAT";
  const rate = next === "Non VAT" ? 0 : STANDARD_VAT_RATE;
  return {
    ...draft,
    billType: next,
    items: draft.items.map((l) => (str(l.code) ? { ...l, tax: rate } : l)),
  };
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

/** The catalogue price a line ought to carry, and where it came from. */
export interface StandardPrice {
  price: number;
  /** Which list answered — "ราคาเอกชน", "ราคา Dealer", … for the hint. */
  label: string;
  /** True when the price master had a row for this product at this tier. */
  fromPriceMaster: boolean;
}

/**
 * What this customer is supposed to pay for this product, before anyone
 * negotiates.
 *
 * The price master is asked first, through the same tier resolution the BP
 * record uses, so a dealer sees the dealer price rather than the catalogue
 * one. Products with no row there — most of the prototype's own records, whose
 * codes are in a different space from the 807 priced rows — fall back to the
 * product master's single price rather than showing nothing.
 *
 * Never the floor: `price_last` is what approval compares against, not a price
 * anybody is entitled to quote.
 */
export function standardLinePrice(customerPick: string, code: string): StandardPrice | null {
  const c = str(code);
  if (!c) return null;

  const bp = getCustomer(customerPick);
  if (bp) {
    const resolved = resolveCustomerPrice(bp, c);
    if (resolved.price !== null && resolved.price > 0) {
      return { price: resolved.price, label: resolved.tierLabel, fromPriceMaster: true };
    }
  }

  const p = PRODUCTS.find((x) => x.code === c);
  return p && p.price > 0
    ? { price: p.price, label: "ราคาตามแคตตาล็อก", fromPriceMaster: false }
    : null;
}

/**
 * Fill a line from the product master at this customer's own price.
 *
 * `applyProduct` knows nothing about who is buying, and must not: it is called
 * from conversions and imports that have no customer in hand. This is the
 * document's version of the same move — pick the product, then quote the tier
 * price rather than the catalogue one.
 *
 * A price already typed is still left alone. Whether it was negotiated is
 * decided before `applyProduct` runs, because that is the last moment the
 * answer is knowable.
 */
export function applyProductForCustomer(
  line: DraftLine,
  code: string,
  customerPick: string,
): DraftLine {
  const negotiated = num(line.price) > 0;
  const filled = applyProduct(line, code);
  if (negotiated) return filled;

  const std = standardLinePrice(customerPick, code);
  return std ? { ...filled, price: std.price } : filled;
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
  /**
   * Who has to sign these prices off, computed from the lines as they stand.
   *
   * Present so the salesperson learns it while typing rather than when the
   * document comes back rejected. Null when no lines were supplied.
   */
  priceApproval: PriceApproval | null;
}

/** Read-only context for the customer panel. Never any cost or margin. */
export function docInsight(
  customerPick: string,
  documentValue: number,
  fallback: TermFields,
  items: readonly PlanLine[] = [],
): DocInsight {
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
    priceApproval: items.length ? priceApproval(items) : null,
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
