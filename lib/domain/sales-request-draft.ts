import { PAY_TERMS } from "@/data/partners";
import { displayName } from "./lines";
import {
  SR_CHANNELS,
  SR_PRICE_LISTS,
  SR_PRIORITY,
  type SalesRequest,
} from "@/data/sales-requests";
import {
  QUOTATIONS,
  SALES_REQUESTS,
  decorateSalesRequests,
  getQT,
  nextSalesRequestCode,
  type SrRow,
} from "./outbound";
import {
  applyCustomerTo,
  applyShipToOn,
  blankLine,
  blankParty,
  detailLines,
  docInsight,
  docTotals,
  joinDetails,
  lineExtras,
  validateLines,
  zeroTaxIfNonVat,
  validateParty,
  type DocInsight,
  type DocTotals,
  type DraftIssue,
  type DraftLine,
  type PartyFields,
  type TermFields,
} from "./doc-draft";
import { isoToDmy, dmyToIso, stamp, today } from "@/lib/format";
import { META_LABELS } from "@/lib/print/config";
import { defaultBank, printCompany } from "@/lib/print/mapper";
import { bahtText } from "@/lib/print/words";
import type { PrintConfig, PrintDoc, PrintLine } from "@/lib/print/types";

/* ============================================================
   SALES REQUEST DRAFT

   Same document editor as the quotation, different document.

   A sales request is INTERNAL: it records what a customer asked
   for and carries it through approval. So it has no validity
   window and no customer signature — it has a required date, a
   priority, a warehouse and an approver.

   Everything a sell-side document shares — customer, lines,
   totals, credit — comes from doc-draft.ts, so this file only
   describes what makes a request a request.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? "").trim();

/* The parts shared with every other sell-side document, re-exported so a
   caller reads one module rather than two. */
export {
  DISCOUNT_THRESHOLD,
  applyBillType,
  applyProduct,
  applyProductForCustomer,
  planBillTypeChange,
  type BillTypeChangePlan,
  blankLine,
  blockingIssues,
  detailLines,
  joinDetails,
  lineAvailability,
  productSearch,
  resolvePriceList,
  resolveRep,
  shipToChoices,
  standardLinePrice,
  warningIssues,
  type DraftIssue,
  type DraftLine,
  type StandardPrice,
} from "./doc-draft";

export type SrTotals = DocTotals;
export type SrInsight = DocInsight;

export interface SalesRequestDraft extends PartyFields, TermFields {
  mode: "create" | "edit";
  code: string;
  status: string;

  /* What makes it a request: when the goods are needed, how urgent,
     and which warehouse is expected to serve it. */
  requestDate: string;
  requiredDate: string;
  priority: string;
  warehouse: string;

  /** The quotation this request came from. Empty when the customer rang up. */
  quotationRef: string;

  customerRef: string;
  currency: string;
  /* `internalRef` was here. Removed at A2b: the editor collected it and
     no save path ever wrote it, so it had been taking typing and dropping
     it since the day it was added — the same reason `warehouse` and this
     field were already dropped from the quotation's meta rows. Do not add
     it back without a record field and something that reads it. */

  items: DraftLine[];

  headerDisc: number | "";
  freight: number | "";
  otherCharges: number | "";

  /** Printed under the item table. */
  remarks: string;
  /** Saved as of A2b, and still never printed — held by tests/internal-note.test.ts. */
  internalNote: string;
}

/* ---------- Defaults ---------- */

export const DEFAULT_SR_REMARKS = [
  "คำขอขายนี้ยังไม่ผูกมัดและไม่จองสินค้า — การจองเกิดขึ้นเมื่อยืนยันใบสั่งขาย",
  "กรุณาตรวจสอบจำนวนและวันที่ลูกค้าต้องการก่อนส่งอนุมัติ",
].join("\n");

/** How many days ahead the customer usually needs the goods. */
export const SR_LEAD_DAYS = 7;

export function defaultRequiredDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + SR_LEAD_DAYS);
  return d.toISOString().slice(0, 10);
}

export function blankSrDraft(): SalesRequestDraft {
  return {
    ...blankParty(),
    mode: "create",
    code: nextSalesRequestCode(),
    status: "Draft",
    requestDate: dmyToIso(today()),
    requiredDate: defaultRequiredDate(),
    priority: "Normal",
    warehouse: "",
    quotationRef: "",
    customerRef: "",
    salesRep: "",
    priceList: SR_PRICE_LISTS[0],
    currency: "THB",
    payTerm: PAY_TERMS[0] ?? "เครดิต 30 วัน",
    channel: "Direct",
    /* Replaced by the customer's own billType as soon as one is picked. */
    billType: "VAT",
    items: [blankLine()],
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    remarks: DEFAULT_SR_REMARKS,
    internalNote: "",
  };
}

/**
 * Open an existing request in the editor.
 *
 * The record names a customer; the addresses come from the partner master,
 * exactly as the print mapper reads them.
 */
export function draftFromSalesRequest(r: SalesRequest): SalesRequestDraft {
  const pick = `${r.customerCode} - ${r.customer}`;
  const draft: SalesRequestDraft = {
    ...blankSrDraft(),
    mode: "edit",
    code: r.code,
    status: r.status,
    customerPick: pick,
    customerCode: r.customerCode,
    customer: r.customer,
    requestDate: dmyToIso(r.requestDate),
    requiredDate: dmyToIso(r.requiredDate),
    priority: r.priority,
    warehouse: r.warehouse,
    quotationRef: r.quotationRef,
    /* Recovered, not reset — see the note in draftFromQuotation. */
    headerDisc: r.headerDisc,
    freight: r.freight,
    otherCharges: r.otherCharges,
    customerRef: r.customerRef,
    salesRep: r.salesRep,
    priceList: r.priceList,
    currency: r.currency,
    payTerm: r.payTerm,
    channel: r.channel,
    billType: r.billType,
    remarks: r.note || DEFAULT_SR_REMARKS,
    items: (r.items ?? []).map((it) => ({
      ...blankLine(),
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      disc: it.disc,
      tax: it.tax,
      /* The record's one note field is the editor's list of detail rows.
         `note` itself stays blank on the draft so the two cannot disagree —
         saveSalesRequestDraft writes it back from `details`. Same shape as
         draftFromQuotation, deliberately. */
      details: detailLines(it.note ?? ""),
      customName: it.customName ?? "",
      showOnBill: it.showOnBill !== false,
    })),
  };
  if (!draft.items.length) draft.items = [blankLine()];

  /* Master first, the document's own ship-to on top — see the same lines in
     draftFromQuotation for why the order matters. */
  return {
    ...applyCustomerTo(draft, pick),
    sameAsBill: r.sameAsBill,
    shipName: r.shipName,
    shipAddress: r.shipAddress,
    shipContact: r.shipContact,
    shipPhone: r.shipPhone,
    shipInstruction: r.shipInstruction,
    internalNote: r.internalNote,
  };
}

/* ---------- Customer and source quotation ---------- */

export const applyCustomer = (draft: SalesRequestDraft, customerPick: string) =>
  applyCustomerTo(draft, customerPick);

export const applyShipTo = (draft: SalesRequestDraft, label: string) =>
  applyShipToOn(draft, label);

/**
 * Adopt an accepted quotation.
 *
 * This is the whole reason a quotation exists: the customer agreed a price, so
 * the request that follows must carry exactly those lines and those terms. The
 * salesperson may still edit afterwards — the point is that they do not have
 * to retype it.
 */
export function applyQuotation(draft: SalesRequestDraft, quotationRef: string): SalesRequestDraft {
  const qt = getQT(str(quotationRef));
  if (!qt) return { ...draft, quotationRef };

  /* Load the customer FIRST — addresses and contacts come from the master —
     then lay the quotation's own terms on top. The quotation is what the
     customer agreed to; the master is only what they usually get. */
  const withCustomer = applyCustomerTo(draft, `${qt.customerCode} - ${qt.customer}`);

  const next: SalesRequestDraft = {
    ...withCustomer,
    quotationRef: qt.code,
    salesRep: qt.salesRep,
    currency: qt.currency,
    payTerm: qt.payTerm,
    priceList: qt.priceList,
    channel: qt.channel,
    /* The quotation decides how it is billed; the request inherits it rather
       than re-deriving from the customer, who may have changed since. */
    billType: qt.billType,
    customerRef: qt.customerRef,
    /* The charges are part of what was agreed, not decoration on the sheet.
       A1 gave all three documents somewhere to keep them and this conversion
       still built the request without them, so a quotation for 5,834 became a
       request for 5,350 and nothing on either screen looked wrong. */
    headerDisc: qt.headerDisc,
    freight: qt.freight,
    otherCharges: qt.otherCharges,
    /* And where the customer asked for it to go. `applyCustomerTo` above has
       just filled these from the partner master; the quotation's own answer
       replaces it, because a one-off delivery address is agreed on the quote
       and would otherwise be forgotten between the quote and the order. */
    sameAsBill: qt.sameAsBill,
    shipName: qt.shipName,
    shipAddress: qt.shipAddress,
    shipContact: qt.shipContact,
    shipPhone: qt.shipPhone,
    shipInstruction: qt.shipInstruction,
    /* The internal note is the salesperson's own working memory about this
       deal — "ลูกค้าต่อราคาหนัก อย่าลดเกิน 10%" — and the request is where
       the deal continues. It goes across; it still never prints. */
    internalNote: qt.internalNote,
    /**
     * The date the customer was promised, when the quotation promised one.
     *
     * The fallback is the day the price stops standing, which is what this
     * always used — a reasonable stand-in while the quotation had nowhere to
     * record a delivery date, and wrong whenever the two differ. A quote
     * valid for 30 days that promised delivery next Tuesday produced a
     * request due in 30 days.
     */
    requiredDate: dmyToIso(qt.deliveryDate || qt.validUntil),
    items: (qt.items ?? []).map((it) => ({
      ...blankLine(),
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      disc: it.disc,
      tax: it.tax,
      /* Detail rows, not a note — the quotation stored them joined into its
         one note field, and the editor works in rows. */
      details: detailLines(it.note ?? ""),
      customName: it.customName ?? "",
      showOnBill: it.showOnBill !== false,
    })),
  };
  if (!next.items.length) next.items = [blankLine()];

  return next;
}

/** Quotations that may still be turned into a request. */
export function quotationChoices(customerCode = ""): string[] {
  /* Read at call time, not at load time: the store is mutable mock state and
     a quotation accepted a moment ago must appear here. */
  /* `soRef` too: a quote that already became an order directly must not be
     offered here, or the same quotation would produce two documents. */
  return QUOTATIONS.filter(
    (q) => ["Draft", "Sent", "Accepted"].includes(q.status) && !q.srRef && !q.soRef,
  )
    .filter((q) => !customerCode || q.customerCode === customerCode)
    .map((q) => q.code);
}

/* ---------- Derived ---------- */

export const srTotals = (draft: SalesRequestDraft): SrTotals => docTotals(draft.items, draft);

export const srInsight = (draft: SalesRequestDraft): SrInsight =>
  docInsight(draft.customerPick, srTotals(draft).grandTotal, draft, draft.items);

/* ---------- Validation ---------- */

/**
 * What a request cannot be submitted without.
 *
 * Save Draft ignores all of it. Submit for Approval is the gate — a request
 * that reaches an approver with a missing warehouse or an impossible date
 * wastes the approver's time, not the salesperson's.
 */
export function validateSrDraft(draft: SalesRequestDraft): DraftIssue[] {
  const out: DraftIssue[] = [...validateParty(draft), ...validateLines(draft.items)];
  const block = (field: string, message: string) => out.push({ field, message, blocking: true });
  const warn = (field: string, message: string) => out.push({ field, message, blocking: false });

  if (!draft.salesRep) block("salesRep", "ยังไม่ได้เลือกพนักงานขาย");
  if (!draft.requestDate) block("requestDate", "ยังไม่ได้ระบุวันที่ขอ");
  if (!draft.requiredDate) block("requiredDate", "ยังไม่ได้ระบุวันที่ลูกค้าต้องการ");
  if (draft.requestDate && draft.requiredDate && draft.requiredDate < draft.requestDate) {
    block("requiredDate", "วันที่ลูกค้าต้องการต้องไม่อยู่ก่อนวันที่ขอ");
  }
  if (!draft.priority) block("priority", "ยังไม่ได้ระบุความเร่งด่วน");
  if (!draft.warehouse) block("warehouse", "ยังไม่ได้เลือกคลังที่จะจ่ายของ");
  if (!draft.priceList) block("priceList", "ยังไม่ได้เลือกรายการราคา");
  if (!draft.currency) block("currency", "ยังไม่ได้เลือกสกุลเงิน");

  /* A quotation belongs to one customer; pointing at someone else's is a
     mistake worth stopping, not a note worth making. */
  if (draft.quotationRef) {
    const qt = getQT(draft.quotationRef);
    if (!qt) {
      block("quotationRef", `ไม่พบใบเสนอราคา ${draft.quotationRef}`);
    } else if (draft.customerCode && qt.customerCode !== draft.customerCode) {
      block("quotationRef", "ใบเสนอราคาที่อ้างอิงเป็นของลูกค้ารายอื่น");
    }
  }

  if (!draft.customerRef) warn("customerRef", "ยังไม่ได้ระบุเลขที่อ้างอิงของลูกค้า");

  const insight = srInsight(draft);
  if (insight.found && !insight.withinLimit) {
    warn("credit", `เกินวงเงินเครดิต ${insight.overBy.toLocaleString("en-US")} บาท`);
  }

  return out;
}

/* ---------- Printing an unsaved draft ---------- */

/**
 * Turn the editor's state into the print engine's neutral document, so
 * Preview shows what is on screen rather than the last saved version.
 *
 * The internal note is deliberately absent — it is the one field that must
 * never reach paper.
 */
export function srPrintDoc(draft: SalesRequestDraft, config: PrintConfig): PrintDoc {
  const t = srTotals(draft);
  const values: Record<string, string> = {
    docNo: draft.code,
    docDate: isoToDmy(draft.requestDate),
    deliveryDate: isoToDmy(draft.requiredDate),
    customerCode: draft.customerCode,
    salesRep: draft.salesRep,
    quotationNo: draft.quotationRef,
    payTerm: draft.payTerm,
    currency: draft.currency,
    warehouse: draft.warehouse,
    reference: draft.customerRef,
  };

  const meta = config.metaFields
    .map((field) => ({
      field,
      label: META_LABELS[field]?.en ?? field,
      labelTH: META_LABELS[field]?.th ?? "",
      value: str(values[field]),
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
        /* Always the salesperson's own wording, and always the detail rows.
           `showOnBill` decides what a CUSTOMER sees, and a sales request is
           internal — hiding a line's wording from the approver would hide
           exactly the thing they are being asked to approve. */
        description: displayName(l),
        extraLines: lineExtras(l),
        warehouse: draft.warehouse,
        location: "",
        bin: "",
        lot: str(l.lot),
        serial: str(l.serial),
        packageNo: "",
        qty: num(l.qty),
        requiredQty: num(l.qty),
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
    entity: "sales-request",
    code: draft.code,
    status: draft.status,
    statusTone: "info",
    date: isoToDmy(draft.requestDate),
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
    remarks: str(draft.remarks)
      .split("\n")
      .map((r) => r.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean),
  };
}

/* ---------- Saving ---------- */

export interface SrSaveResult {
  code: string;
  created: boolean;
}

/**
 * Write the draft into the sales request store.
 *
 * `submit: false` parks a draft — same record, same number, status untouched.
 * There is exactly one record per request number, so Save Draft and autosave
 * update rather than pile up duplicates.
 *
 * Submitting a request built from a quotation closes that quotation, which is
 * the one side effect the old wizard had and the one worth keeping.
 */
export function saveSalesRequestDraft(
  draft: SalesRequestDraft,
  { submit = false, user = "Pimpaka S." }: { submit?: boolean; user?: string } = {},
): SrSaveResult {
  const now = stamp();
  const code = str(draft.code);
  const existing = SALES_REQUESTS.find((x) => x.code === code);

  /* A Non VAT request carries no tax on any line — same rule as the
     quotation, enforced at the write rather than in the form. */
  const billType = str(draft.billType) || "VAT";
  const items = zeroTaxIfNonVat(billType, draft.items)
    .filter((l) => str(l.code))
    .map((l) => ({
      code: str(l.code),
      name: str(l.name),
      unit: str(l.unit),
      qty: num(l.qty),
      price: num(l.price),
      disc: num(l.disc),
      tax: num(l.tax),
      /* The customer-facing detail rows, back into the one field the record
         has. A request loaded from an older record has them in `note` and no
         `details` yet, so fall back to splitting it. */
      note: joinDetails(l.details.length ? l.details : detailLines(l.note)),
      customName: str(l.customName),
      showOnBill: l.showOnBill !== false,
    }));

  const patch = {
    quotationRef: str(draft.quotationRef),
    customer: str(draft.customer),
    customerCode: str(draft.customerCode),
    salesRep: str(draft.salesRep),
    requestDate: isoToDmy(draft.requestDate),
    requiredDate: isoToDmy(draft.requiredDate),
    priority: str(draft.priority) || "Normal",
    warehouse: str(draft.warehouse),
    currency: str(draft.currency) || "THB",
    payTerm: str(draft.payTerm),
    priceList: str(draft.priceList),
    channel: str(draft.channel),
    billType,
    customerRef: str(draft.customerRef),
    note: str(draft.remarks),
    /* In `patch`, so an edit rewrites them — see the note in the quotation. */
    headerDisc: num(draft.headerDisc),
    freight: num(draft.freight),
    otherCharges: num(draft.otherCharges),
    /* Where the goods go, and what the driver has to know. Same reasoning as
       the quotation, and this is the document the order is raised from. */
    sameAsBill: draft.sameAsBill !== false,
    shipName: str(draft.shipName),
    shipAddress: str(draft.shipAddress),
    shipContact: str(draft.shipContact),
    shipPhone: str(draft.shipPhone),
    shipInstruction: str(draft.shipInstruction),
    /* Stored, and stays off the paper — see the note on the record. */
    internalNote: str(draft.internalNote),
    items,
    updated: now,
    updatedBy: user,
  };

  if (existing) {
    Object.assign(existing, patch);
    (existing.history ??= []).unshift({
      t: submit ? "Sales request updated" : "Draft saved",
      d: submit ? "แก้ไขคำขอขายจากตัวแก้ไขเอกสาร" : "บันทึกฉบับร่าง",
      u: user,
      when: now,
      kind: submit ? "primary" : "",
    });
    decorateSalesRequests();
    return { code, created: false };
  }

  /* Typed as the record before the cast — see the note in the quotation for
     why `as unknown as` was hiding missing fields rather than bridging them. */
  const fresh: SalesRequest = {
    code,
    ...patch,
    /* Approval is a deliberate step — a new request always starts as Draft. */
    status: "Draft",
    approvedBy: "",
    approvedDate: "",
    rejectReason: "",
    /* Neither is judged until the request is submitted — see srSubmit. */
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
    soRef: "",
    created: now,
    createdBy: user,
    history: [
      {
        t: patch.quotationRef ? `Created from ${patch.quotationRef}` : "Created",
        d: patch.quotationRef
          ? "สร้างคำขอขายจากใบเสนอราคาที่ลูกค้าตอบรับ"
          : "สร้างคำขอขายจากตัวแก้ไขเอกสาร",
        u: user,
        when: now,
        kind: "primary",
      },
    ],
  };
  SALES_REQUESTS.unshift(fresh as SrRow);

  /* Close the loop on the quotation this request came from. */
  const qt = getQT(patch.quotationRef);
  if (qt && !qt.srRef) {
    qt.srRef = code;
    qt.status = "Converted";
    qt.updated = now;
  }

  decorateSalesRequests();
  return { code, created: true };
}

export const SR_PRIORITIES = SR_PRIORITY;
export const SR_CHANNEL_OPTIONS = SR_CHANNELS;
export const SR_PRICE_LIST_OPTIONS = SR_PRICE_LISTS;
