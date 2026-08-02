"use client";

import { useState } from "react";
import { fmt, stamp, today } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import {
  EXCEPTION_SEVERITY,
  EXCEPTION_TYPES,
  SERIAL_EXCEPTIONS,
  nextExceptionCode,
  type SerialException,
} from "@/data/serials";
import {
  ADJUSTMENTS,
  nextAdjustmentCode,
  type AdjAction,
  type Adjustment,
  type ReasonGroup,
} from "@/data/adjustments";
import {
  invalidateSerials,
  serialExceptions,
  statusIssues,
  type SerialRow,
} from "./domain/serial";
import { decorateAdjustments } from "./domain/adjustment";
import { invalidateMovements } from "./domain/movement";

/* ============================================================
   SERIAL TRACKING WORKFLOWS

   The module never edits a serial. What leaves it is an exception
   review, and the only way that touches stock is a Stock Adjustment
   draft — Correct Serial or Decrease Quantity — that still has to be
   approved and posted in its own module.
   ============================================================ */

const USER = "Admin";

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  invalidateSerials();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

const note = (e: SerialException, text: string) =>
  e.notes.unshift({ note: text, by: USER, when: stamp() });

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
  initial = "",
  onChange,
}: {
  label: string;
  placeholder?: string;
  initial?: string;
  onChange: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
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

function SerialFacts({ rec }: { rec: SerialRow }) {
  return (
    <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
      {[
        ["สินค้า", rec.productName],
        ["สถานะวงจร", rec.lifecycle],
        ["สถานะสต๊อก", rec.physical],
        ["ผู้ครอบครอง", rec.owner || "—"],
      ].map(([label, value]) => (
        <span key={label} className="flex flex-col rounded-btn border border-line p-3">
          <span className="text-cap text-ink-3">{label}</span>
          <span className="text-body font-semibold">{value}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------- Exception review ---------- */

export const openException = (rec: SerialRow) =>
  serialExceptions(rec).find((e) => e.status !== "Closed" && e.status !== "Resolved") ?? null;

export function serialStartInvestigation(rec: SerialRow, ctx: ActionCtx) {
  const existing = openException(rec);
  if (existing) {
    ctx.toast(
      "มีเรื่องสอบสวนอยู่แล้ว",
      `${rec.serial} อยู่ใน ${existing.code} สถานะ ${existing.status}`,
      "info",
    );
    return;
  }

  const issues = statusIssues(rec);
  let type = issues[0]?.title === "Serial Ownership Conflict" ? "Ownership Conflict" : "";
  let severity = "";
  let description = "";

  ctx.formModal({
    title: `เริ่มการสอบสวน ${rec.serial}`,
    width: "wide",
    body: () => (
      <div className="flex flex-col gap-4">
        <SerialFacts rec={rec} />
        {issues.length > 0 && (
          <p className="rounded-btn border border-danger/40 bg-danger/5 p-3 text-cap text-danger">
            ระบบตรวจพบ: {issues.map((i) => i.title).join(" · ")}
          </p>
        )}
        <PickField
          label="ประเภทข้อผิดพลาด"
          options={EXCEPTION_TYPES}
          initial={type}
          onPick={(v) => (type = v)}
          required
        />
        <PickField
          label="ระดับความรุนแรง"
          options={EXCEPTION_SEVERITY}
          onPick={(v) => (severity = v)}
          required
        />
        <TextField
          label="รายละเอียด"
          placeholder="สิ่งที่พบและสิ่งที่คาดว่าควรเป็น"
          onChange={(v) => (description = v)}
        />
        <p className="text-cap text-ink-3">
          การเปิดเรื่องยังไม่แก้ไขข้อมูลหมายเลขเครื่อง — การแก้ต้องผ่านใบปรับปรุงสต๊อกเท่านั้น
        </p>
      </div>
    ),
    confirmText: "เปิดเรื่องสอบสวน",
    onConfirm: () => {
      if (!type || !severity || !description.trim()) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุประเภท ระดับความรุนแรง และรายละเอียด", "danger");
        return false;
      }

      const exception: SerialException = {
        code: nextExceptionCode(),
        serial: rec.serial,
        product: rec.product,
        type,
        severity,
        expected: `${rec.lifecycle} · ${rec.physical} · ${rec.owner || "—"}`,
        actual: issues.map((i) => i.detail).join(" / ") || description,
        description,
        responsible: rec.warehouse || "Inventory Manager",
        evidence: "",
        resolution: "",
        followUp: "",
        status: "Open",
        raisedBy: USER,
        raisedDate: today(),
        adjustmentRef: "",
        notes: [{ note: "เปิดเรื่องจากหน้า Serial Tracking", by: USER, when: stamp() }],
      };

      SERIAL_EXCEPTIONS.unshift(exception);
      commit(ctx, "เปิดเรื่องสอบสวนแล้ว", `${exception.code} · ${rec.serial}`, "warning");
    },
  });
}

export function serialAddExceptionNote(rec: SerialRow, ctx: ActionCtx) {
  const exception = openException(rec) ?? serialExceptions(rec)[0];
  if (!exception) {
    ctx.toast("ยังไม่มีเรื่องสอบสวน", "เปิดเรื่องสอบสวนก่อน", "info");
    return;
  }
  let text = "";

  ctx.formModal({
    title: `บันทึกผลการสอบสวน ${exception.code}`,
    body: () => (
      <TextField label="บันทึก" placeholder="สิ่งที่พบหรือขั้นตอนที่ดำเนินการ" onChange={(v) => (text = v)} />
    ),
    confirmText: "บันทึก",
    onConfirm: () => {
      if (!text.trim()) {
        ctx.toast("ต้องระบุรายละเอียด", undefined, "danger");
        return false;
      }
      note(exception, text);
      commit(ctx, "บันทึกแล้ว", exception.code, "info");
    },
  });
}

/**
 * Exception handoff. Serial Tracking never writes a serial or a balance, so
 * the fix is a Stock Adjustment draft — Correct Serial for a wrong number,
 * Decrease Quantity for one that cannot be found — which still has to be
 * approved and posted in Stock Adjustment.
 */
export function serialCreateAdjustment(rec: SerialRow, ctx: ActionCtx) {
  const exception = openException(rec);
  if (!exception) {
    ctx.toast("ยังไม่มีเรื่องสอบสวน", "ต้องเปิดเรื่องสอบสวนก่อนตั้งใบปรับปรุง", "danger");
    return;
  }
  if (exception.adjustmentRef) {
    ctx.toast(
      "ตั้งใบปรับปรุงไปแล้ว",
      `${exception.code} เชื่อมกับใบปรับปรุง ${exception.adjustmentRef} อยู่แล้ว`,
      "info",
    );
    return;
  }

  const missing = exception.type === "Missing Serial" || rec.lifecycle === "Lost";
  const kind: { type: string; reason: string; group: ReasonGroup; action: AdjAction } = missing
    ? { type: "Negative Adjustment", reason: "Lost Stock", group: "Negative", action: "Decrease Quantity" }
    : { type: "Serial Correction", reason: "Wrong Serial", group: "Correction", action: "Correct Serial" };

  ctx.confirm({
    title: missing ? "ตั้งใบตัดสต๊อกหมายเลขที่หายไป" : "ตั้งใบแก้ไขหมายเลขเครื่อง",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {rec.serial} · {rec.productName} · {rec.warehouse || rec.owner}
        </span>
        <span className="text-cap text-ink-2">
          ระบบจะสร้างใบปรับปรุงสต๊อกประเภท {kind.type} เป็นร่าง — ข้อมูลหมายเลขเครื่องจะเปลี่ยนก็ต่อเมื่อ
          บันทึกใบปรับปรุงนั้นแล้ว
        </span>
      </span>
    ),
    confirmText: "สร้างใบปรับปรุง",
    tone: "danger",
    onConfirm: () => {
      const code = nextAdjustmentCode();

      const adjustment: Adjustment = {
        code,
        adjDate: today(),
        type: kind.type,
        reason: kind.reason,
        reasonGroup: kind.group,
        priority: exception.severity === "Critical" ? "Critical" : "High",
        status: "Draft",
        approvalStatus: "Not Submitted",

        requestedBy: USER,
        reviewer: "Patcharin T.",
        approvedBy: "",
        approvedDate: "",
        postedBy: "",
        postedDate: "",
        rejectReason: "",
        cancelReason: "",
        reversalReason: "",
        reversalOf: "",
        reversedBy: "",

        refType: "Incident Report",
        refDoc: exception.code,
        description: `แก้ไขจากการสอบสวนหมายเลขเครื่อง ${exception.code}: ${exception.description}`,

        warehouse: rec.warehouse || rec.initialWarehouse || "WH-BKK",
        zone: rec.zone,
        rack: rec.rack,
        shelf: rec.shelf,
        bin: rec.bin,
        branch: (rec.warehouse || rec.initialWarehouse) === "WH-CNX" ? "Chiang Mai" : "Bangkok",

        items: [
          {
            line: 1,
            code: rec.product,
            name: rec.productName,
            unit: rec.unit,
            cat: rec.cat,
            action: kind.action,
            qty: 1,
            statusFrom: rec.physical,
            statusTo: missing ? "" : rec.physical,
            locFrom: rec.location,
            locTo: "",
            lot: "",
            lotTo: "",
            exp: "",
            expTo: "",
            serials: [rec.serial],
            serialsTo: missing ? [] : [rec.correctedTo || ""],
            unitCost: rec.unitCost,
            reason: kind.reason,
            note: `${exception.type} · ${exception.severity} — ${exception.actual}`,
          },
        ],
        evidence: [],
        exceptions: [],

        history: [
          {
            t: "Created from Serial Exception",
            d: `สร้างจากการสอบสวน ${exception.code} ของหมายเลข ${rec.serial}`,
            u: USER,
            when: stamp(),
            kind: "danger",
          },
        ],
        audit: [
          {
            event: "Created from Serial Exception",
            user: USER,
            when: stamp(),
            field: "Source Document",
            from: "—",
            to: exception.code,
            kind: "danger",
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

      exception.adjustmentRef = code;
      exception.status = "Pending Adjustment";
      note(exception, `สร้างใบปรับปรุง ${code} เพื่อแก้ไขหมายเลขเครื่อง`);

      commit(ctx, "สร้างใบปรับปรุงแล้ว", `${code} · รอบันทึกในโมดูล Stock Adjustment`, "warning");
      ctx.goto(`/m/stock-adjustment/${code}`);
    },
  });
}

export function serialRequestMasterReview(rec: SerialRow, ctx: ActionCtx) {
  const exception = openException(rec);
  if (!exception) {
    ctx.toast("ยังไม่มีเรื่องสอบสวน", "เปิดเรื่องสอบสวนก่อนขอตรวจสอบข้อมูลหลัก", "info");
    return;
  }
  note(exception, "ส่งเรื่องให้ทีมข้อมูลหลักตรวจสอบ");
  commit(ctx, "ส่งเรื่องให้ทีมข้อมูลหลักแล้ว", `${exception.code} · ${rec.product}`, "info");
}

export function serialEscalate(rec: SerialRow, ctx: ActionCtx) {
  const exception = openException(rec);
  if (!exception) {
    ctx.toast("ยังไม่มีเรื่องสอบสวน", undefined, "info");
    return;
  }
  ctx.confirm({
    title: "ยกระดับเรื่องสอบสวน",
    message: `${exception.code} · ${rec.serial} — แจ้งผู้จัดการคลังให้ตัดสินใจ`,
    tone: "danger",
    confirmText: "ยกระดับ",
    onConfirm: () => {
      exception.status = "Escalated";
      exception.severity = exception.severity === "Critical" ? "Critical" : "High";
      note(exception, "ยกระดับให้ผู้จัดการคลังพิจารณา");
      commit(ctx, "ยกระดับแล้ว", exception.code, "warning");
    },
  });
}

export function serialCloseException(rec: SerialRow, ctx: ActionCtx) {
  const exception = openException(rec);
  if (!exception) {
    ctx.toast("ไม่มีเรื่องที่เปิดอยู่", `${rec.serial} ไม่มีเรื่องสอบสวนค้าง`, "info");
    return;
  }
  let resolution = "";

  ctx.formModal({
    title: `ปิดเรื่อง ${exception.code}`,
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          การปิดเรื่องเก็บประวัติไว้ทั้งหมด — ถ้ายังต้องแก้ข้อมูลต้องผ่านใบปรับปรุงสต๊อกก่อน
        </p>
        <TextField
          label="ผลการแก้ไข"
          placeholder="เช่น แก้หมายเลขผ่าน ADJ-2026-000045 แล้ว"
          onChange={(v) => (resolution = v)}
        />
      </div>
    ),
    confirmText: "ปิดเรื่อง",
    onConfirm: () => {
      if (!resolution.trim()) {
        ctx.toast("ต้องระบุผลการแก้ไข", "การปิดเรื่องต้องมีข้อสรุปกำกับเสมอ", "danger");
        return false;
      }
      exception.status = "Closed";
      exception.resolution = resolution;
      note(exception, `ปิดเรื่อง: ${resolution}`);
      commit(ctx, "ปิดเรื่องแล้ว", exception.code);
    },
  });
}

/* ---------- Placeholders for modules that do not exist yet ---------- */

export const serialCreateInstall = (rec: SerialRow, ctx: ActionCtx) =>
  ctx.toast(
    "บันทึกการติดตั้ง",
    `${rec.serial} · ${rec.customer || "ยังไม่มีลูกค้า"} — โมดูล Service จะรองรับในเฟสถัดไป`,
    "info",
  );

export const serialCreateServiceRequest = (rec: SerialRow, ctx: ActionCtx) =>
  ctx.toast(
    "เปิดใบแจ้งซ่อม",
    `${rec.serial} — โมดูล Service จะรองรับในเฟสถัดไป`,
    "info",
  );

export const serialOpenClaim = (rec: SerialRow, ctx: ActionCtx) =>
  ctx.toast(
    "เปิดใบเคลมผู้ขาย",
    `${rec.serial} · ${rec.supplier} — โมดูล Supplier Claim จะรองรับในเฟสถัดไป`,
    "info",
  );

export const serialScan = (ctx: ActionCtx) =>
  ctx.toast(
    "สแกนหมายเลขเครื่อง",
    "การเชื่อมต่อเครื่องสแกนจริงจะทำในโมดูล Barcode Lookup",
    "info",
  );

/* ---------- Export and print ---------- */

export const serialExport = (rec: SerialRow, ctx: ActionCtx, what: string) =>
  ctx.toast(`ส่งออก${what}`, `${rec.serial} — Future support`, "info");

export const serialPrint = (rec: SerialRow, ctx: ActionCtx) =>
  ctx.toast("พิมพ์รายงานการสอบกลับหมายเลขเครื่อง", `${rec.serial} — Future support`, "info");

/* ---------- Bulk ---------- */

export function serialBulk(rows: SerialRow[], ctx: ActionCtx) {
  const investigable = rows.filter((r) => !openException(r));

  return [
    {
      label: `ส่งออกที่เลือก (${rows.length})`,
      icon: "upload" as const,
      run: () =>
        ctx.toast("ส่งออกหมายเลขที่เลือก", `${fmt(rows.length)} หมายเลข — Future support`, "info"),
    },
    {
      label: `พิมพ์การสอบกลับ (${rows.length})`,
      icon: "printer" as const,
      run: () =>
        ctx.toast("พิมพ์รายงานการสอบกลับ", `${fmt(rows.length)} หมายเลข — Future support`, "info"),
    },
    {
      label: `เพิ่มเข้าการสอบสวน (${investigable.length})`,
      icon: "alert" as const,
      danger: true,
      run: () => {
        if (!investigable.length) {
          ctx.toast("ทุกหมายเลขอยู่ในการสอบสวนแล้ว", undefined, "info");
          return;
        }
        ctx.confirm({
          title: "เพิ่มเข้าการสอบสวน",
          message: `เปิดเรื่องสอบสวนสำหรับ ${investigable.length} หมายเลข — ยังไม่แก้ไขข้อมูลใด`,
          tone: "danger",
          confirmText: "เปิดเรื่อง",
          onConfirm: () => {
            for (const r of investigable) {
              const issues = statusIssues(r);
              SERIAL_EXCEPTIONS.unshift({
                code: nextExceptionCode(),
                serial: r.serial,
                product: r.product,
                type: issues[0]?.title === "Duplicate Serial" ? "Duplicate Serial" : "Other",
                severity: "Medium",
                expected: `${r.lifecycle} · ${r.physical}`,
                actual: issues.map((i) => i.detail).join(" / ") || "เพิ่มเข้าการสอบสวนแบบกลุ่ม",
                description: "เพิ่มเข้าการสอบสวนแบบกลุ่ม",
                responsible: r.warehouse || "Inventory Manager",
                evidence: "",
                resolution: "",
                followUp: "",
                status: "Open",
                raisedBy: USER,
                raisedDate: today(),
                adjustmentRef: "",
                notes: [{ note: "เพิ่มเข้าการสอบสวนแบบกลุ่ม", by: USER, when: stamp() }],
              });
            }
            commit(ctx, "เปิดเรื่องสอบสวนแล้ว", `${investigable.length} หมายเลข`, "warning");
          },
        });
      },
    },
    {
      label: `เปรียบเทียบหมายเลขที่เลือก (${rows.length})`,
      icon: "columns" as const,
      run: () =>
        ctx.toast(
          "เปรียบเทียบหมายเลขเครื่อง",
          rows.map((r) => `${r.serial} · ${r.lifecycle}`).join(" · "),
          "info",
        ),
    },
  ];
}
