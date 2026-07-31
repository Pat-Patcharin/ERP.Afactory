"use client";

import { useState, type ReactNode } from "react";
import { fmt, money, stamp } from "./format";
import { cn } from "./utils";
import { Icon } from "./icons";
import type { ActionCtx } from "./types";
import {
  INV_CANCEL_REASONS,
  INV_CREDIT_REASONS,
  INV_VOID_REASONS,
} from "@/data/sales-invoices";
import {
  SALES_INVOICES,
  billingWarnings,
  decorateInvoices,
  invoiceTotals,
  lineAmount,
  lineDiscount,
  type InvRow,
} from "./domain/invoice";

/* ============================================================
   SALES INVOICE WORKFLOWS

   Draft → Pending Review → Approved → Issued → Partially Paid → Paid
                                     → Cancelled / Void / Credited

   Issuing locks the document. Payment and credit notes are mocked —
   the Finance module will own them for real.
   ============================================================ */

const USER = "Admin";

function log(inv: InvRow, t: string, d: string, kind = "primary", u = USER) {
  (inv.history ??= []).unshift({ t, d, u, when: stamp(), kind });
}

function audit(
  inv: InvRow,
  event: string,
  field: string,
  from: string,
  to: string,
  kind = "primary",
) {
  (inv.audit ??= []).unshift({ event, user: USER, when: stamp(), field, from, to, kind });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decorateInvoices();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

/* ---------- Shared reason picker ---------- */

/**
 * A modal body that will not let the user confirm without picking a reason.
 * Cancel, Void and Credit Note all need exactly this, so it lives once.
 */
function ReasonPicker({
  reasons,
  value,
  onPick,
  label,
}: {
  reasons: readonly string[];
  value: { reason: string; note: string };
  onPick: (next: { reason: string; note: string }) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-cap font-medium text-ink-2">
        {label}
        <span className="font-semibold text-danger"> *</span>
      </label>
      <div className="flex flex-col gap-1.5">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onPick({ ...value, reason: r })}
            className={cn(
              "flex items-center gap-2.5 rounded-btn border px-3 py-2 text-left text-[13px] transition-colors duration-fast",
              value.reason === r
                ? "border-primary bg-primary-soft font-medium"
                : "border-line hover:bg-surface",
            )}
          >
            <span
              className={cn(
                "grid h-[16px] w-[16px] flex-shrink-0 place-items-center rounded-full border-[1.5px]",
                value.reason === r ? "border-primary bg-primary text-white" : "border-line-strong",
              )}
            >
              {value.reason === r && <Icon name="check" size={10} strokeWidth={3} />}
            </span>
            {r}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
        value={value.note}
        onChange={(e) => onPick({ ...value, note: e.target.value })}
        className="w-full resize-y rounded-input border border-line bg-card px-3 py-2 text-body
                   placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/[.12]"
      />
    </div>
  );
}

/** Wraps ReasonPicker in local state so the modal body can be stateful. */
function ReasonBody({
  reasons,
  label,
  intro,
  onChange,
}: {
  reasons: readonly string[];
  label: string;
  intro: ReactNode;
  onChange: (v: { reason: string; note: string }) => void;
}) {
  const [value, setValue] = useState({ reason: "", note: "" });
  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] leading-relaxed text-ink-2">{intro}</div>
      <ReasonPicker
        reasons={reasons}
        value={value}
        label={label}
        onPick={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </div>
  );
}

/* ============================================================
   STATUS FLOW
   ============================================================ */

export function invSubmit(inv: InvRow, ctx: ActionCtx) {
  if (!(inv.items ?? []).length) {
    ctx.toast("ยังไม่มีรายการ", "ใบแจ้งหนี้ต้องมีอย่างน้อย 1 รายการก่อนส่งตรวจสอบ", "warning");
    return;
  }
  const warnings = billingWarnings(inv);
  const from = inv.status;

  inv.status = "Pending Review";
  inv.approvalStatus = "Pending";
  inv.updated = stamp();
  inv.updatedBy = USER;
  log(inv, "Submitted for review", "ส่งตรวจสอบข้อมูลบิลและภาษี", "info");
  audit(inv, "Status changed", "status", from, "Pending Review", "info");

  commit(
    ctx,
    "ส่งตรวจสอบแล้ว",
    warnings.length
      ? `${inv.code} — มี ${warnings.length} รายการที่ต้องแก้ก่อนอนุมัติ`
      : `${inv.code} — รอฝ่ายบัญชีตรวจสอบ`,
    warnings.length ? "warning" : "success",
  );
}

export function invApprove(inv: InvRow, ctx: ActionCtx) {
  const warnings = billingWarnings(inv);

  ctx.confirm({
    title: "Approve this invoice?",
    message: (
      <>
        อนุมัติ <strong>{inv.code}</strong> — {inv.customer}
        <br />
        ยอดรวม {money(inv.grandTotal)} {inv.currency}
        {inv.hasPriceOverride && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ใบนี้มีการแก้ราคาต่างจากเอกสารต้นทาง
            </span>
          </>
        )}
        {warnings.length > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ข้อมูลที่ยังไม่ครบ: {warnings.join(" · ")}
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Approve invoice",
    tone: "primary",
    onConfirm: () => {
      const from = inv.status;
      inv.status = "Approved";
      inv.approvalStatus = "Approved";
      inv.updated = stamp();
      inv.updatedBy = USER;
      log(inv, "Approved", "อนุมัติแล้ว พร้อมออกใบแจ้งหนี้");
      audit(inv, "Status changed", "status", from, "Approved");
      commit(ctx, "อนุมัติใบแจ้งหนี้แล้ว", `${inv.code} — พร้อม Issue`);
    },
  });
}

export function invReject(inv: InvRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Request revision?",
    message: `${inv.code} จะถูกส่งกลับให้แก้ไข — สถานะกลับเป็น Draft`,
    confirmText: "Request revision",
    onConfirm: () => {
      const from = inv.status;
      inv.status = "Draft";
      inv.approvalStatus = "Revision Requested";
      inv.updated = stamp();
      inv.updatedBy = USER;
      log(inv, "Revision requested", "ส่งกลับให้แก้ไข", "warn");
      audit(inv, "Status changed", "status", from, "Draft", "warn");
      commit(ctx, "ส่งกลับให้แก้ไขแล้ว", inv.code, "warning");
    },
  });
}

/* ---------- Issue ---------- */

const ISSUE_CHECKS = [
  "Customer information verified",
  "Tax information verified",
  "Invoice amount verified",
  "Source document verified",
];

/** Issuing is irreversible, so every box must be ticked first. */
function IssueBody({
  inv,
  onChange,
}: {
  inv: InvRow;
  onChange: (allChecked: boolean) => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(ISSUE_CHECKS.map(() => false));

  const toggle = (i: number) => {
    const next = checked.map((c, n) => (n === i ? !c : c));
    setChecked(next);
    onChange(next.every(Boolean));
  };

  const rows: [string, ReactNode][] = [
    ["Invoice Number", inv.code],
    ["Customer", inv.customer],
    ["Invoice Date", inv.invoiceDate],
    ["Due Date", inv.dueDate],
    ["Grand Total", `${money(inv.grandTotal)} ${inv.currency}`],
    ["Tax Amount", `${money(inv.taxAmount)} ${inv.currency}`],
    ["Source Document", inv.sourceDoc || "Manual"],
    ["Billing Address", inv.billingAddress],
  ];

  return (
    <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
      <div className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline gap-4 border-b border-line py-[7px] last:border-b-0"
          >
            <span className="flex-shrink-0 text-cap text-ink-2">{label}</span>
            <span className="ml-auto text-right text-[13px] font-medium tnum">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-btn border border-line bg-surface p-4">
        {ISSUE_CHECKS.map((c, i) => (
          <button
            key={c}
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
            {c}
          </button>
        ))}
        <p className="mt-2 text-cap leading-relaxed text-ink-3">
          เมื่อออกใบแจ้งหนี้แล้ว ยอดเงินและรายการจะถูกล็อก แก้ไขไม่ได้
          ต้องยกเลิก (Void) หรือออกใบลดหนี้เท่านั้น
        </p>
      </div>
    </div>
  );
}

export function invIssue(inv: InvRow, ctx: ActionCtx) {
  if (inv.status !== "Approved") {
    ctx.toast(
      "ต้องอนุมัติก่อน",
      `${inv.code} อยู่ในสถานะ ${inv.status} — ออกใบแจ้งหนี้ได้เฉพาะใบที่ Approved แล้ว`,
      "warning",
    );
    return;
  }

  let ready = false;

  ctx.formModal({
    title: "Confirm Issue Invoice",
    width: "wide",
    confirmText: "Issue Invoice",
    body: () => <IssueBody inv={inv} onChange={(v) => (ready = v)} />,
    onConfirm: () => {
      if (!ready) {
        ctx.toast("ยังยืนยันไม่ครบ", "ต้องติ๊กยืนยันครบทั้ง 4 ข้อก่อนออกใบแจ้งหนี้", "warning");
        return false;
      }
      const from = inv.status;
      inv.status = "Issued";
      inv.updated = stamp();
      inv.updatedBy = USER;
      log(inv, "Issued", "ออกใบแจ้งหนี้ให้ลูกค้า ล็อกยอดและรายการแล้ว");
      audit(inv, "Status changed", "status", from, "Issued");
      commit(ctx, "ออกใบแจ้งหนี้แล้ว", `${inv.code} — ล็อกเอกสารเรียบร้อย`);
    },
  });
}

/* ---------- Cancel / Void ---------- */

export function invCancel(inv: InvRow, ctx: ActionCtx) {
  if (!["Draft", "Pending Review", "Approved"].includes(inv.status)) {
    ctx.toast("ยกเลิกไม่ได้", `${inv.code} ออกใบแจ้งหนี้แล้ว — ต้องใช้ Void แทน`, "warning");
    return;
  }

  let picked = { reason: "", note: "" };

  ctx.formModal({
    title: "Cancel Invoice",
    confirmText: "Cancel Invoice",
    body: () => (
      <ReasonBody
        reasons={INV_CANCEL_REASONS}
        label="เหตุผลที่ยกเลิก"
        intro={
          <>
            <strong>{inv.code}</strong> — {inv.customer} · {money(inv.grandTotal)}{" "}
            {inv.currency}
            <br />
            ใบแจ้งหนี้จะไม่ถูกลบ แต่เปลี่ยนสถานะเป็น Cancelled และแก้ไขไม่ได้อีก
          </>
        }
        onChange={(v) => (picked = v)}
      />
    ),
    onConfirm: () => {
      if (!picked.reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ยกเลิกก่อนยืนยัน", "warning");
        return false;
      }
      const from = inv.status;
      inv.status = "Cancelled";
      inv.cancelReason = picked.note ? `${picked.reason} — ${picked.note}` : picked.reason;
      inv.updated = stamp();
      inv.updatedBy = USER;
      log(inv, "Cancelled", `เหตุผล: ${inv.cancelReason}`, "warn");
      audit(inv, "Status changed", "status", from, "Cancelled", "warn");
      commit(ctx, "ยกเลิกใบแจ้งหนี้แล้ว", `${inv.code} — ${picked.reason}`, "danger");
    },
  });
}

export function invVoid(inv: InvRow, ctx: ActionCtx) {
  if (!["Issued", "Partially Paid", "Overdue"].includes(inv.status)) {
    ctx.toast("Void ไม่ได้", `${inv.code} ยังไม่ได้ออกใบแจ้งหนี้`, "warning");
    return;
  }

  let picked = { reason: "", note: "" };

  ctx.formModal({
    title: "Void Issued Invoice",
    confirmText: "Void Invoice",
    body: () => (
      <ReasonBody
        reasons={INV_VOID_REASONS}
        label="เหตุผลที่ Void"
        intro={
          <>
            <strong>{inv.code}</strong> — {inv.customer} · {money(inv.grandTotal)}{" "}
            {inv.currency}
            <br />
            <span className="font-semibold text-danger-text">
              ใบแจ้งหนี้ที่ออกแล้วจะถูกยกเลิกทางบัญชี — ต้องได้รับอนุมัติจากฝ่ายบัญชี
            </span>
            {inv.paidAmount > 0 && (
              <>
                <br />
                ใบนี้มีการรับชำระแล้ว {money(inv.paidAmount)} {inv.currency} — พิจารณาออกใบลดหนี้แทน
              </>
            )}
          </>
        }
        onChange={(v) => (picked = v)}
      />
    ),
    onConfirm: () => {
      if (!picked.reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ Void ก่อนยืนยัน", "warning");
        return false;
      }
      const from = inv.status;
      inv.status = "Void";
      inv.voidReason = picked.note ? `${picked.reason} — ${picked.note}` : picked.reason;
      inv.voidBy = USER;
      inv.updated = stamp();
      inv.updatedBy = USER;
      log(inv, "Void", `เหตุผล: ${inv.voidReason} — อนุมัติโดย ${USER}`, "warn");
      audit(inv, "Status changed", "status", from, "Void", "warn");
      commit(ctx, "Void ใบแจ้งหนี้แล้ว", `${inv.code} — ${picked.reason}`, "danger");
    },
  });
}

/* ---------- Credit note entry point ---------- */

export function invCreditNote(inv: InvRow, ctx: ActionCtx) {
  if (!inv.canCreditNote) {
    ctx.toast(
      "ออกใบลดหนี้ไม่ได้",
      inv.creditNoteRef
        ? `${inv.code} มีใบลดหนี้ ${inv.creditNoteRef} อยู่แล้ว`
        : `${inv.code} ต้องออกใบแจ้งหนี้ก่อนจึงจะออกใบลดหนี้ได้`,
      "warning",
    );
    return;
  }

  let picked = { reason: "", note: "" };

  ctx.formModal({
    title: "Create Credit Note",
    width: "wide",
    confirmText: "Create Credit Note",
    body: () => (
      <div className="flex flex-col gap-4">
        <div className="rounded-btn border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
            <span className="font-semibold tnum">{inv.code}</span>
            <span className="text-ink-2">{inv.customer}</span>
            <span className="ml-auto font-semibold tnum">
              {money(inv.grandTotal)} {inv.currency}
            </span>
          </div>
          <table className="w-full text-cap">
            <thead>
              <tr className="border-b border-line text-ink-2">
                <th className="py-1.5 text-left font-semibold">Product</th>
                <th className="py-1.5 text-right font-semibold">Invoiced</th>
                <th className="py-1.5 text-right font-semibold">Credit Qty</th>
                <th className="py-1.5 text-right font-semibold">Credit Amount</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items ?? []).map((it) => (
                <tr key={it.line} className="border-b border-line last:border-b-0">
                  <td className="py-1.5">
                    <span className="font-medium tnum">{it.code}</span>
                    <span className="ml-2 text-ink-2">{it.name}</span>
                  </td>
                  <td className="py-1.5 text-right tnum">{fmt(it.invoiceQty)}</td>
                  <td className="py-1.5 text-right tnum">{fmt(it.invoiceQty)}</td>
                  <td className="py-1.5 text-right font-medium tnum">{money(lineAmount(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-cap text-ink-3">
            Phase 1 ลดหนี้เต็มจำนวนทุกบรรทัด — การเลือกบรรทัดและจำนวนบางส่วนจะทำในโมดูล Credit Note
          </p>
        </div>

        <ReasonBody
          reasons={INV_CREDIT_REASONS}
          label="เหตุผลที่ออกใบลดหนี้"
          intro="ระบุเหตุผลเพื่อให้ฝ่ายบัญชีตรวจสอบได้"
          onChange={(v) => (picked = v)}
        />
      </div>
    ),
    onConfirm: () => {
      if (!picked.reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ออกใบลดหนี้ก่อนยืนยัน", "warning");
        return false;
      }
      const cnCode = `CN-2026-${String(SALES_INVOICES.length + 1).padStart(6, "0")}`;
      inv.creditNoteRef = cnCode;
      inv.status = "Credited";
      inv.updated = stamp();
      inv.updatedBy = USER;
      log(inv, "Credit note created", `ออกใบลดหนี้ ${cnCode} — ${picked.reason}`, "info");
      audit(inv, "Credit note linked", "creditNoteRef", "—", cnCode, "info");
      commit(
        ctx,
        "สร้างใบลดหนี้แล้ว (จำลอง)",
        `${cnCode} — โมดูล Credit Note เต็มรูปแบบจะมาในเฟสถัดไป`,
        "info",
      );
    },
  });
}

/* ---------- Preview & print ---------- */

const COMPANY = {
  name: "A-FACTORY CO., LTD.",
  address: "99/9 ถนน 9 หมู่ 9 ห้วยขวาง กรุงเทพฯ 10310",
  taxId: "0100559107221",
  tel: "02-123-4567",
};

function PreviewBody({ inv }: { inv: InvRow }) {
  const t = invoiceTotals(inv);
  return (
    <div className="bg-white text-ink" id="invoice-preview">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-btn bg-primary text-lg text-white">
            A
          </span>
          <div className="text-cap leading-relaxed">
            <p className="text-body font-bold">{COMPANY.name}</p>
            <p className="text-ink-2">{COMPANY.address}</p>
            <p className="text-ink-2">Tax ID: {COMPANY.taxId}</p>
            <p className="text-ink-2">Tel: {COMPANY.tel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="mb-2 text-h2 font-bold tracking-[-0.02em]">INVOICE</p>
          <table className="ml-auto text-cap">
            <tbody>
              <tr>
                <td className="border border-line px-2 py-1 text-ink-2">Invoice No.</td>
                <td className="border border-line px-2 py-1 font-semibold tnum">{inv.code}</td>
              </tr>
              <tr>
                <td className="border border-line px-2 py-1 text-ink-2">Invoice Date</td>
                <td className="border border-line px-2 py-1 tnum">{inv.invoiceDate}</td>
              </tr>
              <tr>
                <td className="border border-line px-2 py-1 text-ink-2">Due Date</td>
                <td className="border border-line px-2 py-1 tnum">{inv.dueDate}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-5 text-cap leading-relaxed">
        <p className="font-semibold">Bill To:</p>
        <p className="text-body font-semibold">{inv.billingName || inv.customer}</p>
        <p className="text-ink-2">{inv.billingAddress}</p>
        <p className="text-ink-2">Tax ID: {inv.taxId || "—"}</p>
        {inv.customerPo && <p className="text-ink-2">Customer PO: {inv.customerPo}</p>}
      </div>

      <table className="w-full text-cap">
        <thead>
          <tr className="bg-surface">
            <th className="border border-line px-2 py-1.5 text-left font-semibold">#</th>
            <th className="border border-line px-2 py-1.5 text-left font-semibold">Item Code</th>
            <th className="border border-line px-2 py-1.5 text-left font-semibold">Description</th>
            <th className="border border-line px-2 py-1.5 text-right font-semibold">Quantity</th>
            <th className="border border-line px-2 py-1.5 text-left font-semibold">UOM</th>
            <th className="border border-line px-2 py-1.5 text-right font-semibold">Unit Price</th>
            <th className="border border-line px-2 py-1.5 text-right font-semibold">Discount</th>
            <th className="border border-line px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(inv.items ?? []).map((it, i) => (
            <tr key={it.line}>
              <td className="border border-line px-2 py-1.5 tnum">{i + 1}</td>
              <td className="border border-line px-2 py-1.5 tnum">{it.code}</td>
              <td className="border border-line px-2 py-1.5">{it.desc || it.name}</td>
              <td className="border border-line px-2 py-1.5 text-right tnum">{fmt(it.invoiceQty)}</td>
              <td className="border border-line px-2 py-1.5">{it.unit}</td>
              <td className="border border-line px-2 py-1.5 text-right tnum">{money(it.unitPrice)}</td>
              <td className="border border-line px-2 py-1.5 text-right tnum">
                {money(lineDiscount(it))}
              </td>
              <td className="border border-line px-2 py-1.5 text-right tnum">{money(lineAmount(it))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <table className="text-cap">
          <tbody>
            <tr>
              <td className="px-3 py-1 text-ink-2">Subtotal</td>
              <td className="px-3 py-1 text-right tnum">{money(t.taxable)}</td>
            </tr>
            {t.lineDiscount + t.headerDiscount > 0 && (
              <tr>
                <td className="px-3 py-1 text-ink-2">Discount</td>
                <td className="px-3 py-1 text-right tnum">
                  − {money(t.lineDiscount + t.headerDiscount)}
                </td>
              </tr>
            )}
            {t.freight > 0 && (
              <tr>
                <td className="px-3 py-1 text-ink-2">Freight</td>
                <td className="px-3 py-1 text-right tnum">{money(t.freight)}</td>
              </tr>
            )}
            <tr>
              <td className="px-3 py-1 text-ink-2">Tax ({inv.vatRate}%)</td>
              <td className="px-3 py-1 text-right tnum">{money(t.tax)}</td>
            </tr>
            <tr className="bg-surface">
              <td className="px-3 py-1.5 font-semibold">Grand Total</td>
              <td className="px-3 py-1.5 text-right font-bold tnum">{money(t.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-end justify-between gap-6 text-cap">
        <div className="leading-relaxed">
          <p>
            <span className="text-ink-2">Payment Terms</span>{" "}
            <span className="font-medium">{inv.payTerm}</span>
          </p>
          {inv.note && <p className="mt-1 text-ink-2">{inv.note}</p>}
        </div>
        <div className="text-center">
          <div className="mb-1 h-10 w-48 border-b border-dashed border-line-strong" />
          <p className="text-ink-2">Authorized Signature</p>
        </div>
      </div>
    </div>
  );
}

export function invPreview(inv: InvRow, ctx: ActionCtx) {
  ctx.formModal({
    title: "Invoice Preview",
    width: "wide",
    confirmText: "Print",
    cancelText: "Close",
    body: () => <PreviewBody inv={inv} />,
    onConfirm: () => {
      if (typeof window !== "undefined") window.print();
    },
  });
}

export function invExportPdf(inv: InvRow, ctx: ActionCtx) {
  ctx.toast(
    "ส่งออก PDF",
    `${inv.code} — การสร้างไฟล์ PDF จริงจะมาพร้อมโมดูล Finance`,
    "info",
  );
}

/* ---------- Payment placeholder ---------- */

export function invViewPayments(inv: InvRow, ctx: ActionCtx) {
  ctx.toast(
    "Receive Payment",
    `${inv.code} — Receive Payment will be available in the Finance module.`,
    "info",
  );
}

/* ---------- Duplicate ---------- */

export function invDuplicate(inv: InvRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Duplicate this invoice?",
    message: `สร้างใบแจ้งหนี้ใหม่จาก ${inv.code} — สถานะเริ่มต้นเป็น Draft และยังไม่ผูกกับเอกสารต้นทาง`,
    confirmText: "Duplicate",
    tone: "primary",
    onConfirm: () => {
      ctx.toast(
        "ทำสำเนาใบแจ้งหนี้",
        `${inv.code} — เปิดฟอร์มสร้างใหม่พร้อมข้อมูลเดิม (Future support)`,
        "info",
      );
    },
  });
}

/* ---------- Bulk ---------- */

export function invBulk(
  rows: InvRow[],
  action: "submit" | "approve" | "issue" | "cancel",
  ctx: ActionCtx,
) {
  const eligible = rows.filter((r) => {
    if (action === "submit") return r.status === "Draft";
    if (action === "approve") return r.status === "Pending Review";
    if (action === "issue") return r.status === "Approved";
    return ["Draft", "Pending Review", "Approved"].includes(r.status);
  });

  if (!eligible.length) {
    ctx.toast("ไม่มีรายการที่ทำได้", "รายการที่เลือกไม่อยู่ในสถานะที่รองรับการทำงานนี้", "warning");
    return;
  }

  const verb = { submit: "ส่งตรวจสอบ", approve: "อนุมัติ", issue: "ออกใบแจ้งหนี้", cancel: "ยกเลิก" }[
    action
  ];

  ctx.confirm({
    title: `${verb} ${eligible.length} ใบ?`,
    message:
      eligible.length === rows.length
        ? `จะดำเนินการกับใบแจ้งหนี้ทั้ง ${eligible.length} ใบที่เลือกไว้`
        : `เลือกไว้ ${rows.length} ใบ แต่ทำได้ ${eligible.length} ใบ — ที่เหลือสถานะไม่รองรับ`,
    confirmText: verb,
    tone: action === "cancel" ? "danger" : "primary",
    onConfirm: () => {
      const now = stamp();
      for (const inv of eligible) {
        const from = inv.status;
        if (action === "submit") {
          inv.status = "Pending Review";
          inv.approvalStatus = "Pending";
        } else if (action === "approve") {
          inv.status = "Approved";
          inv.approvalStatus = "Approved";
        } else if (action === "issue") {
          inv.status = "Issued";
        } else {
          inv.status = "Cancelled";
          inv.cancelReason = "ยกเลิกแบบกลุ่ม";
        }
        inv.updated = now;
        inv.updatedBy = USER;
        log(inv, `${verb} (bulk)`, `ดำเนินการแบบกลุ่มโดย ${USER}`, action === "cancel" ? "warn" : "primary");
        audit(inv, "Status changed", "status", from, inv.status, action === "cancel" ? "warn" : "primary");
      }
      commit(ctx, `${verb}แล้ว`, `${eligible.length} ใบ`, action === "cancel" ? "danger" : "success");
    },
  });
}
