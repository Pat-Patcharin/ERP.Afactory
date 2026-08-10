import {
  GR_NONPO_REASONS,
  GR_WAREHOUSES,
  GOODS_RECEIPTS as RAW_GR,
  type GoodsReceipt,
  type GrType,
} from "@/data/goods-receipts";
import {
  GOODS_RECEIPTS,
  decorateGRs,
  grForceCloses,
  grIsWithPO,
  grItemRemaining,
  grItemVariance,
  grOverLines,
  grProductControls,
  grShortLines,
  grTotalReceiving,
  nextGRCode,
  type GrRow,
} from "./inbound";
import { PRODUCTS } from "./product";
import { decoratePOs, getPO, PURCHASE_ORDERS } from "./purchase";
import { actingUserName, can } from "./admin";
import {
  blankLine,
  type DocTotals,
  type DraftIssue,
  type DraftLine,
} from "./doc-draft";
import { dmyToIso, isoToDmy, stamp, today } from "@/lib/format";

/* ============================================================
   GOODS RECEIPT — the draft behind the document editor

   TWO DOCUMENTS THAT LOOK ALIKE AND ARE NOT.

   WITH PO closes the second half of a spend somebody approved.
   Its lines are not typed: they are pulled from the order, and
   the only decisions are which of them arrived and how many.

   WITHOUT PO has no order behind it. It is how goods come back
   from a claim or a repair, and its lines ARE typed — there is
   nothing to pull them from. It runs on its own number series
   (GRW…), because a series that mixed the two could not answer
   "what did we order and what did we get".

   THREE QUANTITY OUTCOMES, ONE OF WHICH IS A DECISION.

     equal to outstanding   the order line is done
     more than outstanding  allowed; the extra is recorded
     less than outstanding  the rest of the order is CLOSED

   The third is not arithmetic. Receiving 80 of 100 could mean
   "20 to follow" or "20 will never come" and the numbers cannot
   say which; the person receiving says. Giving up on goods
   already ordered is a commercial call, so it needs `approve` on
   this module — the receiving desk has everything else.
   ============================================================ */

const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v) || 0;

/**
 * A receipt line, on the same `DraftLine` the other documents edit.
 *
 * `qty` IS the quantity being received now — the shared editor autosaves,
 * recovers and validates through that field, and a receipt with its own
 * parallel quantity would have been outside all three. What price means on
 * a receipt is nothing, and it is left at zero rather than shown.
 */
export interface GrDraftLine extends DraftLine {
  /** Ticked = part of THIS receipt. Unticked lines stay outstanding. */
  include: boolean;
  /** What the order asked for. Zero on a receipt without an order. */
  ordered: number;
  /** What earlier receipts already took against that order line. */
  prevRecv: number;
  location: string;
  /* The control regime, read off the product master when the line is filled
     in. Named `…Required`/`…Tracked` because `DraftLine.lot` and `.serial`
     are the NUMBERS on the line, and a boolean called `lot` beside a string
     called `lot` is a bug waiting for a careless merge. */
  qcRequired: boolean;
  lotTracked: boolean;
  serialTracked: boolean;
  expiryTracked: boolean;
}

export interface GoodsReceiptDraft {
  code: string;
  status: string;
  mode: "create" | "edit";
  type: GrType;

  poRef: string;
  supplier: string;
  warehouse: string;
  receiptDate: string;
  expectedDate: string;
  receiver: string;

  /* Without PO only — why goods are arriving with no order behind them. */
  nonPoReason: string;
  refDoc: string;

  deliveryNote: string;
  invoiceRef: string;
  transporter: string;
  packages: number | "";
  pkgCondition: string;
  remark: string;

  /** Typed when the receipt is short and the rest is being given up on. */
  forceCloseReason: string;

  items: GrDraftLine[];
}

export const GR_WAREHOUSE_OPTIONS = GR_WAREHOUSES;
export const GR_NONPO_REASON_OPTIONS = GR_NONPO_REASONS;

export function blankGrLine(): GrDraftLine {
  return {
    ...blankLine(),
    /* A receipt charges nothing. Zeroed rather than left at the sales
       default of 7% VAT, which would be a tax on goods nobody is billing. */
    price: 0,
    tax: 0,
    include: true,
    ordered: 0,
    prevRecv: 0,
    location: "",
    qcRequired: false,
    lotTracked: false,
    serialTracked: false,
    expiryTracked: false,
  };
}

export function blankGrDraft(type: GrType = "With PO"): GoodsReceiptDraft {
  return {
    code: nextGRCode(type),
    status: "Draft",
    mode: "create",
    type,
    poRef: "",
    supplier: "",
    warehouse: "",
    receiptDate: dmyToIso(today()),
    expectedDate: "",
    receiver: actingUserName(),
    nonPoReason: "",
    refDoc: "",
    deliveryNote: "",
    invoiceRef: "",
    transporter: "",
    packages: "",
    pkgCondition: "Good",
    remark: "",
    forceCloseReason: "",
    /* With PO opens EMPTY: the lines come from the order, and a blank row
       waiting to be typed would invite somebody to type one that the order
       does not have. Without PO opens with a row, because typing is the only
       way lines get there. */
    items: type === "Without PO" ? [blankGrLine()] : [],
  };
}

/**
 * Pull the outstanding lines off an order.
 *
 * Only what is still owed: a line already received in full has nothing left
 * to offer this receipt, and showing it ticked at zero would be a row whose
 * only possible action is to be unticked again.
 */
export function applyPurchaseOrder(draft: GoodsReceiptDraft, poCode: string): GoodsReceiptDraft {
  const po = getPO(poCode);
  if (!po) return { ...draft, poRef: poCode, items: [] };

  const items = (po.items ?? [])
    .filter((it) => num(it.qty) - num(it.recv) > 0)
    .map((it) => {
      const ctl = grProductControls(it.code);
      const remaining = num(it.qty) - num(it.recv);
      return {
        ...blankGrLine(),
        code: it.code,
        name: it.name,
        unit: it.unit,
        ordered: num(it.qty),
        prevRecv: num(it.recv),
        /* Opens at what is still owed. The receiver types over it when the
           delivery disagrees, which is the whole job. */
        qty: remaining,
        qcRequired: ctl.qc,
        lotTracked: ctl.lot,
        serialTracked: ctl.serial,
        expiryTracked: ctl.expiry,
      };
    });

  return {
    ...draft,
    poRef: po.code,
    supplier: po.supplier,
    warehouse: po.warehouse || draft.warehouse,
    expectedDate: dmyToIso(po.expectedDate),
    items,
  };
}

/** A line typed on a receipt without an order — the product master fills it. */
export function applyProductForReceipt(line: GrDraftLine, code: string): GrDraftLine {
  const p = PRODUCTS.find((x) => x.code === code);
  if (!p) return { ...line, code };
  const ctl = grProductControls(code);
  return {
    ...line,
    code: p.code,
    name: p.name,
    unit: p.unit,
    qcRequired: ctl.qc,
    lotTracked: ctl.lot,
    serialTracked: ctl.serial,
    expiryTracked: ctl.expiry,
  };
}

export function draftFromGoodsReceipt(gr: GoodsReceipt): GoodsReceiptDraft {
  return {
    code: gr.code,
    status: gr.status,
    mode: "edit",
    type: (grIsWithPO(gr) ? "With PO" : "Without PO") as GrType,
    poRef: gr.poRef,
    supplier: gr.supplier,
    warehouse: gr.warehouse,
    receiptDate: dmyToIso(gr.receiptDate),
    expectedDate: dmyToIso(gr.expectedDate),
    receiver: gr.receiver,
    nonPoReason: gr.nonPoReason ?? "",
    refDoc: gr.refDoc ?? "",
    deliveryNote: gr.deliveryNote,
    invoiceRef: gr.invoiceRef,
    transporter: gr.transporter,
    packages: gr.packages,
    pkgCondition: gr.pkgCondition,
    remark: gr.remark,
    forceCloseReason: gr.forceCloseReason ?? "",
    items: (gr.items ?? []).map((it) => ({
      ...blankGrLine(),
      code: it.code,
      name: it.name,
      unit: it.unit,
      ordered: num(it.ordered),
      prevRecv: num(it.prevRecv),
      qty: num(it.receiveNow),
      location: it.location,
      qcRequired: Boolean(it.qc),
      lotTracked: Boolean(it.lot),
      serialTracked: Boolean(it.serial),
      expiryTracked: Boolean(it.expiry),
      note: it.disc ?? "",
    })),
  };
}

/* ---------- What is actually being received ---------- */

/** Ticked lines carrying a quantity. Everything else is not in this receipt. */
export const grDraftLines = (draft: GoodsReceiptDraft) =>
  draft.items.filter((l) => l.include && str(l.code).trim() && num(l.qty) > 0);

export interface GrDraftTotals extends DocTotals {
  /** Lines actually being received — ticked, coded and carrying a quantity. */
  lines: number;
  qcLines: number;
  shortLines: number;
  overLines: number;
  /** Saving this closes what is left of the order. */
  forceCloses: boolean;
}

/**
 * A receipt counts goods, not money.
 *
 * The money fields of `DocTotals` are present because the shared editor
 * shell reads them, and they are zero because a receipt bills nobody — the
 * invoice against this delivery is a document of its own.
 */
export function grTotals(draft: GoodsReceiptDraft): GrDraftTotals {
  const picked = grDraftLines(draft);
  const lines = picked.map((l) => ({
    ordered: l.ordered,
    prevRecv: l.prevRecv,
    receiveNow: num(l.qty),
  }));
  const doc = { type: draft.type, items: lines };
  return {
    subtotal: 0,
    lineDiscount: 0,
    headerDiscount: 0,
    netAmount: 0,
    vat: 0,
    freight: 0,
    otherCharges: 0,
    rounding: 0,
    grandTotal: 0,
    itemCount: picked.length,
    totalQty: grTotalReceiving({ items: lines }),
    lines: picked.length,
    qcLines: picked.filter((l) => l.qcRequired).length,
    shortLines: grShortLines(doc).length,
    overLines: grOverLines(doc).length,
    forceCloses: grForceCloses(doc),
  };
}

/** May the acting user close an order early? The approve right, not receive. */
export const canForceClose = () => can("goods-receipt", "approve");

/* ---------- Validation ---------- */

export function validateGrDraft(draft: GoodsReceiptDraft): DraftIssue[] {
  const out: DraftIssue[] = [];
  const add = (field: string, message: string, blocking = true) =>
    out.push({ field, message, blocking });

  if (draft.type === "With PO" && !str(draft.poRef).trim())
    add("poRef", "เลือกใบสั่งซื้อที่จะรับของก่อน");
  if (draft.type === "Without PO" && !str(draft.nonPoReason).trim())
    add("nonPoReason", "ระบุเหตุผลที่รับของโดยไม่มีใบสั่งซื้อ");
  if (!str(draft.warehouse).trim()) add("warehouse", "เลือกคลังที่รับของเข้า");
  if (!str(draft.receiver).trim()) add("receiver", "ระบุผู้รับของ");

  const picked = grDraftLines(draft);
  if (!picked.length) add("items", "ติ๊กอย่างน้อย 1 รายการ และใส่จำนวนที่รับเข้าจริง");

  for (const l of draft.items) {
    if (!l.include) continue;
    if (str(l.code).trim() && num(l.qty) < 0)
      add(`line-${l.id}-qty`, `${l.code} — จำนวนที่รับเข้าติดลบไม่ได้`);
    if (!str(l.code).trim() && num(l.qty) > 0)
      add(`line-${l.id}-code`, "เลือกสินค้าก่อนใส่จำนวน");
  }

  const totals = grTotals(draft);

  /* Receiving MORE than was ordered is allowed and worth saying out loud —
     a warning, never a block: the goods are on the dock either way, and a
     receipt that refuses to record them is how stock goes missing. */
  if (totals.overLines)
    add("items", `รับเกินจำนวนที่สั่ง ${totals.overLines} รายการ — บันทึกได้ แต่ตรวจสอบก่อน`, false);

  /* The force close is the one thing a receiver may not decide alone.
     Checked while the document is being written rather than at save, so the
     block and the reason box appear before the work is done. */
  if (totals.forceCloses && !canForceClose())
    add(
      "items",
      "รับน้อยกว่าจำนวนที่สั่ง = ปิดใบสั่งซื้อส่วนที่เหลือ — ต้องให้ผู้มีสิทธิ์อนุมัติเป็นผู้บันทึก",
    );
  if (totals.forceCloses && canForceClose() && !str(draft.forceCloseReason).trim())
    add("forceCloseReason", "ระบุเหตุผลที่ปิดใบสั่งซื้อส่วนที่เหลือ");

  return out;
}

/* ---------- Saving ---------- */

export interface GrSaveResult {
  code: string;
  created: boolean;
  forceClosed: boolean;
}

/**
 * Write the receipt, and hand the quantities back to the order.
 *
 * The write-back is here rather than in the caller because a receipt that
 * did not move the order it received against is a receipt that will be
 * received twice.
 */
export function saveGoodsReceiptDraft(
  draft: GoodsReceiptDraft,
  { user = actingUserName() }: { user?: string } = {},
): GrSaveResult {
  const now = stamp();
  const code = str(draft.code).trim();
  const existing = GOODS_RECEIPTS.find((g) => g.code === code);
  const totals = grTotals(draft);
  const forceClosed = totals.forceCloses && canForceClose();

  const items = grDraftLines(draft).map((l, i) => ({
    line: i + 1,
    code: str(l.code).trim(),
    name: str(l.name),
    unit: str(l.unit),
    ordered: num(l.ordered),
    prevRecv: num(l.prevRecv),
    receiveNow: num(l.qty),
    /* QC lines stay unaccepted until the inspection decides. */
    accepted: l.qcRequired ? 0 : num(l.qty),
    rejected: 0,
    warehouse: str(draft.warehouse),
    location: str(l.location),
    qc: Boolean(l.qcRequired),
    lot: Boolean(l.lotTracked),
    serial: Boolean(l.serialTracked),
    expiry: Boolean(l.expiryTracked),
    lots: [],
    serials: [],
    disc: str(l.note),
  }));

  const anyQc = items.some((it) => it.qc);
  const po = draft.type === "With PO" ? getPO(str(draft.poRef)) : null;

  const patch = {
    type: draft.type,
    poRef: draft.type === "With PO" ? str(draft.poRef) : "",
    supplier: str(draft.supplier),
    warehouse: str(draft.warehouse),
    receiptDate: isoToDmy(draft.receiptDate),
    expectedDate: isoToDmy(draft.expectedDate),
    receiver: str(draft.receiver),
    discrepancy: totals.shortLines
      ? "Quantity Difference"
      : totals.overLines
        ? "Quantity Difference"
        : "None",
    deliveryNote: str(draft.deliveryNote),
    invoiceRef: str(draft.invoiceRef),
    transporter: str(draft.transporter),
    packages: num(draft.packages),
    pkgCondition: str(draft.pkgCondition) || "Good",
    remark: str(draft.remark),
    nonPoReason: draft.type === "Without PO" ? str(draft.nonPoReason) : "",
    refDoc: str(draft.refDoc),
    items,
    qcStatus: anyQc ? "Pending" : "Not Required",
    /* Nothing sits between the dock and the shelf: what is received without
       a QC hold is finished. A receipt that leaves the order short is
       finished too — that is what closing it means. */
    status: anyQc
      ? "Pending QC"
      : forceClosed || !po || poFullyReceived(po, items)
        ? "Completed"
        : "Partial",
    forceClosed,
    forceCloseReason: forceClosed ? str(draft.forceCloseReason) : "",
    forceClosedBy: forceClosed ? user : "",
    forceClosedAt: forceClosed ? now : "",
    updated: now,
    updatedBy: user,
  };

  if (existing) {
    Object.assign(existing, patch);
    (existing.history ??= []).unshift({
      t: "Goods receipt updated",
      d: "แก้ไขใบรับของ",
      u: user,
      when: now,
      kind: "primary",
    });
  } else {
    const fresh: GoodsReceipt = {
      code,
      ...patch,
      /* The lorry's own details. Kept on the record because a discrepancy is
         argued with the carrier, but not asked for on the document: a
         receiver types what arrived, not who drove it. */
      driver: "",
      vehicle: "",
      dock: "",
      seal: "",
      qc: { type: "—", plan: "", inspector: "", dueDate: "", qcWh: "", claimWh: "" },
      created: now,
      createdBy: user,
      history: [
        {
          t: draft.type === "With PO" ? "Goods received" : "Goods received (no PO)",
          d: `รับเข้า ${totals.totalQty} หน่วย จาก ${items.length} รายการ`,
          u: user,
          when: now,
          kind: "primary",
        },
      ],
    };
    GOODS_RECEIPTS.unshift(fresh as GrRow);
  }

  /* ---- Hand the quantities back to the order ---- */
  if (po) {
    for (const it of items) {
      const line = (po.items ?? []).find((x) => x.code === it.code);
      if (line) line.recv = num(line.recv) + it.receiveNow;
    }
    const done = (po.items ?? []).every((x) => num(x.recv) >= num(x.qty));
    po.status = done || forceClosed ? "Completed" : "Partial Received";
    po.updated = now;
    po.updatedBy = user;
    if (forceClosed) {
      po.remark = [po.remark, `ปิดยอดคงเหลือจาก ${code} — ${str(draft.forceCloseReason)}`]
        .filter(Boolean)
        .join(" · ");
    }
    decoratePOs();
  }

  decorateGRs();
  return { code, created: !existing, forceClosed };
}

/** Would this receipt finish the order? Asked before the write-back lands. */
function poFullyReceived(
  po: { items?: { code: string; qty?: number; recv?: number }[] },
  items: { code: string; receiveNow: number }[],
): boolean {
  return (po.items ?? []).every((x) => {
    const taken = items
      .filter((it) => it.code === x.code)
      .reduce((s, it) => s + it.receiveNow, 0);
    return num(x.recv) + taken >= num(x.qty);
  });
}

/* ---------- Which orders may still be received against ---------- */

export const receivablePOs = () =>
  PURCHASE_ORDERS.filter(
    (p) =>
      ["Open", "Partial Received"].includes(p.status) &&
      (p.items ?? []).some((it) => num(it.qty) - num(it.recv) > 0),
  );

export { RAW_GR as GOODS_RECEIPTS_RAW, grItemRemaining, grItemVariance };
