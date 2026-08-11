import { actingUserName, can, currentRole, currentUser, getRole } from "./domain/admin";
import { useState } from "react";
import { docDiscTotal, docGrandTotal, docSubtotal, docTaxTotal } from "./domain/lines";
import {
  MANAGER_ONLY_REASON,
  maySignAt,
  priceApproval,
  rolesSigningAt,
} from "./domain/doc-draft";
import { notify, rolesWhoMay } from "./domain/notify";
import { createInvoiceFrom, invoicesForSource } from "./domain/invoice";
import {
  applyQuotation,
  blankSrDraft,
  saveSalesRequestDraft,
} from "./domain/sales-request-draft";
import { fmt, money0, stamp } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import type { SalesOrder } from "@/data/sales-orders";
import type { PickingTask } from "@/data/picking";
import type { PackingTask } from "@/data/packing";
import type { DeliveryOrder } from "@/data/delivery-orders";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  availabilityFor,
  blockedForDraftPartner,
  checkConfirmLines,
  confirmLines,
  creditCheck,
  decorateOutbound,
  decoratePacks,
  doTotalQty,
  getDO,
  getPack,
  getPick,
  getSO,
  nextDOCode,
  nextPackCode,
  nextPickCode,
  nextSOCode,
  packIsConfirmed,
  pickLineAvailability,
  soOrderedQty,
  soCloseBlocked,
  soLinkedDocs,
  type ConfirmLine,
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
   TELLING THE NEXT PERSON

   Every send below sits inside the function that changes the
   status, never inside a button: there are three surfaces per
   transition — the list row, the detail menu, the workspace —
   and one function.

   Who receives it is read from the permission matrix, and for a
   price under the floor also from the level, so an approval
   request never lands with somebody who will be refused at the
   button. Nobody is told their own news; that is enforced when
   the inbox is read. See lib/domain/notify.ts.
   ============================================================ */

/** Roles that may approve this module AND may sign at this price level. */
const approversFor = (moduleKey: string, level = "admin") => {
  const signing = rolesSigningAt(level);
  return rolesWhoMay(moduleKey, "approve").filter((r) => signing.includes(r));
};

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

  const price = priceApproval(qt.items ?? []);

  /* No cost means nobody can judge the price — not the rep, not the approver.
     Blocked rather than escalated, and the message says where to fix it. */
  if (price.noCost.length) {
    ctx.toast(
      "ส่งขออนุมัติไม่ได้",
      `${price.noCost.length} รายการยังไม่มีต้นทุน (${price.noCost
        .map((l) => l.code)
        .join(", ")}) — ไปตั้งต้นทุนที่ทะเบียนสินค้าก่อน แล้วจึงส่งขออนุมัติได้`,
      "danger",
    );
    return;
  }

  qt.status = "Pending Approval";
  qt.approvalStatus = "Pending Approval";
  /* Frozen here, not read again at approval time — see the field's comment. */
  qt.priceApprovalLevel = price.level;
  qt.uncheckedPriceLines = price.uncheckable.length;
  qt.updated = stamp();
  qt.updatedBy = USER();
  log(
    qt,
    "Submitted for approval",
    price.level === "manager"
      ? `ส่งขออนุมัติภายใน — ต้องให้ผู้จัดการอนุมัติ (${price.flagged.length} รายการต่ำกว่าราคาขั้นต่ำ)`
      : "ส่งขออนุมัติภายใน",
    "info",
  );
  notify({
    kind: price.level === "manager" ? "escalated" : "approval_request",
    docType: "quotation",
    docCode: qt.code,
    title: `ใบเสนอราคา ${qt.code} รออนุมัติ`,
    body:
      price.level === "manager"
        ? `${qt.customer} — ${price.flagged.length} รายการต่ำกว่าราคาขั้นต่ำ ต้องให้ผู้จัดการอนุมัติ`
        : `${qt.customer} — มูลค่า ${money0(qt.amount)} บาท`,
    toRoles: approversFor("quotation", price.level),
  });
  commit(
    ctx,
    "ส่งขออนุมัติแล้ว",
    price.level === "manager"
      ? `${qt.code} — ต้องให้ผู้จัดการฝ่ายขายอนุมัติ`
      : `${qt.code} — รอผู้จัดการฝ่ายขายอนุมัติ`,
  );
}

/* Who may sign at a given price level now lives beside the function that
   decides the level — the dashboard asks the same question. See doc-draft. */

/** Pending Approval → Approved. From here the quote may be sent out. */
export function qtApprove(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "quotation", "approve", "อนุมัติใบเสนอราคาไม่ได้")) return;

  /* The level the document asked for when it was submitted, not one worked
     out again now against a price master that may have moved since. */
  if (!maySignAt(qt.priceApprovalLevel)) {
    ctx.toast("อนุมัติไม่ได้", `${qt.code} ${MANAGER_ONLY_REASON}`, "danger");
    return;
  }

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
      notify({
        kind: "approved",
        docType: "quotation",
        docCode: qt.code,
        title: `${qt.code} อนุมัติแล้ว`,
        body: `อนุมัติภายในโดย ${USER()} — ส่งให้ลูกค้าได้`,
        toUser: qt.createdBy,
      });
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
      notify({
        kind: "rejected",
        docType: "quotation",
        docCode: qt.code,
        title: `${qt.code} ไม่ผ่านการอนุมัติ`,
        body: note,
        toUser: qt.createdBy,
      });
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
      notify({
        kind: "revision_requested",
        docType: "quotation",
        docCode: qt.code,
        title: `${qt.code} ถูกส่งกลับให้แก้ไข`,
        body: note,
        toUser: qt.createdBy,
      });
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

/* ============================================================
   ACCEPTED QUOTATION → SALES REQUEST

   The quotation is optional; the sales request is not. A quote
   carries an agreed price and the customer's yes, and neither of
   those is an internal decision to fulfil — the warehouse, the
   credit position and the delivery date still have to be signed
   off by somebody inside the company, and the request is where
   that happens. Letting an accepted quote become an order
   directly skipped that step for exactly the customers who had
   been through the most process.

   Nothing is built here. The quotation → request path already
   exists for the editor — `applyQuotation` lays the quote's own
   terms over the customer master, and `saveSalesRequestDraft`
   writes the record and closes the quotation. This calls the
   same two, so a request raised from a menu and one raised in
   the editor cannot differ.

   A Draft partner is deliberately NOT blocked here: quotations
   and requests are open to one, and only the order is not — see
   `blockedForDraftPartner`. Blocking here would strand the very
   case that rule was written to allow.
   ============================================================ */

export function qtConvert(qt: QtRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-request", "create", "เปิดคำขอขายไม่ได้")) return;
  if (qt.status !== "Accepted") {
    ctx.toast(
      "แปลงเป็นคำขอขายไม่ได้",
      `${qt.code} อยู่ในสถานะ ${qt.status} — ต้องให้ลูกค้าตอบรับก่อน`,
      "warning",
    );
    return;
  }
  if (qt.srRef || qt.soRef) {
    ctx.toast(
      "แปลงไปแล้ว",
      `${qt.code} → ${qt.srRef || qt.soRef}`,
      "warning",
    );
    return;
  }

  const credit = creditCheck(`${qt.customerCode} - ${qt.customer}`, qt.amount);

  ctx.confirm({
    title: "Convert to Sales Request?",
    message: (
      <>
        สร้างคำขอขายจาก <strong>{qt.code}</strong> — ระบบจะออกเลข SR ให้อัตโนมัติ
        <br />
        มูลค่า {money0(qt.amount)} บาท
        {!credit.withinLimit && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ลูกค้าเกินวงเงินเครดิต {money0(credit.overBy)} บาท — เปิดคำขอขายได้
              แต่ใบสั่งขายจะถูกตั้งเป็น On Hold
            </span>
          </>
        )}
        <StockNotice items={qt.items ?? []} />
        <br />
        <span className="text-ink-2">
          คำขอขายยังไม่จองสต๊อกและยังไม่ผูกพันบริษัท — ต้องผ่านการอนุมัติก่อนจึงเปิดใบสั่งขายได้
        </span>
      </>
    ),
    confirmText: "Convert to SR",
    tone: "primary",
    onConfirm: () => {
      /* saveSalesRequestDraft writes the request AND closes the quotation —
         it sets srRef and the Converted status itself, so nothing here does
         it a second time. */
      const res = saveSalesRequestDraft(applyQuotation(blankSrDraft(), qt.code), {
        user: USER(),
      });

      commit(ctx, "แปลงเป็นคำขอขายแล้ว", `${qt.code} → ${res.code}`);
      ctx.goto(`/m/sales-request/${encodeURIComponent(res.code)}`);
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

/**
 * Draft → Submitted, judged on price exactly as `qtSubmit` is.
 *
 * The floor rule used to live only on the quotation, which made it optional:
 * a salesperson who raised a request directly — the route that exists
 * precisely for customers who never asked for a quotation — never met it. The
 * same three outcomes apply here, from the same function, for the same
 * reasons: no cost blocks, a price under the floor escalates, an unknown
 * product is carried as unchecked rather than refused.
 */
export function srSubmit(sr: SrRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-request", "edit", "ส่งขออนุมัติไม่ได้")) return;
  if (!(sr.items ?? []).length) {
    ctx.toast("ยังไม่มีรายการสินค้า", "เพิ่มรายการอย่างน้อย 1 บรรทัดก่อนส่งขออนุมัติ", "warning");
    return;
  }

  const price = priceApproval(sr.items ?? []);

  /* No cost means nobody can judge the price — not the rep, not the approver.
     Blocked rather than escalated, and the message says where to fix it. */
  if (price.noCost.length) {
    ctx.toast(
      "ส่งขออนุมัติไม่ได้",
      `${price.noCost.length} รายการยังไม่มีต้นทุน (${price.noCost
        .map((l) => l.code)
        .join(", ")}) — ไปตั้งต้นทุนที่ทะเบียนสินค้าก่อน แล้วจึงส่งขออนุมัติได้`,
      "danger",
    );
    return;
  }

  sr.status = "Submitted";
  /* Frozen here, not read again at approval time — see the field's comment. */
  sr.priceApprovalLevel = price.level;
  sr.uncheckedPriceLines = price.uncheckable.length;
  sr.updated = stamp();
  sr.updatedBy = USER();
  log(
    sr,
    "Submitted for approval",
    price.level === "manager"
      ? `ส่งขออนุมัติภายใน — ต้องให้ผู้จัดการอนุมัติ (${price.flagged.length} รายการต่ำกว่าราคาขั้นต่ำ)`
      : "ส่งขออนุมัติภายใน",
    "info",
  );
  notify({
    kind: price.level === "manager" ? "escalated" : "approval_request",
    docType: "sales-request",
    docCode: sr.code,
    title: `คำขอขาย ${sr.code} รออนุมัติ`,
    body:
      price.level === "manager"
        ? `${sr.customer} — ${price.flagged.length} รายการต่ำกว่าราคาขั้นต่ำ ต้องให้ผู้จัดการอนุมัติ`
        : `${sr.customer} — มูลค่า ${money0(sr.amount)} บาท`,
    toRoles: approversFor("sales-request", price.level),
  });
  commit(
    ctx,
    "ส่งขออนุมัติแล้ว",
    price.level === "manager"
      ? `${sr.code} — ต้องให้ผู้จัดการฝ่ายขายอนุมัติ`
      : `${sr.code} — รอผู้อนุมัติ`,
  );
}

/** Internal approval. Credit is checked here so the order does not stall later. */
export function srApprove(sr: SrRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-request", "approve", "อนุมัติคำขอขายไม่ได้")) return;

  /* The level the document asked for when it was submitted, not one worked
     out again now against a price master that may have moved since. */
  if (!maySignAt(sr.priceApprovalLevel)) {
    ctx.toast("อนุมัติไม่ได้", `${sr.code} ${MANAGER_ONLY_REASON}`, "danger");
    return;
  }

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
      notify({
        kind: "approved",
        docType: "sales-request",
        docCode: sr.code,
        title: `${sr.code} อนุมัติแล้ว`,
        body: `อนุมัติภายในโดย ${USER()} — แปลงเป็นใบสั่งขายได้`,
        toUser: sr.createdBy,
      });
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
      notify({
        kind: "rejected",
        docType: "sales-request",
        docCode: sr.code,
        title: `${sr.code} ไม่ผ่านการอนุมัติ`,
        body: sr.rejectReason,
        toUser: sr.createdBy,
      });
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
  /* The level belonged to the figures that were submitted. Whoever edits now
     may raise or lower a price, so it is judged again on the way back in
     rather than carried across and quietly reused. */
  sr.priceApprovalLevel = "admin";
  sr.uncheckedPriceLines = 0;
  sr.updated = stamp();
  sr.updatedBy = USER();
  log(sr, "Reopened", "ส่งกลับเป็นร่างเพื่อแก้ไข", "info");
  commit(ctx, "ส่งกลับเป็นร่างแล้ว", `${sr.code} — แก้ไขได้อีกครั้ง`, "info");
}

/* ============================================================
   BUILDING A SALES ORDER

   One caller now: `srConvert`. There were two — an accepted
   quotation used to become an order directly — and that route was
   withdrawn because it let the customers who had been through the
   most process skip the one internal approval that decides
   whether the company will actually fulfil.

   The shape stays generic anyway, and deliberately. `SoOrigin`
   still carries which reference field points home, because the
   orders already in the book were raised both ways: an order with
   `quotationRef` set is one of the old ones, it must still open,
   and its bill-type drift must still compare against the document
   it actually came from. Collapsing this into "always srRef"
   would quietly rewrite the history of those records.
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
  /** "VAT" or "Non VAT" — carried from the document that produced the order. */
  billType: string;
  /**
   * The header charges agreed on the document upstream, in baht.
   *
   * Carried, never recomputed. The figure the customer agreed to is the one
   * the order has to commit us to, and the one the invoice then collects.
   */
  headerDisc: number;
  freight: number;
  otherCharges: number;
  /**
   * Where the goods go, and what the driver has to know.
   *
   * `shipTo` was hard-coded to `""` here. Every order raised by conversion —
   * which is every order the process actually produces — reached the
   * warehouse with no address on it, and the delivery note then fell back to
   * whatever the partner master held. A customer who asked on the quotation
   * for one delivery to a branch got it sent to head office, and nothing on
   * any screen looked wrong.
   */
  shipTo: string;
  shipContact: string;
  shipPhone: string;
  shipInstruction: string;
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
  /* Both conversion routes come through here, so the partner check sits here
     rather than in each of them. The callers ask first so they can show the
     message; this is the backstop that holds if one ever forgets. */
  const blocked = blockedForDraftPartner(draft.customerCode);
  if (blocked) throw new Error(blocked);
  const soCode = nextSOCode();

  const fresh: SalesOrder = {
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
    shipTo: draft.shipTo,
    shipContact: draft.shipContact,
    shipPhone: draft.shipPhone,
    shipInstruction: draft.shipInstruction,
    status: credit.withinLimit ? "Confirmed" : "On Hold",
    priority: draft.priority,
    channel: draft.channel,
    /* How the order is billed follows the document it came from, not the
       customer master — the customer may have registered for VAT since the
       quotation was agreed, and the agreed figures are what stand. */
    billType: draft.billType || "VAT",
    srRef: origin.field === "srRef" ? origin.code : "",
    quotationRef: origin.field === "quotationRef" ? origin.code : "",
    customerPo: draft.customerPo,
    remark: `สร้างจาก${origin.noun} ${origin.code}`,
    headerDisc: draft.headerDisc,
    freight: draft.freight,
    otherCharges: draft.otherCharges,
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
  };
  SALES_ORDERS.unshift(fresh as SoRow);

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

  /* Asked here so the salesperson gets the message and the way out. */
  const blocked = blockedForDraftPartner(sr.customerCode);
  if (blocked) {
    ctx.toast("เปิดใบสั่งขายไม่ได้", blocked, "danger");
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
          billType: sr.billType,
          headerDisc: sr.headerDisc,
          freight: sr.freight,
          otherCharges: sr.otherCharges,
          /* An order billed to the customer's own address still goes to the
             customer's own address — `shipTo` empty keeps the reading the
             delivery note and the print engine already have for it. A
             one-off address is the case that was being lost, and it is the
             case that is now carried. */
          shipTo: sr.sameAsBill ? "" : sr.shipAddress,
          shipContact: sr.sameAsBill ? "" : sr.shipContact,
          shipPhone: sr.sameAsBill ? "" : sr.shipPhone,
          /* Not conditional. "ส่งเช้าเท่านั้น" applies wherever the goods are
             going, and the warehouse needs it either way. */
          shipInstruction: sr.shipInstruction,
          items: sr.items ?? [],
        },
        { code: sr.code, field: "srRef", noun: "คำขอขาย" },
        credit,
      );

      sr.status = "Converted";
      sr.soRef = soCode;
      sr.updated = now;
      sr.updatedBy = USER();
      log(sr, "Converted to Sales Order", `สร้าง ${soCode} จากคำขอขายนี้`);
      /* Two audiences, one event: the salesperson learns their request became
         an order, and the warehouse learns there is one to pick. */
      notify({
        kind: "converted",
        docType: "sales-order",
        docCode: soCode,
        title: `เปิดใบสั่งขาย ${soCode} แล้ว`,
        body: `${sr.customer} — แปลงจากคำขอขาย ${sr.code}`,
        toUser: sr.createdBy,
        toRoles: rolesWhoMay("picking", "create"),
      });

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

  /* Stock is read at the moment of confirming, not taken from the screen —
     the page may have been open since before somebody else's order took the
     same units. See soShortLines. */
  const short = soShortLines(so);
  if (short.length) {
    askAboutShortStock(so, short, ctx);
    return;
  }

  confirmOrder(so, ctx, "ยืนยันคำสั่งขาย พร้อมจัดของ");
}

/** The part of confirming that is the same however the shortage was answered. */
function confirmOrder(so: SoRow, ctx: ActionCtx, detail: string) {
  so.status = "Confirmed";
  so.updated = stamp();
  so.updatedBy = USER();
  log(so, "Confirmed", detail);
  commit(ctx, "ยืนยันใบสั่งขายแล้ว", `${so.code} — พร้อมสร้างใบหยิบสินค้า`);
}

/* ============================================================
   NOT ENOUGH STOCK — ASKED WHILE IT STILL MATTERS

   The order used to find out at the loading bay: `Partially
   Delivered` was set when a delivery was confirmed, by which
   point the lorry has gone and the customer has been told a date
   that is already wrong.

   Confirming the order is the last moment a person is still in
   front of the paperwork with the customer reachable, so the
   question is asked here, and it is a question rather than a
   warning: a shortage has three honest answers and the software
   should not pick one.

   The dialog at conversion time stays as it is — it warns, it
   does not ask. Nothing is committed there, so there is nothing
   to decide yet.
   ============================================================ */

interface ShortLine {
  code: string;
  name: string;
  unit: string;
  ordered: number;
  available: number;
  shortBy: number;
}

/** Lines this warehouse cannot cover today, with how far short each one is. */
export function soShortLines(so: { items?: SoRow["items"] }): ShortLine[] {
  const out: ShortLine[] = [];
  for (const it of so.items ?? []) {
    const avail = availabilityFor(it.code, Number(it.qty));
    if (!avail || avail.shortBy <= 0) continue;
    out.push({
      code: it.code,
      name: it.name,
      unit: it.unit,
      ordered: Number(it.qty),
      available: avail.available,
      shortBy: avail.shortBy,
    });
  }
  return out;
}

type ShortAnswer = "backorder" | "trim" | "cancel";

/**
 * The three answers, as radio buttons rather than three dialogs.
 *
 * Trimming asks who at the customer agreed to it. Cutting a line a customer
 * ordered is a change to what was agreed, and a change nobody can name later
 * is indistinguishable from the warehouse quietly shipping less.
 */
function ShortStockForm({
  short,
  onAnswer,
  onWho,
}: {
  short: ShortLine[];
  onAnswer: (a: ShortAnswer) => void;
  onWho: (v: string) => void;
}) {
  const [answer, setAnswer] = useState<ShortAnswer>("backorder");

  const option = (value: ShortAnswer, label: string, detail: string) => (
    <label className="flex cursor-pointer gap-2.5 rounded-btn border border-line p-3 hover:bg-surface">
      <input
        type="radio"
        name="short-stock"
        value={value}
        checked={answer === value}
        onChange={() => {
          setAnswer(value);
          onAnswer(value);
        }}
        className="mt-0.5"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-cap text-ink-2">{detail}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-btn border border-[#FDE68A] bg-warning-soft p-3">
        <p className="mb-1.5 text-[13px] font-semibold text-warning-text">
          สต๊อกไม่พอ {short.length} รายการ
        </p>
        <ul className="flex flex-col gap-0.5 text-[13px] text-ink-2">
          {short.map((l) => (
            <li key={l.code} className="tnum">
              {l.code} — สั่ง {fmt(l.ordered)} {l.unit} · มี {fmt(l.available)} · ขาด{" "}
              <span className="font-semibold text-warning-text">{fmt(l.shortBy)}</span>
            </li>
          ))}
        </ul>
      </div>

      {option(
        "backorder",
        "เปิดเป็นของค้างส่ง",
        "ยืนยันตามจำนวนเดิม ส่งเท่าที่มีก่อน ส่วนที่เหลือค้างไว้ในใบสั่งขาย",
      )}
      {option(
        "trim",
        "ยกเลิกส่วนที่ขาด",
        "ตัดจำนวนลงเหลือเท่าที่มี — ใช้เมื่อลูกค้ายืนยันแล้วว่าไม่รอ",
      )}
      {option("cancel", "ยกเลิกทั้งใบ", "ปิดใบสั่งขายนี้ทั้งใบ")}

      {answer === "trim" && (
        <TextField
          label="ใครที่ลูกค้ายืนยัน"
          placeholder="เช่น คุณสมหญิง ฝ่ายจัดซื้อ — ยืนยันทางโทรศัพท์"
          onChange={onWho}
        />
      )}
    </div>
  );
}

function askAboutShortStock(so: SoRow, short: ShortLine[], ctx: ActionCtx) {
  let answer: ShortAnswer = "backorder";
  let who = "";
  const summary = short.map((l) => `${l.code} ขาด ${fmt(l.shortBy)} ${l.unit}`).join(" · ");

  ctx.formModal({
    title: "สต๊อกไม่พอ — จะเดินต่ออย่างไร",
    body: () => (
      <ShortStockForm
        short={short}
        onAnswer={(a) => (answer = a)}
        onWho={(v) => (who = v)}
      />
    ),
    confirmText: "ยืนยันตามที่เลือก",
    onConfirm: () => {
      const now = stamp();

      if (answer === "backorder") {
        confirmOrder(so, ctx, `ยืนยันคำสั่งขาย — เปิดเป็นของค้างส่ง: ${summary}`);
        return;
      }

      if (answer === "trim") {
        if (!who.trim()) {
          ctx.toast(
            "ต้องระบุผู้ยืนยัน",
            "การตัดจำนวนคือการเปลี่ยนสิ่งที่ตกลงกับลูกค้า — ต้องบอกได้ว่าใครยืนยัน",
            "danger",
          );
          return false;
        }
        for (const line of so.items ?? []) {
          const cut = short.find((s) => s.code === line.code);
          if (cut) line.qty = cut.available;
        }
        so.remark = `${so.remark ? `${so.remark} · ` : ""}ตัดจำนวนที่ของไม่พอ ${now} — ลูกค้ายืนยันโดย ${who}`;
        log(so, "Shortfall cancelled", `ตัดจำนวนลงเหลือเท่าที่มี — ลูกค้ายืนยันโดย ${who} (${summary})`, "warn");
        notifyOwner(so, {
          kind: "converted",
          title: `${so.code} ถูกตัดจำนวนที่ของไม่พอ`,
          body: `${summary} — ลูกค้ายืนยันโดย ${who}`,
        });
        confirmOrder(so, ctx, `ยืนยันคำสั่งขายหลังตัดจำนวน — ลูกค้ายืนยันโดย ${who}`);
        return;
      }

      so.status = "Cancelled";
      so.updated = now;
      so.updatedBy = USER();
      log(so, "Cancelled", `ยกเลิกทั้งใบเพราะของไม่พอ: ${summary}`, "warn");
      notifyOwner(so, {
        kind: "rejected",
        title: `${so.code} ถูกยกเลิกเพราะของไม่พอ`,
        body: summary,
      });
      commit(ctx, "ยกเลิกใบสั่งขายแล้ว", `${so.code} — ของไม่พอ`, "danger");
    },
  });
}

/**
 * The salesperson whose order this is.
 *
 * NOT `so.createdBy`: an order is stamped with whoever converted the request,
 * which is the administrator almost every time. The person who has to ring
 * the customer is the one who raised the paperwork, and that is the author of
 * the request behind it. Falls back to the order's own stamp for the older
 * records that came from a quotation directly.
 *
 * Not `so.salesRep` either — that field holds a territory label
 * ("SALE001 - Patcharin Thiengkaew") which is not a user of this system,
 * while an inbox matches on the name a session stamps.
 */
function orderOwner(so: SoRow): string {
  const sr = so.srRef ? SALES_REQUESTS.find((r) => r.code === so.srRef) : null;
  return sr?.createdBy || so.createdBy;
}

/** Tell that person. */
function notifyOwner(
  so: SoRow,
  n: { kind: "converted" | "rejected" | "escalated"; title: string; body: string },
) {
  notify({
    kind: n.kind,
    docType: "sales-order",
    docCode: so.code,
    title: n.title,
    body: n.body,
    toUser: orderOwner(so),
  });
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

/**
 * Confirmed order → a picking task the warehouse can act on.
 *
 * One sheet carries everything the order still owes, so the floor can see the
 * whole job at once and the office can see which of it is coverable today.
 * Lines already picked in full are left off: on the second pass — the back
 * order after a partial delivery — they would be noise on a sheet whose
 * remaining lines are the point.
 */
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

  /* What is left to pick, and what the warehouse can cover of it right now.
     Read here rather than off the order row: the page may have been open
     since before somebody else's order took the same stock. */
  const outstanding = (so.items ?? []).filter(
    (it) => Math.max(0, Number(it.qty) - Number(it.picked)) > 0,
  );
  if (!outstanding.length) {
    ctx.toast("ไม่มีรายการค้างส่ง", `${so.code} — หยิบครบทุกบรรทัดแล้ว`, "warning");
    return;
  }
  const cover = outstanding.map((it) =>
    pickLineAvailability({ code: it.code, ordered: Number(it.qty) - Number(it.picked), picked: 0 }),
  );
  const waitQty = cover.reduce((s, c) => s + c.waitQty, 0);
  const waitLines = cover.filter((c) => c.waitQty > 0).length;

  ctx.confirm({
    title: "Create picking task?",
    message: (
      <>
        สร้างใบหยิบสินค้าจาก <strong>{so.code}</strong> — {outstanding.length} รายการ{" "}
        {fmt(cover.reduce((s, c) => s + c.remaining, 0))} หน่วย
        {waitQty > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              มีของพร้อมหยิบ {fmt(cover.reduce((s, c) => s + c.readyQty, 0))} หน่วย · ต้องรอของอีก{" "}
              {fmt(waitQty)} หน่วย จาก {waitLines} รายการ
            </span>
            <br />
            <span className="text-ink-2">
              ส่งเท่าที่มีก่อนได้ — ส่วนที่รอจะค้างอยู่ในใบสั่งขายและเปิดใบหยิบรอบถัดไปได้
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Create Picking",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextPickCode();

      const fresh: PickingTask = {
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
        items: outstanding.map((it, i) => ({
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
      };
      PICKING_TASKS.unshift(fresh as PickRow);

      so.status = "Picking";
      so.updated = now;
      log(so, "Picking started", `สร้างใบหยิบสินค้า ${code}`, "info");

      commit(ctx, "สร้างใบหยิบสินค้าแล้ว", `${so.code} → ${code}`);
      ctx.goto(`/m/picking/${encodeURIComponent(code)}`);
    },
  });
}

/**
 * Close the order by hand.
 *
 * Confirming the last delivery already closes it — this is for the order that
 * got there some other way, and for anyone who comes looking for the button.
 * The rule it enforces is the one worth stating out loud: an order closes when
 * the goods are with the customer, never because somebody wants it off a list.
 */
export function soClose(so: SoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-order", "approve", "ปิดใบสั่งขายไม่ได้")) return;

  const blocked = soCloseBlocked(so);
  if (blocked) {
    ctx.toast("ปิดใบสั่งขายไม่ได้", `${so.code} — ${blocked}`, "warning");
    return;
  }

  ctx.confirm({
    title: "Close this sales order?",
    message: (
      <>
        ปิด <strong>{so.code}</strong> — ส่งมอบครบ {fmt(so.deliveredQty)} หน่วยแล้ว
        <br />
        <span className="text-ink-2">ปิดแล้วจะเปิดใบหยิบสินค้าจากใบสั่งขายนี้อีกไม่ได้</span>
      </>
    ),
    confirmText: "Close order",
    tone: "primary",
    onConfirm: () => {
      so.status = "Completed";
      so.updated = stamp();
      so.updatedBy = USER();
      log(so, "Completed", `ปิดใบสั่งขายโดย ${USER()} — ส่งมอบครบถ้วน`);
      commit(ctx, "ปิดใบสั่งขายแล้ว", `${so.code} — ส่งมอบครบถ้วน`);
    },
  });
}

/**
 * Order → invoice, for money collected before the goods move: a deposit, a
 * cash sale, a customer who pays against the order. What ships is billed from
 * the delivery note instead — `doCreateInvoice` — and the invoice form nets
 * both routes against what has already been billed, so neither can bill the
 * same units twice.
 */
export function soCreateInvoice(so: SoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-invoice", "create", "ออกใบแจ้งหนี้ไม่ได้")) return;
  if (!["Confirmed", "Picking", "Partially Delivered", "Completed"].includes(so.status)) {
    ctx.toast(
      "ออกใบแจ้งหนี้ไม่ได้",
      `${so.code} อยู่ในสถานะ ${so.status} — วางบิลได้เมื่อยืนยันใบสั่งขายแล้ว`,
      "warning",
    );
    return;
  }
  /* Order matters: the document list is read off the type. */
  ctx.goto(
    `/m/sales-invoice/new?sourceType=${encodeURIComponent("Sales Order")}&sourceDoc=${encodeURIComponent(so.code)}`,
  );
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
 * Fill every line with what the warehouse can actually cover, leaving the rest
 * outstanding. The picker still walks the floor and still corrects the numbers
 * — this is the starting point, not the answer, and it is what turns "อะไรมีของ
 * อะไรต้องรอ" into a pick that can be completed for the part that exists.
 */
export function pickFillAvailable(task: PickRow, ctx: ActionCtx) {
  if (denied(ctx, "picking", "edit", "แก้ไขใบหยิบสินค้าไม่ได้")) return;
  if (["Completed", "Cancelled"].includes(task.status)) {
    ctx.toast(
      "เติมจำนวนไม่ได้",
      `${task.code} อยู่ในสถานะ ${task.status} — งานที่ปิดแล้วแก้ไขไม่ได้`,
      "warning",
    );
    return;
  }

  const fills = (task.items ?? []).map((it) => ({ it, cover: pickLineAvailability(it) }));
  const addQty = fills.reduce((s, f) => s + f.cover.readyQty, 0);
  if (addQty === 0) {
    ctx.toast(
      "ไม่มีของให้หยิบเพิ่ม",
      task.waitQty > 0
        ? `${task.code} — รอของอีก ${fmt(task.waitQty)} หน่วย จาก ${task.waitLines} รายการ`
        : `${task.code} — หยิบครบทุกบรรทัดแล้ว`,
      "warning",
    );
    return;
  }

  ctx.confirm({
    title: "Fill from available stock?",
    message: (
      <>
        เติมจำนวนหยิบตามของที่มีจริงในคลัง <strong>{fmt(addQty)}</strong> หน่วย
        {task.waitQty > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              อีก {fmt(task.waitQty)} หน่วย จาก {task.waitLines} รายการยังไม่มีของ — จะค้างไว้ในใบสั่งขาย
            </span>
          </>
        )}
      </>
    ),
    confirmText: "เติมตามของที่มี",
    tone: "primary",
    onConfirm: () => {
      for (const { it, cover } of fills) it.picked = Number(it.picked) + cover.readyQty;
      task.updated = stamp();
      task.updatedBy = USER();
      log(task, "Filled from stock", `เติมจำนวนตามของที่มี ${fmt(addQty)} หน่วย`, "info");
      commit(
        ctx,
        "เติมจำนวนแล้ว",
        task.waitQty > 0
          ? `${task.code} — รอของอีก ${fmt(task.waitQty)} หน่วย`
          : `${task.code} — ครบทุกบรรทัด`,
        task.waitQty > 0 ? "warning" : "success",
      );
    },
  });
}

/**
 * Completing a pick writes the picked quantities back onto the sales order,
 * which is what lets the order show real progress rather than a guess.
 */
export function pickComplete(task: PickRow, ctx: ActionCtx) {
  /* Warehouse work, warehouse permission. Without this the VIEW_ONLY grant
     Sales Admin now carries on picking would be decoration: the menu item
     would be hidden and the function would still run for anyone who reached
     it. Whoever puts their hands on the goods says what came off the shelf. */
  if (denied(ctx, "picking", "edit", "ปิดงานหยิบสินค้าไม่ได้")) return;

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

        /* A short pick is the moment the order actually became partial, and
           it is hours or days before the lorry leaves — early enough for
           somebody to ring the customer, which was the whole complaint.
           The status moves now rather than at delivery.

           Worth knowing when reading a report: from here the status says
           "partial" while `delivered` is still nought on every line. The
           quantities are what the fulfilment figures are computed from, so
           they stay correct; it is the STATUS that now means "this order will
           not go out in one piece", earlier than its name suggests. */
        if (short > 0 && !["Cancelled", "Completed"].includes(so.status)) {
          so.status = "Partially Delivered";
          log(
            so,
            "Short picked",
            `${task.code} หยิบได้ ${fmt(task.pickedQty)} จาก ${fmt(task.orderedQty)} หน่วย — ขาด ${fmt(short)}`,
            "warn",
          );
          notifyOwner(so, {
            kind: "escalated",
            title: `${so.code} หยิบของไม่ครบ`,
            body: `ขาด ${fmt(short)} หน่วย จาก ${task.code} — ติดต่อลูกค้าเรื่องกำหนดส่งได้เลย`,
          });
        }
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

      const fresh: PackingTask = {
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
      };
      PACKING_TASKS.unshift(fresh as PackRow);

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
  if (denied(ctx, "packing", "edit", "ปิดงานแพ็คไม่ได้")) return;
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

/* ============================================================
   THE WAREHOUSE SAYS WHAT CAN ACTUALLY GO

   The last thing that happens on the warehouse floor, and the
   first number the customer-facing paperwork is allowed to be
   built from.

   Before this step the chain carried the order's intention all
   the way to the invoice: pack line → delivery note → tax
   invoice, each defaulting to the one before. That bills for
   goods nobody has confirmed leaving the building.

   Three properties hold this together, and all three are here
   rather than in the modal:

   1. Only the warehouse may answer. `edit` on `packing`, which
      Sales Admin no longer holds — see the role note in
      data/admin.ts. The desk that issues the invoice is not the
      desk that says what shipped.
   2. Nobody may confirm more than picking handed over.
   3. Shipping short of the order needs a reason in writing.

   Rules 2 and 3 live in `checkConfirmLines()` and are checked
   again here on the way to the write, so a stale page cannot
   walk past a form that was showing the message.
   ============================================================ */

function ConfirmShipForm({
  lines,
  onChange,
}: {
  lines: ConfirmLine[];
  onChange: (v: Record<string, { qty: number; reason: string }>) => void;
}) {
  const [state, setState] = useState<Record<string, { qty: number; reason: string }>>(() =>
    Object.fromEntries(lines.map((l) => [l.code, { qty: l.confirmed, reason: l.shortReason }])),
  );

  const set = (code: string, patch: Partial<{ qty: number; reason: string }>) => {
    const next = { ...state, [code]: { ...state[code], ...patch } };
    setState(next);
    onChange(next);
  };

  const problems = checkConfirmLines(lines, state);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-cap text-ink-2">
        ยืนยันจำนวนที่ส่งได้จริงทีละบรรทัด — ตัวเลขนี้คือตัวที่ใบส่งของและใบกำกับจะใช้
        ส่วนที่ขาดจะกลายเป็นของค้างส่งบนใบสั่งขาย
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {["สินค้า", "สั่ง", "หยิบได้", "ยืนยันส่ง"].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "whitespace-nowrap border-b border-line px-2 py-1.5 text-cap font-semibold text-ink-2",
                    i === 0 ? "text-left" : "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v = state[l.code];
              const over = v.qty > l.picked;
              return (
                <tr key={l.code}>
                  <td className="border-b border-line px-2 py-1.5">
                    <span className="flex flex-col">
                      <span className="font-medium">{l.code}</span>
                      <span className="text-cap text-ink-3">{l.name}</span>
                    </span>
                  </td>
                  <td className="tnum border-b border-line px-2 py-1.5 text-right text-ink-2">
                    {fmt(l.ordered)}
                  </td>
                  <td className="tnum border-b border-line px-2 py-1.5 text-right text-ink-2">
                    {fmt(l.picked)}
                  </td>
                  <td className="border-b border-line px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={l.picked}
                      aria-label={`ยืนยันส่ง ${l.code}`}
                      value={String(v.qty)}
                      onChange={(e) => set(l.code, { qty: Number(e.target.value) })}
                      className={cn(
                        "tnum w-[92px] rounded-btn border px-2 py-1 text-right",
                        over ? "border-danger text-danger-text" : "border-line",
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lines
        .filter((l) => state[l.code].qty < l.ordered)
        .map((l) => (
          <TextField
            key={l.code}
            label={`เหตุผลที่ ${l.code} ส่งไม่ครบ (สั่ง ${fmt(l.ordered)} · ยืนยัน ${fmt(state[l.code].qty)})`}
            placeholder="เช่น ของชำรุด 2 ชิ้นตอนแพ็ค — แจ้งลูกค้าแล้ว"
            onChange={(val) => set(l.code, { reason: val })}
          />
        ))}

      {problems.length > 0 && (
        <div
          data-testid="confirm-ship-problems"
          className="rounded-btn border border-[#FDE68A] bg-warning-soft p-3"
        >
          <ul className="flex flex-col gap-0.5 text-[13px] text-warning-text">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The warehouse confirms what can actually ship. */
export function packConfirmShipQty(task: PackRow, ctx: ActionCtx) {
  if (denied(ctx, "packing", "edit", "ยืนยันจำนวนที่ส่งได้ไม่ได้")) return;

  if (task.status !== "Completed") {
    ctx.toast(
      "ยังยืนยันไม่ได้",
      `${task.code} อยู่ในสถานะ ${task.status} — ปิดงานแพ็คให้เสร็จก่อน`,
      "warning",
    );
    return;
  }
  if (task.doRef) {
    ctx.toast(
      "ออกใบส่งของไปแล้ว",
      `${task.code} → ${task.doRef} — แก้จำนวนที่ยืนยันหลังออกเอกสารไม่ได้`,
      "warning",
    );
    return;
  }

  const lines = confirmLines(task);
  let answers: Record<string, { qty: number; reason: string }> = Object.fromEntries(
    lines.map((l) => [l.code, { qty: l.confirmed, reason: l.shortReason }]),
  );

  ctx.formModal({
    title: "ยืนยันจำนวนที่ส่งได้",
    body: () => <ConfirmShipForm lines={lines} onChange={(v) => (answers = v)} />,
    confirmText: "ยืนยันจำนวน",
    onConfirm: () => {
      /* Checked again on the way to the write, not only while the form was
         open. See the note above this section. */
      const problems = checkConfirmLines(lines, answers);
      if (problems.length) {
        ctx.toast("ยืนยันไม่ได้", problems[0], "danger");
        return false;
      }

      const now = stamp();
      for (const it of task.items ?? []) {
        const a = answers[it.code];
        if (!a) continue;
        it.confirmedQty = a.qty;
        it.shortReason = a.qty < (lines.find((l) => l.code === it.code)?.ordered ?? 0)
          ? a.reason.trim()
          : "";
      }
      task.confirmedAt = now;
      task.confirmedBy = USER();
      task.updated = now;

      decoratePacks();
      const short = lines.filter((l) => answers[l.code].qty < l.ordered);
      const total = lines.reduce((s, l) => s + answers[l.code].qty, 0);

      log(
        task,
        "Ship quantity confirmed",
        short.length
          ? `ยืนยันส่งได้ ${fmt(total)} หน่วย — ไม่ครบ ${short.length} รายการ`
          : `ยืนยันส่งได้ครบ ${fmt(total)} หน่วย`,
        short.length ? "warn" : "primary",
      );

      /* Whoever may raise the delivery note is who needs to know, read from
         the matrix at this moment rather than named here — the same property
         every other send in this file has. */
      notify({
        kind: short.length ? "escalated" : "converted",
        docType: "packing",
        docCode: task.code,
        title: short.length
          ? `${task.code} คลังยืนยันส่งได้บางส่วน`
          : `${task.code} คลังยืนยันส่งได้ครบ`,
        body: short.length
          ? `ส่งได้ ${fmt(total)} หน่วย — ไม่ครบ ${short.length} รายการ (${short
              .map((l) => `${l.code} ${fmt(answers[l.code].qty)}/${fmt(l.ordered)}`)
              .join(" · ")}) — ออกใบส่งของตามจำนวนที่ยืนยันได้เลย`
          : `ส่งได้ครบ ${fmt(total)} หน่วย จาก ${task.soRef} — ออกใบส่งของได้เลย`,
        toRoles: rolesWhoMay("delivery-order", "create"),
      });

      commit(
        ctx,
        "ยืนยันจำนวนที่ส่งได้แล้ว",
        short.length ? `${task.code} — ส่งได้บางส่วน` : `${task.code} — ส่งได้ครบ`,
        short.length ? "warning" : "success",
      );
    },
  });
}

/**
 * Completed pack → the delivery order that actually ships.
 *
 * Guarded on `delivery-order` rather than on `packing`, because this is the
 * other half of the split: the warehouse says what can go, the sales desk
 * turns that into paperwork. Warehouse Staff hold no delivery-order rights
 * and are refused here, exactly as Sales Admin is refused at the confirm.
 */
export function packCreateDelivery(task: PackRow, ctx: ActionCtx) {
  if (denied(ctx, "delivery-order", "create", "ออกใบส่งของไม่ได้")) return;

  if (task.doRef) {
    ctx.toast("มีใบส่งของอยู่แล้ว", `${task.code} → ${task.doRef}`, "warning");
    ctx.goto(`/m/delivery-order/${encodeURIComponent(task.doRef)}`);
    return;
  }

  /* The guard that makes the confirm step real. Without it the confirm is a
     screen somebody may or may not have visited, and the delivery note falls
     back to the order's intention exactly as before. */
  if (!packIsConfirmed(task)) {
    ctx.toast(
      "ยังออกใบส่งของไม่ได้",
      `${task.code} — คลังยังไม่ได้ยืนยันจำนวนที่ส่งได้`,
      "warning",
    );
    return;
  }

  const confirmed = confirmLines(task).filter((l) => l.confirmed > 0);
  if (!confirmed.length) {
    ctx.toast(
      "ไม่มีของให้ส่ง",
      `${task.code} — คลังยืนยันว่าส่งไม่ได้เลยสักรายการ`,
      "warning",
    );
    return;
  }

  const confirmedTotal = confirmed.reduce((s, l) => s + l.confirmed, 0);
  const shortLines = confirmLines(task).filter((l) => l.confirmed < l.ordered);

  ctx.confirm({
    title: "Create delivery order?",
    message: (
      <>
        ออกใบส่งของจาก {task.code} — {task.boxCount} กล่อง{" "}
        <strong>{fmt(confirmedTotal)}</strong> หน่วย ตามจำนวนที่คลังยืนยัน
        {shortLines.length > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ไม่ครบ {shortLines.length} รายการ — ส่วนที่ขาดจะค้างอยู่บนใบสั่งขาย
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Create Delivery Order",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextDOCode();
      const so = getSO(task.soRef);

      const fresh: DeliveryOrder = {
        code,
        soRef: task.soRef,
        packRef: task.code,
        customer: task.customer,
        customerCode: task.customerCode,
        shipTo: so?.shipTo ?? "",
        contact: so?.shipContact ?? "",
        phone: so?.shipPhone ?? "",
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
        /* The customer's own instruction leads, because this is the sheet the
           driver reads at the door. Where the order carries none, the note
           says where the document came from, as before. */
        remark: so?.shipInstruction || `สร้างจากงานแพ็ค ${task.code}`,
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
        /* Quantities come from what the warehouse confirmed — never from
           `packedQty` or the order line. Billing follows this document, so a
           figure nobody on the floor stood behind must not be able to reach
           it. Lines confirmed at zero are left off entirely: a delivery note
           listing something that is not on the lorry is wrong on paper, and
           the shortfall is already recorded as outstanding on the order. */
        items: confirmed.map((l, i) => {
          const it = (task.items ?? []).find((p) => p.code === l.code);
          const src = (so?.items ?? []).find((s) => s.code === l.code);
          return {
            line: i + 1,
            code: l.code,
            name: l.name,
            unit: l.unit,
            qty: l.confirmed,
            delivered: 0,
            box: it?.box ?? "",
            note: src?.note ?? it?.note ?? "",
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
      };
      DELIVERY_ORDERS.unshift(fresh as DoRow);

      task.doRef = code;
      task.updated = now;

      /* What the warehouse could not confirm stays owed on the order.
         `outstandingQty` is derived from ordered − delivered and is already
         right; what has to move is the STATUS, so the order does not sit in
         Picking looking finished while part of it is still owed. */
      if (so && shortLines.length && !["Cancelled", "Completed"].includes(so.status)) {
        so.status = "Partially Delivered";
        so.updated = now;
        log(
          so,
          "Back order raised",
          `${code} ส่งได้ ${fmt(confirmedTotal)} หน่วย — ค้างส่ง ${shortLines
            .map((l) => `${l.code} ${fmt(l.ordered - l.confirmed)}`)
            .join(" · ")}`,
          "warn",
        );
        notifyOwner(so, {
          kind: "escalated",
          title: `${so.code} ส่งได้ไม่ครบ`,
          body: `${code} ส่ง ${fmt(confirmedTotal)} หน่วย — ยังค้าง ${shortLines.length} รายการ`,
        });
      }

      commit(ctx, "ออกใบส่งของแล้ว", `${task.code} → ${code}`);

      /* The bill follows the note out of the door — see doBillFor. It asks
         first when the two could legitimately differ, and navigates when it
         is done, so the goto below only runs when there is nothing to ask. */
      if (!doBillFor(getDO(code), ctx)) {
        ctx.goto(`/m/delivery-order/${encodeURIComponent(code)}`);
      }
    },
  });
}

/* ============================================================
   THE DELIVERY NOTE AND THE BILL ARE ONE STEP

   They were two. Somebody raised the note, the lorry left, and
   the invoice waited for whoever remembered to open the create
   screen — which is how goods reach a customer with nothing
   asking them to pay for it.

   Raising the note now raises the invoice, as a DRAFT. Issuing
   it stays a separate, deliberate press: an invoice that issued
   itself is a tax document nobody read.

   WHEN THE LORRY GOES SHORT, IT ASKS.

   Two honest answers and the software must not pick one:

     bill what shipped   the customer pays for what arrived, and
                         the rest bills on its own note later
     bill the whole order the shortfall follows on this invoice,
                         which is what a customer on a standing
                         order usually expects

   The second is not a variant of the first — it charges for
   goods that are not there yet — so it changes the SOURCE of the
   invoice as well as its quantities: billing the order means the
   invoice is raised against the sales order, because that is the
   document it is actually billing.
   ============================================================ */

/**
 * Raise the invoice for a delivery note. Returns true when it took the
 * navigation over — the caller must not then navigate somewhere else.
 */
function doBillFor(d: DoRow | null, ctx: ActionCtx): boolean {
  if (!d) return false;
  /* Whoever raised the note may not be allowed to bill. The note still
     stands; the invoice waits for the desk that may. */
  if (!can("sales-invoice", "create")) return false;

  const so = getSO(d.soRef);
  const shipped = doTotalQty(d);
  const ordered = so ? soOrderedQty(so) : shipped;
  const alreadyBilled = so ? invoicesForSource(so.code).length : 0;

  /* Nothing to ask when the note carries the whole order — or when part of
     the order has already been billed on its own invoice, in which case
     billing "the whole order" again would bill it twice. */
  if (shipped >= ordered || !so || alreadyBilled > 0) {
    raiseInvoice("Delivery Order", d.code, d.code, ctx);
    return false;
  }

  /* Reset when the question is asked, never while the form renders: the
     radio re-renders on every click, and re-running the assignment there
     put the answer back to the default the moment somebody changed it. */
  basis = "delivery";
  ctx.formModal({
    title: "ออกใบแจ้งหนี้เท่าไร",
    body: () => (
      <BillBasisForm
        doCode={d.code}
        soCode={so.code}
        shipped={shipped}
        ordered={ordered}
        onChange={(v) => (basis = v)}
      />
    ),
    confirmText: "ออกใบแจ้งหนี้",
    onConfirm: () => {
      if (basis === "order") raiseInvoice("Sales Order", so.code, d.code, ctx);
      else raiseInvoice("Delivery Order", d.code, d.code, ctx);
    },
  });
  return true;
}

/** Which document the invoice is raised against. Reset per ask. */
let basis: "delivery" | "order" = "delivery";

function BillBasisForm({
  doCode,
  soCode,
  shipped,
  ordered,
  onChange,
}: {
  doCode: string;
  soCode: string;
  shipped: number;
  ordered: number;
  onChange: (v: "delivery" | "order") => void;
}) {
  const [pick, setPick] = useState<"delivery" | "order">("delivery");

  const choose = (v: "delivery" | "order") => {
    setPick(v);
    onChange(v);
  };

  const option = (
    v: "delivery" | "order",
    title: string,
    qty: number,
    note: string,
  ) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-card border p-3 ${
        pick === v ? "border-primary bg-primary-soft" : "border-line"
      }`}
    >
      <input
        type="radio"
        name="bill-basis"
        aria-label={title}
        checked={pick === v}
        onChange={() => choose(v)}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">
          {title} — {fmt(qty)} หน่วย
        </span>
        <span className="block text-cap text-ink-2">{note}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-ink-2">
        {doCode} ส่งได้ {fmt(shipped)} จาก {fmt(ordered)} หน่วยที่สั่งไว้ใน {soCode}
      </p>
      {option(
        "delivery",
        "บิลเท่าที่ส่งจริง",
        shipped,
        `ตั้งจาก ${doCode} — ส่วนที่ค้างจะออกบิลรอบหน้าพร้อมใบส่งของรอบถัดไป`,
      )}
      {option(
        "order",
        "บิลเต็มตามใบสั่งขาย",
        ordered,
        `ตั้งจาก ${soCode} — ลูกค้าจ่ายค่าของที่ยังไม่ได้รับ ${fmt(ordered - shipped)} หน่วย ต้องแน่ใจว่าตกลงกันไว้แล้ว`,
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   THE SAME TWO ANSWERS, AS BUTTONS

   `doBillFor` asks the question when the note is raised. These
   two are the same choice offered afterwards, on the delivery
   note itself — for a note raised by somebody without billing
   rights, or one whose invoice was cancelled and has to be
   raised again.

   Two buttons rather than one that asks: standing in front of a
   note that shipped short, the reader can already see both
   figures on the sheet, and a dialog that asks what they can
   read is a dialog in the way.
   ------------------------------------------------------------ */

/** Bill what actually went out on this note. */
export function doBillShipped(d: DoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-invoice", "create", "ออกใบแจ้งหนี้ไม่ได้")) return;
  raiseInvoice("Delivery Order", d.code, d.code, ctx);
}

/**
 * Bill the whole order, including what has not shipped yet.
 *
 * Charges for goods that are not there, so it asks first — and it names the
 * shortfall in the question, because that is the part somebody has to have
 * agreed with the customer.
 */
export function doBillOrder(d: DoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-invoice", "create", "ออกใบแจ้งหนี้ไม่ได้")) return;
  const so = getSO(d.soRef);
  if (!so) {
    ctx.toast("ออกใบแจ้งหนี้เต็มไม่ได้", `${d.code} — ไม่พบใบสั่งขาย ${d.soRef}`, "warning");
    return;
  }

  const shipped = doTotalQty(d);
  const ordered = soOrderedQty(so);
  const ahead = Math.max(0, ordered - shipped);

  ctx.confirm({
    title: "ออกใบแจ้งหนี้เต็มตามใบสั่งขาย?",
    message: (
      <>
        ตั้งบิลจาก <strong>{so.code}</strong> ทั้งใบ — {fmt(ordered)} หน่วย
        <br />
        ใบส่งของ {d.code} ส่งไปแล้ว {fmt(shipped)} หน่วย
        {ahead > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ลูกค้าจะถูกเรียกเก็บค่าของที่ยังไม่ได้รับ {fmt(ahead)} หน่วย
            </span>
            <br />
            <span className="text-ink-2">ต้องแน่ใจว่าตกลงกับลูกค้าไว้แล้ว</span>
          </>
        )}
      </>
    ),
    confirmText: "ออกใบแจ้งหนี้เต็ม",
    tone: ahead > 0 ? "danger" : "primary",
    onConfirm: () => raiseInvoice("Sales Order", so.code, d.code, ctx),
  });
}

/** Write it, say so, and land on it. */
function raiseInvoice(
  sourceType: string,
  sourceDoc: string,
  deliveryCode: string,
  ctx: ActionCtx,
) {
  const res = createInvoiceFrom(sourceType, sourceDoc, {
    user: USER(),
    note: `ออกพร้อมใบส่งสินค้า ${deliveryCode}`,
  });
  if (!res) {
    ctx.toast(
      "ยังไม่ได้ออกใบแจ้งหนี้",
      `${sourceDoc} — ไม่มีรายการที่ยังไม่ได้วางบิล ออกใบแจ้งหนี้เองได้จากเมนู`,
      "warning",
    );
    ctx.goto(`/m/delivery-order/${encodeURIComponent(deliveryCode)}`);
    return;
  }

  notify({
    kind: "converted",
    docType: "sales-invoice",
    docCode: res.code,
    title: `${res.code} รอตรวจสอบก่อนออกบิล`,
    body: `ออกพร้อมใบส่งสินค้า ${deliveryCode} — ตั้งจาก${sourceType} ${sourceDoc}`,
    toRoles: rolesWhoMay("sales-invoice", "approve"),
  });

  commit(ctx, "ออกใบแจ้งหนี้ให้แล้ว", `${deliveryCode} → ${res.code} (ฉบับร่าง)`);
  ctx.goto(`/m/sales-invoice/${encodeURIComponent(res.code)}`);
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

/**
 * Delivery note → the invoice for what it carried.
 *
 * An invoice cannot be opened from a blank page, so this is the way in: the
 * form starts on this document, pulls the lines it has not billed yet, and
 * bills exactly what left the building. A short delivery therefore bills
 * short, and the back order bills on its own note later — which is the whole
 * reason partial deliveries and partial invoices have to travel together.
 */
export function doCreateInvoice(d: DoRow, ctx: ActionCtx) {
  if (denied(ctx, "sales-invoice", "create", "ออกใบแจ้งหนี้ไม่ได้")) return;
  if (!["Shipped", "Delivered"].includes(d.status)) {
    ctx.toast(
      "ออกใบแจ้งหนี้ไม่ได้",
      `${d.code} อยู่ในสถานะ ${d.status} — วางบิลได้เมื่อของออกจากคลังแล้วเท่านั้น`,
      "warning",
    );
    return;
  }
  /* Order matters: the document list is read off the type. */
  ctx.goto(
    `/m/sales-invoice/new?sourceType=${encodeURIComponent("Delivery Order")}&sourceDoc=${encodeURIComponent(d.code)}`,
  );
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
