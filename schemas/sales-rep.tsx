import { SALES_REPRESENTATIVES, decorateSRs, type SalesRepRow } from "@/lib/domain/sales";
import {
  SR_AREAS,
  SR_DEPARTMENTS,
  SR_MANAGERS,
  SR_STATUS,
  SR_TEAMS,
  SR_TEAM_COLOR,
} from "@/data/sales-reps";
import { SR_TONE, tone } from "@/lib/badges";
import { DASH, daysUntil, fmt, money0 } from "@/lib/format";
import type { DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellMedia, CellSub, Sparkline, UtilBar } from "@/components/ui";

/* ============================================================
   SALES REPRESENTATIVE — person-centric master. Used by Business
   Partner, Sales Order, CRM, Commission and the sales dashboard.
   ============================================================ */

/** Avatar tinted by team, so a rep list reads as a set of teams. */
function Avatar({ rep, size = 34 }: { rep: SalesRepRow; size?: number }) {
  return (
    <span
      style={{
        background: SR_TEAM_COLOR[rep.team] ?? "#64748B",
        width: size,
        height: size,
        fontSize: size * 0.36,
      }}
      className="inline-grid flex-shrink-0 place-items-center rounded-full font-bold tracking-[0.02em] text-white"
    >
      {rep.avatar}
    </span>
  );
}

export const SR_LIST: ListSchema<SalesRepRow> = {
  key: "sales-rep",
  entity: "Sales Representative",
  entityPlural: "Sales Representatives",
  title: "Sales Representative Master",
  subtitle: "จัดการข้อมูลพนักงานขายทั้งหมด พื้นที่ ทีม เป้าหมาย และลูกค้าที่รับผิดชอบ",
  crumb: "Sales Rep",
  primaryLabel: "New Sales Rep",
  searchPlaceholder: "ค้นหาด้วยรหัส ชื่อ เบอร์โทร อีเมล...",
  emptyTitle: "ไม่พบพนักงานขายที่ตรงกับเงื่อนไข",

  source: () => SALES_REPRESENTATIVES,
  searchFields: ["code", "empId", "name", "nick", "mobile", "email", "area", "province"],

  hero: () => {
    const reps = SALES_REPRESENTATIVES;
    const active = reps.filter((r) => r.status === "Active");
    const totalSales = active.reduce((s, r) => s + (Number(r.monthlySales) || 0), 0);
    const totalTarget = active.reduce((s, r) => s + (Number(r.monthlyTarget) || 0), 0);
    const avgAchv = active.length
      ? Math.round(active.reduce((s, r) => s + r.achievement, 0) / active.length)
      : 0;
    const totalCust = reps.reduce((s, r) => s + (Number(r.custCount) || 0), 0);
    const openQuo = reps.reduce((s, r) => s + (Number(r.openQuo) || 0), 0);
    const openOrd = reps.reduce((s, r) => s + (Number(r.openOrd) || 0), 0);

    return {
      banner: {
        title: "Sales Team Summary",
        icon: "users",
        items: [
          `${active.length} active reps`,
          `${avgAchv}% avg achievement`,
          `${totalCust} customers`,
          `${openQuo} open quotations`,
          `${openOrd} open orders`,
        ],
        stamp: "Team performance this month",
      },
      kpis: [
        {
          label: "Team Sales",
          value: `฿${money0(totalSales)}`,
          sub: "This month",
          tone: "primary",
          icon: "pricing",
        },
        {
          label: "Avg Achievement",
          value: `${avgAchv}%`,
          sub: `Target ฿${money0(totalTarget)}`,
          tone: avgAchv >= 90 ? "ok" : "warn",
          icon: "checkCircle",
        },
        {
          label: "Active Reps",
          value: fmt(active.length),
          sub: `of ${reps.length} total`,
          icon: "users",
          goTab: "active",
        },
        { label: "Customers", value: fmt(totalCust), sub: "Assigned", tone: "ok", icon: "partner" },
        {
          label: "Open Pipeline",
          value: fmt(openQuo + openOrd),
          sub: `${openQuo} quo · ${openOrd} ord`,
          tone: "warn",
          icon: "file",
        },
      ],
    };
  },

  tabs: [
    { key: "all", label: "All" },
    { key: "active", label: "Active", test: (r) => r.status === "Active" },
    { key: "onleave", label: "On Leave", test: (r) => r.status === "On Leave" },
    { key: "inactive", label: "Inactive", test: (r) => r.status === "Inactive" },
    { key: "resigned", label: "Resigned", test: (r) => r.status === "Resigned" },
  ],

  filters: [
    { id: "team", label: "Team", options: () => [...SR_TEAMS], test: (r, v) => r.team === v },
    { id: "area", label: "Area", options: () => [...SR_AREAS], test: (r, v) => r.area === v },
    {
      id: "province",
      label: "Province",
      options: () => [...new Set(SALES_REPRESENTATIVES.map((r) => r.province))],
      test: (r, v) => r.province === v,
    },
    { id: "dept", label: "Department", options: () => [...SR_DEPARTMENTS], test: (r, v) => r.dept === v },
    { id: "manager", label: "Manager", options: () => [...SR_MANAGERS], test: (r, v) => r.manager === v },
    { id: "status", label: "Status", options: () => [...SR_STATUS], test: (r, v) => r.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Sales Rep",
      sortable: true,
      cell: (r) => (
        <CellMedia>
          <Avatar rep={r} />
          <span className="flex flex-col leading-tight">
            <span className="font-medium">{r.code}</span>
            <CellSub>{r.empId}</CellSub>
          </span>
        </CellMedia>
      ),
    },
    {
      key: "name",
      label: "Name",
      cell: (r) => (
        <>
          {r.name}
          <CellSub>{r.nick}</CellSub>
        </>
      ),
    },
    { key: "team", label: "Team", cell: (r) => r.team },
    { key: "area", label: "Area", cell: (r) => r.area },
    { key: "province", label: "Province", muted: true, cell: (r) => r.province },
    { key: "manager", label: "Manager", muted: true, cell: (r) => r.manager },
    {
      key: "mobile",
      label: "Mobile",
      muted: true,
      cell: (r) => <span className="tnum">{r.mobile}</span>,
    },
    {
      key: "status",
      label: "Status",
      cell: (r) => <Badge tone={tone(SR_TONE, r.status)}>{r.status}</Badge>,
    },
    {
      key: "achievement",
      label: "Achievement",
      align: "right",
      sortable: true,
      sortValue: (r) => r.achievement,
      cell: (r) => (
        <UtilBar
          pct={r.achievement}
          tone={r.achievement >= 100 ? "full" : r.achievement >= 80 ? undefined : "mid"}
        />
      ),
    },
  ],

  rowActions: (rep, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.quickView("sales-rep", r) },
    { label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/sales-rep/${r.code}/edit`) },
    {
      label: "Assign Customers",
      icon: "users",
      run: (r) =>
        ctx.toast("มอบหมายลูกค้า", `${r.name} — จัดการได้จากหน้าแก้ไข`, "info"),
    },
    { sep: true },
    {
      label: "Duplicate",
      icon: "copy",
      run: (r) => ctx.toast("ทำสำเนา", `${r.code} — Future support`, "info"),
    },
    ...(rep.status === "Active"
      ? ([
          {
            label: "Deactivate",
            icon: "circleSlash",
            danger: true,
            run: (r: SalesRepRow) =>
              ctx.confirm({
                title: "Deactivate this sales rep?",
                message: (
                  <>
                    <strong>{r.name}</strong> จะถูกปิดการใช้งาน
                  </>
                ),
                confirmText: "Deactivate",
                onConfirm: () => {
                  r.status = "Inactive";
                  decorateSRs();
                  ctx.refresh();
                  ctx.toast("ปิดการใช้งานแล้ว", r.code, "info");
                },
              }),
          },
        ] as const)
      : []),
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      run: (r) =>
        ctx.confirm({
          title: "Delete this sales rep?",
          message: (
            <>
              <strong>{r.name}</strong> จะถูกลบถาวร
            </>
          ),
          confirmText: "Delete",
          onConfirm: () => {
            const i = SALES_REPRESENTATIVES.indexOf(r);
            if (i > -1) SALES_REPRESENTATIVES.splice(i, 1);
            decorateSRs();
            ctx.refresh();
            ctx.toast("ลบพนักงานขายแล้ว", r.code, "danger");
          },
        }),
    },
  ],
};

export const SR_DETAIL: DetailSchema<SalesRepRow> = {
  key: "sales-rep",
  entityLabel: "Sales Representative",

  identity: (r) => ({
    image: <Avatar rep={r} size={56} />,
    code: r.code,
    title: `${r.name} · ${r.nick}`,
    copyFields: [
      { label: "Rep code", value: r.code },
      { label: "Mobile", value: r.mobile },
    ],
    badges: [
      { text: r.status, tone: tone(SR_TONE, r.status) },
      { text: r.team, tone: "neutral" },
    ],
    tags: [r.area, r.province, `Manager: ${r.manager}`].filter(Boolean),
  }),

  kpis: (r) => [
    {
      icon: "cart",
      label: "Monthly Sales",
      value: `฿${money0(r.monthlySales)}`,
      sub: `Target ฿${money0(r.monthlyTarget)}`,
      goTab: "kpi",
    },
    { icon: "shield", label: "Achievement", value: `${r.achievement}%`, sub: r.status, goTab: "kpi" },
    { icon: "box", label: "Customers", value: fmt(r.custCount), sub: "ราย", goTab: "customers" },
    {
      icon: "file",
      label: "Open Pipeline",
      value: fmt(r.openQuo + r.openOrd),
      sub: `${r.openQuo} quo · ${r.openOrd} ord`,
      wide: true,
      goTab: "kpi",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r) => [
        {
          type: "fields",
          title: "General Information",
          cols: 2,
          items: [
            { label: "Sales Rep Code", value: r.code },
            { label: "Employee ID", value: r.empId },
            { label: "Title", value: r.title },
            { label: "First Name", value: r.first },
            { label: "Last Name", value: r.last },
            { label: "Nickname", value: r.nick },
            { label: "Gender", value: r.gender },
            { label: "Birth Date", value: r.birth },
            { label: "Department", value: r.dept },
            { label: "Position", value: r.position },
            { label: "Team", value: r.team },
            { label: "Manager", value: r.manager },
            {
              label: "Employment Status",
              value: <Badge tone={tone(SR_TONE, r.status)}>{r.status}</Badge>,
            },
            { label: "Hire Date", value: r.hireDate },
            { label: "Resign Date", value: r.resignDate || DASH },
          ],
        },
        {
          type: "fields",
          title: "Contact",
          cols: 2,
          items: [
            { label: "Mobile", value: r.mobile },
            { label: "Office Phone", value: r.office },
            { label: "Email", value: r.email },
            { label: "LINE ID", value: r.line },
          ],
        },
        {
          type: "fields",
          title: "Sales Territory",
          cols: 2,
          items: [
            { label: "Area", value: r.area },
            { label: "Province", value: r.province },
            { label: "Region", value: r.region },
            { label: "Customer Group", value: r.custGroup },
            { label: "Sales Channel", value: r.channel },
            { label: "Commission Group", value: r.commGroup },
            { label: "Monthly Target", value: `฿${money0(r.monthlyTarget)}` },
            { label: "Quarter Target", value: `฿${money0(r.quarterTarget)}` },
            { label: "Annual Target", value: `฿${money0(r.annualTarget)}` },
          ],
        },
        {
          type: "fields",
          title: "Permission",
          cols: 2,
          items: [
            { label: "Warehouse Access", value: r.whAccess },
            { label: "Product Category", value: r.prodCat },
            { label: "Discount Limit", value: `${r.discountLimit}%` },
            { label: "Approval Limit", value: `฿${money0(r.approvalLimit)}` },
          ],
        },
      ],
    },

    {
      key: "customers",
      label: "Customers",
      blocks: (r) => [
        {
          type: "table",
          title: `Assigned Customers (${r.customers.length})`,
          rows: r.customers,
          empty: "ยังไม่มีลูกค้าที่มอบหมาย",
          cols: [
            { key: "code", label: "Customer Code", cell: (c) => <span className="tnum">{c.code}</span> },
            { key: "name", label: "Customer Name", cell: (c) => <span className="font-medium">{c.name}</span> },
            { key: "prov", label: "Province", muted: true },
            { key: "group", label: "Customer Group" },
            {
              key: "lastVisit",
              label: "Last Visit",
              muted: true,
              // A visit older than 60 days is the signal a rep needs to act on.
              cell: (c) => {
                const d = daysUntil(c.lastVisit);
                return d !== null && d < -60 ? (
                  <span className="font-semibold text-warning-text">{c.lastVisit}</span>
                ) : (
                  c.lastVisit
                );
              },
            },
            {
              key: "outstanding",
              label: "Outstanding",
              align: "right",
              cell: (c) => `฿${money0(c.outstanding)}`,
            },
            {
              key: "status",
              label: "Status",
              cell: (c) => (
                <Badge tone={c.status === "Active" ? "success" : "neutral"}>{c.status}</Badge>
              ),
            },
          ],
        },
      ],
    },

    {
      key: "kpi",
      label: "Sales KPI",
      blocks: (r) => [
        {
          type: "cards",
          title: "KPI",
          cols: 3,
          items: [
            { label: "Monthly Sales", value: `฿${money0(r.monthlySales)}`, tone: "accent" },
            { label: "Achievement", value: `${r.achievement}%` },
            { label: "Active Customers", value: fmt(r.custCount) },
            { label: "Open Quotation", value: fmt(r.openQuo) },
            { label: "Open Order", value: fmt(r.openOrd) },
            { label: "Collection", value: `฿${money0(r.collection)}` },
          ],
        },
        {
          type: "node",
          title: "Monthly Sales Trend (This Year)",
          node: (
            <div className="rounded-btn border border-line bg-surface p-3">
              <Sparkline points={r.trend} width={520} height={64} className="w-full" />
              <div className="mt-1 flex justify-between text-[11px] text-ink-3">
                <span>Jan</span>
                <span>Jun</span>
                <span>Dec</span>
              </div>
            </div>
          ),
        },
        {
          type: "fields",
          title: "Target vs Actual",
          cols: 2,
          items: [
            { label: "Monthly Target", value: `฿${money0(r.monthlyTarget)}` },
            { label: "Monthly Actual", value: `฿${money0(r.monthlySales)}` },
            { label: "Achievement", value: <UtilBar pct={r.achievement} /> },
            {
              label: "Gap",
              value: `฿${money0(Math.max(0, r.monthlyTarget - r.monthlySales))}`,
            },
          ],
        },
      ],
    },

    {
      key: "commission",
      label: "Commission",
      blocks: (r) => [
        {
          type: "fields",
          title: "Commission",
          cols: 2,
          items: [
            { label: "Commission Group", value: r.commGroup },
            { label: "Commission Rate", value: r.commGroup.match(/\d+%/)?.[0] ?? DASH },
            { label: "Current Commission", value: `฿${money0(r.commission)}` },
            { label: "Bonus", value: `฿${money0(r.bonus)}` },
          ],
        },
      ],
    },

    {
      key: "visits",
      label: "Visit Plan",
      blocks: (r) => [
        {
          type: "table",
          title: `Visit Plan (${r.visits.length})`,
          rows: r.visits,
          empty: "ไม่มีแผนการเยี่ยม",
          cols: [
            { key: "date", label: "Visit Date" },
            { key: "cust", label: "Customer", cell: (v) => <span className="font-medium">{v.cust}</span> },
            { key: "prov", label: "Province", muted: true },
            { key: "purpose", label: "Purpose" },
            {
              key: "status",
              label: "Status",
              cell: (v) => (
                <Badge tone={v.status === "Completed" ? "success" : "info"}>{v.status}</Badge>
              ),
            },
            { key: "result", label: "Result", muted: true, cell: (v) => v.result || DASH },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (r) => [
        {
          type: "timeline",
          title: "Activity",
          items: r.history.map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },
  ],
};

export const salesRepSchemas: EntitySchemas<SalesRepRow> = {
  list: SR_LIST,
  detail: SR_DETAIL,
};
