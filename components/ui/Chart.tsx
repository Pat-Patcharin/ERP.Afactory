"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

/* ============================================================
   CHARTS — built from SVG and layout, no chart library.

   Two rules the rest of the app already follows apply here too:
   the mark carries the colour and the text never does, and every
   figure lines up because it is tabular. On top of those, three
   rules specific to charts:

     · one baseline, one scale — never a second y-axis
     · 2px of surface between touching marks does the separating,
       never a stroke drawn around them
     · colour is the identity channel of last resort: every series
       is also named in a legend and labelled with its own value,
       so a reader who cannot separate two hues still reads it

   The six series colours live in globals.css. Their order is the
   colour-vision safety mechanism — see the note there.
   ============================================================ */

export const SERIES = [
  "var(--c-series-1)",
  "var(--c-series-2)",
  "var(--c-series-3)",
  "var(--c-series-4)",
  "var(--c-series-5)",
  "var(--c-series-6)",
];

/** Charts animate in once on mount, then hold still. */
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return on;
}

/** Round a maximum up to a clean axis top: 178,432 → 200,000. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (mag / 2)) * (mag / 2);
}

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}K`
      : String(Math.round(n));

/* ============================================================
   COLUMN CHART — one series, one baseline.
   ============================================================ */

export interface BarPoint {
  label: string;
  value: number;
}

export function BarChart({
  points,
  height = 220,
  /** Prefix for the tooltip and axis figures. */
  unit = "฿",
  ticks = 4,
  className,
  "data-testid": testId,
}: {
  points: BarPoint[];
  height?: number;
  unit?: string;
  ticks?: number;
  className?: string;
  "data-testid"?: string;
}) {
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);

  if (!points.length) return null;

  const top = niceMax(Math.max(...points.map((p) => p.value)));
  const peak = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0);
  const lines = Array.from({ length: ticks + 1 }, (_, i) => (top / ticks) * (ticks - i));

  /* With 90 columns on screen only every nth label can be read. */
  const step = Math.ceil(points.length / 12);

  return (
    <figure data-testid={testId} className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-3">
        {/* Y axis — carries the values no column is directly labelled with */}
        <div
          className="flex w-11 flex-shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-ink-3"
          style={{ height }}
          aria-hidden
        >
          {lines.map((v, i) => (
            <span key={i} className="-translate-y-1/2 first:translate-y-0 last:-translate-y-full">
              {compact(v)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          {/* Gridlines: hairline, solid, one step off the surface */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            {lines.map((_, i) => (
              <span
                key={i}
                className={cn("block h-px w-full", i === lines.length - 1 ? "bg-line-strong" : "bg-line")}
              />
            ))}
          </div>

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {points.map((p, i) => {
              const pct = top > 0 ? (p.value / top) * 100 : 0;
              const on = hover === i;
              /* Keep the readout inside the card at either edge. */
              const edge =
                i < points.length * 0.12
                  ? "left-0 translate-x-0"
                  : i > points.length * 0.88
                    ? "right-0 translate-x-0"
                    : "left-1/2 -translate-x-1/2";

              return (
                <button
                  key={`${p.label}-${i}`}
                  type="button"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${p.label}: ${unit}${p.value.toLocaleString("en-US")}`}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
                >
                  <span
                    className={cn(
                      "block w-full max-w-6 rounded-t-[4px] transition-[height,background-color]",
                      "duration-slow ease-out motion-reduce:transition-none",
                      on ? "bg-primary-hover" : "bg-primary",
                    )}
                    style={{ height: mounted ? `${pct}%` : 0 }}
                  />

                  {/* The peak is the one column worth labelling directly */}
                  {i === peak && !on && (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap
                                 text-[11px] font-semibold tabular-nums text-ink-2"
                      style={{ bottom: `calc(${pct}% + 4px)` }}
                    >
                      {unit}
                      {compact(p.value)}
                    </span>
                  )}

                  {on && (
                    <span
                      className={cn(
                        "pointer-events-none absolute bottom-full z-10 mb-1 flex flex-col rounded-btn border",
                        "border-line bg-card px-2.5 py-1.5 text-left shadow-md",
                        edge,
                      )}
                    >
                      <span className="whitespace-nowrap text-[11px] text-ink-3">{p.label}</span>
                      <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums">
                        {unit}
                        {p.value.toLocaleString("en-US")}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* X axis */}
      <div className="flex gap-3">
        <span className="w-11 flex-shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 gap-[2px]">
          {points.map((p, i) => (
            <span
              key={`${p.label}-x-${i}`}
              className="min-w-0 flex-1 truncate text-center text-[10px] tabular-nums text-ink-3"
            >
              {i % step === 0 ? p.label : ""}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

/* ============================================================
   DONUT — parts of one whole.
   ============================================================ */

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
}

export function DonutChart({
  slices,
  size = 180,
  thickness = 26,
  /** Rendered under the centre total. */
  caption = "รวมทั้งหมด",
  format = (n: number) => n.toLocaleString("en-US"),
  className,
  "data-testid": testId,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  caption?: string;
  format?: (n: number) => string;
  className?: string;
  "data-testid"?: string;
}) {
  const mounted = useMounted();
  const [hover, setHover] = useState<string | null>(null);
  const titleId = useId();

  const total = slices.reduce((t, s) => t + s.value, 0);
  if (!slices.length || total <= 0) return null;

  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  /* 2px of surface between touching arcs — the gap does the separating,
     so no arc ever needs a stroke drawn around it. */
  const gap = 2;

  let offset = 0;
  const arcs = slices.map((s) => {
    const share = s.value / total;
    const len = Math.max(0, circ * share - gap);
    const arc = { ...s, share, len, offset, rest: circ - len };
    offset += circ * share;
    return arc;
  });

  const active = arcs.find((a) => a.key === hover);

  return (
    <div
      data-testid={testId}
      className={cn("flex flex-wrap items-center gap-6 max-md:justify-center", className)}
    >
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-labelledby={titleId}
          className="-rotate-90"
        >
          <title id={titleId}>สัดส่วนมูลค่าสินค้าคงคลังตามหมวดหมู่</title>
          {arcs.map((a, i) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={SERIES[i % SERIES.length]}
              strokeWidth={hover === a.key ? thickness + 4 : thickness}
              strokeDasharray={`${mounted ? a.len : 0} ${mounted ? a.rest : circ}`}
              strokeDashoffset={-a.offset}
              className="transition-[stroke-dasharray,stroke-width] duration-slow ease-out motion-reduce:transition-none"
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {/* Centre readout — the hovered slice, or the whole */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-[70%] truncate text-[11px] text-ink-3">
            {active ? active.label : caption}
          </span>
          <span className="text-[19px] font-bold leading-tight tracking-[-0.02em]">
            {format(active ? active.value : total)}
          </span>
          {active && (
            <span className="text-[11px] font-semibold tabular-nums text-ink-2">
              {(active.share * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Legend. Present because colour alone is never the identity channel;
          each row carries its own value, which is also the contrast relief
          for the lighter hues. */}
      <ul className="flex min-w-[190px] flex-1 flex-col gap-2">
        {arcs.map((a, i) => (
          <li
            key={a.key}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
            className={cn(
              "flex items-center gap-2 rounded-sm px-1 py-0.5 transition-colors duration-fast",
              hover === a.key && "bg-surface",
            )}
          >
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]"
              style={{ background: SERIES[i % SERIES.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{a.label}</span>
            <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums">
              {format(a.value)}
            </span>
            <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-ink-3">
              {(a.share * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
