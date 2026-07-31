import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { PL_PRIORITY_ENGINE } from "@/data/price-lists";

const RANK_TONE: Record<string, string> = {
  success: "bg-success-soft text-success-text border-transparent",
  warning: "bg-warning-soft text-warning-text border-transparent",
  info: "bg-info-soft text-info-text border-transparent",
  neutral: "bg-surface text-ink border-line",
};

/**
 * The pricing priority engine, highest precedence first. Shown on every price
 * list so it is obvious where that list sits when several could apply to the
 * same customer and product.
 */
export function PriorityLadder({ activeKey }: { activeKey?: string }) {
  return (
    <div className="flex flex-col">
      {PL_PRIORITY_ENGINE.map((p, i) => (
        <div key={p.key}>
          <div
            className={cn(
              "flex items-center gap-3 rounded-btn border border-line bg-card p-3 transition-[border-color,box-shadow] duration-fast",
              p.key === activeKey && "border-primary ring-2 ring-primary-soft",
            )}
          >
            <span
              className={cn(
                "grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full border text-xs font-bold",
                RANK_TONE[p.tone] ?? RANK_TONE.neutral,
              )}
            >
              {p.rank}
            </span>
            <span className="flex flex-col gap-px">
              <span className="text-[13px] font-bold">
                {p.key}
                {p.key === activeKey && (
                  <span className="ml-1.5 rounded-pill bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    ← price list นี้
                  </span>
                )}
              </span>
              <span className="text-[11px] text-ink-3">{p.desc}</span>
            </span>
          </div>
          {i < PL_PRIORITY_ENGINE.length - 1 && (
            <div className="flex justify-center py-0.5 text-ink-3">
              <Icon name="arrowDown" size={14} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
