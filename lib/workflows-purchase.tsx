import { useState } from "react";
import type { PurchaseOrder } from "@/data/purchase-orders";
import { actingUserName, can, canApproveStep, currentRole } from "./domain/admin";
import { notify } from "./domain/notify";
import { money0, stamp } from "./format";
import type { ActionCtx } from "./types";
import {
  PURCHASE_ORDERS,
  PURCHASE_REQUESTS,
  decoratePOs,
  decoratePRs,
  nextPOCode,
  prApprovalPlan,
  prFullyOrdered,
  prNextStep,
  prOpenLines,
  prSignedSeqs,
  prSupplierReady,
  prTotal,
  submitPurchaseRequest,
  type PoRow,
  type PrLine,
  type PrRow,
} from "./domain/purchase";
import { WAREHOUSES } from "./domain/warehouse";

/* ============================================================
   PURCHASE REQUEST → PURCHASE ORDER

     Draft → Open → Approved → Converted
                  → Rejected

   TWO DOORS, ONE LIMIT.

   Under the approval limit the request goes straight to Open and
   the first approver may sign it. Over the limit it is held as a
   Draft that has been SUBMITTED — the reviewer reads it, and
   opening it is their act, not the requester's. Only then does it
   reach the second signature.

   The limit itself is not in this file. `prApprovalPlan` reads the
   workflow in Administration, so "over 100,000 needs the managing
   director" is configuration; this module only asks how many
   signatures the plan came back with.

   WHO IS TOLD IS COMPUTED, NEVER LISTED. Every send below names a
   ROLE from the approval plan, never a person — see domain/notify.
   ============================================================ */

const USER = () => actingUserName();

/** Approval rows are keyed so the workflow can tell which step signed. */
const stepKey = (seq: number) => `APPROVAL-${seq}`;

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decoratePRs();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

type Right = "create" | "edit" | "approve" | "delete";

/**
 * The guard sits on the mutation, not only on the button.
 *
 * A hidden button is a courtesy; a guarded function is what holds when the
 * call arrives from a stale page or from the API this becomes later.
 */
function denied(ctx: ActionCtx, right: Right, what: string): boolean {
  if (can("purchase-request", right)) return false;
  ctx.toast(
    "สิทธิ์ไม่พอ",
    `บทบาท ${currentRole()?.name ?? "—"} ${what} — ต้องให้ผู้มีสิทธิ์ดำเนินการ`,
    "danger",
  );
  return true;
}

const wrongStatus = (ctx: ActionCtx, pr: PrRow, what: string, expected: string) => {
  ctx.toast(what, `${pr.code} อยู่ในสถานะ ${pr.status} — ทำได้เฉพาะเอกสารที่${expected}`, "warning");
  return true;
};

/** Both submit paths check the same things before the document moves. */
function submitBlocked(pr: PrRow, ctx: ActionCtx): boolean {
  if (!(pr.items ?? []).length) {
    ctx.toast("ยังไม่มีรายการสินค้า", "เพิ่มรายการอย่างน้อย 1 บรรทัดก่อนส่งขออนุมัติ", "warning");
    return true;
  }
  if (!prSupplierReady(pr)) {
    ctx.toast(
      "ยังไม่ได้ระบุผู้ขาย",
      "ใบขอซื้อ 1 ใบสั่งจากผู้ขายรายเดียว — ระบุผู้ขายก่อน จึงจะออกใบสั่งซื้อจากใบนี้ได้",
      "warning",
    );
    return true;
  }
  return false;
}

/* ---------- 1. The requester hands it over ---------- */

/**
 * Draft → Open, or Draft → submitted Draft when a second signature is needed.
 *
 * The requester's own act, so it needs `edit` rather than `approve`. What it
 * cannot do is decide which door it goes through: that is the value of the
 * lines against the workflow.
 */
export function prSubmit(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "edit", "ส่งขออนุมัติไม่ได้")) return;
  if (pr.status !== "Draft") return void wrongStatus(ctx, pr, "ส่งขออนุมัติไม่ได้", "เป็นร่าง");
  if (submitBlocked(pr, ctx)) return;

  const total = prTotal(pr);
  const { escalated, plan } = submitPurchaseRequest(pr, USER());

  commit(
    ctx,
    escalated ? "ส่งให้ตรวจสอบแล้ว" : "ส่งขออนุมัติแล้ว",
    escalated
      ? `${pr.code} — ${money0(total)} บาท เกินวงเงิน รอ${plan[0]?.roleName ?? "ผู้ตรวจ"}ตรวจสอบ`
      : `${pr.code} — รอ${plan[0]?.roleName ?? "ผู้อนุมัติ"}อนุมัติ`,
  );
}

/* ---------- 2. The reviewer opens what is over the limit ---------- */

/**
 * Submitted Draft → Open.
 *
 * Only reachable on a request that needs a second signature: under the limit
 * `prSubmit` already opened it, and there is nothing here left to do.
 */
export function prOpen(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "approve", "เปิดเอกสารไม่ได้")) return;
  if (pr.status !== "Draft") return void wrongStatus(ctx, pr, "เปิดเอกสารไม่ได้", "เป็นร่าง");
  if (!pr.submittedAt) {
    ctx.toast("เปิดเอกสารไม่ได้", `${pr.code} ยังไม่ได้ถูกส่งมาให้ตรวจสอบ`, "warning");
    return;
  }
  if (submitBlocked(pr, ctx)) return;

  const plan = prApprovalPlan(pr);
  const next = plan[plan.length - 1];

  ctx.confirm({
    title: "Open this purchase request?",
    message: (
      <>
        เปิดเอกสาร <strong>{pr.code}</strong> — {pr.supplier}
        <br />
        มูลค่า {money0(prTotal(pr))} บาท
        <br />
        <span className="text-ink-2">
          เกินวงเงินอนุมัติ — เปิดแล้วจะส่งให้{next?.roleName ?? "ผู้อนุมัติ"}อนุมัติ
        </span>
      </>
    ),
    confirmText: "Open request",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      pr.status = "Open";
      pr.updated = now;
      pr.updatedBy = USER();

      /* The reviewer's signature on step one — see submitPurchaseRequest. */
      const review = (pr.approvals ?? []).find((a) => a.status === "pending");
      if (review) {
        review.status = "done";
        review.by = USER();
        review.when = now;
        review.note = "ตรวจสอบแล้ว เปิดเอกสาร";
      }
      (pr.approvals ??= []).push({
        step: stepKey(next?.seq ?? 2),
        by: next?.roleName ?? "ผู้อนุมัติ",
        role: next?.roleName ?? "",
        when: "",
        status: "pending",
        note: "",
      });

      notify({
        kind: "approval_request",
        docType: "purchase-request",
        docCode: pr.code,
        title: `ใบขอซื้อ ${pr.code} รออนุมัติ`,
        body: `${pr.supplier} — ${money0(prTotal(pr))} บาท เกินวงเงิน ${
          USER()
        } ตรวจสอบแล้ว`,
        toRoles: next ? [next.roleCode] : [],
      });

      commit(ctx, "เปิดเอกสารแล้ว", `${pr.code} — รอ${next?.roleName ?? "ผู้อนุมัติ"}อนุมัติ`);
    },
  });
}

/* ---------- 3. The signature ---------- */

/** Open → Approved. The step is read from the plan, so the limit decides. */
export function prApprove(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "approve", "อนุมัติใบขอซื้อไม่ได้")) return;
  if (pr.status !== "Open") return void wrongStatus(ctx, pr, "อนุมัติไม่ได้", "เปิดอยู่");

  const step = prNextStep(pr);
  if (step && !canApproveStep(step)) {
    ctx.toast(
      "อนุมัติไม่ได้",
      `${pr.code} มูลค่า ${money0(prTotal(pr))} บาท — ขั้นนี้ต้องให้${step.roleName}อนุมัติ`,
      "danger",
    );
    return;
  }

  ctx.confirm({
    title: "Approve this purchase request?",
    message: (
      <>
        อนุมัติ <strong>{pr.code}</strong> — {pr.supplier}
        <br />
        มูลค่า {money0(prTotal(pr))} บาท
        <br />
        <span className="text-ink-2">อนุมัติแล้วจึงออกใบสั่งซื้อได้</span>
      </>
    ),
    confirmText: "Approve request",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const pending = (pr.approvals ?? []).find((a) => a.status === "pending");
      if (pending) {
        pending.status = "done";
        pending.by = USER();
        pending.when = now;
        pending.note = "อนุมัติ";
      }
      pr.status = "Approved";
      pr.updated = now;
      pr.updatedBy = USER();

      /* Back to whoever raises the order. Under the limit that is the person
         who just signed, and they are not told their own news. */
      notify({
        kind: "approved",
        docType: "purchase-request",
        docCode: pr.code,
        title: `${pr.code} อนุมัติแล้ว`,
        body: `อนุมัติโดย ${USER()} — ออกใบสั่งซื้อให้ ${pr.supplier} ได้`,
        toRoles: [prApprovalPlan(pr)[0]?.roleCode ?? ""].filter(Boolean),
      });
      notify({
        kind: "approved",
        docType: "purchase-request",
        docCode: pr.code,
        title: `${pr.code} อนุมัติแล้ว`,
        body: `ใบขอซื้อที่คุณเปิดไว้ได้รับการอนุมัติโดย ${USER()}`,
        toUser: pr.createdBy,
      });

      commit(ctx, "อนุมัติแล้ว", `${pr.code} — พร้อมออกใบสั่งซื้อ`);
    },
  });
}

/** Open → Rejected, with the reason the requester has to act on. */
export function prReject(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "approve", "ปฏิเสธใบขอซื้อไม่ได้")) return;
  if (pr.status !== "Open" && pr.status !== "Draft")
    return void wrongStatus(ctx, pr, "ปฏิเสธไม่ได้", "ยังไม่ถูกอนุมัติ");

  let reason = "";
  ctx.confirm({
    title: "Reject this purchase request?",
    message: (
      <div className="flex flex-col gap-3">
        <span>
          ปฏิเสธ <strong>{pr.code}</strong> — {pr.supplier} · {money0(prTotal(pr))} บาท
        </span>
        <ReasonField
          label="เหตุผลที่ปฏิเสธ"
          placeholder="ระบุเหตุผล เพื่อให้ผู้ขอซื้อแก้ไขได้ถูกจุด"
          onChange={(v) => {
            reason = v;
          }}
        />
      </div>
    ),
    confirmText: "Reject request",
    onConfirm: () => {
      const now = stamp();
      const pending = (pr.approvals ?? []).find((a) => a.status === "pending");
      if (pending) {
        pending.status = "rejected";
        pending.by = USER();
        pending.when = now;
        pending.note = reason.trim() || "ไม่อนุมัติ";
      }
      pr.status = "Rejected";
      pr.updated = now;
      pr.updatedBy = USER();

      notify({
        kind: "rejected",
        docType: "purchase-request",
        docCode: pr.code,
        title: `${pr.code} ถูกปฏิเสธ`,
        body: `${USER()} ไม่อนุมัติ — ${reason.trim() || "ไม่ระบุเหตุผล"}`,
        toUser: pr.createdBy,
      });

      commit(ctx, "ปฏิเสธใบขอซื้อแล้ว", `${pr.code} — ${reason.trim() || "ไม่ระบุเหตุผล"}`, "danger");
    },
  });
}

/* ---------- 4. Ordering, in as many instalments as it takes ---------- */

/**
 * Approved → one purchase order carrying the lines that were ticked.
 *
 * The request is Converted only once every line has gone out. Anything less
 * leaves it Approved with fewer open lines, which is what lets a buyer order
 * what the supplier has today and come back for the rest — one request, one
 * supplier, several orders.
 */
export function prConvert(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "create", "ออกใบสั่งซื้อไม่ได้")) return;
  if (pr.status !== "Approved")
    return void wrongStatus(ctx, pr, "ออกใบสั่งซื้อไม่ได้", "อนุมัติแล้ว");

  const open = prOpenLines(pr);
  if (!open.length) {
    ctx.toast("ออกใบสั่งซื้อไม่ได้", `${pr.code} — ทุกรายการออกใบสั่งซื้อไปแล้ว`, "warning");
    return;
  }

  /* Everything ticked to start with: ordering the whole request is the
     ordinary case, and the split is what somebody opts into. */
  let picked = open.map((l) => l.code);

  ctx.confirm({
    title: "Create purchase order",
    message: (
      <div className="flex flex-col gap-3">
        <span>
          <strong>{pr.code}</strong> → ใบสั่งซื้อถึง {pr.supplier}
        </span>
        <LinePicker
          lines={open}
          onChange={(codes) => {
            picked = codes;
          }}
        />
        <span className="text-cap text-ink-2">
          ติ๊กเฉพาะรายการที่จะสั่งรอบนี้ · รายการที่เหลือยังอยู่ในใบขอซื้อ และออกใบสั่งซื้อรอบถัดไปได้
        </span>
      </div>
    ),
    confirmText: "Create PO",
    tone: "primary",
    onConfirm: () => {
      const lines = open.filter((l) => picked.includes(l.code));
      if (!lines.length) {
        ctx.toast("ยังไม่ได้เลือกรายการ", "ติ๊กอย่างน้อย 1 รายการก่อนออกใบสั่งซื้อ", "warning");
        return;
      }

      const now = stamp();
      const poCode = nextPOCode();
      const fresh: PurchaseOrder = {
        code: poCode,
        supplier: pr.supplier || "",
        warehouse:
          pr.warehouse || (WAREHOUSES[0] ? `${WAREHOUSES[0].code} ${WAREHOUSES[0].name}` : ""),
        currency: "THB",
        fx: 1,
        buyer: USER(),
        payTerm: "30 Days",
        incoterm: "FOB",
        orderDate: now.split(" ")[0],
        expectedDate: pr.needBy || "",
        remark: `สร้างจากใบขอซื้อ ${pr.code}`,
        status: "Open",
        prRef: pr.code,
        items: lines.map((it) => ({
          code: it.code,
          name: it.name,
          unit: it.unit,
          qty: it.qty,
          price: it.price,
          disc: 0,
          tax: 7,
          recv: 0,
        })),
        receipts: [],
        created: now,
        createdBy: USER(),
        updated: now,
        updatedBy: USER(),
      };
      PURCHASE_ORDERS.unshift(fresh as PoRow);
      decoratePOs();

      for (const l of lines) l.poRef = poCode;
      pr.poRef ??= poCode;
      (pr.poRefs ??= []).push(poCode);
      if (prFullyOrdered(pr)) pr.status = "Converted";
      pr.updated = now;
      pr.updatedBy = USER();

      const left = prOpenLines(pr).length;
      notify({
        kind: "converted",
        docType: "purchase-order",
        docCode: poCode,
        title: `ออกใบสั่งซื้อ ${poCode} แล้ว`,
        body: `${pr.supplier} — ${lines.length} รายการ จาก ${pr.code}${
          left ? ` · เหลืออีก ${left} รายการที่ยังไม่ได้สั่ง` : ""
        }`,
        toUser: pr.createdBy,
      });

      decoratePRs();
      ctx.refresh();
      ctx.toast(
        "ออกใบสั่งซื้อแล้ว",
        left
          ? `${pr.code} → ${poCode} · เหลืออีก ${left} รายการในใบขอซื้อ`
          : `${pr.code} → ${poCode}`,
        "success",
      );
    },
  });
}

/* ---------- 5. Closing it down ---------- */

export function prCancel(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "edit", "ยกเลิกใบขอซื้อไม่ได้")) return;
  if (pr.status === "Converted") {
    ctx.toast("ยกเลิกไม่ได้", `${pr.code} ออกใบสั่งซื้อไปแล้ว — ต้องยกเลิกที่ใบสั่งซื้อ`, "warning");
    return;
  }
  ctx.confirm({
    title: "Cancel this purchase request?",
    message: `${pr.code} จะถูกยกเลิก`,
    confirmText: "Cancel PR",
    onConfirm: () => {
      pr.status = "Cancelled";
      pr.updated = stamp();
      pr.updatedBy = USER();
      commit(ctx, "ยกเลิกใบขอซื้อแล้ว", pr.code, "info");
    },
  });
}

export function prDelete(pr: PrRow, ctx: ActionCtx) {
  if (denied(ctx, "delete", "ลบใบขอซื้อไม่ได้")) return;
  if ((pr.poRefs ?? []).length) {
    ctx.toast("ลบไม่ได้", `${pr.code} มีใบสั่งซื้อที่ออกจากเอกสารนี้แล้ว`, "warning");
    return;
  }
  ctx.confirm({
    title: "Delete this purchase request?",
    message: `${pr.code} จะถูกลบถาวร การกระทำนี้ย้อนกลับไม่ได้`,
    confirmText: "Delete PR",
    onConfirm: () => {
      const i = PURCHASE_REQUESTS.indexOf(pr);
      if (i > -1) PURCHASE_REQUESTS.splice(i, 1);
      commit(ctx, "ลบใบขอซื้อแล้ว", pr.code, "danger");
    },
  });
}

/* ---------- What the buttons ask before they render ---------- */

/**
 * The state machine, in one place.
 *
 * Every surface — the list row, the detail menu, the workspace — asks these
 * rather than re-deriving "may I approve this" from the status and the role.
 */
export const prCanSubmit = (pr: PrRow) => pr.status === "Draft" && !pr.submittedAt;
export const prCanOpen = (pr: PrRow) => pr.status === "Draft" && Boolean(pr.submittedAt);
export const prCanApprove = (pr: PrRow) => pr.status === "Open";
export const prCanConvert = (pr: PrRow) => pr.status === "Approved" && prOpenLines(pr).length > 0;

/** How far down the approval plan this request has got, for the detail page. */
export const prProgress = (pr: PrRow) => {
  const plan = prApprovalPlan(pr);
  const signed = prSignedSeqs(pr);
  return plan.map((s) => ({
    ...s,
    signed: signed.includes(s.seq),
    row: (pr.approvals ?? []).find((a) => a.step === stepKey(s.seq)) ?? null,
  }));
};

/* ---------- Modal fields ---------- */

/** Same shape the outbound and adjustment workflows use for a typed reason. */
function ReasonField({
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

/** One row per orderable line, ticked by default. */
function LinePicker({
  lines,
  onChange,
}: {
  lines: PrLine[];
  onChange: (codes: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(lines.map((l) => l.code));

  const toggle = (code: string) => {
    const next = picked.includes(code)
      ? picked.filter((c) => c !== code)
      : [...picked, code];
    setPicked(next);
    onChange(next);
  };

  const total = lines
    .filter((l) => picked.includes(l.code))
    .reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-h-64 overflow-y-auto rounded-card border border-line">
        {lines.map((l) => (
          <label
            key={l.code}
            className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface"
          >
            <input
              type="checkbox"
              checked={picked.includes(l.code)}
              onChange={() => toggle(l.code)}
              className="h-4 w-4 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body">{l.name || l.code}</span>
              <span className="block text-cap text-ink-3">
                {l.code} · {l.qty} {l.unit}
              </span>
            </span>
            <span className="tnum text-body">
              {money0((Number(l.qty) || 0) * (Number(l.price) || 0))}
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-between text-cap text-ink-2">
        <span>
          เลือก {picked.length} จาก {lines.length} รายการ
        </span>
        <span className="tnum font-medium text-ink-1">{money0(total)} บาท</span>
      </div>
    </div>
  );
}
