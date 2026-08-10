import { stamp } from "./format";
import type { ActionCtx } from "./types";
import {
  PURCHASE_ORDERS,
  decoratePOs,
  poRemainingQty,
  poReceivedPct,
  type PoRow,
} from "./domain/purchase";
import {
  GOODS_RECEIPTS,
  PUTAWAY_TASKS,
  QC_INSPECTIONS,
  decorateGRs,
  decoratePAs,
  decorateQCs,
  type GrRow,
  type PaRow,
  type QcRow,
} from "./domain/inbound";

/* ============================================================
   Document workflows. Kept out of the schemas so the state
   transitions read as one story per module, and so a schema
   stays a description of a screen rather than of a process.
   ============================================================ */

/* ---------- Purchase Request ----------

   Moved to workflows-purchase.tsx, whole. The request grew an approval
   plan, a review door above the limit, notifications and a line-by-line
   split — and the confirm dialogs it needs are JSX, which a .ts file
   cannot hold. Re-exported here so every caller keeps one import. */

export {
  prApprove,
  prCanApprove,
  prCanConvert,
  prCanOpen,
  prCanRevise,
  prCanSubmit,
  prCancel,
  prConvert,
  prDelete,
  prOpen,
  prProgress,
  prReject,
  prRevise,
  prSubmit,
} from "./workflows-purchase";

/* ---------- Purchase Order ---------- */

export function poIssue(po: PoRow, ctx: ActionCtx) {
  po.status = "Open";
  po.updated = stamp();
  decoratePOs();
  ctx.refresh();
  ctx.toast("ออกใบสั่งซื้อแล้ว", `${po.code} — ส่งให้ผู้ขายสินค้า`, "success");
}

/**
 * Receive the outstanding quantity and record a goods receipt note.
 * A full GR module allows partials; this is the fast path from the PO list.
 */
export function poReceive(po: PoRow, ctx: ActionCtx) {
  const remaining = poRemainingQty(po);
  ctx.confirm({
    title: "Receive goods for this PO?",
    message: `บันทึกการรับของ ${po.code} — คงเหลือรอรับ ${remaining} หน่วย`,
    confirmText: "Receive Goods",
    tone: "primary",
    onConfirm: () => {
      (po.items ?? []).forEach((it) => {
        it.recv = Number(it.qty) || 0;
      });
      const grn = `GRN2506-${String(
        50 + PURCHASE_ORDERS.reduce((n, p) => n + (p.receipts?.length ?? 0), 0),
      ).padStart(3, "0")}`;
      (po.receipts ??= []).push({
        grn,
        date: stamp().split(" ")[0],
        warehouse: po.warehouse,
        qty: remaining,
        receiver: "Somchai B.",
        status: "Received",
      });
      po.status = "Completed";
      po.updated = stamp();
      po.updatedBy = "Somchai B.";
      decoratePOs();
      ctx.refresh();
      ctx.toast("รับของเรียบร้อยแล้ว", `${po.code} → ${grn}`, "success");
    },
  });
}

export function poCancel(po: PoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this purchase order?",
    message: `${po.code} จะถูกยกเลิก`,
    confirmText: "Cancel PO",
    onConfirm: () => {
      po.status = "Cancelled";
      po.updated = stamp();
      decoratePOs();
      ctx.refresh();
      ctx.toast("ยกเลิกใบสั่งซื้อแล้ว", po.code, "info");
    },
  });
}

export function poDelete(po: PoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this purchase order?",
    message: `${po.code} จะถูกลบถาวร`,
    confirmText: "Delete PO",
    onConfirm: () => {
      const i = PURCHASE_ORDERS.indexOf(po);
      if (i > -1) PURCHASE_ORDERS.splice(i, 1);
      decoratePOs();
      ctx.refresh();
      ctx.toast("ลบใบสั่งซื้อแล้ว", po.code, "danger");
    },
  });
}

/* ---------- Goods Receipt ----------

   RECEIVING ENDS HERE.

   It used to hand the goods to a Put Away task that asked which bin each
   line went into — a question a warehouse in this system has no bins to
   answer. What is received is available; there is no third document
   between the dock and the shelf. */

export function grPassQC(gr: GrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "QC Inspection",
    message: `ตรวจ QC สำหรับ ${gr.code} — สินค้าอยู่ใน QC Hold`,
    confirmText: "QC Pass",
    tone: "primary",
    onConfirm: () => {
      gr.qcStatus = "Passed";
      gr.status = "Completed";
      gr.updated = stamp();
      (gr.history ??= []).unshift({
        t: "QC Passed",
        d: "ตรวจผ่าน รับเข้าคลังเรียบร้อย สต๊อกพร้อมใช้งาน",
        u: "Warin S.",
        when: stamp(),
        kind: "primary",
      });
      decorateGRs();
      ctx.refresh();
      ctx.toast("QC ผ่านแล้ว", `${gr.code} — สต๊อกพร้อมใช้งาน`, "success");
    },
  });
}

export function grCancel(gr: GrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this goods receipt?",
    message: `${gr.code} จะถูกยกเลิก`,
    confirmText: "Cancel GR",
    onConfirm: () => {
      gr.status = "Cancelled";
      gr.updated = stamp();
      decorateGRs();
      ctx.refresh();
      ctx.toast("ยกเลิกใบรับของแล้ว", gr.code, "info");
    },
  });
}

export function grDelete(gr: GrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this goods receipt?",
    message: `${gr.code} จะถูกลบถาวร`,
    confirmText: "Delete GR",
    onConfirm: () => {
      const i = GOODS_RECEIPTS.indexOf(gr);
      if (i > -1) GOODS_RECEIPTS.splice(i, 1);
      decorateGRs();
      ctx.refresh();
      ctx.toast("ลบใบรับของแล้ว", gr.code, "danger");
    },
  });
}

/* ---------- QC Inspection ---------- */

export function qcStart(qc: QcRow, ctx: ActionCtx) {
  qc.status = "In Progress";
  qc.inspectionDate = stamp().split(" ")[0];
  qc.updated = stamp();
  (qc.history ??= []).unshift({
    t: "Started",
    d: "เริ่มตรวจ QC",
    u: qc.inspector,
    when: stamp(),
    kind: "primary",
  });
  decorateQCs();
  ctx.refresh();
  ctx.toast("เริ่มตรวจ QC", qc.code, "info");
}

/** Pass routes the goods to Put Away; fail routes them to the Claim warehouse. */
export function qcDecide(qc: QcRow, pass: boolean, ctx: ActionCtx) {
  ctx.confirm({
    title: pass ? "Pass this inspection?" : "Fail this inspection?",
    message: pass
      ? `${qc.code} — ${qc.productName} จะถูกส่งต่อไปจัดเก็บ`
      : `${qc.code} — ${qc.productName} จะถูกย้ายเข้าคลังเคลม และสร้าง NCR`,
    confirmText: pass ? "QC Pass" : "QC Fail",
    tone: pass ? "primary" : "danger",
    onConfirm: () => {
      const now = stamp();
      qc.status = "Completed";
      qc.result = pass ? "Pass" : "Fail";
      if (pass) {
        qc.acceptedQty = qc.receivedQty;
        qc.rejectedQty = 0;
      } else {
        qc.acceptedQty = 0;
        qc.rejectedQty = qc.receivedQty;
        qc.warehouse = "WH-CLAIM Claim Warehouse";
        if (!qc.ncrRef) qc.ncrRef = `NCR2506-${String(QC_INSPECTIONS.length + 1).padStart(3, "0")}`;
      }
      qc.updated = now;
      (qc.history ??= []).unshift({
        t: pass ? "Passed" : "Failed",
        d: pass
          ? `ตรวจผ่าน ${qc.receivedQty} หน่วย พร้อม Put Away`
          : `ตรวจไม่ผ่าน ${qc.receivedQty} หน่วย → ${qc.ncrRef}`,
        u: qc.inspector,
        when: now,
        kind: pass ? "primary" : "warn",
      });

      // Hand the outcome back to the receipt that raised the inspection.
      const gr = GOODS_RECEIPTS.find((g) => g.code === qc.grRef);
      if (gr) {
        gr.qcStatus = pass ? "Passed" : "Failed";
        gr.status = pass ? "Completed" : "Partial";
        gr.updated = now;
        decorateGRs();
      }

      decorateQCs();
      ctx.refresh();
      ctx.toast(
        pass ? "QC ผ่านแล้ว" : "QC ไม่ผ่าน",
        pass ? `${qc.code} — พร้อมจัดเก็บ` : `${qc.code} — สร้าง ${qc.ncrRef}`,
        pass ? "success" : "danger",
      );
    },
  });
}

/* ---------- Put Away ---------- */

export function paConfirm(task: PaRow, ctx: ActionCtx) {
  const unassigned = (task.items ?? []).filter((it) => !it.destBin).length;
  if (unassigned) {
    ctx.toast(
      "ยังเลือก Bin ไม่ครบ",
      `เหลืออีก ${unassigned} รายการที่ยังไม่ได้กำหนดตำแหน่งจัดเก็บ`,
      "warning",
    );
    return;
  }
  ctx.confirm({
    title: "Confirm put away?",
    message: `${task.code} — จัดเก็บ ${task.totalQty} หน่วย สต๊อกจะพร้อมใช้งานทันที`,
    confirmText: "Confirm Put Away",
    tone: "primary",
    onConfirm: () => {
      (task.items ?? []).forEach((it) => {
        it.status = "Completed";
      });
      task.status = "Completed";
      task.updated = stamp();
      (task.history ??= []).unshift({
        t: "Put Away confirmed",
        d: `จัดเก็บ ${task.totalQty} หน่วย · สต๊อกพร้อมใช้งาน`,
        u: task.assignedTo || "Somchai B.",
        when: stamp(),
        kind: "primary",
      });

      // Complete the receipt this task came from.
      const gr = GOODS_RECEIPTS.find((g) => g.code === task.grRef);
      if (gr) {
        gr.status = "Completed";
        gr.updated = stamp();
        decorateGRs();
      }

      decoratePAs();
      ctx.refresh();
      ctx.toast("จัดเก็บเรียบร้อย", `${task.code} — สต๊อกพร้อมใช้งาน`, "success");
    },
  });
}

export function paAssign(task: PaRow, staff: string, ctx: ActionCtx) {
  task.assignedTo = staff;
  task.status = "Assigned";
  task.updated = stamp();
  (task.history ??= []).unshift({
    t: "Assigned",
    d: `มอบหมายให้ ${staff}`,
    u: "Warin S.",
    when: stamp(),
    kind: "info",
  });
  decoratePAs();
  ctx.refresh();
  ctx.toast("มอบหมายงานแล้ว", `${task.code} → ${staff}`, "success");
}

export function paCancel(task: PaRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this put away task?",
    message: `${task.code} จะถูกยกเลิก`,
    confirmText: "Cancel Task",
    onConfirm: () => {
      task.status = "Cancelled";
      task.updated = stamp();
      decoratePAs();
      ctx.refresh();
      ctx.toast("ยกเลิกงานจัดเก็บแล้ว", task.code, "info");
    },
  });
}

export { poReceivedPct, PUTAWAY_TASKS };
