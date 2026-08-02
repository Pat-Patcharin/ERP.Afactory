"use client";

import { useState } from "react";
import { fmt, money, stamp, today } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import {
  COUNTS,
  COUNT_CANCEL_REASONS,
  COUNT_EXCEPTION_TYPES,
  COUNT_REJECT_REASONS,
  COUNT_SEVERITY,
  RECOUNT_REASONS,
  ROOT_CAUSES,
  type CntLine,
  type Count,
} from "@/data/counts";
import {
  ADJUSTMENTS,
  nextAdjustmentCode,
  type AdjLine,
  type Adjustment,
} from "@/data/adjustments";
import {
  adjustableLines,
  approvalIssues,
  countedQty,
  decorateCounts,
  needsRecount,
  packageTotal,
  rawCount,
  submitIssues,
  varianceQty,
  type CntRow,
} from "./domain/count";
import { decorateAdjustments } from "./domain/adjustment";
import { invalidateMovements } from "./domain/movement";

/* ============================================================
   CYCLE COUNT WORKFLOWS

   Draft → Planned → Assigned → In Progress → Count Submitted
        → Variance Review → Approved → Adjustment Created → Completed
        (or → Recount Required → Recount Submitted → …)

   The count never writes a balance. The only thing that leaves this
   module is a Stock Adjustment draft built from approved variance
   lines, and even that has to be posted in its own module before a
   quantity moves.
   ============================================================ */

const USER = "Admin";
const num = (v: unknown) => Number(v) || 0;

function log(c: Count, title: string, detail: string, kind = "primary", u = USER) {
  (c.history ??= []).unshift({ t: title, d: detail, u, when: stamp(), kind });
}

function audit(
  c: Count,
  event: string,
  field: string,
  from: string,
  to: string,
  kind = "primary",
) {
  (c.audit ??= []).unshift({ event, user: USER, when: stamp(), field, from, to, kind });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decorateCounts();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

const setStatus = (c: Count, to: string, event: string, kind = "primary") => {
  audit(c, event, "Status", c.status, to, kind);
  c.status = to;
  c.updated = stamp();
  c.updatedBy = USER;
};

/* ---------- Modal fields ---------- */

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
 * The count entry grid. Package maths is offered alongside the flat number,
 * and the system quantity stays hidden while the count is blind.
 */
function CountGrid({
  lines,
  blind,
  recount,
  onChange,
}: {
  lines: CntLine[];
  blind: boolean;
  recount?: boolean;
  onChange: (values: Record<number, number>) => void;
}) {
  const [values, setValues] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.line, recount ? (l.recount ?? countedQty(l) ?? 0) : (l.firstCount ?? 0)]),
    ),
  );
  const [pack, setPack] = useState<Record<number, { p: number; u: number; l: number }>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.line,
        { p: num(l.packages), u: num(l.unitsPerPackage), l: num(l.looseUnits) },
      ]),
    ),
  );

  const publish = (next: Record<number, number>) => {
    setValues(next);
    onChange(next);
  };

  const setQty = (line: number, raw: string) =>
    publish({ ...values, [line]: Math.max(0, num(raw)) });

  const setPackPart = (line: number, key: "p" | "u" | "l", raw: string) => {
    const nextPack = { ...pack, [line]: { ...pack[line], [key]: Math.max(0, num(raw)) } };
    setPack(nextPack);
    const v = nextPack[line];
    const total = packageTotal({ packages: v.p, unitsPerPackage: v.u, looseUnits: v.l });
    if (total > 0) publish({ ...values, [line]: total });
  };

  return (
    <div className="overflow-x-auto rounded-btn border border-line">
      <table className="w-full text-body">
        <thead>
          <tr className="bg-surface">
            {["สินค้า", "ตำแหน่ง", "Lot"].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-cap font-semibold text-ink-2">
                {h}
              </th>
            ))}
            {!blind && (
              <th className="px-3 py-2 text-right text-cap font-semibold text-ink-2">ยอดระบบ</th>
            )}
            <th className="px-3 py-2 text-center text-cap font-semibold text-ink-2">
              หีบ × ต่อหีบ + เศษ
            </th>
            <th className="px-3 py-2 text-right text-cap font-semibold text-ink-2">
              {recount ? "นับซ้ำ" : "นับได้"}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line} className="border-t border-line">
              <td className="px-3 py-2">
                <span className="flex flex-col">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-cap text-ink-3">{l.code}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-cap text-ink-2">
                {[l.zone, l.rack, l.bin].filter(Boolean).join("-") || "—"}
              </td>
              <td className="px-3 py-2 text-cap text-ink-2">{l.lot || "—"}</td>
              {!blind && <td className="px-3 py-2 text-right tnum">{fmt(l.systemQty)}</td>}
              <td className="px-3 py-2">
                <span className="flex items-center justify-center gap-1">
                  {(["p", "u", "l"] as const).map((k, i) => (
                    <span key={k} className="flex items-center gap-1">
                      {i > 0 && <span className="text-ink-3">{i === 1 ? "×" : "+"}</span>}
                      <input
                        type="number"
                        min={0}
                        value={pack[l.line][k]}
                        onChange={(e) => setPackPart(l.line, k, e.target.value)}
                        className="h-9 w-16 rounded-btn border border-line bg-card px-2 text-right tnum outline-none focus:border-primary"
                      />
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  min={0}
                  value={values[l.line]}
                  onChange={(e) => setQty(l.line, e.target.value)}
                  className="h-9 w-24 rounded-btn border border-line bg-card px-2 text-right tnum font-semibold outline-none focus:border-primary"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Planning and assignment ---------- */

export function cntAssign(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let counter = "";
  let supervisor = "";

  ctx.formModal({
    title: `มอบหมายผู้ตรวจนับ ${c.code}`,
    body: () => (
      <div className="flex flex-col gap-4">
        <PickField
          label="ผู้ตรวจนับหลัก"
          options={["Warin S.", "Nattapong K.", "Suda R."]}
          onPick={(v) => (counter = v)}
          required
        />
        <PickField
          label="ผู้ตรวจสอบ"
          options={["Patcharin T.", "Somchai B."]}
          onPick={(v) => (supervisor = v)}
          initial={c.supervisor}
        />
        <p className="text-cap text-ink-3">
          ผู้ตรวจนับจะอนุมัติงานของตัวเองไม่ได้ตามหลักการแบ่งแยกหน้าที่
        </p>
      </div>
    ),
    confirmText: "มอบหมาย",
    onConfirm: () => {
      if (!counter) {
        ctx.toast("ต้องเลือกผู้ตรวจนับ", undefined, "danger");
        return false;
      }
      if (supervisor && supervisor === counter) {
        ctx.toast(
          "แบ่งแยกหน้าที่ไม่ผ่าน",
          "ผู้ตรวจนับและผู้ตรวจสอบต้องเป็นคนละคน",
          "danger",
        );
        return false;
      }
      audit(c, "Assigned", "Counter", c.counter || "—", counter);
      c.counter = counter;
      if (supervisor) c.supervisor = supervisor;
      c.assignedAt = stamp();
      if (c.status === "Draft" || c.status === "Planned") setStatus(c, "Assigned", "Assigned");
      log(c, "Assigned", `มอบหมายให้ ${counter} · ผู้ตรวจสอบ ${c.supervisor}`, "info");
      commit(ctx, "มอบหมายแล้ว", `${c.code} → ${counter}`, "info");
    },
  });
}

export function cntPlan(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  setStatus(c, "Planned", "Planned");
  log(c, "Planned", "ยืนยันแผนตรวจนับ", "info");
  commit(ctx, "วางแผนแล้ว", `${c.code} พร้อมมอบหมายผู้ตรวจนับ`, "info");
}

export function cntStart(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  if (!c.counter) {
    ctx.toast("ยังไม่มีผู้ตรวจนับ", "ต้องมอบหมายผู้ตรวจนับก่อนเริ่ม", "danger");
    return;
  }

  ctx.confirm({
    title: "เริ่มการตรวจนับ",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {c.code} · {rec.whLabel} · {rec.scopeLabel}
        </span>
        <span className="text-cap text-ink-2">
          ระบบจะบันทึกยอดคงเหลือ ณ เวลานี้เป็น Snapshot — ความเคลื่อนไหวหลังจากนี้จะถูกแจ้งเตือน
        </span>
      </span>
    ),
    confirmText: "เริ่มตรวจนับ",
    onConfirm: () => {
      c.snapshotAt = stamp();
      c.startedAt = stamp();
      setStatus(c, "In Progress", "Count started");
      log(c, "Snapshot taken", `บันทึกยอดระบบ ณ ${c.snapshotAt}`, "info", "system");
      log(c, "Count started", `เริ่มตรวจนับโดย ${c.counter}`, "primary");
      commit(ctx, "เริ่มตรวจนับแล้ว", `${c.code} · บันทึก Snapshot แล้ว`, "info");
    },
  });
}

export function cntPause(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let reason = "";

  ctx.formModal({
    title: "หยุดการตรวจนับชั่วคราว",
    body: () => (
      <TextField label="เหตุผล" placeholder="เช่น รอเปิดพื้นที่จัดเก็บ" onChange={(v) => (reason = v)} />
    ),
    confirmText: "หยุดชั่วคราว",
    onConfirm: () => {
      if (!reason.trim()) {
        ctx.toast("ต้องระบุเหตุผล", undefined, "danger");
        return false;
      }
      setStatus(c, "Paused", "Paused", "warn");
      log(c, "Paused", reason, "warn");
      commit(ctx, "หยุดชั่วคราวแล้ว", `${c.code} — ${reason}`, "warning");
    },
  });
}

/* ---------- Count entry ---------- */

export function cntEnter(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  if (!rec.canEnterCounts) {
    ctx.toast("ยังบันทึกผลนับไม่ได้", `สถานะ ${c.status} ไม่อยู่ในขั้นตอนการนับ`, "info");
    return;
  }

  const recounting = c.status === "Recount Required";
  const lines = recounting ? c.lines.filter(needsRecount) : c.lines;
  if (!lines.length) {
    ctx.toast("ไม่มีรายการให้บันทึก", undefined, "info");
    return;
  }

  let values: Record<number, number> = Object.fromEntries(
    lines.map((l) => [l.line, recounting ? (l.recount ?? countedQty(l) ?? 0) : (l.firstCount ?? 0)]),
  );

  ctx.formModal({
    title: `${recounting ? "บันทึกผลนับซ้ำ" : "บันทึกผลตรวจนับ"} ${c.code}`,
    width: "wide",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          {rec.blind && !recounting
            ? "การนับแบบปิดตา — ยอดระบบจะถูกซ่อนจนกว่าจะส่งผลนับ"
            : "กรอกจำนวนที่นับได้จริง หรือใช้ช่องหีบ × ต่อหีบ + เศษ"}
        </p>
        <CountGrid
          lines={lines}
          blind={rec.blind && !recounting}
          recount={recounting}
          onChange={(v) => (values = v)}
        />
      </div>
    ),
    confirmText: recounting ? "บันทึกผลนับซ้ำ" : "บันทึกผลนับ",
    onConfirm: () => {
      if (Object.values(values).some((v) => v < 0)) {
        ctx.toast("จำนวนไม่ถูกต้อง", "จำนวนที่นับได้ต้องไม่ติดลบ", "danger");
        return false;
      }

      for (const l of lines) {
        const v = values[l.line];
        if (v === undefined) continue;
        if (recounting) {
          l.recount = v;
          l.finalCount = v;
        } else {
          /* A submitted first count is never overwritten — a recount uses its
             own field, which is what keeps both rounds on the record. */
          l.firstCount = v;
          l.finalCount = v;
        }
        l.counter = c.counter || USER;
        l.countTime = stamp();
      }

      if (recounting) {
        c.round = 2;
        setStatus(c, "Recount Submitted", "Recount entered", "warn");
        log(c, "Recount entered", `บันทึกผลนับซ้ำ ${lines.length} บรรทัด`, "warn");
      } else {
        log(c, "Count entered", `บันทึกผลนับ ${lines.length} บรรทัด`, "primary");
      }
      commit(ctx, "บันทึกผลนับแล้ว", `${c.code} · ${lines.length} บรรทัด`, "success");
    },
  });
}

export function cntMarkEmpty(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  const open = c.lines.filter((l) => countedQty(l) === null);
  if (!open.length) {
    ctx.toast("นับครบแล้ว", "ทุกบรรทัดมีผลนับแล้ว", "info");
    return;
  }

  ctx.confirm({
    title: "ระบุว่าไม่พบสินค้า",
    message: `บันทึก ${open.length} บรรทัดที่ยังไม่ได้นับเป็นจำนวน 0 (ไม่พบสินค้าที่ตำแหน่ง)`,
    tone: "danger",
    confirmText: "บันทึกเป็น 0",
    onConfirm: () => {
      for (const l of open) {
        l.firstCount = 0;
        l.finalCount = 0;
        l.counter = c.counter || USER;
        l.countTime = stamp();
        l.note = l.note || "ไม่พบสินค้าที่ตำแหน่งนี้";
      }
      log(c, "Marked empty", `บันทึก ${open.length} บรรทัดเป็นไม่พบสินค้า`, "warn");
      commit(ctx, "บันทึกแล้ว", `${open.length} บรรทัด`, "warning");
    },
  });
}

export function cntSubmit(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;

  const issues = submitIssues(c);
  if (issues.length) {
    ctx.toast("ยังส่งผลนับไม่ได้", `${issues.length} รายการต้องแก้ไข: ${issues[0].message}`, "danger");
    return;
  }

  ctx.confirm({
    title: "ส่งผลการตรวจนับ",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {c.code} · นับแล้ว {rec.acc.countedLines} จาก {rec.acc.totalLines} บรรทัด
        </span>
        <span className="text-cap text-ink-2">
          ตรงกัน {rec.acc.matchingLines} · ต่าง {rec.acc.varianceLines} · ความแม่นยำ{" "}
          {rec.acc.lineAccuracy}%
        </span>
        {rec.blind && (
          <span className="text-cap text-ink-2">
            หลังส่งผลนับ ยอดระบบและส่วนต่างจะถูกเปิดเผยให้ผู้ตรวจสอบ
          </span>
        )}
      </span>
    ),
    confirmText: "ส่งผลนับ",
    onConfirm: () => {
      c.submittedAt = stamp();
      const hasVariance = rec.acc.varianceLines > 0;
      setStatus(c, hasVariance ? "Variance Review" : "Count Submitted", "Count submitted");
      log(
        c,
        "Count submitted",
        `ส่งผลนับ ${rec.acc.countedLines} บรรทัด · ส่วนต่าง ${rec.acc.varianceLines} บรรทัด`,
        "primary",
      );
      if (!hasVariance) {
        setStatus(c, "Completed", "No variance");
        log(c, "Completed", "ไม่มีส่วนต่าง ปิดงานตรวจนับ", "primary");
      }
      commit(
        ctx,
        "ส่งผลนับแล้ว",
        hasVariance ? `${c.code} · รอตรวจสอบส่วนต่าง` : `${c.code} · ไม่มีส่วนต่าง`,
        "success",
      );
    },
  });
}

/* ---------- Variance review ---------- */

export function cntSetRootCause(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  const open = c.lines.filter((l) => countedQty(l) !== null && varianceQty(l) !== 0 && !l.rootCause);
  if (!open.length) {
    ctx.toast("ระบุสาเหตุครบแล้ว", undefined, "info");
    return;
  }
  let cause = "";

  ctx.formModal({
    title: "ระบุสาเหตุของส่วนต่าง",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          ใช้กับ {open.length} บรรทัดที่ยังไม่ได้ระบุสาเหตุ
        </p>
        <PickField label="สาเหตุ" options={ROOT_CAUSES} onPick={(v) => (cause = v)} required />
      </div>
    ),
    confirmText: "บันทึกสาเหตุ",
    onConfirm: () => {
      if (!cause) {
        ctx.toast("ต้องเลือกสาเหตุ", undefined, "danger");
        return false;
      }
      for (const l of open) l.rootCause = cause;
      log(c, "Root cause recorded", `${cause} · ${open.length} บรรทัด`, "info");
      commit(ctx, "บันทึกสาเหตุแล้ว", `${open.length} บรรทัด — ${cause}`, "info");
    },
  });
}

export function cntRequestRecount(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let reason = "";
  let counter = "";

  const target = c.lines.filter((l) => varianceQty(l) !== 0 && countedQty(l) !== null);
  if (!target.length) {
    ctx.toast("ไม่มีบรรทัดที่ต้องนับซ้ำ", "ทุกบรรทัดตรงกับระบบแล้ว", "info");
    return;
  }

  ctx.formModal({
    title: "ขอให้นับซ้ำ",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          นับซ้ำ {target.length} บรรทัดที่มีส่วนต่าง — ผลนับครั้งแรกจะถูกเก็บไว้
        </p>
        <PickField label="เหตุผล" options={RECOUNT_REASONS} onPick={(v) => (reason = v)} required />
        <PickField
          label="ผู้นับซ้ำ (ควรเป็นคนละคนกับผู้นับเดิม)"
          options={["Warin S.", "Nattapong K.", "Suda R."].filter((n) => n !== c.counter)}
          onPick={(v) => (counter = v)}
        />
      </div>
    ),
    confirmText: "ขอให้นับซ้ำ",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การขอให้นับซ้ำต้องมีเหตุผลกำกับ", "danger");
        return false;
      }
      c.recountReason = reason;
      c.round = 2;
      if (counter) {
        c.secondaryCounter = counter;
        audit(c, "Recount assigned", "Recount Counter", c.counter, counter);
      }
      for (const l of target) l.reviewStatus = "Recount Requested";
      setStatus(c, "Recount Required", "Recount requested", "warn");
      log(
        c,
        "Recount requested",
        `${reason} · ${target.length} บรรทัด${counter ? ` · ผู้นับซ้ำ ${counter}` : ""}`,
        "warn",
      );
      commit(ctx, "ขอให้นับซ้ำแล้ว", `${c.code} · ${target.length} บรรทัด`, "warning");
    },
  });
}

export function cntAcceptVariance(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  const open = c.lines.filter((l) => countedQty(l) !== null && varianceQty(l) !== 0);
  if (!open.length) {
    ctx.toast("ไม่มีส่วนต่างให้ยอมรับ", undefined, "info");
    return;
  }
  let cause = "";

  ctx.formModal({
    title: "ยอมรับส่วนต่าง",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          ยอมรับส่วนต่าง {open.length} บรรทัด — ต้องระบุสาเหตุก่อนอนุมัติ
        </p>
        <PickField label="สาเหตุ" options={ROOT_CAUSES} onPick={(v) => (cause = v)} required />
      </div>
    ),
    confirmText: "ยอมรับส่วนต่าง",
    onConfirm: () => {
      if (!cause) {
        ctx.toast("ต้องระบุสาเหตุ", "การยอมรับส่วนต่างต้องมีสาเหตุกำกับ", "danger");
        return false;
      }
      for (const l of open) {
        l.rootCause = l.rootCause || cause;
        l.reviewStatus = "Accepted";
      }
      log(c, "Variance accepted", `${cause} · ${open.length} บรรทัด`, "info");
      commit(ctx, "ยอมรับส่วนต่างแล้ว", `${open.length} บรรทัด`, "info");
    },
  });
}

/* ---------- Approval ---------- */

export function cntApprove(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;

  const issues = approvalIssues(c);
  if (issues.length) {
    ctx.toast("ยังอนุมัติไม่ได้", issues[0].message, "danger");
    return;
  }
  if (c.counter === USER) {
    ctx.toast(
      "แบ่งแยกหน้าที่ไม่ผ่าน",
      "ผู้ตรวจนับอนุมัติงานของตัวเองไม่ได้",
      "danger",
    );
    return;
  }

  ctx.confirm({
    title: "อนุมัติผลการตรวจนับ",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {c.code} · ความแม่นยำ {rec.acc.lineAccuracy}% · ส่วนต่าง {rec.acc.varianceLines} บรรทัด
        </span>
        <span className="text-cap text-ink-2">
          สุทธิ {rec.acc.netVariance >= 0 ? "+" : ""}
          {fmt(rec.acc.netVariance)} หน่วย · มูลค่า {money(rec.acc.varianceValue)}
        </span>
        {rec.approvalReasons.length > 0 && (
          <span className="text-cap text-ink-2">
            เหตุที่ต้องอนุมัติ: {rec.approvalReasons.join(" · ")}
          </span>
        )}
      </span>
    ),
    confirmText: "อนุมัติ",
    onConfirm: () => {
      c.approvalStatus = "Approved";
      c.approvedBy = USER;
      c.approvedAt = stamp();
      c.reviewedAt = stamp();

      const hasVariance = rec.acc.varianceLines > 0;
      setStatus(c, hasVariance ? "Approved" : "Completed", "Approved");
      log(
        c,
        "Approved",
        hasVariance ? "อนุมัติผลนับ พร้อมสร้างใบปรับปรุงสต๊อก" : "อนุมัติผลนับ ไม่มีส่วนต่าง",
        "primary",
      );
      commit(
        ctx,
        "อนุมัติแล้ว",
        hasVariance ? `${c.code} · พร้อมสร้างใบปรับปรุง` : `${c.code} · ปิดงานแล้ว`,
      );
    },
  });
}

export function cntReject(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let reason = "";

  ctx.formModal({
    title: "ไม่อนุมัติผลการตรวจนับ",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ระบุเหตุผลที่ไม่อนุมัติ {c.code}</p>
        <PickField label="เหตุผล" options={COUNT_REJECT_REASONS} onPick={(v) => (reason = v)} required />
      </div>
    ),
    confirmText: "ไม่อนุมัติ",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การไม่อนุมัติต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      c.approvalStatus = "Rejected";
      c.rejectReason = reason;
      setStatus(c, "Rejected", "Rejected", "danger");
      log(c, "Rejected", reason, "danger");
      commit(ctx, "ไม่อนุมัติแล้ว", `${c.code} — ${reason}`, "danger");
    },
  });
}

export function cntRequestRevision(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let note = "";

  ctx.formModal({
    title: "ขอให้แก้ไขผลการตรวจนับ",
    body: () => (
      <TextField
        label="สิ่งที่ต้องแก้ไข"
        placeholder="เช่น ระบุสาเหตุของส่วนต่างให้ครบ"
        onChange={(v) => (note = v)}
      />
    ),
    confirmText: "ขอให้แก้ไข",
    onConfirm: () => {
      if (!note.trim()) {
        ctx.toast("ต้องระบุสิ่งที่ต้องแก้ไข", undefined, "danger");
        return false;
      }
      c.approvalStatus = "Revision Requested";
      c.rejectReason = note;
      setStatus(c, "Revision Requested", "Revision requested", "warn");
      log(c, "Revision requested", note, "warn");
      commit(ctx, "ส่งกลับให้แก้ไข", `${c.code} — ${note}`, "warning");
    },
  });
}

/* ---------- Stock Adjustment handoff ---------- */

/** The adjustment action a variance line becomes. */
function actionFor(v: ReturnType<typeof adjustableLines>[number]): string {
  if (v.type === "Serial Mismatch") return "Correct Serial";
  if (v.type === "Lot Mismatch") return "Correct Lot";
  if (v.type === "Location Mismatch") return "Correct Location";
  if (v.type === "Status Mismatch") return "Change Stock Status";
  return v.variance > 0 ? "Increase Quantity" : "Decrease Quantity";
}

export function cntCreateAdjustment(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;

  /* One count produces one adjustment — never two for the same variance. */
  if (c.adjustmentRef) {
    ctx.toast(
      "สร้างใบปรับปรุงไปแล้ว",
      `${c.code} เชื่อมกับ ${c.adjustmentRef} อยู่แล้ว`,
      "info",
    );
    return;
  }
  if (c.approvalStatus !== "Approved") {
    ctx.toast("ยังไม่ได้รับอนุมัติ", "ต้องอนุมัติผลนับก่อนสร้างใบปรับปรุง", "danger");
    return;
  }

  const lines = adjustableLines(c);
  if (!lines.length) {
    ctx.toast("ไม่มีส่วนต่างให้ปรับปรุง", "ทุกบรรทัดตรงกับระบบหรือถูกยกเว้นไว้", "info");
    return;
  }

  const positive = lines.filter((v) => v.variance > 0).length;
  const negative = lines.filter((v) => v.variance < 0).length;

  ctx.confirm({
    title: "สร้างใบปรับปรุงสต๊อก",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          สร้างใบปรับปรุงจาก {lines.length} บรรทัดที่มีส่วนต่าง (เพิ่ม {positive} · ลด {negative})
        </span>
        <span className="text-cap text-ink-2">
          ใบปรับปรุงจะถูกสร้างเป็นร่าง — สต๊อกจะเปลี่ยนก็ต่อเมื่อบันทึกใบปรับปรุงนั้นแล้ว
        </span>
      </span>
    ),
    confirmText: "สร้างใบปรับปรุง",
    onConfirm: () => {
      const code = nextAdjustmentCode();
      const gain = lines.some((v) => v.variance > 0);

      const items: AdjLine[] = lines.map((v, i) => {
        const l = v.line;
        return {
          line: i + 1,
          code: l.code,
          name: l.name,
          unit: l.unit,
          cat: l.cat,
          action: actionFor(v),
          qty: Math.abs(v.variance),
          statusFrom: l.stockStatus,
          statusTo: l.stockStatus,
          locFrom: [l.zone, l.rack, l.bin].filter(Boolean).join("-"),
          locTo: "",
          lot: l.lot,
          lotTo: "",
          exp: l.exp,
          expTo: "",
          serials: (l.serials ?? []).filter((s) => !s.scanned).map((s) => s.serial),
          serialsTo: [],
          unitCost: l.unitCost,
          reason: gain ? "Cycle Count Gain" : "Cycle Count Loss",
          note: `นับได้ ${countedQty(l)} · ระบบ ${l.systemQty} · ส่วนต่าง ${v.variance} · ${l.rootCause || "ไม่ระบุสาเหตุ"}`,
        };
      });

      const adjustment: Adjustment = {
        code,
        adjDate: today(),
        type: "Cycle Count Variance",
        reason: gain ? "Cycle Count Gain" : "Cycle Count Loss",
        reasonGroup: gain ? "Positive" : "Negative",
        priority: rec.highRiskLines > 0 ? "High" : "Normal",
        status: "Draft",
        approvalStatus: "Not Submitted",

        requestedBy: USER,
        reviewer: c.supervisor,
        approvedBy: "",
        approvedDate: "",
        postedBy: "",
        postedDate: "",
        rejectReason: "",
        cancelReason: "",
        reversalReason: "",
        reversalOf: "",
        reversedBy: "",

        refType: "Cycle Count",
        refDoc: c.code,
        description: `ปรับปรุงตามผลตรวจนับ ${c.code} · ${lines.length} บรรทัด`,

        warehouse: c.warehouse,
        zone: c.zone,
        rack: c.rack,
        shelf: c.shelf,
        bin: c.bin,
        branch: c.warehouse === "WH-CNX" ? "Chiang Mai" : "Bangkok",

        items,
        /* The count's evidence travels with the adjustment. */
        evidence: (c.evidence ?? []).map((e) => ({ ...e, size: "1.0 MB" })),
        exceptions: [],

        history: [
          {
            t: "Created from Cycle Count",
            d: `สร้างจากผลตรวจนับ ${c.code}`,
            u: USER,
            when: stamp(),
            kind: "primary",
          },
        ],
        audit: [
          {
            event: "Created from Cycle Count",
            user: USER,
            when: stamp(),
            field: "Source Document",
            from: "—",
            to: c.code,
            kind: "primary",
          },
        ],

        created: stamp(),
        createdBy: USER,
        updated: stamp(),
        updatedBy: USER,
      };

      ADJUSTMENTS.unshift(adjustment);
      decorateAdjustments();
      invalidateMovements();

      c.adjustmentRef = code;
      c.adjustmentStatus = "Adjustment Created";
      setStatus(c, "Adjustment Created", "Adjustment created");
      log(
        c,
        "Adjustment created",
        `สร้าง ${code} จาก ${lines.length} บรรทัดที่มีส่วนต่าง`,
        "primary",
      );

      commit(ctx, "สร้างใบปรับปรุงแล้ว", `${code} · รอบันทึกในโมดูล Stock Adjustment`);
      ctx.goto(`/m/stock-adjustment/${code}`);
    },
  });
}

/* ---------- Exceptions, cancel, reopen ---------- */

export function cntException(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let type = "";
  let severity = "";
  let description = "";

  ctx.formModal({
    title: "บันทึกปัญหาการตรวจนับ",
    body: () => (
      <div className="flex flex-col gap-4">
        <PickField label="ประเภทปัญหา" options={COUNT_EXCEPTION_TYPES} onPick={(v) => (type = v)} required />
        <PickField label="ระดับความรุนแรง" options={COUNT_SEVERITY} onPick={(v) => (severity = v)} required />
        <TextField label="รายละเอียด" placeholder="อธิบายสิ่งที่พบ" onChange={(v) => (description = v)} />
      </div>
    ),
    confirmText: "บันทึกปัญหา",
    onConfirm: () => {
      if (!type || !severity || !description.trim()) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุประเภท ระดับความรุนแรง และรายละเอียด", "danger");
        return false;
      }
      (c.exceptions ??= []).unshift({
        code: `CEX-2026-${String(COUNTS.length + 200).padStart(6, "0")}`,
        type,
        severity,
        product: c.lines[0]?.code ?? "",
        location: rec.scopeLabel,
        expected: c.lines[0]?.systemQty ?? 0,
        actual: countedQty(c.lines[0]) ?? 0,
        description,
        responsible: "Warehouse",
        resolution: "",
        followUp: today(),
        status: "Open",
      });
      if (severity === "Critical" || severity === "High")
        setStatus(c, "Exception", "Exception raised", "danger");
      log(c, "Exception raised", `${type} · ${description}`, "danger");
      commit(ctx, "บันทึกปัญหาแล้ว", `${c.code} — ${type}`, "warning");
    },
  });
}

export function cntCloseException(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  const open = (c.exceptions ?? []).filter((e) => e.status !== "Closed");
  if (!open.length) {
    ctx.toast("ไม่มีปัญหาค้างอยู่", undefined, "info");
    return;
  }

  ctx.confirm({
    title: "ปิดปัญหา",
    message: `ปิดปัญหาที่ค้างอยู่ ${open.length} รายการของ ${c.code}`,
    confirmText: "ปิดปัญหา",
    onConfirm: () => {
      for (const e of open) {
        e.status = "Closed";
        e.resolution ||= "ตรวจสอบแล้วและปิดเรื่อง";
      }
      if (c.status === "Exception") setStatus(c, "Variance Review", "Exception closed");
      log(c, "Exception closed", `ปิด ${open.length} รายการ`, "primary");
      commit(ctx, "ปิดปัญหาแล้ว", c.code);
    },
  });
}

export function cntMovementDecision(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c || !(c.movements ?? []).length) {
    ctx.toast("ไม่มีการเคลื่อนไหวระหว่างการนับ", undefined, "info");
    return;
  }
  let decision = "";

  ctx.formModal({
    title: "การเคลื่อนไหวระหว่างการตรวจนับ",
    body: () => (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-btn border border-line">
          <table className="w-full text-body">
            <thead>
              <tr className="bg-surface">
                {["เวลา", "ประเภท", "เอกสาร", "จำนวน", "ผู้ทำรายการ"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-cap font-semibold text-ink-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(c.movements ?? []).map((m) => (
                <tr key={m.doc + m.when} className="border-t border-line">
                  <td className="px-3 py-2 text-cap">{m.when}</td>
                  <td className="px-3 py-2">{m.type}</td>
                  <td className="px-3 py-2 font-medium">{m.doc}</td>
                  <td className="px-3 py-2 tnum">{fmt(m.qty)}</td>
                  <td className="px-3 py-2 text-cap text-ink-2">{m.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PickField
          label="การตัดสินใจ"
          options={[
            "ใช้ยอดจาก Snapshot",
            "ปรับยอดระบบให้เป็นปัจจุบัน",
            "หยุดการนับชั่วคราว",
            "ส่งให้ผู้ตรวจสอบพิจารณา",
          ]}
          onPick={(v) => (decision = v)}
          required
        />
      </div>
    ),
    confirmText: "บันทึกการตัดสินใจ",
    onConfirm: () => {
      if (!decision) {
        ctx.toast("ต้องเลือกการตัดสินใจ", undefined, "danger");
        return false;
      }
      for (const m of c.movements ?? []) m.decision = decision;
      audit(c, "Movement decision", "Decision", "ยังไม่ได้ตัดสินใจ", decision, "warn");
      log(c, "Movement decision", decision, "warn");
      if (decision === "หยุดการนับชั่วคราว") setStatus(c, "Paused", "Paused", "warn");
      commit(ctx, "บันทึกการตัดสินใจแล้ว", decision, "info");
    },
  });
}

export function cntCancel(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  let reason = "";

  ctx.formModal({
    title: "ยกเลิกแผนตรวจนับ",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          {c.code} จะถูกยกเลิกแต่ยังคงอยู่ในระบบ ประวัติการตรวจนับจะไม่ถูกลบ
        </p>
        <PickField label="เหตุผลการยกเลิก" options={COUNT_CANCEL_REASONS} onPick={(v) => (reason = v)} required />
      </div>
    ),
    confirmText: "ยกเลิกแผน",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การยกเลิกต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      c.cancelReason = reason;
      setStatus(c, "Cancelled", "Cancelled", "warn");
      log(c, "Cancelled", reason, "danger");
      commit(ctx, "ยกเลิกแล้ว", `${c.code} — ${reason}`, "warning");
    },
  });
}

export function cntReopen(rec: CntRow, ctx: ActionCtx) {
  const c = rawCount(rec.code);
  if (!c) return;
  if (c.adjustmentRef) {
    ctx.toast(
      "เปิดใหม่ไม่ได้",
      `สร้างใบปรับปรุง ${c.adjustmentRef} ไปแล้ว ต้องยกเลิกหรือกลับรายการใบนั้นก่อน`,
      "danger",
    );
    return;
  }
  let reason = "";

  ctx.formModal({
    title: "เปิดการตรวจนับใหม่",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          เปิด {c.code} กลับเป็นสถานะแก้ไขได้ — ผลนับเดิมจะยังคงอยู่
        </p>
        <TextField label="เหตุผลการเปิดใหม่" placeholder="เช่น พบเอกสารที่ยังไม่ได้บันทึก" onChange={(v) => (reason = v)} />
      </div>
    ),
    confirmText: "เปิดใหม่",
    onConfirm: () => {
      if (!reason.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "การเปิดใหม่ต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      c.reopenReason = reason;
      c.approvalStatus = "Revision Requested";
      setStatus(c, "Revision Requested", "Reopened", "warn");
      log(c, "Reopened", reason, "warn");
      commit(ctx, "เปิดใหม่แล้ว", `${c.code} — ${reason}`, "warning");
    },
  });
}

export function cntPrint(rec: CntRow, ctx: ActionCtx) {
  const blind = rec.blind && !rec.systemVisible;
  ctx.toast(
    blind ? "พิมพ์ใบนับแบบปิดตา" : "พิมพ์ใบนับ",
    blind
      ? `${rec.code} — ไม่แสดงยอดระบบและส่วนต่าง · Future support`
      : `${rec.code} — Future support`,
    "info",
  );
}

/* ---------- Bulk ---------- */

export function cntBulk(rows: CntRow[], ctx: ActionCtx) {
  const assignable = rows.filter((r) => r.canAssign);
  const startable = rows.filter((r) => r.canStart);
  const pausable = rows.filter((r) => r.canPause);
  const submittable = rows.filter((r) => r.canSubmit);
  const cancellable = rows.filter((r) => r.status === "Draft");

  return [
    {
      label: `มอบหมายผู้ตรวจนับ (${assignable.length})`,
      icon: "user" as const,
      run: () => {
        if (!assignable.length) {
          ctx.toast("ไม่มีแผนที่มอบหมายได้", "เลือกแผนสถานะ Draft, Planned หรือ Assigned", "info");
          return;
        }
        let who = "";
        ctx.formModal({
          title: "มอบหมายผู้ตรวจนับ",
          body: () => (
            <PickField
              label="ผู้ตรวจนับ"
              options={["Warin S.", "Nattapong K.", "Suda R."]}
              onPick={(v) => (who = v)}
              required
            />
          ),
          confirmText: "มอบหมาย",
          onConfirm: () => {
            if (!who) {
              ctx.toast("ต้องเลือกผู้ตรวจนับ", undefined, "danger");
              return false;
            }
            for (const r of assignable) {
              const c = rawCount(r.code)!;
              if (c.supervisor === who) continue;
              c.counter = who;
              c.assignedAt = stamp();
              if (["Draft", "Planned"].includes(c.status)) setStatus(c, "Assigned", "Assigned");
              log(c, "Assigned", `มอบหมายแบบกลุ่มให้ ${who}`, "info");
            }
            commit(ctx, "มอบหมายแล้ว", `${assignable.length} แผน → ${who}`, "info");
          },
        });
      },
    },
    {
      label: `เริ่มตรวจนับ (${startable.length})`,
      icon: "play" as const,
      run: () => {
        if (!startable.length) {
          ctx.toast("ไม่มีแผนที่เริ่มได้", "ต้องมอบหมายผู้ตรวจนับก่อน", "info");
          return;
        }
        for (const r of startable) {
          const c = rawCount(r.code)!;
          c.snapshotAt = stamp();
          c.startedAt = stamp();
          setStatus(c, "In Progress", "Count started");
          log(c, "Count started", "เริ่มตรวจนับแบบกลุ่ม", "primary");
        }
        commit(ctx, "เริ่มตรวจนับแล้ว", `${startable.length} แผน`, "info");
      },
    },
    {
      label: `หยุดชั่วคราว (${pausable.length})`,
      icon: "clock" as const,
      run: () => {
        if (!pausable.length) {
          ctx.toast("ไม่มีแผนที่กำลังนับอยู่", undefined, "info");
          return;
        }
        for (const r of pausable) {
          const c = rawCount(r.code)!;
          setStatus(c, "Paused", "Paused", "warn");
          log(c, "Paused", "หยุดชั่วคราวแบบกลุ่ม", "warn");
        }
        commit(ctx, "หยุดชั่วคราวแล้ว", `${pausable.length} แผน`, "warning");
      },
    },
    {
      label: `ส่งผลนับ (${submittable.length})`,
      icon: "send" as const,
      run: () => {
        if (!submittable.length) {
          ctx.toast("ไม่มีแผนที่ส่งได้", "ต้องนับครบทุกบรรทัดก่อน", "info");
          return;
        }
        for (const r of submittable) {
          const c = rawCount(r.code)!;
          if (submitIssues(c).length) continue;
          c.submittedAt = stamp();
          setStatus(
            c,
            r.acc.varianceLines > 0 ? "Variance Review" : "Completed",
            "Count submitted",
          );
          log(c, "Count submitted", "ส่งผลนับแบบกลุ่ม", "primary");
        }
        commit(ctx, "ส่งผลนับแล้ว", `${submittable.length} แผน`, "success");
      },
    },
    {
      label: `ส่งออกที่เลือก (${rows.length})`,
      icon: "upload" as const,
      run: () => ctx.toast("ส่งออกแผนที่เลือก", `${rows.length} แผน — Future support`, "info"),
    },
    {
      label: `ยกเลิกแผนร่าง (${cancellable.length})`,
      icon: "xCircle" as const,
      danger: true,
      run: () => {
        if (!cancellable.length) {
          ctx.toast("ไม่มีแผนร่างที่เลือก", "ยกเลิกได้เฉพาะสถานะ Draft", "info");
          return;
        }
        ctx.confirm({
          title: "ยกเลิกแผนร่าง",
          message: `ยกเลิก ${cancellable.length} แผน — เอกสารจะยังคงอยู่ในระบบ`,
          tone: "danger",
          confirmText: "ยกเลิก",
          onConfirm: () => {
            for (const r of cancellable) {
              const c = rawCount(r.code)!;
              c.cancelReason = "ยกเลิกแบบกลุ่ม";
              setStatus(c, "Cancelled", "Cancelled", "warn");
              log(c, "Cancelled", "ยกเลิกแบบกลุ่ม", "danger");
            }
            commit(ctx, "ยกเลิกแล้ว", `${cancellable.length} แผน`, "warning");
          },
        });
      },
    },
  ];
}
