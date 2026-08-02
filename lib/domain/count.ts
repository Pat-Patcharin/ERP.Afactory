import {
  COUNTS,
  COUNT_TOLERANCE,
  type Count,
  type CntLine,
} from "@/data/counts";
import type { BadgeTone } from "@/lib/types";
import { WAREHOUSES } from "./warehouse";
import { parseStamp } from "./inventory";
import { movementRows } from "./movement";

/* ============================================================
   CYCLE COUNT — what was found, against what the system held.

   A count document is evidence, not a transaction. It records the
   physical quantity, compares it with the snapshot, and hands an
   approved variance to Stock Adjustment. Nothing here writes a
   balance, and nothing in Stock Inquiry or Stock Card changes until
   an adjustment posts.

   The variance maths is deliberately explicit, including the case
   the formula does not cover: a system quantity of zero has no
   percentage, so the line is classified as unexpected stock instead.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

/* ---------- Line maths ---------- */

/** The quantity the counter settled on: recount wins, then first count. */
export const countedQty = (l: CntLine): number | null =>
  l.finalCount ?? l.recount ?? l.firstCount;

export const isCounted = (l: CntLine) => countedQty(l) !== null;

/**
 * Package maths the count sheet offers instead of a flat number:
 * full packages × units per package + loose units.
 */
export const packageTotal = (l: {
  packages: number;
  unitsPerPackage: number;
  looseUnits: number;
}) => num(l.packages) * num(l.unitsPerPackage) + num(l.looseUnits);

export const varianceQty = (l: CntLine): number => {
  const counted = countedQty(l);
  return counted === null ? 0 : counted - num(l.systemQty);
};

/** Percentage against the system quantity; null when there is nothing to divide by. */
export const variancePct = (l: CntLine): number | null => {
  const system = num(l.systemQty);
  if (system <= 0) return null;
  return Math.round((varianceQty(l) / system) * 1000) / 10;
};

export const varianceValue = (l: CntLine) =>
  Math.round(varianceQty(l) * num(l.unitCost) * 100) / 100;

/** Serial results that mean the physical unit is not where it should be. */
const SERIAL_PROBLEM = ["Missing", "Unexpected Serial", "Wrong Location", "Duplicate Scan", "Status Mismatch"];

export const serialMismatch = (l: CntLine) =>
  (l.serials ?? []).some((s) => SERIAL_PROBLEM.includes(s.result));

/** What kind of variance this line represents. */
export function varianceType(l: CntLine): string {
  if (!isCounted(l)) return "No Variance";
  if (serialMismatch(l)) return "Serial Mismatch";

  const system = num(l.systemQty);
  const counted = countedQty(l)!;
  if (system === 0 && counted > 0) return "Unexpected Stock";
  if (counted === 0 && system > 0) return "Missing Stock";

  const v = varianceQty(l);
  if (v === 0) return "No Variance";
  return v > 0 ? "Positive Variance" : "Negative Variance";
}

export const isHighValue = (l: CntLine) =>
  Math.abs(varianceValue(l)) >= COUNT_TOLERANCE.highValue;

/**
 * Whether a line needs a recount. Tolerance decides the ordinary cases;
 * some conditions force one no matter how small the number is.
 */
export function needsRecount(l: CntLine): boolean {
  if (!isCounted(l)) return false;
  if (l.recount !== null) return false; /* already recounted */

  const type = varianceType(l);
  if (COUNT_TOLERANCE.alwaysRecount.includes(type)) return true;
  if (isHighValue(l)) return true;

  const v = Math.abs(varianceQty(l));
  if (v === 0) return false;
  if (v > COUNT_TOLERANCE.qty) {
    const pct = variancePct(l);
    if (pct === null) return true;
    return Math.abs(pct) > COUNT_TOLERANCE.pct;
  }
  return false;
}

export function withinTolerance(l: CntLine): boolean {
  if (!isCounted(l)) return true;
  if (COUNT_TOLERANCE.alwaysRecount.includes(varianceType(l))) return false;
  if (isHighValue(l)) return false;
  const v = Math.abs(varianceQty(l));
  if (v > COUNT_TOLERANCE.qty) {
    const pct = variancePct(l);
    return pct !== null && Math.abs(pct) <= COUNT_TOLERANCE.pct;
  }
  return true;
}

export function riskLevel(l: CntLine): "Low" | "Medium" | "High" | "Critical" {
  if (serialMismatch(l) || varianceType(l) === "Unexpected Stock") return "Critical";
  if (isHighValue(l) || varianceType(l) === "Missing Stock") return "High";
  if (!withinTolerance(l)) return "Medium";
  return "Low";
}

/** What Stock Adjustment should do with this line once approved. */
export function recommendedAction(l: CntLine): string {
  const type = varianceType(l);
  if (type === "No Variance") return "ไม่ต้องดำเนินการ";
  if (type === "Serial Mismatch") return "แก้ไข Serial หรือเปิดรายการปัญหา";
  if (type === "Lot Mismatch") return "แก้ไข Lot";
  if (varianceQty(l) > 0) return "ปรับเพิ่มจำนวน";
  return "ปรับลดจำนวน";
}

/* ---------- Blind count ---------- */

const REVEALED = [
  "Count Submitted",
  "Variance Review",
  "Recount Required",
  "Recount Submitted",
  "Approved",
  "Adjustment Pending",
  "Adjustment Created",
  "Completed",
  "Rejected",
  "Revision Requested",
  "Exception",
  "Closed",
];

/**
 * A blind count hides the system quantity, the variance and the value from
 * the counter until the count is submitted. After submission the reviewer
 * sees everything.
 */
export const isBlind = (c: Count) => c.method === "Blind Count";

export const systemQtyVisible = (c: Count) => !isBlind(c) || REVEALED.includes(c.status);

/* ---------- Movement warning ---------- */

export interface MovementWarning {
  when: string;
  type: string;
  doc: string;
  product: string;
  qty: number;
  user: string;
  decision: string;
}

/**
 * Stock that moved after the snapshot was taken. Phase 1 does not freeze
 * inventory, so the count surfaces the movement and asks a human to decide.
 */
export function movementWarnings(c: Count): MovementWarning[] {
  const snap = parseStamp(c.snapshotAt);
  if (!snap) return c.movements ?? [];
  const products = new Set((c.lines ?? []).map((l) => l.code));

  const derived = movementRows()
    .filter((m) => products.has(m.product) && m.ts > snap && m.warehouse === c.warehouse)
    .slice(0, 5)
    .map((m) => ({
      when: m.when,
      type: m.type,
      doc: m.sourceDoc || m.code,
      product: m.product,
      qty: m.qtyIn || m.qtyOut,
      user: m.user,
      decision: "ยังไม่ได้ตัดสินใจ",
    }));

  return [...(c.movements ?? []), ...derived];
}

/* ---------- Accuracy ---------- */

export interface CountAccuracy {
  totalLines: number;
  countedLines: number;
  remainingLines: number;
  matchingLines: number;
  varianceLines: number;
  recountLines: number;
  completion: number;
  lineAccuracy: number;
  qtyAccuracy: number;
  locationAccuracy: number;
  lotAccuracy: number;
  serialAccuracy: number;
  firstCountAccuracy: number;
  recountRate: number;
  positiveVariance: number;
  negativeVariance: number;
  netVariance: number;
  varianceValue: number;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function accuracy(c: Count): CountAccuracy {
  const lines = c.lines ?? [];
  const counted = lines.filter(isCounted);
  const matching = counted.filter((l) => varianceQty(l) === 0);
  const variance = counted.filter((l) => varianceQty(l) !== 0);
  const recounted = lines.filter((l) => l.recount !== null);
  const firstMatching = counted.filter((l) => num(l.firstCount) === num(l.systemQty));

  const systemTotal = sum(counted, (l) => num(l.systemQty));
  const absVariance = sum(counted, (l) => Math.abs(varianceQty(l)));

  const lotLines = counted.filter((l) => l.lot);
  const serialLines = counted.filter((l) => (l.serials ?? []).length > 0);
  const serialUnits = serialLines.flatMap((l) => l.serials);

  return {
    totalLines: lines.length,
    countedLines: counted.length,
    remainingLines: lines.length - counted.length,
    matchingLines: matching.length,
    varianceLines: variance.length,
    recountLines: lines.filter(needsRecount).length,
    completion: pct(counted.length, lines.length),
    lineAccuracy: pct(matching.length, counted.length),
    /* Safe when the snapshot held nothing: no basis, so report full accuracy. */
    qtyAccuracy:
      systemTotal > 0
        ? Math.max(0, Math.round((1 - absVariance / systemTotal) * 1000) / 10)
        : counted.length === matching.length
          ? 100
          : 0,
    locationAccuracy: pct(
      counted.filter((l) => varianceType(l) !== "Location Mismatch").length,
      counted.length,
    ),
    lotAccuracy: pct(lotLines.filter((l) => varianceQty(l) === 0).length, lotLines.length),
    serialAccuracy: pct(
      serialUnits.filter((s) => s.result === "Found and Matched").length,
      serialUnits.length,
    ),
    firstCountAccuracy: pct(firstMatching.length, counted.length),
    recountRate: pct(recounted.length, counted.length),
    positiveVariance: sum(
      counted.filter((l) => varianceQty(l) > 0),
      varianceQty,
    ),
    negativeVariance: sum(
      counted.filter((l) => varianceQty(l) < 0),
      varianceQty,
    ),
    netVariance: sum(counted, varianceQty),
    varianceValue: Math.round(sum(counted, varianceValue) * 100) / 100,
  };
}

/* ---------- Row ---------- */

export interface CntRow extends Count {
  name: string;
  icon: string;

  whLabel: string;
  scopeLabel: string;
  locationCount: number;
  productCount: number;
  lotCount: number;
  serialCount: number;

  acc: CountAccuracy;
  countAccuracy: number;
  completion: number;
  openExceptions: number;
  movementWarnings: number;

  blind: boolean;
  systemVisible: boolean;
  /** A counter must not approve their own count. */
  segregationOk: boolean;
  needsApproval: boolean;
  approvalReasons: string[];
  openRecountLines: number;
  highRiskLines: number;

  isEditable: boolean;
  isLimitedEdit: boolean;
  isReadOnly: boolean;
  canEnterCounts: boolean;
  canAssign: boolean;
  canStart: boolean;
  canPause: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canRecount: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreateAdjustment: boolean;
  canCancel: boolean;
  canReopen: boolean;
}

const EDITABLE = ["Draft", "Planned", "Revision Requested"];
const LIMITED_EDIT = ["Assigned"];
const ENTRY = ["In Progress", "Recount Required", "Recount Submitted", "Paused"];
const READ_ONLY = [
  "Count Submitted",
  "Variance Review",
  "Approved",
  "Adjustment Pending",
  "Adjustment Created",
  "Completed",
  "Cancelled",
  "Closed",
];
const CLOSED = ["Completed", "Cancelled", "Closed", "Adjustment Created"];

/** Why this count needs approval before its variance can become an adjustment. */
export function approvalTriggers(c: Count): string[] {
  const out: string[] = [];
  const lines = (c.lines ?? []).filter(isCounted);

  if (lines.some((l) => !withinTolerance(l))) out.push("มีบรรทัดที่ส่วนต่างเกินเกณฑ์");
  if (lines.some(isHighValue)) out.push("มีบรรทัดที่มูลค่าส่วนต่างสูง");
  if (lines.some(serialMismatch)) out.push("Serial ไม่ตรงกับระบบ");
  if (lines.some((l) => varianceType(l) === "Unexpected Stock"))
    out.push("พบสินค้าที่ระบบไม่ได้บันทึกไว้");
  if (lines.some((l) => varianceType(l) === "Missing Stock")) out.push("พบสินค้าหายทั้งบรรทัด");
  if (c.statusScope && c.statusScope !== "Available")
    out.push(`ตรวจนับสต๊อกสถานะ ${c.statusScope}`);
  if (lines.some((l) => l.excluded)) out.push("มีบรรทัดที่ยอมรับส่วนต่างโดยไม่ปรับปรุง");
  if (lines.some((l) => l.recount !== null && l.recount !== l.firstCount))
    out.push("ผลนับซ้ำต่างจากผลนับครั้งแรก");

  return out;
}

export function decorate(c: Count): CntRow {
  const lines = c.lines ?? [];
  const acc = accuracy(c);
  const wh = WAREHOUSES.find((w) => w.code === c.warehouse);
  const approvalReasons = approvalTriggers(c);

  const openRecountLines = lines.filter(needsRecount).length;
  const segregationOk = !c.approvedBy || c.approvedBy !== c.counter;

  const isEditable = EDITABLE.includes(c.status);
  const isLimitedEdit = LIMITED_EDIT.includes(c.status);
  const canEnterCounts = ENTRY.includes(c.status);
  const closed = CLOSED.includes(c.status);

  const scopeBits = [c.zone, c.rack, c.bin].filter(Boolean);

  return {
    ...c,
    name: `${c.type} · ${c.method}`,
    icon: "checkCircle",

    whLabel: `${c.warehouse} ${wh?.name ?? ""}`.trim(),
    scopeLabel: scopeBits.length ? scopeBits.join("-") : "ทั้งคลัง",
    locationCount: new Set(lines.map((l) => `${l.zone}-${l.rack}-${l.bin}`)).size,
    productCount: new Set(lines.map((l) => l.code)).size,
    lotCount: new Set(lines.map((l) => l.lot).filter(Boolean)).size,
    serialCount: lines.reduce((t, l) => t + (l.serials ?? []).length, 0),

    acc,
    countAccuracy: acc.lineAccuracy,
    completion: acc.completion,
    openExceptions: (c.exceptions ?? []).filter((e) => e.status !== "Closed").length,
    movementWarnings: (c.movements ?? []).length,

    blind: isBlind(c),
    systemVisible: systemQtyVisible(c),
    segregationOk,
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
    openRecountLines,
    highRiskLines: lines.filter((l) => ["High", "Critical"].includes(riskLevel(l))).length,

    isEditable,
    isLimitedEdit,
    isReadOnly: READ_ONLY.includes(c.status),
    canEnterCounts,

    canAssign: ["Draft", "Planned", "Assigned"].includes(c.status),
    canStart: ["Planned", "Assigned", "Paused"].includes(c.status) && Boolean(c.counter),
    canPause: c.status === "In Progress",
    canSubmit:
      ["In Progress", "Recount Required"].includes(c.status) &&
      lines.length > 0 &&
      lines.every(isCounted),
    canReview: ["Count Submitted", "Recount Submitted"].includes(c.status),
    canRecount: ["Variance Review", "Count Submitted", "Recount Required"].includes(c.status),
    /* Approval is blocked while a mandatory recount line is still open. */
    canApprove:
      ["Variance Review", "Recount Submitted"].includes(c.status) && openRecountLines === 0,
    canReject: ["Count Submitted", "Variance Review", "Recount Submitted"].includes(c.status),
    canCreateAdjustment:
      c.status === "Approved" ||
      (c.status === "Adjustment Pending" && !c.adjustmentRef),
    canCancel: !closed && c.status !== "Rejected",
    canReopen: ["Count Submitted", "Variance Review", "Rejected"].includes(c.status),
  };
}

export const COUNT_ROWS: CntRow[] = COUNTS.map(decorate);

export function decorateCounts() {
  COUNT_ROWS.length = 0;
  COUNT_ROWS.push(...COUNTS.map(decorate));
  return COUNT_ROWS;
}

export const countRows = () => COUNT_ROWS;

export const getCount = (code: string) => COUNT_ROWS.find((c) => c.code === code) ?? null;

export const rawCount = (code: string) => COUNTS.find((c) => c.code === code) ?? null;

/* ---------- Validation ---------- */

export interface CountIssue {
  field: string;
  message: string;
}

export function blockingIssues(c: Count): CountIssue[] {
  const out: CountIssue[] = [];
  const lines = c.lines ?? [];

  if (!c.countDate) out.push({ field: "countDate", message: "ต้องระบุวันที่ตรวจนับ" });
  if (!c.type) out.push({ field: "type", message: "ต้องเลือกประเภทการตรวจนับ" });
  if (!c.method) out.push({ field: "method", message: "ต้องเลือกวิธีการตรวจนับ" });
  if (!c.warehouse) out.push({ field: "warehouse", message: "ต้องระบุคลังสินค้า" });
  if (!c.scope) out.push({ field: "scope", message: "ต้องระบุขอบเขตการตรวจนับ" });
  if (!c.supervisor) out.push({ field: "supervisor", message: "ต้องระบุผู้ตรวจสอบ" });
  if (!c.scheduledStart) out.push({ field: "scheduledStart", message: "ต้องระบุวันเวลาที่เริ่ม" });
  if (!lines.length)
    out.push({ field: "lines", message: "ต้องมีรายการตรวจนับอย่างน้อย 1 รายการ" });

  const seen = new Set<string>();
  for (const l of lines) {
    const at = `บรรทัด ${l.line}`;
    const key = `${l.code}|${l.warehouse}|${l.zone}-${l.rack}-${l.bin}|${l.lot}|${l.stockStatus}`;
    if (seen.has(key))
      out.push({ field: `lines.${l.line}`, message: `${at}: รายการซ้ำกับบรรทัดก่อนหน้า` });
    seen.add(key);

    const counted = countedQty(l);
    if (counted !== null && counted < 0)
      out.push({ field: `lines.${l.line}`, message: `${at}: จำนวนที่นับได้ต้องไม่ติดลบ` });

    if (l.serialRequired && counted !== null) {
      const scanned = (l.serials ?? []).filter((s) => s.scanned);
      if (scanned.length !== counted)
        out.push({
          field: `lines.${l.line}`,
          message: `${at}: จำนวน Serial ที่สแกน ${scanned.length} ต้องเท่ากับจำนวนที่นับได้ ${counted}`,
        });
      const codes = (l.serials ?? []).map((s) => s.serial);
      if (new Set(codes).size !== codes.length)
        out.push({ field: `lines.${l.line}`, message: `${at}: มี Serial ซ้ำ` });
    }
  }

  return out;
}

/** What stops this count being submitted. */
export function submitIssues(c: Count): CountIssue[] {
  const out = blockingIssues(c);
  if (!c.counter) out.push({ field: "counter", message: "ต้องระบุผู้ตรวจนับก่อนส่งผล" });
  const missing = (c.lines ?? []).filter((l) => !isCounted(l));
  if (missing.length)
    out.push({
      field: "lines",
      message: `ยังนับไม่ครบ ${missing.length} บรรทัด — ระบุจำนวนหรือกด "ไม่พบสินค้า"`,
    });
  return out;
}

/** What stops this count being approved. */
export function approvalIssues(c: Count): CountIssue[] {
  const out: CountIssue[] = [];
  const open = (c.lines ?? []).filter(needsRecount);
  if (open.length)
    out.push({ field: "lines", message: `ยังมี ${open.length} บรรทัดที่ต้องนับซ้ำก่อนอนุมัติ` });

  const accepted = (c.lines ?? []).filter(
    (l) => isCounted(l) && varianceQty(l) !== 0 && !l.rootCause,
  );
  if (accepted.length)
    out.push({
      field: "lines",
      message: `ต้องระบุสาเหตุของส่วนต่างอีก ${accepted.length} บรรทัด`,
    });

  if (c.approvedBy && c.approvedBy === c.counter)
    out.push({ field: "supervisor", message: "ผู้ตรวจนับอนุมัติงานของตัวเองไม่ได้" });

  return out;
}

/* ---------- Variance lines for handoff ---------- */

export interface VarianceLine {
  line: CntLine;
  variance: number;
  pct: number | null;
  type: string;
  risk: string;
  value: number;
  action: string;
}

/** Every counted line that differs from the snapshot. */
export const varianceLines = (c: Count): VarianceLine[] =>
  (c.lines ?? [])
    .filter((l) => isCounted(l) && varianceQty(l) !== 0)
    .map((l) => ({
      line: l,
      variance: varianceQty(l),
      pct: variancePct(l),
      type: varianceType(l),
      risk: riskLevel(l),
      value: varianceValue(l),
      action: recommendedAction(l),
    }));

/** The lines that will become adjustment lines — excluded ones are left out. */
export const adjustableLines = (c: Count) =>
  varianceLines(c).filter((v) => !v.line.excluded);

/* ---------- Summary ---------- */

export interface CountSummary {
  total: number;
  planned: number;
  inProgress: number;
  submitted: number;
  varianceReview: number;
  recountRequired: number;
  adjustmentPending: number;
  completedToday: number;
  accuracy: number;
  varianceValue: number;
}

export function countSummary(rows: CntRow[] = COUNT_ROWS): CountSummary {
  const completed = rows.filter((r) => r.status === "Completed");
  const byDay = new Map<string, number>();
  for (const r of completed) {
    const day = r.updated.split(" ")[0];
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const scored = rows.filter((r) => r.acc.countedLines > 0);

  return {
    total: rows.length,
    planned: rows.filter((r) => r.status === "Planned").length,
    inProgress: rows.filter((r) => r.status === "In Progress").length,
    submitted: rows.filter((r) => r.status === "Count Submitted").length,
    varianceReview: rows.filter((r) => r.status === "Variance Review").length,
    recountRequired: rows.filter(
      (r) => r.status === "Recount Required" || r.openRecountLines > 0,
    ).length,
    adjustmentPending: rows.filter((r) => r.status === "Adjustment Pending").length,
    completedToday: [...byDay.values()].sort((a, b) => b - a)[0] ?? 0,
    accuracy: scored.length
      ? Math.round((sum(scored, (r) => r.acc.lineAccuracy) / scored.length) * 10) / 10
      : 0,
    varianceValue: Math.round(sum(rows, (r) => r.acc.varianceValue) * 100) / 100,
  };
}

/* ---------- Badges ---------- */

export const CNT_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Planned: "info",
  Assigned: "info",
  "In Progress": "warning",
  Paused: "neutral",
  "Count Submitted": "info",
  "Variance Review": "warning",
  "Recount Required": "danger",
  "Recount Submitted": "warning",
  Approved: "success",
  "Adjustment Pending": "warning",
  "Adjustment Created": "info",
  Completed: "success",
  Rejected: "danger",
  "Revision Requested": "warning",
  Cancelled: "neutral",
  Exception: "danger",
  Closed: "neutral",
};

export const VARIANCE_TONE: Record<string, BadgeTone> = {
  "No Variance": "success",
  "Positive Variance": "info",
  "Negative Variance": "warning",
  "Unexpected Stock": "danger",
  "Missing Stock": "danger",
  "Serial Mismatch": "danger",
  "Lot Mismatch": "warning",
  "Location Mismatch": "warning",
  "Status Mismatch": "warning",
};

export const RISK_TONE: Record<string, BadgeTone> = {
  Low: "success",
  Medium: "warning",
  High: "danger",
  Critical: "danger",
};

export const SERIAL_RESULT_TONE: Record<string, BadgeTone> = {
  "Found and Matched": "success",
  Missing: "danger",
  "Unexpected Serial": "danger",
  "Wrong Location": "warning",
  "Duplicate Scan": "danger",
  "Status Mismatch": "warning",
  Damaged: "warning",
  Other: "neutral",
};
