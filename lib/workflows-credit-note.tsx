"use client";

import { actingUserName } from "./domain/admin";
import { useState, type ReactNode } from "react";
import { fmt, money, money0, stamp, toDisplayDate, toInputDate, today } from "./format";
import { cn } from "./utils";
import { Icon } from "./icons";
import type { ActionCtx } from "./types";
import {
  CN_APPROVAL_STEPS,
  CN_CANCEL_REASONS,
  CN_VOID_REASONS,
} from "@/data/credit-notes";
import {
  CREDIT_NOTES,
  blockingIssues,
  creditTotals,
  decorateCreditNotes,
  lineAmount,
  submitReadiness,
  type CnRow,
} from "./domain/credit-note";
import { SALES_RETURNS, decorateReturns } from "./domain/sales-return";

/* ============================================================
   CREDIT NOTE WORKFLOWS

   Draft → Pending Approval → Approved → Issued → Applied
        → Cancelled / Void

   Issuing locks the document. Applying credit is a mock offset —
   real AR posting belongs to the Finance module.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();
const num = (v: unknown) => Number(v) || 0;

function log(c: CnRow, t: string, d: string, kind = "primary", u = USER()) {
  (c.history ??= []).unshift({ t, d, u, when: stamp(), kind });
}

function audit(c: CnRow, event: string, field: string, from: string, to: string, kind = "primary") {
  (c.audit ??= []).unshift({ event, user: USER(), when: stamp(), field, from, to, kind });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decorateCreditNotes();
  decorateReturns();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

/* ---------- Shared modal primitives ---------- */

const CONTROL =
  "w-full rounded-input border border-line bg-card px-3 py-2 text-body text-ink " +
  "placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/[.12]";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-cap font-medium text-ink-2">
        {label}
        {required && <span className="font-semibold text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Picker({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className={cn(CONTROL, "cursor-pointer")} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— เลือก —</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ReasonField({
  label,
  options,
  onChange,
}: {
  label: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Field label={label} required>
      <Picker
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </Field>
  );
}

function SummaryRows({ c }: { c: CnRow }) {
  const t = creditTotals(c);
  const rows: [string, ReactNode][] = [
    ["Credit Note No.", c.code],
    ["Customer", c.customer],
    ["Source Document", c.sourceDoc || "Manual"],
    ["Credit Type", c.creditType],
    ["Subtotal", money(t.taxable)],
    [`Tax (${c.vatRate}%)`, money(t.tax)],
    ["Total Credit", <strong key="tc">{money(t.totalCredit)}</strong>],
  ];
  return (
    <div className="flex flex-col">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-4 border-b border-line py-[7px] last:border-b-0">
          <span className="flex-shrink-0 text-cap text-ink-2">{label}</span>
          <span className="ml-auto text-right text-[13px] font-medium tnum">{value}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   APPROVAL FLOW
   ============================================================ */

export function cnSubmit(c: CnRow, ctx: ActionCtx) {
  if (!c.canSubmit) {
    ctx.toast("ส่งขออนุมัติไม่ได้", `${c.code} อยู่ในสถานะ ${c.status}`, "warning");
    return;
  }
  const blocking = blockingIssues(submitReadiness(c));
  if (blocking.length) {
    ctx.toast("ข้อมูลยังไม่ครบ", `เหลือ ${blocking.length} เรื่อง — ${blocking[0].label}`, "warning");
    return;
  }

  const now = stamp();
  const from = c.status;
  c.status = "Pending Approval";
  c.approvalStatus = "Pending Approval";

  /* Build the chain the policy actually requires. */
  if (!(c.approvals ?? []).length) {
    c.approvals = CN_APPROVAL_STEPS.map((s, i) => ({
      step: s.step,
      role: s.role,
      approver: i === 0 ? USER() : s.role,
      status: i === 0 ? "done" : "pending",
      requestedAt: now,
      respondedAt: i === 0 ? now : "",
      comment: "",
    }));
  }
  c.updated = now;
  c.updatedBy = USER();
  log(c, "Submitted for approval", `ส่งขออนุมัติ — ${c.approvalReasons.join(" · ") || "ตามนโยบาย"}`, "info");
  audit(c, "Status changed", "status", from, "Pending Approval", "info");
  commit(ctx, "ส่งขออนุมัติแล้ว", `${c.code} — รอผู้จัดการฝ่ายขายและฝ่ายบัญชี`);
}

export function cnApprove(c: CnRow, ctx: ActionCtx) {
  if (!c.canApprove) {
    ctx.toast("อนุมัติไม่ได้", `${c.code} อยู่ในสถานะ ${c.status}`, "warning");
    return;
  }

  ctx.confirm({
    title: "Approve this credit note?",
    message: (
      <>
        อนุมัติ <strong>{c.code}</strong> — {c.customer}
        <br />
        มูลค่าลดหนี้ {money(c.totalCredit)} {c.currency}
        {c.approvalReasons.length > 0 && (
          <>
            <br />
            <span className="text-ink-2">เหตุที่ต้องอนุมัติ: {c.approvalReasons.join(" · ")}</span>
          </>
        )}
        <br />
        <span className="text-ink-2">การอนุมัติไม่กระทบสต๊อกและยังไม่ลงบัญชี</span>
      </>
    ),
    confirmText: "Approve credit note",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const from = c.status;
      /* Close every outstanding step in one action — Phase 1 mocks the chain. */
      for (const a of c.approvals ?? []) {
        if (a.status === "pending") {
          a.status = "done";
          a.respondedAt = now;
          a.comment = a.comment || "อนุมัติ";
        }
      }
      c.status = "Approved";
      c.approvalStatus = "Approved";
      c.updated = now;
      c.updatedBy = USER();
      log(c, "Approved", `อนุมัติใบลดหนี้ ${money(c.totalCredit)} บาท`);
      audit(c, "Status changed", "status", from, "Approved");
      commit(ctx, "อนุมัติใบลดหนี้แล้ว", `${c.code} — พร้อมออกใบลดหนี้`);
    },
  });
}

export function cnReject(c: CnRow, ctx: ActionCtx) {
  if (!c.canApprove) {
    ctx.toast("ส่งกลับไม่ได้", `${c.code} อยู่ในสถานะ ${c.status}`, "warning");
    return;
  }

  ctx.confirm({
    title: "Request revision?",
    message: `${c.code} จะถูกส่งกลับให้แก้ไข — สถานะกลับเป็น Draft`,
    confirmText: "Request revision",
    onConfirm: () => {
      const now = stamp();
      const from = c.status;
      const pending = (c.approvals ?? []).find((a) => a.status === "pending");
      if (pending) {
        pending.status = "rejected";
        pending.respondedAt = now;
        pending.comment = "ขอให้แก้ไข";
      }
      c.status = "Draft";
      c.approvalStatus = "Revision Requested";
      c.updated = now;
      c.updatedBy = USER();
      log(c, "Revision requested", "ส่งกลับให้แก้ไข", "warn");
      audit(c, "Status changed", "status", from, "Draft", "warn");
      commit(ctx, "ส่งกลับให้แก้ไขแล้ว", c.code, "warning");
    },
  });
}

/* ---------- Issue ---------- */

const ISSUE_CHECKS = [
  "Customer information verified",
  "Source document verified",
  "Credit quantity verified",
  "Tax information verified",
];

function IssueBody({ c, onChange }: { c: CnRow; onChange: (ok: boolean) => void }) {
  const [checked, setChecked] = useState<boolean[]>(ISSUE_CHECKS.map(() => false));

  const toggle = (i: number) => {
    const next = checked.map((x, n) => (n === i ? !x : x));
    setChecked(next);
    onChange(next.every(Boolean));
  };

  return (
    <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
      <SummaryRows c={c} />
      <div className="flex flex-col gap-2 rounded-btn border border-line bg-surface p-4">
        {ISSUE_CHECKS.map((x, i) => (
          <button
            key={x}
            type="button"
            onClick={() => toggle(i)}
            className="flex items-center gap-2.5 rounded-sm py-1.5 text-left text-[13px] transition-colors hover:bg-card"
          >
            <span
              className={cn(
                "grid h-[17px] w-[17px] flex-shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                checked[i] ? "border-primary bg-primary text-white" : "border-line-strong bg-card",
              )}
            >
              {checked[i] && <Icon name="check" size={11} strokeWidth={3} />}
            </span>
            {x}
          </button>
        ))}
        <p className="mt-2 text-cap leading-relaxed text-ink-3">
          เมื่อออกใบลดหนี้แล้ว ยอดและรายการจะถูกล็อก — แก้ไขได้ผ่านการ Void เท่านั้น
          และยังไม่มีการลงบัญชีในเฟสนี้
        </p>
      </div>
    </div>
  );
}

export function cnIssue(c: CnRow, ctx: ActionCtx) {
  if (!c.canIssue) {
    ctx.toast(
      "ออกใบลดหนี้ไม่ได้",
      `${c.code} อยู่ในสถานะ ${c.status} — ต้องอนุมัติก่อน`,
      "warning",
    );
    return;
  }

  let ready = false;

  ctx.formModal({
    title: "Confirm Issue Credit Note",
    width: "wide",
    confirmText: "Issue Credit Note",
    body: () => <IssueBody c={c} onChange={(v) => (ready = v)} />,
    onConfirm: () => {
      if (!ready) {
        ctx.toast("ยังยืนยันไม่ครบ", "ต้องติ๊กยืนยันครบทั้ง 4 ข้อก่อนออกใบลดหนี้", "warning");
        return false;
      }
      const now = stamp();
      const from = c.status;
      c.status = "Issued";
      c.updated = now;
      c.updatedBy = USER();
      log(c, "Credit note issued", `ออกใบลดหนี้ ${money(c.totalCredit)} บาท ให้ลูกค้า`);
      audit(c, "Status changed", "status", from, "Issued");

      /* Close the loop on the return this credit came from. */
      const rtn = SALES_RETURNS.find((r) => r.code === c.returnRef);
      if (rtn && !rtn.creditNoteRef) {
        rtn.creditNoteRef = c.code;
        rtn.creditNoteStatus = "Credited";
        rtn.status = "Credited";
        rtn.updated = now;
        (rtn.history ??= []).unshift({
          t: "Credit note issued",
          d: `ออกใบลดหนี้ ${c.code}`,
          u: USER(),
          when: now,
          kind: "primary",
        });
      }

      commit(ctx, "ออกใบลดหนี้แล้ว", `${c.code} — ล็อกเอกสารเรียบร้อย`);
    },
  });
}

/* ---------- Apply credit ---------- */

function ApplyBody({ c, onChange }: { c: CnRow; onChange: (v: { amount: string; invoice: string; date: string }) => void }) {
  const [v, setV] = useState({
    amount: String(c.outstandingCredit),
    invoice: c.invoiceRef,
    date: toInputDate(today()),
  });
  const put = (next: typeof v) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-btn border border-line bg-surface p-4">
        <SummaryRows c={c} />
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ink-2">Applied Amount</span>
            <span className="tnum">{money(c.appliedAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Remaining Credit</span>
            <span className="text-lg font-semibold tnum">{money(c.outstandingCredit)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Apply To Invoice" required>
          <input
            className={CONTROL}
            placeholder="INV-2026-000021"
            value={v.invoice}
            onChange={(e) => put({ ...v, invoice: e.target.value })}
          />
        </Field>
        <Field label="Apply Amount" required>
          <input
            type="number"
            className={cn(CONTROL, "tnum")}
            value={v.amount}
            max={c.outstandingCredit}
            onChange={(e) => put({ ...v, amount: e.target.value })}
          />
        </Field>
        <Field label="Apply Date" required>
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.date}
            onChange={(e) => put({ ...v, date: e.target.value })}
          />
        </Field>
      </div>

      <p className="text-cap leading-relaxed text-ink-3">
        การตัดเครดิตในเฟสนี้เป็นการบันทึกเชิงปฏิบัติการเท่านั้น — การตัดยอดลูกหนี้จริง
        และการลงบัญชีจะทำในโมดูล Finance
      </p>
    </div>
  );
}

export function cnApply(c: CnRow, ctx: ActionCtx) {
  if (!c.canApply) {
    ctx.toast(
      "ตัดเครดิตไม่ได้",
      c.outstandingCredit <= 0
        ? `${c.code} ตัดเครดิตครบแล้ว`
        : `${c.code} ต้องออกใบลดหนี้ก่อน (สถานะ ${c.status})`,
      "warning",
    );
    return;
  }

  let v = { amount: String(c.outstandingCredit), invoice: c.invoiceRef, date: toInputDate(today()) };

  ctx.formModal({
    title: "Apply Credit",
    width: "wide",
    confirmText: "Apply Credit",
    body: () => <ApplyBody c={c} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const amount = num(v.amount);
      if (amount <= 0) {
        ctx.toast("จำนวนไม่ถูกต้อง", "ยอดที่ตัดต้องมากกว่า 0", "warning");
        return false;
      }
      if (amount > c.outstandingCredit) {
        ctx.toast(
          "ตัดเกินยอดคงเหลือ",
          `คงเหลือ ${money(c.outstandingCredit)} แต่ระบุ ${money(amount)}`,
          "warning",
        );
        return false;
      }
      if (!v.invoice.trim()) {
        ctx.toast("ต้องระบุใบแจ้งหนี้", "ระบุเลขที่ใบแจ้งหนี้ที่จะนำเครดิตไปตัด", "warning");
        return false;
      }

      const now = stamp();
      c.appliedAmount = Math.round((num(c.appliedAmount) + amount) * 100) / 100;
      c.appliedDate = toDisplayDate(v.date);
      c.appliedTo = v.invoice.trim();
      c.status = "Applied";
      c.updated = now;
      c.updatedBy = USER();
      log(c, "Credit applied", `ตัดกับ ${c.appliedTo} จำนวน ${money(amount)} บาท`, "info");
      audit(c, "Credit applied", "appliedAmount", money(c.appliedAmount - amount), money(c.appliedAmount), "primary");
      commit(
        ctx,
        "ตัดเครดิตแล้ว",
        `${c.code} — ตัด ${money(amount)} · คงเหลือ ${money(Math.max(0, c.totalCredit - c.appliedAmount))}`,
      );
    },
  });
}

/* ---------- Cancel / Void ---------- */

export function cnCancel(c: CnRow, ctx: ActionCtx) {
  if (!c.canCancel) {
    ctx.toast("ยกเลิกไม่ได้", `${c.code} ออกใบลดหนี้แล้ว — ต้องใช้ Void แทน`, "warning");
    return;
  }

  let reason = "";

  ctx.formModal({
    title: "Cancel Credit Note",
    confirmText: "Cancel Credit Note",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          <strong>{c.code}</strong> — {c.customer} · {money(c.totalCredit)} {c.currency}
          <br />
          ใบลดหนี้จะไม่ถูกลบ แต่เปลี่ยนสถานะเป็น Cancelled และแก้ไขไม่ได้อีก
        </p>
        <ReasonField label="เหตุผลที่ยกเลิก" options={CN_CANCEL_REASONS} onChange={(v) => (reason = v)} />
      </div>
    ),
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ยกเลิกก่อนยืนยัน", "warning");
        return false;
      }
      const from = c.status;
      c.status = "Cancelled";
      c.cancelReason = reason;
      c.updated = stamp();
      c.updatedBy = USER();
      log(c, "Cancelled", `เหตุผล: ${reason}`, "warn");
      audit(c, "Status changed", "status", from, "Cancelled", "warn");
      commit(ctx, "ยกเลิกใบลดหนี้แล้ว", `${c.code} — ${reason}`, "danger");
    },
  });
}

export function cnVoid(c: CnRow, ctx: ActionCtx) {
  if (!c.canVoid) {
    ctx.toast("Void ไม่ได้", `${c.code} ยังไม่ได้ออกใบลดหนี้`, "warning");
    return;
  }

  let reason = "";

  ctx.formModal({
    title: "Void Issued Credit Note",
    confirmText: "Void Credit Note",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          <strong>{c.code}</strong> — {c.customer} · {money(c.totalCredit)} {c.currency}
          <br />
          <span className="font-semibold text-danger-text">
            ใบลดหนี้ที่ออกแล้วจะถูกยกเลิกทางบัญชี — ต้องได้รับอนุมัติจากฝ่ายบัญชี
          </span>
          {c.appliedAmount > 0 && (
            <>
              <br />
              ใบนี้ตัดเครดิตไปแล้ว {money(c.appliedAmount)} {c.currency} — ต้องกลับรายการก่อน
            </>
          )}
        </p>
        <ReasonField label="เหตุผลที่ Void" options={CN_VOID_REASONS} onChange={(v) => (reason = v)} />
      </div>
    ),
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ Void ก่อนยืนยัน", "warning");
        return false;
      }
      const from = c.status;
      c.status = "Void";
      c.voidReason = reason;
      c.voidBy = USER();
      c.updated = stamp();
      c.updatedBy = USER();
      log(c, "Void", `เหตุผล: ${reason} — อนุมัติโดย ${USER()}`, "warn");
      audit(c, "Status changed", "status", from, "Void", "warn");
      commit(ctx, "Void ใบลดหนี้แล้ว", `${c.code} — ${reason}`, "danger");
    },
  });
}

/* ---------- Print / export / payment placeholder ---------- */

export function cnPrint(c: CnRow, ctx: ActionCtx) {
  ctx.toast("พิมพ์ใบลดหนี้", `${c.code} — ${money(c.totalCredit)} ${c.currency}`, "info");
}

export function cnExportPdf(c: CnRow, ctx: ActionCtx) {
  ctx.toast("ส่งออก PDF", `${c.code} — การสร้างไฟล์ PDF จริงจะมาพร้อมโมดูล Finance`, "info");
}

export function cnDuplicate(c: CnRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Duplicate this credit note?",
    message: `สร้างใบลดหนี้ใหม่จาก ${c.code} — สถานะเริ่มต้นเป็น Draft และยังไม่ผูกเอกสารต้นทาง`,
    confirmText: "Duplicate",
    tone: "primary",
    onConfirm: () =>
      ctx.toast("ทำสำเนาใบลดหนี้", `${c.code} — เปิดฟอร์มสร้างใหม่พร้อมข้อมูลเดิม (Future support)`, "info"),
  });
}

export function cnReceivePayment(c: CnRow, ctx: ActionCtx) {
  ctx.toast(
    "Receive Payment",
    `${c.code} — Receive Payment will be available in the Finance module.`,
    "info",
  );
}

/* ---------- Bulk ---------- */

export function cnBulk(
  rows: CnRow[],
  action: "submit" | "approve" | "issue" | "cancel",
  ctx: ActionCtx,
) {
  const eligible = rows.filter((c) => {
    if (action === "submit") return c.canSubmit;
    if (action === "approve") return c.canApprove;
    if (action === "issue") return c.canIssue;
    return c.canCancel;
  });

  if (!eligible.length) {
    ctx.toast("ไม่มีรายการที่ทำได้", "รายการที่เลือกไม่อยู่ในสถานะที่รองรับ", "warning");
    return;
  }

  const verb = { submit: "ส่งขออนุมัติ", approve: "อนุมัติ", issue: "ออกใบลดหนี้", cancel: "ยกเลิก" }[action];

  ctx.confirm({
    title: `${verb} ${eligible.length} ใบ?`,
    message:
      eligible.length === rows.length
        ? `จะดำเนินการกับใบลดหนี้ทั้ง ${eligible.length} ใบที่เลือกไว้ · รวม ${money0(
            eligible.reduce((t, c) => t + c.totalCredit, 0),
          )} บาท`
        : `เลือกไว้ ${rows.length} ใบ แต่ทำได้ ${eligible.length} ใบ — ที่เหลือสถานะไม่รองรับ`,
    confirmText: verb,
    tone: action === "cancel" ? "danger" : "primary",
    onConfirm: () => {
      const now = stamp();
      let skipped = 0;
      for (const c of eligible) {
        if (action === "submit" && blockingIssues(submitReadiness(c)).length) {
          skipped++;
          continue;
        }
        const from = c.status;
        if (action === "submit") {
          c.status = "Pending Approval";
          c.approvalStatus = "Pending Approval";
        } else if (action === "approve") {
          for (const a of c.approvals ?? []) {
            if (a.status === "pending") {
              a.status = "done";
              a.respondedAt = now;
            }
          }
          c.status = "Approved";
          c.approvalStatus = "Approved";
        } else if (action === "issue") {
          c.status = "Issued";
        } else {
          c.status = "Cancelled";
          c.cancelReason = "ยกเลิกแบบกลุ่ม";
        }
        c.updated = now;
        c.updatedBy = USER();
        log(c, `${verb} (bulk)`, `ดำเนินการแบบกลุ่มโดย ${USER()}`, action === "cancel" ? "warn" : "primary");
        audit(c, "Status changed", "status", from, c.status, action === "cancel" ? "warn" : "primary");
      }
      commit(
        ctx,
        `${verb}แล้ว`,
        skipped ? `${eligible.length - skipped} ใบ · ข้าม ${skipped} ใบที่ข้อมูลยังไม่ครบ` : `${eligible.length} ใบ`,
        skipped ? "warning" : action === "cancel" ? "danger" : "success",
      );
    },
  });
}

export { lineAmount };
