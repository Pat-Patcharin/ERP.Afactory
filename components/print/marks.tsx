/* ============================================================
   PRINT MARKS — logo, QR and barcode.

   All three are self-contained SVG. A printed document cannot
   wait on a network request, and an <img> that fails to load
   leaves a hole in a tax document, so nothing here loads.
   ============================================================ */

/**
 * A-Factory mark.
 *
 * Pass `src` — Company Settings → Logo file — and the official artwork is
 * used. Drop the file into `public/` (e.g. `public/logo-afactory.svg`) and
 * set `COMPANY.logoUrl` to "/logo-afactory.svg"; nothing else changes,
 * because every printed page draws its logo through this one component.
 *
 * Without a file it falls back to the vector mark below: the orange bar and
 * the A of the letterhead. That is a reconstruction, not the official asset.
 */
export function AFactoryLogo({ size = 17, src = "" }: { size?: number; src?: string }) {
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- the print sheet
         must not depend on the Next image optimiser at print time. */
      <img
        src={src}
        alt="A-Factory"
        style={{ width: `${size}mm`, height: `${size}mm`, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }

  return (
    <svg
      width={`${size}mm`}
      height={`${size}mm`}
      viewBox="0 0 100 100"
      role="img"
      aria-label="A-Factory"
      style={{ flexShrink: 0 }}
    >
      <rect x="2" y="2" width="96" height="96" rx="10" fill="#F26522" />
      <rect x="10" y="10" width="80" height="80" rx="5" fill="none" stroke="#fff" strokeWidth="3" />
      {/* The A */}
      <path d="M50 24 L72 74 H62 L57.5 63 H42.5 L38 74 H28 Z" fill="#fff" />
      <path d="M50 42 L45.5 54 H54.5 Z" fill="#F26522" />
      <rect x="20" y="80" width="60" height="6" rx="1" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/**
 * The ALL IN · ONE lockup that closes the letterhead — three stacked rows of
 * widely tracked capitals, the middle one carrying the dot. Typographic, so
 * it is set in type rather than traced.
 */
export function AllInOneMark({ label = "ALL IN · ONE" }: { label?: string }) {
  /* "ALL IN · ONE" → the three printed rows. Falls back to one row for any
     other wording, so a changed tagline still renders. */
  const rows = label.split(/\s+/).length === 4 ? ["ALL", "IN ·", "ONE"] : [label];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4mm",
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-label={label}
    >
      {rows.map((r) => (
        <span
          key={r}
          style={{
            fontSize: "8.4pt",
            fontWeight: 800,
            letterSpacing: "0.34em",
            color: "var(--pr-ink)",
            whiteSpace: "nowrap",
          }}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

/**
 * QR placeholder.
 *
 * Deterministic from the document number so the same document always draws
 * the same pattern — a QR that changed between the preview and the print
 * would be worse than none. It encodes nothing: Phase 1 has no verification
 * endpoint, and the spec asks that the destination never carry sensitive
 * data directly.
 */
export function QRPlaceholder({ value, size = 16 }: { value: string; size?: number }) {
  const cells = 21;
  /* Cheap deterministic hash — enough to vary the pattern per document. */
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const on: boolean[] = [];
  let state = h >>> 0;
  for (let i = 0; i < cells * cells; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    on.push(state % 100 < 46);
  }

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (isFinder(r, c)) continue;
      if (!on[r * cells + c]) continue;
      rects.push(<rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#1f2937" />);
    }
  }

  const finder = (x: number, y: number) => (
    <g key={`f${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#1f2937" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#1f2937" />
    </g>
  );

  return (
    <svg
      width={`${size}mm`}
      height={`${size}mm`}
      viewBox={`0 0 ${cells} ${cells}`}
      role="img"
      aria-label={`QR ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width={cells} height={cells} fill="#fff" />
      {rects}
      {finder(0, 0)}
      {finder(cells - 7, 0)}
      {finder(0, cells - 7)}
    </svg>
  );
}

/**
 * Barcode placeholder for the document number.
 *
 * Bar widths derive from the characters, so it scans as a picture of this
 * document and no other. Not a real Code128 symbology — Phase 1 has no
 * barcode library, and a wrong-but-scannable barcode would be worse than an
 * obvious placeholder.
 */
export function BarcodePlaceholder({
  value,
  width = 44,
  height = 9,
}: {
  value: string;
  width?: number;
  height?: number;
}) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  const chars = `${value}${value}`.slice(0, 26);

  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    const w = 1 + (code % 3);
    bars.push({ x, w });
    x += w + 1 + (code % 2);
  }
  const total = x || 1;

  return (
    <svg
      width={`${width}mm`}
      height={`${height}mm`}
      viewBox={`0 0 ${total} 20`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width={total} height="20" fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="20" fill="#1f2937" />
      ))}
    </svg>
  );
}
