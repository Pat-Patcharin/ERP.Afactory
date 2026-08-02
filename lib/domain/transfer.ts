import {
  TRANSFERS,
  TRF_APPROVAL_THRESHOLD,
  type Transfer,
  type TrfLine,
} from "@/data/transfers";
import type { BadgeTone } from "@/lib/types";
import { WAREHOUSES } from "./warehouse";
import { STOCK_POSITIONS, STOCK_SERIALS } from "./stock";

/* ============================================================
   STOCK TRANSFER — the document that moves stock without
   creating or destroying it.

   A direct transfer posts a balanced Transfer Out / Transfer In
   pair. A two-step transfer parks the quantity In Transit between
   dispatch and receipt, so at any moment:

       requested = dispatched + remaining to dispatch
       dispatched = received + short + damaged + in transit

   Everything here derives from the document; the quantity a line
   may draw on comes from Stock Inquiry, which owns today's stock.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

/* ---------- Transferable stock ---------- */

/**
 * How much of a product may leave a location.
 *
 * Availability comes from Stock Inquiry rather than being recomputed, so the
 * two screens can never disagree. Reserved, QC hold, return hold and damaged
 * quantity are already outside `available`; expired and blocked positions are
 * excluded here because they must not move into Available stock.
 */
export function transferableQty(
  product: string,
  warehouse = "",
  status = "Available",
): number {
  const rows = STOCK_POSITIONS.filter(
    (r) => r.product === product && (!warehouse || r.warehouse === warehouse),
  );

  if (status === "QC Hold") return sum(rows, (r) => r.qcHold);
  if (status === "Return Hold") return sum(rows, (r) => r.returnHold);
  if (status === "Damaged") return sum(rows, (r) => r.damaged);
  if (status === "Blocked") return sum(rows.filter((r) => r.blocked), (r) => r.onHand);

  return sum(
    rows.filter((r) => !r.blocked && !(r.expDays !== null && r.expDays < 0)),
    (r) => Math.max(0, r.available - r.damaged),
  );
}

/** Everything a source location holds, for the item picker. */
export function sourceStock(warehouse: string, status = "Available") {
  const byProduct = new Map<string, ReturnType<typeof describe>>();
  const describe = (code: string) => ({
    code,
    name: "",
    unit: "",
    lot: "",
    exp: "",
    onHand: 0,
    reserved: 0,
    qcHold: 0,
    returnHold: 0,
    damaged: 0,
    transferable: 0,
    serialTracked: false,
  });

  for (const r of STOCK_POSITIONS.filter((p) => !warehouse || p.warehouse === warehouse)) {
    const hit = byProduct.get(r.product) ?? describe(r.product);
    hit.name = r.productName;
    hit.unit = r.unit;
    hit.lot ||= r.lot;
    hit.exp ||= r.exp;
    hit.onHand += r.onHand;
    hit.reserved += r.reserved;
    hit.qcHold += r.qcHold;
    hit.returnHold += r.returnHold;
    hit.damaged += r.damaged;
    hit.serialTracked ||= Boolean(r.serial);
    byProduct.set(r.product, hit);
  }

  for (const [code, row] of byProduct) {
    row.transferable = transferableQty(code, warehouse, status);
  }
  return [...byProduct.values()].filter((r) => r.transferable > 0);
}

/** Serials that may be picked for a transfer — in stock and not committed. */
export function selectableSerials(product: string, warehouse = "") {
  const committed = new Set(
    TRANSFERS.filter((t) => !["Completed", "Cancelled", "Reversed", "Closed"].includes(t.status))
      .flatMap((t) => t.items)
      .flatMap((i) => i.serials),
  );
  return STOCK_SERIALS.filter(
    (s) =>
      s.product === product &&
      (!warehouse || s.warehouse === warehouse) &&
      s.status === "In Stock" &&
      !committed.has(s.serial),
  );
}

/* ---------- Row ---------- */

export interface TrfRow extends Transfer {
  name: string;
  icon: string;

  itemCount: number;
  requestedQty: number;
  dispatchedQty: number;
  receivedQty: number;
  shortQty: number;
  damagedQty: number;
  /** Dispatched but not yet accounted for at the destination. */
  inTransitQty: number;
  remainingDispatch: number;
  remainingReceipt: number;
  /** 0–100, driven by receipt for two-step and by posting for direct. */
  progress: number;

  srcLabel: string;
  dstLabel: string;
  srcLocation: string;
  dstLocation: string;

  isTwoStep: boolean;
  isDirect: boolean;
  needsApproval: boolean;
  approvalReasons: string[];

  openExceptions: number;
  hasSerials: boolean;
  hasLots: boolean;

  isEditable: boolean;
  isLimitedEdit: boolean;
  isReadOnly: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canMarkReady: boolean;
  canPost: boolean;
  canDispatch: boolean;
  canReceive: boolean;
  canCancel: boolean;
  canReverse: boolean;
}

const EDITABLE = ["Draft", "Rejected", "Revision Requested"];
const LIMITED_EDIT = ["Approved", "Ready to Transfer"];
const READ_ONLY = [
  "Partially Dispatched",
  "Dispatched",
  "In Transit",
  "Partially Received",
  "Received",
  "Completed",
  "Cancelled",
  "Reversed",
  "Closed",
];
const CLOSED = ["Completed", "Cancelled", "Reversed", "Closed"];

export const lineRemainingDispatch = (l: TrfLine) =>
  Math.max(0, num(l.requested) - num(l.dispatched));

export const lineRemainingReceipt = (l: TrfLine) =>
  Math.max(0, num(l.dispatched) - num(l.received) - num(l.short) - num(l.damaged));

/** Where one line stands, in the vocabulary the item grid shows. */
export function lineStatus(l: TrfLine): string {
  if (!num(l.dispatched)) return "Pending";
  if (lineRemainingDispatch(l) > 0) return "Partially Dispatched";
  if (!num(l.received) && !num(l.short) && !num(l.damaged)) return "In Transit";
  if (lineRemainingReceipt(l) > 0) return "Partially Received";
  if (num(l.short) || num(l.damaged)) return "Received with Variance";
  return "Received";
}

/**
 * Which rules force this transfer through approval. Kept as a list rather
 * than a boolean so the detail screen can say why.
 */
export function approvalTriggers(t: Transfer): string[] {
  const out: string[] = [];
  const qty = sum(t.items ?? [], (i) => num(i.requested));

  if (qty > TRF_APPROVAL_THRESHOLD)
    out.push(`ปริมาณรวม ${qty} เกินเกณฑ์ ${TRF_APPROVAL_THRESHOLD}`);
  if (t.srcWarehouse !== t.dstWarehouse) out.push("โอนย้ายข้ามคลัง");
  if (t.srcBranch !== t.dstBranch) out.push("โอนย้ายข้ามสาขา");
  if (t.srcStatus !== "Available" || t.dstStatus !== "Available")
    out.push(`เปลี่ยนสถานะสต๊อก ${t.srcStatus} → ${t.dstStatus}`);
  if (t.type === "Emergency Transfer") out.push("เป็นการโอนย้ายเร่งด่วน");

  return out;
}

export function decorate(t: Transfer): TrfRow {
  const items = t.items ?? [];
  const requestedQty = sum(items, (i) => num(i.requested));
  const dispatchedQty = sum(items, (i) => num(i.dispatched));
  const receivedQty = sum(items, (i) => num(i.received));
  const shortQty = sum(items, (i) => num(i.short));
  const damagedQty = sum(items, (i) => num(i.damaged));

  const isTwoStep = t.method === "Two-Step Transfer";
  const isDirect = !isTwoStep;
  const inTransitQty = isTwoStep
    ? Math.max(0, dispatchedQty - receivedQty - shortQty - damagedQty)
    : 0;

  const remainingDispatch = sum(items, lineRemainingDispatch);
  const remainingReceipt = sum(items, lineRemainingReceipt);

  const accounted = receivedQty + shortQty + damagedQty;
  const progress = requestedQty
    ? Math.min(
        100,
        Math.round(((isTwoStep ? accounted : receivedQty) / requestedQty) * 100),
      )
    : 0;

  const wh = (code: string) => WAREHOUSES.find((w) => w.code === code);
  const loc = (zone: string, rack: string, shelf: string, bin: string) =>
    [zone, rack, shelf, bin].filter(Boolean).join("-") || "—";

  const approvalReasons = approvalTriggers(t);
  const needsApproval = approvalReasons.length > 0;

  const isEditable = EDITABLE.includes(t.status);
  const isLimitedEdit = LIMITED_EDIT.includes(t.status);
  const isReadOnly = READ_ONLY.includes(t.status);
  const closed = CLOSED.includes(t.status);

  return {
    ...t,
    name: `${t.srcWarehouse} → ${t.dstWarehouse}`,
    icon: "truck",

    itemCount: items.length,
    requestedQty,
    dispatchedQty,
    receivedQty,
    shortQty,
    damagedQty,
    inTransitQty,
    remainingDispatch,
    remainingReceipt,
    progress,

    srcLabel: `${t.srcWarehouse} ${wh(t.srcWarehouse)?.name ?? ""}`.trim(),
    dstLabel: `${t.dstWarehouse} ${wh(t.dstWarehouse)?.name ?? ""}`.trim(),
    srcLocation: loc(t.srcZone, t.srcRack, t.srcShelf, t.srcBin),
    dstLocation: loc(t.dstZone, t.dstRack, t.dstShelf, t.dstBin),

    isTwoStep,
    isDirect,
    needsApproval,
    approvalReasons,

    openExceptions: (t.exceptions ?? []).filter((e) => e.status !== "Closed").length,
    hasSerials: items.some((i) => (i.serials ?? []).length > 0),
    hasLots: items.some((i) => Boolean(i.lot)),

    isEditable,
    isLimitedEdit,
    isReadOnly,

    canSubmit: isEditable && items.length > 0 && requestedQty > 0,
    canApprove: t.status === "Pending Approval",
    canReject: t.status === "Pending Approval",
    canMarkReady: t.status === "Approved" || (!needsApproval && t.status === "Draft"),
    canPost: isDirect && ["Ready to Transfer", "Approved"].includes(t.status),
    canDispatch:
      isTwoStep &&
      ["Ready to Transfer", "Approved", "Partially Dispatched"].includes(t.status) &&
      remainingDispatch > 0,
    canReceive:
      isTwoStep &&
      ["Dispatched", "In Transit", "Partially Received"].includes(t.status) &&
      remainingReceipt > 0,
    canCancel: !closed && !["Dispatched", "In Transit", "Partially Received"].includes(t.status),
    canReverse: t.status === "Completed" && !t.reversedBy,
  };
}

export const TRANSFER_ROWS: TrfRow[] = TRANSFERS.map(decorate);

/** Rebuild the decorated view after a workflow mutates a document. */
export function decorateTransfers() {
  TRANSFER_ROWS.length = 0;
  TRANSFER_ROWS.push(...TRANSFERS.map(decorate));
  return TRANSFER_ROWS;
}

export const transferRows = () => TRANSFER_ROWS;

export const getTransfer = (code: string) =>
  TRANSFER_ROWS.find((t) => t.code === code) ?? null;

export const rawTransfer = (code: string) => TRANSFERS.find((t) => t.code === code) ?? null;

/* ---------- Validation ---------- */

export interface TransferIssue {
  field: string;
  message: string;
}

/**
 * Everything that would stop this transfer being submitted. Returned as a
 * list so the form can show them inline instead of an alert box.
 */
export function blockingIssues(t: Transfer): TransferIssue[] {
  const out: TransferIssue[] = [];
  const items = t.items ?? [];

  if (!t.transferDate) out.push({ field: "transferDate", message: "ต้องระบุวันที่โอนย้าย" });
  if (!t.method) out.push({ field: "method", message: "ต้องเลือกวิธีการโอนย้าย" });
  if (!t.type) out.push({ field: "type", message: "ต้องเลือกประเภทการโอนย้าย" });
  if (!t.srcWarehouse) out.push({ field: "srcWarehouse", message: "ต้องระบุคลังต้นทาง" });
  if (!t.dstWarehouse) out.push({ field: "dstWarehouse", message: "ต้องระบุคลังปลายทาง" });
  if (!t.reason) out.push({ field: "reason", message: "ต้องระบุเหตุผลการโอนย้าย" });

  if (
    t.srcWarehouse &&
    t.srcWarehouse === t.dstWarehouse &&
    t.srcBin === t.dstBin &&
    t.srcStatus === t.dstStatus
  ) {
    out.push({
      field: "dstWarehouse",
      message: "ต้นทางและปลายทางต้องไม่เหมือนกันทั้งตำแหน่งและสถานะ",
    });
  }

  if (!items.length) {
    out.push({ field: "items", message: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" });
  }

  for (const i of items) {
    const qty = num(i.requested);
    if (qty <= 0) {
      out.push({ field: `items.${i.line}`, message: `บรรทัด ${i.line}: จำนวนต้องมากกว่า 0` });
      continue;
    }
    const cap = transferableQty(i.code, t.srcWarehouse, t.srcStatus);
    if (qty > cap) {
      out.push({
        field: `items.${i.line}`,
        message: `บรรทัด ${i.line}: จำนวน ${qty} เกินยอดที่โอนได้ ${cap}`,
      });
    }
    const serials = i.serials ?? [];
    if (serials.length && serials.length !== qty) {
      out.push({
        field: `items.${i.line}`,
        message: `บรรทัด ${i.line}: เลือก Serial ${serials.length} ชิ้น ต้องเท่ากับจำนวน ${qty}`,
      });
    }
    if (new Set(serials).size !== serials.length) {
      out.push({ field: `items.${i.line}`, message: `บรรทัด ${i.line}: มี Serial ซ้ำ` });
    }
  }

  return out;
}

/** Destination checks that warn rather than block. */
export function destinationWarnings(t: Transfer): string[] {
  const out: string[] = [];
  const dst = WAREHOUSES.find((w) => w.code === t.dstWarehouse);
  if (!dst) return out;

  if (dst.status !== "Active") out.push("คลังปลายทางไม่ได้เปิดใช้งาน");
  if (dst.util >= 85) out.push(`คลังปลายทางใช้พื้นที่แล้ว ${dst.util}% ใกล้เต็ม`);
  if (dst.rules?.temp && dst.rules.temp !== "—" && t.srcWarehouse !== t.dstWarehouse)
    out.push(`คลังปลายทางควบคุมอุณหภูมิ ${dst.rules.temp} — ตรวจสอบความเหมาะสมของสินค้า`);
  if (dst.rules?.hazardous) out.push("คลังปลายทางมีข้อจำกัดด้านวัตถุอันตราย");
  if (t.dstStatus === "Available" && t.srcStatus === "Damaged")
    out.push("ห้ามโอนสินค้าเสียหายเข้าสถานะพร้อมขายโดยตรง");

  return out;
}

/* ---------- Summary ---------- */

export interface TransferSummary {
  total: number;
  draft: number;
  pendingApproval: number;
  ready: number;
  inTransit: number;
  partiallyReceived: number;
  completedToday: number;
  exceptions: number;
  cancelled: number;
  totalQty: number;
}

export function transferSummary(rows: TrfRow[] = TRANSFER_ROWS): TransferSummary {
  /* The mock data spans 2026, so "today" is the busiest completed day. */
  const completed = rows.filter((r) => r.status === "Completed");
  const byDay = new Map<string, number>();
  for (const r of completed) byDay.set(r.updated.split(" ")[0], (byDay.get(r.updated.split(" ")[0]) ?? 0) + 1);
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0;

  return {
    total: rows.length,
    draft: rows.filter((r) => r.status === "Draft").length,
    pendingApproval: rows.filter((r) => r.status === "Pending Approval").length,
    ready: rows.filter((r) => r.status === "Ready to Transfer" || r.status === "Approved").length,
    inTransit: rows.filter((r) => r.inTransitQty > 0).length,
    partiallyReceived: rows.filter((r) => r.status === "Partially Received").length,
    completedToday: busiest,
    exceptions: rows.filter((r) => r.openExceptions > 0 || r.status === "Exception").length,
    cancelled: rows.filter((r) => r.status === "Cancelled").length,
    totalQty: sum(rows, (r) => r.requestedQty),
  };
}

/* ---------- Badges ---------- */

export const TRF_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  "Pending Approval": "warning",
  Approved: "info",
  "Ready to Transfer": "info",
  "Partially Dispatched": "warning",
  Dispatched: "warning",
  "In Transit": "warning",
  "Partially Received": "warning",
  Received: "success",
  Completed: "success",
  Rejected: "danger",
  "Revision Requested": "warning",
  Exception: "danger",
  Cancelled: "neutral",
  Reversed: "danger",
  Closed: "neutral",
};

export const TRF_LINE_TONE: Record<string, BadgeTone> = {
  Pending: "neutral",
  "Partially Dispatched": "warning",
  "In Transit": "warning",
  "Partially Received": "warning",
  "Received with Variance": "danger",
  Received: "success",
};

export const TRF_METHOD_TONE: Record<string, BadgeTone> = {
  "Direct Transfer": "info",
  "Two-Step Transfer": "primary",
};
