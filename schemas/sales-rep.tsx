import { SALES_REPRESENTATIVES, decorateSRs, type SalesRepRow } from "@/lib/domain/sales";
import {
  SR_AREAS,
  SR_DEPARTMENTS,
  SR_MANAGERS,
  SR_STATUS,
  SR_TEAMS,
  SR_TEAM_COLOR,
} from "@/data/sales-reps";
import {
  SALES_AREA_GROUPS,
  inSalesArea,
  salesArea,
  salesAreaName,
} from "@/data/sales-areas";
import { SR_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import type { DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellMedia, CellSub } from "@/components/ui";
import { SALES_REP_FORM } from "./forms/sales-rep";

/* ============================================================
   SALES REPRESENTATIVE — person-centric master. Used by Business
   Partner, Sales Order and CRM.

   PHASE SCOPE — master data only. Sales KPI, commission, visit plan
   and activity history are deliberately absent: no sales actuals are
   captured against a rep yet. Targets and authority limits stay, as
   they are set up here rather than posted from transactions.
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
  searchFields: [
    "code",
    "empId",
    "name",
    "nick",
    "mobile",
    "email",
    "area",
    "areaName",
    "province",
  ],

  /* No hero.

     A banner and five tiles that counted the rows of the table beneath them:
     Total Reps and Active Reps are the "All" and "Active" tab counts, Teams
     and Sales Areas are two filters, and Customers is the sum of a column.
     Every figure was already on the screen, and the summary pushed the list
     itself below the fold on the page whose job is to show the list. */

  tabs: [
    { key: "all", label: "All" },
    { key: "active", label: "Active", test: (r) => r.status === "Active" },
    { key: "onleave", label: "On Leave", test: (r) => r.status === "On Leave" },
    { key: "inactive", label: "Inactive", test: (r) => r.status === "Inactive" },
    { key: "resigned", label: "Resigned", test: (r) => r.status === "Resigned" },
  ],

  filters: [
    { id: "team", label: "Team", options: () => [...SR_TEAMS], test: (r, v) => r.team === v },
    {
      id: "area",
      label: "Sales Area",
      /* Every area in the master, not just the ones already staffed, so the
         filter can be used to confirm an area has nobody in it. */
      options: () => SR_AREAS.map(salesAreaName),
      test: (r, v) => r.areaName === v,
    },
    {
      id: "areaGroup",
      advanced: true,
      label: "Area Group",
      /* Rolls the 14 areas up into the three groupings. Wanted occasionally,
         so it sits in the drawer and leaves the toolbar as it was. */
      options: () => SALES_AREA_GROUPS.map((g) => g.short),
      test: (r, v) => r.areaGroup === v,
    },
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
    {
      key: "area",
      label: "Sales Area",
      sortable: true,
      sortValue: (r) => r.areaName,
      cell: (r) => (
        <>
          {r.areaName}
          <CellSub>{r.areaGroup}</CellSub>
        </>
      ),
    },
    {
      key: "province",
      label: "Base Province",
      muted: true,
      /* A province the area does not own is a data error worth surfacing in
         the list rather than only inside the form. */
      cell: (r) =>
        r.areaMatchesProvince ? (
          r.province
        ) : (
          <span className="font-semibold text-warning-text" title="จังหวัดไม่อยู่ในเขตที่รับผิดชอบ">
            {r.province}
          </span>
        ),
    },
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
      key: "custCount",
      label: "Customers",
      align: "right",
      sortable: true,
      sortValue: (r) => r.custCount,
      cell: (r) => <span className="tnum">{fmt(r.custCount)}</span>,
    },
  ],

  rowActions: (rep, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("sales-rep", r.code) },
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
    tags: [r.areaName, r.areaGroup, r.province, `Manager: ${r.manager}`].filter(Boolean),
  }),

  kpis: (r) => [
    { icon: "partner", label: "Customers", value: fmt(r.custCount), sub: "ราย", goTab: "customers" },
    {
      icon: "mapPin",
      label: "Sales Area",
      value: r.areaName,
      sub: r.areaCoverage || r.province,
      wide: true,
      goTab: "territory",
    },
    {
      icon: "pricing",
      label: "Monthly Target",
      value: `฿${money0(r.monthlyTarget)}`,
      sub: "เป้าที่ตั้งไว้",
    },
    {
      icon: "shield",
      label: "Approval Limit",
      value: `฿${money0(r.approvalLimit)}`,
      sub: `ส่วนลดสูงสุด ${r.discountLimit}%`,
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
            { label: "Sales Area", value: r.areaName },
            { label: "Area Group", value: r.areaGroup },
            {
              label: "Base Province",
              value: r.areaMatchesProvince ? (
                r.province
              ) : (
                <span className="font-semibold text-warning-text">
                  {r.province || DASH} — ไม่อยู่ในเขตนี้
                </span>
              ),
            },
            { label: "Coverage", value: r.areaCoverage || DASH },
            { label: "Customer Group", value: r.custGroup },
            { label: "Sales Channel", value: r.channel },
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
      key: "territory",
      label: "Territory",
      /* The area master spelled out, so a rep's coverage can be checked
         without opening the territory sheet next to the screen. */
      blocks: (r) => {
        const area = salesArea(r.area);
        if (!area) {
          return [
            {
              type: "fields",
              title: "Sales Territory",
              cols: 1,
              items: [{ label: "Sales Area", value: `${r.area || DASH} — ไม่พบเขตนี้ในระบบ` }],
            },
          ];
        }

        const peers = SALES_REPRESENTATIVES.filter(
          (x) => x.area === area.code && x.code !== r.code,
        );

        return [
          {
            type: "fields",
            title: `${area.name} — ${r.areaGroup}`,
            cols: 2,
            items: [
              { label: "Area Code", value: area.code },
              { label: "Coverage", value: r.areaCoverage || DASH },
              { label: "Base Province", value: r.province || DASH },
              { label: "Reps in this area", value: fmt(peers.length + 1) },
            ],
          },
          {
            type: "table",
            title: `จังหวัดที่รับผิดชอบ (${area.provinces.length})`,
            rows: area.provinces.map((p) => ({ prov: p, base: p === r.province })),
            empty: "เขตนี้แบ่งตามเขต กทม. ไม่ได้ถือจังหวัดเต็ม",
            cols: [
              {
                key: "prov",
                label: "จังหวัด",
                cell: (p) => (p.base ? <span className="font-semibold">{p.prov}</span> : p.prov),
              },
              {
                key: "base",
                label: "",
                cell: (p) => (p.base ? <Badge tone="info">ฐานประจำ</Badge> : null),
              },
            ],
          },
          ...(area.districts.length
            ? [
                {
                  type: "table" as const,
                  title: `เขต กทม. ที่รับผิดชอบ (${area.districts.length})`,
                  rows: area.districts.map((d) => ({ dist: d })),
                  empty: "",
                  cols: [{ key: "dist", label: "เขต" }],
                },
              ]
            : []),
          {
            type: "table",
            title: `เซลล์อื่นในเขตเดียวกัน (${peers.length})`,
            rows: peers,
            empty: "ไม่มีเซลล์คนอื่นในเขตนี้",
            cols: [
              { key: "code", label: "Sales Rep", cell: (p) => <span className="tnum">{p.code}</span> },
              { key: "name", label: "Name", cell: (p) => <span className="font-medium">{p.name}</span> },
              { key: "team", label: "Team", muted: true },
              { key: "province", label: "Base Province", muted: true },
              {
                key: "status",
                label: "Status",
                cell: (p) => <Badge tone={tone(SR_TONE, p.status)}>{p.status}</Badge>,
              },
            ],
          },
        ];
      },
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
            {
              key: "prov",
              label: "Province",
              muted: true,
              /* A customer outside the rep's area is legitimate but worth
                 seeing — it is how a territory quietly drifts. */
              cell: (c) =>
                inSalesArea(r.area, c.prov) ? (
                  c.prov
                ) : (
                  <span className="text-warning-text" title="อยู่นอกเขตที่รับผิดชอบ">
                    {c.prov}
                  </span>
                ),
            },
            { key: "group", label: "Customer Group" },
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
  ],
};

export const salesRepSchemas: EntitySchemas<SalesRepRow> = {
  list: SR_LIST,
  detail: SR_DETAIL,
  form: SALES_REP_FORM,
};
