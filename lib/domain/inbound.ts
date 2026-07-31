import { GOODS_RECEIPTS as RAW_GR, type GoodsReceipt } from "@/data/goods-receipts";
import { QC_INSPECTIONS as RAW_QC, QC_SUPPLIER_STATS, type QcInspection } from "@/data/qc";
import { PA_BIN_USAGE, PUTAWAY_TASKS as RAW_PA, type PutAwayTask } from "@/data/putaway";
import { PRODUCTS } from "./product";
import { WAREHOUSES, flattenBins, type BinRow } from "./warehouse";
import { daysUntil } from "@/lib/format";

/* ============================================================
   GOODS RECEIPT
   Goods requiring QC are received into QC Hold and do NOT become
   available inventory until QC passes.
   ============================================================ */

export interface GrRow extends GoodsReceipt {
  itemCount: number;
  totalReceiving: number;
  totalOrdered: number;
  discCount: number;
  name: string;
  icon: string;
  recvPct: number;
}

export const GOODS_RECEIPTS = RAW_GR as GrRow[];

type GrItem = {
  ordered?: number;
  prevRecv?: number;
  receiveNow?: number;
  accepted?: number;
  rejected?: number;
  qc?: boolean;
  disc?: string;
};

export const grItemFinalRecv = (it: GrItem) =>
  (Number(it.prevRecv) || 0) + (Number(it.receiveNow) || 0);
export const grItemRemaining = (it: GrItem) =>
  Math.max(0, (Number(it.ordered) || 0) - (Number(it.prevRecv) || 0));
/** Positive means received MORE than was outstanding — an over-receipt. */
export const grItemVariance = (it: GrItem) =>
  (Number(it.receiveNow) || 0) - grItemRemaining(it);

const sum = (items: GrItem[] | undefined, pick: (it: GrItem) => number) =>
  (items ?? []).reduce((s, it) => s + pick(it), 0);

export const grTotalReceiving = (gr: { items?: GrItem[] }) =>
  sum(gr.items, (it) => Number(it.receiveNow) || 0);
export const grTotalAccepted = (gr: { items?: GrItem[] }) =>
  sum(gr.items, (it) => Number(it.accepted) || 0);
export const grTotalRejected = (gr: { items?: GrItem[] }) =>
  sum(gr.items, (it) => Number(it.rejected) || 0);
export const grTotalOrdered = (gr: { items?: GrItem[] }) =>
  sum(gr.items, (it) => Number(it.ordered) || 0);
export const grDiscrepancyCount = (gr: { items?: GrItem[] }) =>
  (gr.items ?? []).filter((it) => it.disc).length;

export function decorateGRs() {
  for (const gr of GOODS_RECEIPTS) {
    gr.itemCount = gr.items?.length ?? 0;
    gr.totalReceiving = grTotalReceiving(gr);
    gr.totalOrdered = grTotalOrdered(gr);
    gr.discCount = grDiscrepancyCount(gr);
    gr.name = gr.code;
    gr.icon = "📦";
    gr.recvPct = gr.totalOrdered
      ? Math.min(100, Math.round((grTotalAccepted(gr) / gr.totalOrdered) * 100))
      : 100;
  }
}

decorateGRs();

export const getGR = (code: string) =>
  GOODS_RECEIPTS.find((g) => g.code === code) ?? null;

export function nextGRCode(): string {
  const n = GOODS_RECEIPTS.reduce(
    (m, g) => Math.max(m, parseInt(String(g.code).replace(/\D/g, ""), 10) || 0),
    25060000,
  );
  return `GR${n + 1}`;
}

/**
 * Which control regime a product falls under. Derived from the code so the
 * mock data stays self-consistent; the real system reads it from the master.
 */
export function grProductControls(code: string) {
  const p = PRODUCTS.find((x) => x.code === code);
  const hasExpiry = Boolean(p?.expiry && p.expiry !== "—");
  const isEquipment =
    /handpiece|locator|chair|scaler|apex/i.test(p?.name ?? "") || /HP|EQ|MD/i.test(code);
  return {
    lot: !isEquipment,
    serial: isEquipment,
    expiry: hasExpiry,
    qc: isEquipment || /AB-AC|CEM|BOND/i.test(code),
  };
}

/* ============================================================
   QC INSPECTION
   ============================================================ */

export interface QcRow extends QcInspection {
  name: string;
  icon: string;
  passRate: number;
  isOverdue: boolean;
}

export const QC_INSPECTIONS = RAW_QC as QcRow[];

export const QC_CHECKLIST_ITEMS = [
  "Packaging Condition", "Product Identity", "Quantity", "Appearance",
  "Dimension", "Color", "Function Test", "Expiry Date", "Lot Number",
  "Serial Number", "Certificate", "Label", "Sterilization", "Documentation",
];

export const newChecklist = () =>
  QC_CHECKLIST_ITEMS.map((item) => ({ item, result: "", comment: "" }));

export function qcChecklistStats(qc: { checklist?: { result?: string }[] }) {
  const c = qc.checklist ?? [];
  return {
    total: c.length,
    pass: c.filter((x) => x.result === "pass").length,
    fail: c.filter((x) => x.result === "fail").length,
    na: c.filter((x) => x.result === "na").length,
    pending: c.filter((x) => !x.result).length,
  };
}

export function qcPassRate(qc: { acceptedQty?: number; rejectedQty?: number }) {
  const t = (Number(qc.acceptedQty) || 0) + (Number(qc.rejectedQty) || 0);
  return t ? Math.round(((Number(qc.acceptedQty) || 0) / t) * 100) : 0;
}

export const qcPendingQty = (qc: {
  receivedQty?: number;
  acceptedQty?: number;
  rejectedQty?: number;
}) =>
  Math.max(
    0,
    (Number(qc.receivedQty) || 0) - (Number(qc.acceptedQty) || 0) - (Number(qc.rejectedQty) || 0),
  );

export const qcSupplierStat = (name: string) =>
  QC_SUPPLIER_STATS[name] ?? { failRate: 3, openNcr: 0, trend: "flat", passNorm: 96 };

export function decorateQCs() {
  for (const qc of QC_INSPECTIONS) {
    qc.name = qc.code;
    qc.icon = "🔬";
    qc.passRate = qcPassRate(qc);
    const d = daysUntil(qc.dueDate);
    qc.isOverdue = d !== null && d < 0 && !["Completed", "Cancelled"].includes(qc.status);
  }
}

decorateQCs();

export const getQC = (code: string) =>
  QC_INSPECTIONS.find((q) => q.code === code) ?? null;

export function nextQCCode(): string {
  const n = QC_INSPECTIONS.reduce(
    (m, q) => Math.max(m, parseInt(String(q.code).replace(/\D/g, ""), 10) || 0),
    25060000,
  );
  return `QC${n + 1}`;
}

/* ============================================================
   PUT AWAY — final inbound step
   ============================================================ */

export interface PaRow extends PutAwayTask {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  completedQty: number;
  remainingQty: number;
  pct: number;
  headProduct: string;
  headLot: string;
  curLoc: string;
  suggestBin: string;
}

export const PUTAWAY_TASKS = RAW_PA as PaRow[];

type PaItem = { qty?: number; status?: string };

export const paTotalQty = (t: { items?: PaItem[] }) =>
  (t.items ?? []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
export const paCompletedQty = (t: { items?: PaItem[] }) =>
  (t.items ?? [])
    .filter((it) => it.status === "Completed")
    .reduce((s, it) => s + (Number(it.qty) || 0), 0);

export const paBinShort = (path: string | undefined) =>
  path ? path.split("/").slice(-1)[0] : "—";

/** All putaway-enabled bins across warehouses, with mock utilisation. */
export function paAllBins(): (BinRow & { used: number; free: number })[] {
  const out: (BinRow & { used: number; free: number })[] = [];
  for (const w of WAREHOUSES) {
    for (const b of flattenBins(w)) {
      if (b.putaway === false || b.status !== "Active") continue;
      const used = PA_BIN_USAGE[b.path] ?? 0;
      out.push({
        ...b,
        used,
        free: Math.max(0, b.cap - Math.round((b.cap * used) / 100)),
      });
    }
  }
  return out;
}

export const paBinInfo = (path: string | undefined) =>
  paAllBins().find((b) => b.path === path) ?? null;

/**
 * Smart location suggestion. Scores putaway bins on utilisation (prefer
 * emptier), capacity fit, temperature match and existing-stock grouping.
 */
export function paSuggestBins(
  product: string,
  qty: number,
  opts: { fastMoving?: boolean; temp?: string; existingBin?: string } = {},
) {
  return paAllBins()
    .map((b) => {
      let score = 60;
      const reasons: string[] = [];

      if (b.used <= 40) {
        score += 20;
        reasons.push("utilization ต่ำ");
      } else if (b.used <= 80) score += 8;
      else {
        score -= 25;
        reasons.push("utilization สูง");
      }

      if (b.free >= (qty || 0)) {
        score += 12;
        reasons.push("รองรับจำนวนได้");
      } else {
        score -= 30;
        reasons.push("พื้นที่ไม่พอ");
      }

      if (b.binType === "Pick Face" && opts.fastMoving) {
        score += 6;
        reasons.push("Pick Face");
      }
      if (opts.temp && b.temp && opts.temp !== "Ambient" && b.temp === opts.temp) {
        score += 8;
        reasons.push("อุณหภูมิตรง");
      }
      if (opts.existingBin && b.path === opts.existingBin) {
        score += 15;
        reasons.push("มีสินค้าเดิมอยู่แล้ว");
      }

      return { ...b, score: Math.max(0, Math.min(100, score)), reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function decoratePAs() {
  for (const t of PUTAWAY_TASKS) {
    t.name = t.code;
    t.icon = "📥";
    t.itemCount = t.items?.length ?? 0;
    t.totalQty = paTotalQty(t);
    t.completedQty = paCompletedQty(t);
    t.remainingQty = t.totalQty - t.completedQty;
    t.pct = t.totalQty ? Math.round((t.completedQty / t.totalQty) * 100) : 0;

    const first = t.items?.[0];
    t.headProduct = first?.name ?? "—";
    t.headLot = first?.lot || first?.serial || "—";
    t.curLoc = first?.curLoc ?? "—";
    t.suggestBin = paBinShort(first?.suggestBin);
  }
}

decoratePAs();

export const getPA = (code: string) =>
  PUTAWAY_TASKS.find((t) => t.code === code) ?? null;

export function nextPACode(): string {
  const n = PUTAWAY_TASKS.reduce(
    (m, t) => Math.max(m, parseInt(String(t.code).replace(/\D/g, ""), 10) || 0),
    25060000,
  );
  return `PA${n + 1}`;
}
