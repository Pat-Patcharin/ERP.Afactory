"use client";

import { actingUserName } from "./domain/admin";
import { useState } from "react";
import { fmt, stamp, today } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import {
  TRANSFERS,
  TRF_CANCEL_REASONS,
  TRF_EXCEPTION_TYPES,
  TRF_REJECT_REASONS,
  TRF_SEVERITY,
  nextTransferCode,
  type Transfer,
  type TrfLine,
} from "@/data/transfers";
import {
  blockingIssues,
  decorateTransfers,
  destinationWarnings,
  lineRemainingDispatch,
  lineRemainingReceipt,
  rawTransfer,
  type TrfRow,
} from "./domain/transfer";
import { invalidateMovements } from "./domain/movement";

/* ============================================================
   STOCK TRANSFER WORKFLOWS

   Draft → Pending Approval → Approved → Ready to Transfer
        → Posted / Completed              (direct)
        → Dispatched → In Transit → Partially Received
        → Received → Completed            (two-step)

   Nothing here edits a balance by hand. A transfer moves quantity
   between locations and statuses; the Stock Card ledger is rebuilt
   from the documents afterwards, so a posted transfer shows up as
   Transfer Out / Transfer In without anyone writing a movement row.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();
const num = (v: unknown) => Number(v) || 0;

function log(t: Transfer, title: string, detail: string, kind = "primary", u = USER()) {
  (t.history ??= []).unshift({ t: title, d: detail, u, when: stamp(), kind });
}

function audit(
  t: Transfer,
  event: string,
  field: string,
  from: string,
  to: string,
  kind = "primary",
) {
  (t.audit ??= []).unshift({ event, user: USER(), when: stamp(), field, from, to, kind });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decorateTransfers();
  /* The ledger reads the transfer documents — rebuild it so Stock Card
     shows the movement this action just created. */
  invalidateMovements();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

const setStatus = (t: Transfer, to: string, event: string, kind = "primary") => {
  audit(t, event, "Status", t.status, to, kind);
  t.status = to;
  t.updated = stamp();
  t.updatedBy = USER();
};

/* ---------- Shared modal fields ---------- */

/** Select that keeps its own state — an uncontrolled one never shows a value. */
function PickField({
  label,
  options,
  onPick,
  required,
  initial = "",
}: {
  label: string;
  options: readonly string[];
  onPick: (v: string) => void;
  required?: boolean;
  /** Prefilled answer for the common case; still required, still editable. */
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const invalid = required && touched && !value;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-cap font-medium text-ink-2">
        {label}
        {required && <span className="font-semibold text-danger"> *</span>}
      </span>
      <select
        value={value}
        onBlur={() => setTouched(true)}
        onChange={(e) => {
          setValue(e.target.value);
          setTouched(true);
          onPick(e.target.value);
        }}
        className={cn(
          "h-10 rounded-btn border bg-card px-3 text-body outline-none",
          invalid ? "border-danger" : "border-line focus:border-primary",
        )}
      >
        <option value="">— เลือก —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {invalid && <span className="text-cap text-danger">กรุณาเลือก{label}</span>}
    </label>
  );
}

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

/**
 * Per-line quantity grid used by both dispatch and receipt. `cap` decides how
 * much a line may still take, and the input can never be pushed past it.
 */
function QtyGrid({
  lines,
  cap,
  extra,
  onChange,
}: {
  lines: TrfLine[];
  cap: (l: TrfLine) => number;
  extra?: boolean;
  onChange: (
    values: Record<number, { qty: number; short: number; damaged: number }>,
  ) => void;
}) {
  const [values, setValues] = useState<
    Record<number, { qty: number; short: number; damaged: number }>
  >(() =>
    Object.fromEntries(
      lines.map((l) => [l.line, { qty: cap(l), short: 0, damaged: 0 }]),
    ),
  );

  const update = (line: number, key: "qty" | "short" | "damaged", raw: string, max: number) => {
    const v = Math.max(0, Math.min(max, num(raw)));
    const next = { ...values, [line]: { ...values[line], [key]: v } };
    setValues(next);
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-btn border border-line">
      <table className="w-full text-body">
        <thead>
          <tr className="bg-surface">
            <th className="px-3 py-2 text-left text-cap font-semibold text-ink-2">สินค้า</th>
            <th className="px-3 py-2 text-right text-cap font-semibold text-ink-2">คงเหลือ</th>
            <th className="px-3 py-2 text-right text-cap font-semibold text-ink-2">
              {extra ? "รับเข้า" : "จ่ายออก"}
            </th>
            {extra && (
              <>
                <th className="px-3 py-2 text-right text-cap font-semibold text-ink-2">ขาด</th>
                <th className="px-3 py-2 text-right text-cap font-semibold text-ink-2">เสียหาย</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const max = cap(l);
            const v = values[l.line];
            return (
              <tr key={l.line} className="border-t border-line">
                <td className="px-3 py-2">
                  <span className="flex flex-col">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-cap text-ink-3">
                      {l.code}
                      {l.lot ? ` · ${l.lot}` : ""}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right tnum text-ink-2">{fmt(max)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={v.qty}
                    onChange={(e) => update(l.line, "qty", e.target.value, max)}
                    className="h-9 w-24 rounded-btn border border-line bg-card px-2 text-right tnum outline-none focus:border-primary"
                  />
                </td>
                {extra && (
                  <>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={max}
                        value={v.short}
                        onChange={(e) => update(l.line, "short", e.target.value, max)}
                        className="h-9 w-20 rounded-btn border border-line bg-card px-2 text-right tnum outline-none focus:border-primary"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={max}
                        value={v.damaged}
                        onChange={(e) => update(l.line, "damaged", e.target.value, max)}
                        className="h-9 w-20 rounded-btn border border-line bg-card px-2 text-right tnum outline-none focus:border-primary"
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Default cell values: take everything still outstanding on each line. */
const seedQty = (lines: TrfLine[], cap: (l: TrfLine) => number) =>
  Object.fromEntries(
    lines.map((l) => [l.line, { qty: cap(l), short: 0, damaged: 0 }]),
  ) as Record<number, { qty: number; short: number; damaged: number }>;

/* ---------- Approval ---------- */

export function trfSubmit(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;

  const issues = blockingIssues(t);
  if (issues.length) {
    ctx.toast(
      "ยังส่งขออนุมัติไม่ได้",
      `${issues.length} รายการต้องแก้ไข: ${issues[0].message}`,
      "danger",
    );
    return;
  }

  const warnings = destinationWarnings(t);

  ctx.confirm({
    title: "ส่งขออนุมัติใบโอนย้าย",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          ส่ง {t.code} จำนวน {fmt(rec.requestedQty)} หน่วย เพื่อขออนุมัติ
        </span>
        {rec.approvalReasons.length > 0 && (
          <span className="text-cap text-ink-2">
            ต้องอนุมัติเพราะ: {rec.approvalReasons.join(" · ")}
          </span>
        )}
        {warnings.map((w) => (
          <span key={w} className="text-cap text-warning">
            ⚠ {w}
          </span>
        ))}
      </span>
    ),
    confirmText: "ส่งขออนุมัติ",
    onConfirm: () => {
      if (!rec.needsApproval) {
        t.approvalStatus = "Not Required";
        setStatus(t, "Ready to Transfer", "Submitted");
        log(t, "Ready to Transfer", "ไม่เข้าเงื่อนไขขออนุมัติ พร้อมโอนย้ายทันที", "primary");
        commit(ctx, "พร้อมโอนย้าย", `${t.code} ไม่ต้องขออนุมัติ`);
        return;
      }
      t.approvalStatus = "Pending Approval";
      setStatus(t, "Pending Approval", "Submitted", "info");
      log(t, "Submitted", `ส่งขออนุมัติ · ${rec.approvalReasons.join(" · ")}`, "info");
      commit(ctx, "ส่งขออนุมัติแล้ว", `${t.code} รอผู้มีอำนาจอนุมัติ`, "info");
    },
  });
}

export function trfApprove(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;

  ctx.confirm({
    title: "อนุมัติใบโอนย้าย",
    message: `อนุมัติ ${t.code} · ${rec.srcLabel} → ${rec.dstLabel} จำนวน ${fmt(rec.requestedQty)} หน่วย`,
    confirmText: "อนุมัติ",
    onConfirm: () => {
      t.approvalStatus = "Approved";
      t.approvedBy = USER();
      t.approvedDate = stamp();
      setStatus(t, "Approved", "Approved");
      log(t, "Approved", "อนุมัติใบโอนย้าย", "primary");
      commit(ctx, "อนุมัติแล้ว", `${t.code} พร้อมดำเนินการต่อ`);
    },
  });
}

export function trfReject(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  let reason = "";

  ctx.formModal({
    title: "ไม่อนุมัติใบโอนย้าย",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ระบุเหตุผลที่ไม่อนุมัติ {t.code}</p>
        <PickField label="เหตุผล" options={TRF_REJECT_REASONS} onPick={(v) => (reason = v)} required />
      </div>
    ),
    confirmText: "ไม่อนุมัติ",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การไม่อนุมัติต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      t.approvalStatus = "Rejected";
      t.rejectReason = reason;
      setStatus(t, "Rejected", "Rejected", "danger");
      log(t, "Rejected", reason, "danger");
      commit(ctx, "ไม่อนุมัติแล้ว", `${t.code} — ${reason}`, "danger");
    },
  });
}

export function trfRequestRevision(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  let note = "";

  ctx.formModal({
    title: "ขอให้แก้ไขใบโอนย้าย",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ส่ง {t.code} กลับให้ผู้ร้องขอแก้ไข</p>
        <TextField label="สิ่งที่ต้องแก้ไข" placeholder="เช่น ระบุบินปลายทางให้ชัดเจน" onChange={(v) => (note = v)} />
      </div>
    ),
    confirmText: "ขอให้แก้ไข",
    onConfirm: () => {
      if (!note.trim()) {
        ctx.toast("ต้องระบุสิ่งที่ต้องแก้ไข", "ผู้ร้องขอต้องรู้ว่าต้องแก้อะไร", "danger");
        return false;
      }
      t.approvalStatus = "Revision Requested";
      t.rejectReason = note;
      setStatus(t, "Revision Requested", "Revision requested", "warn");
      log(t, "Revision requested", note, "warn");
      commit(ctx, "ส่งกลับให้แก้ไข", `${t.code} — ${note}`, "warning");
    },
  });
}

export function trfMarkReady(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  setStatus(t, "Ready to Transfer", "Marked ready");
  log(t, "Ready to Transfer", "พร้อมจ่ายออก", "info");
  commit(ctx, "พร้อมโอนย้าย", `${t.code} พร้อมดำเนินการ`, "info");
}

export function trfAssign(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  let who = "";

  ctx.formModal({
    title: "มอบหมายผู้ดำเนินการ",
    body: () => (
      <div className="flex flex-col gap-4">
        <PickField
          label="ผู้รับผิดชอบ"
          options={["Warin S.", "Nattapong K.", "Suda R.", "Somchai B."]}
          onPick={(v) => (who = v)}
          required
        />
      </div>
    ),
    confirmText: "มอบหมาย",
    onConfirm: () => {
      if (!who) {
        ctx.toast("ต้องเลือกผู้รับผิดชอบ", undefined, "danger");
        return false;
      }
      audit(t, "Assigned", "Assigned To", t.assignedTo || "—", who);
      t.assignedTo = who;
      log(t, "Assigned", `มอบหมายให้ ${who}`, "info");
      commit(ctx, "มอบหมายแล้ว", `${t.code} → ${who}`, "info");
    },
  });
}

/* ---------- Direct transfer ---------- */

export function trfPost(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;

  const issues = blockingIssues(t);
  if (issues.length) {
    ctx.toast("โอนย้ายไม่ได้", issues[0].message, "danger");
    return;
  }

  ctx.confirm({
    title: "โอนย้ายทันที",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {rec.srcLabel} {rec.srcLocation} → {rec.dstLabel} {rec.dstLocation}
        </span>
        <span className="text-cap text-ink-2">
          ระบบจะสร้างรายการ Transfer Out และ Transfer In ที่หักล้างกันใน Stock Card
        </span>
      </span>
    ),
    confirmText: "โอนย้าย",
    onConfirm: () => {
      for (const l of t.items) {
        l.dispatched = num(l.requested);
        l.received = num(l.requested);
      }
      setStatus(t, "Completed", "Posted");
      log(
        t,
        "Posted",
        `โอนย้ายสำเร็จ ${fmt(rec.requestedQty)} หน่วย · สร้าง Transfer Out / Transfer In`,
        "primary",
      );
      commit(ctx, "โอนย้ายสำเร็จ", `${t.code} · บันทึกลง Stock Card แล้ว`);
    },
  });
}

/* ---------- Two-step: dispatch ---------- */

export function trfDispatch(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;

  const open = t.items.filter((l) => lineRemainingDispatch(l) > 0);
  if (!open.length) {
    ctx.toast("จ่ายออกครบแล้ว", "ไม่มีรายการที่ยังค้างจ่ายออก", "info");
    return;
  }

  /* The grid opens prefilled with the full remainder — seed the same values
     here so confirming without touching a cell still works. */
  let qty = seedQty(open, lineRemainingDispatch);
  let seal = "";
  let vehicle = "";

  ctx.formModal({
    title: `จ่ายออก ${t.code}`,
    width: "wide",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          จ่ายออกจาก {rec.srcLabel} {rec.srcLocation} — สต๊อกต้นทางจะลดลงและเข้าสู่สถานะ In Transit
        </p>
        <QtyGrid lines={open} cap={lineRemainingDispatch} onChange={(v) => (qty = v)} />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <TextField label="ทะเบียนรถ" placeholder="1กก-2345" onChange={(v) => (vehicle = v)} />
          <TextField label="หมายเลขซีล" placeholder="SEAL-000000" onChange={(v) => (seal = v)} />
        </div>
      </div>
    ),
    confirmText: "ยืนยันจ่ายออก",
    onConfirm: () => {
      const total = Object.values(qty).reduce((s, v) => s + v.qty, 0);
      if (total <= 0) {
        ctx.toast("ต้องระบุจำนวน", "จำนวนจ่ายออกต้องมากกว่า 0", "danger");
        return false;
      }

      const code = `TRD-2026-${String(TRANSFERS.length + 200).padStart(6, "0")}`;
      const lines: { line: number; qty: number }[] = [];
      for (const l of open) {
        const v = qty[l.line]?.qty ?? 0;
        if (v <= 0) continue;
        l.dispatched = num(l.dispatched) + v;
        lines.push({ line: l.line, qty: v });
      }

      (t.dispatches ??= []).unshift({
        code,
        date: today(),
        by: USER(),
        qty: total,
        packages: Math.max(1, Math.ceil(total / 20)),
        vehicle,
        driver: "",
        seal,
        note: "",
        lines,
      });

      const stillOpen = t.items.some((l) => lineRemainingDispatch(l) > 0);
      setStatus(t, stillOpen ? "Partially Dispatched" : "In Transit", "Dispatched", "warn");
      log(
        t,
        stillOpen ? "Partially dispatched" : "Dispatched",
        `จ่ายออก ${fmt(total)} หน่วย · ${code}${seal ? ` · ซีล ${seal}` : ""}`,
        "warn",
      );
      commit(
        ctx,
        stillOpen ? "จ่ายออกบางส่วนแล้ว" : "จ่ายออกแล้ว",
        `${t.code} · ${fmt(total)} หน่วยอยู่ระหว่างขนส่ง`,
        "info",
      );
    },
  });
}

/* ---------- Two-step: receipt ---------- */

export function trfReceive(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;

  const open = t.items.filter((l) => lineRemainingReceipt(l) > 0);
  if (!open.length) {
    ctx.toast("รับเข้าครบแล้ว", "ไม่มีรายการที่ยังค้างรับเข้า", "info");
    return;
  }

  let qty = seedQty(open, lineRemainingReceipt);
  let condition = "Good";
  let reference = "";

  ctx.formModal({
    title: `รับเข้า ${t.code}`,
    width: "wide",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          รับเข้าที่ {rec.dstLabel} {rec.dstLocation} — สต๊อก In Transit จะลดลงและสต๊อกปลายทางเพิ่มขึ้น
        </p>
        <QtyGrid lines={open} cap={lineRemainingReceipt} extra onChange={(v) => (qty = v)} />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <PickField
            label="สภาพหีบห่อ"
            options={["Good", "Damaged", "Partially Damaged"]}
            onPick={(v) => (condition = v)}
            initial="Good"
            required
          />
          <TextField label="เลขที่ใบส่งของ" placeholder="DN-0000-0000" onChange={(v) => (reference = v)} />
        </div>
      </div>
    ),
    confirmText: "ยืนยันรับเข้า",
    onConfirm: () => {
      if (!condition) {
        ctx.toast("ต้องระบุสภาพหีบห่อ", undefined, "danger");
        return false;
      }

      let total = 0;
      let short = 0;
      let damaged = 0;
      const lines: { line: number; qty: number; short: number; damaged: number }[] = [];

      for (const l of open) {
        const v = qty[l.line] ?? { qty: 0, short: 0, damaged: 0 };
        const cap = lineRemainingReceipt(l);
        if (v.qty + v.short + v.damaged > cap) {
          ctx.toast(
            "จำนวนเกินที่จ่ายออก",
            `บรรทัด ${l.line}: รับเข้า + ขาด + เสียหาย ต้องไม่เกิน ${cap}`,
            "danger",
          );
          return false;
        }
        if (v.qty + v.short + v.damaged === 0) continue;
        l.received = num(l.received) + v.qty;
        l.short = num(l.short) + v.short;
        l.damaged = num(l.damaged) + v.damaged;
        total += v.qty;
        short += v.short;
        damaged += v.damaged;
        lines.push({ line: l.line, qty: v.qty, short: v.short, damaged: v.damaged });
      }

      if (!lines.length) {
        ctx.toast("ต้องระบุจำนวน", "จำนวนรับเข้าต้องมากกว่า 0", "danger");
        return false;
      }

      const code = `TRR-2026-${String(TRANSFERS.length + 200).padStart(6, "0")}`;
      (t.receipts ??= []).unshift({
        code,
        dispatchRef: t.dispatches?.[0]?.code ?? "",
        date: today(),
        by: USER(),
        qty: total,
        short,
        damaged,
        condition,
        seal: condition === "Good" ? "Intact" : "Broken",
        reference,
        note: "",
        lines,
      });

      if (short || damaged) {
        (t.exceptions ??= []).unshift({
          code: `TRX-2026-${String(TRANSFERS.length + 200).padStart(6, "0")}`,
          type: damaged ? "Damaged Product" : "Short Quantity",
          severity: damaged ? "High" : "Medium",
          expected: total + short + damaged,
          actual: total,
          description: `รับเข้า ${fmt(total)} · ขาด ${fmt(short)} · เสียหาย ${fmt(damaged)}`,
          responsible: "Carrier",
          resolution: "รอผลตรวจสอบ",
          followUp: today(),
          status: "Open",
        });
        log(t, "Exception raised", `ขาด ${fmt(short)} · เสียหาย ${fmt(damaged)}`, "danger");
      }

      const stillOpen = t.items.some((l) => lineRemainingReceipt(l) > 0);
      const next = stillOpen ? "Partially Received" : short || damaged ? "Exception" : "Completed";
      setStatus(t, next, "Received", stillOpen ? "warn" : "primary");
      log(t, next, `รับเข้า ${fmt(total)} หน่วย · ${code}`, stillOpen ? "warn" : "primary");
      commit(
        ctx,
        stillOpen ? "รับเข้าบางส่วนแล้ว" : "รับเข้าครบแล้ว",
        `${t.code} · ${fmt(total)} หน่วยเข้าสู่ ${rec.dstLabel}`,
        short || damaged ? "warning" : "success",
      );
    },
  });
}

/* ---------- Exceptions ---------- */

export function trfException(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  let type = "";
  let severity = "";
  let description = "";

  ctx.formModal({
    title: "บันทึกปัญหาการโอนย้าย",
    body: () => (
      <div className="flex flex-col gap-4">
        <PickField label="ประเภทปัญหา" options={TRF_EXCEPTION_TYPES} onPick={(v) => (type = v)} required />
        <PickField label="ระดับความรุนแรง" options={TRF_SEVERITY} onPick={(v) => (severity = v)} required />
        <TextField label="รายละเอียด" placeholder="อธิบายสิ่งที่พบ" onChange={(v) => (description = v)} />
      </div>
    ),
    confirmText: "บันทึกปัญหา",
    onConfirm: () => {
      if (!type || !severity || !description.trim()) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุประเภท ระดับความรุนแรง และรายละเอียด", "danger");
        return false;
      }
      (t.exceptions ??= []).unshift({
        code: `TRX-2026-${String(TRANSFERS.length + 300).padStart(6, "0")}`,
        type,
        severity,
        expected: rec.dispatchedQty,
        actual: rec.receivedQty,
        description,
        responsible: "Unknown",
        resolution: "",
        followUp: today(),
        status: "Open",
      });
      if (severity === "Critical" || severity === "High") setStatus(t, "Exception", "Exception raised", "danger");
      log(t, "Exception raised", `${type} · ${description}`, "danger");
      commit(ctx, "บันทึกปัญหาแล้ว", `${t.code} — ${type}`, "warning");
    },
  });
}

export function trfCloseException(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  const open = (t.exceptions ?? []).filter((e) => e.status !== "Closed");
  if (!open.length) {
    ctx.toast("ไม่มีปัญหาค้างอยู่", undefined, "info");
    return;
  }

  ctx.confirm({
    title: "ปิดปัญหาการโอนย้าย",
    message: `ปิดปัญหาที่ค้างอยู่ ${open.length} รายการของ ${t.code}`,
    confirmText: "ปิดปัญหา",
    onConfirm: () => {
      for (const e of open) {
        e.status = "Closed";
        e.resolution ||= "ยอมรับส่วนต่างและปิดเรื่อง";
      }
      if (t.status === "Exception") setStatus(t, "Closed", "Exception closed");
      log(t, "Exception closed", `ปิด ${open.length} รายการ`, "primary");
      commit(ctx, "ปิดปัญหาแล้ว", t.code);
    },
  });
}

/* ---------- Cancel and reverse ---------- */

export function trfCancel(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  let reason = "";

  ctx.formModal({
    title: "ยกเลิกใบโอนย้าย",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          {t.code} จะถูกยกเลิกแต่ยังคงอยู่ในระบบ เอกสารที่ยกเลิกแล้วจะไม่ถูกลบ
        </p>
        <PickField label="เหตุผลการยกเลิก" options={TRF_CANCEL_REASONS} onPick={(v) => (reason = v)} required />
      </div>
    ),
    confirmText: "ยกเลิกใบโอนย้าย",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การยกเลิกต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      t.cancelReason = reason;
      setStatus(t, "Cancelled", "Cancelled", "warn");
      log(t, "Cancelled", reason, "danger");
      commit(ctx, "ยกเลิกแล้ว", `${t.code} — ${reason}`, "warning");
    },
  });
}

export function trfReverse(rec: TrfRow, ctx: ActionCtx) {
  const t = rawTransfer(rec.code);
  if (!t) return;
  let reason = "";

  ctx.formModal({
    title: "กลับรายการโอนย้าย",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          ระบบจะสร้างใบโอนย้ายใหม่ที่สลับต้นทางกับปลายทาง {rec.dstLabel} → {rec.srcLabel} จำนวน{" "}
          {fmt(rec.receivedQty || rec.requestedQty)} หน่วย เอกสารเดิมจะไม่ถูกแก้ไข
        </p>
        <TextField label="เหตุผลการกลับรายการ" placeholder="เช่น ระบุปลายทางผิด" onChange={(v) => (reason = v)} />
      </div>
    ),
    confirmText: "กลับรายการ",
    onConfirm: () => {
      if (!reason.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "การกลับรายการต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }

      const code = nextTransferCode();
      const qtyOf = (l: TrfLine) => num(l.received) || num(l.requested);

      const reversal: Transfer = {
        ...t,
        code,
        transferDate: today(),
        status: "Completed",
        approvalStatus: "Approved",
        approvedBy: USER(),
        approvedDate: stamp(),
        reason: `กลับรายการของ ${t.code}: ${reason}`,
        reference: t.code,
        reversalOf: t.code,
        reversedBy: "",
        reversalReason: reason,
        cancelReason: "",
        rejectReason: "",

        srcWarehouse: t.dstWarehouse,
        srcZone: t.dstZone,
        srcRack: t.dstRack,
        srcShelf: t.dstShelf,
        srcBin: t.dstBin,
        srcStatus: t.dstStatus,
        srcBranch: t.dstBranch,

        dstWarehouse: t.srcWarehouse,
        dstZone: t.srcZone,
        dstRack: t.srcRack,
        dstShelf: t.srcShelf,
        dstBin: t.srcBin,
        dstStatus: t.srcStatus,
        dstBranch: t.srcBranch,

        items: t.items.map((l) => ({
          ...l,
          dispatched: qtyOf(l),
          received: qtyOf(l),
          requested: qtyOf(l),
          short: 0,
          damaged: 0,
        })),
        dispatches: [],
        receipts: [],
        exceptions: [],
        history: [
          {
            t: "Reversal posted",
            d: `กลับรายการของ ${t.code} — ${reason}`,
            u: USER(),
            when: stamp(),
            kind: "danger",
          },
        ],
        audit: [
          {
            event: "Reversal posted",
            user: USER(),
            when: stamp(),
            field: "Reversal Of",
            from: "—",
            to: t.code,
            kind: "danger",
          },
        ],
        created: stamp(),
        createdBy: USER(),
        updated: stamp(),
        updatedBy: USER(),
      };

      TRANSFERS.unshift(reversal);
      t.reversedBy = code;
      t.reversalReason = reason;
      setStatus(t, "Reversed", "Reversed", "danger");
      log(t, "Reversed", `กลับรายการด้วย ${code} — ${reason}`, "danger");

      commit(ctx, "กลับรายการแล้ว", `สร้าง ${code} · ${rec.dstLabel} → ${rec.srcLabel}`, "warning");
      ctx.goto(`/m/stock-transfer/${code}`);
    },
  });
}

/* ---------- Bulk ---------- */

export function trfBulk(rows: TrfRow[], ctx: ActionCtx) {
  const drafts = rows.filter((r) => r.canSubmit);
  const approved = rows.filter((r) => r.status === "Approved");
  const cancellable = rows.filter((r) => r.status === "Draft");

  return [
    {
      label: `ส่งขออนุมัติ (${drafts.length})`,
      icon: "send" as const,
      run: () => {
        if (!drafts.length) {
          ctx.toast("ไม่มีรายการที่ส่งได้", "เลือกใบโอนย้ายสถานะ Draft", "info");
          return;
        }
        for (const r of drafts) {
          const t = rawTransfer(r.code)!;
          if (blockingIssues(t).length) continue;
          t.approvalStatus = r.needsApproval ? "Pending Approval" : "Not Required";
          setStatus(t, r.needsApproval ? "Pending Approval" : "Ready to Transfer", "Submitted", "info");
          log(t, "Submitted", "ส่งขออนุมัติแบบกลุ่ม", "info");
        }
        commit(ctx, "ส่งขออนุมัติแล้ว", `${drafts.length} ใบ`, "info");
      },
    },
    {
      label: `มอบหมายผู้ดำเนินการ (${rows.length})`,
      icon: "user" as const,
      run: () => {
        let who = "";
        ctx.formModal({
          title: "มอบหมายผู้ดำเนินการ",
          body: () => (
            <PickField
              label="ผู้รับผิดชอบ"
              options={["Warin S.", "Nattapong K.", "Suda R."]}
              onPick={(v) => (who = v)}
              required
            />
          ),
          confirmText: "มอบหมาย",
          onConfirm: () => {
            if (!who) {
              ctx.toast("ต้องเลือกผู้รับผิดชอบ", undefined, "danger");
              return false;
            }
            for (const r of rows) {
              const t = rawTransfer(r.code)!;
              t.assignedTo = who;
              log(t, "Assigned", `มอบหมายให้ ${who}`, "info");
            }
            commit(ctx, "มอบหมายแล้ว", `${rows.length} ใบ → ${who}`, "info");
          },
        });
      },
    },
    {
      label: `ทำเครื่องหมายพร้อมโอน (${approved.length})`,
      icon: "checkCircle" as const,
      run: () => {
        if (!approved.length) {
          ctx.toast("ไม่มีรายการที่พร้อม", "เลือกใบโอนย้ายที่อนุมัติแล้ว", "info");
          return;
        }
        for (const r of approved) {
          const t = rawTransfer(r.code)!;
          setStatus(t, "Ready to Transfer", "Marked ready");
          log(t, "Ready to Transfer", "พร้อมจ่ายออก", "info");
        }
        commit(ctx, "พร้อมโอนย้าย", `${approved.length} ใบ`, "info");
      },
    },
    {
      label: `ส่งออกที่เลือก (${rows.length})`,
      icon: "upload" as const,
      run: () => ctx.toast("ส่งออกรายการที่เลือก", `${rows.length} ใบ — Future support`, "info"),
    },
    {
      label: `ยกเลิกใบร่าง (${cancellable.length})`,
      icon: "xCircle" as const,
      danger: true,
      run: () => {
        if (!cancellable.length) {
          ctx.toast("ไม่มีใบร่างที่เลือก", "ยกเลิกได้เฉพาะสถานะ Draft", "info");
          return;
        }
        ctx.confirm({
          title: "ยกเลิกใบร่าง",
          message: `ยกเลิก ${cancellable.length} ใบ — เอกสารจะยังคงอยู่ในระบบ`,
          tone: "danger",
          confirmText: "ยกเลิก",
          onConfirm: () => {
            for (const r of cancellable) {
              const t = rawTransfer(r.code)!;
              t.cancelReason = "ยกเลิกแบบกลุ่ม";
              setStatus(t, "Cancelled", "Cancelled", "warn");
              log(t, "Cancelled", "ยกเลิกแบบกลุ่ม", "danger");
            }
            commit(ctx, "ยกเลิกแล้ว", `${cancellable.length} ใบ`, "warning");
          },
        });
      },
    },
  ];
}
