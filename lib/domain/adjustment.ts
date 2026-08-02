import {
  ADJUSTMENTS,
  ADJ_APPROVAL_QTY,
  findReason,
  type AdjLine,
  type Adjustment,
} from "@/data/adjustments";
import type { BadgeTone } from "@/lib/types";
import { WAREHOUSES } from "./warehouse";
import { STOCK_POSITIONS, STOCK_SERIALS, productTotals } from "./stock";

/* ============================================================
   STOCK ADJUSTMENT — controlled corrections.

   Three shapes of change, and they behave differently:

     Quantity   — On Hand moves. Positive adds, negative removes.
     Status     — On Hand does NOT move; quantity shifts between
                  stock statuses.
     Correction — neither moves; location, lot, serial or expiry is
                  restated through a linked out/in pair rather than
                  overwriting the original record.

   Nothing here writes a balance. The document declares the change,
   posting hands it to Stock Card, and the ledger derives the rest.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

/* ---------- Line classification ---------- */

export const isIncrease = (l: AdjLine) =>
  l.action === "Increase Quantity";

export const isDecrease = (l: AdjLine) =>
  l.action === "Decrease Quantity" || l.action === "Scrap";

export const isStatusChange = (l: AdjLine) => l.action === "Change Stock Status";

export const isCorrection = (l: AdjLine) =>
  l.action === "Correct Location" ||
  l.action === "Correct Lot" ||
  l.action === "Correct Serial" ||
  l.action === "Correct Expiry";

export const lineQtyIn = (l: AdjLine) => (isIncrease(l) ? num(l.qty) : 0);
export const lineQtyOut = (l: AdjLine) => (isDecrease(l) ? num(l.qty) : 0);
export const lineStatusQty = (l: AdjLine) => (isStatusChange(l) ? num(l.qty) : 0);
export const lineValue = (l: AdjLine) =>
  Math.round((lineQtyIn(l) - lineQtyOut(l)) * num(l.unitCost) * 100) / 100;

/**
 * The movement type a line becomes when it posts. A correction turns into a
 * pair, which is why this returns a list rather than a single type.
 */
export function lineMovementTypes(l: AdjLine, reason = ""): string[] {
  if (isIncrease(l))
    return [reason === "Cycle Count Gain" ? "Count Gain" : "Positive Adjustment"];
  if (l.action === "Scrap") return ["Scrap"];
  if (isDecrease(l))
    return [reason === "Cycle Count Loss" ? "Count Loss" : "Negative Adjustment"];

  if (isStatusChange(l)) {
    const path = `${l.statusFrom} to ${l.statusTo}`;
    const known = [
      "Available to Damaged",
      "Damaged to Available",
      "Available to Blocked",
      "Blocked to Available",
      "Available to Expired",
      "Available to QC Hold",
      "QC Hold to Available",
      "QC Hold to Rejected",
      "Return Hold to Available",
    ];
    return known.includes(path) ? [path] : [];
  }

  if (l.action === "Correct Location")
    return ["Location Correction Out", "Location Correction In"];
  if (l.action === "Correct Lot") return ["Lot Correction Out", "Lot Correction In"];
  if (l.action === "Correct Serial")
    return ["Serial Correction Out", "Serial Correction In"];
  if (l.action === "Correct Expiry") return ["Expiry Correction"];
  return [];
}

/* ---------- Eligible stock ---------- */

/** How much of a product sits in one stock status at a warehouse. */
export function eligibleQty(product: string, warehouse: string, status = "Available") {
  const rows = STOCK_POSITIONS.filter(
    (r) => r.product === product && (!warehouse || r.warehouse === warehouse),
  );
  if (status === "QC Hold") return sum(rows, (r) => r.qcHold);
  if (status === "Return Hold") return sum(rows, (r) => r.returnHold);
  if (status === "Damaged" || status === "Scrap Hold") return sum(rows, (r) => r.damaged);
  if (status === "Reserved") return sum(rows, (r) => r.reserved);
  if (status === "Blocked")
    return sum(rows.filter((r) => r.blocked), (r) => r.onHand);
  if (status === "Expired")
    return sum(
      rows.filter((r) => r.expDays !== null && r.expDays < 0),
      (r) => r.onHand,
    );
  return sum(rows, (r) => Math.max(0, r.available));
}

/** Serials that may be corrected — present at the location and not shipped. */
export const adjustableSerials = (product: string, warehouse = "") =>
  STOCK_SERIALS.filter(
    (s) =>
      s.product === product &&
      (!warehouse || s.warehouse === warehouse) &&
      s.status !== "Issued",
  );

export const serialExists = (serial: string) =>
  STOCK_SERIALS.some((s) => s.serial === serial);

/* ---------- Stock impact ---------- */

export interface ImpactRow {
  product: string;
  name: string;
  unit: string;
  onHandBefore: number;
  onHandAfter: number;
  availableBefore: number;
  availableAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  qcBefore: number;
  qcAfter: number;
  returnBefore: number;
  returnAfter: number;
  damagedBefore: number;
  damagedAfter: number;
  blockedBefore: number;
  blockedAfter: number;
  valueBefore: number;
  valueAfter: number;
  /** Flags the preview highlights. */
  goesNegative: boolean;
  releasesRestricted: boolean;
  highValue: boolean;
}

const HIGH_VALUE = 20_000;
const RESTRICTED_FROM = ["QC Hold", "Damaged", "Blocked", "Expired", "Return Hold", "Scrap Hold"];

/**
 * What each line would do to the product's position. Computed per product so
 * two lines touching the same product accumulate, which is how a real preview
 * has to behave.
 */
export function stockImpact(a: Adjustment): ImpactRow[] {
  const byProduct = new Map<string, ImpactRow>();

  for (const l of a.items ?? []) {
    if (!l.code) continue;
    let row = byProduct.get(l.code);
    if (!row) {
      const t = productTotals(l.code);
      const blocked = eligibleQty(l.code, a.warehouse, "Blocked");
      row = {
        product: l.code,
        name: l.name,
        unit: l.unit,
        onHandBefore: t.onHand,
        onHandAfter: t.onHand,
        availableBefore: t.available,
        availableAfter: t.available,
        reservedBefore: t.reserved,
        reservedAfter: t.reserved,
        qcBefore: t.qcHold,
        qcAfter: t.qcHold,
        returnBefore: t.returnHold,
        returnAfter: t.returnHold,
        damagedBefore: t.damaged,
        damagedAfter: t.damaged,
        blockedBefore: blocked,
        blockedAfter: blocked,
        valueBefore: Math.round(t.onHand * num(l.unitCost) * 100) / 100,
        valueAfter: 0,
        goesNegative: false,
        releasesRestricted: false,
        highValue: false,
      };
      byProduct.set(l.code, row);
    }

    const qty = num(l.qty);

    if (isIncrease(l)) {
      row.onHandAfter += qty;
      row.availableAfter += qty;
    } else if (isDecrease(l)) {
      row.onHandAfter -= qty;
      /* A decrease draws from the status it names, not blindly from available. */
      if (l.statusFrom === "QC Hold") row.qcAfter -= qty;
      else if (l.statusFrom === "Return Hold") row.returnAfter -= qty;
      else {
        row.availableAfter -= qty;
        if (l.statusFrom === "Damaged" || l.statusFrom === "Scrap Hold")
          row.damagedAfter -= qty;
      }
    } else if (isStatusChange(l)) {
      /* Total on hand never moves — only where the quantity sits. */
      const take = (status: string) => {
        if (status === "Available") row.availableAfter -= qty;
        else if (status === "QC Hold") row.qcAfter -= qty;
        else if (status === "Return Hold") row.returnAfter -= qty;
        else if (status === "Damaged" || status === "Scrap Hold") row.damagedAfter -= qty;
        else if (status === "Blocked" || status === "Rejected") row.blockedAfter -= qty;
      };
      const give = (status: string) => {
        if (status === "Available") row.availableAfter += qty;
        else if (status === "QC Hold") row.qcAfter += qty;
        else if (status === "Return Hold") row.returnAfter += qty;
        else if (status === "Damaged" || status === "Scrap Hold") row.damagedAfter += qty;
        else if (status === "Blocked" || status === "Rejected") row.blockedAfter += qty;
      };
      take(l.statusFrom);
      give(l.statusTo);

      if (RESTRICTED_FROM.includes(l.statusFrom) && l.statusTo === "Available")
        row.releasesRestricted = true;
    }

    row.valueAfter = Math.round(row.onHandAfter * num(l.unitCost) * 100) / 100;
    if (Math.abs(lineValue(l)) >= HIGH_VALUE) row.highValue = true;
  }

  for (const row of byProduct.values()) {
    row.goesNegative =
      row.onHandAfter < 0 ||
      row.availableAfter < 0 ||
      row.qcAfter < 0 ||
      row.returnAfter < 0;
    if (!row.valueAfter) row.valueAfter = row.valueBefore;
  }

  return [...byProduct.values()];
}

/* ---------- Control ---------- */

export interface AdjIssue {
  field: string;
  message: string;
}

/** Reasons that force this adjustment through approval. */
export function approvalTriggers(a: Adjustment): string[] {
  const out: string[] = [];
  const meta = findReason(a.reason, a.reasonGroup);
  const items = a.items ?? [];
  const qty = sum(items, (l) => num(l.qty));
  const value = Math.abs(sum(items, lineValue));

  if (meta?.approvalRequired) out.push(`เหตุผล "${a.reason}" ต้องขออนุมัติเสมอ`);
  if (qty > ADJ_APPROVAL_QTY) out.push(`ปริมาณรวม ${qty} เกินเกณฑ์ ${ADJ_APPROVAL_QTY}`);
  if (meta && value > meta.valueThreshold)
    out.push(`มูลค่าผลกระทบสูงกว่าเกณฑ์ ${meta.valueThreshold.toLocaleString()}`);
  if (items.some((l) => isDecrease(l))) out.push("เป็นการปรับลดจำนวน");
  if (items.some((l) => RESTRICTED_FROM.includes(l.statusFrom) && l.statusTo === "Available"))
    out.push("ปล่อยสต๊อกที่ถูกกันไว้กลับสู่สถานะพร้อมขาย");
  if (items.some((l) => l.action === "Correct Serial" || l.action === "Correct Lot"))
    out.push("เป็นการแก้ไข Lot หรือ Serial");
  if (stockImpact(a).some((r) => r.goesNegative)) out.push("ผลลัพธ์ทำให้สต๊อกติดลบ");

  return [...new Set(out)];
}

export const evidenceRequired = (a: Adjustment) => {
  const meta = findReason(a.reason, a.reasonGroup);
  if (meta?.evidenceRequired) return true;
  const value = Math.abs(sum(a.items ?? [], lineValue));
  return value >= HIGH_VALUE || (a.items ?? []).some((l) => l.action === "Correct Serial");
};

/**
 * Everything that would stop this adjustment being submitted or posted.
 * Returned as a list so the form can render them inline.
 */
export function blockingIssues(a: Adjustment): AdjIssue[] {
  const out: AdjIssue[] = [];
  const items = a.items ?? [];
  const meta = findReason(a.reason, a.reasonGroup);

  if (!a.adjDate) out.push({ field: "adjDate", message: "ต้องระบุวันที่ปรับปรุง" });
  if (!a.type) out.push({ field: "type", message: "ต้องเลือกประเภทการปรับปรุง" });
  if (!a.reason) out.push({ field: "reason", message: "ต้องระบุเหตุผลการปรับปรุง" });
  if (!a.warehouse) out.push({ field: "warehouse", message: "ต้องระบุคลังสินค้า" });
  if (!items.length)
    out.push({ field: "items", message: "ต้องมีรายการอย่างน้อย 1 รายการ" });

  for (const l of items) {
    const at = `บรรทัด ${l.line}`;
    if (!l.code) {
      out.push({ field: `items.${l.line}`, message: `${at}: ต้องเลือกสินค้า` });
      continue;
    }
    if (num(l.qty) <= 0) {
      out.push({ field: `items.${l.line}`, message: `${at}: จำนวนต้องมากกว่า 0` });
      continue;
    }

    if (isDecrease(l)) {
      const cap = eligibleQty(l.code, a.warehouse, l.statusFrom);
      if (num(l.qty) > cap && !meta?.negativeAllowed) {
        out.push({
          field: `items.${l.line}`,
          message: `${at}: จำนวน ${l.qty} เกินยอด ${l.statusFrom} ที่มี ${cap}`,
        });
      }
      if (l.statusFrom === "Reserved") {
        out.push({
          field: `items.${l.line}`,
          message: `${at}: ห้ามลดสต๊อกที่ถูกจองไว้ ต้องยกเลิกการจองก่อน`,
        });
      }
    }

    if (isStatusChange(l)) {
      if (!l.statusTo)
        out.push({ field: `items.${l.line}`, message: `${at}: ต้องระบุสถานะปลายทาง` });
      else if (l.statusFrom === l.statusTo)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: สถานะต้นทางและปลายทางต้องต่างกัน`,
        });
      else if (!lineMovementTypes(l).length)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: เส้นทางสถานะ ${l.statusFrom} → ${l.statusTo} ไม่ได้รับอนุญาต`,
        });

      const cap = eligibleQty(l.code, a.warehouse, l.statusFrom);
      if (num(l.qty) > cap)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: จำนวน ${l.qty} เกินยอด ${l.statusFrom} ที่มี ${cap}`,
        });

      if (meta?.fromStatus.length && !meta.fromStatus.includes(l.statusFrom))
        out.push({
          field: `items.${l.line}`,
          message: `${at}: เหตุผล "${a.reason}" ใช้กับสถานะต้นทาง ${l.statusFrom} ไม่ได้`,
        });
      if (meta?.toStatus.length && !meta.toStatus.includes(l.statusTo))
        out.push({
          field: `items.${l.line}`,
          message: `${at}: เหตุผล "${a.reason}" ใช้กับสถานะปลายทาง ${l.statusTo} ไม่ได้`,
        });
    }

    if (l.action === "Correct Location") {
      if (!l.locTo)
        out.push({ field: `items.${l.line}`, message: `${at}: ต้องระบุตำแหน่งปลายทาง` });
      else if (l.locFrom === l.locTo)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: ตำแหน่งต้นทางและปลายทางต้องต่างกัน`,
        });
      /* A move between warehouses is a transfer, not a correction. */
      const srcWh = l.locFrom.split("/")[0];
      const dstWh = l.locTo.split("/")[0];
      if (srcWh && dstWh && srcWh.includes("WH-") && srcWh !== dstWh)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: การย้ายข้ามคลังต้องใช้ Stock Transfer`,
        });
    }

    if (l.action === "Correct Lot") {
      if (!l.lot || !l.lotTo)
        out.push({ field: `items.${l.line}`, message: `${at}: ต้องระบุทั้ง Lot เดิมและ Lot ใหม่` });
      else if (l.lot === l.lotTo)
        out.push({ field: `items.${l.line}`, message: `${at}: Lot เดิมและใหม่ต้องต่างกัน` });
    }

    if (l.action === "Correct Serial") {
      const from = l.serials ?? [];
      const to = l.serialsTo ?? [];
      if (!from.length || !to.length)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: ต้องระบุทั้ง Serial เดิมและ Serial ใหม่`,
        });
      if (from.length !== to.length)
        out.push({
          field: `items.${l.line}`,
          message: `${at}: จำนวน Serial เดิมและใหม่ต้องเท่ากัน`,
        });
      if (new Set([...from, ...to]).size !== from.length + to.length)
        out.push({ field: `items.${l.line}`, message: `${at}: มี Serial ซ้ำ` });
      for (const s of to)
        if (serialExists(s))
          out.push({
            field: `items.${l.line}`,
            message: `${at}: Serial ${s} มีอยู่ในระบบแล้ว`,
          });
    }

    if (l.action === "Correct Expiry" && !l.expTo)
      out.push({ field: `items.${l.line}`, message: `${at}: ต้องระบุวันหมดอายุใหม่` });

    const serials = l.serials ?? [];
    if (serials.length && !isCorrection(l) && serials.length !== num(l.qty))
      out.push({
        field: `items.${l.line}`,
        message: `${at}: เลือก Serial ${serials.length} ชิ้น ต้องเท่ากับจำนวน ${l.qty}`,
      });
  }

  if (evidenceRequired(a) && !(a.evidence ?? []).length)
    out.push({
      field: "evidence",
      message: `เหตุผล "${a.reason}" ต้องแนบหลักฐานอย่างน้อย 1 รายการ`,
    });

  return out;
}

/* ---------- Row ---------- */

export interface AdjRow extends Adjustment {
  name: string;
  icon: string;

  itemCount: number;
  qtyIn: number;
  qtyOut: number;
  netQty: number;
  statusQty: number;
  correctionQty: number;
  serialCount: number;
  lotCount: number;
  valueImpact: number;

  whLabel: string;
  location: string;

  direction: "Positive" | "Negative" | "Status Change" | "Correction" | "Mixed";
  needsApproval: boolean;
  approvalReasons: string[];
  needsEvidence: boolean;
  evidenceComplete: boolean;
  negativeRisk: boolean;
  restrictedRelease: boolean;
  openExceptions: number;

  isEditable: boolean;
  isLimitedEdit: boolean;
  isReadOnly: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canPost: boolean;
  canCancel: boolean;
  canReverse: boolean;
}

const EDITABLE = ["Draft", "Rejected", "Revision Requested"];
const LIMITED_EDIT = ["Pending Approval"];
const READ_ONLY = ["Approved", "Ready to Post", "Posted", "Cancelled", "Reversed", "Closed"];
const CLOSED = ["Posted", "Cancelled", "Reversed", "Closed"];

/** Whether the document reads as an increase, a decrease or a restatement. */
function directionOf(items: AdjLine[]): AdjRow["direction"] {
  const kinds = new Set(
    items.map((l) =>
      isIncrease(l)
        ? "Positive"
        : isDecrease(l)
          ? "Negative"
          : isStatusChange(l)
            ? "Status Change"
            : "Correction",
    ),
  );
  if (kinds.size === 1) return [...kinds][0] as AdjRow["direction"];
  return "Mixed";
}

export function decorate(a: Adjustment): AdjRow {
  const items = a.items ?? [];
  const wh = WAREHOUSES.find((w) => w.code === a.warehouse);
  const approvalReasons = approvalTriggers(a);
  const impact = stockImpact(a);

  const needsEvidence = evidenceRequired(a);
  const isEditable = EDITABLE.includes(a.status);
  const isLimitedEdit = LIMITED_EDIT.includes(a.status);
  const closed = CLOSED.includes(a.status);

  const qtyIn = sum(items, lineQtyIn);
  const qtyOut = sum(items, lineQtyOut);

  return {
    ...a,
    name: `${a.type} · ${a.reason}`,
    icon: "sliders",

    itemCount: items.length,
    qtyIn,
    qtyOut,
    netQty: qtyIn - qtyOut,
    statusQty: sum(items, lineStatusQty),
    correctionQty: sum(items, (l) => (isCorrection(l) ? num(l.qty) : 0)),
    serialCount: sum(items, (l) => (l.serials ?? []).length),
    lotCount: new Set(items.map((l) => l.lot).filter(Boolean)).size,
    valueImpact: Math.round(sum(items, lineValue) * 100) / 100,

    whLabel: `${a.warehouse} ${wh?.name ?? ""}`.trim(),
    location: [a.zone, a.rack, a.shelf, a.bin].filter(Boolean).join("-") || "—",

    direction: directionOf(items),
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
    needsEvidence,
    evidenceComplete: !needsEvidence || (a.evidence ?? []).length > 0,
    negativeRisk: impact.some((r) => r.goesNegative),
    restrictedRelease: impact.some((r) => r.releasesRestricted),
    openExceptions: (a.exceptions ?? []).filter((e) => e.status !== "Closed").length,

    isEditable,
    isLimitedEdit,
    isReadOnly: READ_ONLY.includes(a.status),

    canSubmit: isEditable && items.length > 0,
    canApprove: a.status === "Pending Approval",
    canReject: a.status === "Pending Approval",
    /* Approval and evidence both gate posting, and a posted document is done. */
    canPost:
      ["Approved", "Ready to Post"].includes(a.status) ||
      (a.status === "Draft" && approvalReasons.length === 0),
    canCancel: !closed,
    canReverse: a.status === "Posted" && !a.reversedBy,
  };
}

export const ADJUSTMENT_ROWS: AdjRow[] = ADJUSTMENTS.map(decorate);

export function decorateAdjustments() {
  ADJUSTMENT_ROWS.length = 0;
  ADJUSTMENT_ROWS.push(...ADJUSTMENTS.map(decorate));
  return ADJUSTMENT_ROWS;
}

export const adjustmentRows = () => ADJUSTMENT_ROWS;

export const getAdjustment = (code: string) =>
  ADJUSTMENT_ROWS.find((a) => a.code === code) ?? null;

export const rawAdjustment = (code: string) =>
  ADJUSTMENTS.find((a) => a.code === code) ?? null;

/* ---------- Summary ---------- */

export interface AdjSummary {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  postedToday: number;
  positive: number;
  negative: number;
  statusChange: number;
  reversed: number;
  valueImpact: number;
}

export function adjustmentSummary(rows: AdjRow[] = ADJUSTMENT_ROWS): AdjSummary {
  /* The mock data spans 2026 — "today" is the busiest posting day. */
  const byDay = new Map<string, number>();
  for (const r of rows.filter((x) => x.status === "Posted")) {
    const day = (r.postedDate || r.updated).split(" ")[0];
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return {
    total: rows.length,
    draft: rows.filter((r) => r.status === "Draft").length,
    pendingApproval: rows.filter((r) => r.status === "Pending Approval").length,
    approved: rows.filter((r) => r.status === "Approved" || r.status === "Ready to Post")
      .length,
    postedToday: [...byDay.values()].sort((a, b) => b - a)[0] ?? 0,
    positive: rows.filter((r) => r.qtyIn > 0).length,
    negative: rows.filter((r) => r.qtyOut > 0).length,
    statusChange: rows.filter((r) => r.statusQty > 0).length,
    reversed: rows.filter((r) => r.status === "Reversed" || r.reversalOf).length,
    valueImpact: Math.round(sum(rows, (r) => r.valueImpact) * 100) / 100,
  };
}

/* ---------- Badges ---------- */

export const ADJ_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  "Pending Approval": "warning",
  Approved: "info",
  "Ready to Post": "info",
  Posted: "success",
  Rejected: "danger",
  "Revision Requested": "warning",
  Cancelled: "neutral",
  Reversed: "danger",
  Exception: "danger",
  Closed: "neutral",
};

export const ADJ_DIRECTION_TONE: Record<string, BadgeTone> = {
  Positive: "success",
  Negative: "danger",
  "Status Change": "warning",
  Correction: "info",
  Mixed: "primary",
};

export const ADJ_ACTION_TONE: Record<string, BadgeTone> = {
  "Increase Quantity": "success",
  "Decrease Quantity": "danger",
  Scrap: "danger",
  "Change Stock Status": "warning",
  "Correct Location": "info",
  "Correct Lot": "info",
  "Correct Serial": "info",
  "Correct Expiry": "info",
  Other: "neutral",
};
