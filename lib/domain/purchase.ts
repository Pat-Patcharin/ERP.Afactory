import {
  PURCHASE_REQUESTS as RAW_PR,
  type PurchaseRequest,
} from "@/data/purchase-requests";
import {
  PO_SUPPLIER_INFO,
  PURCHASE_ORDERS as RAW_PO,
  type PurchaseOrder,
} from "@/data/purchase-orders";
import { DASH, daysUntil, money0, stamp } from "@/lib/format";
import { approvalPlan, nextApprovalStep } from "./admin";
import { notify } from "./notify";
import {
  docDiscTotal,
  docGrandTotal,
  docSubtotal,
  docTaxTotal,
  lineBase,
  lineDisc,
  lineNet,
  type DocLine,
} from "./lines";
import { recordTotals } from "./lines";

/* ============================================================
   PURCHASE REQUEST
   Draft → Open → Approved → Converted to PO
                → Rejected

   ONE REQUEST BUYS FROM ONE SUPPLIER.

   Not a convention — the order that comes out of it is addressed
   to a supplier, so a request naming two of them cannot become
   one order, and splitting it at conversion time would mean
   deciding after approval what was approved. The header names
   the supplier and `prSupplierReady` is what the submit path
   checks.

   WHO SIGNS IS NOT WRITTEN HERE.

   It is the approval workflow in Administration: one step from
   nothing upward, a second above the limit. A request under the
   limit needs one signature and one over it needs two, from the
   same configuration — change the limit there and this module
   follows without an edit.
   ============================================================ */

export interface PrRow extends PurchaseRequest {
  amount: number;
  itemCount: number;
  name: string;
  icon: string;
  currentApprover: string;
  /** Lines not yet on a purchase order — what a split may still offer. */
  openLines: number;
}

export const PURCHASE_REQUESTS = RAW_PR as PrRow[];

export const prLineTotal = (it: { qty?: number; price?: number }) =>
  (Number(it.qty) || 0) * (Number(it.price) || 0);

/** Same one figure as the sheet — see qtTotal in outbound.ts. */
export const prTotal = (pr: Parameters<typeof recordTotals>[0]) =>
  recordTotals(pr).grandTotal;

export function decoratePRs() {
  for (const pr of PURCHASE_REQUESTS) {
    pr.amount = prTotal(pr);
    pr.itemCount = pr.items?.length ?? 0;
    pr.name = pr.code;
    pr.icon = "📝";
    const pending = pr.approvals?.find((a) => a.status === "pending");
    pr.currentApprover = pending ? pending.by : DASH;
    pr.openLines = prOpenLines(pr).length;
  }
}

decoratePRs();

export const getPR = (code: string) =>
  PURCHASE_REQUESTS.find((p) => p.code === code) ?? null;

export function nextPRCode(): string {
  const n = PURCHASE_REQUESTS.reduce((m, p) => {
    const num = parseInt(String(p.code).split("-")[1], 10) || 0;
    return Math.max(m, num);
  }, 0);
  return `PR2506-${String(n + 1).padStart(4, "0")}`;
}

/* ---------- Approval ---------- */

export type PrLine = PurchaseRequest["items"][number];

/**
 * The signatures this request must collect, from the workflow configuration.
 *
 * Empty when no workflow governs purchase requests at all, which is a real
 * configuration and means "no approval needed" rather than "cannot proceed".
 */
export const prApprovalPlan = (pr: { amount?: number } & Parameters<typeof recordTotals>[0]) =>
  approvalPlan("purchase-request", pr.amount ?? prTotal(pr));

/**
 * Does this request need a second signature above the first?
 *
 * The whole ≥100,000 rule, asked as a question about the plan rather than
 * about the number — the limit lives in Administration.
 */
export const prNeedsSecondSignature = (
  pr: { amount?: number } & Parameters<typeof recordTotals>[0],
) => prApprovalPlan(pr).length > 1;

/** Steps already signed, by sequence — how far down the plan it has got. */
export const prSignedSeqs = (pr: { approvals?: { step: string; status: string }[] }): number[] =>
  (pr.approvals ?? [])
    .filter((a) => a.status === "done" && a.step.startsWith("APPROVAL-"))
    .map((a) => Number(a.step.split("-")[1]) || 0)
    .filter(Boolean);

/** The signature this request is waiting on right now, if any. */
export const prNextStep = (pr: PrRow) =>
  nextApprovalStep("purchase-request", pr.amount ?? prTotal(pr), prSignedSeqs(pr));

/* ---------- Ordering ---------- */

/**
 * Lines that have not gone out on a purchase order yet.
 *
 * A declaration rather than a const: `decoratePRs` runs as this module loads
 * and calls it, which a const initialised further down cannot answer.
 */
export function prOpenLines(pr: { items?: PrLine[] }): PrLine[] {
  return (pr.items ?? []).filter((l) => !String(l.poRef ?? "").trim());
}

/** Every line ordered — the point at which the request itself is Converted. */
export const prFullyOrdered = (pr: { items?: PrLine[] }): boolean =>
  (pr.items ?? []).length > 0 && prOpenLines(pr).length === 0;

/**
 * Can this request become an order at all?
 *
 * One supplier per request, so a request that names none has nobody to send
 * the order to — caught on submit rather than at conversion, when it is far
 * too late for the requester to answer the question.
 */
export const prSupplierReady = (pr: { supplier?: string }) =>
  Boolean(String(pr.supplier ?? "").trim());

/* ---------- Handing it over ---------- */

/**
 * The submit transition itself, shared by every surface that can raise one.
 *
 * It lives here rather than in the workflow file because there are two ways
 * to hand a request over — the Submit action on a saved document, and Save &
 * Submit inside the editor — and a rule that only one of them applied would
 * be a rule that could be walked around. The buttons keep their own toasts;
 * what the document DOES is this.
 *
 * Under the approval limit the request opens straight away. Over it, the
 * request is submitted but stays a Draft: the reviewer opens it, and until
 * they do, the second signature has not been asked for.
 */
export function submitPurchaseRequest(pr: PrRow, user: string) {
  const now = stamp();
  const plan = prApprovalPlan(pr);
  const escalated = plan.length > 1;

  pr.submittedAt = now;
  pr.submittedBy = user;
  pr.updated = now;
  pr.updatedBy = user;
  if (!escalated) pr.status = "Open";

  /* Step one either way. Over the limit the reviewer's act IS the first
     signature — they read the request and open it, which is what step one
     of the plan asks of them; the difference is that opening it hands the
     document to step two rather than finishing it. Naming that row anything
     else left step one forever unsigned, and the second approver was refused
     at their own step. */
  (pr.approvals ??= []).push({
    step: `APPROVAL-${plan[0]?.seq ?? 1}`,
    by: plan[0]?.roleName ?? "ผู้อนุมัติ",
    role: plan[0]?.roleName ?? "",
    when: "",
    status: "pending",
    note: "",
  });

  notify({
    kind: escalated ? "escalated" : "approval_request",
    docType: "purchase-request",
    docCode: pr.code,
    title: escalated ? `${pr.code} รอตรวจสอบก่อนเปิดเอกสาร` : `ใบขอซื้อ ${pr.code} รออนุมัติ`,
    body: escalated
      ? `${pr.supplier} — ${money0(prTotal(pr))} บาท เกินวงเงินอนุมัติ ตรวจแล้วเปิดเอกสารเพื่อส่งให้ ${
          plan[plan.length - 1]?.roleName ?? "ผู้อนุมัติขั้นถัดไป"
        } อนุมัติ`
      : `${pr.supplier} — ${money0(prTotal(pr))} บาท`,
    /* The first step of the plan either way: under the limit they sign it,
       over the limit they vet it. Same desk, different act. */
    toRoles: plan[0] ? [plan[0].roleCode] : [],
  });

  decoratePRs();
  return { escalated, plan };
}

/* ============================================================
   PURCHASE ORDER
   Belongs to ONE supplier. Receiving is partial-aware:
   Draft → Open → Partial Received → Completed
   ============================================================ */

export interface PoRow extends PurchaseOrder {
  total: number;
  recvPct: number;
  itemCount: number;
  name: string;
  icon: string;
  isOverdue: boolean;
}

export const PURCHASE_ORDERS = RAW_PO as PoRow[];

/** Supplier purchasing profile — rating, lead time, last price. */
export function poSupplierInfo(name: string) {
  return (
    PO_SUPPLIER_INFO[name] ?? {
      rating: 4.0,
      ratingLabel: DASH,
      lead: 7,
      otd: 90,
      lastPrice: 0,
      lastDate: DASH,
      outstanding: 0,
      icon: "🏢",
    }
  );
}

export const PO_SUPPLIERS = Object.keys(PO_SUPPLIER_INFO);

/* Line maths lives in ./lines — shared with the sell side so a PO and an SO
   can never price a line differently. These aliases keep the po* names the
   purchase schemas already import. */
type PoLine = DocLine & { recv?: number };

export const poLineBase = lineBase;
export const poLineDisc = lineDisc;
export const poLineNet = lineNet;
export const poSubtotal = docSubtotal;
export const poDiscTotal = docDiscTotal;
export const poTaxTotal = docTaxTotal;
export const poGrandTotal = docGrandTotal;

export function poReceivedPct(po: { items?: PoLine[] }): number {
  const ordered = (po.items ?? []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const recv = (po.items ?? []).reduce((s, it) => s + (Number(it.recv) || 0), 0);
  return ordered ? Math.round((recv / ordered) * 100) : 0;
}

export const poRemainingQty = (po: { items?: PoLine[] }) =>
  (po.items ?? []).reduce(
    (s, it) => s + Math.max(0, (Number(it.qty) || 0) - (Number(it.recv) || 0)),
    0,
  );

export function decoratePOs() {
  for (const po of PURCHASE_ORDERS) {
    po.total = poGrandTotal(po);
    po.recvPct = poReceivedPct(po);
    po.itemCount = po.items?.length ?? 0;
    po.name = po.code;
    po.icon = "🧾";
    // Overdue = past the expected date and not fully received.
    const d = daysUntil(po.expectedDate);
    po.isOverdue =
      Boolean(po.overdue) ||
      (d !== null && d < 0 && po.recvPct < 100 && ["Open", "Partial Received"].includes(po.status));
  }
}

decoratePOs();

export const getPO = (code: string) =>
  PURCHASE_ORDERS.find((p) => p.code === code) ?? null;

export function nextPOCode(): string {
  const n = PURCHASE_ORDERS.reduce((m, p) => {
    const num = parseInt(String(p.code).replace(/\D/g, ""), 10) || 0;
    return Math.max(m, num);
  }, 0);
  return `PO${n + 1}`;
}

export { stamp as docStamp };
