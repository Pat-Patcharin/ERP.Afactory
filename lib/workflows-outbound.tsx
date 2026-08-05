import { actingUserName, can, currentRole } from "./domain/admin";
import { useState } from "react";
import { docDiscTotal, docGrandTotal, docSubtotal, docTaxTotal } from "./domain/lines";
import { fmt, money0, stamp } from "./format";
import type { ActionCtx } from "./types";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  availabilityFor,
  creditCheck,
  decorateOutbound,
  getPack,
  getPick,
  getSO,
  nextDOCode,
  nextPackCode,
  nextPickCode,
  nextSOCode,
  soLinkedDocs,
  type DoRow,
  type PackRow,
  type PickRow,
  type QtRow,
  type SoRow,
  type SrRow,
} from "./domain/outbound";

/* ============================================================
   OUTBOUND WORKFLOWS

     Sales Request → Sales Order → Picking → Packing → Delivery

   Each step both advances its own document and updates the one
   upstream, so a status never has to be kept in sync by hand.
   Kept out of the schemas so the chain reads as one story.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();

/** Every document in this module records history the same way. */
function log(
  doc: { history?: { t: string; d: string; u: string; when: string; kind: string }[] },
  t: string,
  d: string,
  kind = "primary",
  u = USER(),
) {
  (doc.history ??= []).unshift({ t, d, u, when: stamp(), kind });
}

function commit(ctx: ActionCtx, title: string, message: string, tone: "success" | "info" | "danger" | "warning" = "success") {
  decorateOutbound();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

/* ============================================================
   WHO MAY DO WHAT

   The sales rep raises the paperwork; the approver signs it and
   moves it down the line. Both halves are configuration — the
   role matrix in Administration decides, not a name in this file.

   The check sits on the mutation rather than only on the button.
   A hidden button is a courtesy to the user; a guarded function
   is what actually holds when the call arrives from a stale page,
   a keyboard path, or the API this becomes later.
   ============================================================ */

type Right = "create" | "edit" | "approve" | "delete";

function denied(ctx: ActionCtx, moduleKey: string, right: Right, what: string): boolean {
  if (can(moduleKey, right)) return false;
  ctx.toast(
    "สิทธิ์ไม่พอ",
    `บทบาท ${currentRole()?.name ?? "—"} ${what} — ต้องให้ผู้มีสิทธิ์อนุมัติดำเนินการ`,
    "danger",
  );
  return true;
}

/* ---------- Modal fields ---------- */

/**
 * Same control the adjustment and credit-note workflows use. Each of those
 * files carries its own copy rather than sharing one, so this follows suit
 * instead of hoisting a component out of three unrelated modules.
 */
function TextField({
  label,
  placeholder,
  onChange,
}: {
  label: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-cap font-medium text-ink-2">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        className="h-10 rounded-btn border border-line bg-card px-3 text-body outline-none focus:border-primary"
      />
    </label>
  );
}

/* ============================================================
   QUOTATION — optional price offer. Nothing here touches stock
   or commits the company to anything.

   Two dimensions move independently:
     status         — where the document has got to
     approvalStatus — whether it cleared internal approval

   They part company in two places. A quote sent back for edits
   returns to Draft while approvalStatus remembers it was bounced,
   and a quote the customer turns down keeps approvalStatus
   "Approved" — the approver said yes, the customer said no.
   ============================================================ */

/** Draft → Pending Approval. The rep's own act, so it needs only `edit`. */
export function qtSubmit(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "edit", "ส่งขออนุมัติไม่ได้")) return;
  if (qt.status !== "Draft") {
    ctx.toast(
      "ส่งขออนุมัติไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — ส่งขออนุมัติได้เฉพาะใบที่เป็นร่าง`,
      "warning",
    );
    return;
  }
  if (!(qt.items ?? []).length) {
    ctx.toast("ยังไม่มีรายการสินค้า", "เพิ่มรายการอย่างน้อย 1 บรรทัดก่อนส่งขออนุมัติ", "warning");
    return;
  }
  qt.status = "Pending Approval";
  qt.approvalStatus = "Pending Approval";
  qt.updated = stamp();
  qt.updatedBy = USER();
  log(qt, "Submitted for approval", "ส่งขออนุมัติภายใน", "info");
  commit(ctx, "ส่งขออนุมัติแล้ว", `${qt.code} — รอผู้จัดการฝ่ายขายอนุมัติ`);
}

/** Pending Approval → Approved. From here the quote may be sent out. */
export function qtApprove(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "approve", "อนุมัติใบเสนอราคาไม่ได้")) return;
  if (qt.status !== "Pending Approval") {
    ctx.toast(
      "อนุมัติไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — อนุมัติได้เฉพาะใบที่รออนุมัติ`,
      "warning",
    );
    return;
  }

  ctx.confirm({
    title: "Approve this quotation?",
    message: (
      <>
        อนุมัติ <strong>{qt.code}</strong> — {qt.customer}
        <br />
        มูลค่า {money0(qt.amount)} บาท
        <br />
        <span className="text-ink-2">อนุมัติแล้วจึงส่งให้ลูกค้าได้</span>
      </>
    ),
    confirmText: "Approve quotation",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      qt.status = "Approved";
      qt.approvalStatus = "Approved";
      /* Recorded as fields, not only in the history line: the printed sheet
         has to name its approver, and a revision snapshot has to keep them. */
      qt.approvedBy = USER();
      qt.approvedAt = now;
      qt.updated = now;
      qt.updatedBy = USER();
      log(qt, "Approved", `อนุมัติภายในโดย ${USER()}`);
      commit(ctx, "อนุมัติใบเสนอราคาแล้ว", `${qt.code} — พร้อมส่งให้ลูกค้า`);
    },
  });
}

/**
 * Pending Approval → Rejected by the APPROVER. Distinct from `qtReject`
 * below, which records the customer turning the offer down: that one leaves
 * approvalStatus alone, because internally the quote was fine.
 */
export function qtRejectApproval(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "approve", "ไม่อนุมัติใบเสนอราคาไม่ได้")) return;
  if (qt.status !== "Pending Approval") {
    ctx.toast(
      "ไม่อนุมัติไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — ตัดสินได้เฉพาะใบที่รออนุมัติ`,
      "warning",
    );
    return;
  }
  let note = "";

  ctx.formModal({
    title: "ไม่อนุมัติใบเสนอราคา",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ปิด {qt.code} เป็น Rejected</p>
        <TextField
          label="เหตุผลที่ไม่อนุมัติ"
          placeholder="เช่น ส่วนลดเกินเพดานที่อนุมัติได้"
          onChange={(v) => (note = v)}
        />
      </div>
    ),
    confirmText: "ไม่อนุมัติ",
    onConfirm: () => {
      if (!note.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "พนักงานขายต้องรู้ว่าทำไมถึงไม่ผ่าน", "danger");
        return false;
      }
      qt.status = "Rejected";
      qt.approvalStatus = "Rejected";
      qt.rejectReason = note;
      qt.updated = stamp();
      qt.updatedBy = USER();
      log(qt, "Rejected", `ไม่อนุมัติ: ${note}`, "warn");
      commit(ctx, "ไม่อนุมัติใบเสนอราคา", `${qt.code} — ${note}`, "danger");
    },
  });
}

/**
 * Pending Approval → back to Draft for edits, with approvalStatus holding on
 * to the fact that it was bounced. Without that second field a returned quote
 * would be indistinguishable from one nobody had submitted yet. Same shape as
 * the credit-note and invoice workflows.
 */
export function qtRequestRevision(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "approve", "ส่งใบเสนอราคากลับให้แก้ไขไม่ได้")) return;
  if (qt.status !== "Pending Approval") {
    ctx.toast(
      "ขอให้แก้ไขไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — ส่งกลับได้เฉพาะใบที่รออนุมัติ`,
      "warning",
    );
    return;
  }
  let note = "";

  ctx.formModal({
    title: "ขอให้แก้ไขใบเสนอราคา",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ส่ง {qt.code} กลับให้พนักงานขายแก้ไข</p>
        <TextField
          label="สิ่งที่ต้องแก้ไข"
          placeholder="เช่น ปรับส่วนลดบรรทัดที่ 2 ให้ไม่เกิน 15%"
          onChange={(v) => (note = v)}
        />
      </div>
    ),
    confirmText: "ขอให้แก้ไข",
    onConfirm: () => {
      if (!note.trim()) {
        ctx.toast("ต้องระบุสิ่งที่ต้องแก้ไข", "พนักงานขายต้องรู้ว่าต้องแก้อะไร", "danger");
        return false;
      }
      qt.status = "Draft";
      qt.approvalStatus = "Revision Requested";
      qt.rejectReason = note;
      qt.updated = stamp();
      qt.updatedBy = USER();
      log(qt, "Revision requested", note, "warn");
      commit(ctx, "ส่งกลับให้แก้ไขแล้ว", `${qt.code} — ${note}`, "warning");
    },
  });
}

/**
 * Approved → Sent. The button is hidden everywhere else, but the check lives
 * here too: a hidden button is a courtesy, and this is what holds when the
 * call arrives from a page left open since before the quote was approved.
 */
export function qtSend(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "edit", "ส่งใบเสนอราคาไม่ได้")) return;
  if (qt.status !== "Approved") {
    ctx.toast(
      "ส่งใบเสนอราคาไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — ต้องผ่านการอนุมัติก่อนจึงจะส่งให้ลูกค้าได้`,
      "warning",
    );
    return;
  }
  const now = stamp();
  qt.status = "Sent";
  qt.sentAt = now;
  qt.updated = now;
  qt.updatedBy = USER();
  log(qt, "Sent to customer", "ส่งใบเสนอราคาให้ลูกค้าแล้ว", "info");
  commit(ctx, "ส่งใบเสนอราคาแล้ว", `${qt.code} — รอลูกค้าตอบกลับ`);
}

export function qtAccept(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "edit", "บันทึกผลใบเสนอราคาไม่ได้")) return;
  qt.status = "Accepted";
  qt.updated = stamp();
  qt.updatedBy = USER();
  log(qt, "Accepted by customer", "ลูกค้ายืนยันราคาแล้ว พร้อมเปิดคำขอขาย");
  commit(ctx, "ลูกค้ายอมรับแล้ว", `${qt.code} — พร้อมแปลงเป็นคำขอขาย`);
}

/**
 * The CUSTOMER turned the offer down — recording their answer, not an
 * approval decision, which is why it needs only `edit` and leaves
 * `approvalStatus` untouched. The approver's refusal is `qtRejectApproval`.
 */
export function qtReject(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "edit", "บันทึกผลใบเสนอราคาไม่ได้")) return;
  ctx.confirm({
    title: "Reject this quotation?",
    message: `${qt.code} จะถูกปิดเป็น Rejected — เหตุผลที่บันทึกไว้จะใช้ทำรายงาน win/loss ต่อไป`,
    confirmText: "Reject quotation",
    onConfirm: () => {
      qt.status = "Rejected";
      if (!qt.rejectReason) qt.rejectReason = "อื่น ๆ";
      qt.updated = stamp();
      qt.updatedBy = USER();
      log(qt, "Rejected by customer", `เหตุผล: ${qt.rejectReason}`, "warn");
      commit(ctx, "ปิดใบเสนอราคาแล้ว", `${qt.code} — ${qt.rejectReason}`, "danger");
    },
  });
}

/**
 * Accepted quotation → a Sales Order, directly.
 *
 * The quote already carries an approved price and the customer's yes, so
 * there is nothing left for a Sales Request to decide. The request route
 * survives for customers who never asked for a quotation — it is raised from
 * the Sales Request editor, not from here.
 *
 * Availability is read here rather than taken from the screen: the page may
 * have been open since before someone else's order took the same stock.
 */
export function qtConvert(qt: QtRow, ctx: ActionCtx) {
  /* Turning an accepted quote into a real order is what binds the company,
     so it sits with whoever may raise the order. */
  if (denied(ctx, "sales-order", "create", "เปิดใบสั่งขายไม่ได้")) return;
  if (qt.status !== "Accepted") {
    ctx.toast(
      "แปลงเป็นใบสั่งขายไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — ต้องให้ลูกค้าตอบรับก่อน`,
      "warning",
    );
    return;
  }

  const credit = creditCheck(`${qt.customerCode} - ${qt.customer}`, qt.amount);

  ctx.confirm({
    title: "Convert to Sales Order?",
    message: (
      <>
        สร้างใบสั่งขายจาก <strong>{qt.code}</strong> — ระบบจะออกเลข SO ให้อัตโนมัติ
        <br />
        มูลค่า {money0(qt.amount)} บาท
        {!credit.withinLimit && (
          <>
            <br />
            <span className="font-semibold text-danger-text">
              เกินวงเงินเครดิต {money0(credit.overBy)} บาท — ใบสั่งขายจะถูกตั้งเป็น On Hold
            </span>
          </>
        )}
        <StockNotice items={qt.items ?? []} />
        <br />
        <span className="text-ink-2">
          สต๊อกจะถูกจองเมื่อยืนยันใบสั่งขาย ไม่ใช่ตอนนี้
        </span>
      </>
    ),
    confirmText: "Convert to SO",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const soCode = createSalesOrderFrom(
        {
          customer: qt.customer,
          customerCode: qt.customerCode,
          salesRep: qt.salesRep,
          /* A quotation has no required date; its validity is the only date
             the customer agreed to. */
          deliveryDate: qt.validUntil,
          warehouse: "",
          currency: qt.currency,
          payTerm: qt.payTerm,
          priority: "Normal",
          channel: qt.channel,
          customerPo: qt.customerRef,
          items: qt.items ?? [],
        },
        { code: qt.code, field: "quotationRef", noun: "ใบเสนอราคา" },
        credit,
      );

      qt.status = "Converted";
      qt.soRef = soCode;
      qt.updated = now;
      qt.updatedBy = USER();
      log(qt, "Converted to Sales Order", `สร้าง ${soCode} จากใบเสนอราคานี้`);

      commit(
        ctx,
        "แปลงเป็นใบสั่งขายแล้ว",
        credit.withinLimit
          ? `${qt.code} → ${soCode}`
          : `${qt.code} → ${soCode} (On Hold — รออนุมัติเครดิต)`,
        credit.withinLimit ? "success" : "warning",
      );
      ctx.goto(`/m/sales-order/${encodeURIComponent(soCode)}`);
    },
  });
}

/**
 * Statuses `qtRequestEdit` can pull back. Sealed but not dead:
 *
 *   Approved / Sent   the usual case — something changed after sign-off
 *   Expired           validity ran out and the customer came back anyway
 *   Rejected          the customer said no, then changed their mind
 *
 * `Converted` is absent: it already produced an order, which is the document
 * to amend. `Cancelled` is absent: killing a quote is deliberate.
 */
const QT_REOPENABLE: readonly string[] = ["Approved", "Sent", "Expired", "Rejected"];

/**
 * Pull a sealed quotation back for editing: status returns to `Draft`, the
 * revision number goes up, and approval starts from nothing.
 *
 * Permission is `edit`, NOT `approve` — and that is deliberate, so please do
 * not "fix" it to match `srReopen`. The two look alike and are not:
 *
 *   srReopen      an approver withdrawing their own approval → approve
 *   qtRequestEdit the rep taking their own quote back to change it → edit
 *
 * Nothing is waved through by allowing this. Resetting `approvalStatus` to
 * "Not Submitted" means the quote must go round the whole approval loop again
 * before it can be sent, so the approver still decides — just at the next
 * submission. Requiring `approve` here would stop a rep from correcting their
 * own quotation at all, and the workaround is obvious and worse: raise a new
 * quotation and abandon this one, which destroys the very revision trail this
 * field exists to keep.
 */
export function qtRequestEdit(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "edit", "ขอแก้ไขใบเสนอราคาไม่ได้")) return;
  if (!QT_REOPENABLE.includes(qt.status)) {
    ctx.toast(
      "ขอแก้ไขไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — เปิดกลับมาแก้ได้เฉพาะใบที่อนุมัติแล้ว ส่งแล้ว หมดอายุ หรือลูกค้าปฏิเสธ`,
      "warning",
    );
    return;
  }
  let note = "";

  ctx.formModal({
    title: "ขอแก้ไขใบเสนอราคา",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          {qt.code} จะกลับเป็นร่าง เป็นฉบับแก้ไขครั้งที่ {fmt(qt.revision + 1)} และต้องขออนุมัติใหม่ทั้งรอบ
        </p>
        <TextField
          label="เหตุผลที่ขอแก้ไข"
          placeholder="เช่น ลูกค้าขอเปลี่ยนจำนวนจาก 120 เป็น 150"
          onChange={(v) => (note = v)}
        />
      </div>
    ),
    confirmText: "ขอแก้ไข",
    onConfirm: () => {
      if (!note.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "ผู้อนุมัติต้องรู้ว่าทำไมใบนี้ถึงถูกเปิดกลับมา", "danger");
        return false;
      }
      const from = qt.status;
      const now = stamp();

      /* Snapshot BEFORE anything is touched. Once past this line the live
         record no longer holds the issue the customer was given, so this is
         the only moment the old one can be captured. Appended, never
         written over — see QtRevision. */
      (qt.revisions ??= []).push({
        revision: qt.revision,
        items: (qt.items ?? []).map((it) => ({ ...it })),
        totals: {
          subtotal: docSubtotal(qt),
          discount: docDiscTotal(qt),
          vat: docTaxTotal(qt),
          grandTotal: docGrandTotal(qt),
        },
        approvedBy: qt.approvedBy,
        approvedAt: qt.approvedAt,
        sentAt: qt.sentAt,
        closedAt: now,
        closedReason: note,
      });

      qt.status = "Draft";
      qt.approvalStatus = "Not Submitted";
      /* The refusal no longer applies to the document being edited, and a
         stale reason would skew win/loss reporting. Same as srReopen. */
      qt.rejectReason = "";
      /* The new issue has not been approved or sent yet; the old stamps live
         on in the snapshot above. */
      qt.approvedBy = "";
      qt.approvedAt = "";
      qt.sentAt = "";
      qt.revision += 1;
      qt.updated = now;
      qt.updatedBy = USER();
      log(
        qt,
        `Edit requested — revision ${qt.revision}`,
        `เปิดจาก ${from} กลับเป็นร่างเพื่อแก้ไข: ${note}`,
        "warn",
      );
      commit(
        ctx,
        "เปิดใบกลับมาแก้ไขแล้ว",
        `${qt.code} — ฉบับแก้ไขครั้งที่ ${qt.revision} ต้องขออนุมัติใหม่`,
        "warning",
      );
    },
  });
}

export function qtCancel(qt: QtRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this quotation?",
    message: `${qt.code} จะถูกยกเลิก`,
    confirmText: "Cancel quotation",
    onConfirm: () => {
      qt.status = "Cancelled";
      qt.updated = stamp();
      log(qt, "Cancelled", "ยกเลิกใบเสนอราคา", "warn");
      commit(ctx, "ยกเลิกใบเสนอราคาแล้ว", qt.code, "info");
    },
  });
}

export function qtDelete(qt: QtRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this quotation?",
    message: `${qt.code} จะถูกลบถาวร การกระทำนี้ย้อนกลับไม่ได้`,
    confirmText: "Delete quotation",
    onConfirm: () => {
      const i = QUOTATIONS.indexOf(qt);
      if (i > -1) QUOTATIONS.splice(i, 1);
      commit(ctx, "ลบใบเสนอราคาแล้ว", qt.code, "danger");
    },
  });
}

/* ============================================================
   SALES REQUEST — internal approval, then conversion.
   Approving a request does NOT reserve stock.
   ============================================================ */

export function srSubmit(sr: SrRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-request", "edit", "ส่งขออนุมัติไม่ได้")) return;
  if (!(sr.items ?? []).length) {
    ctx.toast("ยังไม่มีรายการสินค้า", "เพิ่มรายการอย่างน้อย 1 บรรทัดก่อนส่งขออนุมัติ", "warning");
    return;
  }
  sr.status = "Submitted";
  sr.updated = stamp();
  sr.updatedBy = USER();
  log(sr, "Submitted for approval", "ส่งขออนุมัติภายใน", "info");
  commit(ctx, "ส่งขออนุมัติแล้ว", `${sr.code} — รอผู้จัดการฝ่ายขายอนุมัติ`);
}

/** Internal approval. Credit is checked here so the order does not stall later. */
export function srApprove(sr: SrRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-request", "approve", "อนุมัติคำขอขายไม่ได้")) return;
  const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);

  ctx.confirm({
    title: "Approve this sales request?",
    message: (
      <>
        อนุมัติ <strong>{sr.code}</strong> — {sr.customer}
        <br />
        มูลค่า {money0(sr.amount)} บาท
        {!credit.withinLimit && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ลูกค้าเกินวงเงินเครดิต {money0(credit.overBy)} บาท — อนุมัติได้
              แต่ใบสั่งขายจะถูกตั้งเป็น On Hold
            </span>
          </>
        )}
        <br />
        <span className="text-ink-2">การอนุมัติคำขอขายยังไม่จองสต๊อก</span>
      </>
    ),
    confirmText: "Approve request",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      sr.status = "Approved";
      sr.approvedBy = USER();
      sr.approvedDate = now;
      sr.rejectReason = "";
      sr.updated = now;
      sr.updatedBy = USER();
      log(
        sr,
        "Approved",
        credit.withinLimit
          ? `อนุมัติภายในโดย ${USER()} — เครดิตอยู่ในวงเงิน`
          : `อนุมัติภายในโดย ${USER()} — เกินวงเงิน ${money0(credit.overBy)} บาท`,
      );
      commit(ctx, "อนุมัติคำขอขายแล้ว", `${sr.code} — พร้อมแปลงเป็นใบสั่งขาย`);
    },
  });
}

export function srReject(sr: SrRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-request", "approve", "ไม่อนุมัติคำขอขายไม่ได้")) return;
  ctx.confirm({
    title: "Reject this sales request?",
    message: `${sr.code} จะถูกปิดเป็น Rejected — บันทึกเหตุผลไว้ให้พนักงานขายติดตามกับลูกค้า`,
    confirmText: "Reject request",
    onConfirm: () => {
      sr.status = "Rejected";
      if (!sr.rejectReason) sr.rejectReason = "อื่น ๆ";
      sr.approvedBy = USER();
      sr.approvedDate = "";
      sr.updated = stamp();
      sr.updatedBy = USER();
      log(sr, "Rejected", `ไม่อนุมัติ: ${sr.rejectReason}`, "warn");
      commit(ctx, "ไม่อนุมัติคำขอขาย", `${sr.code} — ${sr.rejectReason}`, "danger");
    },
  });
}

/** Send an approved request back for edits. */
export function srReopen(sr: SrRow, ctx: ActionCtx) {
  /* Undoing an approval is an approver's act too. */
  if (denied(ctx, "sales-request", "approve", "ส่งคำขอขายกลับเป็นร่างไม่ได้")) return;
  sr.status = "Draft";
  sr.approvedBy = "";
  sr.approvedDate = "";
  sr.rejectReason = "";
  sr.updated = stamp();
  sr.updatedBy = USER();
  log(sr, "Reopened", "ส่งกลับเป็นร่างเพื่อแก้ไข", "info");
  commit(ctx, "ส่งกลับเป็นร่างแล้ว", `${sr.code} — แก้ไขได้อีกครั้ง`, "info");
}

/* ============================================================
   BUILDING A SALES ORDER

   Two documents produce one: an approved Sales Request, and —
   since the direct route — an accepted Quotation. The order they
   build is the same order, so it is built in one place. The two
   callers differ only in which reference field points home and in
   the words on their confirm dialog.
   ============================================================ */

/** What an order needs from whichever document produced it. */
interface SoDraft {
  customer: string;
  customerCode: string;
  salesRep: string;
  deliveryDate: string;
  warehouse: string;
  currency: string;
  payTerm: string;
  priority: string;
  channel: string;
  customerPo: string;
  items: readonly {
    code: string;
    name: string;
    unit: string;
    qty: number;
    price: number;
    disc: number;
    tax: number;
    note: string;
    customName?: string;
    showOnBill?: boolean;
  }[];
}

/** Where the order came from, and how that reads on the record. */
interface SoOrigin {
  code: string;
  /** The reference field the order carries back to its source. */
  field: "srRef" | "quotationRef";
  /** How the source document is named in Thai, for remark and history. */
  noun: string;
}

/**
 * Lines the warehouse cannot cover right now.
 *
 * Advisory only. Nothing on this path blocks on stock — not this, not
 * `soConfirm` — so an order can legitimately be raised short and filled as a
 * back order. Read at confirm time rather than trusting whatever the screen
 * was showing when the page loaded.
 */
function shortLines(items: SoDraft["items"]) {
  return items
    .map((it) => ({ it, avail: availabilityFor(it.code, it.qty) }))
    .filter((x) => x.avail && x.avail.shortBy > 0);
}

/** The shortage notice both confirm dialogs show. Null when everything fits. */
function StockNotice({ items }: { items: SoDraft["items"] }) {
  const short = shortLines(items);
  if (!short.length) return null;
  return (
    <>
      <br />
      <span className="font-semibold text-warning-text">
        สต๊อกไม่พอ {short.length} รายการ — {short
          .map((x) => `${x.it.code} ขาด ${fmt(x.avail!.shortBy)} ${x.it.unit}`)
          .join(" · ")}
      </span>
      <br />
      <span className="text-ink-2">เปิดใบสั่งขายได้ ส่วนที่ขาดจะกลายเป็น back order</span>
    </>
  );
}

/** Creates the order, pushes it, and returns its code. */
function createSalesOrderFrom(
  draft: SoDraft,
  origin: SoOrigin,
  credit: ReturnType<typeof creditCheck>,
): string {
  const now = stamp();
  const soCode = nextSOCode();

  SALES_ORDERS.unshift({
    code: soCode,
    customer: draft.customer,
    customerCode: draft.customerCode,
    salesRep: draft.salesRep,
    orderDate: now.split(" ")[0],
    deliveryDate: draft.deliveryDate,
    warehouse: draft.warehouse,
    currency: draft.currency,
    fx: 1,
    payTerm: draft.payTerm,
    incoterm: "DAP",
    shipTo: "",
    status: credit.withinLimit ? "Confirmed" : "On Hold",
    priority: draft.priority,
    channel: draft.channel,
    srRef: origin.field === "srRef" ? origin.code : "",
    quotationRef: origin.field === "quotationRef" ? origin.code : "",
    customerPo: draft.customerPo,
    remark: `สร้างจาก${origin.noun} ${origin.code}`,
    creditApproved: credit.withinLimit,
    creditNote: credit.withinLimit
      ? "อยู่ในวงเงิน"
      : `เกินวงเงิน ${money0(credit.overBy)} บาท`,
    items: draft.items.map((it) => ({
      code: it.code,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      disc: it.disc,
      tax: it.tax,
      picked: 0,
      delivered: 0,
      note: it.note,
      /**
       * What the customer was told this line is, carried to the invoice.
       *
       * Copied RAW — deliberately not through `displayName()`, and please do
       * not "finish the job" by routing it through the helper. Every place
       * that DISPLAYS a line goes through `displayName`; every place that
       * COPIES one keeps the field as it found it.
       *
       * The helper's fallback belongs at the moment of reading, not in the
       * data. Writing `displayName(it)` here would stamp the catalogue name
       * into `customName` on lines nobody renamed, and from then on nothing
       * could tell a salesperson's deliberate wording from a fallback the
       * system filled in — including the check that decides what to print.
       */
      customName: it.customName ?? "",
      showOnBill: it.showOnBill !== false,
    })),
    history: [
      {
        t: `Created from ${origin.code}`,
        d: `แปลงจาก${origin.noun}`,
        u: USER(),
        when: now,
        kind: "primary",
      },
    ],
    created: now,
    createdBy: USER(),
    updated: now,
    updatedBy: USER(),
  } as unknown as SoRow);

  return soCode;
}

/** Approved request → a real Sales Order carrying the same priced lines. */
export function srConvert(sr: SrRow, ctx: ActionCtx) {
  /* Turning an approved request into a real order is the step that binds
     the company, so it sits with the approver, not the author. */
  if (denied(ctx, "sales-request", "approve", "แปลงคำขอขายเป็นใบสั่งขายไม่ได้")) return;
  if (sr.status !== "Approved") {
    ctx.toast(
      "ต้องอนุมัติก่อน",
      `${sr.code} อยู่ในสถานะ ${sr.status} — อนุมัติคำขอขายก่อนจึงจะแปลงเป็นใบสั่งขายได้`,
      "warning",
    );
    return;
  }

  const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);

  ctx.confirm({
    title: "Convert to Sales Order?",
    message: (
      <>
        สร้างใบสั่งขายจาก <strong>{sr.code}</strong> — ระบบจะออกเลข SO ให้อัตโนมัติ
        <br />
        มูลค่า {money0(sr.amount)} บาท
        {!credit.withinLimit && (
          <>
            <br />
            <span className="font-semibold text-danger-text">
              เกินวงเงินเครดิต {money0(credit.overBy)} บาท — ใบสั่งขายจะถูกตั้งเป็น On Hold
            </span>
          </>
        )}
        <StockNotice items={sr.items ?? []} />
        <br />
        <span className="text-ink-2">
          สต๊อกจะถูกจองเมื่อยืนยันใบสั่งขาย ไม่ใช่ตอนนี้
        </span>
      </>
    ),
    confirmText: "Convert to SO",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const soCode = createSalesOrderFrom(
        {
          customer: sr.customer,
          customerCode: sr.customerCode,
          salesRep: sr.salesRep,
          deliveryDate: sr.requiredDate,
          warehouse: sr.warehouse,
          currency: sr.currency,
          payTerm: sr.payTerm,
          priority: sr.priority,
          channel: sr.channel,
          customerPo: sr.customerRef,
          items: sr.items ?? [],
        },
        { code: sr.code, field: "srRef", noun: "คำขอขาย" },
        credit,
      );

      sr.status = "Converted";
      sr.soRef = soCode;
      sr.updated = now;
      sr.updatedBy = USER();
      log(sr, "Converted to Sales Order", `สร้าง ${soCode} จากใบเสนอราคานี้`);

      commit(
        ctx,
        "แปลงเป็นใบสั่งขายแล้ว",
        credit.withinLimit
          ? `${sr.code} → ${soCode}`
          : `${sr.code} → ${soCode} (On Hold — รออนุมัติเครดิต)`,
        credit.withinLimit ? "success" : "warning",
      );
      ctx.goto(`/m/sales-order/${encodeURIComponent(soCode)}`);
    },
  });
}

export function srCancel(sr: SrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this sales request?",
    message: `${sr.code} จะถูกยกเลิก`,
    confirmText: "Cancel request",
    onConfirm: () => {
      sr.status = "Cancelled";
      sr.updated = stamp();
      log(sr, "Cancelled", "ยกเลิกคำขอขาย", "warn");
      commit(ctx, "ยกเลิกคำขอขายแล้ว", sr.code, "info");
    },
  });
}

export function srDelete(sr: SrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this sales request?",
    message: `${sr.code} จะถูกลบถาวร การกระทำนี้ย้อนกลับไม่ได้`,
    confirmText: "Delete request",
    onConfirm: () => {
      const i = SALES_REQUESTS.indexOf(sr);
      if (i > -1) SALES_REQUESTS.splice(i, 1);
      commit(ctx, "ลบคำขอขายแล้ว", sr.code, "danger");
    },
  });
}

/* ============================================================
   SALES ORDER
   ============================================================ */

export function soConfirm(so: SoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-order", "approve", "ยืนยันใบสั่งขายไม่ได้")) return;
  const credit = creditCheck(`${so.customerCode} - ${so.customer}`, so.total);

  if (!credit.withinLimit && !so.creditApproved) {
    ctx.confirm({
      title: "เกินวงเงินเครดิต",
      message: (
        <>
          {so.customer} มีวงเงินคงเหลือ <strong>{money0(credit.available)}</strong> บาท
          <br />
          ใบสั่งขายนี้มูลค่า {money0(so.total)} บาท — เกินไป{" "}
          <strong>{money0(credit.overBy)}</strong> บาท
          <br />
          ยืนยันเพื่อตั้งเป็น On Hold รอฝ่ายบัญชีอนุมัติ
        </>
      ),
      confirmText: "ตั้งเป็น On Hold",
      onConfirm: () => {
        so.status = "On Hold";
        so.creditApproved = false;
        so.creditNote = `เกินวงเงิน ${money0(credit.overBy)} บาท`;
        so.updated = stamp();
        log(so, "Put on credit hold", "ยอดรวมเกินวงเงินเครดิตคงเหลือ", "warn");
        commit(ctx, "ตั้งเป็น On Hold", `${so.code} — รออนุมัติเครดิต`, "warning");
      },
    });
    return;
  }

  so.status = "Confirmed";
  so.updated = stamp();
  so.updatedBy = USER();
  log(so, "Confirmed", "ยืนยันคำสั่งขาย พร้อมจัดของ");
  commit(ctx, "ยืนยันใบสั่งขายแล้ว", `${so.code} — พร้อมสร้างใบหยิบสินค้า`);
}

/** Sales admin overriding a credit hold. */
export function soApproveCredit(so: SoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-order", "approve", "ปลดล็อกเครดิตไม่ได้")) return;
  ctx.confirm({
    title: "Approve credit for this order?",
    message: (
      <>
        อนุมัติเครดิตให้ <strong>{so.customer}</strong> สำหรับ {so.code}
        <br />
        มูลค่า {money0(so.total)} บาท — ใบสั่งขายจะเปลี่ยนเป็น Confirmed
      </>
    ),
    confirmText: "Approve credit",
    tone: "primary",
    onConfirm: () => {
      so.creditApproved = true;
      so.creditNote = `อนุมัติพิเศษโดย ${USER()}`;
      so.status = "Confirmed";
      so.updated = stamp();
      so.updatedBy = USER();
      log(so, "Credit approved", `อนุมัติเครดิตพิเศษโดย ${USER()}`);
      commit(ctx, "อนุมัติเครดิตแล้ว", `${so.code} — พร้อมจัดของ`);
    },
  });
}

/** Confirmed order → a picking task the warehouse can act on. */
export function soCreatePick(so: SoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-order", "approve", "เปิดใบจัดสินค้าไม่ได้")) return;
  const existing = PICKING_TASKS.find(
    (t) => t.soRef === so.code && !["Completed", "Cancelled"].includes(t.status),
  );
  if (existing) {
    ctx.toast("มีใบหยิบสินค้าอยู่แล้ว", `${so.code} → ${existing.code}`, "warning");
    ctx.goto(`/m/picking/${encodeURIComponent(existing.code)}`);
    return;
  }

  ctx.confirm({
    title: "Create picking task?",
    message: `สร้างใบหยิบสินค้าจาก ${so.code} — ${so.itemCount} รายการ ${fmt(so.orderedQty)} หน่วย`,
    confirmText: "Create Picking",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextPickCode();

      PICKING_TASKS.unshift({
        code,
        soRef: so.code,
        customer: so.customer,
        customerCode: so.customerCode,
        warehouse: so.warehouse,
        assignedTo: "",
        priority: so.priority,
        status: "Waiting",
        pickDate: "",
        dueDate: so.deliveryDate,
        strategy: "FEFO (หมดอายุก่อน หยิบก่อน)",
        remark: `สร้างจากใบสั่งขาย ${so.code}`,
        items: (so.items ?? []).map((it, i) => ({
          line: i + 1,
          code: it.code,
          name: it.name,
          unit: it.unit,
          lot: "",
          ordered: Math.max(0, Number(it.qty) - Number(it.picked)),
          picked: 0,
          bin: "",
          status: "Pending",
          /* The salesperson's note used to stop here — it was hard-coded
             empty, so anything written when the order was taken never
             reached the floor. The picker needs it: "รับประกัน 2 ปี" changes
             which box comes off the shelf. */
          note: it.note ?? "",
          /* And the name the customer was given, for the same reason. */
          customName: it.customName ?? "",
        })),
        packRef: "",
        history: [
          {
            t: `Created from ${so.code}`,
            d: "สร้างใบหยิบสินค้าจากใบสั่งขาย",
            u: USER(),
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER(),
        updated: now,
        updatedBy: USER(),
      } as unknown as PickRow);

      so.status = "Picking";
      so.updated = now;
      log(so, "Picking started", `สร้างใบหยิบสินค้า ${code}`, "info");

      commit(ctx, "สร้างใบหยิบสินค้าแล้ว", `${so.code} → ${code}`);
      ctx.goto(`/m/picking/${encodeURIComponent(code)}`);
    },
  });
}

export function soCancel(so: SoRow, ctx: ActionCtx) {
  const linked = soLinkedDocs(so.code);
  const openDocs = [
    ...linked.picks.filter((t) => t.status !== "Cancelled"),
    ...linked.packs.filter((t) => t.status !== "Cancelled"),
    ...linked.deliveries.filter((d) => d.status !== "Cancelled"),
  ];

  ctx.confirm({
    title: "Cancel this sales order?",
    message: (
      <>
        {so.code} จะถูกยกเลิก
        {openDocs.length > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              มีเอกสารปลายทางที่ยังเปิดอยู่ {openDocs.length} ใบ —
              ต้องยกเลิกเอกสารเหล่านั้นเองแยกต่างหาก
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Cancel SO",
    onConfirm: () => {
      so.status = "Cancelled";
      so.updated = stamp();
      log(so, "Cancelled", "ยกเลิกใบสั่งขาย", "warn");
      commit(ctx, "ยกเลิกใบสั่งขายแล้ว", so.code, "info");
    },
  });
}

export function soDelete(so: SoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this sales order?",
    message: `${so.code} จะถูกลบถาวร`,
    confirmText: "Delete SO",
    onConfirm: () => {
      const i = SALES_ORDERS.indexOf(so);
      if (i > -1) SALES_ORDERS.splice(i, 1);
      commit(ctx, "ลบใบสั่งขายแล้ว", so.code, "danger");
    },
  });
}

/* ============================================================
   PICKING
   ============================================================ */

export function pickAssign(task: PickRow, staff: string, ctx: ActionCtx) {
  task.assignedTo = staff;
  task.status = "Assigned";
  task.updated = stamp();
  log(task, "Assigned", `มอบหมายให้ ${staff}`, "info");
  commit(ctx, "มอบหมายงานแล้ว", `${task.code} → ${staff}`);
}

export function pickStart(task: PickRow, ctx: ActionCtx) {
  task.status = "In Progress";
  task.pickDate = stamp().split(" ")[0];
  task.updated = stamp();
  log(task, "In progress", "เริ่มหยิบสินค้า", "info");
  commit(ctx, "เริ่มหยิบสินค้า", task.code, "info");
}

/**
 * Completing a pick writes the picked quantities back onto the sales order,
 * which is what lets the order show real progress rather than a guess.
 */
export function pickComplete(task: PickRow, ctx: ActionCtx) {
  const short = task.orderedQty - task.pickedQty;

  ctx.confirm({
    title: "Complete picking?",
    message: (
      <>
        หยิบได้ <strong>{fmt(task.pickedQty)}</strong> จาก {fmt(task.orderedQty)} หน่วย
        {short > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ขาดอีก {fmt(short)} หน่วย — ใบสั่งขายจะยังไม่ปิด
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Complete Picking",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      (task.items ?? []).forEach((it) => {
        it.status = Number(it.picked) >= Number(it.ordered) ? "Picked" : "Short";
      });
      task.status = "Completed";
      task.updated = now;
      log(
        task,
        "Completed",
        `หยิบ ${fmt(task.pickedQty)} หน่วย ส่งต่อฝ่ายแพ็ค`,
        short > 0 ? "warn" : "primary",
      );

      const so = getSO(task.soRef);
      if (so) {
        for (const line of so.items ?? []) {
          const picked = (task.items ?? [])
            .filter((it) => it.code === line.code)
            .reduce((s, it) => s + Number(it.picked), 0);
          line.picked = Math.min(Number(line.qty), Number(line.picked) + picked);
        }
        so.updated = now;
        log(so, "Picking completed", `${task.code} หยิบครบ ${fmt(task.pickedQty)} หน่วย`, "info");
      }

      commit(
        ctx,
        "ปิดงานหยิบสินค้าแล้ว",
        short > 0 ? `${task.code} — หยิบไม่ครบ ${fmt(short)} หน่วย` : `${task.code} — พร้อมแพ็ค`,
        short > 0 ? "warning" : "success",
      );
    },
  });
}

/** Completed pick → a packing task. */
export function pickCreatePack(task: PickRow, ctx: ActionCtx) {
  if (task.packRef) {
    ctx.toast("มีงานแพ็คอยู่แล้ว", `${task.code} → ${task.packRef}`, "warning");
    ctx.goto(`/m/packing/${encodeURIComponent(task.packRef)}`);
    return;
  }

  ctx.confirm({
    title: "Create packing task?",
    message: `สร้างงานแพ็คจาก ${task.code} — ${fmt(task.pickedQty)} หน่วย`,
    confirmText: "Create Packing",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextPackCode();

      PACKING_TASKS.unshift({
        code,
        pickRef: task.code,
        soRef: task.soRef,
        customer: task.customer,
        customerCode: task.customerCode,
        warehouse: task.warehouse,
        packer: "",
        status: "Waiting",
        packDate: "",
        dueDate: task.dueDate,
        priority: task.priority,
        handling: "ปกติ",
        remark: `สร้างจากใบหยิบสินค้า ${task.code}`,
        items: (task.items ?? [])
          .filter((it) => Number(it.picked) > 0)
          .map((it, i) => ({
            line: i + 1,
            code: it.code,
            name: it.name,
            unit: it.unit,
            qty: Number(it.picked),
            packedQty: 0,
            box: "",
            note: it.note ?? "",
            customName: it.customName ?? "",
          })),
        packages: [],
        doRef: "",
        history: [
          {
            t: `Created from ${task.code}`,
            d: "สร้างงานแพ็คจากใบหยิบสินค้า",
            u: USER(),
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER(),
        updated: now,
        updatedBy: USER(),
      } as unknown as PackRow);

      task.packRef = code;
      task.updated = now;

      commit(ctx, "สร้างงานแพ็คแล้ว", `${task.code} → ${code}`);
      ctx.goto(`/m/packing/${encodeURIComponent(code)}`);
    },
  });
}

export function pickCancel(task: PickRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this picking task?",
    message: `${task.code} จะถูกยกเลิก`,
    confirmText: "Cancel Picking",
    onConfirm: () => {
      task.status = "Cancelled";
      task.updated = stamp();
      log(task, "Cancelled", "ยกเลิกงานหยิบสินค้า", "warn");
      commit(ctx, "ยกเลิกงานหยิบสินค้าแล้ว", task.code, "info");
    },
  });
}

/* ============================================================
   PACKING
   ============================================================ */

export function packStart(task: PackRow, ctx: ActionCtx) {
  task.status = "In Progress";
  task.packDate = stamp().split(" ")[0];
  task.updated = stamp();
  log(task, "In progress", "เริ่มแพ็คสินค้า", "info");
  commit(ctx, "เริ่มแพ็คสินค้า", task.code, "info");
}

export function packComplete(task: PackRow, ctx: ActionCtx) {
  if (!task.packages?.length) {
    ctx.toast("ยังไม่มีกล่อง", "เพิ่มกล่องอย่างน้อย 1 ใบก่อนปิดงานแพ็ค", "warning");
    return;
  }

  ctx.confirm({
    title: "Complete packing?",
    message: `แพ็ค ${fmt(task.packedQty)} หน่วย เป็น ${task.boxCount} กล่อง น้ำหนักรวม ${task.totalWeight} กก.`,
    confirmText: "Complete Packing",
    tone: "primary",
    onConfirm: () => {
      task.status = "Completed";
      task.updated = stamp();
      log(task, "Completed", `แพ็คครบ ${fmt(task.packedQty)} หน่วย เป็น ${task.boxCount} กล่อง`);
      commit(ctx, "ปิดงานแพ็คแล้ว", `${task.code} — พร้อมออกใบส่งของ`);
    },
  });
}

/** Completed pack → the delivery order that actually ships. */
export function packCreateDelivery(task: PackRow, ctx: ActionCtx) {
  if (task.doRef) {
    ctx.toast("มีใบส่งของอยู่แล้ว", `${task.code} → ${task.doRef}`, "warning");
    ctx.goto(`/m/delivery-order/${encodeURIComponent(task.doRef)}`);
    return;
  }

  ctx.confirm({
    title: "Create delivery order?",
    message: `ออกใบส่งของจาก ${task.code} — ${task.boxCount} กล่อง ${fmt(task.packedQty)} หน่วย`,
    confirmText: "Create Delivery Order",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextDOCode();
      const so = getSO(task.soRef);

      DELIVERY_ORDERS.unshift({
        code,
        soRef: task.soRef,
        packRef: task.code,
        customer: task.customer,
        customerCode: task.customerCode,
        shipTo: so?.shipTo ?? "",
        contact: "",
        phone: "",
        warehouse: task.warehouse,
        carrier: "A-Factory Fleet",
        service: "Standard",
        driver: "",
        vehicle: "",
        trackingNo: "",
        deliveryDate: so?.deliveryDate ?? task.dueDate,
        deliveryTime: "09:00 - 11:00",
        status: "Draft",
        priority: task.priority,
        packages: task.boxCount,
        weight: task.totalWeight,
        codAmount: 0,
        receivedBy: "",
        receivedDate: "",
        failReason: "",
        remark: `สร้างจากงานแพ็ค ${task.code}`,
        /**
         * Customer-facing wording is read from the SALES ORDER, not carried
         * through the pick and pack tasks — please do not "tidy" this into
         * the chain for consistency.
         *
         * The delivery note is a document to the customer, so its wording
         * must be whatever the order says today. Pick and pack are warehouse
         * jobs whose lines get filtered, split across boxes and renumbered;
         * anything routed through them arrives reordered and, for a line
         * picked short and dropped, not at all. Matching on product code
         * against the order is both shorter and correct.
         */
        items: (task.items ?? []).map((it, i) => {
          const src = (so?.items ?? []).find((s) => s.code === it.code);
          return {
            line: i + 1,
            code: it.code,
            name: it.name,
            unit: it.unit,
            qty: Number(it.packedQty) || Number(it.qty),
            delivered: 0,
            box: it.box,
            note: src?.note ?? it.note ?? "",
            customName: src?.customName ?? "",
            showOnBill: src?.showOnBill !== false,
          };
        }),
        history: [
          {
            t: `Created from ${task.code}`,
            d: "สร้างใบส่งของจากงานแพ็ค",
            u: USER(),
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER(),
        updated: now,
        updatedBy: USER(),
      } as unknown as DoRow);

      task.doRef = code;
      task.updated = now;

      commit(ctx, "ออกใบส่งของแล้ว", `${task.code} → ${code}`);
      ctx.goto(`/m/delivery-order/${encodeURIComponent(code)}`);
    },
  });
}

export function packCancel(task: PackRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this packing task?",
    message: `${task.code} จะถูกยกเลิก`,
    confirmText: "Cancel Packing",
    onConfirm: () => {
      task.status = "Cancelled";
      task.updated = stamp();
      log(task, "Cancelled", "ยกเลิกงานแพ็ค", "warn");
      commit(ctx, "ยกเลิกงานแพ็คแล้ว", task.code, "info");
    },
  });
}

/* ============================================================
   DELIVERY ORDER
   ============================================================ */

export function doReady(d: DoRow, ctx: ActionCtx) {
  d.status = "Ready";
  d.updated = stamp();
  log(d, "Ready to ship", "จัดของขึ้นรถเรียบร้อย", "info");
  commit(ctx, "พร้อมส่ง", `${d.code} — รอออกจากคลัง`);
}

export function doShip(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Ship this delivery?",
    message: `${d.code} — ${d.packages} กล่อง น้ำหนัก ${d.weight} กก. โดย ${d.carrier}`,
    confirmText: "Ship now",
    tone: "primary",
    onConfirm: () => {
      d.status = "Shipped";
      d.updated = stamp();
      log(d, "Shipped", `ออกจากคลังโดย ${d.carrier}`, "info");
      commit(ctx, "ส่งของออกแล้ว", `${d.code} — อยู่ระหว่างจัดส่ง`);
    },
  });
}

/**
 * Confirming receipt is the moment the sale is fulfilled: quantities post
 * back to the sales order, which closes when nothing is outstanding.
 */
export function doConfirmDelivery(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Confirm delivery?",
    message: (
      <>
        ยืนยันว่าลูกค้ารับของแล้ว <strong>{fmt(d.totalQty)}</strong> หน่วย
        <br />
        จำนวนที่ส่งมอบจะถูกบันทึกกลับเข้าใบสั่งขาย {d.soRef}
      </>
    ),
    confirmText: "Confirm delivery",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      (d.items ?? []).forEach((it) => {
        if (!Number(it.delivered)) it.delivered = Number(it.qty);
      });
      d.status = "Delivered";
      d.receivedDate = now;
      if (!d.receivedBy) d.receivedBy = d.contact || d.customer;
      d.updated = now;
      log(d, "Delivered", `ผู้รับ: ${d.receivedBy}`);

      const so = getSO(d.soRef);
      if (so) {
        for (const line of so.items ?? []) {
          const shipped = (d.items ?? [])
            .filter((it) => it.code === line.code)
            .reduce((s, it) => s + Number(it.delivered), 0);
          line.delivered = Math.min(Number(line.qty), Number(line.delivered) + shipped);
        }
        const outstanding = (so.items ?? []).reduce(
          (t, it) => t + Math.max(0, Number(it.qty) - Number(it.delivered)),
          0,
        );
        so.status = outstanding === 0 ? "Completed" : "Partially Delivered";
        so.updated = now;
        log(
          so,
          outstanding === 0 ? "Completed" : "Partially delivered",
          outstanding === 0
            ? "ส่งมอบครบถ้วน ปิดใบสั่งขาย"
            : `ส่งมอบบางส่วน คงเหลือ ${fmt(outstanding)} หน่วย`,
          outstanding === 0 ? "primary" : "info",
        );
      }

      commit(ctx, "ยืนยันการส่งมอบแล้ว", `${d.code} — บันทึกกลับเข้า ${d.soRef}`);
    },
  });
}

export function doFail(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Mark delivery as failed?",
    message: `${d.code} ส่งไม่สำเร็จ — บันทึกเหตุผลไว้ในประวัติเพื่อนัดส่งใหม่`,
    confirmText: "Mark as failed",
    onConfirm: () => {
      d.status = "Failed";
      if (!d.failReason) d.failReason = "ไม่มีผู้รับ";
      d.updated = stamp();
      log(d, "Delivery failed", `เหตุผล: ${d.failReason}`, "warn");
      commit(ctx, "บันทึกส่งไม่สำเร็จ", `${d.code} — ${d.failReason}`, "danger");
    },
  });
}

export function doCancel(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this delivery order?",
    message: `${d.code} จะถูกยกเลิก`,
    confirmText: "Cancel DO",
    onConfirm: () => {
      d.status = "Cancelled";
      d.updated = stamp();
      log(d, "Cancelled", "ยกเลิกใบส่งของ", "warn");
      commit(ctx, "ยกเลิกใบส่งของแล้ว", d.code, "info");
    },
  });
}

export function doDelete(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this delivery order?",
    message: `${d.code} จะถูกลบถาวร`,
    confirmText: "Delete DO",
    onConfirm: () => {
      const i = DELIVERY_ORDERS.indexOf(d);
      if (i > -1) DELIVERY_ORDERS.splice(i, 1);
      commit(ctx, "ลบใบส่งของแล้ว", d.code, "danger");
    },
  });
}

export { getPack, getPick };
