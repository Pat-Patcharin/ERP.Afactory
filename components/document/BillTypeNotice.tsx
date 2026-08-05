import { money } from "@/lib/format";
import type { BillTypeChangePlan } from "@/lib/domain/doc-draft";

/* ============================================================
   WHAT CHANGING VAT ⇄ NON VAT DOES

   One rendering, used by all three surfaces: the confirm dialog
   in the quotation editor, the same dialog in the sales request
   editor, and the side panel plus save confirmation on the sales
   order form.

   It computes nothing. Every figure comes from the plan built by
   planBillTypeChange(), so the numbers a salesperson sees before
   committing are the same on whichever screen they are standing.
   ============================================================ */

const Row = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className={strong ? "font-medium" : "text-ink-2"}>{label}</span>
    <span className={`tnum ${strong ? "font-semibold" : ""}`}>{value}</span>
  </div>
);

export function BillTypeNotice({ plan }: { plan: BillTypeChangePlan }) {
  const toNonVat = plan.to === "Non VAT";
  const cheaper = plan.delta < 0;

  return (
    <div className="flex flex-col gap-4 text-body">
      <p>
        ภาษีจะถูกตั้งเป็น <strong>{toNonVat ? "0" : `${plan.after.vat ? "7" : "7"}%`}</strong>{" "}
        ทั้ง {plan.lineCount} บรรทัด
      </p>

      {/* The dangerous case: rates somebody set on purpose, about to be
          overwritten. Listed one per line — a count alone does not tell the
          salesperson whether it is the exempt product they were careful
          about. */}
      {plan.overwritten.length > 0 && (
        <div className="rounded-btn border border-warning bg-warning-soft p-3">
          <p className="font-semibold text-warning-text">
            มี {plan.overwritten.length} จาก {plan.lineCount} บรรทัดที่ตั้งภาษีไว้ไม่ใช่{" "}
            {plan.from === "Non VAT" ? "0%" : "7%"}
          </p>
          <p className="mt-0.5 text-cap text-ink-2">
            การเปลี่ยนจะเขียนทับเป็น {toNonVat ? "0%" : "7%"} ทุกบรรทัด
          </p>

          <ul className="mt-2 flex flex-col gap-1">
            {plan.overwritten.map((l) => (
              <li key={l.code} className="flex items-baseline gap-2 text-cap">
                <span className="tnum font-medium">{l.code}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{l.name}</span>
                <span className="tnum whitespace-nowrap">
                  ภาษี {l.from}% → {l.to}%
                </span>
              </li>
            ))}
          </ul>

          {/* The way out, not just the warning. */}
          <p className="mt-2 text-cap text-ink-2">
            ถ้าเป็นสินค้ายกเว้นภาษี ให้ยกเลิกแล้วแก้ทีละบรรทัดแทน
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-btn border border-line bg-surface p-3">
        <Row label="ยอดก่อนภาษี" value={money(plan.after.netAmount)} />
        <Row
          label="ภาษี"
          value={`${money(plan.before.vat)} → ${money(plan.after.vat)}`}
        />
        <div className="my-1 border-t border-line" />
        <Row
          label="ยอดรวม"
          value={`${money(plan.before.grandTotal)} → ${money(plan.after.grandTotal)}`}
          strong
        />
        <div className={`text-right text-cap ${cheaper ? "text-ink-2" : "text-warning-text"}`}>
          {cheaper ? "ลดลง" : "เพิ่มขึ้น"} {money(Math.abs(plan.delta))} บาท
        </div>
      </div>
    </div>
  );
}

/** Title and confirm label, so all three surfaces word it the same way. */
export const billTypeDialogTitle = (plan: BillTypeChangePlan) =>
  plan.to === "Non VAT" ? "เปลี่ยนเป็นใบไม่มีภาษี?" : "เปลี่ยนเป็นใบมีภาษี?";

/**
 * The confirm button says what it will do, and to how many lines. "ตกลง"
 * on a dialog full of numbers tells the reader nothing about what they are
 * agreeing to.
 */
export const billTypeConfirmText = (plan: BillTypeChangePlan) =>
  plan.overwritten.length > 0
    ? `เขียนทับทั้ง ${plan.lineCount} บรรทัด`
    : plan.to === "Non VAT"
      ? "เปลี่ยนเป็นไม่มีภาษี"
      : "เปลี่ยนเป็นมีภาษี";
