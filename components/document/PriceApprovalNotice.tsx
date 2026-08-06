import { money } from "@/lib/format";
import type { PriceApproval } from "@/lib/domain/doc-draft";

/* ============================================================
   WHO WILL HAVE TO SIGN THIS

   Shown while the salesperson is still typing, so a price that
   needs the sales manager is known before the document is sent
   up rather than when it comes back.

   Computes nothing — every figure and every message comes from
   priceApproval() in doc-draft.ts, which is itself only a wrapper
   around checkQuotedPrice(). The rules live in one place; this
   file decides how they read.
   ============================================================ */

export function PriceApprovalNotice({ plan }: { plan: PriceApproval }) {
  const nothingToSay =
    plan.level === "admin" && !plan.noCost.length && !plan.uncheckable.length;
  if (nothingToSay) return null;

  return (
    <div className="flex flex-col gap-3 text-cap">
      {/* No cost is not an escalation — it stops the document. */}
      {plan.noCost.length > 0 && (
        <div>
          <p className="font-semibold text-danger-text">
            {plan.noCost.length} รายการยังไม่มีต้นทุน — ส่งขออนุมัติไม่ได้
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {plan.noCost.map((l) => (
              <li key={l.code} className="flex gap-2">
                <span className="tnum font-medium">{l.code}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{l.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 leading-relaxed text-ink-2">
            ไปตั้งต้นทุนที่ทะเบียนสินค้าก่อน แล้วจึงส่งขออนุมัติได้
          </p>
        </div>
      )}

      {plan.level === "manager" && (
        <div>
          <p className="font-semibold text-warning-text">
            ต้องให้ผู้จัดการฝ่ายขายอนุมัติ — {plan.flagged.length} รายการต่ำกว่าเกณฑ์
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {plan.flagged.map((l) => (
              <li key={l.code}>
                <div className="flex gap-2">
                  <span className="tnum font-medium">{l.code}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{l.name}</span>
                  <span className="tnum whitespace-nowrap">
                    {money(l.quoted)}
                    {l.floor !== null && ` / ขั้นต่ำ ${money(l.floor)}`}
                  </span>
                </div>
                {/* Straight from checkQuotedPrice, not re-worded here. */}
                {l.reasons.map((r) => (
                  <div key={r} className="pl-1 text-ink-3">
                    · {r}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.uncheckable.length > 0 && (
        <p className="leading-relaxed text-ink-2">
          <span className="font-medium">{plan.uncheckable.length} รายการ</span>{" "}
          ไม่มีราคากลางให้เทียบ — ระบบตรวจราคาขั้นต่ำให้ไม่ได้ ({plan.uncheckable
            .map((l) => l.code)
            .join(", ")})
        </p>
      )}
    </div>
  );
}
