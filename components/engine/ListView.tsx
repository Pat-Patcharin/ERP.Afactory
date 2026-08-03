"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, getPath } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { ListSchema, RecordBase } from "@/lib/types";
import {
  ActionMenuItems,
  Button,
  Card,
  Checkbox,
  Empty,
  FieldShell,
  IconButton,
  Menu,
  MenuSep,
  Pagination,
  SearchInput,
  Select,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { useActionCtx } from "./useActionCtx";
import { ListHero } from "./ListHero";
import { FilterDrawer } from "./FilterDrawer";
import { BlockRenderer } from "./BlockRenderer";

/**
 * Schema-driven master list. Renders the toolbar, status tabs with live
 * counts, sortable table, bulk actions, row menu and pagination from a config
 * object — Product and Purchase Order drive the exact same component.
 *
 * Mount with `key={schema.key}` so switching masters resets filters rather
 * than carrying a Product search across to Warehouse.
 */
export function ListView<T extends RecordBase>({ schema }: { schema: ListSchema<T> }) {
  const ctx = useActionCtx();
  const revision = useUI((s) => s.revision);
  const setFilterDrawer = useUI((s) => s.setFilterDrawer);

  const [tab, setTab] = useState(schema.tabs[0]?.key ?? "all");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);

  /* Column visibility. Seeded from the schema so the server and the first
     client render agree; the saved choice loads after mount. */
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(schema.columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const colStoreKey = `afactory:cols:${schema.key}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(colStoreKey);
      if (saved) setHidden(new Set(JSON.parse(saved) as string[]));
    } catch {
      /* A blocked or corrupt store just means the defaults stand. */
    }
  }, [colStoreKey]);

  const setColumnHidden = (key: string, hide: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (hide) next.add(key);
      else next.delete(key);
      try {
        window.localStorage.setItem(colStoreKey, JSON.stringify([...next]));
      } catch {
        /* Persistence is a convenience, never a requirement. */
      }
      return next;
    });

  const columns = useMemo(
    () => schema.columns.filter((c) => c.locked || !hidden.has(c.key)),
    [schema.columns, hidden],
  );

  // `revision` is the invalidation signal: mock data lives in plain arrays, so
  // a mutation bumps the counter and every list recomputes.
  const all = useMemo(
    () => schema.source(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, revision],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeTab = schema.tabs.find((t) => t.key === tab);

    const out = all.filter((rec) => {
      if (q) {
        const hay = schema.searchFields
          .map((f) => String(getPath(rec, f) ?? ""))
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of schema.filters) {
        const v = filters[f.id];
        if (v && !f.test(rec, v)) return false;
      }
      if (activeTab?.test && !activeTab.test(rec)) return false;
      return true;
    });

    if (sortKey) {
      const col = schema.columns.find((c) => c.key === sortKey);
      if (col) {
        const val = col.sortValue ?? ((rec: T) => getPath(rec, sortKey) as string | number);
        out.sort((a, b) => {
          const x = val(a);
          const y = val(b);
          const r =
            typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x).localeCompare(String(y), "th");
          return sortAsc ? r : -r;
        });
      }
    }
    return out;
  }, [all, query, filters, tab, sortKey, sortAsc, schema]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const selectedRows = rows.filter((r) => selected.has(r.code));
  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.code));

  /* Where each filter renders. `test` is identical either way — this only
     decides whether the control sits on the toolbar or in the drawer. */
  const quickFilters = schema.filters.filter((f) => !f.advanced);
  const advancedFilters = schema.filters.filter((f) => f.advanced);
  const activeAdvanced = advancedFilters.filter((f) => filters[f.id]).length;

  const setFilter = (id: string, value: string) => {
    setFilters((s) => ({ ...s, [id]: value }));
    setPage(1);
  };

  const clearAdvanced = () => {
    setFilters((s) => {
      const next = { ...s };
      for (const f of advancedFilters) delete next[f.id];
      return next;
    });
    setPage(1);
  };

  const reset = () => {
    setQuery("");
    setFilters({});
    setTab(schema.tabs[0]?.key ?? "all");
    setPage(1);
  };

  const toggleSort = (key: string) => {
    setSortAsc(sortKey === key ? !sortAsc : true);
    setSortKey(key);
  };

  const toggleRow = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const bulkSetStatus = (status: string, verb: string) => {
    selectedRows.forEach((r) => {
      (r as Record<string, unknown>).status = status;
    });
    setSelected(new Set());
    ctx.refresh();
    ctx.toast(`${verb}แล้ว`, `${selectedRows.length} รายการ`, "success");
  };

  const hero = schema.hero?.(ctx);
  const secondary = schema.secondaryActions?.(ctx) ?? [];
  /* Documents supply their own batch verbs; master data falls back below. */
  const bulk = selectedRows.length
    ? schema.bulkActions?.(selectedRows, ctx)
    : undefined;

  return (
    <main className="max-w-[1600px] px-6 pb-12 pt-8 max-md:px-4 max-md:pb-10 max-md:pt-5">
      {/* ---------- Page head ---------- */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-h1 font-semibold">{schema.title}</h1>
          <p className="mt-2 text-ink-2">{schema.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!schema.hideImportExport && (
            <>
              <Button
                onClick={() =>
                  ctx.toast("นำเข้าข้อมูล", "เลือกไฟล์ Excel เพื่อนำเข้า — Future support", "info")
                }
              >
                <Icon name="download" size={17} strokeWidth={2} />
                Import
              </Button>
              <Button
                onClick={() =>
                  ctx.toast("ส่งออกข้อมูล", `กำลังเตรียมไฟล์ ${rows.length} รายการ`, "info")
                }
              >
                <Icon name="upload" size={17} strokeWidth={2} />
                Export
              </Button>
            </>
          )}
          {secondary.map((a) => (
            <Button key={a.label} onClick={a.run}>
              {a.icon && <Icon name={a.icon} size={16} strokeWidth={2} />}
              {a.label}
            </Button>
          ))}
          {!schema.hideCreate && (
            <Button
              variant="primary"
              onClick={() =>
                schema.onCreate ? schema.onCreate(ctx) : ctx.goto(`/m/${schema.key}/new`)
              }
            >
              <Icon name="plus" size={17} strokeWidth={2} />
              {schema.primaryLabel}
            </Button>
          )}
        </div>
      </div>

      {hero && <ListHero hero={hero} onTab={setTab} />}

      {/* ---------- Status tabs with live counts ---------- */}
      <Tabs
        className="mb-6"
        active={tab}
        onChange={(k) => {
          setTab(k);
          setPage(1);
        }}
        items={schema.tabs.map((t) => ({
          key: t.key,
          label: `${t.label} (${fmt(t.test ? all.filter(t.test).length : all.length)})`,
        }))}
      />

      {/* ---------- Search + quick filters ---------- */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] max-w-[320px] flex-1 max-md:max-w-none max-md:basis-full">
          <FieldShell label="Search">
            <SearchInput
              value={query}
              placeholder={schema.searchPlaceholder ?? "ค้นหา..."}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </FieldShell>
        </div>

        <div className="flex flex-wrap gap-3 max-md:w-full">
          {quickFilters.map((f) => (
            <div key={f.id} className="w-[170px] max-md:min-w-[140px] max-md:flex-1">
              <FieldShell label={f.label}>
                <Select
                  aria-label={f.label}
                  value={filters[f.id] ?? ""}
                  onChange={(e) => {
                    setFilters((s) => ({ ...s, [f.id]: e.target.value }));
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  {f.options().map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </FieldShell>
            </div>
          ))}
        </div>

        <Button onClick={reset}>Reset</Button>
        {/* Always present, so every list has the same toolbar. Lists with
            nothing advanced open a drawer that says so. */}
        <Button onClick={() => setFilterDrawer(true)}>
          <Icon name="filter" size={17} strokeWidth={2} />
          More Filters
          {/* The count is the only cue that a hidden filter is narrowing the
              table — without it a drawer filter is invisible. */}
          {activeAdvanced > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-primary px-1.5 text-[11px] font-semibold text-white">
              {activeAdvanced}
            </span>
          )}
        </Button>
      </div>

      {/* ---------- Bulk actions appear only when rows are selected ---------- */}
      {selected.size > 0 && (
        <div className="mb-4 flex animate-slideDown flex-wrap items-center gap-4 rounded-btn border border-primary-border bg-primary-soft px-5 py-3">
          <span className="font-semibold text-primary-active">
            {selected.size} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {bulk ? (
              bulk.map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant={a.danger ? "danger" : "secondary"}
                  onClick={() => {
                    a.run();
                    setSelected(new Set());
                  }}
                >
                  {a.icon && <Icon name={a.icon} size={15} />}
                  {a.label}
                </Button>
              ))
            ) : (
              <>
                <Button size="sm" onClick={() => bulkSetStatus("Active", "เปิดใช้งาน")}>
                  Activate
                </Button>
                <Button size="sm" onClick={() => bulkSetStatus("Inactive", "ปิดใช้งาน")}>
                  Deactivate
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={() =>
                ctx.toast("ส่งออกรายการที่เลือก", `${selected.size} รายการ`, "info")
              }
            >
              Export
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Count + table tools ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-semibold tnum">
          {fmt(rows.length)} {schema.entityPlural}
        </span>
        <div className="ml-auto flex gap-2">
          <Menu
            align="right"
            className="max-h-[420px] w-[260px] overflow-y-auto"
            trigger={({ toggle }) => (
              <Button size="sm" onClick={toggle}>
                <Icon name="columns" size={16} strokeWidth={2} />
                Columns
                {hidden.size > 0 && (
                  <span className="ml-1 rounded-pill bg-primary-soft px-1.5 text-[11px] font-bold text-primary">
                    {columns.length}/{schema.columns.length}
                  </span>
                )}
              </Button>
            )}
          >
            {() => (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setHidden(new Set());
                    try {
                      window.localStorage.removeItem(colStoreKey);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-[13px] font-semibold transition-colors duration-fast hover:bg-neutral-soft"
                >
                  <Icon name="eye" size={16} className="text-ink-2" />
                  แสดงทุกคอลัมน์
                </button>
                <MenuSep />
                {schema.columns.map((c) => (
                  <label
                    key={c.key}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-[13px]",
                      c.locked
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-neutral-soft",
                    )}
                  >
                    <Checkbox
                      checked={c.locked || !hidden.has(c.key)}
                      disabled={c.locked}
                      onChange={(e) => setColumnHidden(c.key, !e.target.checked)}
                    />
                    {c.label}
                  </label>
                ))}
              </>
            )}
          </Menu>
          <Button
            size="sm"
            onClick={() => {
              setCompact((c) => !c);
              ctx.toast(
                "เปลี่ยนความหนาแน่น",
                compact ? "มุมมองแบบปกติ" : "มุมมองแบบกระชับ",
                "info",
              );
            }}
          >
            <Icon name="rows" size={16} strokeWidth={2} />
            Density
          </Button>
          <Button size="sm" iconOnly aria-label="Refresh" onClick={ctx.refresh}>
            <Icon name="refresh" size={16} strokeWidth={2} />
          </Button>
        </div>
      </div>

      {/* ---------- Table ---------- */}
      <Card>
        <TableWrap>
          <Table compact={compact} className="group/t">
            <thead>
              <tr>
                <Th className="w-11 pl-5">
                  <Checkbox
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          selected.size > 0 && !allOnPageSelected;
                    }}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        pageRows.forEach((r) =>
                          e.target.checked ? next.add(r.code) : next.delete(r.code),
                        );
                        return next;
                      })
                    }
                    aria-label="Select all"
                  />
                </Th>
                {columns.map((c) => (
                  <Th
                    key={c.key}
                    align={c.align}
                    sortable={c.sortable}
                    sorted={sortKey === c.key && (sortAsc ? "asc" : "desc")}
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                  >
                    {c.label}
                  </Th>
                ))}
                <Th align="right" className="w-14">
                  Action
                </Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2}>
                    <Empty
                      heading={schema.emptyTitle ?? "ไม่พบข้อมูลที่ตรงกับเงื่อนไข"}
                      message="ลองปรับคำค้นหาหรือล้างตัวกรองเพื่อดูผลลัพธ์เพิ่มเติม"
                      action={<Button onClick={reset}>Clear filters</Button>}
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((rec) => (
                  <Tr
                    key={rec.code}
                    clickable
                    selected={selected.has(rec.code)}
                    onClick={(e) => {
                      // Let the checkbox and the row menu win over the row.
                      if ((e.target as HTMLElement).closest("input,button,a")) return;
                      if (schema.onRowClick) schema.onRowClick(rec, ctx);
                      else ctx.quickView(schema.key, rec);
                    }}
                  >
                    <Td className="w-11 pl-5">
                      <Checkbox
                        checked={selected.has(rec.code)}
                        onChange={() => toggleRow(rec.code)}
                        aria-label={`Select ${rec.code}`}
                      />
                    </Td>
                    {columns.map((c) => (
                      <Td key={c.key} align={c.align} muted={c.muted}>
                        {c.cell(rec)}
                      </Td>
                    ))}
                    <Td align="right" className="w-14">
                      <Menu
                        trigger={({ toggle }) => (
                          <IconButton onClick={toggle} aria-label="Row actions">
                            <Icon name="more" size={18} />
                          </IconButton>
                        )}
                      >
                        {(close) => (
                          <ActionMenuItems
                            actions={schema.rowActions(rec, ctx)}
                            record={rec}
                            close={close}
                          />
                        )}
                      </Menu>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>

        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={rows.length}
          info={`Showing ${rows.length ? start + 1 : 0} to ${Math.min(
            start + pageSize,
            rows.length,
          )} of ${fmt(rows.length)} ${schema.entityPlural.toLowerCase()}`}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </Card>

      {/* Schema-supplied summary widgets, drawn by the detail-tab renderer.
          They sit below the table because they summarise what it filtered. */}
      {schema.panels && (
        <div className="mt-6 flex flex-col gap-4">
          <BlockRenderer blocks={schema.panels(rows, ctx)} />
        </div>
      )}

      <FilterDrawer
        filters={advancedFilters}
        values={filters}
        onChange={setFilter}
        onClear={clearAdvanced}
      />
    </main>
  );
}

/** Compact status pill helper shared by list columns. */
export const cellLow = (low: boolean) =>
  cn(low && "font-semibold text-danger");
