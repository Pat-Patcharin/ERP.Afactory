import { PICKING_TASKS, getSO, pickShortLines, type PickRow } from "@/lib/domain/outbound";
import { PICK_STATUS } from "@/data/picking";
import { PICK_LINE_TONE, PICK_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { DASH, fmt } from "@/lib/format";
import { paBinShort } from "@/lib/domain/inbound";
import {
  pickAssign,
  pickCancel,
  pickComplete,
  pickCreatePack,
  pickStart,
} from "@/lib/workflows-outbound";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { PICK_FORM } from "./forms/picking";

/* ============================================================
   PICKING — pull the ordered quantities out of the bins.
   Waiting → Assigned → In Progress → Completed
   ============================================================ */

export const PICK_LIST: ListSchema<PickRow> = {
  key: "picking",
  entity: "Picking Task",
  entityPlural: "Picking Tasks",
  title: "Picking",
  subtitle: "งานหยิบสินค้าจากคลังตามใบสั่งขาย ติดตามความคืบหน้าและรายการที่หยิบไม่ครบ",
  crumb: "Picking",
  primaryLabel: "New Picking Task",
  searchPlaceholder: "ค้นหาเลขที่งาน ใบสั่งขาย ลูกค้า หรือผู้รับผิดชอบ...",
  emptyTitle: "ไม่พบงานหยิบสินค้าที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => PICKING_TASKS,
  searchFields: ["code", "soRef", "customer", "assignedTo", "warehouse"],

  tabs: [
    { key: "all", label: "All" },
    { key: "waiting", label: "Waiting", test: (t) => t.status === "Waiting" },
    { key: "assigned", label: "Assigned", test: (t) => t.status === "Assigned" },
    { key: "progress", label: "In Progress", test: (t) => t.status === "In Progress" },
    { key: "short", label: "หยิบไม่ครบ", test: (t) => t.shortCount > 0 && t.status !== "Cancelled" },
    { key: "completed", label: "Completed", test: (t) => t.status === "Completed" },
  ],

  filters: [
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(PICKING_TASKS.map((t) => t.warehouse))],
      test: (t, v) => t.warehouse === v,
    },
    {
      id: "assignedTo",
      label: "Assigned To",
      options: () => [...new Set(PICKING_TASKS.map((t) => t.assignedTo).filter(Boolean))],
      test: (t, v) => t.assignedTo === v,
    },
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(PICKING_TASKS.map((t) => t.customer))],
      test: (t, v) => t.customer === v,
    },
    { id: "status", label: "Status", options: () => [...PICK_STATUS], test: (t, v) => t.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Pick No.",
      sortable: true,
      cell: (t) => (
        <CellMedia>
          <Thumb>{t.icon}</Thumb>
          <span className="font-medium">{t.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "soRef",
      label: "Sales Order",
      sortable: true,
      cell: (t) => (
        <>
          <span className="tnum">{t.soRef}</span>
          <CellSub>{t.customer}</CellSub>
        </>
      ),
    },
    { key: "warehouse", label: "Warehouse", muted: true, cell: (t) => t.warehouse },
    {
      key: "assignedTo",
      label: "Assigned To",
      cell: (t) =>
        t.assignedTo ? t.assignedTo : <span className="text-ink-3">รอมอบหมาย</span>,
    },
    { key: "dueDate", label: "Due Date", muted: true, sortable: true, cell: (t) => t.dueDate || DASH },
    { key: "itemCount", label: "Lines", align: "right", cell: (t) => fmt(t.itemCount) },
    {
      key: "pickedQty",
      label: "Picked / Ordered",
      align: "right",
      sortable: true,
      sortValue: (t) => t.pct,
      cell: (t) => (
        <>
          {fmt(t.pickedQty)} / {fmt(t.orderedQty)}
          {t.shortCount > 0 && <CellSub>ขาด {t.shortCount} บรรทัด</CellSub>}
        </>
      ),
    },
    {
      key: "pct",
      label: "Progress",
      align: "right",
      sortable: true,
      cell: (t) => (
        <UtilBar pct={t.pct} tone={t.pct >= 100 ? "full" : t.pct > 0 ? "mid" : undefined} />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (t) => <Badge tone={tone(PICK_TONE, t.status)}>{t.status}</Badge>,
    },
  ],

  rowActions: (task, ctx) => {
    const acts: RowAction<PickRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("picking", r) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/picking/${r.code}`) },
    ];

    if (!["Completed", "Cancelled"].includes(task.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/picking/${r.code}/edit`) });

    acts.push({ sep: true });

    if (task.status === "Waiting")
      acts.push({
        label: "Assign to me",
        icon: "user",
        run: (r) => pickAssign(r, "Warin S.", ctx),
      });

    if (task.status === "Assigned")
      acts.push({ label: "Start Picking", icon: "play", run: (r) => pickStart(r, ctx) });

    if (["Assigned", "In Progress"].includes(task.status))
      acts.push({ label: "Complete Picking", icon: "checkCircle", run: (r) => pickComplete(r, ctx) });

    if (task.status === "Completed" && !task.packRef)
      acts.push({ label: "Create Packing", icon: "packing", run: (r) => pickCreatePack(r, ctx) });

    if (task.packRef)
      acts.push({
        label: `ดู ${task.packRef}`,
        icon: "packing",
        run: () => ctx.openEntity("packing", task.packRef),
      });

    acts.push({
      label: `ดู ${task.soRef}`,
      icon: "salesOrder",
      run: () => ctx.openEntity("sales-order", task.soRef),
    });

    acts.push({
      label: "Print Pick List",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบหยิบสินค้า", `${r.code} — Future support`, "info"),
    });

    if (!["Completed", "Cancelled"].includes(task.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Task", icon: "circleSlash", danger: true, run: (r) => pickCancel(r, ctx) });
    }

    return acts;
  },
};

export const PICK_DETAIL: DetailSchema<PickRow> = {
  key: "picking",
  entityLabel: "Picking Task",

  identity: (t) => ({
    image: t.icon,
    code: t.code,
    title: t.customer,
    copyFields: [
      { label: "Pick number", value: t.code },
      { label: "Sales order", value: t.soRef },
    ],
    badges: [
      { text: t.status, tone: tone(PICK_TONE, t.status) },
      ...(t.shortCount > 0 ? ([{ text: `ขาด ${t.shortCount} บรรทัด`, tone: "warning" }] as const) : []),
      { text: t.priority, tone: tone(PRIORITY_TONE, t.priority) },
    ],
    tags: [t.soRef, t.warehouse, t.assignedTo].filter(Boolean),
  }),

  kpis: (t) => [
    { icon: "box", label: "Ordered Qty", value: fmt(t.orderedQty), sub: "หน่วย", goTab: "lines" },
    { icon: "picking", label: "Picked Qty", value: fmt(t.pickedQty), sub: `${t.pct}%`, goTab: "lines" },
    {
      icon: "alert",
      label: "Short Lines",
      value: fmt(t.shortCount),
      sub: t.shortCount > 0 ? "ต้องติดตาม" : "ครบทุกบรรทัด",
      goTab: "lines",
    },
    {
      icon: "user",
      label: "Assigned To",
      value: t.assignedTo || "รอมอบหมาย",
      sub: t.dueDate ? `กำหนด ${t.dueDate}` : DASH,
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      aside: (t) => ({
        rows: [
          { icon: "salesOrder", label: "Sales Order", value: t.soRef },
          { icon: "partner", label: "Customer", value: t.customer },
          { icon: "warehouse", label: "Warehouse", value: t.warehouse },
          { icon: "user", label: "Assigned To", value: t.assignedTo || "รอมอบหมาย", muted: !t.assignedTo },
          { icon: "calendar", label: "Due Date", value: t.dueDate || DASH },
          { icon: "layers", label: "Strategy", value: t.strategy },
          { icon: "clock", label: "Last Updated", value: t.updated, muted: true },
        ],
      }),
      blocks: (t) => {
        const so = getSO(t.soRef);
        return [
          t.shortCount > 0 && {
            type: "alert",
            tone: "warn",
            title: `หยิบไม่ครบ ${t.shortCount} บรรทัด`,
            message: `หยิบได้ ${fmt(t.pickedQty)} จาก ${fmt(t.orderedQty)} หน่วย — ใบสั่งขาย ${t.soRef} จะยังปิดไม่ได้จนกว่าจะหยิบครบหรือส่งบางส่วน`,
          },
          {
            type: "fields",
            title: "Task Information",
            cols: 2,
            items: [
              { label: "Pick No.", value: t.code },
              { label: "Status", value: <Badge tone={tone(PICK_TONE, t.status)}>{t.status}</Badge> },
              { label: "Sales Order", value: <Badge tone="info">{t.soRef}</Badge> },
              { label: "Priority", value: <Badge tone={tone(PRIORITY_TONE, t.priority)}>{t.priority}</Badge> },
              { label: "Customer", value: t.customer },
              { label: "Customer Code", value: t.customerCode },
              { label: "Warehouse", value: t.warehouse },
              { label: "Picking Strategy", value: t.strategy },
              { label: "Pick Date", value: t.pickDate || DASH },
              { label: "Due Date", value: t.dueDate || DASH },
              t.packRef ? { label: "Packing Task", value: <Badge tone="info">{t.packRef}</Badge> } : null,
            ],
          },
          so
            ? {
                type: "fields",
                title: "Sales Order Context",
                cols: 2,
                items: [
                  { label: "Order Value", value: `${fmt(so.total)} ${so.currency}` },
                  { label: "Delivery Date", value: so.deliveryDate },
                  { label: "Sales Rep", value: so.salesRep },
                  { label: "Ship To", value: so.shipTo || DASH, span: true },
                ],
              }
            : null,
          { type: "note", title: "Remark", text: t.remark || DASH },
          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created By", value: t.createdBy, muted: true },
              { label: "Created Date", value: t.created, muted: true },
              { label: "Last Updated By", value: t.updatedBy, muted: true },
              { label: "Last Updated", value: t.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "lines",
      label: "Pick Lines",
      blocks: (t) => [
        {
          type: "table",
          title: `Lines to Pick (${t.itemCount})`,
          rows: (t.items ?? []).map((it) => ({
            ...it,
            short: Math.max(0, Number(it.ordered) - Number(it.picked)),
            binShort: paBinShort(it.bin),
          })),
          empty: "ไม่มีรายการ",
          cols: [
            { key: "line", label: "#", align: "right", muted: true },
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "lot", label: "Lot", muted: true, cell: (r) => r.lot || DASH },
            { key: "binShort", label: "Bin", cell: (r) => <span className="tnum">{r.binShort}</span> },
            { key: "ordered", label: "Ordered", align: "right", cell: (r) => fmt(r.ordered) },
            { key: "picked", label: "Picked", align: "right", cell: (r) => fmt(r.picked) },
            {
              key: "short",
              label: "ขาด",
              align: "right",
              cell: (r) =>
                r.short > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(r.short)}</span>
                ) : (
                  DASH
                ),
            },
            { key: "unit", label: "UOM", muted: true },
            {
              key: "status",
              label: "Line Status",
              cell: (r) => <Badge tone={tone(PICK_LINE_TONE, r.status)}>{r.status}</Badge>,
            },
            { key: "note", label: "Note", muted: true },
          ],
        },
        {
          type: "cards",
          title: "Pick Summary",
          cols: 3,
          items: [
            { label: "Ordered", value: fmt(t.orderedQty), unit: "หน่วย" },
            { label: "Picked", value: fmt(t.pickedQty), unit: "หน่วย", tone: "accent" },
            {
              label: "Short",
              value: fmt(t.orderedQty - t.pickedQty),
              unit: "หน่วย",
              tone: t.pickedQty < t.orderedQty ? "warn" : undefined,
            },
          ],
        },
        pickShortLines(t).length > 0 && {
          type: "table",
          title: "Short Picks — ต้องติดตาม",
          rows: pickShortLines(t),
          cols: [
            { key: "code", label: "Product Code" },
            { key: "name", label: "Product Name" },
            { key: "ordered", label: "Ordered", align: "right", cell: (r) => fmt(r.ordered) },
            { key: "picked", label: "Picked", align: "right", cell: (r) => fmt(r.picked) },
            { key: "note", label: "Reason", muted: true, cell: (r) => r.note || DASH },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (t) => [
        {
          type: "timeline",
          title: "Activity",
          items: (t.history ?? []).map((h) => ({
            title: h.t,
            detail: h.d,
            user: h.u,
            when: h.when,
            kind: h.kind,
          })),
        },
      ],
    },
  ],

  actions: (t, ctx) => {
    const acts: RowAction<PickRow>[] = [];
    if (t.status === "Waiting")
      acts.push({ label: "Assign to me", icon: "user", run: () => pickAssign(t, "Warin S.", ctx) });
    if (t.status === "Assigned")
      acts.push({ label: "Start Picking", icon: "play", run: () => pickStart(t, ctx) });
    if (["Assigned", "In Progress"].includes(t.status))
      acts.push({ label: "Complete Picking", icon: "checkCircle", run: () => pickComplete(t, ctx) });
    if (t.status === "Completed" && !t.packRef)
      acts.push({ label: "Create Packing", icon: "packing", run: () => pickCreatePack(t, ctx) });
    acts.push({
      label: "Print Pick List",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ใบหยิบสินค้า", `${t.code} — Future support`, "info"),
    });
    if (!["Completed", "Cancelled"].includes(t.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Task", icon: "circleSlash", danger: true, run: () => pickCancel(t, ctx) });
    }
    return acts;
  },
};

export const pickSchemas: EntitySchemas<PickRow> = {
  list: PICK_LIST,
  detail: PICK_DETAIL,
  form: PICK_FORM,
};
