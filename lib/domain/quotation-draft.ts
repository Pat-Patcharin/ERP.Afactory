import { PAY_TERMS } from "@/data/partners";
import {
  QT_PRICE_LISTS,
  QT_VALIDITY_DAYS,
  isQuotationLocked,
  type Quotation,
} from "@/data/quotations";
import { docGrandTotal } from "./lines";
import { QUOTATIONS, decorateQuotations, nextQuotationCode, type QtRow } from "./outbound";
import {
  applyCustomerTo,
  applyShipToOn,
  blankLine,
  blankParty,
  docInsight,
  docTotals,
  validateLines,
  validateParty,
  type DocInsight,
  type DocTotals,
  type DraftIssue,
  type DraftLine,
  type PartyFields,
  type TermFields,
} from "./doc-draft";
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

/* The parts a quotation shares with every other sell-side document. Re-exported
   so a caller reads one module rather than two. */
export {
  DISCOUNT_THRESHOLD,
  applyProduct,
  blankLine,
  blockingIssues,
  lineAvailability,
  newLineId,
  productSearch,
  resolvePriceList,
  resolveRep,
  shipToChoices,
  warningIssues,
  type DraftIssue,
  type DraftLine,
  type ProductHit,
  type ShipToOption,
} from "./doc-draft";

export type DraftTotals = DocTotals;
export type DraftInsight = DocInsight;


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

/** Adopt the Business Partner master onto this quotation. */
export const applyCustomer = (draft: QuotationDraft, customerPick: string): QuotationDraft =>
  applyCustomerTo(draft, customerPick);

/** Pick one of the customer's other addresses without leaving the page. */
export const applyShipTo = (draft: QuotationDraft, label: string): QuotationDraft =>
  applyShipToOn(draft, label);

/* ---------- Derived ---------- */

/** Every figure the quotation shows, from the shared document maths. */
export const draftTotals = (draft: QuotationDraft): DraftTotals =>
  docTotals(draft.items, draft);

/** Grand total as the plain line maths reads it, before header charges. */
export const draftGrandTotal = (draft: QuotationDraft) =>
  docGrandTotal({
    items: draft.items
      .filter((l) => str(l.code))
      .map((l) => ({ qty: num(l.qty), price: num(l.price), disc: num(l.disc), tax: num(l.tax) })),
  });

/** Read-only customer context. Never any cost or margin. */
export const draftInsight = (draft: QuotationDraft): DraftInsight =>
  docInsight(draft.customerPick, draftTotals(draft).grandTotal, draft);

/* ---------- Validation ---------- */

/**
 * What a quotation cannot be issued without, and what is merely worth knowing.
 *
 * Blocking issues stop Save Quotation. Save Draft ignores them entirely — a
 * draft that cannot be parked is a draft the salesperson will keep in a
 * spreadsheet instead.
 *
 * The customer and line checks are shared with every sell-side document; only
 * the dates below are the quotation's own.
 */
export function validateDraft(draft: QuotationDraft): DraftIssue[] {
  const out: DraftIssue[] = [...validateParty(draft), ...validateLines(draft.items)];
  const block = (field: string, message: string) => out.push({ field, message, blocking: true });
  const warn = (field: string, message: string) => out.push({ field, message, blocking: false });

  if (!draft.salesRep) block("salesRep", "ยังไม่ได้เลือกพนักงานขาย");
  if (!draft.quoteDate) block("quoteDate", "ยังไม่ได้ระบุวันที่เอกสาร");
  if (!draft.validUntil) block("validUntil", "ยังไม่ได้ระบุวันยืนราคา");
  if (draft.quoteDate && draft.validUntil && draft.validUntil <= draft.quoteDate) {
    block("validUntil", "วันยืนราคาต้องอยู่หลังวันที่เอกสาร");
  }
  if (!draft.priceList) block("priceList", "ยังไม่ได้เลือกรายการราคา");
  if (!draft.currency) block("currency", "ยังไม่ได้เลือกสกุลเงิน");

  if (!draft.customerRef) warn("customerRef", "ยังไม่ได้ระบุเลขที่อ้างอิงของลูกค้า");

  const insight = draftInsight(draft);
  if (insight.found && !insight.withinLimit) {
    warn("credit", `เกินวงเงินเครดิต ${insight.overBy.toLocaleString("en-US")} บาท`);
  }

  return out;
}


/** Above this, a line discount needs a second look — warning, never a block. */

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
  /**
   * Why the write was refused, when it was. Absent on a successful save, so
   * existing callers that only read `code` and `created` are unaffected.
   */
  blocked?: string;
}

/**
 * Write the draft into the quotation store.
 *
 * `issue: false` parks a draft — same record, same number, status untouched.
 * There is exactly one record per quotation number, so autosave and Save Draft
 * update rather than pile up duplicates.
 *
 * A locked quotation is refused here rather than at the button. This is the
 * only place a quotation is written, so it is the only place the rule holds
 * for autosave, for a stale tab, and for the API this becomes later.
 */
export function saveQuotationDraft(
  draft: QuotationDraft,
  { issue = false, user = "Pimpaka S." }: { issue?: boolean; user?: string } = {},
): SaveResult {
  const now = stamp();
  const code = str(draft.code);
  const existing = QUOTATIONS.find((x) => x.code === code);

  /* Nothing is written past this point for a sealed quote — not the items,
     not the header, not the autosave. A brand new quotation has no existing
     record and so can never be blocked. */
  if (existing && isQuotationLocked(existing.status)) {
    return {
      code,
      created: false,
      blocked: `${code} อยู่ในสถานะ ${existing.status} — แก้ไขไม่ได้ ต้องกด "ขอแก้ไข" เพื่อเปิดใบกลับเป็นร่างก่อน`,
    };
  }

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
    approvalStatus: "Not Submitted",
    revision: 1,
    rejectReason: "",
    soRef: "",
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
