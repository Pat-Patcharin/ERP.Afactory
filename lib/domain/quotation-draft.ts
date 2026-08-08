import { PAY_TERMS } from "@/data/partners";
import {
  QT_PRICE_LISTS,
  QT_VALIDITY_DAYS,
  isQuotationLocked,
  type Quotation,
} from "@/data/quotations";
import { billShows, displayName, docGrandTotal } from "./lines";
import { QUOTATIONS, decorateQuotations, nextQuotationCode, type QtRow } from "./outbound";
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
  newLineId,
  productSearch,
  resolvePriceList,
  resolveRep,
  shipToChoices,
  standardLinePrice,
  warningIssues,
  type DraftIssue,
  type DraftLine,
  type ProductHit,
  type ShipToOption,
  type StandardPrice,
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
  /**
   * How long the price stands, in days. The thing the salesperson decides.
   *
   * `validUntil` is worked out from this and the quote date — see
   * `validUntilFrom`. Storing the span rather than the date is what lets the
   * sheet read "ยืนราคา 30 วัน" instead of asking somebody to count forward
   * on a calendar, and it keeps the two in step when the quote date moves.
   */
  validDays: number;
  /** Derived from `quoteDate + validDays`. Never typed directly. */
  validUntil: string;
  customerRef: string;
  salesRep: string;
  priceList: string;
  currency: string;
  payTerm: string;
  channel: string;
  /** "VAT" or "Non VAT", from the customer. Editable in step 8b, not before. */
  billType: string;
  deliveryDate: string;

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

/**
 * Default validity: today plus the standard window.
 *
 * Delegates rather than counting again. It carried its own copy of the sum
 * until the span was introduced, and the two disagreed by a day in any
 * positive UTC offset — see the note in `validUntilFrom` about
 * `toISOString()`. One formula, called twice.
 */
export function defaultValidUntil(): string {
  return validUntilFrom(dmyToIso(today()), QT_VALIDITY_DAYS);
}

/** The spans a salesperson may pick. Four, so they fit as chips side by side. */
export const QT_VALID_DAY_OPTIONS = [30, 60, 90, 120] as const;

/**
 * Keep the derived date in step while somebody is typing.
 *
 * `saveQuotationDraft` derives it again on the way to the store — that is the
 * guarantee. This is only so the screen does not show yesterday's date after
 * the quote date moves. Two calls to one function, never two formulas.
 */
export function applyValidity(draft: QuotationDraft, patch: Partial<QuotationDraft>) {
  if (!("quoteDate" in patch) && !("validDays" in patch)) return null;
  const next = { ...draft, ...patch };
  return { ...next, validUntil: validUntilFrom(next.quoteDate, next.validDays) };
}

/**
 * The day the price stops standing.
 *
 * Derived, never typed. Called from `saveQuotationDraft` rather than only
 * from the form, because a quotation can reach the store without a form ever
 * being opened — a conversion, an import, a duplicate. A value computed only
 * where somebody is typing is a value that is wrong everywhere else.
 *
 * Both arguments come in as `yyyy-mm-dd`; the result is the same shape, so
 * the caller decides how to display it.
 */
export function validUntilFrom(quoteDate: string, validDays: number): string {
  const base = str(quoteDate);
  if (!base) return "";
  const days = Number(validDays);
  const d = new Date(`${base}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + (Number.isFinite(days) && days > 0 ? days : QT_VALIDITY_DAYS));
  /* Formatted from the LOCAL parts, never `toISOString()`. The date was
     parsed as local midnight, and converting it to UTC in a positive offset
     rolls it back to the previous day — a quotation issued in Bangkok would
     have stood one day less than the salesperson chose. */
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Read the span back off a saved quotation.
 *
 * Older records carry the two dates and no span, so editing one has to
 * recover the number to put a chip under. Snapped to the nearest offered
 * option when it lands between two — a quotation saved at 45 days shows 30
 * rather than an empty selection, and the salesperson can move it.
 */
export function validDaysFrom(quoteDate: string, validUntil: string): number {
  const a = new Date(`${str(quoteDate)}T00:00:00`);
  const b = new Date(`${str(validUntil)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return QT_VALIDITY_DAYS;
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (days <= 0) return QT_VALIDITY_DAYS;
  if (QT_VALID_DAY_OPTIONS.includes(days as never)) return days;
  return [...QT_VALID_DAY_OPTIONS].reduce((best, o) =>
    Math.abs(o - days) < Math.abs(best - days) ? o : best,
  );
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
    quoteDate: dmyToIso(today()),
    validDays: QT_VALIDITY_DAYS,
    validUntil: defaultValidUntil(),
    customerRef: "",
    salesRep: "",
    priceList: QT_PRICE_LISTS[0],
    currency: "THB",
    payTerm: PAY_TERMS[0] ?? "เครดิต 30 วัน",
    channel: "Direct",
    /* Replaced by the customer's own billType as soon as one is picked. */
    billType: "VAT",
    deliveryDate: "",
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
    quoteDate: dmyToIso(q.quoteDate),
    /* The record keeps the date; the editor works in spans. Recovered rather
       than defaulted, so reopening a 90-day quotation shows 90. */
    validDays: validDaysFrom(dmyToIso(q.quoteDate), dmyToIso(q.validUntil)),
    validUntil: dmyToIso(q.validUntil),
    customerRef: q.customerRef,
    salesRep: q.salesRep,
    priceList: q.priceList,
    currency: q.currency,
    payTerm: q.payTerm,
    channel: q.channel,
    billType: q.billType,
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
      /* The record's one note field is the editor's list of detail rows.
         `note` itself stays blank on the draft so the two cannot disagree —
         saveQuotationDraft writes it back from `details`. */
      details: detailLines(it.note ?? ""),
      customName: it.customName ?? "",
      showOnBill: it.showOnBill !== false,
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
  docInsight(draft.customerPick, draftTotals(draft).grandTotal, draft, draft.items);

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
            docDate: isoToDmy(draft.quoteDate),
            dueDate: isoToDmy(draft.validUntil),
            customerCode: draft.customerCode,
            salesRep: draft.salesRep,
            payTerm: draft.payTerm,
            currency: draft.currency,
            /* The customer's own PO or RFQ number. It stays on the printed
               sheet even though the input moved off the paper: this is the
               number their accounts team matches our invoice against. */
            reference: draft.customerRef,
            deliveryDate: isoToDmy(draft.deliveryDate),
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
      /* Same rule as the mapper that prints a saved quotation: a line the
         salesperson kept off the bill prints the catalogue name and none of
         their own wording. Preview would be a lie otherwise. */
      const hidden = !billShows(l);
      return {
        no: i + 1,
        code: str(l.code),
        description: hidden ? str(l.name) : displayName(l),
        extraLines: hidden ? [] : lineExtras(l),
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
    date: isoToDmy(draft.quoteDate),
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

  /* A Non VAT quotation carries no tax on any line, whoever typed them and
     whichever document they came from. Enforced here, at the write. */
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
         has. The document's internal note stays out entirely, so it can never
         reach the printed sheet. */
      note: joinDetails(l.details.length ? l.details : detailLines(l.note)),
      customName: str(l.customName),
      showOnBill: l.showOnBill !== false,
    }));

  const patch = {
    customer: str(draft.customer),
    customerCode: str(draft.customerCode),
    salesRep: str(draft.salesRep),
    quoteDate: isoToDmy(draft.quoteDate),
    /* Derived here, not copied from the draft. This is the one place every
       quotation passes through — the editor, a conversion, an import — so it
       is the only place the date and the span cannot drift apart. */
    validUntil: isoToDmy(validUntilFrom(draft.quoteDate, draft.validDays)),
    currency: str(draft.currency) || "THB",
    payTerm: str(draft.payTerm),
    priceList: str(draft.priceList),
    channel: str(draft.channel),
    billType,
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
    /* Decided at submission, not at creation — see qtSubmit. */
    priceApprovalLevel: "admin",
    uncheckedPriceLines: 0,
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
