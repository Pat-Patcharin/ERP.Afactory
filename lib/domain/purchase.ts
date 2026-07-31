import {
  PURCHASE_REQUESTS as RAW_PR,
  type PurchaseRequest,
} from "@/data/purchase-requests";
import {
  PO_SUPPLIER_INFO,
  PURCHASE_ORDERS as RAW_PO,
  type PurchaseOrder,
} from "@/data/purchase-orders";
import { DASH, daysUntil, stamp } from "@/lib/format";
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

/* ============================================================
   PURCHASE REQUEST
   Draft → Pending Approval → Approved → Converted to PO
                            → Rejected
   ============================================================ */

export interface PrRow extends PurchaseRequest {
  amount: number;
  itemCount: number;
  name: string;
  icon: string;
  currentApprover: string;
}

export const PURCHASE_REQUESTS = RAW_PR as PrRow[];

export const prLineTotal = (it: { qty?: number; price?: number }) =>
  (Number(it.qty) || 0) * (Number(it.price) || 0);

export const prTotal = (pr: { items?: { qty?: number; price?: number }[] }) =>
  (pr.items ?? []).reduce((s, it) => s + prLineTotal(it), 0);

export function decoratePRs() {
  for (const pr of PURCHASE_REQUESTS) {
    pr.amount = prTotal(pr);
    pr.itemCount = pr.items?.length ?? 0;
    pr.name = pr.code;
    pr.icon = "📝";
    const pending = pr.approvals?.find((a) => a.status === "pending");
    pr.currentApprover = pending ? pending.by : DASH;
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
