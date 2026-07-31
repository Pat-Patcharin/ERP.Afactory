"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { Select } from "./Field";

/** Page numbers with an ellipsis once the range grows past the window. */
function pageWindow(total: number, page: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  info,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  info: string;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const btn =
    "grid h-[34px] min-w-[34px] place-items-center rounded-btn px-2 font-medium " +
    "transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4">
      <span className="text-[13px] text-ink-2">{info}</span>

      <div className="ml-auto flex items-center gap-1 max-md:ml-0 max-md:w-full">
        <button
          className={cn(btn, "text-ink-2 hover:bg-neutral-soft hover:text-ink")}
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous"
        >
          <Icon name="chevronLeft" size={16} />
        </button>

        {pageWindow(pages, page).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-ink-3">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={cn(
                btn,
                p === page
                  ? "bg-primary text-white"
                  : "text-ink-2 hover:bg-neutral-soft hover:text-ink",
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          className={cn(btn, "text-ink-2 hover:bg-neutral-soft hover:text-ink")}
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next"
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <Select
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
        className="h-[34px] w-[110px] text-[13px]"
        aria-label="Rows per page"
      >
        <option value={20}>20 / page</option>
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
      </Select>
    </div>
  );
}
