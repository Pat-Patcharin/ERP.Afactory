import {
  PR_DEPARTMENTS,
  PR_PRIORITY,
  PR_REQUESTERS,
  PURCHASE_REQUESTS as RAW_PR,
  type PurchaseRequest,
} from "@/data/purchase-requests";
import { PO_SUPPLIERS } from "./purchase";
import { nextPRCode } from "./purchase";
import { PRODUCTS, productStock } from "./product";
import {
  applyProduct,
  blankLine,
  docTotals,
  newLineId,
  validateLines,
  type DocTotals,
  type DraftIssue,
  type DraftLine,
} from "./doc-draft";
import { actingUserName } from "./admin";
import { stamp, isoToDmy, dmyToIso, today } from "@/lib/format";
import { warehouseOptions } from "./outbound";
import { META_LABELS, printCompany } from "@/lib/print";
import type { PrintConfig, PrintDoc, PrintLine } from "@/lib/print/types";

/* ============================================================
   PURCHASE REQUEST — the draft behind the document editor

   The buying side's opening document, and the mirror of
   sales-request-draft.ts on the other half of the business.

   What it deliberately does NOT carry, and why:

     no customer      nobody is being sold to
     no bill type     a request is not a tax document
     no credit check  the company's own money, not a customer's
     no price tier    the cost comes from the supplier, not a list

   Which is the whole reason it does not reuse `PartyFields`. The
   requester and the receiving warehouse look like Bill To and
   Ship To on screen and are not the same things underneath.
   ============================================================ */

const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v) || 0;

export const PURCHASE_REQUESTS = RAW_PR;

export interface PurchaseRequestDraft {
  code: string;
  status: string;
  mode: "create" | "edit";

  /* Requested by */
  dept: string;
  requester: string;
  needBy: string;
  requestDate: string;
  priority: string;

  /* Deliver to */
  warehouse: string;
  supplier: string;

  reason: string;
  items: DraftLine[];

  /* The charge fields `docTotals` reads, typed exactly as `ChargeFields` does
     — `number | ""` because an emptied input is a real state while somebody
     is typing. A request estimates and never negotiates freight, so these
     stay at zero and the totals panel is the only thing that reads them. */
  headerDisc: number | "";
  freight: number | "";
  otherCharges: number | "";
  rounding: number;
}

export const PR_DEPT_OPTIONS = PR_DEPARTMENTS;
export const PR_REQUESTER_OPTIONS = PR_REQUESTERS;
export const PR_PRIORITY_OPTIONS = PR_PRIORITY;
export const PR_SUPPLIER_OPTIONS = PO_SUPPLIERS;
export const PR_WAREHOUSE_OPTIONS = () => warehouseOptions();

export function blankPrDraft(): PurchaseRequestDraft {
  return {
    code: nextPRCode(),
    status: "Draft",
    mode: "create",
    dept: "",
    /* Defaulted to whoever is filling it in, because in practice that is who
       is asking. Still editable — a supervisor may raise one for somebody. */
    requester: PR_REQUESTERS.includes(actingUserName() as never) ? actingUserName() : "",
    needBy: "",
    requestDate: dmyToIso(today()),
    priority: "Normal",
    warehouse: "",
    supplier: "",
    reason: "",
    items: [blankLine()],
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    rounding: 0,
  };
}

export function draftFromPurchaseRequest(pr: PurchaseRequest): PurchaseRequestDraft {
  return {
    code: pr.code,
    status: pr.status,
    mode: "edit",
    dept: pr.dept,
    requester: pr.requester,
    needBy: dmyToIso(pr.needBy),
    requestDate: dmyToIso(pr.date),
    priority: pr.priority,
    warehouse: pr.warehouse,
    supplier: pr.supplier,
    reason: pr.note,
    items: (pr.items ?? []).map((it) => ({
      ...blankLine(),
      id: newLineId(),
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: num(it.qty),
      price: num(it.price),
      /* A request carries no tax: what the company will actually be charged
         is settled on the purchase order, against the supplier's own terms. */
      tax: 0,
      note: it.note,
    })),
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    rounding: 0,
  };
}

/* ============================================================
   WHAT A LINE OPENS AT

   The supplier's last cost, not the catalogue price.

   A purchase request asks the company to spend money, so the
   figure beside it has to be what the company expects to pay.
   The catalogue price is what the company CHARGES — putting that
   here would overstate every request by the whole margin and
   look entirely plausible while doing it. See the note on
   `applyProduct` in useDocumentEditor.ts for why this is a
   required decision rather than a default.
   ============================================================ */

export function applyProductForPurchase(line: DraftLine, code: string): DraftLine {
  const filled = applyProduct(line, code);
  /* A price already typed is the requester's own estimate and is left alone,
     the same courtesy the sell side gives a negotiated price. */
  if (num(line.price) > 0) return filled;

  const st = productStock(code);
  const cost = st?.lastCost ?? 0;
  return cost > 0 ? { ...filled, price: cost, tax: 0 } : { ...filled, tax: 0 };
}

/** The supplier this product was last bought from, offered as the suggestion. */
export function suggestedSupplierFor(items: readonly DraftLine[]): string {
  for (const l of items) {
    const p = PRODUCTS.find((x) => x.code === l.code);
    if (p?.supplier) return p.supplier;
  }
  return "";
}

/* ---------- Derived ---------- */

export const prTotals = (draft: PurchaseRequestDraft): DocTotals =>
  docTotals(draft.items, draft);

/* ---------- Validation ---------- */

export function validatePrDraft(draft: PurchaseRequestDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!str(draft.dept).trim())
    issues.push({ field: "dept", message: "ต้องระบุแผนกที่ขอ", blocking: true });
  if (!str(draft.requester).trim())
    issues.push({ field: "requester", message: "ต้องระบุผู้ขอ", blocking: true });
  if (!str(draft.needBy).trim())
    issues.push({ field: "needBy", message: "ต้องระบุวันที่ต้องการใช้", blocking: true });
  if (!str(draft.warehouse).trim())
    issues.push({ field: "warehouse", message: "ต้องระบุคลังที่รับของ", blocking: true });

  /* Wanted before it was asked for is a typo, not a rush order. */
  if (
    str(draft.needBy).trim() &&
    str(draft.requestDate).trim() &&
    draft.needBy < draft.requestDate
  ) {
    issues.push({
      field: "needBy",
      message: "วันที่ต้องการใช้อยู่ก่อนวันที่ขอ",
      blocking: true,
    });
  }

  issues.push(...validateLines(draft.items));

  /* Advice, never a refusal. A requester may know something the reorder point
     does not — a promotion, a customer order not yet in the system, a machine
     about to be serviced. See the P3 note: none of this blocks. */
  for (const l of draft.items) {
    const code = str(l.code).trim();
    if (!code) continue;
    const st = productStock(code);
    if (!st) continue;
    const qty = num(l.qty);
    if (qty > 0 && st.suggested > 0 && qty < st.suggested) {
      issues.push({
        field: `item-${l.id}`,
        message: `${code} — ขอ ${qty} น้อยกว่าที่แนะนำ ${st.suggested} ${st.unit} เพื่อให้ถึงระดับเป้าหมาย`,
        blocking: false,
      });
    }
  }

  return issues;
}

/* ============================================================
   THE PRINTED SHEET

   A purchase request is printed for one reason: to be signed and
   filed as the evidence that the spend was agreed. So the sheet
   carries the company header, the lines, the estimate and the
   signature block — and nothing that assumes a customer.

   `billTo` is filled with the REQUESTER, because the print
   engine's party block is where a document says who it concerns
   and on this document that is the department asking. The
   `shipTo` block is switched off in the config rather than
   filled with the warehouse: the warehouse is already a meta
   field, and a second address block would read as a delivery
   address the supplier should use, which it is not.
   ============================================================ */

export function prPrintDoc(draft: PurchaseRequestDraft, config: PrintConfig): PrintDoc {
  const t = prTotals(draft);

  const values: Record<string, string> = {
    docNo: draft.code,
    docDate: isoToDmy(draft.requestDate),
    deliveryDate: isoToDmy(draft.needBy),
    warehouse: draft.warehouse,
    currency: "THB",
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
    .filter((l) => str(l.code).trim())
    .map((l, i) => ({
      no: i + 1,
      code: str(l.code),
      description: str(l.name),
      extraLines: [],
      warehouse: draft.warehouse,
      location: "",
      bin: "",
      lot: "",
      serial: "",
      packageNo: "",
      qty: num(l.qty),
      requiredQty: num(l.qty),
      pickedQty: 0,
      weight: 0,
      uom: str(l.unit),
      unitPrice: num(l.price),
      discount: 0,
      netPrice: num(l.price),
      /* No tax on a request — settled on the purchase order. */
      vatRate: 0,
      amount: num(l.qty) * num(l.price),
    }));

  return {
    entity: "purchase-request",
    code: draft.code,
    status: draft.status,
    statusTone: "info",
    date: isoToDmy(draft.requestDate),
    company: printCompany(),
    billTo: {
      name: draft.dept ? `แผนก${draft.dept}` : "",
      code: "",
      address: draft.warehouse ? `รับของที่ ${draft.warehouse}` : "",
      taxId: "",
      branch: "",
      phone: "",
      contact: draft.requester,
    },
    shipTo: {
      name: "",
      code: "",
      address: "",
      taxId: "",
      branch: "",
      phone: "",
      contact: "",
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
      vat: 0,
      withholding: 0,
      rounding: t.rounding,
      grandTotal: t.grandTotal,
      currency: "THB",
      amountInWords: "",
    },
    bank: null,
    remarks: str(draft.reason)
      .split("\n")
      .map((r) => r.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean),
  };
}

/* ---------- Saving ---------- */

export interface PrSaveResult {
  code: string;
  created: boolean;
}

/**
 * Write the draft into the purchase request store.
 *
 * `submit` moves it to Pending Approval; without it the request stays a Draft
 * the requester can keep editing — the same split the sales request uses.
 */
export function savePurchaseRequestDraft(
  draft: PurchaseRequestDraft,
  { submit = false, user = actingUserName() }: { submit?: boolean; user?: string } = {},
): PrSaveResult {
  const now = stamp();
  const code = str(draft.code).trim();
  const existing = PURCHASE_REQUESTS.find((p) => p.code === code);

  const items = draft.items
    .filter((l) => str(l.code).trim())
    .map((l) => ({
      code: str(l.code).trim(),
      name: str(l.name),
      unit: str(l.unit),
      qty: num(l.qty),
      price: num(l.price),
      note: str(l.note),
    }));

  const patch = {
    dept: str(draft.dept),
    requester: str(draft.requester),
    priority: str(draft.priority) || "Normal",
    date: isoToDmy(draft.requestDate),
    needBy: isoToDmy(draft.needBy),
    warehouse: str(draft.warehouse),
    supplier: str(draft.supplier),
    note: str(draft.reason),
    items,
    updated: now,
    updatedBy: user,
  };

  if (existing) {
    Object.assign(existing, patch);
    if (submit && existing.status === "Draft") existing.status = "Pending Approval";
    return { code, created: false };
  }

  PURCHASE_REQUESTS.unshift({
    code,
    ...patch,
    status: submit ? "Pending Approval" : "Draft",
    approvals: [],
    created: now,
    createdBy: user,
  } as unknown as PurchaseRequest);

  return { code, created: true };
}
