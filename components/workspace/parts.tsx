"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, ICONS, type IconName } from "@/lib/icons";
import { PRIORITY_TONE, tone as toneOf } from "@/lib/badges";
import { pageHref } from "@/lib/routes";
import { useUI } from "@/lib/store";
import type { BadgeTone } from "@/lib/types";
import { Badge, Button, Card, IconButton, Menu, MenuItem, Sparkline } from "@/components/ui";

/* ============================================================
   Shared workspace building blocks. Both the Purchase and the
   Outbound command centers are assembled from these, so the two
   read as one system rather than two dashboards.
   ============================================================ */

/** Soft tint pairs. Deliberately soft: background is never a strong fill. */
export const SOFT: Record<string, string> = {
  danger: "bg-danger-soft text-danger-text",
  warning: "bg-warning-soft text-warning-text",
  info: "bg-info-soft text-info-text",
  success: "bg-success-soft text-success-text",
};

const SOFT_BORDER: Record<string, string> = {
  danger: "border-[#FECACA]",
  warning: "border-[#FDE68A]",
  info: "border-[#BFDBFE]",
  success: "border-[#BBF7D0]",
};

const TONE_TEXT: Record<string, string> = {
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
};

/** Icon names arrive from data as plain strings; fall back rather than crash. */
export const asIcon = (name: string | undefined): IconName =>
  name && name in ICONS ? (name as IconName) : "box";

/** Navigate by page name, so workspace data stays route-agnostic. */
export function useGoPage() {
  const router = useRouter();
  return (page: string) => router.push(pageHref(page));
}

/* ---------- Morning brief ---------- */
export function WsBrief({
  greeting,
  lines,
  lastUpdated,
  icon = "workspace",
}: {
  greeting: string;
  lines: ReactNode[];
  lastUpdated: string;
  icon?: IconName;
}) {
  const toast = useUI((s) => s.toast);
  const [stamp, setStamp] = useState(lastUpdated);
  const [spinning, setSpinning] = useState(false);

  return (
    <Card className="flex flex-wrap items-center gap-4 border-primary-border bg-gradient-to-r from-primary-soft to-card px-5 py-4">
      <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-btn border border-primary-border bg-card text-primary">
        <Icon name={icon} size={20} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-cap font-bold tracking-[0.01em] text-primary-active">
          {greeting}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-body leading-normal text-ink-2">
          {lines.map((l, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-line-strong">•</span>}
              {l}
            </span>
          ))}
        </span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 max-md:w-full max-md:justify-between max-md:border-t max-md:border-primary-border max-md:pt-3">
        <span className="whitespace-nowrap text-cap text-ink-3">
          Last updated: {stamp}
        </span>
        <IconButton
          aria-label="Refresh"
          onClick={() => {
            setSpinning(true);
            const t = new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
            setTimeout(() => {
              setStamp(t);
              setSpinning(false);
              toast("อัปเดตข้อมูลแล้ว", `ข้อมูลล่าสุด ณ เวลา ${t}`, "success");
            }, 500);
          }}
        >
          <Icon name="refresh" size={17} className={cn(spinning && "animate-spinOnce")} />
        </IconButton>
      </div>
    </Card>
  );
}

/* ---------- Headline KPI cards ---------- */
export interface WsKpi {
  icon: string;
  value: string;
  unit?: string;
  title: string;
  desc: string;
  link?: string;
  goto: string;
  tone: string;
  bar?: number;
  sub?: string;
}

export function WsKpiCards({ kpis, cols = 4 }: { kpis: WsKpi[]; cols?: 4 | 5 }) {
  const go = useGoPage();
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 5
          ? "grid-cols-5 max-[1400px]:grid-cols-3 max-[900px]:grid-cols-2"
          : "grid-cols-4 max-[1280px]:grid-cols-2 max-md:grid-cols-1",
      )}
    >
      {kpis.map((k) => (
        <button
          key={k.title}
          onClick={() => go(k.goto)}
          className={cn(
            "group flex flex-col gap-2 rounded-card border border-line bg-card p-5 text-left shadow-xs",
            "transition-[box-shadow,transform,border-color] duration-base ease-out",
            "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md",
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-10 w-10 flex-shrink-0 place-items-center rounded-btn",
                SOFT[k.tone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(k.icon)} size={20} />
            </span>
            <span className="text-body font-semibold">{k.title}</span>
          </div>

          <span
            className={cn(
              "my-1 text-[38px] font-bold leading-none tracking-[-0.03em] tnum max-md:text-[32px]",
              TONE_TEXT[k.tone] ?? "text-ink",
            )}
          >
            {k.value}
            {k.unit && (
              <span className="ml-1 text-[13px] font-semibold text-ink-3">{k.unit}</span>
            )}
          </span>

          {k.bar !== undefined && (
            <span className="my-1 block h-[5px] overflow-hidden rounded-pill bg-line">
              <span
                className="block h-full rounded-pill bg-primary"
                style={{ width: `${Math.min(100, k.bar)}%` }}
              />
            </span>
          )}

          <span className="text-cap text-ink-2">{k.desc}</span>

          {k.sub && (
            <span
              className={cn(
                "self-start rounded-pill px-2 py-0.5 text-[11px] font-semibold",
                SOFT[k.tone] ?? SOFT.info,
              )}
            >
              {k.sub}
            </span>
          )}

          {k.link && (
            <span className="mt-2 inline-flex items-center gap-1 text-cap font-semibold text-info group-hover:text-info-text">
              {k.link}
              <Icon
                name="arrowRight"
                size={14}
                className="transition-transform duration-fast group-hover:translate-x-0.5"
              />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- Quick actions rail ---------- */
export function WsQuickActions({
  actions,
  cols = 2,
}: {
  actions: { label: string; icon: string; goto: string; accent?: boolean }[];
  cols?: 2 | 5;
}) {
  const go = useGoPage();
  const toast = useUI((s) => s.toast);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h3 font-semibold tracking-[-0.01em]">Quick Actions</h2>
        <IconButton
          aria-label="Configure"
          onClick={() => toast("ตั้งค่า Quick Actions", "Future support", "info")}
        >
          <Icon name="sliders" size={16} />
        </IconButton>
      </div>

      <div
        data-testid="ws-quick-actions"
        className={cn(
          "grid gap-3",
          cols === 2
            ? "grid-cols-2 max-[1280px]:grid-cols-5 max-md:grid-cols-2"
            : "grid-cols-5 max-md:grid-cols-2",
        )}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => go(a.goto)}
            className={cn(
              "group flex flex-col items-center gap-3 rounded-btn border border-line bg-card px-3 py-5 text-center",
              "transition-[box-shadow,transform,border-color] duration-base ease-out",
              "hover:-translate-y-[3px] hover:border-primary-border hover:shadow-md",
            )}
          >
            <span
              className={cn(
                "grid h-12 w-12 place-items-center rounded-[14px] transition-colors duration-base",
                a.accent
                  ? "bg-primary text-white group-hover:bg-primary-hover"
                  : "bg-neutral-soft text-ink-2 group-hover:bg-primary-soft group-hover:text-primary",
              )}
            >
              <Icon name={asIcon(a.icon)} size={22} />
            </span>
            <span className="text-body font-medium leading-[1.35]">{a.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Need attention alerts ---------- */
export function WsAttention({
  title = "Need Attention",
  items,
  cols = 4,
}: {
  title?: string;
  items: {
    icon: string;
    value: number | string;
    unit?: string;
    title: string;
    link?: string;
    goto: string;
    tone: string;
  }[];
  cols?: 2 | 4;
}) {
  const go = useGoPage();
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
      <div
        className={cn(
          "grid gap-3",
          cols === 2 ? "grid-cols-2 max-md:grid-cols-1" : "grid-cols-4 max-[1280px]:grid-cols-2 max-md:grid-cols-1",
        )}
      >
        {items.map((a) => (
          <button
            key={a.title}
            onClick={() => go(a.goto)}
            className={cn(
              "group flex flex-col rounded-btn border p-4 text-left",
              "transition-[box-shadow,transform] duration-base ease-out hover:-translate-y-0.5 hover:shadow-sm",
              SOFT[a.tone] ?? SOFT.info,
              SOFT_BORDER[a.tone] ?? SOFT_BORDER.info,
            )}
          >
            <span className="mb-0.5 flex items-center gap-3">
              <Icon name={asIcon(a.icon)} size={18} />
              <span className="text-body font-semibold text-ink">{a.title}</span>
            </span>
            <span className="text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-ink tnum">
              {a.value}
            </span>
            {a.unit && <span className="-mt-0.5 text-cap text-ink-2">{a.unit}</span>}
            {a.link && (
              <span className="mt-2 inline-flex items-center gap-1 text-cap font-semibold">
                {a.link}
                <Icon
                  name="arrowRight"
                  size={13}
                  className="transition-transform duration-fast group-hover:translate-x-0.5"
                />
              </span>
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Table card with an optional "View All" ---------- */
export function WsTableCard({
  title,
  viewAll,
  children,
  className,
}: {
  title: ReactNode;
  viewAll?: string;
  children: ReactNode;
  className?: string;
}) {
  const go = useGoPage();
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
        {viewAll && (
          <button
            onClick={() => go(viewAll)}
            className="group inline-flex items-center gap-1 text-cap font-semibold text-info hover:text-info-text"
          >
            View All
            <Icon
              name="arrowRight"
              size={14}
              className="transition-transform duration-fast group-hover:translate-x-0.5"
            />
          </button>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

/** Table shell matching the workspace density (no outer card border). */
export function WsTable({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr>{head}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function WsTh({
  children,
  align,
  className,
}: {
  children: ReactNode;
  align?: "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-line bg-surface px-4 py-3 text-cap font-semibold tracking-[0.02em] text-ink-2",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function WsTd({
  children,
  align,
  muted,
  className,
}: {
  children: ReactNode;
  align?: "right" | "center";
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-line px-4 py-3",
        align === "right" && "text-right tnum",
        align === "center" && "text-center",
        muted && "text-ink-2",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function WsRow({
  goto,
  children,
}: {
  goto: string;
  children: ReactNode;
}) {
  const go = useGoPage();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a")) return;
        go(goto);
      }}
      className="cursor-pointer transition-colors duration-fast last:[&>td]:border-b-0 hover:bg-surface"
    >
      {children}
    </tr>
  );
}

/* ---------- Page header with document actions ---------- */
export function WsPageHeader({
  title,
  subtitle,
  onRefresh,
  extraActions = [],
}: {
  title: string;
  subtitle: string;
  onRefresh?: () => void;
  extraActions?: { label: string; icon: IconName; run: () => void }[];
}) {
  const toast = useUI((s) => s.toast);
  const [spinning, setSpinning] = useState(false);

  return (
    <div data-testid="ws-page-header" className="flex flex-wrap items-start gap-4">
      <div className="min-w-[260px] flex-1">
        <h1 className="text-h1 font-semibold">{title}</h1>
        <p className="mt-2 text-ink-2">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 max-md:w-full">
        <Button
          onClick={() => {
            setSpinning(true);
            setTimeout(() => {
              setSpinning(false);
              onRefresh?.();
              toast("รีเฟรชข้อมูลแล้ว", "ดึงข้อมูลคลังสินค้าล่าสุด", "success");
            }, 500);
          }}
        >
          <Icon
            name="refresh"
            size={17}
            strokeWidth={2}
            className={cn(spinning && "animate-spinOnce")}
          />
          Refresh
        </Button>
        <Button
          onClick={() =>
            toast("ส่งออกข้อมูล", "กำลังเตรียมไฟล์ Excel — Future support", "info")
          }
        >
          <Icon name="upload" size={17} strokeWidth={2} />
          Export
        </Button>
        <Button
          onClick={() =>
            toast("สั่งพิมพ์", "เตรียมรายงานสำหรับพิมพ์ — Future support", "info")
          }
        >
          <Icon name="printer" size={17} strokeWidth={2} />
          Print
        </Button>
        <Menu
          trigger={({ toggle }) => (
            <Button onClick={toggle}>
              <Icon name="more" size={17} strokeWidth={2} />
              More Actions
            </Button>
          )}
        >
          {(close) =>
            extraActions.map((a) => (
              <MenuItem
                key={a.label}
                icon={a.icon}
                onClick={() => {
                  close();
                  a.run();
                }}
              >
                {a.label}
              </MenuItem>
            ))
          }
        </Menu>
      </div>
    </div>
  );
}

/* ---------- KPI cards carrying a trend ---------- */
export interface WsTrendKpi {
  key: string;
  icon: string;
  value: string;
  unit?: string;
  title: string;
  desc: string;
  delta: number;
  points: number[];
  goto: string;
  tone: string;
}

/**
 * Denser than WsKpiCards because twelve of them share one screen. The spark
 * carries the shape, the chip carries the number — neither needs a chart lib.
 */
export function WsTrendKpiCards({ kpis }: { kpis: WsTrendKpi[] }) {
  const go = useGoPage();
  return (
    <div
      data-testid="ws-kpi-grid"
      className="grid grid-cols-6 gap-3 max-[1600px]:grid-cols-4 max-[1100px]:grid-cols-3 max-[820px]:grid-cols-2 max-md:grid-cols-1"
    >
      {kpis.map((k) => {
        const up = k.delta > 0;
        const flat = k.delta === 0;
        return (
          <button
            key={k.key}
            onClick={() => go(k.goto)}
            className={cn(
              "group flex flex-col gap-2 rounded-card border border-line bg-card p-4 text-left shadow-xs",
              "transition-[box-shadow,transform,border-color] duration-base ease-out",
              "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-8 w-8 flex-shrink-0 place-items-center rounded-btn",
                  SOFT[k.tone] ?? SOFT.info,
                )}
              >
                <Icon name={asIcon(k.icon)} size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-cap font-semibold text-ink-2">
                {k.title}
              </span>
            </span>

            <span className="flex items-end justify-between gap-2">
              <span
                className={cn(
                  "tnum text-[26px] font-bold leading-none tracking-[-0.03em]",
                  TONE_TEXT[k.tone] ?? "text-ink",
                )}
              >
                {k.value}
                {k.unit && (
                  <span className="ml-1 text-[11px] font-semibold text-ink-3">
                    {k.unit}
                  </span>
                )}
              </span>
              {k.points.length > 0 && (
                <Sparkline points={k.points} width={54} height={20} />
              )}
            </span>

            <span className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[11px] font-bold",
                  flat
                    ? SOFT.info
                    : up
                      ? "bg-success-soft text-success-text"
                      : "bg-danger-soft text-danger-text",
                )}
              >
                {!flat && (
                  <Icon name={up ? "arrowUp" : "arrowDown"} size={11} strokeWidth={2.5} />
                )}
                {flat ? "0%" : `${Math.abs(k.delta)}%`}
              </span>
              <span className="text-[11px] text-ink-3">vs สัปดาห์ก่อน</span>
            </span>

            <span className="text-[11px] leading-snug text-ink-2">{k.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Alert cards with priority, warehouse and an action ---------- */
export interface WsAlert {
  key: string;
  icon: string;
  count: number;
  unit: string;
  title: string;
  priority: string;
  warehouse: string;
  action: string;
  goto: string;
  tone: string;
}

export function WsAlertGrid({ alerts }: { alerts: WsAlert[] }) {
  const go = useGoPage();
  return (
    <div
      data-testid="ws-alert-grid"
      className="grid grid-cols-4 gap-3 max-[1400px]:grid-cols-3 max-[1000px]:grid-cols-2 max-md:grid-cols-1"
    >
      {alerts.map((a) => (
        <button
          key={a.key}
          onClick={() => go(a.goto)}
          className={cn(
            "group flex flex-col gap-2 rounded-btn border p-4 text-left",
            "transition-[box-shadow,transform] duration-base ease-out hover:-translate-y-0.5 hover:shadow-sm",
            SOFT[a.tone] ?? SOFT.info,
            SOFT_BORDER[a.tone] ?? SOFT_BORDER.info,
          )}
        >
          <span className="flex items-center gap-2">
            <Icon name={asIcon(a.icon)} size={17} />
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
              {a.title}
            </span>
            <Badge tone={toneOf(PRIORITY_TONE, a.priority)}>{a.priority}</Badge>
          </span>

          <span className="flex items-baseline gap-1.5">
            <span className="tnum text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">
              {a.count}
            </span>
            <span className="text-cap text-ink-2">{a.unit}</span>
          </span>

          <span className="flex items-center gap-1.5 text-cap text-ink-2">
            <Icon name="warehouse" size={13} />
            <span className="min-w-0 truncate">{a.warehouse}</span>
          </span>

          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-cap font-semibold">
            {a.action}
            <Icon
              name="arrowRight"
              size={13}
              className="transition-transform duration-fast group-hover:translate-x-0.5"
            />
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Activity timeline ---------- */
export interface WsTimelineItem {
  key: string;
  time: string;
  date: string;
  title: string;
  doc: string;
  ref: string;
  icon: string;
  warehouse: string;
  user: string;
  status: string;
  statusTone: BadgeTone;
  sign: string;
  qty: string;
  dirTone: string;
  goto: string;
}

/** Vertical rail: clock on the left, one movement per row. */
export function WsTimeline({ items }: { items: WsTimelineItem[] }) {
  const go = useGoPage();
  return (
    <ol data-testid="ws-timeline" className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.key} className="flex gap-3 px-5">
          {/* Clock + rail */}
          <div className="flex w-[62px] flex-shrink-0 flex-col items-end pt-4">
            <span className="tnum text-cap font-semibold text-ink">{it.time || "—"}</span>
            <span className="tnum text-[11px] text-ink-3">{it.date}</span>
          </div>

          <div className="relative flex flex-shrink-0 flex-col items-center">
            <span
              className={cn(
                "z-10 mt-4 grid h-7 w-7 place-items-center rounded-full border-2 border-card",
                SOFT[it.dirTone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(it.icon)} size={13} />
            </span>
            {i < items.length - 1 && (
              <span className="absolute top-4 h-full w-px bg-line" aria-hidden />
            )}
          </div>

          <button
            onClick={() => go(it.goto)}
            className={cn(
              "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-4 text-left",
              "transition-colors duration-fast hover:bg-surface",
              i === items.length - 1 && "border-b-0",
            )}
          >
            <span className="flex min-w-[200px] flex-1 flex-col">
              <span className="text-[13px] font-semibold">
                {it.title}
                <span className="ml-2 font-normal text-ink-2">{it.doc}</span>
              </span>
              <span className="text-xs text-ink-3">
                {it.ref ? `อ้างอิง ${it.ref} · ` : ""}
                {it.warehouse || "—"}
              </span>
            </span>

            <Badge tone={(it.dirTone as BadgeTone) ?? "info"}>
              {it.sign}
              {it.qty}
            </Badge>
            <span className="min-w-[92px] text-xs text-ink-2">{it.user || "—"}</span>
            <Badge tone={it.statusTone}>{it.status}</Badge>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Health gauges ---------- */
export interface WsGauge {
  key: string;
  title: string;
  value: string;
  pct: number;
  target: string;
  desc: string;
  icon: string;
  tone: string;
  goto: string;
}

export function WsGaugeCards({ gauges }: { gauges: WsGauge[] }) {
  const go = useGoPage();
  return (
    <div
      data-testid="ws-gauge-grid"
      className="grid grid-cols-4 gap-3 max-[1400px]:grid-cols-2 max-md:grid-cols-1"
    >
      {gauges.map((g) => (
        <button
          key={g.key}
          onClick={() => go(g.goto)}
          className={cn(
            "group flex flex-col gap-2 rounded-btn border border-line bg-card p-4 text-left",
            "transition-[box-shadow,transform,border-color] duration-base ease-out",
            "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm",
          )}
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-7 w-7 flex-shrink-0 place-items-center rounded-btn",
                SOFT[g.tone] ?? SOFT.info,
              )}
            >
              <Icon name={asIcon(g.icon)} size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-cap font-semibold text-ink-2">
              {g.title}
            </span>
          </span>

          <span
            className={cn(
              "tnum text-[22px] font-bold leading-none tracking-[-0.02em]",
              TONE_TEXT[g.tone] ?? "text-ink",
            )}
          >
            {g.value}
          </span>

          <span className="block h-[6px] overflow-hidden rounded-pill bg-line">
            <span
              className={cn(
                "block h-full rounded-pill",
                g.tone === "danger"
                  ? "bg-danger"
                  : g.tone === "warning"
                    ? "bg-warning"
                    : g.tone === "info"
                      ? "bg-info"
                      : "bg-success",
              )}
              style={{ width: `${Math.min(100, Math.max(0, g.pct))}%` }}
            />
          </span>

          <span className="text-[11px] text-ink-3">{g.target}</span>
          <span className="text-[11px] leading-snug text-ink-2">{g.desc}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Shortcut panels ---------- */
export interface WsShortcut {
  key: string;
  title: string;
  icon: string;
  count: number;
  unit: string;
  desc: string;
  goto: string;
  tone: string;
}

export function WsShortcutGrid({ items }: { items: WsShortcut[] }) {
  const go = useGoPage();
  return (
    <div
      data-testid="ws-shortcut-grid"
      className="grid grid-cols-4 gap-3 max-[1400px]:grid-cols-3 max-[1000px]:grid-cols-2 max-md:grid-cols-1"
    >
      {items.map((s) => (
        <button
          key={s.key}
          onClick={() => go(s.goto)}
          className={cn(
            "group flex items-center gap-3 rounded-btn border border-line bg-card p-4 text-left",
            "transition-[box-shadow,transform,border-color] duration-base ease-out",
            "hover:-translate-y-0.5 hover:border-primary-border hover:shadow-sm",
          )}
        >
          <span
            className={cn(
              "grid h-11 w-11 flex-shrink-0 place-items-center rounded-btn",
              SOFT[s.tone] ?? SOFT.info,
            )}
          >
            <Icon name={asIcon(s.icon)} size={19} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold">{s.title}</span>
            <span className="truncate text-[11px] text-ink-3">{s.desc}</span>
          </span>
          <span className="flex flex-shrink-0 items-baseline gap-1">
            <span className="tnum text-[20px] font-bold leading-none">{s.count}</span>
            <span className="text-[11px] text-ink-3">{s.unit}</span>
          </span>
          <Icon
            name="chevronRight"
            size={16}
            className="flex-shrink-0 text-ink-3 transition-transform duration-fast group-hover:translate-x-0.5"
          />
        </button>
      ))}
    </div>
  );
}

/** Small pill that names the action a stock row needs. */
export function ActionPill({ action }: { action: "Urgent" | "High" | "Normal" }) {
  const map = {
    Urgent: "bg-danger-soft text-danger-text border-[#FECACA]",
    High: "bg-warning-soft text-warning-text border-[#FDE68A]",
    Normal: "bg-success-soft text-success-text border-[#BBF7D0]",
  };
  return (
    <span
      className={cn(
        "inline-flex min-w-16 items-center justify-center rounded-pill border px-3 py-[3px] text-cap font-semibold",
        map[action],
      )}
    >
      {action}
    </span>
  );
}
