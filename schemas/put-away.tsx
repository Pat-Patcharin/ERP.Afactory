import {
  PUTAWAY_TASKS,
  paAllBins,
  paBinInfo,
  paBinShort,
  type PaRow,
} from "@/lib/domain/inbound";
import { PA_PRIORITY, PA_STAFF, PA_STATUS } from "@/data/putaway";
import { PA_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { DASH, fmt } from "@/lib/format";
import { paAssign, paCancel, paConfirm } from "@/lib/workflows";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { WarehouseMap } from "@/components/warehouse/WarehouseMap";
import { PA_FORM } from "./forms/put-away";

/* ============================================================
   PUT AWAY — final inbound step. Moves goods from the receiving
   dock or QC Hold into final storage bins, then makes the
   inventory available.
   ============================================================ */

export const PA_LIST: ListSchema<PaRow> = {
  key: "put-away",
  entity: "Put Away",
  entityPlural: "Put Away Tasks",
  title: "Put Away Workspace",
  subtitle: "จัดเก็บสินค้าจาก Receiving Dock / QC Hold เข้าตำแหน่งจัดเก็บสุดท้าย",
  crumb: "Put Away",
  primaryLabel: "Create Put Away",
  searchPlaceholder: "ค้นหาเลขที่ Task, GR, QC, สินค้า, Lot, ผู้รับผิดชอบ...",
  emptyTitle: "ไม่พบงานจัดเก็บที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => PUTAWAY_TASKS,
  searchFields: ["code", "grRef", "qcRef", "warehouse", "assignedTo", "headProduct", "headLot"],

  hero: (ctx) => {
    const tasks = PUTAWAY_TASKS;
    const waiting = tasks.filter((t) => t.status === "Waiting").length;
    const assigned = tasks.filter((t) => t.status === "Assigned").length;
    const highPri = tasks.filter(
      (t) => ["High", "Critical"].includes(t.priority) && t.status !== "Completed",
    ).length;
    const completed = tasks.filter((t) => t.status === "Completed").length;
    const bins = paAllBins();
    const util = bins.length
      ? Math.round(bins.reduce((s, b) => s + b.used, 0) / bins.length)
      : 0;

    return {
      banner: {
        title: "Put Away Morning Summary",
        icon: "putAway",
        items: [
          `${waiting} waiting put away`,
          `${highPri} high priority`,
          `${assigned} assigned`,
          `${completed} completed`,
          `${100 - util}% capacity free`,
        ],
        action: "View Warehouse Map",
        onAction: () =>
          ctx.formModal({
            title: "Warehouse Map",
            confirmText: "Close",
            cancelText: "",
            body: () => <WarehouseMap />,
          }),
      },
      kpis: [
        { label: "Waiting Tasks", value: fmt(waiting), sub: "Ready to put away", link: "View", goTab: "waiting", tone: "primary", icon: "clock" },
        { label: "Assigned", value: fmt(assigned), sub: "In hand", link: "View", goTab: "assigned", tone: "warn", icon: "users" },
        { label: "Completed", value: fmt(completed), sub: "Put away done", link: "View", goTab: "completed", tone: "ok", icon: "checkCircle" },
        { label: "High Priority", value: fmt(highPri), sub: "Needs attention", tone: "warn", icon: "alert" },
        {
          label: "Storage Utilization",
          value: `${util}%`,
          sub: "Across bins",
          link: "Warehouse map",
          tone: util >= 85 ? "warn" : "ok",
          icon: "grid",
          run: () =>
            ctx.formModal({
              title: "Warehouse Map",
              confirmText: "Close",
              cancelText: "",
              body: () => <WarehouseMap />,
            }),
        },
      ],
    };
  },

  tabs: [
    { key: "all", label: "All" },
    { key: "waiting", label: "Waiting", test: (t) => t.status === "Waiting" },
    { key: "assigned", label: "Assigned", test: (t) => t.status === "Assigned" },
    { key: "inprogress", label: "In Progress", test: (t) => t.status === "In Progress" },
    { key: "completed", label: "Completed", test: (t) => t.status === "Completed" },
  ],

  filters: [
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(PUTAWAY_TASKS.map((t) => t.warehouse))],
      test: (t, v) => t.warehouse === v,
    },
    { id: "priority", label: "Priority", options: () => [...PA_PRIORITY], test: (t, v) => t.priority === v },
    { id: "status", label: "Status", options: () => [...PA_STATUS], test: (t, v) => t.status === v },
    { id: "assigned", label: "Assigned", options: () => [...PA_STAFF], test: (t, v) => t.assignedTo === v },
    { id: "source", label: "Source", options: () => ["GR", "QC"], test: (t, v) => t.createdFrom === v },
  ],

  columns: [
    {
      key: "code",
      label: "Task Number",
      sortable: true,
      cell: (t) => (
        <CellMedia>
          <Thumb>{t.icon}</Thumb>
          <span className="font-medium">{t.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "grRef",
      label: "GR / QC",
      muted: true,
      cell: (t) =>
        t.qcRef ? (
          <>
            {t.grRef}
            <CellSub>{t.qcRef}</CellSub>
          </>
        ) : (
          t.grRef
        ),
    },
    { key: "warehouse", label: "Warehouse", muted: true, cell: (t) => t.warehouse },
    {
      key: "headProduct",
      label: "Product",
      cell: (t) =>
        t.itemCount > 1 ? (
          <>
            {t.headProduct}
            <CellSub>+{t.itemCount - 1} more</CellSub>
          </>
        ) : (
          t.headProduct
        ),
    },
    { key: "headLot", label: "Lot / Serial", muted: true, cell: (t) => t.headLot },
    { key: "curLoc", label: "Current", muted: true, cell: (t) => t.curLoc },
    {
      key: "suggestBin",
      label: "Suggested",
      cell: (t) => <span className="tnum">{t.suggestBin}</span>,
    },
    { key: "totalQty", label: "Qty", align: "right", cell: (t) => fmt(t.totalQty) },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      cell: (t) => <Badge tone={tone(PRIORITY_TONE, t.priority)}>{t.priority}</Badge>,
    },
    { key: "assignedTo", label: "Assigned", muted: true, cell: (t) => t.assignedTo || DASH },
    {
      key: "status",
      label: "Status",
      cell: (t) => <Badge tone={tone(PA_TONE, t.status)}>{t.status}</Badge>,
    },
  ],

  rowActions: (task, ctx) => {
    const acts: RowAction<PaRow>[] = [
      { label: "Open Detail", icon: "eye", run: (r) => ctx.openEntity("put-away", r.code) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/put-away/${r.code}`) },
    ];

    if (task.status === "Waiting")
      acts.push({
        label: "Assign & Start",
        icon: "play",
        run: (r) =>
          ctx.formModal({
            title: `Assign task — ${r.code}`,
            confirmText: "Assign",
            body: () => (
              <div>
                <p className="mb-3 text-cap leading-relaxed text-ink-2">
                  เลือกผู้รับผิดชอบงานจัดเก็บนี้
                </p>
                <div className="flex flex-col gap-2">
                  {PA_STAFF.map((s) => (
                    <label
                      key={s}
                      className="flex cursor-pointer items-center gap-3 rounded-btn border border-line p-3 transition-colors hover:border-line-strong"
                    >
                      <input type="radio" name="pa-staff" value={s} className="radio" defaultChecked={s === PA_STAFF[0]} />
                      <span className="font-medium">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            ),
            onConfirm: () => {
              const picked =
                (document.querySelector('input[name="pa-staff"]:checked') as HTMLInputElement)
                  ?.value ?? PA_STAFF[0];
              paAssign(r, picked, ctx);
            },
          }),
      });

    if (task.status === "Assigned" || task.status === "In Progress")
      acts.push({ label: "Confirm Put Away", icon: "check", run: (r) => paConfirm(r, ctx) });

    acts.push({
      label: "Warehouse Map",
      icon: "grid",
      run: (r) =>
        ctx.formModal({
          title: `Warehouse Map — ${r.code}`,
          confirmText: "Close",
          cancelText: "",
          body: () => (
            <WarehouseMap highlight={r.items?.[0]?.destBin || r.items?.[0]?.suggestBin} />
          ),
        }),
    });

    acts.push({ sep: true });
    if (task.grRef)
      acts.push({
        label: `View ${task.grRef}`,
        icon: "goodsReceipt",
        run: () => ctx.openEntity("goods-receipt", task.grRef),
      });
    if (task.qcRef)
      acts.push({
        label: `View ${task.qcRef}`,
        icon: "qc",
        run: () => ctx.openEntity("qc-inspection", task.qcRef),
      });

    if (!["Completed", "Cancelled"].includes(task.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel", icon: "circleSlash", danger: true, run: (r) => paCancel(r, ctx) });
    }

    return acts;
  },
};

export const PA_DETAIL: DetailSchema<PaRow> = {
  key: "put-away",
  entityLabel: "Put Away",

  identity: (t) => ({
    image: t.icon,
    code: t.code,
    title: `${t.headProduct} · ${t.warehouse}`,
    copyFields: [
      { label: "Task number", value: t.code },
      { label: "GR number", value: t.grRef },
    ],
    badges: [
      { text: t.status, tone: tone(PA_TONE, t.status) },
      { text: t.priority, tone: tone(PRIORITY_TONE, t.priority) },
    ],
    tags: [t.assignedTo || "ยังไม่มอบหมาย", t.warehouse, `${t.itemCount} รายการ`],
  }),

  kpis: (t) => [
    { icon: "box", label: "Total Qty", value: fmt(t.totalQty), sub: "หน่วย", goTab: "items" },
    {
      icon: "truck",
      label: "Completed",
      value: fmt(t.completedQty),
      sub: `${t.pct}%`,
      goTab: "items",
    },
    { icon: "clock", label: "Remaining", value: fmt(t.remainingQty), sub: "หน่วย", goTab: "items" },
    {
      icon: "shield",
      label: "Est. Time",
      value: `${Math.max(5, t.itemCount * 8)} min`,
      sub: "ประมาณ",
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (t) => [
        {
          type: "fields",
          title: "Task Information",
          cols: 2,
          items: [
            { label: "Task Number", value: t.code },
            { label: "Status", value: <Badge tone={tone(PA_TONE, t.status)}>{t.status}</Badge> },
            {
              label: "Priority",
              value: <Badge tone={tone(PRIORITY_TONE, t.priority)}>{t.priority}</Badge>,
            },
            { label: "Warehouse", value: t.warehouse },
            { label: "Source GR", value: t.grRef ? <Badge tone="info">{t.grRef}</Badge> : DASH },
            {
              label: "Source QC",
              value: t.qcRef ? <Badge tone="info">{t.qcRef}</Badge> : "ไม่ต้อง QC",
            },
            { label: "Assigned To", value: t.assignedTo || "ยังไม่มอบหมาย" },
            { label: "Created From", value: t.createdFrom },
          ],
        },
        {
          type: "cards",
          title: "Progress",
          items: [
            { label: "Total Qty", value: fmt(t.totalQty) },
            { label: "Completed", value: fmt(t.completedQty), tone: "accent" },
            { label: "Remaining", value: fmt(t.remainingQty) },
            {
              label: "Items",
              value: `${(t.items ?? []).filter((i) => i.status === "Completed").length}/${t.itemCount}`,
            },
          ],
        },
      ],
    },

    {
      key: "items",
      label: "Items",
      blocks: (t) => [
        {
          type: "table",
          title: `Put Away Items (${t.itemCount})`,
          rows: t.items ?? [],
          empty: "ไม่มีรายการ",
          cols: [
            { key: "line", label: "#", muted: true },
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "lot", label: "Lot / Serial", muted: true, cell: (r) => r.lot || r.serial || DASH },
            { key: "curLoc", label: "Current Location", muted: true },
            {
              key: "suggestBin",
              label: "Suggested",
              cell: (r) => <span className="tnum">{paBinShort(r.suggestBin)}</span>,
            },
            {
              key: "destBin",
              label: "Destination",
              cell: (r) =>
                r.destBin ? (
                  <span className="font-medium tnum">{paBinShort(r.destBin)}</span>
                ) : (
                  <span className="text-ink-2">รอกำหนด</span>
                ),
            },
            { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
            { key: "unit", label: "UOM", muted: true },
            {
              key: "status",
              label: "Status",
              cell: (r) => <Badge tone={tone(PA_TONE, r.status)}>{r.status}</Badge>,
            },
          ],
        },
      ],
    },

    {
      key: "location",
      label: "Location",
      blocks: (t) => {
        const first = t.items?.[0];
        const dest = first?.destBin || first?.suggestBin;
        const bin = paBinInfo(dest);
        return [
          {
            type: "fields",
            title: "Warehouse Structure",
            cols: 2,
            items: [
              { label: "Warehouse", value: t.warehouse },
              {
                label: "Destination Path",
                value: dest ? <span className="tnum">{dest}</span> : "รอกำหนด",
              },
              bin ? { label: "Zone / Rack", value: `${bin.zone} / ${bin.rack}` } : null,
              bin ? { label: "Shelf / Bin", value: `${bin.shelf} / ${bin.bin}` } : null,
              bin ? { label: "Bin Type", value: bin.binType } : null,
              bin ? { label: "Temperature", value: bin.temp } : null,
            ],
          },
          bin
            ? {
                type: "cards",
                title: "Capacity Check",
                cols: 3,
                items: [
                  { label: "Bin Capacity", value: fmt(bin.cap), unit: bin.capUnit },
                  {
                    label: "Current Usage",
                    value: `${bin.used}%`,
                    tone: bin.used >= 85 ? "warn" : "accent",
                  },
                  { label: "Remaining Space", value: fmt(bin.free), unit: bin.capUnit },
                ],
              }
            : {
                type: "alert",
                tone: "info",
                title: "ยังไม่ได้กำหนดตำแหน่ง",
                message: "เริ่มงานจัดเก็บเพื่อเลือก Bin ปลายทาง",
              },
          {
            type: "node",
            title: "Warehouse Map",
            node: <WarehouseMap highlight={dest} />,
          },
        ];
      },
    },

    {
      key: "history",
      label: "History",
      blocks: (t) => [
        {
          type: "timeline",
          title: "Activity",
          items: (t.history ?? []).map((e) => ({
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

export const paSchemas: EntitySchemas<PaRow> = {
  list: PA_LIST,
  detail: PA_DETAIL,
  form: PA_FORM,
};
