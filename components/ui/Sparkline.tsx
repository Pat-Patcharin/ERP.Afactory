import { cn } from "@/lib/utils";

/**
 * Inline trend line built from a polyline — no chart library. Used in supplier
 * performance and sales-rep KPI rows where the shape matters more than the
 * exact values.
 */
export function Sparkline({
  points,
  width = 72,
  height = 26,
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!points.length) return null;

  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (width - pad * 2) / Math.max(1, points.length - 1);

  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (height - pad * 2) * (1 - (p - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const dir =
    points[points.length - 1] > points[0]
      ? "up"
      : points[points.length - 1] < points[0]
        ? "down"
        : "flat";
  const stroke =
    dir === "up"
      ? "var(--c-success)"
      : dir === "down"
        ? "var(--c-danger)"
        : "var(--c-warning)";

  const [lx, ly] = coords[coords.length - 1].split(",");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
      className={cn("inline-block align-middle", className)}
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r={2} fill={stroke} />
    </svg>
  );
}

/** Decorative barcode bars derived from the digits — display only. */
export function Barcode({ code }: { code: string }) {
  const s = String(code ?? "");
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-14 items-end">
        {[...s].map((ch, i) => {
          const d = parseInt(ch, 10) || 1;
          return (
            <span key={i} className="flex h-full">
              <i className="block h-full bg-ink" style={{ width: 1 + (d % 3) }} />
              <i className="block h-full" style={{ width: 1 + (d % 2) }} />
            </span>
          );
        })}
      </div>
      <span className="text-cap tracking-[0.14em] text-ink-2 tnum">{s}</span>
    </div>
  );
}
