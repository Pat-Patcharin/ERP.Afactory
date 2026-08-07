"use client";

import { getProduct, isStocked, productStock } from "@/lib/domain/product";
import { fmt } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { DraftLine } from "@/lib/domain/doc-draft";

/* ============================================================
   WHAT THE WAREHOUSE ALREADY HOLDS

   Six figures per line, every one of them read from
   `productStock()` and none of them recomputed here. The buyer
   needs the same numbers the stock screens show; a second
   calculation would eventually disagree with the first and there
   would be no way to tell which was right.

   NOTHING HERE BLOCKS. Not the shortfall against the suggested
   quantity, not a projected balance below the reorder point.
   A requester routinely knows things the reorder point does not
   — a promotion starting, a customer order not yet keyed, a
   machine due for service. Refusing their number on the strength
   of a formula would teach them to enter a number that gets past
   the form rather than the number they mean.

   The two figures beyond the obvious four:

     projected  what will be left once everything already on
                order arrives and everything already promised
                goes out. The honest "will we actually run out".
     suggested  how much more to buy to reach the target level.
                Shown as advice, and the warning when a request
                is under it is a warning, not a gate.
   ============================================================ */

interface Row {
  code: string;
  name: string;
  unit: string;
  qty: number;
  onHand: number;
  backOrder: number;
  available: number;
  onOrder: number;
  projected: number;
  suggested: number;
  short: boolean;
}

export function StockAdvicePanel({
  items,
  suggestedSupplier,
}: {
  items: readonly DraftLine[];
  suggestedSupplier: string;
}) {
  const rows: Row[] = [];
  let unknown = 0;

  for (const l of items) {
    const code = String(l.code ?? "").trim();
    if (!code) continue;
    const product = getProduct(code);
    const st = productStock(code);
    /* A product the warehouse has never held is not "zero of everything" —
       nobody has said either way. Counted and named, never shown as a row of
       zeros that would read as "we are out of it".

       Tested with `isStocked()`, NOT with a falsy `productStock()`: that
       function answers for any product in the master and returns a full set
       of zeros for a catalogue row, so a null check here would never fire and
       every unstocked item would appear as out of stock. */
    if (!product || !st || !isStocked(product)) {
      unknown++;
      continue;
    }
    const qty = Number(l.qty) || 0;
    rows.push({
      code,
      name: String(l.name ?? ""),
      unit: st.unit,
      qty,
      onHand: st.onHand,
      backOrder: st.backOrder,
      available: st.available,
      onOrder: st.onOrder,
      projected: st.projected,
      suggested: st.suggested,
      short: qty > 0 && st.suggested > 0 && qty < st.suggested,
    });
  }

  if (!rows.length && !unknown && !suggestedSupplier) return null;

  return (
    <section
      data-testid="stock-advice"
      className="rounded-card border border-doc-accent-border bg-doc-accent-soft p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Icon name="info" size={16} className="text-doc-accent" />
        <h3 className="text-[13px] font-bold uppercase tracking-[0.06em]">
          สต๊อกที่มีอยู่
        </h3>
        <span className="text-cap text-ink-2">
          ข้อมูลประกอบการตัดสินใจ ไม่ใช่ข้อบังคับ — กรอกจำนวนตามที่ต้องการได้เสมอ
        </span>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" data-testid="stock-advice-table">
            <thead>
              <tr>
                {[
                  ["สินค้า", "left"],
                  ["ขอ", "right"],
                  ["คงคลัง", "right"],
                  ["ค้างส่ง", "right"],
                  ["พร้อมขาย", "right"],
                  ["ค้างรับ", "right"],
                  ["คงเหลือคาดการณ์", "right"],
                  ["ควรสั่งเพิ่ม", "right"],
                ].map(([label, align]) => (
                  <th
                    key={label}
                    className={cn(
                      "whitespace-nowrap border-b border-doc-accent-border px-2 py-1.5 text-cap font-semibold text-ink-2",
                      align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} data-testid={`stock-advice-${r.code}`}>
                  <td className="border-b border-doc-accent-border/60 px-2 py-1.5">
                    <span className="font-medium">{r.code}</span>
                    <span className="ml-2 text-ink-2">{r.name}</span>
                  </td>
                  <td className="tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right font-semibold">
                    {fmt(r.qty)}
                  </td>
                  <td className="tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right">
                    {fmt(r.onHand)}
                  </td>
                  <td className="tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right">
                    {fmt(r.backOrder)}
                  </td>
                  <td className="tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right">
                    {fmt(r.available)}
                  </td>
                  <td className="tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right">
                    {fmt(r.onOrder)}
                  </td>
                  <td className="tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right">
                    {fmt(r.projected)}
                  </td>
                  <td
                    className={cn(
                      "tnum border-b border-doc-accent-border/60 px-2 py-1.5 text-right",
                      r.short && "font-semibold text-warning-text",
                    )}
                  >
                    {fmt(r.suggested)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.some((r) => r.short) && (
        <p
          data-testid="stock-advice-under-suggested"
          className="mt-2 flex items-start gap-2 text-cap text-warning-text"
        >
          <Icon name="alert" size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {rows
              .filter((r) => r.short)
              .map((r) => `${r.code} ขอ ${fmt(r.qty)} · แนะนำ ${fmt(r.suggested)} ${r.unit}`)
              .join(" · ")}
            {" — บันทึกและส่งขออนุมัติได้ตามปกติ"}
          </span>
        </p>
      )}

      {unknown > 0 && (
        <p className="mt-2 text-cap text-ink-2" data-testid="stock-advice-unknown">
          อีก {unknown} รายการยังไม่มีข้อมูลสต๊อก — คลังไม่เคยถือของชิ้นนี้
          ซึ่งไม่เหมือนกับมีศูนย์ชิ้น
        </p>
      )}

      {suggestedSupplier && (
        <p className="mt-2 text-cap text-ink-2">
          เคยซื้อจาก <span className="font-medium text-ink">{suggestedSupplier}</span> —
          เลือกเองได้ที่ช่องผู้ขายที่เสนอ
        </p>
      )}
    </section>
  );
}
