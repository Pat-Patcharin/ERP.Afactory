"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui";
import type { Hero } from "@/lib/types";

/**
 * Operational hero for document lists: a banner that says what needs doing
 * today, plus KPI cards that jump straight to the matching tab. Master data
 * lists opt out — nothing about a product list changes hour to hour.
 */
export function ListHero({
  hero,
  onTab,
}: {
  hero: Hero;
  onTab: (key: string) => void;
}) {
  return (
    <div className="mb-4">
      {hero.banner && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-card border border-primary-border bg-gradient-to-r from-primary-soft to-[#FFFDFB] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-btn bg-primary text-white">
              <Icon name={hero.banner.icon ?? "workspace"} size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">{hero.banner.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-cap text-ink-2">
                {hero.banner.items.map((it, i) => (
                  <span key={it} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <i className="inline-block h-[3px] w-[3px] rounded-full bg-ink-3" />
                    )}
                    <span>{it}</span>
                  </span>
                ))}
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            {hero.banner.stamp && (
              <span className="text-cap text-ink-3">{hero.banner.stamp}</span>
            )}
            {hero.banner.action && (
              <Button size="sm" onClick={hero.banner.onAction}>
                {hero.banner.action}
              </Button>
            )}
          </div>
        </div>
      )}

      {!!hero.kpis?.length && (
        <div className="grid grid-cols-5 gap-3 max-[1280px]:grid-cols-3 max-[900px]:grid-cols-2">
          {hero.kpis.map((k) => (
            <button
              key={k.label}
              onClick={() => (k.run ? k.run() : k.goTab && onTab(k.goTab))}
              className={cn(
                "relative flex flex-col gap-0.5 rounded-card border border-line bg-card px-4 py-3 text-left",
                "transition-[border-color,box-shadow,transform] duration-fast",
                "hover:-translate-y-px hover:border-line-strong hover:shadow-sm",
                k.tone === "primary" && "border-t-2 border-t-primary",
                k.tone === "warn" && "border-t-2 border-t-warning",
                k.tone === "ok" && "border-t-2 border-t-success",
              )}
            >
              {k.icon && (
                <span className="absolute right-3 top-3 text-ink-3">
                  <Icon name={k.icon} size={16} />
                </span>
              )}
              <span className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] tnum">
                {k.value}
              </span>
              <span className="text-xs font-semibold">{k.label}</span>
              {k.sub && <span className="text-[11px] text-ink-3">{k.sub}</span>}
              {k.link && (
                <span className="mt-2 text-[11px] font-semibold text-primary">
                  {k.link} →
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
