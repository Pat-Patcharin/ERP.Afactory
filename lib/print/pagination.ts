import type { PrintConfig, PrintLine, PrintPage } from "./types";

/* ============================================================
   PAGINATION

   The browser's own page breaking is not good enough for a tax
   document: it will split an item across two sheets, and it
   cannot know that the final page needs room for totals and
   signatures. So every page is planned here, in row units,
   before anything renders.

   A ROW UNIT is one printed line of the item table. A plain item
   costs one; an item with two extra description lines costs
   three. An item is never split — if it does not fit in what is
   left, the whole item moves to the next page.
   ============================================================ */

/** Row units an item consumes: its own line plus its extra description lines. */
export const rowUnits = (line: PrintLine): number => 1 + (line.extraLines?.length ?? 0);

export const totalRowUnits = (lines: PrintLine[]): number =>
  lines.reduce((t, l) => t + rowUnits(l), 0);

/**
 * Plan the pages.
 *
 * A single-page document is measured against `lastPageRows`, because that
 * page carries the totals block. Only once it does not fit does the document
 * become multi-page, at which point the first page gets its own (larger)
 * capacity and the middles get theirs.
 */
export function paginate(lines: PrintLine[], config: PrintConfig): PrintPage[] {
  const { firstPageRows, continuationPageRows, lastPageRows } = config;

  /* ---- The common case: everything fits on one sheet. ---- */
  if (totalRowUnits(lines) <= lastPageRows) {
    return [
      {
        page: 1,
        lines,
        used: totalRowUnits(lines),
        capacity: lastPageRows,
        isFirst: true,
        isLast: true,
      },
    ];
  }

  /* ---- Multi-page: fill greedily, never splitting an item. ---- */
  const buckets: PrintLine[][] = [];
  let current: PrintLine[] = [];
  let used = 0;

  for (const line of lines) {
    const cost = rowUnits(line);
    const capacity = buckets.length === 0 ? firstPageRows : continuationPageRows;

    /* An item larger than a whole page still has to go somewhere: it takes
       a page of its own rather than being cut in half. */
    if (used > 0 && used + cost > capacity) {
      buckets.push(current);
      current = [];
      used = 0;
    }
    current.push(line);
    used += cost;
  }
  if (current.length) buckets.push(current);

  /* ---- The last page must leave room for totals and signatures.
     If it holds more than `lastPageRows`, push the tail onto a new sheet;
     the page it came from becomes a continuation page, whose capacity is
     larger, so it stays valid. ---- */
  for (let guard = 0; guard < 100; guard++) {
    const last = buckets[buckets.length - 1];
    if (totalRowUnits(last) <= lastPageRows) break;

    const moved: PrintLine[] = [];
    while (last.length > 1 && totalRowUnits(last) > lastPageRows) {
      moved.unshift(last.pop()!);
    }
    /* One oversized item cannot be moved off its own page — stop rather
       than loop. The renderer lets it overflow, which is visible and
       correctable, unlike a silent truncation. */
    if (!moved.length) break;
    buckets.push(moved);
  }

  return buckets.map((bucket, i) => {
    const isFirst = i === 0;
    const isLast = i === buckets.length - 1;
    return {
      page: i + 1,
      lines: bucket,
      used: totalRowUnits(bucket),
      capacity: isLast ? lastPageRows : isFirst ? firstPageRows : continuationPageRows,
      isFirst,
      isLast,
    };
  });
}

/**
 * Blank rows that pad a short page to a constant height.
 *
 * They are visual only — the printed form keeps the same shape whether it
 * carries three items or fifteen, which is what makes a stack of them
 * readable. Never editable, never counted as data.
 */
export const fillerRows = (page: PrintPage): number => Math.max(0, page.capacity - page.used);
