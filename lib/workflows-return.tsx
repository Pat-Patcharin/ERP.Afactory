"use client";

import { actingUserName } from "./domain/admin";
import { useState, type ReactNode } from "react";
import { fmt, money, money0, stamp, isoToDmy, dmyToIso, today } from "./format";
import { cn } from "./utils";
import { Icon } from "./icons";
import type { ActionCtx } from "./types";
import {
  RTN_CANCEL_REASONS,
  RTN_DISPOSITIONS,
  RTN_EXCEPTION_TYPES,
  RTN_INSPECTORS,
  RTN_METHODS,
  RTN_PACKAGE_CONDITIONS,
  RTN_QC_CHECKLIST,
  RTN_QC_RESULTS,
  RTN_REJECT_REASONS,
  RTN_RESPONSIBLE,
  RTN_SEVERITY,
  RTN_WAREHOUSES,
} from "@/data/sales-returns";
import {
  SALES_RETURNS,
  blockingIssues,
  canReturnToStock,
  decorateReturns,
  isStockDisposition,
  lineCredit,
  nextRmaNo,
  stockEligibility,
  submitReadiness,
  type RtnRow,
} from "./domain/sales-return";

/* ============================================================
   SALES RETURN WORKFLOWS

   Draft → Submitted → Approved → Authorized → Waiting Return
        → Received → Pending QC → QC Completed
        → Disposition Completed → Credit Note Pending → Credited → Closed

   Goods only reach available stock through an accepted QC result
   plus a confirmed disposition. No accounting is posted here.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();
const num = (v: unknown) => Number(v) || 0;

function log(r: RtnRow, t: string, d: string, kind = "primary", u = USER()) {
  (r.history ??= []).unshift({ t, d, u, when: stamp(), kind });
}

function audit(r: RtnRow, event: string, field: string, from: string, to: string, kind = "primary") {
  (r.audit ??= []).unshift({ event, user: USER(), when: stamp(), field, from, to, kind });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
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

function Check({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2.5 rounded-sm py-1.5 text-left text-[13px] transition-colors hover:bg-card"
    >
      <span
        className={cn(
          "grid h-[17px] w-[17px] flex-shrink-0 place-items-center rounded-[5px] border-[1.5px]",
          on ? "border-primary bg-primary text-white" : "border-line-strong bg-card",
        )}
      >
        {on && <Icon name="check" size={11} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

/** Reason picker with local state for modals that need one value back. */
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

function IssueList({ issues }: { issues: { label: string; blocking: boolean }[] }) {
  const blocking = issues.filter((i) => i.blocking);
  const warn = issues.filter((i) => !i.blocking);
  if (!issues.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {blocking.length > 0 && (
        <div className="rounded-btn border border-[#FECACA] bg-danger-soft p-3">
          <p className="mb-1 text-[13px] font-semibold text-danger-text">
            ต้องแก้ก่อน ({blocking.length})
          </p>
          <ul className="flex flex-col gap-0.5 text-cap text-danger-text">
            {blocking.map((b) => (
              <li key={b.label}>• {b.label}</li>
            ))}
          </ul>
        </div>
      )}
      {warn.length > 0 && (
        <div className="rounded-btn border border-[#FDE68A] bg-warning-soft p-3">
          <p className="mb-1 text-[13px] font-semibold text-warning-text">ข้อควรระวัง ({warn.length})</p>
          <ul className="flex flex-col gap-0.5 text-cap text-warning-text">
            {warn.map((w) => (
              <li key={w.label}>• {w.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   APPROVAL
   ============================================================ */

export function rtnSubmit(r: RtnRow, ctx: ActionCtx) {
  const issues = submitReadiness(r);
  const blocking = blockingIssues(issues);
  if (blocking.length) {
    ctx.toast("ส่งขออนุมัติไม่ได้", `เหลือ ${blocking.length} เรื่องที่ต้องแก้ — ${blocking[0].label}`, "warning");
    return;
  }

  const from = r.status;
  const now = stamp();
  r.status = "Pending Approval";
  r.approvalStatus = "Pending Approval";
  r.rejectReason = "";
  if (!(r.approvals ?? []).length) {
    r.approvals = [
      { step: "Sales Review", role: "Sales Admin", approver: USER(), status: "done", requestedAt: now, respondedAt: now, comment: "" },
      { step: "Sales Manager Approval", role: "Sales Manager", approver: "Sales Manager", status: "pending", requestedAt: now, respondedAt: "", comment: "" },
    ];
  }
  r.updated = now;
  r.updatedBy = USER();
  log(r, "Submitted for approval", "ส่งขออนุมัติคำขอคืน", "info");
  audit(r, "Status changed", "status", from, "Pending Approval", "info");
  commit(ctx, "ส่งขออนุมัติแล้ว", `${r.code} — รอผู้จัดการฝ่ายขายอนุมัติ`);
}

function ApproveBody({ r, onChange }: { r: RtnRow; onChange: (v: Record<string, number>) => void }) {
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries((r.items ?? []).map((it) => [String(it.line), num(it.approvedQty) || num(it.requestedQty)])),
  );

  const put = (line: number, v: number) => {
    const next = { ...qty, [String(line)]: v };
    setQty(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-ink-2">
        อนุมัติจำนวนที่ยอมรับคืนของแต่ละบรรทัด — ลดจำนวนได้หากขอคืนเกินที่ส่งไปจริง
      </p>
      <IssueList issues={submitReadiness(r)} />
      <div className="overflow-x-auto rounded-btn border border-line">
        <table className="w-full text-cap">
          <thead>
            <tr className="bg-surface text-ink-2">
              <th className="px-2 py-2 text-left font-semibold">Product</th>
              <th className="px-2 py-2 text-right font-semibold">Shipped</th>
              <th className="px-2 py-2 text-right font-semibold">Returnable</th>
              <th className="px-2 py-2 text-right font-semibold">Requested</th>
              <th className="px-2 py-2 text-right font-semibold">Approve</th>
              <th className="px-2 py-2 text-right font-semibold">Credit</th>
            </tr>
          </thead>
          <tbody>
            {(r.items ?? []).map((it) => {
              const remaining = Math.max(0, num(it.shippedQty) - num(it.prevReturnedQty));
              const v = qty[String(it.line)] ?? 0;
              return (
                <tr key={it.line} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    <span className="font-medium tnum">{it.code}</span>
                    <span className="ml-2 text-ink-2">{it.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(it.shippedQty)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(remaining)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(it.requestedQty)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      className={cn(CONTROL, "h-8 w-20 px-2 py-1 text-right tnum")}
                      value={v}
                      max={remaining}
                      onChange={(e) => put(it.line, Math.min(num(e.target.value), remaining))}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tnum">
                    {money(v * num(it.unitPrice))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function rtnApprove(r: RtnRow, ctx: ActionCtx) {
  if (!r.canApprove) {
    ctx.toast("อนุมัติไม่ได้", `${r.code} อยู่ในสถานะ ${r.status}`, "warning");
    return;
  }

  let approved: Record<string, number> = Object.fromEntries(
    (r.items ?? []).map((it) => [String(it.line), num(it.approvedQty) || num(it.requestedQty)]),
  );

  ctx.formModal({
    title: "Approve Return Request",
    width: "wide",
    confirmText: "Approve Return",
    body: () => <ApproveBody r={r} onChange={(v) => (approved = v)} />,
    onConfirm: () => {
      const total = Object.values(approved).reduce((t, v) => t + num(v), 0);
      if (total <= 0) {
        ctx.toast("จำนวนอนุมัติเป็นศูนย์", "ต้องอนุมัติอย่างน้อย 1 หน่วย หรือกด Reject แทน", "warning");
        return false;
      }

      const now = stamp();
      let partial = false;
      for (const it of r.items ?? []) {
        const v = num(approved[String(it.line)]);
        if (v < num(it.requestedQty)) partial = true;
        it.approvedQty = v;
      }

      const from = r.status;
      r.status = partial ? "Partially Approved" : "Approved";
      r.approvalStatus = partial ? "Partially Approved" : "Approved";
      const pending = (r.approvals ?? []).find((a) => a.status === "pending");
      if (pending) {
        pending.status = "done";
        pending.respondedAt = now;
        pending.comment = partial ? "อนุมัติบางส่วน" : "อนุมัติเต็มจำนวน";
      }
      r.updated = now;
      r.updatedBy = USER();
      log(r, "Approved", partial ? `อนุมัติบางส่วน รวม ${fmt(total)} หน่วย` : `อนุมัติเต็มจำนวน ${fmt(total)} หน่วย`);
      audit(r, "Status changed", "status", from, r.status);
      commit(ctx, "อนุมัติคำขอคืนแล้ว", `${r.code} — พร้อมออก Return Authorization`);
    },
  });
}

export function rtnReject(r: RtnRow, ctx: ActionCtx) {
  if (!r.canApprove) {
    ctx.toast("ปฏิเสธไม่ได้", `${r.code} อยู่ในสถานะ ${r.status}`, "warning");
    return;
  }

  let reason = "";

  ctx.formModal({
    title: "Reject Return Request",
    confirmText: "Reject Return",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          <strong>{r.code}</strong> — {r.customer} · {money0(r.returnValue)} THB
          <br />
          คำขอคืนจะถูกปิดเป็น Rejected และแก้ไขแล้วส่งใหม่ได้
        </p>
        <ReasonField label="เหตุผลที่ไม่อนุมัติ" options={RTN_REJECT_REASONS} onChange={(v) => (reason = v)} />
      </div>
    ),
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ไม่อนุมัติก่อนยืนยัน", "warning");
        return false;
      }
      const now = stamp();
      const from = r.status;
      r.status = "Rejected";
      r.approvalStatus = "Rejected";
      r.rejectReason = reason;
      const pending = (r.approvals ?? []).find((a) => a.status === "pending");
      if (pending) {
        pending.status = "rejected";
        pending.respondedAt = now;
        pending.comment = reason;
      }
      r.updated = now;
      r.updatedBy = USER();
      log(r, "Rejected", `ไม่อนุมัติ: ${reason}`, "warn");
      audit(r, "Status changed", "status", from, "Rejected", "warn");
      commit(ctx, "ไม่อนุมัติคำขอคืน", `${r.code} — ${reason}`, "danger");
    },
  });
}

/* ============================================================
   RETURN AUTHORIZATION
   ============================================================ */

interface AuthDraft {
  warehouse: string;
  method: string;
  pickup: boolean;
  expected: string;
  expiry: string;
  instructions: string;
  packing: string;
}

function AuthBody({ r, onChange }: { r: RtnRow; onChange: (v: AuthDraft) => void }) {
  const [v, setV] = useState<AuthDraft>({
    warehouse: r.returnWarehouse || "Return Center",
    method: r.returnMethod || "Customer Ships Back",
    pickup: r.pickupRequired,
    expected: "",
    expiry: "",
    instructions: r.returnInstructions,
    packing: r.packingInstructions,
  });
  const put = (next: AuthDraft) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-btn border border-line bg-surface p-3 text-[13px]">
        <span className="text-ink-2">Authorized Return Qty</span>{" "}
        <strong className="tnum">{fmt(r.approvedQty || r.requestedQty)} หน่วย</strong>
        <span className="ml-4 text-ink-2">RMA</span>{" "}
        <strong className="tnum">{r.rmaNo || nextRmaNo()}</strong>
      </div>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Return Warehouse" required>
          <Picker options={RTN_WAREHOUSES} value={v.warehouse} onChange={(x) => put({ ...v, warehouse: x })} />
        </Field>
        <Field label="Return Method" required>
          <Picker options={RTN_METHODS} value={v.method} onChange={(x) => put({ ...v, method: x })} />
        </Field>
        <Field label="Expected Return Date" required>
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.expected}
            onChange={(e) => put({ ...v, expected: e.target.value })}
          />
        </Field>
        <Field label="Authorization Expiry Date">
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.expiry}
            onChange={(e) => put({ ...v, expiry: e.target.value })}
          />
        </Field>
      </div>
      <Check on={v.pickup} label="ต้องให้เราไปรับของที่ลูกค้า (Pickup Required)" onToggle={() => put({ ...v, pickup: !v.pickup })} />
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Return Instructions">
          <textarea
            rows={2}
            className={cn(CONTROL, "resize-y")}
            value={v.instructions}
            onChange={(e) => put({ ...v, instructions: e.target.value })}
          />
        </Field>
        <Field label="Packing Instructions">
          <textarea
            rows={2}
            className={cn(CONTROL, "resize-y")}
            value={v.packing}
            onChange={(e) => put({ ...v, packing: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-cap leading-relaxed text-ink-3">
        เมื่อออก Return Authorization แล้ว จำนวนที่อนุมัติจะถูกล็อก และสถานะเปลี่ยนเป็น Waiting Return
      </p>
    </div>
  );
}

export function rtnAuthorize(r: RtnRow, ctx: ActionCtx) {
  if (!r.canAuthorize) {
    ctx.toast("ออก RMA ไม่ได้", `${r.code} ต้องผ่านการอนุมัติก่อน (สถานะปัจจุบัน ${r.status})`, "warning");
    return;
  }

  let v: AuthDraft | null = null;

  ctx.formModal({
    title: "Authorize Return",
    width: "wide",
    confirmText: "Authorize Return",
    body: () => <AuthBody r={r} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const a = v;
      if (!a || !a.warehouse || !a.method) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุคลังรับคืนและวิธีการคืน", "warning");
        return false;
      }
      if (!a.expected) {
        ctx.toast("ต้องระบุวันที่คาดว่าจะได้รับคืน", "กำหนดวันเพื่อให้ฝ่ายคลังเตรียมรับของ", "warning");
        return false;
      }

      const now = stamp();
      const from = r.status;
      r.rmaNo = r.rmaNo || nextRmaNo();
      r.returnWarehouse = a.warehouse;
      r.returnMethod = a.method;
      r.pickupRequired = a.pickup;
      r.expectedReturnDate = isoToDmy(a.expected);
      r.authExpiryDate = isoToDmy(a.expiry);
      r.returnInstructions = a.instructions;
      r.packingInstructions = a.packing;
      r.authorizedBy = USER();
      r.authorizedAt = now;
      r.status = "Waiting Return";
      r.receivingStatus = "Waiting Return";
      r.updated = now;
      r.updatedBy = USER();

      log(r, "Return authorized", `ออก ${r.rmaNo} — รอรับของคืนภายใน ${r.expectedReturnDate}`);
      audit(r, "Status changed", "status", from, "Waiting Return");
      commit(ctx, "ออก Return Authorization แล้ว", `${r.code} → ${r.rmaNo}`);
    },
  });
}

export function rtnPrintRma(r: RtnRow, ctx: ActionCtx) {
  if (!r.rmaNo) {
    ctx.toast("ยังไม่มี RMA", `${r.code} ต้องออก Return Authorization ก่อน`, "warning");
    return;
  }
  ctx.toast("พิมพ์ RMA", `${r.rmaNo} — ส่งเอกสารให้ลูกค้าแนบมากับสินค้า`, "info");
}

/* ============================================================
   RECEIVING
   ============================================================ */

interface ReceiveDraft {
  date: string;
  warehouse: string;
  receiver: string;
  packageCount: string;
  packageCondition: string;
  deliveryRef: string;
  carrier: string;
  trackingNo: string;
  remark: string;
  qty: Record<string, number>;
}

function ReceiveBody({ r, onChange }: { r: RtnRow; onChange: (v: ReceiveDraft) => void }) {
  const [v, setV] = useState<ReceiveDraft>({
    date: dmyToIso(today()),
    warehouse: r.returnWarehouse || "Return Center",
    receiver: "Warehouse Staff",
    packageCount: "1",
    packageCondition: "Good",
    deliveryRef: "",
    carrier: "",
    trackingNo: "",
    remark: "",
    qty: Object.fromEntries(
      (r.items ?? []).map((it) => [
        String(it.line),
        Math.max(0, num(it.approvedQty || it.requestedQty) - num(it.receivedQty)),
      ]),
    ),
  });

  const put = (next: ReceiveDraft) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
        <Field label="Receiving Date" required>
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.date}
            onChange={(e) => put({ ...v, date: e.target.value })}
          />
        </Field>
        <Field label="Receiving Warehouse" required>
          <Picker options={RTN_WAREHOUSES} value={v.warehouse} onChange={(x) => put({ ...v, warehouse: x })} />
        </Field>
        <Field label="Package Count">
          <input
            type="number"
            className={cn(CONTROL, "tnum")}
            value={v.packageCount}
            onChange={(e) => put({ ...v, packageCount: e.target.value })}
          />
        </Field>
        <Field label="Package Condition">
          <Picker
            options={RTN_PACKAGE_CONDITIONS}
            value={v.packageCondition}
            onChange={(x) => put({ ...v, packageCondition: x })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Delivery Reference">
          <input className={CONTROL} value={v.deliveryRef} onChange={(e) => put({ ...v, deliveryRef: e.target.value })} />
        </Field>
        <Field label="Carrier">
          <input className={CONTROL} value={v.carrier} onChange={(e) => put({ ...v, carrier: e.target.value })} />
        </Field>
        <Field label="Tracking Number">
          <input className={CONTROL} value={v.trackingNo} onChange={(e) => put({ ...v, trackingNo: e.target.value })} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-btn border border-line">
        <table className="w-full text-cap">
          <thead>
            <tr className="bg-surface text-ink-2">
              <th className="px-2 py-2 text-left font-semibold">Product</th>
              <th className="px-2 py-2 text-left font-semibold">Serial / Lot</th>
              <th className="px-2 py-2 text-right font-semibold">Approved</th>
              <th className="px-2 py-2 text-right font-semibold">Prev. Received</th>
              <th className="px-2 py-2 text-right font-semibold">Remaining</th>
              <th className="px-2 py-2 text-right font-semibold">Receive Now</th>
            </tr>
          </thead>
          <tbody>
            {(r.items ?? []).map((it) => {
              const approved = num(it.approvedQty || it.requestedQty);
              const remaining = Math.max(0, approved - num(it.receivedQty));
              return (
                <tr key={it.line} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    <span className="font-medium tnum">{it.code}</span>
                    <span className="ml-2 text-ink-2">{it.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-ink-2">{it.serial || it.lot || "—"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(approved)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(it.receivedQty)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(remaining)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      className={cn(CONTROL, "h-8 w-20 px-2 py-1 text-right tnum")}
                      value={v.qty[String(it.line)] ?? 0}
                      max={remaining}
                      onChange={(e) =>
                        put({
                          ...v,
                          qty: { ...v.qty, [String(it.line)]: Math.min(num(e.target.value), remaining) },
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Field label="Remark">
        <textarea rows={2} className={cn(CONTROL, "resize-y")} value={v.remark} onChange={(e) => put({ ...v, remark: e.target.value })} />
      </Field>

      <p className="text-cap leading-relaxed text-ink-3">
        สินค้าที่รับคืนจะเข้าคลังรับคืน / QC Hold — <strong>ยังไม่กลายเป็นสต๊อกพร้อมขาย</strong>{" "}
        จนกว่าจะผ่าน QC และยืนยัน Disposition
      </p>
    </div>
  );
}

export function rtnReceive(r: RtnRow, ctx: ActionCtx) {
  if (!r.canReceive) {
    ctx.toast(
      "รับคืนไม่ได้",
      `${r.code} อยู่ในสถานะ ${r.status} — ต้องออก Return Authorization ก่อน`,
      "warning",
    );
    return;
  }

  let v: ReceiveDraft | null = null;

  ctx.formModal({
    title: "Receive Returned Goods",
    width: "wide",
    confirmText: "Receive Goods",
    body: () => <ReceiveBody r={r} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const d = v;
      if (!d) return false;
      const total = Object.values(d.qty).reduce((t, q) => t + num(q), 0);
      if (total <= 0) {
        ctx.toast("ยังไม่ได้ระบุจำนวน", "ต้องรับคืนอย่างน้อย 1 หน่วย", "warning");
        return false;
      }

      /* Rule: never receive more than authorised. */
      for (const it of r.items ?? []) {
        const approved = num(it.approvedQty || it.requestedQty);
        const add = num(d.qty[String(it.line)]);
        if (num(it.receivedQty) + add > approved) {
          ctx.toast(
            "รับเกินจำนวนที่อนุมัติ",
            `${it.code} อนุมัติ ${fmt(approved)} แต่จะรับรวมเป็น ${fmt(num(it.receivedQty) + add)}`,
            "warning",
          );
          return false;
        }
      }

      const now = stamp();
      for (const it of r.items ?? []) {
        it.receivedQty = num(it.receivedQty) + num(d.qty[String(it.line)]);
      }

      const approvedTotal = (r.items ?? []).reduce((t, it) => t + num(it.approvedQty || it.requestedQty), 0);
      const receivedTotal = (r.items ?? []).reduce((t, it) => t + num(it.receivedQty), 0);
      const full = receivedTotal >= approvedTotal;

      r.receiving = {
        receivedDate: `${isoToDmy(d.date)} ${now.split(" ")[1] ?? ""}`.trim(),
        warehouse: d.warehouse,
        receiver: d.receiver,
        packageCount: num(d.packageCount),
        packageCondition: d.packageCondition,
        deliveryRef: d.deliveryRef,
        carrier: d.carrier,
        trackingNo: d.trackingNo,
        remark: d.remark,
      };
      const from = r.status;
      r.status = full ? "Received" : "Partially Received";
      r.receivingStatus = full ? "Received" : "Partially Received";
      /* Receiving always raises a QC task — nothing skips inspection. */
      r.qcStatus = "Pending QC";
      r.returnWarehouse = d.warehouse;
      r.updated = now;
      r.updatedBy = USER();

      log(
        r,
        full ? "Received" : "Partially received",
        `รับคืน ${fmt(receivedTotal)} จาก ${fmt(approvedTotal)} หน่วย เข้า ${d.warehouse} (QC Hold)`,
        full ? "primary" : "warn",
      );
      audit(r, "Goods received", "receivingStatus", from, r.receivingStatus, full ? "primary" : "warn");

      if (d.packageCondition !== "Good") {
        (r.exceptions ??= []).unshift({
          type: "Package Damaged",
          when: now,
          desc: `สภาพพัสดุตอนรับคืน: ${d.packageCondition}${d.remark ? ` — ${d.remark}` : ""}`,
          severity: "Medium",
          party: "ผู้ขนส่ง",
          resolution: "",
          followUp: "",
          status: "Open",
        });
      }
      if (!full) {
        (r.exceptions ??= []).unshift({
          type: "Product Missing",
          when: now,
          desc: `รับคืนได้ ${fmt(receivedTotal)} จาก ${fmt(approvedTotal)} หน่วย`,
          severity: "Medium",
          party: "ลูกค้า",
          resolution: "",
          followUp: "",
          status: "Open",
        });
      }

      commit(
        ctx,
        full ? "รับคืนครบแล้ว" : "รับคืนบางส่วน",
        `${r.code} — เข้า ${d.warehouse} รอ QC · ยังไม่เป็นสต๊อกพร้อมขาย`,
        full ? "success" : "warning",
      );
    },
  });
}

/* ============================================================
   RETURN QC
   ============================================================ */

interface QcDraft {
  inspector: string;
  result: string;
  comment: string;
  accepted: Record<string, number>;
  rejected: Record<string, number>;
  hold: Record<string, number>;
  checks: Record<string, string>;
}

function QcBody({ r, onChange }: { r: RtnRow; onChange: (v: QcDraft) => void }) {
  const [v, setV] = useState<QcDraft>({
    inspector: "",
    result: "",
    comment: "",
    accepted: Object.fromEntries((r.items ?? []).map((it) => [String(it.line), num(it.receivedQty)])),
    rejected: Object.fromEntries((r.items ?? []).map((it) => [String(it.line), 0])),
    hold: Object.fromEntries((r.items ?? []).map((it) => [String(it.line), 0])),
    checks: {},
  });

  const put = (next: QcDraft) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Inspector" required>
          <Picker options={RTN_INSPECTORS} value={v.inspector} onChange={(x) => put({ ...v, inspector: x })} />
        </Field>
        <Field label="QC Result" required>
          <Picker options={RTN_QC_RESULTS} value={v.result} onChange={(x) => put({ ...v, result: x })} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-btn border border-line">
        <table className="w-full text-cap">
          <thead>
            <tr className="bg-surface text-ink-2">
              <th className="px-2 py-2 text-left font-semibold">Product</th>
              <th className="px-2 py-2 text-right font-semibold">Received</th>
              <th className="px-2 py-2 text-right font-semibold">Accept</th>
              <th className="px-2 py-2 text-right font-semibold">Reject</th>
              <th className="px-2 py-2 text-right font-semibold">Hold</th>
              <th className="px-2 py-2 text-left font-semibold">คืนเข้าสต๊อกได้?</th>
            </tr>
          </thead>
          <tbody>
            {(r.items ?? []).filter((it) => num(it.receivedQty) > 0).map((it) => {
              const recv = num(it.receivedQty);
              const a = num(v.accepted[String(it.line)]);
              const rj = num(v.rejected[String(it.line)]);
              const h = num(v.hold[String(it.line)]);
              const balanced = a + rj + h === recv;
              const elig = stockEligibility({ ...it, acceptedQty: a });
              const blocked = elig.filter((e) => e.blocking);
              return (
                <tr key={it.line} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    <span className="font-medium tnum">{it.code}</span>
                    <span className="ml-2 text-ink-2">{it.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(recv)}</td>
                  {(["accepted", "rejected", "hold"] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        className={cn(
                          CONTROL,
                          "h-8 w-16 px-2 py-1 text-right tnum",
                          !balanced && "border-danger",
                        )}
                        value={v[k][String(it.line)] ?? 0}
                        onChange={(e) =>
                          put({ ...v, [k]: { ...v[k], [String(it.line)]: num(e.target.value) } })
                        }
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {blocked.length ? (
                      <span className="text-warning-text">{blocked[0].label}</span>
                    ) : a > 0 ? (
                      <span className="text-success-text">ได้</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="rounded-btn border border-line bg-surface p-3">
        <summary className="cursor-pointer text-[13px] font-medium">QC Checklist</summary>
        <div className="mt-3 grid grid-cols-2 gap-2 max-md:grid-cols-1">
          {RTN_QC_CHECKLIST.map((item) => (
            <div key={item} className="flex items-center gap-2 text-cap">
              <span className="min-w-0 flex-1 truncate">{item}</span>
              {(["pass", "fail", "na"] as const).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => put({ ...v, checks: { ...v.checks, [item]: v.checks[item] === res ? "" : res } })}
                  className={cn(
                    "rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors",
                    v.checks[item] === res
                      ? res === "pass"
                        ? "bg-success text-white"
                        : res === "fail"
                          ? "bg-danger text-white"
                          : "bg-neutral-text text-white"
                      : "border border-line text-ink-2 hover:bg-card",
                  )}
                >
                  {res.toUpperCase()}
                </button>
              ))}
            </div>
          ))}
        </div>
      </details>

      <Field label="QC Comment">
        <textarea rows={2} className={cn(CONTROL, "resize-y")} value={v.comment} onChange={(e) => put({ ...v, comment: e.target.value })} />
      </Field>

      <p className="text-cap leading-relaxed text-ink-3">
        Accept + Reject + Hold ต้องเท่ากับจำนวนที่รับคืนของแต่ละบรรทัด — และ{" "}
        <strong>QC ยังไม่คืนของเข้าสต๊อก</strong> ต้องยืนยัน Disposition อีกขั้น
      </p>
    </div>
  );
}

export function rtnStartQc(r: RtnRow, ctx: ActionCtx) {
  if (!r.canQc) {
    ctx.toast("เริ่ม QC ไม่ได้", `${r.code} ต้องรับสินค้าคืนก่อน (สถานะ ${r.status})`, "warning");
    return;
  }

  let v: QcDraft | null = null;

  ctx.formModal({
    title: "Return QC",
    width: "wide",
    confirmText: "Complete QC",
    body: () => <QcBody r={r} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const d = v;
      if (!d || !d.inspector) {
        ctx.toast("ต้องระบุผู้ตรวจ", "เลือก Inspector ก่อนบันทึกผล QC", "warning");
        return false;
      }
      if (!d.result) {
        ctx.toast("ต้องเลือกผลตรวจ", "เลือก QC Result ก่อนบันทึก", "warning");
        return false;
      }

      /* Accept + Reject + Hold must equal what was received on every line. */
      for (const it of r.items ?? []) {
        if (num(it.receivedQty) <= 0) continue;
        const a = num(d.accepted[String(it.line)]);
        const rj = num(d.rejected[String(it.line)]);
        const h = num(d.hold[String(it.line)]);
        if (a + rj + h !== num(it.receivedQty)) {
          ctx.toast(
            "จำนวนไม่สมดุล",
            `${it.code}: Accept + Reject + Hold = ${a + rj + h} แต่รับคืน ${fmt(it.receivedQty)}`,
            "warning",
          );
          return false;
        }
      }

      const now = stamp();
      for (const it of r.items ?? []) {
        if (num(it.receivedQty) <= 0) continue;
        it.inspectedQty = num(it.receivedQty);
        it.acceptedQty = num(d.accepted[String(it.line)]);
        it.rejectedQty = num(d.rejected[String(it.line)]);
        it.holdQty = num(d.hold[String(it.line)]);
      }

      r.qc = {
        inspector: d.inspector,
        inspectionDate: now,
        result: d.result,
        comment: d.comment,
        checklist: RTN_QC_CHECKLIST.map((item) => ({ item, result: d.checks[item] ?? "", comment: "" })),
      };
      const from = r.status;
      r.qcStatus = "QC Completed";
      r.status = "QC Completed";
      r.dispositionStatus = "Disposition Pending";
      r.updated = now;
      r.updatedBy = d.inspector;

      const accepted = (r.items ?? []).reduce((t, it) => t + num(it.acceptedQty), 0);
      const rejected = (r.items ?? []).reduce((t, it) => t + num(it.rejectedQty), 0);

      log(r, "QC completed", `ผลตรวจ: ${d.result} — รับ ${fmt(accepted)} · ไม่รับ ${fmt(rejected)}`);
      audit(r, "QC completed", "qcStatus", from, "QC Completed");
      commit(
        ctx,
        "บันทึกผล QC แล้ว",
        `${r.code} — รอกำหนด Disposition · ของยังไม่เข้าสต๊อกขาย`,
        "success",
      );
    },
  });
}

/* ============================================================
   DISPOSITION
   ============================================================ */

function DispositionBody({
  r,
  onChange,
}: {
  r: RtnRow;
  onChange: (v: Record<string, string>) => void;
}) {
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries((r.items ?? []).map((it) => [String(it.line), it.disposition ?? ""])),
  );

  const put = (line: number, x: string) => {
    const next = { ...v, [String(line)]: x };
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-ink-2">
        กำหนดปลายทางของสินค้าที่รับคืนแต่ละบรรทัด —{" "}
        <strong>เฉพาะบรรทัดที่ QC รับและผ่านเงื่อนไขเท่านั้นที่คืนเข้าสต๊อกขายได้</strong>
      </p>
      <div className="overflow-x-auto rounded-btn border border-line">
        <table className="w-full text-cap">
          <thead>
            <tr className="bg-surface text-ink-2">
              <th className="px-2 py-2 text-left font-semibold">Product</th>
              <th className="px-2 py-2 text-right font-semibold">Accepted</th>
              <th className="px-2 py-2 text-right font-semibold">Rejected</th>
              <th className="px-2 py-2 text-right font-semibold">Hold</th>
              <th className="px-2 py-2 text-left font-semibold">Disposition</th>
              <th className="px-2 py-2 text-left font-semibold">เงื่อนไข</th>
            </tr>
          </thead>
          <tbody>
            {(r.items ?? []).filter((it) => num(it.inspectedQty) > 0).map((it) => {
              const chosen = v[String(it.line)] ?? "";
              const blocked = stockEligibility(it).filter((e) => e.blocking);
              const bad = isStockDisposition(chosen) && blocked.length > 0;
              return (
                <tr key={it.line} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    <span className="font-medium tnum">{it.code}</span>
                    <span className="ml-2 text-ink-2">{it.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(it.acceptedQty)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(it.rejectedQty)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{fmt(it.holdQty)}</td>
                  <td className="px-2 py-1.5">
                    <select
                      className={cn(CONTROL, "h-8 cursor-pointer px-2 py-1", bad && "border-danger")}
                      value={chosen}
                      onChange={(e) => put(it.line, e.target.value)}
                    >
                      <option value="">— เลือก —</option>
                      {RTN_DISPOSITIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    {bad ? (
                      <span className="font-medium text-danger">{blocked[0].label}</span>
                    ) : blocked.length ? (
                      <span className="text-warning-text">{blocked[0].label}</span>
                    ) : (
                      <span className="text-success-text">คืนเข้าสต๊อกได้</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-cap leading-relaxed text-ink-3">
        การยืนยัน Disposition จะสร้าง stock movement แบบจำลอง — ยังไม่ผูกกับบัญชีคลังจริงในเฟสนี้
      </p>
    </div>
  );
}

export function rtnDisposition(r: RtnRow, ctx: ActionCtx) {
  if (!r.canDisposition) {
    ctx.toast(
      "กำหนด Disposition ไม่ได้",
      `${r.code} ต้องผ่าน QC ก่อน (QC: ${r.qcStatus})`,
      "warning",
    );
    return;
  }

  let picked: Record<string, string> = {};

  ctx.formModal({
    title: "Complete Disposition",
    width: "wide",
    confirmText: "Complete Disposition",
    body: () => <DispositionBody r={r} onChange={(v) => (picked = v)} />,
    onConfirm: () => {
      const lines = (r.items ?? []).filter((it) => num(it.inspectedQty) > 0);
      const missing = lines.filter((it) => !picked[String(it.line)]);
      if (missing.length) {
        ctx.toast("ยังกำหนดไม่ครบ", `เหลือ ${missing.length} บรรทัดที่ยังไม่เลือก Disposition`, "warning");
        return false;
      }

      /* Rule 8 & 12–13: unsellable goods can never be sent to available stock. */
      const illegal = lines.filter(
        (it) => isStockDisposition(picked[String(it.line)]) && !canReturnToStock(it),
      );
      if (illegal.length) {
        ctx.toast(
          "คืนเข้าสต๊อกไม่ได้",
          `${illegal[0].code}: ${stockEligibility(illegal[0]).find((e) => e.blocking)?.label ?? "ไม่ผ่านเงื่อนไข"}`,
          "warning",
        );
        return false;
      }

      const now = stamp();
      let toStock = 0;
      for (const it of lines) {
        const d = picked[String(it.line)];
        it.disposition = d;
        if (isStockDisposition(d)) {
          it.destWarehouse = "WH-BKK Bangkok Main Warehouse";
          it.destLocation = "A-01-01";
          toStock += num(it.acceptedQty);
        } else if (d === "Scrap") {
          it.destWarehouse = "WH-QUARANTINE Quarantine";
          it.destLocation = "SCRAP-01";
        } else if (d === "Supplier Claim" || d === "Return to Supplier") {
          it.destWarehouse = "WH-CLAIM Claim Warehouse";
          it.destLocation = "CLAIM-A-01";
        } else {
          it.destWarehouse = r.returnWarehouse;
          it.destLocation = "HOLD-01";
        }
      }

      const from = r.status;
      r.dispositionStatus = "Disposition Completed";
      r.status = "Disposition Completed";
      /* Credit note is a separate, deliberate handoff — never automatic. */
      if (r.creditNoteStatus === "Not Applicable" && r.requestedResolution === "Credit Note")
        r.creditNoteStatus = "Pending";
      r.updated = now;
      r.updatedBy = USER();

      log(
        r,
        "Disposition completed",
        toStock > 0
          ? `คืนเข้าสต๊อกขาย ${fmt(toStock)} หน่วย · ที่เหลือส่งตามปลายทางที่กำหนด`
          : "กำหนดปลายทางครบทุกบรรทัด — ไม่มีของคืนเข้าสต๊อกขาย",
      );
      audit(r, "Disposition completed", "dispositionStatus", from, "Disposition Completed");
      commit(
        ctx,
        "ยืนยัน Disposition แล้ว",
        toStock > 0
          ? `${r.code} — คืนเข้าสต๊อกขาย ${fmt(toStock)} หน่วย (stock movement จำลอง)`
          : `${r.code} — ไม่มีของคืนเข้าสต๊อกขาย`,
      );
    },
  });
}

/* ============================================================
   CREDIT NOTE HANDOFF
   ============================================================ */

function CreditBody({ r, onChange }: { r: RtnRow; onChange: (v: { mode: string; reason: string }) => void }) {
  const [v, setV] = useState({ mode: "Use Original Invoice Price", reason: "" });
  const put = (next: typeof v) => {
    setV(next);
    onChange(next);
  };

  const eligible = (r.items ?? []).filter((it) => num(it.acceptedQty) > 0 || num(it.approvedQty) > 0);
  const creditQty = eligible.reduce((t, it) => t + (num(it.acceptedQty) || num(it.approvedQty)), 0);
  const creditAmount = eligible.reduce(
    (t, it) => t + (num(it.acceptedQty) || num(it.approvedQty)) * num(it.unitPrice),
    0,
  );
  const tax = Math.round(creditAmount * 0.07 * 100) / 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-btn border border-line bg-surface p-4 text-[13px]">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="font-semibold tnum">{r.code}</span>
          <span className="text-ink-2">{r.customer}</span>
          <span className="text-ink-2">Source Invoice: {r.invoiceRef || "—"}</span>
        </div>
        <table className="w-full text-cap">
          <thead>
            <tr className="border-b border-line text-ink-2">
              <th className="py-1.5 text-left font-semibold">Product</th>
              <th className="py-1.5 text-right font-semibold">Credit Qty</th>
              <th className="py-1.5 text-right font-semibold">Unit Price</th>
              <th className="py-1.5 text-right font-semibold">Credit Amount</th>
            </tr>
          </thead>
          <tbody>
            {eligible.map((it) => (
              <tr key={it.line} className="border-b border-line last:border-b-0">
                <td className="py-1.5">
                  <span className="font-medium tnum">{it.code}</span>
                  <span className="ml-2 text-ink-2">{it.name}</span>
                </td>
                <td className="py-1.5 text-right tnum">{fmt(num(it.acceptedQty) || num(it.approvedQty))}</td>
                <td className="py-1.5 text-right tnum">{money(it.unitPrice)}</td>
                <td className="py-1.5 text-right font-medium tnum">
                  {money((num(it.acceptedQty) || num(it.approvedQty)) * num(it.unitPrice))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2">
          <div className="flex justify-between">
            <span className="text-ink-2">Credit Amount</span>
            <span className="tnum">{money(creditAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-2">Tax (7%)</span>
            <span className="tnum">{money(tax)}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="font-semibold">Total Credit</span>
            <span className="text-lg font-semibold tnum">{money(creditAmount + tax)}</span>
          </div>
        </div>
        <p className="mt-2 text-cap text-ink-3">
          รวม {eligible.length} บรรทัด · {fmt(creditQty)} หน่วย — บรรทัดที่ QC ไม่รับถูกตัดออกแล้ว
        </p>
      </div>

      <Field label="Credit Basis" required>
        <Picker
          options={["Use Original Invoice Price", "Manual Credit Adjustment"]}
          value={v.mode}
          onChange={(x) => put({ ...v, mode: x })}
        />
      </Field>
      {v.mode === "Manual Credit Adjustment" && (
        <Field label="เหตุผลที่ปรับยอดเครดิต" required>
          <textarea
            rows={2}
            className={cn(CONTROL, "resize-y")}
            placeholder="ระบุเหตุผลให้ฝ่ายบัญชีตรวจสอบได้"
            value={v.reason}
            onChange={(e) => put({ ...v, reason: e.target.value })}
          />
        </Field>
      )}
      <p className="text-cap leading-relaxed text-ink-3">
        ระบบจะออกเลขที่ใบลดหนี้แบบจำลองและผูกกับคำขอคืนนี้ — โมดูล Credit Note เต็มรูปแบบจะมาในเฟสถัดไป
      </p>
    </div>
  );
}

export function rtnCreditNote(r: RtnRow, ctx: ActionCtx) {
  if (r.creditNoteRef) {
    ctx.toast("มีใบลดหนี้อยู่แล้ว", `${r.code} → ${r.creditNoteRef}`, "warning");
    return;
  }
  if (!r.canCreditNote) {
    ctx.toast(
      "ออกใบลดหนี้ไม่ได้",
      `${r.code} ต้องผ่านการอนุมัติหรือรับของคืนก่อน (สถานะ ${r.status})`,
      "warning",
    );
    return;
  }

  let v = { mode: "Use Original Invoice Price", reason: "" };

  ctx.formModal({
    title: "Create Credit Note",
    width: "wide",
    confirmText: "Create Credit Note",
    body: () => <CreditBody r={r} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      if (v.mode === "Manual Credit Adjustment" && !v.reason.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "การปรับยอดเครดิตเองต้องมีเหตุผลกำกับ", "warning");
        return false;
      }

      const now = stamp();
      const cnCode = `CN-2026-${String(SALES_RETURNS.length + 20).padStart(6, "0")}`;
      const from = r.status;
      r.creditNoteRef = cnCode;
      r.creditNoteStatus = "Pending";
      r.status = "Credit Note Pending";
      r.updated = now;
      r.updatedBy = USER();
      log(r, "Credit note created", `ออกใบลดหนี้ ${cnCode} (${v.mode})`, "info");
      audit(r, "Credit note linked", "creditNoteRef", "—", cnCode, "info");
      commit(
        ctx,
        "สร้างใบลดหนี้แล้ว (จำลอง)",
        `${cnCode} — โมดูล Credit Note เต็มรูปแบบจะมาในเฟสถัดไป`,
        "info",
      );
    },
  });
}

/* ============================================================
   EXCEPTION / REPLACEMENT / CANCEL
   ============================================================ */

interface ExcDraft {
  type: string;
  severity: string;
  party: string;
  desc: string;
  resolution: string;
  followUp: string;
}

function ExceptionBody({ onChange }: { onChange: (v: ExcDraft) => void }) {
  const [v, setV] = useState<ExcDraft>({
    type: "",
    severity: "Medium",
    party: "",
    desc: "",
    resolution: "",
    followUp: "",
  });
  const put = (next: ExcDraft) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Exception Type" required>
          <Picker options={RTN_EXCEPTION_TYPES} value={v.type} onChange={(x) => put({ ...v, type: x })} />
        </Field>
        <Field label="Severity" required>
          <Picker options={RTN_SEVERITY} value={v.severity} onChange={(x) => put({ ...v, severity: x })} />
        </Field>
        <Field label="Responsible Party">
          <Picker options={RTN_RESPONSIBLE} value={v.party} onChange={(x) => put({ ...v, party: x })} />
        </Field>
      </div>
      <Field label="Description" required>
        <textarea
          rows={3}
          className={cn(CONTROL, "resize-y")}
          value={v.desc}
          onChange={(e) => put({ ...v, desc: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Resolution">
          <input className={CONTROL} value={v.resolution} onChange={(e) => put({ ...v, resolution: e.target.value })} />
        </Field>
        <Field label="Follow-Up Date">
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.followUp}
            onChange={(e) => put({ ...v, followUp: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

export function rtnException(r: RtnRow, ctx: ActionCtx) {
  let v: ExcDraft | null = null;

  ctx.formModal({
    title: "Record Return Exception",
    width: "wide",
    confirmText: "Record Exception",
    body: () => <ExceptionBody onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const e = v;
      if (!e || !e.type) {
        ctx.toast("ต้องเลือกประเภท", "เลือก Exception Type ก่อนบันทึก", "warning");
        return false;
      }
      if (!e.desc.trim()) {
        ctx.toast("ต้องระบุรายละเอียด", "อธิบายเหตุการณ์ก่อนบันทึก", "warning");
        return false;
      }

      const now = stamp();
      (r.exceptions ??= []).unshift({
        type: e.type,
        when: now,
        desc: e.desc.trim(),
        severity: e.severity,
        party: e.party,
        resolution: e.resolution.trim(),
        followUp: isoToDmy(e.followUp),
        status: e.resolution.trim() ? "Resolved" : "Open",
      });
      r.updated = now;
      r.updatedBy = USER();
      log(r, "Exception recorded", `${e.type} — ระดับ ${e.severity}`, "warn");
      audit(r, "Exception recorded", "exceptions", String((r.exceptions?.length ?? 1) - 1), String(r.exceptions?.length ?? 1), "warn");
      commit(ctx, "บันทึกเหตุผิดปกติแล้ว", `${r.code} — ${e.type}`, "warning");
    },
  });
}

export function rtnReplacement(r: RtnRow, ctx: ActionCtx) {
  if (r.replacementRef) {
    ctx.toast("มีใบสั่งขายทดแทนแล้ว", `${r.code} → ${r.replacementRef}`, "warning");
    return;
  }
  ctx.confirm({
    title: "Create Replacement Sales Order?",
    message: (
      <>
        สร้างใบสั่งขายทดแทนสำหรับ <strong>{r.code}</strong> — {r.customer}
        <br />
        {fmt(r.approvedQty || r.requestedQty)} หน่วย
        <br />
        <span className="text-ink-2">
          เฟสนี้จะผูกเลขที่ใบสั่งขายทดแทนไว้ก่อน การจัดส่งจริงจะทำผ่านโมดูล Sales Order
        </span>
      </>
    ),
    confirmText: "Create Replacement",
    tone: "primary",
    onConfirm: () => {
      const code = `SO-2026-${String(SALES_RETURNS.length + 50).padStart(6, "0")}`;
      r.replacementRef = code;
      r.updated = stamp();
      r.updatedBy = USER();
      log(r, "Replacement created", `สร้างใบสั่งขายทดแทน ${code}`, "info");
      audit(r, "Replacement linked", "replacementRef", "—", code, "info");
      commit(ctx, "สร้างใบสั่งขายทดแทนแล้ว (จำลอง)", `${code}`, "info");
    },
  });
}

export function rtnClose(r: RtnRow, ctx: ActionCtx) {
  if (r.dispositionStatus !== "Disposition Completed") {
    ctx.toast("ปิดคำขอไม่ได้", `${r.code} ต้องยืนยัน Disposition ก่อน`, "warning");
    return;
  }
  ctx.confirm({
    title: "Close this return?",
    message: `${r.code} จะถูกปิด — ไม่สามารถแก้ไขได้อีก`,
    confirmText: "Close Return",
    tone: "primary",
    onConfirm: () => {
      const from = r.status;
      r.status = "Closed";
      r.updated = stamp();
      r.updatedBy = USER();
      log(r, "Closed", "ปิดคำขอคืนสินค้า");
      audit(r, "Status changed", "status", from, "Closed");
      commit(ctx, "ปิดคำขอคืนแล้ว", r.code);
    },
  });
}

export function rtnCancel(r: RtnRow, ctx: ActionCtx) {
  if (["Received", "Partially Received", "QC Completed", "Disposition Completed", "Credited", "Closed", "Cancelled"].includes(r.status)) {
    ctx.toast("ยกเลิกไม่ได้", `${r.code} มีการรับของคืนแล้ว — ใช้ Record Exception แทน`, "warning");
    return;
  }

  let reason = "";

  ctx.formModal({
    title: "Cancel Return Request",
    confirmText: "Cancel Return",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          <strong>{r.code}</strong> — {r.customer}
          <br />
          คำขอคืนจะไม่ถูกลบ แต่เปลี่ยนสถานะเป็น Cancelled และแก้ไขไม่ได้อีก
        </p>
        <ReasonField label="เหตุผลที่ยกเลิก" options={RTN_CANCEL_REASONS} onChange={(v) => (reason = v)} />
      </div>
    ),
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ยกเลิกก่อนยืนยัน", "warning");
        return false;
      }
      const from = r.status;
      r.status = "Cancelled";
      r.cancelReason = reason;
      r.updated = stamp();
      r.updatedBy = USER();
      log(r, "Cancelled", `เหตุผล: ${reason}`, "warn");
      audit(r, "Status changed", "status", from, "Cancelled", "warn");
      commit(ctx, "ยกเลิกคำขอคืนแล้ว", `${r.code} — ${reason}`, "danger");
    },
  });
}

/* ---------- Bulk ---------- */

export function rtnBulk(
  rows: RtnRow[],
  action: "submit" | "approve" | "warehouse" | "inspector" | "cancel",
  ctx: ActionCtx,
) {
  if (action === "warehouse" || action === "inspector") {
    ctx.toast(
      action === "warehouse" ? "Assign Return Warehouse" : "Assign Inspector",
      `${rows.length} ใบ — การกำหนดแบบกลุ่มจะเปิดใช้พร้อมหน้าจัดคิว QC ในเฟสถัดไป`,
      "info",
    );
    return;
  }

  const eligible = rows.filter((r) => {
    if (action === "submit") return r.canSubmit;
    if (action === "approve") return r.canApprove;
    return ["Draft", "Rejected"].includes(r.status);
  });

  if (!eligible.length) {
    ctx.toast("ไม่มีรายการที่ทำได้", "รายการที่เลือกไม่อยู่ในสถานะที่รองรับ", "warning");
    return;
  }

  const verb = { submit: "ส่งขออนุมัติ", approve: "อนุมัติ", cancel: "ยกเลิก" }[action];

  ctx.confirm({
    title: `${verb} ${eligible.length} ใบ?`,
    message:
      eligible.length === rows.length
        ? `จะดำเนินการกับคำขอคืนทั้ง ${eligible.length} ใบที่เลือกไว้`
        : `เลือกไว้ ${rows.length} ใบ แต่ทำได้ ${eligible.length} ใบ — ที่เหลือสถานะไม่รองรับ`,
    confirmText: verb,
    tone: action === "cancel" ? "danger" : "primary",
    onConfirm: () => {
      const now = stamp();
      let skipped = 0;
      for (const r of eligible) {
        if (action === "submit" && blockingIssues(submitReadiness(r)).length) {
          skipped++;
          continue;
        }
        const from = r.status;
        if (action === "submit") {
          r.status = "Pending Approval";
          r.approvalStatus = "Pending Approval";
        } else if (action === "approve") {
          for (const it of r.items ?? []) it.approvedQty = num(it.requestedQty);
          r.status = "Approved";
          r.approvalStatus = "Approved";
        } else {
          r.status = "Cancelled";
          r.cancelReason = "ยกเลิกแบบกลุ่ม";
        }
        r.updated = now;
        r.updatedBy = USER();
        log(r, `${verb} (bulk)`, `ดำเนินการแบบกลุ่มโดย ${USER()}`, action === "cancel" ? "warn" : "primary");
        audit(r, "Status changed", "status", from, r.status, action === "cancel" ? "warn" : "primary");
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

export { lineCredit };
