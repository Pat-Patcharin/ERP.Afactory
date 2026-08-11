import { can } from "@/lib/domain/admin";
import { printActions } from "@/lib/print/actions";
import { PACKING_TASKS, getSO, type PackRow } from "@/lib/domain/outbound";
import { PACK_STATUS } from "@/data/packing";
import { PACK_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { DASH, fmt } from "@/lib/format";
import {
  packCancel,
  packComplete,
  packConfirmShipQty,
  packCreateDelivery,
  packStart,
} from "@/lib/workflows-outbound";
import type {
  DetailSchema,
  EntitySchemas,
  ListSchema,
  QuickAction,
  RowAction,
} from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { PackingDocument } from "@/components/packing/PackingDocument";
import { PACK_FORM } from "./forms/packing";

/* ============================================================
   PACKING — turn picked quantities into sealed, labelled boxes.
   Waiting → In Progress → Completed
   ============================================================ */

export const PACK_LIST: ListSchema<PackRow> = {
  key: "packing",
  entity: "Packing Task",
  entityPlural: "Packing Tasks",
  title: "Packing",
  subtitle: "งานบรรจุสินค้าลงกล่องก่อนส่งมอบ ติดตามจำนวนกล่องและน้ำหนักรวม",
  crumb: "Packing",
  primaryLabel: "",
  searchPlaceholder: "ค้นหาเลขที่งาน ใบหยิบสินค้า ใบสั่งขาย หรือลูกค้า...",
  emptyTitle: "ไม่พบงานแพ็คที่ตรงกับเงื่อนไข",
  hideImportExport: true,
  convertOnly: {
    from: "ใบหยิบสินค้าที่ปิดงานแล้ว",
    goto: "/m/picking",
    gotoLabel: "ไปที่ใบหยิบสินค้า",
  },

  source: () => PACKING_TASKS,
  searchFields: ["code", "pickRef", "soRef", "customer", "packer", "warehouse"],

  tabs: [
    { key: "all", label: "All" },
    { key: "waiting", label: "Waiting", test: (t) => t.status === "Waiting" },
    { key: "progress", label: "In Progress", test: (t) => t.status === "In Progress" },
    { key: "ready", label: "รอออกใบส่งของ", test: (t) => t.status === "Completed" && !t.doRef },
    { key: "completed", label: "Completed", test: (t) => t.status === "Completed" },
  ],

  filters: [
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(PACKING_TASKS.map((t) => t.warehouse))],
      test: (t, v) => t.warehouse === v,
    },
    {
      id: "packer",
      label: "Packer",
      options: () => [...new Set(PACKING_TASKS.map((t) => t.packer).filter(Boolean))],
      test: (t, v) => t.packer === v,
    },
    {
      id: "handling",
      label: "Handling",
      options: () => [...new Set(PACKING_TASKS.map((t) => t.handling))],
      test: (t, v) => t.handling === v,
    },
    { id: "status", label: "Status", options: () => [...PACK_STATUS], test: (t, v) => t.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Pack No.",
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
    { key: "pickRef", label: "From Pick", muted: true, cell: (t) => t.pickRef || DASH },
    { key: "warehouse", label: "Warehouse", muted: true, cell: (t) => t.warehouse },
    {
      key: "packer",
      label: "Packer",
      cell: (t) => (t.packer ? t.packer : <span className="text-ink-3">รอมอบหมาย</span>),
    },
    { key: "boxCount", label: "Boxes", align: "right", cell: (t) => fmt(t.boxCount) },
    {
      key: "totalWeight",
      label: "Weight",
      align: "right",
      sortable: true,
      cell: (t) => (t.totalWeight ? `${t.totalWeight} กก.` : DASH),
    },
    {
      key: "pct",
      label: "Packed %",
      align: "right",
      sortable: true,
      cell: (t) => (
        <UtilBar pct={t.pct} tone={t.pct >= 100 ? "full" : t.pct > 0 ? "mid" : undefined} />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (t) => <Badge tone={tone(PACK_TONE, t.status)}>{t.status}</Badge>,
    },
  ],

  quickActions: (task) => {
    const acts: QuickAction<PackRow>[] = [];
    if (!can("packing", "edit")) return acts;

    if (task.status === "Waiting")
      acts.push({
        label: "Start Packing",
        short: "เริ่มแพ็ค",
        icon: "play",
        run: (r, c) => packStart(r, c),
      });

    if (["Waiting", "In Progress"].includes(task.status))
      acts.push({
        label: "Complete Packing",
        short: "แพ็คเสร็จ",
        icon: "checkCircle",
        tone: "ok",
        run: (r, c) => packComplete(r, c),
      });

    /* The delivery note is refused until every line has been answered, so
       the row offers the answer first and the note only once it exists. */
    if (task.status === "Completed" && !task.doRef && !task.isConfirmed)
      acts.push({
        label: "ยืนยันจำนวนที่ส่งได้",
        short: "ยืนยันจำนวน",
        icon: "checkCircle",
        run: (r, c) => packConfirmShipQty(r, c),
      });

    if (task.status === "Completed" && !task.doRef && task.isConfirmed)
      acts.push({
        label: "Create Delivery Order",
        short: "เปิดใบส่งสินค้า",
        icon: "delivery",
        run: (r, c) => packCreateDelivery(r, c),
      });

    return acts;
  },

  rowActions: (task, ctx) => {
    const acts: RowAction<PackRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.openEntity("packing", r.code) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/packing/${r.code}`) },
    ];

    if (!["Completed", "Cancelled"].includes(task.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/packing/${r.code}/edit`) });

    acts.push({ sep: true });

    if (task.status === "Waiting")
      acts.push({ label: "Start Packing", icon: "play", run: (r) => packStart(r, ctx) });

    if (["Waiting", "In Progress"].includes(task.status))
      acts.push({ label: "Complete Packing", icon: "checkCircle", run: (r) => packComplete(r, ctx) });

    /* Offered whether or not it has been answered, so the warehouse can
       correct a figure right up until the delivery note exists. */
    if (task.status === "Completed" && !task.doRef)
      acts.push({
        label: task.isConfirmed ? "แก้จำนวนที่ยืนยันส่ง" : "ยืนยันจำนวนที่ส่งได้",
        icon: "checkCircle",
        run: (r) => packConfirmShipQty(r, ctx),
      });

    if (task.status === "Completed" && !task.doRef && task.isConfirmed)
      acts.push({ label: "Create Delivery Order", icon: "delivery", run: (r) => packCreateDelivery(r, ctx) });

    if (task.doRef)
      acts.push({
        label: `ดู ${task.doRef}`,
        icon: "delivery",
        run: () => ctx.openEntity("delivery-order", task.doRef),
      });

    if (task.pickRef)
      acts.push({
        label: `ดู ${task.pickRef}`,
        icon: "picking",
        run: () => ctx.openEntity("picking", task.pickRef),
      });

    acts.push({
      label: "Print Packing Slip",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบแพ็ค", `${r.code} — Future support`, "info"),
    });

    if (!["Completed", "Cancelled"].includes(task.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Task", icon: "circleSlash", danger: true, run: (r) => packCancel(r, ctx) });
    }

    return acts;
  },
};

export const PACK_DETAIL: DetailSchema<PackRow> = {
  key: "packing",
  entityLabel: "Packing Task",

  identity: (t) => ({
    image: t.icon,
    code: t.code,
    title: t.customer,
    copyFields: [
      { label: "Pack number", value: t.code },
      { label: "Sales order", value: t.soRef },
    ],
    badges: [
      { text: t.status, tone: tone(PACK_TONE, t.status) },
      ...(t.handling !== "ปกติ" ? ([{ text: t.handling, tone: "warning" }] as const) : []),
      { text: t.priority, tone: tone(PRIORITY_TONE, t.priority) },
    ],
    tags: [t.soRef, t.pickRef, t.warehouse].filter(Boolean),
  }),

  kpis: (t) => [
    { icon: "box", label: "Units to Pack", value: fmt(t.totalQty), sub: "หน่วย", goTab: "lines" },
    { icon: "packing", label: "Packed", value: fmt(t.packedQty), sub: `${t.pct}%`, goTab: "lines" },
    { icon: "layers", label: "Boxes", value: fmt(t.boxCount), sub: "กล่อง", goTab: "boxes" },
    {
      icon: "truck",
      label: "Total Weight",
      value: t.totalWeight ? `${t.totalWeight} กก.` : DASH,
      sub: t.doRef ? `ส่งของ ${t.doRef}` : "ยังไม่ออกใบส่งของ",
      wide: true,
      goTab: "boxes",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      aside: (t) => ({
        rows: [
          { icon: "salesOrder", label: "Sales Order", value: t.soRef },
          { icon: "picking", label: "From Pick", value: t.pickRef || DASH },
          { icon: "partner", label: "Customer", value: t.customer },
          { icon: "warehouse", label: "Warehouse", value: t.warehouse },
          { icon: "user", label: "Packer", value: t.packer || "รอมอบหมาย", muted: !t.packer },
          { icon: "alert", label: "Handling", value: t.handling },
          { icon: "clock", label: "Last Updated", value: t.updated, muted: true },
        ],
      }),
      blocks: (t) => {
        const so = getSO(t.soRef);
        return [
          t.status === "Completed" && !t.doRef && {
            type: "alert",
            tone: "info",
            title: "แพ็คเสร็จแล้ว รอออกใบส่งของ",
            message: `${t.boxCount} กล่อง น้ำหนักรวม ${t.totalWeight} กก. — สร้างใบส่งของได้จากเมนู Create Delivery Order`,
          },
          t.handling !== "ปกติ" && {
            type: "alert",
            tone: "warn",
            title: `ต้องระวังพิเศษ: ${t.handling}`,
            message: "แจ้งผู้ขนส่งและติดสัญลักษณ์บนกล่องทุกใบก่อนส่งมอบ",
          },
          {
            type: "fields",
            title: "Task Information",
            cols: 2,
            items: [
              { label: "Pack No.", value: t.code },
              { label: "Status", value: <Badge tone={tone(PACK_TONE, t.status)}>{t.status}</Badge> },
              { label: "Sales Order", value: <Badge tone="info">{t.soRef}</Badge> },
              { label: "Picking Task", value: t.pickRef ? <Badge tone="info">{t.pickRef}</Badge> : DASH },
              { label: "Customer", value: t.customer },
              { label: "Customer Code", value: t.customerCode },
              { label: "Warehouse", value: t.warehouse },
              { label: "Packer", value: t.packer || DASH },
              { label: "Pack Date", value: t.packDate || DASH },
              { label: "Due Date", value: t.dueDate || DASH },
              { label: "Handling", value: t.handling },
              { label: "Priority", value: <Badge tone={tone(PRIORITY_TONE, t.priority)}>{t.priority}</Badge> },
              t.doRef ? { label: "Delivery Order", value: <Badge tone="info">{t.doRef}</Badge> } : null,
            ],
          },
          so
            ? {
                type: "fields",
                title: "Delivery Context",
                cols: 2,
                items: [
                  { label: "Delivery Date", value: so.deliveryDate },
                  { label: "Incoterm", value: so.incoterm },
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
      label: "Items",
      blocks: (t) => [
        {
          type: "table",
          title: `Items to Pack (${t.itemCount})`,
          rows: (t.items ?? []).map((it) => ({
            ...it,
            remaining: Math.max(0, Number(it.qty) - Number(it.packedQty)),
          })),
          empty: "ไม่มีรายการ",
          cols: [
            { key: "line", label: "#", align: "right", muted: true },
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
            { key: "packedQty", label: "Packed", align: "right", cell: (r) => fmt(r.packedQty) },
            {
              key: "remaining",
              label: "คงเหลือ",
              align: "right",
              cell: (r) =>
                r.remaining > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(r.remaining)}</span>
                ) : (
                  DASH
                ),
            },
            { key: "unit", label: "UOM", muted: true },
            { key: "box", label: "Box", cell: (r) => (r.box ? <Badge tone="neutral">{r.box}</Badge> : DASH) },
            { key: "note", label: "Note", muted: true },
          ],
        },
      ],
    },

    {
      key: "boxes",
      label: "Boxes",
      blocks: (t) => [
        {
          type: "table",
          title: `Packages (${t.boxCount})`,
          rows: t.packages ?? [],
          empty: "ยังไม่ได้บรรจุกล่อง — เพิ่มกล่องในหน้าแก้ไข",
          cols: [
            { key: "box", label: "Box No.", cell: (r) => <span className="font-medium tnum">{r.box}</span> },
            { key: "type", label: "Box Type" },
            { key: "weight", label: "Weight (กก.)", align: "right", cell: (r) => r.weight },
            { key: "dim", label: "Dimension", muted: true },
            { key: "sealNo", label: "Seal No.", muted: true, cell: (r) => r.sealNo || DASH },
            { key: "note", label: "Note", muted: true, cell: (r) => r.note || DASH },
          ],
        },
        {
          type: "cards",
          title: "Package Summary",
          cols: 3,
          items: [
            { label: "Total Boxes", value: fmt(t.boxCount), unit: "กล่อง", tone: "accent" },
            { label: "Total Weight", value: `${t.totalWeight}`, unit: "กก." },
            { label: "Units Packed", value: fmt(t.packedQty), unit: "หน่วย" },
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
    const acts: RowAction<PackRow>[] = [];
    if (t.status === "Waiting")
      acts.push({ label: "Start Packing", icon: "play", run: () => packStart(t, ctx) });
    if (["Waiting", "In Progress"].includes(t.status))
      acts.push({ label: "Complete Packing", icon: "checkCircle", run: () => packComplete(t, ctx) });
    if (t.status === "Completed" && !t.doRef)
      acts.push({
        label: t.isConfirmed ? "แก้จำนวนที่ยืนยันส่ง" : "ยืนยันจำนวนที่ส่งได้",
        icon: "checkCircle",
        run: () => packConfirmShipQty(t, ctx),
      });
    if (t.status === "Completed" && !t.doRef && t.isConfirmed)
      acts.push({ label: "Create Delivery Order", icon: "delivery", run: () => packCreateDelivery(t, ctx) });
    acts.push({
      label: "Print Packing Slip",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ใบแพ็ค", `${t.code} — Future support`, "info"),
    });
    if (!["Completed", "Cancelled"].includes(t.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Task", icon: "circleSlash", danger: true, run: () => packCancel(t, ctx) });
    }
    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("packing", t, ctx));
    return acts;
  },
};

export const packSchemas: EntitySchemas<PackRow> = {
  list: PACK_LIST,
  detail: PACK_DETAIL,
  form: PACK_FORM,
  document: ({ record }) => <PackingDocument record={record} />,
};
