"use client";

import { useState } from "react";
import { OB_DATA } from "@/data/workspace";
import { PRIORITY_TONE, tone } from "@/lib/badges";
import { money0 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { Badge, Card, LinkButton, Tabs } from "@/components/ui";
import type { BadgeTone } from "@/lib/types";
import {
  SOFT,
  WsBrief,
  WsKpiCards,
  WsQuickActions,
  WsRow,
  WsTable,
  WsTableCard,
  WsTd,
  WsTh,
  asIcon,
  useGoPage,
} from "@/components/workspace/parts";

const SHIP_TONE: Record<string, BadgeTone> = {
  Picking: "warning",
  Ready: "info",
  Shipped: "success",
  Delayed: "danger",
};

const DOC_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Sent: "info",
  Accepted: "success",
  Pending: "warning",
  "Pending Approval": "warning",
  Approved: "success",
  Picking: "warning",
  Completed: "success",
  Shipped: "success",
  Paid: "success",
  Overdue: "danger",
};

/**
 * OUTBOUND WORKSPACE — the sales command center. Mirrors the Purchase
 * Workspace for the sell side: what needs attention, what ships today, what is
 * waiting approval, what is on back order.
 */
export default function OutboundWorkspacePage() {
  const d = OB_DATA;
  const go = useGoPage();
  const docTypes = Object.keys(d.recent);
  const [docTab, setDocTab] = useState(docTypes[0]);
  const rows = d.recent[docTab as keyof typeof d.recent] ?? [];

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 max-[1280px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-5">
          <WsBrief
            greeting={`Good Morning, ${d.user}.`}
            lastUpdated={d.lastUpdated}
            icon="outbound"
            lines={[
              <>
                รออนุมัติ{" "}
                <strong className="font-semibold text-ink">
                  {d.brief.waitingApproval} รายการ
                </strong>
              </>,
              <>
                ส่งของวันนี้{" "}
                <strong className="font-semibold text-ink">{d.brief.shipToday} รายการ</strong>
              </>,
              <>
                เกินกำหนดส่ง{" "}
                <strong className="font-semibold text-ink">{d.brief.overdue} รายการ</strong>
              </>,
              <>
                Back Order{" "}
                <strong className="font-semibold text-ink">{d.brief.backOrder} รายการ</strong>
              </>,
            ]}
          />
          <WsKpiCards kpis={d.kpis} cols={5} />
        </div>

        <div className="min-w-0">
          <WsQuickActions actions={d.quickActions} />
        </div>
      </div>

      {/* Horizontal sales pipeline — each stage is a live count */}
      <Card className="overflow-hidden p-0">
        <div className="px-5 py-4">
          <h2 className="text-h3 font-semibold tracking-[-0.01em]">Sales Pipeline</h2>
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto px-4 pb-4">
          {d.pipeline.map((p, i) => (
            <div key={p.stage} className="flex items-stretch gap-2">
              <button
                onClick={() => go(p.goto)}
                className="flex min-w-[104px] flex-1 flex-col items-center gap-0.5 rounded-card border border-line bg-surface p-3
                           transition-[border-color,box-shadow,transform] duration-fast
                           hover:-translate-y-0.5 hover:border-primary-border hover:shadow-sm"
              >
                <span className="text-2xl font-bold tracking-[-0.02em] text-primary tnum">
                  {p.count}
                </span>
                <span className="text-xs font-semibold text-ink-2">{p.stage}</span>
              </button>
              {i < d.pipeline.length - 1 && (
                <span className="flex items-center text-ink-3">
                  <Icon name="arrowRight" size={16} />
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* My tasks + AI insights */}
      <div className="grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start gap-5 max-[1280px]:grid-cols-1">
        <WsTableCard title="My Tasks" viewAll="Sales Order">
          <div className="flex flex-col">
            {d.tasks.map((t) => (
              <button
                key={t.code}
                onClick={() => go(t.goto)}
                className="flex items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors duration-fast last:border-b-0 hover:bg-surface"
              >
                <span
                  className={cn(
                    "grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-btn text-[11px] font-bold",
                    SOFT[t.tone] ?? SOFT.info,
                  )}
                >
                  {t.tag}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-semibold">{t.code}</span>
                  <span className="text-xs text-ink-2">{t.label}</span>
                </span>
                {t.badge && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-primary-soft px-1.5 text-[11px] font-bold text-primary">
                    {t.badge}
                  </span>
                )}
                <Icon name="chevronRight" size={16} className="flex-shrink-0 text-ink-3" />
              </button>
            ))}
          </div>
        </WsTableCard>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-h3 font-semibold tracking-[-0.01em]">
            <Icon name="bulb" size={18} />
            AI Sales Insights
            <span className="ml-auto rounded-pill bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
              AI
            </span>
          </h2>
          <div className="flex flex-col gap-3">
            {d.insights.map((i) => (
              <button
                key={i.text}
                onClick={() => go(i.goto)}
                className={cn(
                  "group flex flex-wrap items-center gap-3 rounded-btn border p-4 text-left",
                  "transition-[box-shadow,transform] duration-base ease-out hover:-translate-y-0.5 hover:shadow-sm",
                  SOFT[i.tone] ?? SOFT.info,
                  i.tone === "danger"
                    ? "border-[#FECACA]"
                    : i.tone === "warning"
                      ? "border-[#FDE68A]"
                      : i.tone === "success"
                        ? "border-[#BBF7D0]"
                        : "border-[#BFDBFE]",
                )}
              >
                <Icon name={asIcon(i.icon)} size={18} className="flex-shrink-0" />
                <span className="min-w-0 flex-1 text-[13px] font-medium">{i.text}</span>
                <span className="inline-flex items-center gap-1 text-cap font-semibold">
                  ดูรายละเอียด
                  <Icon
                    name="arrowRight"
                    size={13}
                    className="transition-transform duration-fast group-hover:translate-x-0.5"
                  />
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Shipments + back orders */}
      <div className="grid grid-cols-2 items-start gap-5 max-[1280px]:grid-cols-1">
        <WsTableCard title="Shipment Today" viewAll="Delivery Order">
          <WsTable
            head={
              <>
                <WsTh>DO Number</WsTh>
                <WsTh>Customer</WsTh>
                <WsTh>Carrier</WsTh>
                <WsTh>Delivery Time</WsTh>
                <WsTh>Status</WsTh>
                <WsTh>Priority</WsTh>
              </>
            }
          >
            {d.shipments.map((r) => (
              <WsRow key={r.do} goto="Delivery Order">
                <WsTd>
                  <LinkButton onClick={() => go("Delivery Order")}>{r.do}</LinkButton>
                </WsTd>
                <WsTd>{r.customer}</WsTd>
                <WsTd muted>{r.carrier}</WsTd>
                <WsTd className="tnum">{r.time}</WsTd>
                <WsTd>
                  <Badge tone={SHIP_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                </WsTd>
                <WsTd>
                  <Badge tone={tone(PRIORITY_TONE, r.priority)}>{r.priority}</Badge>
                </WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>

        <WsTableCard title="Back Order" viewAll="Sales Order">
          <WsTable
            head={
              <>
                <WsTh>Product</WsTh>
                <WsTh>Customer</WsTh>
                <WsTh align="right">Qty</WsTh>
                <WsTh>ETA</WsTh>
                <WsTh>Responsible Purchaser</WsTh>
              </>
            }
          >
            {d.backorders.map((r) => (
              <WsRow key={r.code} goto="Product">
                <WsTd>
                  <span className="font-semibold">{r.product}</span>
                  <span className="mt-px block text-cap text-ink-3 tnum">{r.code}</span>
                </WsTd>
                <WsTd>{r.customer}</WsTd>
                <WsTd align="right" className="font-semibold text-warning-text">
                  {r.qty}
                </WsTd>
                <WsTd muted className="tnum">
                  {r.eta}
                </WsTd>
                <WsTd muted>{r.buyer}</WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>
      </div>

      {/* Recent documents, grouped by type */}
      <Card className="overflow-hidden p-0">
        <div className="px-5 py-4">
          <h2 className="text-h3 font-semibold tracking-[-0.01em]">Recent Documents</h2>
        </div>
        <Tabs
          variant="drawer"
          items={docTypes.map((t) => ({ key: t, label: t }))}
          active={docTab}
          onChange={setDocTab}
        />
        <div className="overflow-x-auto">
          <WsTable
            head={
              <>
                <WsTh>No.</WsTh>
                <WsTh>Customer</WsTh>
                <WsTh>Date</WsTh>
                <WsTh align="right">Amount</WsTh>
                <WsTh>Status</WsTh>
              </>
            }
          >
            {rows.map((r) => {
              const target = docTab === "Delivery" ? "Delivery Order" : docTab;
              return (
                <WsRow key={r.no} goto={target}>
                  <WsTd>
                    <LinkButton onClick={() => go(target)}>{r.no}</LinkButton>
                  </WsTd>
                  <WsTd>{r.party}</WsTd>
                  <WsTd muted className="tnum">
                    {r.date}
                  </WsTd>
                  <WsTd align="right">{money0(r.amount)}</WsTd>
                  <WsTd>
                    <Badge tone={DOC_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  </WsTd>
                </WsRow>
              );
            })}
          </WsTable>
        </div>
      </Card>
    </main>
  );
}
