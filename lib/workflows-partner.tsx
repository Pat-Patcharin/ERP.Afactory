import { actingUserName, can, currentRole } from "./domain/admin";
import { decorateBPs, type BpRow } from "./domain/partner";
import { notify } from "./domain/notify";
import { stamp } from "./format";
import type { ActionCtx } from "./types";

/* ============================================================
   BUSINESS PARTNER WORKFLOWS

   Confirming a partner used to be written inside the button on
   the detail page. It moved here for the reason every other
   transition lives in a workflow file: the guard and the
   notification belong at the point the record changes, and a
   button is not that point — there are several of them, and the
   next one added would quietly do neither.
   ============================================================ */

/**
 * Draft → Active. A salesperson may raise a partner and quote against it the
 * same afternoon; an order cannot be opened until somebody has checked the
 * name and the tax ID. This is that check.
 *
 * Who did it and when goes into the partner's own history — the record
 * already keeps one, so nothing new was invented for it.
 */
export function bpConfirm(bp: BpRow, ctx: ActionCtx) {
  if (!can("business-partner", "approve")) {
    ctx.toast(
      "สิทธิ์ไม่พอ",
      `บทบาท ${currentRole()?.name ?? "—"} ยืนยันคู่ค้าไม่ได้ — ต้องให้ผู้มีสิทธิ์อนุมัติดำเนินการ`,
      "danger",
    );
    return;
  }
  if (bp.status !== "Draft") {
    ctx.toast(
      "ยืนยันไม่ได้",
      `${bp.code} อยู่ในสถานะ ${bp.status} — ยืนยันได้เฉพาะระเบียนที่ยังเป็นร่าง`,
      "warning",
    );
    return;
  }

  ctx.confirm({
    title: "ยืนยันคู่ค้ารายนี้?",
    message: (
      <>
        <strong>{bp.code}</strong> — {bp.nameTh}
        <br />
        ยืนยันแล้วจะเปิดใบสั่งขายได้ และชื่อนิติบุคคลกับเลขผู้เสียภาษีจะแก้ไม่ได้อีก
        <br />
        <span className="text-ink-2">
          เลขผู้เสียภาษี {bp.tax?.taxId || "— ยังไม่ได้กรอก"}
        </span>
      </>
    ),
    confirmText: "ยืนยันคู่ค้า",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      bp.status = "Active";
      bp.updated = now;
      bp.updatedBy = actingUserName();
      (bp.history ??= []).unshift({
        t: "Partner confirmed",
        d: "ยืนยันคู่ค้าที่พนักงานขายสร้างไว้ — เปิดใบสั่งขายได้",
        u: actingUserName(),
        when: now,
        kind: "primary",
      });
      /* The salesperson who raised it is waiting on exactly this — until it
         happens their quotation cannot become an order. */
      notify({
        kind: "approved",
        docType: "business-partner",
        docCode: bp.code,
        title: `${bp.nameTh} ยืนยันแล้ว`,
        body: `${bp.code} — เปิดใบสั่งขายให้ลูกค้ารายนี้ได้แล้ว`,
        toUser: bp.createdBy,
      });
      decorateBPs();
      ctx.refresh();
      ctx.toast("ยืนยันคู่ค้าแล้ว", `${bp.code} — ${bp.nameTh}`, "success");
    },
  });
}
