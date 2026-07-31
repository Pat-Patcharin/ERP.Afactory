"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { paAllBins } from "@/lib/domain/inbound";

const BIN_TONE = (used: number) =>
  used >= 85
    ? "bg-danger-soft text-danger-text"
    : used >= 60
      ? "bg-warning-soft text-warning-text"
      : "bg-success-soft text-success-text";

/**
 * Bin occupancy map grouped by zone. Deliberately schematic rather than a
 * to-scale floor plan: what a put-away operator needs is which bins have room,
 * not where the pillars are.
 */
export function WarehouseMap({ highlight }: { highlight?: string }) {
  const bins = paAllBins();
  const zones = bins.reduce<Record<string, typeof bins>>((acc, b) => {
    (acc[b.zone] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-cap text-ink-2">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-success" /> ว่าง (&lt;60%)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-warning" /> กำลังเต็ม (60–85%)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-danger" /> เกือบเต็ม (&gt;85%)
        </span>
        {highlight && (
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-primary" /> ปลายทางที่แนะนำ
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-btn bg-surface p-3">
        <span className="rounded-pill border border-line bg-card px-3 py-1 text-cap font-semibold">
          Receiving Dock
        </span>
        <Icon name="arrowRight" size={14} className="text-ink-3" />
        <span className="rounded-pill border border-line bg-card px-3 py-1 text-cap font-semibold">
          QC Hold
        </span>
        <Icon name="arrowRight" size={14} className="text-ink-3" />
        <span className="rounded-pill border border-primary-border bg-primary-soft px-3 py-1 text-cap font-semibold text-primary">
          Storage Bins
        </span>
      </div>

      <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto">
        {Object.entries(zones).map(([zone, list]) => (
          <div key={zone} className="rounded-btn border border-line p-3">
            <p className="mb-2 text-cap font-bold text-ink-2">{zone}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
              {list.map((b) => (
                <div
                  key={b.path}
                  title={`${b.path} · ${b.used}% used`}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-sm border-[1.5px] border-transparent p-2 tnum",
                    BIN_TONE(b.used),
                    b.path === highlight && "border-primary ring-2 ring-primary-soft",
                  )}
                >
                  <span className="text-[11px] font-bold">{b.bin}</span>
                  <span className="text-[10px] opacity-80">{b.used}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
