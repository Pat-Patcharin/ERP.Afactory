"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { DLV_TONE, PAY_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  bpRecentBilling,
  bpTopCategories,
  type BillingRow,
  type CategoryMeasure,
} from "@/lib/domain/partner-analytics";
import type { BusinessPartner } from "@/data/partners";

/* ============================================================
   TWO THINGS A CUSTOMER RECORD IS OPENED TO FIND OUT

   "What did we bill them, did they pay, where is it" and
   "what do they actually buy". Neither fits in a KPI tile:
   the first is three facts about each of three documents, the
   second is a ranking.
   ============================================================ */

/* ---------- 1. The last three invoices, in the header ---------- */

function ParcelCell({ parcel }: { parcel: BillingRow["parcel"] }) {
  /*
     No parcel is a real answer and is printed as one. The alternative —
     showing the customer's most recent tracking number against whichever
     invoice happens to be on the row — sends somebody to a carrier's site to
     look up a parcel that is not theirs.
  */
  if (!parcel) {
    return (
      <span className="flex items-center gap-1 text-cap text-ink-3">
        <Icon name="truck" size={13} />
        ยังไม่ผูกการจัดส่ง
      </span>
    );
  }

  return (
    <span
      className="flex min-w-0 items-center gap-1"
      title={`${parcel.carrier} · ${parcel.status}`}
    >
      <Icon name="truck" size={13} className="flex-shrink-0 text-ink-3" />
      <span className="truncate text-cap font-medium tnum">{parcel.trackingNo}</span>
      <Badge tone={tone(DLV_TONE, parcel.status)}>{parcel.status}</Badge>
    </span>
  );
}

export function RecentInvoicesPanel({
  partner,
  onOpen,
}: {
  partner: BusinessPartner;
  onOpen?: () => void;
}) {
  const rows = bpRecentBilling(partner, 3);

  return (
    <div
      data-testid="bp-recent-invoices"
      className="flex min-w-0 flex-col rounded-btn border border-line bg-surface px-3 py-2.5"
    >
      <div className="mb-1.5 flex items-center gap-2">
        {/* Not "3 ใบแจ้งหนี้ล่าสุด": three is the cap, not a promise, and this
            customer has two. A heading that counts what is not there is the
            same mistake as a tracking number that is not theirs. */}
        <span className="text-cap font-medium text-ink-2">ใบแจ้งหนี้ล่าสุด</span>
        {onOpen && rows.length > 0 && (
          <button
            onClick={onOpen}
            className="ml-auto inline-flex items-center gap-0.5 text-cap font-medium text-info hover:underline"
          >
            ดูทั้งหมด
            <Icon name="chevronRight" size={13} />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-2 text-cap text-ink-3">ยังไม่มีใบแจ้งหนี้</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li
              key={r.no}
              className="grid grid-cols-[minmax(0,1.15fr)_auto_minmax(0,1.1fr)] items-center gap-x-3
                         border-b border-line py-1.5 last:border-b-0 max-[560px]:grid-cols-1 max-[560px]:gap-y-1"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-cap font-medium tnum">{r.no}</span>
                <span className="text-cap text-ink-3 tnum">{r.date || DASH}</span>
              </span>

              <span className="flex items-center gap-2 justify-self-end max-[560px]:justify-self-start">
                <span className="whitespace-nowrap text-cap font-semibold tnum">
                  {money0(r.amount)}
                </span>
                <Badge tone={tone(PAY_TONE, r.payment)}>{r.payment}</Badge>
              </span>

              <span className="min-w-0 justify-self-end max-[560px]:justify-self-start">
                <ParcelCell parcel={r.parcel} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- 2. Top 5 categories, in the body ---------- */

const MEASURES: { key: CategoryMeasure; label: string }[] = [
  { key: "amount", label: "ตามยอดซื้อ" },
  { key: "qty", label: "ตามจำนวนหน่วย" },
];

/** Units are summed across base units — see the note above bpTopCategories. */
const units = (n: number) => `${fmt(n)} หน่วย`;

export function TopCategoriesPanel({ partner }: { partner: BusinessPartner }) {
  const [measure, setMeasure] = useState<CategoryMeasure>("amount");
  const { rows, unmatched, total } = bpTopCategories(partner, measure, 5);

  /*
     Bars are measured against the leader rather than against the total. This
     is a ranking, not a part-to-whole: the question is "how far ahead is the
     top one", and a share-of-total scale squashes every bar when the tail is
     long.
  */
  const top = rows.reduce((m, r) => Math.max(m, r[measure]), 0);

  return (
    <div data-testid="bp-top-categories" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-cap text-ink-2">
          {total.lines
            ? `${fmt(total.lines)} รายการสั่งซื้อ · ${units(total.qty)} · ${money0(total.amount)} THB`
            : "ยังไม่มีใบสั่งขายที่บันทึกรายการสินค้า"}
        </p>

        <div
          role="group"
          aria-label="จัดอันดับหมวดหมู่ตาม"
          className="ml-auto flex items-center gap-1 rounded-btn border border-line bg-surface p-0.5"
        >
          {MEASURES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMeasure(m.key)}
              aria-pressed={measure === m.key}
              className={cn(
                "rounded-[7px] px-2.5 py-1 text-cap font-medium transition-colors duration-fast",
                measure === m.key ? "bg-card text-ink shadow-xs" : "text-ink-2 hover:text-ink",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-cap text-ink-3">
          หมวดหมู่คำนวณจากรายการในใบสั่งขาย — คู่ค้ารายนี้ยังไม่มีรายการที่ผูกกับทะเบียนสินค้า
        </p>
      ) : (
        /*
           One hue for every bar, not a darker-where-bigger ramp: the
           categories have no order of their own, so shading by size would
           encode the bar's length twice and say nothing new.

           Every row carries its own figures, so the ranking is readable
           without the bar at all — which is what the bar is allowed to be
           decorative about.
        */
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const pct = top > 0 ? (r[measure] / top) * 100 : 0;
            return (
              <li key={r.cat} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="w-4 flex-shrink-0 text-cap text-ink-3 tnum">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.cat}</span>
                  <span className="flex-shrink-0 text-[13px] font-semibold tnum">
                    {measure === "amount" ? money0(r.amount) : units(r.qty)}
                  </span>
                  {/* The measure that did NOT do the ranking, so switching the
                      toggle is a re-sort somebody can follow rather than a
                      list that changes for no visible reason. The two orders
                      genuinely differ: a cheap consumable can be the biggest
                      thing this customer moves and near the bottom by money. */}
                  <span className="w-28 flex-shrink-0 text-right text-cap text-ink-3 tnum">
                    {measure === "amount" ? units(r.qty) : `${money0(r.amount)} THB`}
                  </span>
                </div>
                <div className="ml-6 h-2 overflow-hidden rounded-[4px] bg-neutral-soft">
                  <div
                    className="h-full rounded-[4px] bg-primary transition-[width] duration-slow ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* What the ranking left out, said in figures rather than left to be
          noticed. These lines name products the master does not hold, so no
          category can be put on them — but they are a third of what this
          customer spent and a Top 5 that quietly omits them reads as the
          whole picture. */}
      {unmatched.lines > 0 && (
        <p className="flex items-start gap-1.5 text-cap text-ink-3">
          <Icon name="alert" size={13} className="mt-px flex-shrink-0" />
          <span>
            อีก {fmt(unmatched.lines)} รายการ · {units(unmatched.qty)} ·{" "}
            {money0(unmatched.amount)} THB ยังไม่ผูกกับทะเบียนสินค้า
            จึงจัดหมวดหมู่ไม่ได้และไม่ถูกนับในอันดับข้างต้น
          </span>
        </p>
      )}
    </div>
  );
}
