import {
  RTN_PERIOD_DAYS,
  RTN_STOCK_DISPOSITIONS,
  SALES_RETURNS as RAW,
  type RtnLine,
  type SalesReturn,
} from "@/data/sales-returns";
import { SHIPMENTS } from "./shipment";
import { SALES_INVOICES } from "./invoice";
import { DELIVERY_ORDERS, SALES_ORDERS } from "./outbound";
import { pctOf } from "./lines";
import { DASH, daysUntil } from "@/lib/format";

/* ============================================================
   SALES RETURN — the operational return process.

   Returned goods never become available stock on receipt. They
   land in Return Receiving / QC Hold and only reach sellable
   inventory through an accepted QC result plus a confirmed
   disposition. No accounting is posted here; Credit Note is its
   own module.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Line quantities ---------- */

/** Remaining Returnable Qty = Shipped Qty − Previously Returned Qty. */
export const remainingReturnable = (it: Partial<RtnLine>) =>
  Math.max(0, num(it.shippedQty) - num(it.prevReturnedQty));

export const isOverReturn = (it: Partial<RtnLine>) =>
  num(it.requestedQty) > remainingReturnable(it);

/** Receiving may never exceed what was authorised. */
export const isOverReceive = (it: Partial<RtnLine>) =>
  num(it.receivedQty) > num(it.approvedQty || it.requestedQty);

/** QC must account for every inspected unit: accepted + rejected + hold. */
export const qcBalanced = (it: Partial<RtnLine>) =>
  num(it.acceptedQty) + num(it.rejectedQty) + num(it.holdQty) === num(it.inspectedQty);

export const lineCredit = (it: Partial<RtnLine>) =>
  round2(num(it.approvedQty || it.requestedQty) * num(it.unitPrice));

/** How much of a source document has already come back on other returns. */
export function returnedQtyForSource(sourceDoc: string, productCode: string, exclude = ""): number {
  return SALES_RETURNS.filter(
    (r) => r.sourceDoc === sourceDoc && r.code !== exclude && !["Cancelled", "Rejected"].includes(r.status),
  ).reduce(
    (t, r) =>
      t + (r.items ?? []).filter((l) => l.code === productCode).reduce((q, l) => q + num(l.requestedQty), 0),
    0,
  );
}

/* ---------- Eligibility ---------- */

export interface EligibilityIssue {
  label: string;
  blocking: boolean;
}

/**
 * Whether a line may go back into sellable inventory. Expired stock, a broken
 * sterile seal or a failed QC result each stop it on their own — these are the
 * rules that keep unsellable goods out of available stock.
 */
export function stockEligibility(it: Partial<RtnLine>): EligibilityIssue[] {
  const out: EligibilityIssue[] = [];

  if (num(it.acceptedQty) <= 0) out.push({ label: "ยังไม่มีจำนวนที่ QC รับ", blocking: true });
  if (it.sealOpened) out.push({ label: "ซีลปลอดเชื้อถูกเปิดแล้ว", blocking: true });
  if (it.condition === "Expired") out.push({ label: "สินค้าหมดอายุ", blocking: true });
  if (it.condition === "Used") out.push({ label: "สินค้าผ่านการใช้งานแล้ว", blocking: true });

  const days = it.expiry ? daysUntil(it.expiry) : null;
  if (days !== null && days < 0) out.push({ label: "เลยวันหมดอายุแล้ว", blocking: true });
  if (days !== null && days >= 0 && days <= 90)
    out.push({ label: `ใกล้หมดอายุใน ${days} วัน`, blocking: false });

  return out;
}

export const canReturnToStock = (it: Partial<RtnLine>) =>
  stockEligibility(it).every((i) => !i.blocking);

export const isStockDisposition = (d: string) =>
  (RTN_STOCK_DISPOSITIONS as readonly string[]).includes(d);

/** Serial numbers returned more than once inside this document. */
export function duplicateSerials(r: { items?: RtnLine[] }): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const it of r.items ?? []) {
    for (const sn of String(it.serial ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (seen.has(sn)) dupes.add(sn);
      seen.add(sn);
    }
  }
  return [...dupes];
}

/** Serials on this return that the source shipment never carried. */
export function serialMismatches(r: { shipmentRef?: string; items?: RtnLine[] }): string[] {
  const shp = SHIPMENTS.find((s) => s.code === r.shipmentRef);
  if (!shp) return [];
  const shipped = new Set(
    (shp.items ?? []).flatMap((it) =>
      String(it.serial ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  );
  if (!shipped.size) return [];

  return (r.items ?? [])
    .flatMap((it) =>
      String(it.serial ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .filter((sn) => !shipped.has(sn));
}

/** Is this return still inside the company return window? */
export function withinReturnPeriod(r: { returnDate?: string; originalInvoiceDate?: string }): boolean {
  const base = r.originalInvoiceDate;
  if (!base) return true;
  const days = daysUntil(base);
  return days === null || Math.abs(days) <= RTN_PERIOD_DAYS;
}

/* ---------- Row decoration ---------- */

export interface RtnRow extends SalesReturn {
  name: string;
  icon: string;
  itemCount: number;
  requestedQty: number;
  approvedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  holdQty: number;
  pendingQty: number;
  returnValue: number;
  progress: number;
  openExceptions: number;
  /** Approval / receiving / QC / disposition gates the UI reads. */
  canSubmit: boolean;
  canApprove: boolean;
  canAuthorize: boolean;
  canReceive: boolean;
  canQc: boolean;
  canDisposition: boolean;
  canCreditNote: boolean;
  isEditable: boolean;
  hasSerialMismatch: boolean;
  periodExceeded: boolean;
}

export const SALES_RETURNS = RAW as RtnRow[];

export function decorateReturns() {
  for (const r of SALES_RETURNS) {
    const items = r.items ?? [];

    r.name = r.code;
    r.icon = "↩️";
    r.itemCount = items.length;
    r.requestedQty = items.reduce((t, it) => t + num(it.requestedQty), 0);
    r.approvedQty = items.reduce((t, it) => t + num(it.approvedQty), 0);
    r.receivedQty = items.reduce((t, it) => t + num(it.receivedQty), 0);
    r.acceptedQty = items.reduce((t, it) => t + num(it.acceptedQty), 0);
    r.rejectedQty = items.reduce((t, it) => t + num(it.rejectedQty), 0);
    r.holdQty = items.reduce((t, it) => t + num(it.holdQty), 0);
    r.pendingQty = Math.max(0, (r.approvedQty || r.requestedQty) - r.receivedQty);
    r.returnValue = round2(items.reduce((t, it) => t + lineCredit(it), 0));

    /* Progress walks the whole chain, not just receiving. */
    const target = r.approvedQty || r.requestedQty;
    r.progress = target
      ? pctOf(r.receivedQty + r.acceptedQty + r.rejectedQty, target * 2)
      : 0;

    r.openExceptions = (r.exceptions ?? []).filter((e) => e.status !== "Resolved").length;

    r.canSubmit = ["Draft", "Rejected"].includes(r.status);
    r.canApprove = ["Submitted", "Pending Approval"].includes(r.status);
    r.canAuthorize = r.status === "Approved" || r.status === "Partially Approved";
    r.canReceive = ["Waiting Return", "Partially Received", "Authorized"].includes(r.status);
    r.canQc = ["Received", "Partially Received", "Pending QC"].includes(r.status) && r.receivedQty > 0;
    r.canDisposition = r.qcStatus === "QC Completed" && r.dispositionStatus !== "Disposition Completed";
    r.canCreditNote =
      !r.creditNoteRef &&
      r.creditNoteStatus !== "Not Required" &&
      ["Approved", "Received", "Partially Received", "Pending QC", "QC Completed", "Disposition Completed", "Disposition Pending", "Credit Note Pending"].includes(
        r.status,
      );

    /* Rule 15: nothing is editable once goods have physically arrived. */
    r.isEditable = ["Draft", "Rejected"].includes(r.status);

    r.hasSerialMismatch = serialMismatches(r).length > 0;
    r.periodExceeded = !withinReturnPeriod(r);
  }
}

decorateReturns();

export const getReturn = (code: string) => SALES_RETURNS.find((r) => r.code === code) ?? null;

export function nextReturnCode(): string {
  const n = SALES_RETURNS.reduce((m, r) => {
    const tail = String(r.code).split("-").pop() ?? "0";
    return Math.max(m, parseInt(tail, 10) || 0);
  }, 0);
  return `RTN-2026-${String(n + 1).padStart(6, "0")}`;
}

export function nextRmaNo(): string {
  const n = SALES_RETURNS.reduce((m, r) => {
    const tail = String(r.rmaNo ?? "").split("-").pop() ?? "0";
    return Math.max(m, parseInt(tail, 10) || 0);
  }, 0);
  return `RMA-2605-${String(n + 1).padStart(4, "0")}`;
}

/* ---------- Source document adapters ---------- */

export interface RtnSourceOption {
  code: string;
  customer: string;
  customerCode: string;
  date: string;
}

/** Documents a return may be raised against, per source type. */
export function returnSourceOptions(sourceType: string): RtnSourceOption[] {
  if (sourceType === "Shipment")
    return SHIPMENTS.filter((s) =>
      ["Delivered", "Partially Delivered", "Delivery Failed", "Returned", "Exception"].includes(s.status),
    ).map((s) => ({
      code: s.code,
      customer: s.customer,
      customerCode: s.customerCode,
      date: s.actualDelivery || s.shipmentDate,
    }));

  if (sourceType === "Delivery Order")
    return DELIVERY_ORDERS.filter((d) => ["Shipped", "Delivered", "Failed"].includes(d.status)).map((d) => ({
      code: d.code,
      customer: d.customer,
      customerCode: d.customerCode,
      date: d.deliveryDate,
    }));

  if (sourceType === "Sales Invoice")
    return SALES_INVOICES.filter((i) => !["Draft", "Cancelled", "Void"].includes(i.status)).map((i) => ({
      code: i.code,
      customer: i.customer,
      customerCode: i.customerCode,
      date: i.invoiceDate,
    }));

  if (sourceType === "Sales Order")
    return SALES_ORDERS.filter((s) =>
      ["Partially Delivered", "Completed", "Picking"].includes(s.status),
    ).map((s) => ({
      code: s.code,
      customer: s.customer,
      customerCode: s.customerCode,
      date: s.orderDate,
    }));

  return [];
}

/** Header defaults a source document hands to a new return request. */
export function headerFromReturnSource(sourceType: string, doc: string) {
  if (sourceType === "Shipment") {
    const s = SHIPMENTS.find((x) => x.code === doc);
    if (!s) return null;
    return {
      customer: s.customer,
      customerCode: s.customerCode,
      contactPerson: s.contactPerson,
      contactPhone: s.contactPhone,
      pickupAddress: s.deliveryAddress,
      salesRep: s.salesRep,
      shipmentRef: s.code,
      invoiceRef: s.invRef,
      soRef: s.soRef,
      customerRef: s.customerRef,
      originalInvoiceDate: "",
      originalAmount: 0,
    };
  }
  if (sourceType === "Delivery Order") {
    const d = DELIVERY_ORDERS.find((x) => x.code === doc);
    if (!d) return null;
    const so = SALES_ORDERS.find((x) => x.code === d.soRef);
    return {
      customer: d.customer,
      customerCode: d.customerCode,
      contactPerson: d.contact,
      contactPhone: d.phone,
      pickupAddress: d.shipTo,
      salesRep: (so?.salesRep ?? "").split(" - ")[1] ?? "",
      shipmentRef: "",
      invoiceRef: "",
      soRef: d.soRef,
      customerRef: so?.customerPo ?? "",
      originalInvoiceDate: "",
      originalAmount: so?.total ?? 0,
    };
  }
  if (sourceType === "Sales Invoice") {
    const i = SALES_INVOICES.find((x) => x.code === doc);
    if (!i) return null;
    return {
      customer: i.customer,
      customerCode: i.customerCode,
      contactPerson: i.contactPerson,
      contactPhone: i.phone,
      pickupAddress: i.billingAddress,
      salesRep: i.salesRep,
      shipmentRef: "",
      invoiceRef: i.code,
      soRef: "",
      customerRef: i.customerPo,
      originalInvoiceDate: i.invoiceDate,
      originalAmount: i.grandTotal,
    };
  }
  if (sourceType === "Sales Order") {
    const s = SALES_ORDERS.find((x) => x.code === doc);
    if (!s) return null;
    return {
      customer: s.customer,
      customerCode: s.customerCode,
      contactPerson: "",
      contactPhone: "",
      pickupAddress: s.shipTo,
      salesRep: (s.salesRep ?? "").split(" - ")[1] ?? "",
      shipmentRef: "",
      invoiceRef: "",
      soRef: s.code,
      customerRef: s.customerPo,
      originalInvoiceDate: "",
      originalAmount: s.total,
    };
  }
  return null;
}

/**
 * Returnable lines off a source document, already netted against what earlier
 * returns claimed. This is what stops the same goods being returned twice.
 */
export function returnableLinesFrom(sourceType: string, doc: string, exclude = ""): RtnLine[] {
  const make = (
    i: number,
    code: string,
    name: string,
    unit: string,
    shipped: number,
    price: number,
    serial = "",
    lot = "",
  ): RtnLine => {
    const prev = returnedQtyForSource(doc, code, exclude);
    return {
      line: i + 1,
      code,
      name,
      sourceLine: i + 1,
      shippedQty: shipped,
      prevReturnedQty: prev,
      requestedQty: Math.max(0, shipped - prev),
      approvedQty: 0,
      receivedQty: 0,
      inspectedQty: 0,
      acceptedQty: 0,
      rejectedQty: 0,
      holdQty: 0,
      unit,
      serial,
      lot,
      expiry: "",
      condition: "New / Unopened",
      reason: "",
      unitPrice: price,
      disposition: "",
      destWarehouse: "",
      destLocation: "",
      sealOpened: false,
      note: "",
    };
  };

  if (sourceType === "Shipment") {
    const s = SHIPMENTS.find((x) => x.code === doc);
    if (!s) return [];
    const inv = SALES_INVOICES.find((x) => x.code === s.invRef);
    return (s.items ?? []).map((it, i) => {
      const invLine = (inv?.items ?? []).find((l) => l.code === it.code);
      return make(
        i,
        it.code,
        it.name,
        it.unit,
        num(it.deliveredQty) || num(it.shipmentQty),
        num(invLine?.unitPrice),
        it.serial,
        it.lot,
      );
    });
  }

  if (sourceType === "Delivery Order") {
    const d = DELIVERY_ORDERS.find((x) => x.code === doc);
    if (!d) return [];
    const so = SALES_ORDERS.find((x) => x.code === d.soRef);
    return (d.items ?? []).map((it, i) => {
      const soLine = (so?.items ?? []).find((l) => l.code === it.code);
      return make(i, it.code, it.name, it.unit, num(it.delivered) || num(it.qty), num(soLine?.price));
    });
  }

  if (sourceType === "Sales Invoice") {
    const inv = SALES_INVOICES.find((x) => x.code === doc);
    if (!inv) return [];
    return (inv.items ?? []).map((it, i) =>
      make(i, it.code, it.name, it.unit, num(it.invoiceQty), num(it.unitPrice), "", it.lotSerial),
    );
  }

  if (sourceType === "Sales Order") {
    const so = SALES_ORDERS.find((x) => x.code === doc);
    if (!so) return [];
    return (so.items ?? []).map((it, i) =>
      make(i, it.code, it.name, it.unit, num(it.delivered) || num(it.qty), num(it.price)),
    );
  }

  return [];
}

/** Every return raised against one source document. */
export const returnsForSource = (doc: string) => SALES_RETURNS.filter((r) => r.sourceDoc === doc);

/* ---------- Readiness ---------- */

/** Everything stopping this return from being submitted for approval. */
export function submitReadiness(r: {
  items?: RtnLine[];
  customer?: string;
  returnType?: string;
  returnReason?: string;
  returnWarehouse?: string;
  requestedResolution?: string;
  shipmentRef?: string;
  returnDate?: string;
  originalInvoiceDate?: string;
}): EligibilityIssue[] {
  const out: EligibilityIssue[] = [];
  const items = r.items ?? [];

  if (!items.length) out.push({ label: "ยังไม่มีรายการที่ขอคืน", blocking: true });
  if (!String(r.customer ?? "").trim()) out.push({ label: "ยังไม่ระบุลูกค้า", blocking: true });
  if (!String(r.returnType ?? "").trim()) out.push({ label: "ยังไม่ระบุประเภทการคืน", blocking: true });
  if (!String(r.returnReason ?? "").trim()) out.push({ label: "ยังไม่ระบุเหตุผลการคืน", blocking: true });
  if (!String(r.returnWarehouse ?? "").trim())
    out.push({ label: "ยังไม่ระบุคลังรับคืน", blocking: true });
  if (!String(r.requestedResolution ?? "").trim())
    out.push({ label: "ยังไม่ระบุวิธีการชดเชยที่ขอ", blocking: true });

  const over = items.filter(isOverReturn);
  if (over.length) out.push({ label: `${over.length} บรรทัดขอคืนเกินจำนวนที่ส่งไป`, blocking: true });

  const zero = items.filter((it) => num(it.requestedQty) <= 0);
  if (zero.length) out.push({ label: `${zero.length} บรรทัดจำนวนเป็นศูนย์`, blocking: true });

  const dupes = duplicateSerials({ items });
  if (dupes.length) out.push({ label: `Serial ซ้ำ: ${dupes.slice(0, 3).join(", ")}`, blocking: true });

  const mismatch = serialMismatches({ shipmentRef: r.shipmentRef, items });
  if (mismatch.length)
    out.push({ label: `Serial ไม่ตรงกับใบขนส่ง: ${mismatch.slice(0, 3).join(", ")}`, blocking: false });

  const damaged = items.filter((it) => ["Damaged", "Defective"].includes(String(it.condition)));
  if (damaged.length) out.push({ label: `${damaged.length} บรรทัดชำรุด — ควรแนบรูปหลักฐาน`, blocking: false });

  if (!withinReturnPeriod(r))
    out.push({ label: `เกินระยะเวลารับคืน ${RTN_PERIOD_DAYS} วัน — ต้องขออนุมัติพิเศษ`, blocking: false });

  return out;
}

export const blockingIssues = (issues: EligibilityIssue[]) => issues.filter((i) => i.blocking);

export { DASH, RTN_PERIOD_DAYS };
