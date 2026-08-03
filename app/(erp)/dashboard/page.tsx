"use client";

import { useMemo, useState } from "react";
import {
  DASH_ACTIONS,
  DOC_TABS,
  TREND_RANGES,
  dashActivities,
  dashAlerts,
  dashBrief,
  dashFinanceOverview,
  dashInventoryMix,
  dashInventoryOverview,
  dashKpis,
  dashPendingTasks,
  dashPurchaseOverview,
  dashRecentDocuments,
  dashSalesOverview,
  dashSalesTrend,
  trendAverage,
  trendTotal,
  type TrendRange,
} from "@/lib/domain/dashboard";
import {
  GR_TONE,
  PACK_TONE,
  PA_TONE,
  PICK_TONE,
  QC_TONE,
  RTN_TONE,
  SHP_TONE,
  tone,
} from "@/lib/badges";
import { fmt } from "@/lib/format";
import { useUI } from "@/lib/store";
import type { BadgeTone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BarChart, Card, DonutChart } from "@/components/ui";
import {
  WsBrief,
  WsPageHeader,
  WsQuickActions,
  WsTimeline,
  WsTrendKpiCards,
  useGoPage,
} from "@/components/workspace/parts";
import {
  DashAlertList,
  DashCard,
  DashFinance,
  DashOverview,
  DashRecentDocs,
  DashStatGrid,
  DashTaskList,
} from "@/components/dashboard/parts";

/* ============================================================
   DASHBOARD — the ERP Command Center.

   Six departments open this screen every morning, so it is
   organised by the question each of them asks rather than by the
   module tree the sidebar already shows:

     what happened          KPI strip · sales trend · activity feed
     what needs attention   business alerts
     what needs approval    my pending tasks
     today's workload       quick actions · module overviews
     business health        inventory value · finance

   Every figure comes from lib/domain/dashboard.ts, which derives
   it from the module that owns the document. The dashboard never
   holds a second copy of a number, so it cannot disagree with the
   screen a user clicks through to.
   ============================================================ */

/** Status tones by source module — each module's own map, reused. */
const KIND_TONE: Record<string, Record<string, BadgeTone>> = {
  "Goods Receipt": GR_TONE,
  "QC Inspection": QC_TONE,
  "Put Away": PA_TONE,
  Picking: PICK_TONE,
  Packing: PACK_TONE,
  Shipment: SHP_TONE,
  "Sales Return": RTN_TONE,
};

const DIR_TONE: Record<string, string> = { In: "success", Out: "info", Hold: "warning" };
const DIR_SIGN: Record<string, string> = { In: "+", Out: "−", Hold: "±" };

const compactBaht = (n: number) =>
  n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : `฿${fmt(Math.round(n))}`;

export default function DashboardPage() {
  const go = useGoPage();
  /** Workflow actions bump the revision; every derived figure follows. */
  const revision = useUI((s) => s.revision);
  const refresh = useUI((s) => s.refresh);
  const [range, setRange] = useState<TrendRange>(30);

  const kpis = useMemo(() => dashKpis(), [revision]);
  const tasks = useMemo(() => dashPendingTasks(), [revision]);
  const alerts = useMemo(() => dashAlerts(), [revision]);
  const purchase = useMemo(() => dashPurchaseOverview(), [revision]);
  const sales = useMemo(() => dashSalesOverview(), [revision]);
  const inventory = useMemo(() => dashInventoryOverview(), [revision]);
  const finance = useMemo(() => dashFinanceOverview(), [revision]);
  const mix = useMemo(() => dashInventoryMix(), [revision]);
  const activities = useMemo(() => dashActivities(8), [revision]);
  const docs = useMemo(() => dashRecentDocuments(5), [revision]);
  const brief = useMemo(() => dashBrief(), [revision]);
  const trend = useMemo(() => dashSalesTrend(range), [range]);

  const taskTotal = tasks.reduce((t, r) => t + r.count, 0);
  const alertTotal = alerts.filter((a) => a.count > 0).length;

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      {/* ---------- Page header ---------- */}
      <WsPageHeader
        title="Dashboard"
        subtitle="ภาพรวมธุรกิจและกิจกรรมที่สำคัญ — ERP Command Center"
        onRefresh={refresh}
        extraActions={[
          { label: "Purchase Workspace", icon: "workspace", run: () => go("Purchase Workspace") },
          { label: "Outbound Workspace", icon: "outbound", run: () => go("Outbound Workspace") },
          { label: "Inventory Workspace", icon: "warehouse", run: () => go("Inventory Workspace") },
          { label: "Barcode Lookup", icon: "barcode", run: () => go("Barcode Lookup") },
        ]}
      />

      <WsBrief
        greeting="Good Morning, คุณพิมพกา."
        lastUpdated="09:15"
        icon="dashboard"
        lines={[
          <>
            รออนุมัติ <strong className="font-semibold text-ink">{brief.pendingApproval} รายการ</strong>
          </>,
          <>
            งานที่ต้องทำวันนี้ <strong className="font-semibold text-ink">{brief.openTasks} งาน</strong>
          </>,
          <>
            แจ้งเตือนระดับ Critical{" "}
            <strong className="font-semibold text-ink">{brief.criticalAlerts} เรื่อง</strong>
          </>,
          <>
            รอจัดส่ง <strong className="font-semibold text-ink">{brief.shipToday} เที่ยว</strong>
          </>,
        ]}
      />

      {/* ---------- 1. Global KPI ---------- */}
      <WsTrendKpiCards
        kpis={kpis.map((k) => ({
          key: k.key,
          icon: k.icon,
          value: k.value,
          unit: k.unit,
          title: k.title,
          desc: k.compare,
          delta: k.delta,
          points: k.points,
          goto: k.goto,
          tone: k.tone,
        }))}
        cols={4}
        deltaLabel="vs เมื่อวาน"
        testId="dash-kpi-grid"
      />

      {/* ---------- 2–4. Quick actions · Pending tasks · Alerts ---------- */}
      <div
        data-testid="dash-action-band"
        className="grid grid-cols-3 items-start gap-5 max-[1400px]:grid-cols-2 max-[900px]:grid-cols-1"
      >
        <WsQuickActions actions={DASH_ACTIONS} cols={4} />

        <DashCard
          title="My Pending Tasks"
          desc={`${taskTotal} รายการรอการดำเนินการของคุณ`}
          data-testid="dash-tasks"
        >
          <DashTaskList tasks={tasks} />
        </DashCard>

        <DashCard
          title="Business Alerts"
          desc={`${alertTotal} จาก ${alerts.length} เรื่องต้องติดตาม`}
          data-testid="dash-alerts"
          className="max-[1400px]:col-span-2 max-[900px]:col-span-1"
        >
          <DashAlertList alerts={alerts} />
        </DashCard>
      </div>

      {/* ---------- 5–8. Module overviews ---------- */}
      <div
        data-testid="dash-overview-band"
        className="grid grid-cols-4 items-stretch gap-5 max-[1400px]:grid-cols-2 max-[900px]:grid-cols-1"
      >
        <DashCard
          title="Purchase Overview"
          desc="Purchase-to-Stock"
          data-testid="dash-purchase"
          className="h-full"
        >
          <DashOverview rows={purchase} testId="dash-purchase-rows" />
        </DashCard>

        <DashCard
          title="Sales Overview"
          desc="Order-to-Cash"
          data-testid="dash-sales"
          className="h-full"
        >
          <DashOverview rows={sales} testId="dash-sales-rows" />
        </DashCard>

        <DashCard
          title="Inventory Overview"
          desc="สถานะสต๊อกและงานคลัง"
          data-testid="dash-inventory"
          className="h-full"
        >
          <DashStatGrid stats={inventory} />
        </DashCard>

        <DashCard
          title="Finance Overview"
          desc="Accounts Receivable / Payable"
          data-testid="dash-finance-card"
          className="h-full"
        >
          <DashFinance stats={finance} />
        </DashCard>
      </div>

      {/* ---------- 9–11. Charts and activity ---------- */}
      <div
        data-testid="dash-chart-band"
        className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-5 max-[1500px]:grid-cols-2 max-[900px]:grid-cols-1"
      >
        <DashCard
          title="ยอดขาย"
          desc={`รวม ${compactBaht(trendTotal(trend))} · เฉลี่ย ${compactBaht(trendAverage(trend))} ต่อวัน`}
          data-testid="dash-sales-trend"
          action={
            <div
              role="group"
              aria-label="ช่วงเวลา"
              className="flex items-center gap-1 rounded-btn border border-line bg-surface p-0.5"
            >
              {TREND_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1 text-cap font-medium transition-colors duration-fast",
                    range === r
                      ? "bg-card text-ink shadow-xs"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {r} วัน
                </button>
              ))}
            </div>
          }
        >
          <div className="p-5">
            <BarChart points={trend} data-testid="dash-bar-chart" />
          </div>
        </DashCard>

        <DashCard
          title="มูลค่าสินค้าคงคลัง"
          desc="แบ่งตามหมวดหมู่สินค้า"
          data-testid="dash-inventory-value"
        >
          <div className="p-5">
            <DonutChart
              slices={mix.map((m) => ({ key: m.key, label: m.label, value: m.value }))}
              format={(n) => compactBaht(n)}
              data-testid="dash-donut-chart"
            />
          </div>
        </DashCard>

        <DashCard
          title="กิจกรรมล่าสุด"
          desc={`${activities.length} รายการจากทุกโมดูล`}
          data-testid="dash-activities"
          className="max-[1500px]:col-span-2 max-[900px]:col-span-1"
        >
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
        </DashCard>
      </div>

      {/* ---------- 12. Recent documents ---------- */}
      <DashRecentDocs docs={docs} tabs={DOC_TABS} />

      {/* Provenance, stated rather than implied. */}
      <Card className="px-5 py-3 text-cap text-ink-2">
        ตัวเลขทั้งหมดคำนวณจากเอกสารจริงในระบบ ยกเว้นกราฟยอดขายรายวัน สัดส่วนหมวดหมู่สินค้า
        และตัวเลขฝั่งการเงิน (เจ้าหนี้ / กระแสเงินสด) ซึ่งเป็นค่าตั้งต้นจนกว่าจะมีโมดูลรองรับ
      </Card>
    </main>
  );
}
