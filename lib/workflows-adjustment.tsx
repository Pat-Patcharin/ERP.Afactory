"use client";

import { actingUserName } from "./domain/admin";
import { useState } from "react";
import { fmt, money, stamp, today } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import {
  ADJUSTMENTS,
  ADJ_CANCEL_REASONS,
  ADJ_EVIDENCE_TYPES,
  ADJ_EXCEPTION_TYPES,
  ADJ_REJECT_REASONS,
  ADJ_SEVERITY,
  nextAdjustmentCode,
  type Adjustment,
} from "@/data/adjustments";
import {
  blockingIssues,
  decorateAdjustments,
  isDecrease,
  isIncrease,
  isStatusChange,
  rawAdjustment,
  stockImpact,
  type AdjRow,
} from "./domain/adjustment";
import { invalidateMovements } from "./domain/movement";

/* ============================================================
   STOCK ADJUSTMENT WORKFLOWS

   Draft → Pending Approval → Approved → Ready to Post → Posted

   Posting is the only step that changes anything, and it is gated
   on approval, evidence and a confirmation checklist. A posted
   adjustment is immutable: the correction for a mistake is a
   reversal document, never an edit.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();

function log(a: Adjustment, title: string, detail: string, kind = "primary", u = USER()) {
  (a.history ??= []).unshift({ t: title, d: detail, u, when: stamp(), kind });
}

function audit(
  a: Adjustment,
  event: string,
  field: string,
  from: string,
  to: string,
  kind = "primary",
) {
  (a.audit ??= []).unshift({ event, user: USER(), when: stamp(), field, from, to, kind });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decorateAdjustments();
  /* The ledger reads posted adjustments — rebuild it so Stock Card agrees. */
  invalidateMovements();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

const setStatus = (a: Adjustment, to: string, event: string, kind = "primary") => {
  audit(a, event, "Status", a.status, to, kind);
  a.status = to;
  a.updated = stamp();
  a.updatedBy = USER();
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

/** Posting checklist — every box must be ticked before the document commits. */
function Checklist({
  items,
  onChange,
}: {
  items: string[];
  onChange: (allChecked: boolean) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (item: string) => {
    const next = { ...checked, [item]: !checked[item] };
    setChecked(next);
    onChange(items.every((i) => next[i]));
  };

  return (
    <div className="flex flex-col gap-1 rounded-btn border border-line p-3">
      {items.map((item) => (
        <label
          key={item}
          className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-body hover:bg-surface"
        >
          <input
            type="checkbox"
            checked={Boolean(checked[item])}
            onChange={() => toggle(item)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          {item}
        </label>
      ))}
    </div>
  );
}

/* ---------- Approval ---------- */

export function adjSubmit(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;

  const issues = blockingIssues(a);
  if (issues.length) {
    ctx.toast("ยังส่งขออนุมัติไม่ได้", `${issues.length} รายการต้องแก้ไข: ${issues[0].message}`, "danger");
    return;
  }

  ctx.confirm({
    title: "ส่งขออนุมัติใบปรับปรุงสต๊อก",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {a.code} · {a.reason} · สุทธิ {rec.netQty >= 0 ? "+" : ""}
          {fmt(rec.netQty)} หน่วย
        </span>
        {rec.approvalReasons.length > 0 && (
          <span className="text-cap text-ink-2">
            ต้องอนุมัติเพราะ: {rec.approvalReasons.join(" · ")}
          </span>
        )}
        {rec.negativeRisk && (
          <span className="text-cap text-danger">⚠ ผลลัพธ์จะทำให้สต๊อกติดลบ</span>
        )}
      </span>
    ),
    confirmText: "ส่งขออนุมัติ",
    onConfirm: () => {
      if (!rec.needsApproval) {
        a.approvalStatus = "Not Required";
        setStatus(a, "Ready to Post", "Submitted");
        log(a, "Ready to Post", "ไม่เข้าเงื่อนไขขออนุมัติ พร้อมบันทึกได้ทันที", "primary");
        commit(ctx, "พร้อมบันทึก", `${a.code} ไม่ต้องขออนุมัติ`);
        return;
      }
      a.approvalStatus = "Pending Approval";
      setStatus(a, "Pending Approval", "Submitted", "info");
      log(a, "Submitted", `ส่งขออนุมัติ · ${rec.approvalReasons.join(" · ")}`, "info");
      commit(ctx, "ส่งขออนุมัติแล้ว", `${a.code} รอผู้มีอำนาจอนุมัติ`, "info");
    },
  });
}

export function adjApprove(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;

  ctx.confirm({
    title: "อนุมัติใบปรับปรุงสต๊อก",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {a.code} · {a.type} · {a.reason}
        </span>
        <span className="text-cap text-ink-2">
          เข้า {fmt(rec.qtyIn)} · ออก {fmt(rec.qtyOut)} · เปลี่ยนสถานะ {fmt(rec.statusQty)} ·
          มูลค่า {money(rec.valueImpact)}
        </span>
      </span>
    ),
    confirmText: "อนุมัติ",
    onConfirm: () => {
      a.approvalStatus = "Approved";
      a.approvedBy = USER();
      a.approvedDate = stamp();
      setStatus(a, "Approved", "Approved");
      log(a, "Approved", "อนุมัติใบปรับปรุงสต๊อก", "primary");
      commit(ctx, "อนุมัติแล้ว", `${a.code} พร้อมบันทึกเข้าสต๊อก`);
    },
  });
}

export function adjReject(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let reason = "";

  ctx.formModal({
    title: "ไม่อนุมัติใบปรับปรุงสต๊อก",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ระบุเหตุผลที่ไม่อนุมัติ {a.code}</p>
        <PickField label="เหตุผล" options={ADJ_REJECT_REASONS} onPick={(v) => (reason = v)} required />
      </div>
    ),
    confirmText: "ไม่อนุมัติ",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การไม่อนุมัติต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      a.approvalStatus = "Rejected";
      a.rejectReason = reason;
      setStatus(a, "Rejected", "Rejected", "danger");
      log(a, "Rejected", reason, "danger");
      commit(ctx, "ไม่อนุมัติแล้ว", `${a.code} — ${reason}`, "danger");
    },
  });
}

export function adjRequestRevision(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let note = "";

  ctx.formModal({
    title: "ขอให้แก้ไขใบปรับปรุงสต๊อก",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">ส่ง {a.code} กลับให้ผู้ร้องขอแก้ไข</p>
        <TextField
          label="สิ่งที่ต้องแก้ไข"
          placeholder="เช่น แนบรูปฉลากวันหมดอายุเพิ่ม"
          onChange={(v) => (note = v)}
        />
      </div>
    ),
    confirmText: "ขอให้แก้ไข",
    onConfirm: () => {
      if (!note.trim()) {
        ctx.toast("ต้องระบุสิ่งที่ต้องแก้ไข", "ผู้ร้องขอต้องรู้ว่าต้องแก้อะไร", "danger");
        return false;
      }
      a.approvalStatus = "Revision Requested";
      a.rejectReason = note;
      setStatus(a, "Revision Requested", "Revision requested", "warn");
      log(a, "Revision requested", note, "warn");
      commit(ctx, "ส่งกลับให้แก้ไข", `${a.code} — ${note}`, "warning");
    },
  });
}

export function adjAssign(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let who = "";

  ctx.formModal({
    title: "มอบหมายผู้ตรวจสอบ",
    body: () => (
      <PickField
        label="ผู้ตรวจสอบ"
        options={["Patcharin T.", "Suda R.", "Somchai B."]}
        onPick={(v) => (who = v)}
        required
      />
    ),
    confirmText: "มอบหมาย",
    onConfirm: () => {
      if (!who) {
        ctx.toast("ต้องเลือกผู้ตรวจสอบ", undefined, "danger");
        return false;
      }
      audit(a, "Reviewer assigned", "Reviewer", a.reviewer || "—", who);
      a.reviewer = who;
      log(a, "Reviewer assigned", `มอบหมายให้ ${who}`, "info");
      commit(ctx, "มอบหมายแล้ว", `${a.code} → ${who}`, "info");
    },
  });
}

/* ---------- Evidence ---------- */

export function adjAddEvidence(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let name = "";
  let type = "";

  ctx.formModal({
    title: "แนบหลักฐาน",
    body: () => (
      <div className="flex flex-col gap-4">
        <div className="grid place-items-center gap-2 rounded-btn border border-dashed border-line-strong bg-surface px-4 py-8 text-center">
          <span className="text-body font-medium">ลากไฟล์มาวางที่นี่</span>
          <span className="text-cap text-ink-3">
            รองรับรูปถ่าย PDF และ Excel — การอัปโหลดจริงจะเปิดใช้งานพร้อมระบบจัดเก็บเอกสาร
          </span>
        </div>
        <TextField label="ชื่อไฟล์" placeholder="damage-a01.jpg" onChange={(v) => (name = v)} />
        <PickField label="ประเภทหลักฐาน" options={ADJ_EVIDENCE_TYPES} onPick={(v) => (type = v)} required />
      </div>
    ),
    confirmText: "แนบหลักฐาน",
    onConfirm: () => {
      if (!name.trim() || !type) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุชื่อไฟล์และประเภทหลักฐาน", "danger");
        return false;
      }
      (a.evidence ??= []).unshift({
        name: name.trim(),
        type,
        by: USER(),
        when: stamp(),
        size: "1.0 MB",
      });
      log(a, "Evidence added", `${type} · ${name}`, "info");
      commit(ctx, "แนบหลักฐานแล้ว", `${a.code} · ${name}`, "info");
    },
  });
}

/* ---------- Posting ---------- */

export function adjPost(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;

  /* Guards first: posting is the only irreversible step in the module. */
  if (a.status === "Posted") {
    ctx.toast("บันทึกไปแล้ว", `${a.code} ถูกบันทึกเมื่อ ${a.postedDate}`, "info");
    return;
  }
  const issues = blockingIssues(a);
  if (issues.length) {
    ctx.toast("บันทึกไม่ได้", issues[0].message, "danger");
    return;
  }
  if (rec.needsApproval && a.approvalStatus !== "Approved") {
    ctx.toast("ยังไม่ได้รับอนุมัติ", "ใบปรับปรุงนี้ต้องผ่านการอนุมัติก่อนบันทึก", "danger");
    return;
  }
  if (!rec.evidenceComplete) {
    ctx.toast("ยังไม่มีหลักฐาน", `เหตุผล "${a.reason}" ต้องแนบหลักฐานก่อนบันทึก`, "danger");
    return;
  }

  const impact = stockImpact(a);
  let allChecked = false;

  ctx.formModal({
    title: `บันทึกใบปรับปรุง ${a.code}`,
    width: "wide",
    body: () => (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          {[
            ["ประเภท", a.type],
            ["คลัง", rec.whLabel],
            ["รายการ", fmt(rec.itemCount)],
            ["เข้า", fmt(rec.qtyIn)],
            ["ออก", fmt(rec.qtyOut)],
            ["สุทธิ", `${rec.netQty >= 0 ? "+" : ""}${fmt(rec.netQty)}`],
            ["เปลี่ยนสถานะ", fmt(rec.statusQty)],
            ["มูลค่า", money(rec.valueImpact)],
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col rounded-btn border border-line p-3">
              <span className="text-cap text-ink-3">{label}</span>
              <span className="tnum text-body font-semibold">{value}</span>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-cap">
          <span className="rounded-pill bg-neutral-soft px-2.5 py-1">
            อนุมัติ: {a.approvalStatus}
          </span>
          <span className="rounded-pill bg-neutral-soft px-2.5 py-1">
            หลักฐาน: {(a.evidence ?? []).length} รายการ
          </span>
          {rec.negativeRisk && (
            <span className="rounded-pill bg-danger-soft px-2.5 py-1 text-danger-text">
              ⚠ ผลลัพธ์ติดลบ
            </span>
          )}
          {rec.restrictedRelease && (
            <span className="rounded-pill bg-warning-soft px-2.5 py-1 text-warning-text">
              ⚠ ปล่อยสต๊อกที่ถูกกันไว้
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-btn border border-line">
          <table className="w-full text-body">
            <thead>
              <tr className="bg-surface">
                {["สินค้า", "On Hand", "Available", "QC Hold", "Damaged"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-cap font-semibold text-ink-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impact.map((r) => (
                <tr key={r.product} className="border-t border-line">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 tnum">
                    {fmt(r.onHandBefore)} → <strong>{fmt(r.onHandAfter)}</strong>
                  </td>
                  <td className="px-3 py-2 tnum">
                    {fmt(r.availableBefore)} → {fmt(r.availableAfter)}
                  </td>
                  <td className="px-3 py-2 tnum">
                    {fmt(r.qcBefore)} → {fmt(r.qcAfter)}
                  </td>
                  <td className="px-3 py-2 tnum">
                    {fmt(r.damagedBefore)} → {fmt(r.damagedAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Checklist
          items={[
            "ตรวจสอบจำนวนแล้ว",
            "ตรวจสอบคลังและตำแหน่งแล้ว",
            "ตรวจสอบ Lot / Serial แล้ว",
            "ตรวจสอบเหตุผลแล้ว",
            "ตรวจสอบหลักฐานแล้ว",
            "การอนุมัติครบถ้วน",
          ]}
          onChange={(v) => (allChecked = v)}
        />
      </div>
    ),
    confirmText: "บันทึกเข้าสต๊อก",
    onConfirm: () => {
      if (!allChecked) {
        ctx.toast("ยังตรวจสอบไม่ครบ", "ต้องยืนยันรายการตรวจสอบให้ครบทุกข้อก่อนบันทึก", "danger");
        return false;
      }
      a.postedBy = USER();
      a.postedDate = stamp();
      setStatus(a, "Posted", "Posted");
      log(
        a,
        "Posted",
        `บันทึกเข้าสต๊อก · เข้า ${fmt(rec.qtyIn)} · ออก ${fmt(rec.qtyOut)} · เปลี่ยนสถานะ ${fmt(rec.statusQty)}`,
        "primary",
      );
      commit(ctx, "บันทึกเข้าสต๊อกแล้ว", `${a.code} · สร้างรายการใน Stock Card แล้ว`);
    },
  });
}

/* ---------- Exceptions ---------- */

export function adjException(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let type = "";
  let severity = "";
  let description = "";

  ctx.formModal({
    title: "บันทึกปัญหาการปรับปรุงสต๊อก",
    body: () => (
      <div className="flex flex-col gap-4">
        <PickField label="ประเภทปัญหา" options={ADJ_EXCEPTION_TYPES} onPick={(v) => (type = v)} required />
        <PickField label="ระดับความรุนแรง" options={ADJ_SEVERITY} onPick={(v) => (severity = v)} required />
        <TextField label="รายละเอียด" placeholder="อธิบายสิ่งที่พบ" onChange={(v) => (description = v)} />
      </div>
    ),
    confirmText: "บันทึกปัญหา",
    onConfirm: () => {
      if (!type || !severity || !description.trim()) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุประเภท ระดับความรุนแรง และรายละเอียด", "danger");
        return false;
      }
      (a.exceptions ??= []).unshift({
        code: `AEX-2026-${String(ADJUSTMENTS.length + 200).padStart(6, "0")}`,
        type,
        severity,
        product: a.items[0]?.code ?? "",
        expected: rec.qtyIn + rec.qtyOut + rec.statusQty,
        actual: 0,
        description,
        responsible: "Warehouse",
        resolution: "",
        followUp: today(),
        status: "Open",
      });
      if (severity === "Critical" || severity === "High")
        setStatus(a, "Exception", "Exception raised", "danger");
      log(a, "Exception raised", `${type} · ${description}`, "danger");
      commit(ctx, "บันทึกปัญหาแล้ว", `${a.code} — ${type}`, "warning");
    },
  });
}

export function adjCloseException(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  const open = (a.exceptions ?? []).filter((e) => e.status !== "Closed");
  if (!open.length) {
    ctx.toast("ไม่มีปัญหาค้างอยู่", undefined, "info");
    return;
  }

  ctx.confirm({
    title: "ปิดปัญหา",
    message: `ปิดปัญหาที่ค้างอยู่ ${open.length} รายการของ ${a.code}`,
    confirmText: "ปิดปัญหา",
    onConfirm: () => {
      for (const e of open) {
        e.status = "Closed";
        e.resolution ||= "ยอมรับส่วนต่างและปิดเรื่อง";
      }
      if (a.status === "Exception") setStatus(a, "Closed", "Exception closed");
      log(a, "Exception closed", `ปิด ${open.length} รายการ`, "primary");
      commit(ctx, "ปิดปัญหาแล้ว", a.code);
    },
  });
}

/* ---------- Cancel and reverse ---------- */

export function adjCancel(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let reason = "";

  ctx.formModal({
    title: "ยกเลิกใบปรับปรุงสต๊อก",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          {a.code} จะถูกยกเลิกแต่ยังคงอยู่ในระบบ เอกสารที่ยกเลิกแล้วจะไม่ถูกลบ
        </p>
        <PickField label="เหตุผลการยกเลิก" options={ADJ_CANCEL_REASONS} onPick={(v) => (reason = v)} required />
      </div>
    ),
    confirmText: "ยกเลิกใบปรับปรุง",
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "การยกเลิกต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      a.cancelReason = reason;
      setStatus(a, "Cancelled", "Cancelled", "warn");
      log(a, "Cancelled", reason, "danger");
      commit(ctx, "ยกเลิกแล้ว", `${a.code} — ${reason}`, "warning");
    },
  });
}

/** Flip a line so the reversal undoes exactly what the original did. */
function invertLine(l: Adjustment["items"][number]) {
  if (isIncrease(l)) return { ...l, action: "Decrease Quantity" };
  if (isDecrease(l)) return { ...l, action: "Increase Quantity" };
  if (isStatusChange(l))
    return { ...l, statusFrom: l.statusTo, statusTo: l.statusFrom };
  return {
    ...l,
    locFrom: l.locTo,
    locTo: l.locFrom,
    lot: l.lotTo || l.lot,
    lotTo: l.lot,
    exp: l.expTo || l.exp,
    expTo: l.exp,
    serials: l.serialsTo?.length ? l.serialsTo : l.serials,
    serialsTo: l.serials,
  };
}

export function adjReverse(rec: AdjRow, ctx: ActionCtx) {
  const a = rawAdjustment(rec.code);
  if (!a) return;
  let reason = "";

  ctx.formModal({
    title: "กลับรายการใบปรับปรุงสต๊อก",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          ระบบจะสร้างใบปรับปรุงใหม่ที่ให้ผลตรงข้ามกับ {a.code} เอกสารเดิมจะไม่ถูกแก้ไข
        </p>
        <div className="rounded-btn border border-line bg-surface p-3 text-cap text-ink-2">
          {rec.qtyIn > 0 && <div>เข้า {fmt(rec.qtyIn)} → จะกลายเป็นออก {fmt(rec.qtyIn)}</div>}
          {rec.qtyOut > 0 && <div>ออก {fmt(rec.qtyOut)} → จะกลายเป็นเข้า {fmt(rec.qtyOut)}</div>}
          {rec.statusQty > 0 && <div>สถานะจะถูกย้อนกลับทางเดิม {fmt(rec.statusQty)} หน่วย</div>}
        </div>
        <TextField label="เหตุผลการกลับรายการ" placeholder="เช่น นับเพิ่มผิดพลาด" onChange={(v) => (reason = v)} />
      </div>
    ),
    confirmText: "กลับรายการ",
    onConfirm: () => {
      if (!reason.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "การกลับรายการต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }

      const code = nextAdjustmentCode();
      const reversal: Adjustment = {
        ...a,
        code,
        adjDate: today(),
        status: "Posted",
        approvalStatus: "Approved",
        approvedBy: USER(),
        approvedDate: stamp(),
        postedBy: USER(),
        postedDate: stamp(),
        description: `กลับรายการของ ${a.code}: ${reason}`,
        refType: "Manual Request",
        refDoc: a.code,
        reversalOf: a.code,
        reversedBy: "",
        reversalReason: reason,
        cancelReason: "",
        rejectReason: "",
        items: a.items.map(invertLine),
        exceptions: [],
        history: [
          {
            t: "Reversal posted",
            d: `กลับรายการของ ${a.code} — ${reason}`,
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
            to: a.code,
            kind: "danger",
          },
        ],
        created: stamp(),
        createdBy: USER(),
        updated: stamp(),
        updatedBy: USER(),
      };

      ADJUSTMENTS.unshift(reversal);
      a.reversedBy = code;
      a.reversalReason = reason;
      setStatus(a, "Reversed", "Reversed", "danger");
      log(a, "Reversed", `กลับรายการด้วย ${code} — ${reason}`, "danger");

      commit(ctx, "กลับรายการแล้ว", `สร้าง ${code} ที่ให้ผลตรงข้าม`, "warning");
      ctx.goto(`/m/stock-adjustment/${code}`);
    },
  });
}

/* ---------- Bulk ---------- */

export function adjBulk(rows: AdjRow[], ctx: ActionCtx) {
  const drafts = rows.filter((r) => r.canSubmit);
  const cancellable = rows.filter((r) => r.status === "Draft");

  return [
    {
      label: `ส่งขออนุมัติ (${drafts.length})`,
      icon: "send" as const,
      run: () => {
        if (!drafts.length) {
          ctx.toast("ไม่มีรายการที่ส่งได้", "เลือกใบปรับปรุงสถานะ Draft", "info");
          return;
        }
        let sent = 0;
        for (const r of drafts) {
          const a = rawAdjustment(r.code)!;
          if (blockingIssues(a).length) continue;
          a.approvalStatus = r.needsApproval ? "Pending Approval" : "Not Required";
          setStatus(a, r.needsApproval ? "Pending Approval" : "Ready to Post", "Submitted", "info");
          log(a, "Submitted", "ส่งขออนุมัติแบบกลุ่ม", "info");
          sent++;
        }
        commit(
          ctx,
          sent ? "ส่งขออนุมัติแล้ว" : "ไม่มีรายการที่ผ่านการตรวจสอบ",
          `${sent} จาก ${drafts.length} ใบ`,
          sent ? "info" : "warning",
        );
      },
    },
    {
      label: `มอบหมายผู้ตรวจสอบ (${rows.length})`,
      icon: "user" as const,
      run: () => {
        let who = "";
        ctx.formModal({
          title: "มอบหมายผู้ตรวจสอบ",
          body: () => (
            <PickField
              label="ผู้ตรวจสอบ"
              options={["Patcharin T.", "Suda R.", "Somchai B."]}
              onPick={(v) => (who = v)}
              required
            />
          ),
          confirmText: "มอบหมาย",
          onConfirm: () => {
            if (!who) {
              ctx.toast("ต้องเลือกผู้ตรวจสอบ", undefined, "danger");
              return false;
            }
            for (const r of rows) {
              const a = rawAdjustment(r.code)!;
              a.reviewer = who;
              log(a, "Reviewer assigned", `มอบหมายให้ ${who}`, "info");
            }
            commit(ctx, "มอบหมายแล้ว", `${rows.length} ใบ → ${who}`, "info");
          },
        });
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
              const a = rawAdjustment(r.code)!;
              a.cancelReason = "ยกเลิกแบบกลุ่ม";
              setStatus(a, "Cancelled", "Cancelled", "warn");
              log(a, "Cancelled", "ยกเลิกแบบกลุ่ม", "danger");
            }
            commit(ctx, "ยกเลิกแล้ว", `${cancellable.length} ใบ`, "warning");
          },
        });
      },
    },
  ];
}
