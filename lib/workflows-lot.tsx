"use client";

import { actingUserName } from "./domain/admin";
import { useState } from "react";
import { fmt, stamp, today } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import {
  RECALL_REVIEWS,
  RECALL_SEVERITY,
  RECALL_TYPES,
  nextRecallCode,
  type RecallReview,
} from "@/data/lots";
import { ADJUSTMENTS, nextAdjustmentCode, type Adjustment } from "@/data/adjustments";
import {
  invalidateLots,
  lotCustomers,
  lotRecall,
  type LotRow,
} from "./domain/lot";
import { decorateAdjustments } from "./domain/adjustment";
import { invalidateMovements } from "./domain/movement";

/* ============================================================
   LOT TRACKING WORKFLOWS

   The module is read-only about inventory. The only thing that
   leaves it is a recall review, and the only way that touches stock
   is by handing a Stock Status Adjustment draft to Stock
   Adjustment — Available → Recall Hold — which still has to be
   approved and posted in its own module.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  invalidateLots();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

const note = (r: RecallReview, text: string) =>
  r.notes.unshift({ note: text, by: USER(), when: stamp() });

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

/* ---------- Recall review ---------- */

export function lotStartRecall(rec: LotRow, ctx: ActionCtx) {
  const existing = lotRecall(rec);
  if (existing) {
    ctx.toast(
      "มีการตรวจสอบอยู่แล้ว",
      `${rec.lot} อยู่ใน ${existing.code} สถานะ ${existing.status}`,
      "info",
    );
    return;
  }

  let type = "";
  let severity = "";
  let reason = "";
  const customers = lotCustomers(rec);

  ctx.formModal({
    title: `เริ่มการตรวจสอบเรียกคืน ${rec.lot}`,
    width: "wide",
    body: () => (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          {[
            ["สินค้า", rec.productName],
            ["คงเหลือพร้อมขาย", fmt(rec.available)],
            ["ส่งออกไปแล้ว", fmt(rec.shippedQty)],
            ["ลูกค้าที่ได้รับ", fmt(customers.length)],
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col rounded-btn border border-line p-3">
              <span className="text-cap text-ink-3">{label}</span>
              <span className="tnum text-body font-semibold">{value}</span>
            </span>
          ))}
        </div>
        <PickField label="ประเภทการเรียกคืน" options={RECALL_TYPES} onPick={(v) => (type = v)} required />
        <PickField label="ระดับความรุนแรง" options={RECALL_SEVERITY} onPick={(v) => (severity = v)} required />
        <TextField label="เหตุผล" placeholder="อธิบายสาเหตุที่ต้องตรวจสอบ" onChange={(v) => (reason = v)} />
        <p className="text-cap text-ink-3">
          การเริ่มตรวจสอบยังไม่เปลี่ยนสถานะสต๊อก — ต้องกัน Recall Hold ผ่านใบปรับปรุงสต๊อกอีกขั้นหนึ่ง
        </p>
      </div>
    ),
    confirmText: "เริ่มตรวจสอบ",
    onConfirm: () => {
      if (!type || !severity || !reason.trim()) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องระบุประเภท ระดับความรุนแรง และเหตุผล", "danger");
        return false;
      }

      const review: RecallReview = {
        code: nextRecallCode(),
        lot: rec.lot,
        product: rec.product,
        type,
        severity,
        reason,
        initiatedBy: USER(),
        initiatedDate: today(),
        status: "Under Investigation",
        holdStatus: "ยังไม่กัน",
        affectedQty: rec.onHand + rec.shippedQty,
        availableQty: rec.available,
        shippedQty: rec.shippedQty,
        customerCount: customers.length,
        adjustmentRef: "",
        notes: [{ note: reason, by: USER(), when: stamp() }],
      };

      RECALL_REVIEWS.unshift(review);
      commit(ctx, "เริ่มตรวจสอบแล้ว", `${review.code} · ${rec.lot}`, "warning");
    },
  });
}

export function lotAddNote(rec: LotRow, ctx: ActionCtx) {
  const review = lotRecall(rec);
  if (!review) {
    ctx.toast("ยังไม่มีการตรวจสอบ", "เริ่มการตรวจสอบเรียกคืนก่อน", "info");
    return;
  }
  let text = "";

  ctx.formModal({
    title: `บันทึกผลการตรวจสอบ ${review.code}`,
    body: () => (
      <TextField label="บันทึก" placeholder="สิ่งที่พบหรือขั้นตอนที่ดำเนินการ" onChange={(v) => (text = v)} />
    ),
    confirmText: "บันทึก",
    onConfirm: () => {
      if (!text.trim()) {
        ctx.toast("ต้องระบุรายละเอียด", undefined, "danger");
        return false;
      }
      note(review, text);
      commit(ctx, "บันทึกแล้ว", `${review.code}`, "info");
    },
  });
}

/**
 * Recall Hold handoff. Lot Tracking never writes a balance, so the hold is a
 * Stock Status Adjustment draft — Available → Recall Hold — that has to be
 * approved and posted in Stock Adjustment like any other correction.
 */
export function lotPlaceRecallHold(rec: LotRow, ctx: ActionCtx) {
  const review = lotRecall(rec);
  if (!review) {
    ctx.toast("ยังไม่มีการตรวจสอบ", "ต้องเริ่มการตรวจสอบเรียกคืนก่อนกันสต๊อก", "danger");
    return;
  }
  if (review.adjustmentRef) {
    ctx.toast(
      "กันสต๊อกไปแล้ว",
      `${review.code} เชื่อมกับใบปรับปรุง ${review.adjustmentRef} อยู่แล้ว`,
      "info",
    );
    return;
  }
  if (rec.available <= 0) {
    ctx.toast("ไม่มีสต๊อกให้กัน", `${rec.lot} ไม่มียอดพร้อมขายคงเหลือ`, "info");
    return;
  }

  ctx.confirm({
    title: "กันสต๊อกเข้าสถานะ Recall Hold",
    message: (
      <span className="flex flex-col gap-2">
        <span>
          {rec.lot} · {rec.productName} · {fmt(rec.available)} {rec.unit}
        </span>
        <span className="text-cap text-ink-2">
          ระบบจะสร้างใบปรับปรุงสต๊อกแบบเปลี่ยนสถานะ Available → Recall Hold เป็นร่าง —
          สต๊อกจะเปลี่ยนก็ต่อเมื่อบันทึกใบปรับปรุงนั้นแล้ว
        </span>
      </span>
    ),
    confirmText: "สร้างใบปรับปรุง",
    onConfirm: () => {
      const code = nextAdjustmentCode();

      const adjustment: Adjustment = {
        code,
        adjDate: today(),
        type: "Stock Status Adjustment",
        reason: "Recall Hold",
        reasonGroup: "Status",
        priority: review.severity === "Critical" ? "Critical" : "High",
        status: "Draft",
        approvalStatus: "Not Submitted",

        requestedBy: USER(),
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
        refDoc: review.code,
        description: `กันสต๊อกล็อต ${rec.lot} ตามการตรวจสอบเรียกคืน ${review.code}: ${review.reason}`,

        warehouse: rec.warehouses[0] ?? "WH-BKK",
        zone: "",
        rack: "",
        shelf: "",
        bin: "",
        branch: (rec.warehouses[0] ?? "") === "WH-CNX" ? "Chiang Mai" : "Bangkok",

        items: [
          {
            line: 1,
            code: rec.product,
            name: rec.productName,
            unit: rec.unit,
            cat: rec.cat,
            action: "Change Stock Status",
            qty: rec.available,
            statusFrom: "Available",
            statusTo: "Blocked",
            locFrom: rec.locations[0] ?? "",
            locTo: "",
            lot: rec.lot,
            lotTo: "",
            exp: rec.exp,
            expTo: "",
            serials: [],
            serialsTo: [],
            unitCost: rec.unitCost,
            reason: "Recall Hold",
            note: `เรียกคืน ${review.type} · ${review.severity} · ลูกค้าที่ได้รับ ${review.customerCount} ราย`,
          },
        ],
        evidence: [],
        exceptions: [],

        history: [
          {
            t: "Created from Recall Review",
            d: `สร้างจากการตรวจสอบเรียกคืน ${review.code} ของล็อต ${rec.lot}`,
            u: USER(),
            when: stamp(),
            kind: "danger",
          },
        ],
        audit: [
          {
            event: "Created from Recall Review",
            user: USER(),
            when: stamp(),
            field: "Source Document",
            from: "—",
            to: review.code,
            kind: "danger",
          },
        ],

        created: stamp(),
        createdBy: USER(),
        updated: stamp(),
        updatedBy: USER(),
      };

      ADJUSTMENTS.unshift(adjustment);
      decorateAdjustments();
      invalidateMovements();

      review.adjustmentRef = code;
      review.status = "Hold Applied";
      review.holdStatus = "Recall Hold";
      note(review, `สร้างใบปรับปรุง ${code} เพื่อกันสต๊อก ${rec.available} ${rec.unit}`);

      commit(ctx, "สร้างใบปรับปรุงแล้ว", `${code} · รอบันทึกในโมดูล Stock Adjustment`, "warning");
      ctx.goto(`/m/stock-adjustment/${code}`);
    },
  });
}

export function lotReleaseHold(rec: LotRow, ctx: ActionCtx) {
  const review = lotRecall(rec);
  if (!review) {
    ctx.toast("ยังไม่มีการตรวจสอบ", undefined, "info");
    return;
  }
  let reason = "";

  ctx.formModal({
    title: `ปลดการกันสต๊อก ${review.code}`,
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">
          การปลดจะบันทึกไว้ในการตรวจสอบ — การคืนสถานะสต๊อกจริงต้องทำผ่านใบปรับปรุงสต๊อกอีกใบ
        </p>
        <TextField label="เหตุผลการปลด" placeholder="เช่น ผลตรวจยืนยันว่าสินค้าปลอดภัย" onChange={(v) => (reason = v)} />
      </div>
    ),
    confirmText: "ปลดการกัน",
    onConfirm: () => {
      if (!reason.trim()) {
        ctx.toast("ต้องระบุเหตุผล", "การปลดการกันสต๊อกต้องมีเหตุผลกำกับเสมอ", "danger");
        return false;
      }
      review.holdStatus = "Released";
      review.status = "Customer Trace Complete";
      note(review, `ปลดการกันสต๊อก: ${reason}`);
      commit(ctx, "ปลดการกันแล้ว", `${review.code} — ${reason}`, "info");
    },
  });
}

export function lotCloseRecall(rec: LotRow, ctx: ActionCtx) {
  const review = lotRecall(rec);
  if (!review) {
    ctx.toast("ยังไม่มีการตรวจสอบ", undefined, "info");
    return;
  }
  if (review.status === "Closed") {
    ctx.toast("ปิดเรื่องไปแล้ว", review.code, "info");
    return;
  }

  ctx.confirm({
    title: "ปิดการตรวจสอบเรียกคืน",
    message: `ปิด ${review.code} · ${rec.lot} — ประวัติการตรวจสอบจะยังคงอยู่`,
    confirmText: "ปิดเรื่อง",
    onConfirm: () => {
      review.status = "Closed";
      note(review, "ปิดการตรวจสอบ");
      commit(ctx, "ปิดเรื่องแล้ว", review.code);
    },
  });
}

export function lotExportCustomers(rec: LotRow, ctx: ActionCtx) {
  const customers = lotCustomers(rec);
  if (!customers.length) {
    ctx.toast("ไม่มีลูกค้าที่ได้รับล็อตนี้", `${rec.lot} ยังไม่ถูกส่งออก`, "info");
    return;
  }
  ctx.toast(
    "ส่งออกรายชื่อลูกค้า",
    `${customers.length} ราย · ${fmt(customers.reduce((t, c) => t + c.net, 0))} ${rec.unit} — Future support`,
    "info",
  );
}

/* ---------- Export and print ---------- */

export const lotExport = (rec: LotRow, ctx: ActionCtx, what: string) =>
  ctx.toast(`ส่งออก${what}`, `${rec.lot} — Future support`, "info");

export const lotPrint = (rec: LotRow, ctx: ActionCtx) =>
  ctx.toast("พิมพ์รายงานการสอบกลับล็อต", `${rec.lot} — Future support`, "info");

/* ---------- Bulk ---------- */

export function lotBulk(rows: LotRow[], ctx: ActionCtx) {
  const recallable = rows.filter((r) => !lotRecall(r));

  return [
    {
      label: `ส่งออกที่เลือก (${rows.length})`,
      icon: "upload" as const,
      run: () => ctx.toast("ส่งออกล็อตที่เลือก", `${rows.length} ล็อต — Future support`, "info"),
    },
    {
      label: `พิมพ์การสอบกลับ (${rows.length})`,
      icon: "printer" as const,
      run: () =>
        ctx.toast("พิมพ์รายงานการสอบกลับ", `${rows.length} ล็อต — Future support`, "info"),
    },
    {
      label: `เพิ่มเข้าการตรวจสอบเรียกคืน (${recallable.length})`,
      icon: "alert" as const,
      danger: true,
      run: () => {
        if (!recallable.length) {
          ctx.toast("ทุกล็อตอยู่ในการตรวจสอบแล้ว", undefined, "info");
          return;
        }
        ctx.confirm({
          title: "เพิ่มเข้าการตรวจสอบเรียกคืน",
          message: `เริ่มการตรวจสอบสำหรับ ${recallable.length} ล็อต — ยังไม่เปลี่ยนสถานะสต๊อก`,
          tone: "danger",
          confirmText: "เริ่มตรวจสอบ",
          onConfirm: () => {
            for (const r of recallable) {
              RECALL_REVIEWS.unshift({
                code: nextRecallCode(),
                lot: r.lot,
                product: r.product,
                type: "Internal Investigation",
                severity: "Medium",
                reason: "เพิ่มเข้าการตรวจสอบแบบกลุ่ม",
                initiatedBy: USER(),
                initiatedDate: today(),
                status: "Draft Review",
                holdStatus: "ยังไม่กัน",
                affectedQty: r.onHand + r.shippedQty,
                availableQty: r.available,
                shippedQty: r.shippedQty,
                customerCount: lotCustomers(r).length,
                adjustmentRef: "",
                notes: [
                  { note: "เพิ่มเข้าการตรวจสอบแบบกลุ่ม", by: USER(), when: stamp() },
                ],
              });
            }
            commit(ctx, "เริ่มตรวจสอบแล้ว", `${recallable.length} ล็อต`, "warning");
          },
        });
      },
    },
    {
      label: `เปรียบเทียบล็อตที่เลือก (${rows.length})`,
      icon: "columns" as const,
      run: () =>
        ctx.toast(
          "เปรียบเทียบล็อต",
          rows.map((r) => `${r.lot} คงเหลือ ${fmt(r.available)}`).join(" · "),
          "info",
        ),
    },
  ];
}
