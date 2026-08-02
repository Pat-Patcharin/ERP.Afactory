"use client";

import { Fragment, useMemo } from "react";
import {
  invActivities,
  invAlerts,
  invHealth,
  invKpis,
  invPipeline,
  invShortcuts,
  invSnapshot,
  invWarehouseOverview,
} from "@/lib/domain/inventory";
import {
  GR_TONE,
  PA_TONE,
  PACK_TONE,
  PICK_TONE,
  QC_TONE,
  RTN_TONE,
  SHP_TONE,
  tone,
} from "@/lib/badges";
import { fmt } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { BadgeTone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";
import {
  SOFT,
  WsAlertGrid,
  WsBrief,
  WsGaugeCards,
  WsPageHeader,
  WsQuickActions,
  WsRow,
  WsShortcutGrid,
  WsTable,
  WsTd,
  WsTh,
  WsTimeline,
  WsTrendKpiCards,
  asIcon,
  useGoPage,
} from "@/components/workspace/parts";

/* ============================================================
   INVENTORY WORKSPACE — the Warehouse Command Center.

   Inbound stops at "put away"; Outbound starts at "pick". This page
   is where the two meet, so it reads the live documents of both
   rather than a dashboard dataset of its own. Every tile navigates
   into the module that resolves what it is reporting — built ones
   to their route, future ones to the named placeholder.
   ============================================================ */

/** Status tones by source module — reuses each module's own map. */
const KIND_TONE: Record<string, Record<string, BadgeTone>> = {
  "Goods Receipt": GR_TONE,
  "QC Inspection": QC_TONE,
  "Put Away": PA_TONE,
  Picking: PICK_TONE,
  Packing: PACK_TONE,
  Shipment: SHP_TONE,
  "Sales Return": RTN_TONE,
};

const DIR_TONE: Record<string, string> = {
  In: "success",
  Out: "info",
  Hold: "warning",
};

const DIR_SIGN: Record<string, string> = { In: "+", Out: "−", Hold: "±" };

const compactBaht = (n: number) =>
  n >= 1_000_000
    ? `฿${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `฿${Math.round(n / 1_000)}K`
      : `฿${fmt(n)}`;

const QUICK_ACTIONS = [
  { label: "Stock Inquiry", icon: "search", goto: "Stock Inquiry", accent: true },
  { label: "Stock Card", icon: "file", goto: "Stock Card" },
  { label: "Stock Transfer", icon: "truck", goto: "Stock Transfer" },
  { label: "Stock Adjustment", icon: "sliders", goto: "Stock Adjustment" },
  { label: "Cycle Count", icon: "checkCircle", goto: "Cycle Count" },
  { label: "Lot Tracking", icon: "layers", goto: "Lot Tracking" },
  { label: "Serial Tracking", icon: "barcode", goto: "Serial Tracking" },
  { label: "Barcode Lookup", icon: "search", goto: "Barcode Lookup" },
  { label: "Inventory Reports", icon: "reports", goto: "Inventory Reports" },
];

/** Section heading shared by every block below the KPI strip. */
function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
        {desc && <span className="text-cap text-ink-2">{desc}</span>}
      </div>
      {children}
    </section>
  );
}

export default function InventoryWorkspacePage() {
  const go = useGoPage();
  /** Workflow actions bump the revision; every derived figure follows. */
  const revision = useUI((s) => s.revision);
  const refresh = useUI((s) => s.refresh);

  const snap = useMemo(() => invSnapshot(), [revision]);
  const kpis = useMemo(() => invKpis(), [revision]);
  const pipeline = useMemo(() => invPipeline(), [revision]);
  const alerts = useMemo(() => invAlerts(), [revision]);
  const activities = useMemo(() => invActivities(20), [revision]);
  const warehouses = useMemo(() => invWarehouseOverview(), [revision]);
  const health = useMemo(() => invHealth(), [revision]);
  const shortcuts = useMemo(() => invShortcuts(), [revision]);

  const criticalAlerts = alerts.filter(
    (a) => a.priority === "Critical" && a.count > 0,
  ).length;

  return (
    <main className="flex max-w-[1760px] flex-col gap-6 p-6 max-md:gap-5 max-md:p-4">
      {/* ---------- 1. Page header ---------- */}
      <WsPageHeader
        title="Inventory Workspace"
        subtitle="Warehouse Operations Command Center"
        onRefresh={refresh}
        extraActions={[
          { label: "Barcode Lookup", icon: "barcode", run: () => go("Barcode Lookup") },
          { label: "Cycle Count", icon: "checkCircle", run: () => go("Cycle Count") },
          { label: "Inventory Reports", icon: "reports", run: () => go("Inventory Reports") },
          { label: "Warehouse Master", icon: "warehouse", run: () => go("Warehouse") },
        ]}
      />

      <WsBrief
        greeting="Good Morning, คุณสมชาย."
        lastUpdated="09:15"
        icon="warehouse"
        lines={[
          <>
            รอจัดเก็บเข้าบิน{" "}
            <strong className="font-semibold text-ink">
              {pipeline.find((p) => p.key === "pa")?.today ?? 0} งาน
            </strong>
          </>,
          <>
            รอจ่ายออก{" "}
            <strong className="font-semibold text-ink">{snap.outboundDocs} รายการ</strong>
          </>,
          <>
            แจ้งเตือนระดับ Critical{" "}
            <strong className="font-semibold text-ink">{criticalAlerts} เรื่อง</strong>
          </>,
          <>
            Lot ใกล้หมดอายุ{" "}
            <strong className="font-semibold text-ink">{snap.lotsNearExpiry} รายการ</strong>
          </>,
        ]}
      />

      {/* ---------- 2. Inventory KPI cards ---------- */}
      <Section
        title="Inventory KPI"
        desc={`${snap.skus} SKU · ${snap.warehouses} คลัง · ${fmt(snap.bins)} bins`}
      >
        <WsTrendKpiCards kpis={kpis} />
      </Section>

      {/* ---------- 3. Warehouse operations pipeline ---------- */}
      <Section
        title="Warehouse Operations Pipeline"
        desc={`รับเข้า ${snap.inboundDocs} งาน · จ่ายออก ${snap.outboundDocs} งาน`}
      >
        <Card className="overflow-hidden p-0">
          <div
            data-testid="inv-pipeline"
            className="flex items-stretch gap-2 overflow-x-auto p-4"
          >
            {pipeline.map((s, i) => (
              <Fragment key={s.key}>
                <button
                  onClick={() => go(s.goto)}
                  className={cn(
                    "flex min-w-[150px] flex-1 flex-col gap-2 rounded-card border p-3 text-left",
                    "transition-[border-color,box-shadow,transform] duration-fast",
                    "hover:-translate-y-0.5 hover:border-primary-border hover:shadow-sm",
                    s.key === "available"
                      ? "border-primary-border bg-primary-soft"
                      : "border-line bg-surface",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid h-7 w-7 flex-shrink-0 place-items-center rounded-btn",
                        SOFT[s.tone] ?? SOFT.info,
                      )}
                    >
                      <Icon name={asIcon(s.icon)} size={14} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {s.label}
                    </span>
                  </span>

                  <span className="tnum text-2xl font-bold leading-none tracking-[-0.02em] text-primary">
                    {fmt(s.pending)}
                  </span>
                  <span className="text-[11px] text-ink-3">{s.caption}</span>

                  <span className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge tone={s.badgeTone}>{s.badge}</Badge>
                    <span className="text-[11px] text-ink-3">วันล่าสุด {s.today}</span>
                  </span>
                </button>

                {i < pipeline.length - 1 && (
                  <span className="flex items-center text-ink-3">
                    <Icon name="arrowRight" size={16} />
                  </span>
                )}
              </Fragment>
            ))}
          </div>
        </Card>
      </Section>

      {/* ---------- 4. Quick actions ---------- */}
      <WsQuickActions actions={QUICK_ACTIONS} cols={5} />

      {/* ---------- 5. Warehouse alerts ---------- */}
      <Section
        title="Warehouse Alerts"
        desc={`${alerts.filter((a) => a.count > 0).length} จาก ${alerts.length} รายการต้องดำเนินการ`}
      >
        <WsAlertGrid alerts={alerts} />
      </Section>

      {/* ---------- 6. Recent inventory activities ---------- */}
      <Section title="Recent Inventory Activities" desc={`${activities.length} รายการล่าสุด`}>
        <Card className="overflow-hidden p-0">
          <WsTimeline
            items={activities.map((a) => ({
              key: a.doc,
              time: a.time,
              date: a.date,
              title: a.kind,
              doc: a.doc,
              ref: a.ref,
              icon: a.icon,
              warehouse: a.warehouse,
              user: a.user,
              status: a.status,
              statusTone: tone(KIND_TONE[a.kind] ?? {}, a.status),
              sign: DIR_SIGN[a.dir],
              qty: fmt(a.qty),
              dirTone: DIR_TONE[a.dir],
              goto: a.goto,
            }))}
          />
        </Card>
      </Section>

      {/* ---------- 7. Warehouse overview ---------- */}
      <Section
        title="Warehouse Overview"
        desc={`มูลค่ารวม ${compactBaht(snap.value)} · ใช้พื้นที่ ${snap.util}%`}
      >
        <Card className="overflow-hidden p-0">
          <div data-testid="inv-warehouse-table" className="overflow-x-auto">
            <WsTable
              head={
                <>
                  <WsTh>Warehouse</WsTh>
                  <WsTh align="right">Available</WsTh>
                  <WsTh align="right">Reserved</WsTh>
                  <WsTh align="right" className="max-md:hidden">
                    QC Hold
                  </WsTh>
                  <WsTh align="right" className="max-md:hidden">
                    Return Hold
                  </WsTh>
                  <WsTh align="right" className="max-md:hidden">
                    Transit
                  </WsTh>
                  <WsTh align="right">Total Stock</WsTh>
                  <WsTh align="right">Inventory Value</WsTh>
                  <WsTh align="right" className="max-md:hidden">
                    Pending Count
                  </WsTh>
                  <WsTh>Utilization</WsTh>
                </>
              }
            >
              {warehouses.map((w) => (
                <WsRow key={w.code} goto="Warehouse">
                  <WsTd>
                    <span className="flex flex-col">
                      <span className="font-semibold">{w.name}</span>
                      <span className="text-cap text-ink-3">
                        {w.code} · {w.type} · {w.share}% ของมูลค่ารวม
                      </span>
                    </span>
                  </WsTd>
                  <WsTd align="right" className="font-semibold">
                    {fmt(w.available)}
                  </WsTd>
                  <WsTd align="right" muted>
                    {fmt(w.reserved)}
                  </WsTd>
                  <WsTd align="right" muted className="max-md:hidden">
                    {fmt(w.qcHold)}
                  </WsTd>
                  <WsTd align="right" muted className="max-md:hidden">
                    {fmt(w.returnHold)}
                  </WsTd>
                  <WsTd align="right" muted className="max-md:hidden">
                    {fmt(w.transit)}
                  </WsTd>
                  <WsTd align="right">{fmt(w.qty)}</WsTd>
                  <WsTd align="right">{compactBaht(w.value)}</WsTd>
                  <WsTd align="right" muted className="max-md:hidden">
                    {w.pendingCount || "—"}
                  </WsTd>
                  <WsTd>
                    <span className="flex items-center gap-2">
                      <span className="block h-[5px] w-16 overflow-hidden rounded-pill bg-line">
                        <span
                          className={cn(
                            "block h-full rounded-pill",
                            w.tone === "danger"
                              ? "bg-danger"
                              : w.tone === "warning"
                                ? "bg-warning"
                                : "bg-success",
                          )}
                          style={{ width: `${Math.min(100, w.util)}%` }}
                        />
                      </span>
                      <span className="tnum text-cap text-ink-2">{w.util}%</span>
                    </span>
                  </WsTd>
                </WsRow>
              ))}
            </WsTable>
          </div>
        </Card>
      </Section>

      {/* ---------- 8. Inventory health ---------- */}
      <Section title="Inventory Health" desc="ตัวชี้วัดคุณภาพสต๊อก">
        <WsGaugeCards gauges={health} />
      </Section>

      {/* ---------- 9. Shortcut panels ---------- */}
      <Section title="Shortcut Panels" desc="งานค้างที่รอ Inventory ดำเนินการ">
        <WsShortcutGrid items={shortcuts} />
      </Section>
    </main>
  );
}
