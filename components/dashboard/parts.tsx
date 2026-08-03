"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { PRIORITY_TONE, tone as toneOf } from "@/lib/badges";
import { money0 } from "@/lib/format";
import { Badge, Card, Tabs } from "@/components/ui";
import {
  SOFT,
  WsRow,
  WsTable,
  WsTd,
  WsTh,
  asIcon,
  useGoPage,
} from "@/components/workspace/parts";
import type {
  DashAlert,
  DashDocRow,
  DashFinanceStat,
  DashInventoryStat,
  DashOverviewRow,
  DashTask,
  DocTab,
} from "@/lib/domain/dashboard";

/* ============================================================
   DASHBOARD widgets.

   The workspaces already own the tile-and-grid vocabulary; these
   are the three shapes the Command Center needs that a workspace
   never did — a queue read as a list, a module summary read as a
   ledger, and a tabbed document feed. Everything else on the page
   is a workspace part reused as-is.

   Every widget is a link into the module that resolves it. A
   dashboard that reports a number you cannot act on is a report,
   not a command center.
   ============================================================ */

/** Left severity rail — the alert and task rows share it. */
const RAIL: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
};

/** Card shell with a heading and an optional right-hand slot. */
export function DashCard({
  title,
  desc,
  action,
  children,
  className,
  "data-testid": testId,
}: {
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <Card className={cn("flex flex-col overflow-hidden p-0", className)} data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
          {desc && <span className="mt-0.5 text-cap text-ink-2">{desc}</span>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/* ---------- Section 3 · My pending tasks ---------- */

export function DashTaskList({ tasks }: { tasks: DashTask[] }) {
  const go = useGoPage();
  return (
    <ul data-testid="dash-task-list" className="flex flex-col">
      {tasks.map((t) => (
        <li key={t.key}>
          <button
            onClick={() => go(t.goto)}
            className="group flex w-full items-center gap-3 border-b border-line px-5 py-[11px] text-left
                       transition-colors duration-fast last:border-b-0 hover:bg-surface"
          >
            <span
              className={cn("h-8 w-[3px] flex-shrink-0 rounded-pill", RAIL[t.tone] ?? RAIL.info)}
              aria-hidden
            />
            <span
              className={cn(
                "grid h-8 w-8 flex-shrink-0 place-items-center rounded-btn",
                SOFT[t.tone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(t.icon)} size={15} />
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{t.title}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                {t.priority}
                {t.future && <span className="text-ink-3">· Future support</span>}
              </span>
            </span>

            <Badge tone={toneOf(PRIORITY_TONE, t.priority)}>{t.count}</Badge>

            <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-cap font-semibold text-info opacity-0 transition-opacity duration-fast group-hover:opacity-100 max-md:opacity-100">
              Open
              <Icon name="arrowRight" size={13} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Section 4 · Business alerts ---------- */

export function DashAlertList({ alerts }: { alerts: DashAlert[] }) {
  const go = useGoPage();
  return (
    <ul data-testid="dash-alert-list" className="flex flex-col">
      {alerts.map((a) => (
        <li key={a.key}>
          <button
            onClick={() => go(a.goto)}
            className="group flex w-full items-center gap-3 border-b border-line px-5 py-[11px] text-left
                       transition-colors duration-fast last:border-b-0 hover:bg-surface"
          >
            <span
              className={cn(
                "grid h-8 w-8 flex-shrink-0 place-items-center rounded-btn",
                SOFT[a.tone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(a.icon)} size={15} />
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{a.title}</span>
              <span className="text-[11px] text-ink-3">
                {a.severity} · View Detail
              </span>
            </span>

            <span className="flex flex-shrink-0 items-baseline gap-1">
              <span className="tnum text-[19px] font-bold leading-none tracking-[-0.02em]">
                {a.count}
              </span>
              <span className="text-[11px] text-ink-3">{a.unit}</span>
            </span>

            <Icon
              name="chevronRight"
              size={16}
              className="flex-shrink-0 text-ink-3 transition-transform duration-fast group-hover:translate-x-0.5"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Sections 5–6 · Module overview ---------- */

export function DashOverview({
  rows,
  testId,
}: {
  rows: DashOverviewRow[];
  testId: string;
}) {
  const go = useGoPage();
  /* One shared scale across the card, so the bars compare to each other
     rather than each to itself. */
  const peak = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div data-testid={testId} className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
        <span className="min-w-0 flex-1">Document</span>
        <span className="w-10 text-right">Total</span>
        <span className="w-12 text-right max-[1100px]:hidden">Today</span>
        <span className="w-14 text-right">Pending</span>
      </div>

      {rows.map((r) => (
        <button
          key={r.key}
          onClick={() => go(r.goto)}
          className="group flex flex-col gap-1.5 border-b border-line px-5 py-2.5 text-left
                     transition-colors duration-fast last:border-b-0 hover:bg-surface"
        >
          <span className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm",
                SOFT[r.tone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(r.icon)} size={13} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.label}</span>
            <span className="w-10 text-right text-[13px] font-semibold tnum">{r.total}</span>
            <span className="w-12 text-right text-[13px] tnum text-ink-2 max-[1100px]:hidden">
              {r.today || "—"}
            </span>
            <span
              className={cn(
                "w-14 text-right text-[13px] font-semibold tnum",
                r.pending > 0 ? "text-warning-text" : "text-ink-3",
              )}
            >
              {r.pending || "—"}
            </span>
          </span>

          {/* Share of the card's busiest document, with the open part on top */}
          <span className="ml-9 block h-[5px] overflow-hidden rounded-pill bg-neutral-soft">
            <span
              className="block h-full rounded-pill bg-primary/25"
              style={{ width: `${(r.total / peak) * 100}%` }}
            >
              <span
                className="block h-full rounded-pill bg-primary"
                style={{ width: `${r.total ? (r.pending / r.total) * 100 : 0}%` }}
              />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Section 7 · Inventory overview ---------- */

export function DashStatGrid({ stats }: { stats: DashInventoryStat[] }) {
  const go = useGoPage();
  return (
    <div
      data-testid="dash-inventory-grid"
      className="grid grid-cols-2 gap-px bg-line max-[420px]:grid-cols-1"
    >
      {stats.map((s) => (
        <button
          key={s.key}
          onClick={() => go(s.goto)}
          className="group flex items-center gap-2.5 bg-card px-5 py-3 text-left transition-colors duration-fast hover:bg-surface"
        >
          <span
            className={cn(
              "grid h-7 w-7 flex-shrink-0 place-items-center rounded-btn",
              SOFT[s.tone] ?? SOFT.info,
            )}
          >
            <Icon name={asIcon(s.icon)} size={14} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[11px] text-ink-2">{s.label}</span>
            <span className="truncate text-[15px] font-bold leading-tight tracking-[-0.01em] tnum">
              {s.value}
              {s.unit && (
                <span className="ml-1 text-[11px] font-medium text-ink-3">{s.unit}</span>
              )}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Section 8 · Finance (placeholder) ---------- */

export function DashFinance({ stats }: { stats: DashFinanceStat[] }) {
  return (
    <div data-testid="dash-finance" className="flex flex-1 flex-col">
      <p className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-5 py-2 text-cap font-medium text-warning-text">
        <Icon name="info" size={14} />
        Finance Module Coming Soon — ตัวเลขฝั่งเจ้าหนี้และกระแสเงินสดเป็นค่าตั้งต้น
      </p>

      <div className="flex flex-1 flex-col">
        {stats.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-3 border-b border-line px-5 py-[9px] last:border-b-0"
          >
            <span
              className={cn(
                "grid h-7 w-7 flex-shrink-0 place-items-center rounded-btn",
                SOFT[s.tone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(s.icon)} size={14} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                {s.label}
                {!s.declared && <Badge tone="success">Live</Badge>}
              </span>
              <span className="truncate text-[11px] text-ink-3">{s.desc}</span>
            </span>
            <span className="flex-shrink-0 text-[15px] font-bold tracking-[-0.01em] tnum">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Section 12 · Recent documents ---------- */

export function DashRecentDocs({
  docs,
  tabs,
}: {
  docs: Record<DocTab, DashDocRow[]>;
  tabs: DocTab[];
}) {
  const [tab, setTab] = useState<DocTab>(tabs[0]);
  const go = useGoPage();
  const rows = docs[tab] ?? [];

  return (
    <Card className="overflow-hidden p-0" data-testid="dash-recent-docs">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-h3 font-semibold tracking-[-0.01em]">Recent Documents</h2>
      </div>

      <Tabs
        items={tabs.map((t) => ({ key: t, label: t }))}
        active={tab}
        onChange={(k) => setTab(k as DocTab)}
        className="px-5"
      />

      <div className="overflow-x-auto">
        <WsTable
          head={
            <>
              <WsTh>Document</WsTh>
              <WsTh>Business Partner</WsTh>
              <WsTh className="max-md:hidden">Date</WsTh>
              <WsTh align="right">Amount</WsTh>
              <WsTh>Status</WsTh>
              <WsTh align="center">Open</WsTh>
            </>
          }
        >
          {rows.map((r) => (
            <WsRow key={`${tab}-${r.code}`} goto={r.goto}>
              <WsTd className="font-medium tnum">{r.code}</WsTd>
              <WsTd>
                <span className="block max-w-[240px] truncate">{r.party || "—"}</span>
              </WsTd>
              <WsTd muted className="tnum max-md:hidden">
                {r.date || "—"}
              </WsTd>
              <WsTd align="right">{r.amount ? money0(Math.round(r.amount)) : "—"}</WsTd>
              <WsTd>
                <Badge tone={r.statusTone}>{r.status}</Badge>
              </WsTd>
              <WsTd align="center">
                <button
                  onClick={() => go(r.goto)}
                  aria-label={`Open ${r.code}`}
                  className="inline-grid h-7 w-7 place-items-center rounded-btn text-ink-3
                             transition-colors duration-fast hover:bg-neutral-soft hover:text-ink"
                >
                  <Icon name="external" size={14} />
                </button>
              </WsTd>
            </WsRow>
          ))}
        </WsTable>
      </div>
    </Card>
  );
}
