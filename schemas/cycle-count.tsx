import {
  ABC_CLASSES,
  COUNT_METHODS,
  COUNT_SCOPES,
  COUNT_STATUSES,
  COUNT_TOLERANCE,
  COUNT_TYPES,
} from "@/data/counts";
import { PRIORITY_TONE, tone } from "@/lib/badges";
import { fmt, money, money0 } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema, TableCol } from "@/lib/types";
import {
  CNT_TONE,
  RISK_TONE,
  SERIAL_RESULT_TONE,
  VARIANCE_TONE,
  adjustableLines,
  countRows,
  countSummary,
  countedQty,
  isCounted,
  isHighValue,
  movementWarnings,
  needsRecount,
  recommendedAction,
  riskLevel,
  variancePct,
  varianceQty,
  varianceType,
  varianceValue,
  type CntRow,
} from "@/lib/domain/count";
import {
  cntAcceptVariance,
  cntApprove,
  cntAssign,
  cntBulk,
  cntCancel,
  cntCloseException,
  cntCreateAdjustment,
  cntEnter,
  cntException,
  cntMarkEmpty,
  cntMovementDecision,
  cntPause,
  cntPlan,
  cntPrint,
  cntReject,
  cntReopen,
  cntRequestRecount,
  cntRequestRevision,
  cntSetRootCause,
  cntStart,
  cntSubmit,
} from "@/lib/workflows-count";
import { Badge } from "@/components/ui";
import type { CntLine } from "@/data/counts";

/* ============================================================
   CYCLE COUNT — physical stock against the snapshot.

   The count records evidence; it never moves stock. An approved
   variance becomes a Stock Adjustment draft, and only posting that
   adjustment changes a balance. A blind count keeps the system
   quantity out of the counter's sight until the count is submitted,
   which is why every system-quantity column is conditional.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

/** Variance, coloured the way a count sheet reads it. */
const varianceCell = (l: CntLine) => {
  if (!isCounted(l)) return <span className="text-ink-3">—</span>;
  const v = varianceQty(l);
  return v === 0 ? (
    <span className="font-semibold text-success">0</span>
  ) : v > 0 ? (
    <span className="font-semibold text-info">+{fmt(v)}</span>
  ) : (
    <span className="font-semibold text-danger">{fmt(v)}</span>
  );
};

const progressBar = (pct: number) => (
  <span className="flex items-center gap-2">
    <span className="block h-[5px] w-16 overflow-hidden rounded-pill bg-line">
      <span
        className={
          pct >= 100 ? "block h-full rounded-pill bg-success" : "block h-full rounded-pill bg-primary"
        }
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </span>
    <span className="tnum text-cap text-ink-2">{pct}%</span>
  </span>
);

/* ---------- List ---------- */

const list: ListSchema<CntRow> = {
  key: "cycle-count",
  entity: "Cycle Count",
  entityPlural: "count plans",
  title: "Cycle Count",
  subtitle:
    "Plan, execute, review, and approve physical inventory counts with complete variance traceability.",
  crumb: "Cycle Count",
  crumbParent: "Inventory",
  primaryLabel: "สร้างแผนตรวจนับ",
  searchPlaceholder:
    "ค้นหา เลขที่แผน / คลัง / ตำแหน่ง / สินค้า / Lot / Serial / ผู้ตรวจนับ / ผู้ตรวจสอบ / อ้างอิง",
  emptyTitle: "ไม่พบแผนตรวจนับที่ตรงกับเงื่อนไข",

  source: countRows,

  searchFields: [
    "code",
    "warehouse",
    "whLabel",
    "scopeLabel",
    "type",
    "method",
    "counter",
    "supervisor",
    "requestedBy",
    "reference",
    "description",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "draft", label: "ร่าง", test: (r) => r.status === "Draft" },
    { key: "planned", label: "วางแผนแล้ว", test: (r) => r.status === "Planned" },
    { key: "assigned", label: "มอบหมายแล้ว", test: (r) => r.status === "Assigned" },
    { key: "progress", label: "กำลังนับ", test: (r) => r.status === "In Progress" },
    { key: "submitted", label: "ส่งผลแล้ว", test: (r) => r.status === "Count Submitted" },
    { key: "review", label: "ตรวจส่วนต่าง", test: (r) => r.status === "Variance Review" },
    {
      key: "recount",
      label: "ต้องนับซ้ำ",
      test: (r) => r.status === "Recount Required" || r.openRecountLines > 0,
    },
    {
      key: "adjustment",
      label: "รอปรับปรุง",
      test: (r) => r.status === "Adjustment Pending" || r.status === "Approved",
    },
    { key: "done", label: "เสร็จสิ้น", test: (r) => r.status === "Completed" },
    { key: "cancelled", label: "ยกเลิก", test: (r) => r.status === "Cancelled" },
  ],

  filters: [
    {
      id: "status",
      label: "Count Status",
      options: () => [...COUNT_STATUSES],
      test: (r, v) => r.status === v,
    },
    { id: "type", label: "Count Type", options: () => [...COUNT_TYPES], test: (r, v) => r.type === v },
    {
      id: "method",
      label: "Count Method",
      options: () => [...COUNT_METHODS],
      test: (r, v) => r.method === v,
    },
    {
      id: "scope",
      label: "Count Scope",
      options: () => [...COUNT_SCOPES],
      test: (r, v) => r.scope === v,
    },
    {
      id: "date",
      label: "Count Date",
      options: () => uniq(countRows().map((r) => r.countDate)),
      test: (r, v) => r.countDate === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => uniq(countRows().map((r) => r.whLabel)),
      test: (r, v) => r.whLabel === v,
    },
    {
      id: "zone",
      label: "Zone",
      options: () => uniq(countRows().map((r) => r.zone)),
      test: (r, v) => r.zone === v,
    },
    {
      id: "rack",
      label: "Rack",
      options: () => uniq(countRows().map((r) => r.rack)),
      test: (r, v) => r.rack === v,
    },
    {
      id: "bin",
      label: "Bin",
      options: () => uniq(countRows().map((r) => r.bin)),
      test: (r, v) => r.bin === v,
    },
    {
      id: "product",
      label: "Product",
      options: () => uniq(countRows().flatMap((r) => r.lines.map((l) => l.code))),
      test: (r, v) => r.lines.some((l) => l.code === v),
    },
    {
      id: "cat",
      label: "Category",
      options: () => uniq(countRows().flatMap((r) => r.lines.map((l) => l.cat))),
      test: (r, v) => r.lines.some((l) => l.cat === v),
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(countRows().flatMap((r) => r.lines.map((l) => l.brand))),
      test: (r, v) => r.lines.some((l) => l.brand === v),
    },
    {
      id: "abc",
      label: "ABC Class",
      options: () => [...ABC_CLASSES],
      test: (r, v) => r.abcClass === v || r.lines.some((l) => l.abc === v),
    },
    {
      id: "counter",
      label: "Counter",
      options: () => uniq(countRows().map((r) => r.counter)),
      test: (r, v) => r.counter === v || r.secondaryCounter === v,
    },
    {
      id: "supervisor",
      label: "Supervisor",
      options: () => uniq(countRows().map((r) => r.supervisor)),
      test: (r, v) => r.supervisor === v,
    },
    {
      id: "variance",
      label: "Variance Only",
      options: yesNo,
      test: (r) => r.acc.varianceLines > 0,
    },
    {
      id: "recountOnly",
      label: "Recount Only",
      options: yesNo,
      test: (r) => r.openRecountLines > 0 || r.round > 1,
    },
    {
      id: "highValue",
      label: "High-Value Variance",
      options: yesNo,
      test: (r) => r.lines.some(isHighValue),
    },
    {
      id: "serialMismatch",
      label: "Serial Mismatch",
      options: yesNo,
      test: (r) => r.lines.some((l) => varianceType(l) === "Serial Mismatch"),
    },
    {
      id: "lotMismatch",
      label: "Lot Mismatch",
      options: yesNo,
      test: (r) => r.lines.some((l) => l.lot && varianceQty(l) !== 0),
    },
    {
      id: "adjPending",
      label: "Adjustment Pending",
      options: yesNo,
      test: (r) => r.status === "Adjustment Pending" || (r.status === "Approved" && !r.adjustmentRef),
    },
    {
      id: "mine",
      label: "My Counts",
      options: () => uniq(countRows().map((r) => r.counter)),
      test: (r, v) => r.counter === v || r.supervisor === v || r.requestedBy === v,
    },
    {
      id: "myWarehouse",
      label: "My Warehouse",
      options: () => uniq(countRows().map((r) => r.warehouse)),
      test: (r, v) => r.warehouse === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "Count Number",
      sortable: true,
      locked: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold">{r.code}</span>
          {r.round > 1 && <span className="text-cap text-warning">รอบที่ {r.round}</span>}
        </span>
      ),
    },
    { key: "countDate", label: "Count Date", sortable: true, cell: (r) => r.countDate },
    { key: "type", label: "Count Type", sortable: true, cell: (r) => r.type },
    {
      key: "method",
      label: "Count Method",
      sortable: true,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          {r.method}
          {r.blind && <Badge tone="primary">Blind</Badge>}
        </span>
      ),
    },
    {
      key: "warehouse",
      label: "Warehouse",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.warehouse}</span>
          <span className="text-cap text-ink-3">{r.scopeLabel}</span>
        </span>
      ),
    },
    { key: "scope", label: "Count Scope", muted: true, defaultHidden: true, cell: (r) => r.scope },
    {
      key: "locationCount",
      label: "Locations",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => fmt(r.locationCount),
    },
    {
      key: "productCount",
      label: "Products",
      align: "right",
      muted: true,
      cell: (r) => fmt(r.productCount),
    },
    {
      key: "countedLines",
      label: "Counted Lines",
      align: "right",
      sortable: true,
      sortValue: (r) => r.acc.countedLines,
      cell: (r) => `${fmt(r.acc.countedLines)} / ${fmt(r.acc.totalLines)}`,
    },
    {
      key: "varianceLines",
      label: "Variance Lines",
      align: "right",
      sortable: true,
      sortValue: (r) => r.acc.varianceLines,
      cell: (r) =>
        r.acc.varianceLines ? <Badge tone="warning">{fmt(r.acc.varianceLines)}</Badge> : "—",
    },
    {
      key: "recountLines",
      label: "Recount Lines",
      align: "right",
      muted: true,
      cell: (r) => (r.openRecountLines ? <Badge tone="danger">{fmt(r.openRecountLines)}</Badge> : "—"),
    },
    {
      key: "accuracy",
      label: "Count Accuracy",
      align: "right",
      sortable: true,
      sortValue: (r) => r.acc.lineAccuracy,
      cell: (r) => (r.acc.countedLines ? `${r.acc.lineAccuracy}%` : "—"),
    },
    { key: "progress", label: "Progress", cell: (r) => progressBar(r.completion) },
    { key: "counter", label: "Assigned Counter", muted: true, cell: (r) => r.counter || "—" },
    {
      key: "supervisor",
      label: "Supervisor",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.supervisor,
    },
    {
      key: "adjustmentStatus",
      label: "Adjustment Status",
      defaultHidden: true,
      cell: (r) =>
        r.adjustmentRef ? (
          <Badge tone="info">{r.adjustmentRef}</Badge>
        ) : (
          <span className="text-ink-3">{r.adjustmentStatus}</span>
        ),
    },
    {
      key: "status",
      label: "Count Status",
      sortable: true,
      cell: (r) => <Badge tone={CNT_TONE[r.status] ?? "neutral"}>{r.status}</Badge>,
    },
    { key: "updated", label: "Updated At", sortable: true, muted: true, cell: (r) => r.updated },
  ],

  secondaryActions: (ctx) => [
    {
      label: "ตรวจนับด่วน",
      icon: "play",
      run: () => ctx.goto("/m/cycle-count/new?type=spot"),
    },
    {
      label: "นำเข้าผลนับ",
      icon: "download",
      run: () => ctx.toast("นำเข้าผลนับ", "เลือกไฟล์ Excel ผลการนับ — Future support", "info"),
    },
    {
      label: "Export",
      icon: "upload",
      run: () =>
        ctx.toast("ส่งออกข้อมูล", `เตรียมไฟล์ ${fmt(countRows().length)} แผน — Future support`, "info"),
    },
    {
      label: "พิมพ์ใบนับ",
      icon: "printer",
      run: () =>
        ctx.toast(
          "พิมพ์ใบนับ",
          "ใบนับแบบปิดตาจะไม่แสดงยอดระบบและส่วนต่าง — Future support",
          "info",
        ),
    },
  ],

  hero: (ctx) => {
    const s = countSummary();
    return {
      kpis: [
        { icon: "checkCircle", label: "Total Count Plans", value: fmt(s.total), goTab: "all" },
        { icon: "calendar", label: "Planned", value: fmt(s.planned), goTab: "planned" },
        { icon: "play", label: "In Progress", value: fmt(s.inProgress), tone: "warn", goTab: "progress" },
        { icon: "send", label: "Submitted", value: fmt(s.submitted), goTab: "submitted" },
        {
          icon: "alert",
          label: "Variance Review",
          value: fmt(s.varianceReview),
          tone: "warn",
          goTab: "review",
        },
        {
          icon: "refresh",
          label: "Recount Required",
          value: fmt(s.recountRequired),
          tone: "warn",
          goTab: "recount",
        },
        {
          icon: "sliders",
          label: "Adjustment Pending",
          value: fmt(s.adjustmentPending),
          goTab: "adjustment",
        },
        { icon: "check", label: "Completed Today", value: fmt(s.completedToday), tone: "ok", goTab: "done" },
        { icon: "trend", label: "Count Accuracy", value: `${s.accuracy}%`, tone: "ok" },
        {
          icon: "pricing",
          label: "Total Variance Value",
          value: money0(s.varianceValue),
          sub: "Operational preview",
          tone: "primary",
          run: () =>
            ctx.toast(
              "Variance Value Preview",
              "ตัวเลขมูลค่าเป็นค่าประมาณ ระบบบัญชีจริงจะทำในเฟส Finance",
              "info",
            ),
        },
      ],
    };
  },

  rowActions: (rec, ctx) => [
    { label: "เปิดรายละเอียด", icon: "eye", run: () => ctx.goto(`/m/cycle-count/${rec.code}`) },
    {
      label: "แก้ไขแผน",
      icon: "edit",
      disabled: !rec.isEditable && !rec.isLimitedEdit,
      disabledReason: "แก้ไขได้เฉพาะสถานะ Draft, Planned, Assigned และ Revision Requested",
      run: () => ctx.goto(`/m/cycle-count/${rec.code}/edit`),
    },
    { sep: true },
    { label: "มอบหมายผู้ตรวจนับ", icon: "user", disabled: !rec.canAssign, run: () => cntAssign(rec, ctx) },
    { label: "เริ่มตรวจนับ", icon: "play", disabled: !rec.canStart, run: () => cntStart(rec, ctx) },
    {
      label: "บันทึกผลนับ",
      icon: "edit",
      disabled: !rec.canEnterCounts,
      run: () => cntEnter(rec, ctx),
    },
    { label: "ส่งผลนับ", icon: "send", disabled: !rec.canSubmit, run: () => cntSubmit(rec, ctx) },
    { sep: true },
    {
      label: "ขอให้นับซ้ำ",
      icon: "refresh",
      disabled: !rec.canRecount,
      run: () => cntRequestRecount(rec, ctx),
    },
    {
      label: "อนุมัติ",
      icon: "checkCircle",
      disabled: !rec.canApprove,
      disabledReason: "ยังมีบรรทัดที่ต้องนับซ้ำ",
      run: () => cntApprove(rec, ctx),
    },
    {
      label: "สร้างใบปรับปรุงสต๊อก",
      icon: "sliders",
      disabled: !rec.canCreateAdjustment,
      disabledReason: "ต้องอนุมัติผลนับก่อน และสร้างได้ครั้งเดียว",
      run: () => cntCreateAdjustment(rec, ctx),
    },
    { sep: true },
    { label: "พิมพ์ใบนับ", icon: "printer", run: () => cntPrint(rec, ctx) },
    {
      label: "ยกเลิกแผน",
      icon: "circleSlash",
      danger: true,
      disabled: !rec.canCancel,
      run: () => cntCancel(rec, ctx),
    },
  ],

  bulkActions: cntBulk,
};

/* ---------- Detail ---------- */

/** Count sheet columns. The system quantity only appears once it is revealed. */
function sheetCols(r: CntRow): TableCol<CntLine>[] {
  const base: TableCol<CntLine>[] = [
    { key: "line", label: "#", align: "right", muted: true, cell: (l) => l.line },
    {
      key: "code",
      label: "Product",
      cell: (l) => (
        <span className="flex flex-col">
          <span className="font-semibold">{l.name}</span>
          <span className="text-cap text-ink-3">
            {l.code} · {l.barcode}
          </span>
        </span>
      ),
    },
    {
      key: "location",
      label: "Location",
      muted: true,
      cell: (l) => [l.zone, l.rack, l.shelf, l.bin].filter(Boolean).join("-") || "—",
    },
    { key: "stockStatus", label: "Stock Status", muted: true, cell: (l) => l.stockStatus },
    { key: "lot", label: "Lot", muted: true, cell: (l) => l.lot || "—" },
    { key: "exp", label: "Expiry", muted: true, cell: (l) => l.exp || "—" },
    { key: "unit", label: "UOM", muted: true, cell: (l) => l.unit },
    {
      key: "serialRequired",
      label: "Serial Required",
      muted: true,
      cell: (l) => (l.serialRequired ? "ใช่" : "—"),
    },
  ];

  const counts: TableCol<CntLine>[] = [
    {
      key: "firstCount",
      label: "First Count",
      align: "right",
      cell: (l) => (l.firstCount === null ? <span className="text-ink-3">—</span> : fmt(l.firstCount)),
    },
    {
      key: "recount",
      label: "Recount",
      align: "right",
      cell: (l) => (l.recount === null ? <span className="text-ink-3">—</span> : fmt(l.recount)),
    },
    {
      key: "finalCount",
      label: "Final Count",
      align: "right",
      cell: (l) =>
        countedQty(l) === null ? (
          <span className="text-ink-3">รอนับ</span>
        ) : (
          <span className="font-semibold">{fmt(countedQty(l)!)}</span>
        ),
    },
  ];

  const revealed: TableCol<CntLine>[] = [
    { key: "systemQty", label: "System Qty", align: "right", cell: (l) => fmt(l.systemQty) },
    { key: "variance", label: "Variance Qty", align: "right", cell: varianceCell },
    {
      key: "variancePct",
      label: "Variance %",
      align: "right",
      muted: true,
      cell: (l) => (variancePct(l) === null ? "—" : `${variancePct(l)}%`),
    },
    {
      key: "result",
      label: "Count Result",
      cell: (l) => (
        <Badge tone={VARIANCE_TONE[varianceType(l)] ?? "neutral"}>{varianceType(l)}</Badge>
      ),
    },
  ];

  const trailer: TableCol<CntLine>[] = [
    { key: "counter", label: "Counter", muted: true, cell: (l) => l.counter || "—" },
    { key: "countTime", label: "Count Time", muted: true, cell: (l) => l.countTime || "—" },
    { key: "note", label: "Notes", muted: true, cell: (l) => l.note || "—" },
  ];

  /* Blind count: the counter sees no system quantity, no variance, no value. */
  return r.systemVisible
    ? [...base, ...revealed.slice(0, 1), ...counts, ...revealed.slice(1), ...trailer]
    : [...base, ...counts, ...trailer];
}

const detail: DetailSchema<CntRow> = {
  key: "cycle-count",
  entityLabel: "Cycle Count",

  identity: (r) => ({
    code: r.code,
    title: `${r.type} · ${r.whLabel}`,
    copyFields: [
      { label: "Count Number", value: r.code },
      ...(r.reference ? [{ label: "Reference", value: r.reference }] : []),
      ...(r.adjustmentRef ? [{ label: "Adjustment", value: r.adjustmentRef }] : []),
    ],
    badges: [
      { text: r.status, tone: CNT_TONE[r.status] ?? "neutral" },
      ...(r.blind ? [{ text: "Blind Count", tone: "primary" as const }] : []),
      ...(r.openRecountLines ? [{ text: `${r.openRecountLines} recount`, tone: "danger" as const }] : []),
      ...(r.openExceptions ? [{ text: `${r.openExceptions} exception`, tone: "danger" as const }] : []),
    ],
    tags: [r.method, r.scopeLabel, r.scope, r.priority],
  }),

  kpis: (r) => [
    { icon: "grid", label: "Total Lines", value: fmt(r.acc.totalLines), goTab: "sheet" },
    { icon: "checkCircle", label: "Counted", value: fmt(r.acc.countedLines), goTab: "sheet" },
    { icon: "alert", label: "Variance Lines", value: fmt(r.acc.varianceLines), goTab: "variance" },
    { icon: "refresh", label: "Recount Lines", value: fmt(r.openRecountLines), goTab: "recount" },
    { icon: "trend", label: "Accuracy", value: `${r.acc.lineAccuracy}%`, goTab: "accuracy" },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => [
        r.blind && !r.systemVisible && {
          type: "alert",
          tone: "info",
          title: "การนับแบบปิดตากำลังดำเนินอยู่",
          message:
            "ยอดระบบ ส่วนต่าง และมูลค่าจะถูกซ่อนจากผู้ตรวจนับจนกว่าจะส่งผลนับ",
        },
        r.movementWarnings > 0 && {
          type: "alert",
          tone: "warn",
          title: "พบการเคลื่อนไหวของสต๊อกระหว่างการตรวจนับ",
          message: `${r.movementWarnings} รายการเกิดขึ้นหลังเวลา Snapshot — ต้องตัดสินใจว่าจะใช้ยอดใด`,
        },
        !r.segregationOk && {
          type: "alert",
          tone: "danger",
          title: "แบ่งแยกหน้าที่ไม่ผ่าน",
          message: "ผู้ตรวจนับกับผู้อนุมัติเป็นคนเดียวกัน",
        },
        Boolean(r.rejectReason) && {
          type: "alert",
          tone: "danger",
          title: r.status === "Rejected" ? "ไม่อนุมัติ" : "ขอให้แก้ไข",
          message: r.rejectReason,
        },
        Boolean(r.cancelReason) && {
          type: "alert",
          tone: "warn",
          title: "ยกเลิกแล้ว",
          message: r.cancelReason,
        },
        {
          type: "fields",
          title: "Count Information",
          cols: 2,
          items: [
            { label: "Count Number", value: r.code },
            { label: "Count Type", value: r.type },
            { label: "Count Method", value: r.method },
            { label: "Count Date", value: r.countDate },
            { label: "Scheduled Start", value: r.scheduledStart },
            { label: "Scheduled End", value: r.scheduledEnd },
            { label: "Snapshot Date and Time", value: r.snapshotAt },
            { label: "Priority", value: r.priority },
            { label: "Status", value: r.status },
            { label: "Created By", value: r.createdBy },
            { label: "Description", value: r.description, span: true },
          ],
        },
        {
          type: "fields",
          title: "Warehouse and Scope",
          cols: 2,
          items: [
            { label: "Warehouse", value: r.whLabel },
            { label: "Zone / Rack / Bin", value: r.scopeLabel },
            { label: "Count Scope", value: r.scope },
            { label: "Product Category", value: r.category || "ทุกหมวด" },
            { label: "ABC Class", value: r.abcClass || "ทุกระดับ" },
            { label: "Stock Status Scope", value: r.statusScope },
            { label: "Number of Locations", value: fmt(r.locationCount) },
            { label: "Number of Products", value: fmt(r.productCount) },
            { label: "Number of Lots", value: fmt(r.lotCount) },
            { label: "Number of Serials", value: fmt(r.serialCount) },
          ],
        },
        {
          type: "fields",
          title: "Assignment",
          cols: 2,
          items: [
            { label: "Primary Counter", value: r.counter || "—" },
            { label: "Secondary Counter", value: r.secondaryCounter || "—" },
            { label: "Supervisor", value: r.supervisor },
            { label: "Assigned Date", value: r.assignedAt || "—" },
            { label: "Started Date", value: r.startedAt || "—" },
            { label: "Submitted Date", value: r.submittedAt || "—" },
            { label: "Reviewed Date", value: r.reviewedAt || "—" },
            {
              label: "Segregation of Duties",
              value: r.segregationOk ? "ผ่าน" : "ไม่ผ่าน",
            },
          ],
        },
        {
          type: "cards",
          title: "Count Summary",
          cols: 4,
          items: [
            { label: "Total Lines", value: fmt(r.acc.totalLines) },
            { label: "Counted Lines", value: fmt(r.acc.countedLines), tone: "accent" },
            { label: "Matching Lines", value: fmt(r.acc.matchingLines) },
            { label: "Variance Lines", value: fmt(r.acc.varianceLines), tone: r.acc.varianceLines ? "warn" : undefined },
            { label: "Recount Lines", value: fmt(r.openRecountLines), tone: r.openRecountLines ? "warn" : undefined },
            { label: "Positive Variance", value: `+${fmt(r.acc.positiveVariance)}` },
            { label: "Negative Variance", value: fmt(r.acc.negativeVariance) },
            { label: "Count Accuracy", value: `${r.acc.lineAccuracy}%`, tone: "accent" },
          ],
        },
      ],
      aside: (r) => ({
        rows: [
          { icon: "warehouse", label: "Warehouse", value: r.whLabel },
          { icon: "mapPin", label: "Scope", value: r.scopeLabel, muted: true },
          { icon: "clock", label: "Snapshot", value: r.snapshotAt, muted: true },
          { icon: "user", label: "Counter", value: r.counter || "—" },
          { icon: "shield", label: "Supervisor", value: r.supervisor, muted: true },
          { icon: "grid", label: "Progress", value: `${r.completion}%` },
          { icon: "trend", label: "Accuracy", value: `${r.acc.lineAccuracy}%` },
          {
            icon: "sliders",
            label: "Adjustment",
            value: r.adjustmentRef || r.adjustmentStatus,
            muted: true,
          },
        ],
      }),
    },

    {
      key: "scope",
      label: "Count Scope",
      blocks: (r): Block[] => [
        {
          type: "cards",
          title: "Scope Preview",
          cols: 4,
          items: [
            { label: "Warehouses", value: "1" },
            { label: "Locations", value: fmt(r.locationCount) },
            { label: "Products", value: fmt(r.productCount) },
            { label: "Lots", value: fmt(r.lotCount) },
            { label: "Serials", value: fmt(r.serialCount) },
            { label: "Lines", value: fmt(r.acc.totalLines) },
            { label: "Stock Status", value: r.statusScope },
            { label: "Estimated Time", value: `${Math.max(1, Math.round(r.acc.totalLines * 1.5))} นาที` },
          ],
        },
        {
          type: "table",
          title: "ตำแหน่งที่อยู่ในขอบเขต",
          rows: [...new Set(r.lines.map((l) => `${l.zone}-${l.rack}-${l.bin}`))].map((loc) => {
            const lines = r.lines.filter((l) => `${l.zone}-${l.rack}-${l.bin}` === loc);
            return {
              loc,
              products: new Set(lines.map((l) => l.code)).size,
              lines: lines.length,
              counted: lines.filter(isCounted).length,
            };
          }),
          empty: "ยังไม่ได้กำหนดขอบเขต",
          cols: [
            { key: "loc", label: "Location", cell: (x) => <span className="font-semibold">{x.loc}</span> },
            { key: "products", label: "Products", align: "right", cell: (x) => fmt(x.products) },
            { key: "lines", label: "Lines", align: "right", cell: (x) => fmt(x.lines) },
            { key: "counted", label: "Counted", align: "right", cell: (x) => fmt(x.counted) },
          ],
        },
      ],
    },

    {
      key: "sheet",
      label: "Count Sheet",
      blocks: (r): Block[] => [
        !r.systemVisible && {
          type: "note",
          title: "Blind count",
          text: "คอลัมน์ยอดระบบ ส่วนต่าง และผลการนับถูกซ่อนไว้ตามวิธีการนับแบบปิดตา จะแสดงให้ผู้ตรวจสอบหลังส่งผลนับ",
        },
        {
          type: "table",
          title: `Count Sheet (${r.acc.countedLines}/${r.acc.totalLines})`,
          rows: r.lines,
          empty: "ยังไม่มีรายการตรวจนับ",
          cols: sheetCols(r),
        },
        {
          type: "cards",
          title: "Progress",
          cols: 4,
          items: [
            { label: "Total Lines", value: fmt(r.acc.totalLines) },
            { label: "Counted", value: fmt(r.acc.countedLines), tone: "accent" },
            { label: "Remaining", value: fmt(r.acc.remainingLines), tone: r.acc.remainingLines ? "warn" : undefined },
            { label: "Completion", value: `${r.completion}%` },
          ],
        },
      ],
    },

    {
      key: "variance",
      label: "Variance",
      when: (r) => r.systemVisible,
      blocks: (r): Block[] => {
        const rows = r.lines.filter((l) => isCounted(l) && varianceQty(l) !== 0);
        return [
          {
            type: "cards",
            title: "Variance Summary",
            cols: 4,
            items: [
              { label: "Positive Variance", value: `+${fmt(r.acc.positiveVariance)}` },
              { label: "Negative Variance", value: fmt(r.acc.negativeVariance) },
              { label: "Net Variance", value: `${r.acc.netVariance >= 0 ? "+" : ""}${fmt(r.acc.netVariance)}`, tone: "accent" },
              { label: "High-Risk Lines", value: fmt(r.highRiskLines), tone: r.highRiskLines ? "warn" : undefined },
              { label: "Variance Lines", value: fmt(r.acc.varianceLines) },
              { label: "Recount Lines", value: fmt(r.openRecountLines) },
              { label: "Value Impact", value: money(r.acc.varianceValue), tone: "accent" },
              {
                label: "Adjustment Required",
                value: adjustableLines(r).length ? "ต้องปรับปรุง" : "ไม่ต้อง",
              },
            ],
          },
          {
            type: "table",
            title: "Variance Review",
            rows,
            empty: "ไม่มีส่วนต่าง — ผลนับตรงกับระบบทุกบรรทัด",
            cols: [
              {
                key: "code",
                label: "Product",
                cell: (l) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{l.name}</span>
                    <span className="text-cap text-ink-3">{l.code}</span>
                  </span>
                ),
              },
              {
                key: "location",
                label: "Location",
                muted: true,
                cell: (l) => [l.zone, l.rack, l.bin].filter(Boolean).join("-"),
              },
              {
                key: "lotSerial",
                label: "Lot / Serial",
                muted: true,
                cell: (l) => l.lot || (l.serials ?? []).length ? l.lot || `${l.serials.length} serial` : "—",
              },
              { key: "systemQty", label: "System Qty", align: "right", cell: (l) => fmt(l.systemQty) },
              {
                key: "firstCount",
                label: "First Count",
                align: "right",
                muted: true,
                cell: (l) => (l.firstCount === null ? "—" : fmt(l.firstCount)),
              },
              {
                key: "recount",
                label: "Recount",
                align: "right",
                muted: true,
                cell: (l) => (l.recount === null ? "—" : fmt(l.recount)),
              },
              {
                key: "finalCount",
                label: "Final Count",
                align: "right",
                cell: (l) => <span className="font-semibold">{fmt(countedQty(l)!)}</span>,
              },
              { key: "variance", label: "Variance Qty", align: "right", cell: varianceCell },
              {
                key: "pct",
                label: "Variance %",
                align: "right",
                muted: true,
                cell: (l) => (variancePct(l) === null ? "—" : `${variancePct(l)}%`),
              },
              {
                key: "value",
                label: "Value Impact",
                align: "right",
                muted: true,
                cell: (l) => money(varianceValue(l)),
              },
              {
                key: "type",
                label: "Variance Type",
                cell: (l) => (
                  <Badge tone={VARIANCE_TONE[varianceType(l)] ?? "neutral"}>{varianceType(l)}</Badge>
                ),
              },
              {
                key: "risk",
                label: "Risk Level",
                cell: (l) => <Badge tone={RISK_TONE[riskLevel(l)] ?? "neutral"}>{riskLevel(l)}</Badge>,
              },
              { key: "rootCause", label: "Root Cause", muted: true, cell: (l) => l.rootCause || "ยังไม่ระบุ" },
              { key: "action", label: "Recommended Action", muted: true, cell: recommendedAction },
              {
                key: "review",
                label: "Review Status",
                cell: (l) => (
                  <Badge tone={l.reviewStatus === "Accepted" ? "success" : "warning"}>
                    {l.reviewStatus}
                  </Badge>
                ),
              },
            ],
          },
          {
            type: "note",
            title: "Tolerance (mock rule)",
            text: `ยอมรับได้ ±${COUNT_TOLERANCE.qty} หน่วย หรือ ±${COUNT_TOLERANCE.pct}% · มูลค่า ±${COUNT_TOLERANCE.value.toLocaleString()} · Serial ไม่ตรง สินค้าที่ไม่คาดคิด และสินค้าหายทั้งบรรทัด ต้องนับซ้ำเสมอ`,
          },
        ];
      },
    },

    {
      key: "recount",
      label: "Recount",
      blocks: (r): Block[] => {
        const rows = r.lines.filter((l) => l.recount !== null || needsRecount(l));
        return [
          {
            type: "fields",
            title: "Recount Round",
            cols: 2,
            items: [
              { label: "Count Round", value: String(r.round) },
              { label: "Previous Counter", value: r.counter || "—" },
              { label: "Recount Counter", value: r.secondaryCounter || "ยังไม่มอบหมาย" },
              { label: "Recount Reason", value: r.recountReason || "—" },
              { label: "Supervisor", value: r.supervisor },
              { label: "Open Recount Lines", value: fmt(r.openRecountLines) },
            ],
          },
          {
            type: "table",
            title: "Recount Lines",
            rows,
            empty: "ไม่มีบรรทัดที่ต้องนับซ้ำ",
            cols: [
              {
                key: "code",
                label: "Product",
                cell: (l) => <span className="font-semibold">{l.name}</span>,
              },
              { key: "systemQty", label: "System Qty", align: "right", cell: (l) => fmt(l.systemQty) },
              {
                key: "firstCount",
                label: "First Count",
                align: "right",
                cell: (l) => (l.firstCount === null ? "—" : fmt(l.firstCount)),
              },
              {
                key: "recount",
                label: "Recount Qty",
                align: "right",
                cell: (l) =>
                  l.recount === null ? <span className="text-ink-3">รอนับซ้ำ</span> : fmt(l.recount),
              },
              {
                key: "final",
                label: "Final Approved Qty",
                align: "right",
                cell: (l) => (countedQty(l) === null ? "—" : <span className="font-semibold">{fmt(countedQty(l)!)}</span>),
              },
              { key: "variance", label: "Variance", align: "right", cell: varianceCell },
              {
                key: "diff",
                label: "ผลนับต่างกัน",
                cell: (l) =>
                  l.recount !== null && l.recount !== l.firstCount ? (
                    <Badge tone="danger">ต่างกัน</Badge>
                  ) : l.recount !== null ? (
                    <Badge tone="success">ตรงกัน</Badge>
                  ) : (
                    "—"
                  ),
              },
            ],
          },
          {
            type: "note",
            title: "Recount rule",
            text: "การนับซ้ำใช้ช่องแยกจากผลนับครั้งแรก ผลนับเดิมจึงไม่ถูกเขียนทับ · ควรให้ผู้นับคนละคนกับรอบแรก · ถ้าผลสองรอบต่างกัน ต้องให้ผู้ตรวจสอบตัดสิน",
          },
        ];
      },
    },

    {
      key: "approval",
      label: "Approval",
      blocks: (r): Block[] => [
        {
          type: "fields",
          title: "Approval",
          cols: 2,
          items: [
            { label: "Approval Status", value: r.approvalStatus },
            { label: "Supervisor", value: r.supervisor },
            { label: "Approved By", value: r.approvedBy || "—" },
            { label: "Approved At", value: r.approvedAt || "—" },
            { label: "Segregation of Duties", value: r.segregationOk ? "ผ่าน" : "ไม่ผ่าน" },
            { label: "Reject / Revision Reason", value: r.rejectReason || "—", span: true },
          ],
        },
        r.openRecountLines > 0 && {
          type: "alert",
          tone: "danger",
          title: "ยังอนุมัติไม่ได้",
          message: `ต้องปิดบรรทัดที่ต้องนับซ้ำอีก ${r.openRecountLines} บรรทัดก่อนอนุมัติ`,
        },
        r.approvalReasons.length > 0
          ? {
              type: "flags",
              title: "เหตุที่ต้องอนุมัติ",
              items: r.approvalReasons.map((f) => ({ label: f, value: true })),
            }
          : {
              type: "alert",
              tone: "success",
              title: "ไม่เข้าเงื่อนไขที่ต้องอนุมัติพิเศษ",
              message: "ส่วนต่างอยู่ในเกณฑ์ที่ผู้ตรวจสอบอนุมัติได้",
            },
        {
          type: "timeline",
          title: "Approval flow",
          items: [
            { title: "Counter Submission", detail: r.counter || "—", when: r.submittedAt, kind: r.submittedAt ? "primary" : "" },
            {
              title: "Warehouse Supervisor Review",
              detail: r.supervisor,
              when: r.reviewedAt,
              kind: r.reviewedAt ? "info" : "",
            },
            {
              title: "Inventory Manager Approval",
              detail: r.approvedBy || "รอการอนุมัติ",
              when: r.approvedAt,
              kind: r.approvedBy ? "primary" : "",
            },
            {
              title: "Finance Review",
              detail:
                Math.abs(r.acc.varianceValue) >= COUNT_TOLERANCE.value
                  ? "มูลค่าส่วนต่างสูง ต้องผ่านฝ่ายการเงิน"
                  : "ไม่เข้าเกณฑ์มูลค่าสูง",
              kind: Math.abs(r.acc.varianceValue) >= COUNT_TOLERANCE.value ? "warn" : "",
            },
          ],
        },
      ],
    },

    {
      key: "adjustment",
      label: "Stock Adjustment",
      blocks: (r, ctx): Block[] => [
        r.adjustmentRef
          ? {
              type: "alert",
              tone: "info",
              title: "สร้างใบปรับปรุงแล้ว",
              message: `${r.adjustmentRef} — สต๊อกจะเปลี่ยนก็ต่อเมื่อบันทึกใบปรับปรุงนั้นแล้ว`,
            }
          : {
              type: "alert",
              tone: "warn",
              title: "ยังไม่ได้สร้างใบปรับปรุง",
              message:
                "Cycle Count ไม่เปลี่ยนยอดสต๊อกโดยตรง — ต้องสร้างใบปรับปรุงและบันทึกในโมดูล Stock Adjustment",
            },
        {
          type: "table",
          title: `บรรทัดที่จะกลายเป็นใบปรับปรุง (${adjustableLines(r).length})`,
          rows: adjustableLines(r),
          empty: "ไม่มีส่วนต่างที่ต้องปรับปรุง",
          cols: [
            {
              key: "product",
              label: "Product",
              cell: (v) => (
                <span className="flex flex-col">
                  <span className="font-semibold">{v.line.name}</span>
                  <span className="text-cap text-ink-3">{v.line.code}</span>
                </span>
              ),
            },
            { key: "systemQty", label: "System Qty", align: "right", cell: (v) => fmt(v.line.systemQty) },
            {
              key: "counted",
              label: "Counted Qty",
              align: "right",
              cell: (v) => fmt(countedQty(v.line)!),
            },
            {
              key: "variance",
              label: "Variance",
              align: "right",
              cell: (v) => (
                <span className={v.variance > 0 ? "font-semibold text-info" : "font-semibold text-danger"}>
                  {v.variance > 0 ? "+" : ""}
                  {fmt(v.variance)}
                </span>
              ),
            },
            {
              key: "action",
              label: "Adjustment Action",
              cell: (v) => (
                <Badge tone={v.variance > 0 ? "success" : "danger"}>
                  {v.variance > 0 ? "Increase Quantity" : "Decrease Quantity"}
                </Badge>
              ),
            },
            { key: "lot", label: "Lot", muted: true, cell: (v) => v.line.lot || "—" },
            { key: "rootCause", label: "Root Cause", muted: true, cell: (v) => v.line.rootCause || "ยังไม่ระบุ" },
            { key: "value", label: "Value", align: "right", muted: true, cell: (v) => money(v.value) },
          ],
        },
        {
          type: "docs",
          title: "Linked adjustment",
          empty: "ยังไม่มีใบปรับปรุงที่เชื่อมกับแผนนี้",
          items: r.adjustmentRef
            ? [
                {
                  name: r.adjustmentRef,
                  meta: `Stock Adjustment · ${r.adjustmentStatus} · จาก ${r.code}`,
                  onClick: () => ctx.openEntity("stock-adjustment", r.adjustmentRef),
                },
              ]
            : [],
        },
      ],
    },

    {
      key: "exceptions",
      label: "Exceptions",
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Count Exceptions",
          rows: r.exceptions ?? [],
          empty: "ไม่มีปัญหาที่บันทึกไว้",
          cols: [
            { key: "code", label: "Exception", cell: (e) => <span className="font-semibold">{e.code}</span> },
            { key: "type", label: "Type", cell: (e) => e.type },
            {
              key: "severity",
              label: "Severity",
              cell: (e) => <Badge tone={tone(PRIORITY_TONE, e.severity)}>{e.severity}</Badge>,
            },
            { key: "product", label: "Product", muted: true, cell: (e) => e.product || "—" },
            { key: "location", label: "Location", muted: true, cell: (e) => e.location || "—" },
            { key: "expected", label: "Expected", align: "right", muted: true, cell: (e) => fmt(e.expected) },
            { key: "actual", label: "Actual", align: "right", muted: true, cell: (e) => fmt(e.actual) },
            { key: "description", label: "Description", muted: true, cell: (e) => e.description },
            { key: "responsible", label: "Responsible", muted: true, cell: (e) => e.responsible },
            { key: "resolution", label: "Resolution", muted: true, cell: (e) => e.resolution || "—" },
            {
              key: "status",
              label: "Status",
              cell: (e) => <Badge tone={e.status === "Closed" ? "success" : "warning"}>{e.status}</Badge>,
            },
          ],
        },
        {
          type: "table",
          title: `Movement During Count (${movementWarnings(r).length})`,
          rows: movementWarnings(r),
          empty: "ไม่มีการเคลื่อนไหวของสต๊อกหลังเวลา Snapshot",
          cols: [
            { key: "when", label: "Movement Date", muted: true, cell: (m) => m.when },
            { key: "type", label: "Movement Type", cell: (m) => m.type },
            { key: "doc", label: "Document", cell: (m) => <span className="font-medium">{m.doc}</span> },
            { key: "product", label: "Product", muted: true, cell: (m) => m.product },
            { key: "qty", label: "Quantity", align: "right", cell: (m) => fmt(m.qty) },
            { key: "user", label: "User", muted: true, cell: (m) => m.user },
            { key: "decision", label: "Decision", cell: (m) => <Badge tone="warning">{m.decision}</Badge> },
          ],
        },
        {
          type: "note",
          title: "Inventory freeze",
          text: "เฟส 1 ไม่ล็อกธุรกรรมจริง — ระบบแจ้งเตือนความเคลื่อนไหวหลัง Snapshot และให้ผู้ใช้ตัดสินใจ โดยบันทึกการตัดสินใจไว้ในไทม์ไลน์",
        },
      ],
    },

    {
      key: "serial",
      label: "Lot / Serial",
      when: (r) => r.lotCount > 0 || r.serialCount > 0,
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Lot Count",
          rows: r.lines.filter((l) => l.lot),
          empty: "ไม่มีรายการที่ควบคุมด้วย Lot",
          cols: [
            { key: "code", label: "Product", muted: true, cell: (l) => l.name },
            { key: "lot", label: "Lot Number", cell: (l) => <span className="font-semibold">{l.lot}</span> },
            { key: "mfg", label: "Manufacturing", muted: true, cell: (l) => l.mfg || "—" },
            { key: "exp", label: "Expiry", muted: true, cell: (l) => l.exp || "—" },
            { key: "systemQty", label: "System Lot Qty", align: "right", cell: (l) => fmt(l.systemQty) },
            {
              key: "counted",
              label: "Counted Lot Qty",
              align: "right",
              cell: (l) => (countedQty(l) === null ? "—" : fmt(countedQty(l)!)),
            },
            { key: "variance", label: "Variance", align: "right", cell: varianceCell },
            {
              key: "location",
              label: "Location",
              muted: true,
              cell: (l) => [l.zone, l.rack, l.bin].filter(Boolean).join("-"),
            },
            { key: "status", label: "Lot Status", muted: true, cell: (l) => l.stockStatus },
          ],
        },
        {
          type: "table",
          title: "Serial Verification",
          rows: r.lines.flatMap((l) =>
            (l.serials ?? []).map((s) => ({ ...s, line: l.line, product: l.name, code: l.code, loc: `${l.zone}-${l.rack}-${l.bin}`, status: l.stockStatus })),
          ),
          empty: "ไม่มีรายการที่ควบคุมด้วย Serial",
          cols: [
            { key: "serial", label: "Serial Number", cell: (s) => <span className="font-semibold">{s.serial}</span> },
            { key: "product", label: "Product", muted: true, cell: (s) => s.product },
            { key: "loc", label: "Location", muted: true, cell: (s) => s.loc },
            { key: "expected", label: "Expected", cell: (s) => (s.expected ? "ใช่" : "ไม่คาดคิด") },
            { key: "scanned", label: "Scanned", cell: (s) => (s.scanned ? "สแกนแล้ว" : "ยังไม่พบ") },
            { key: "status", label: "System Status", muted: true, cell: (s) => s.status },
            {
              key: "result",
              label: "Match Result",
              cell: (s) => (
                <Badge tone={SERIAL_RESULT_TONE[s.result] ?? "neutral"}>{s.result}</Badge>
              ),
            },
          ],
        },
        {
          type: "note",
          title: "Serial rule",
          text: "จำนวน Serial ที่สแกนต้องเท่ากับจำนวนที่นับได้ · ห้ามสแกนซ้ำ · Serial ที่ไม่คาดคิดต้องเปิดรายการปัญหา ไม่เพิ่มเข้าระบบเงียบ ๆ",
        },
      ],
    },

    {
      key: "accuracy",
      label: "Accuracy Summary",
      blocks: (r): Block[] => [
        {
          type: "cards",
          title: "Accuracy",
          cols: 4,
          items: [
            { label: "Line Accuracy", value: `${r.acc.lineAccuracy}%`, tone: "accent" },
            { label: "Quantity Accuracy", value: `${r.acc.qtyAccuracy}%` },
            { label: "Location Accuracy", value: `${r.acc.locationAccuracy}%` },
            { label: "Lot Accuracy", value: `${r.acc.lotAccuracy}%` },
            { label: "Serial Accuracy", value: `${r.acc.serialAccuracy}%` },
            { label: "First Count Accuracy", value: `${r.acc.firstCountAccuracy}%` },
            { label: "Recount Rate", value: `${r.acc.recountRate}%` },
            { label: "Value Accuracy", value: "—", sub: "Placeholder" },
          ],
        },
        {
          type: "table",
          title: "Accuracy by Location",
          rows: [...new Set(r.lines.map((l) => `${l.zone}-${l.rack}-${l.bin}`))].map((loc) => {
            const lines = r.lines.filter(
              (l) => `${l.zone}-${l.rack}-${l.bin}` === loc && isCounted(l),
            );
            const match = lines.filter((l) => varianceQty(l) === 0).length;
            return {
              loc,
              counted: lines.length,
              match,
              accuracy: lines.length ? Math.round((match / lines.length) * 1000) / 10 : 0,
              variance: lines.reduce((t, l) => t + varianceQty(l), 0),
            };
          }),
          empty: "ยังไม่มีผลนับ",
          cols: [
            { key: "loc", label: "Location", cell: (x) => <span className="font-semibold">{x.loc}</span> },
            { key: "counted", label: "Counted", align: "right", cell: (x) => fmt(x.counted) },
            { key: "match", label: "Matching", align: "right", cell: (x) => fmt(x.match) },
            {
              key: "variance",
              label: "Net Variance",
              align: "right",
              cell: (x) => `${x.variance >= 0 ? "+" : ""}${fmt(x.variance)}`,
            },
            { key: "accuracy", label: "Accuracy", align: "right", cell: (x) => `${x.accuracy}%` },
          ],
        },
        {
          type: "fields",
          title: "Formulas",
          cols: 1,
          items: [
            { label: "Line Accuracy", value: "Matching Lines / Counted Lines × 100" },
            { label: "Quantity Accuracy", value: "1 − |Σ Variance| / Σ System Qty (ยอดระบบเป็น 0 ถือว่าแม่นยำเมื่อไม่มีส่วนต่าง)" },
            { label: "Variance %", value: "Variance Qty / System Qty × 100 (ยอดระบบเป็น 0 จัดเป็น Unexpected Stock)" },
          ],
        },
      ],
    },

    {
      key: "docs",
      label: "Document Relationship",
      blocks: (r, ctx): Block[] => [
        {
          type: "docs",
          title: "Count chain",
          empty: "ยังไม่มีเอกสารเกี่ยวข้อง",
          items: [
            { name: r.code, meta: `Count Plan · ${r.status} · ${r.createdBy} · ${r.countDate}` },
            { name: "Inventory Snapshot", meta: `${r.snapshotAt} · ${fmt(r.acc.totalLines)} บรรทัด` },
            ...(r.submittedAt
              ? [{ name: "Count Entry", meta: `ส่งผลนับ ${r.submittedAt} · ${r.counter}` }]
              : []),
            ...(r.acc.varianceLines
              ? [{ name: "Variance Review", meta: `${r.acc.varianceLines} บรรทัด · ${r.supervisor}` }]
              : []),
            ...(r.round > 1 ? [{ name: `Recount รอบที่ ${r.round}`, meta: r.recountReason }] : []),
            ...(r.approvedBy
              ? [{ name: "Approval", meta: `${r.approvedBy} · ${r.approvedAt}` }]
              : []),
            ...(r.adjustmentRef
              ? [
                  {
                    name: r.adjustmentRef,
                    meta: "Stock Adjustment ที่สร้างจากผลนับนี้",
                    onClick: () => ctx.openEntity("stock-adjustment", r.adjustmentRef),
                  },
                ]
              : []),
          ],
        },
        {
          type: "entity",
          title: "Related records",
          items: [
            ...[...new Set(r.lines.map((l) => l.code))].map((code) => {
              const l = r.lines.find((x) => x.code === code)!;
              return {
                name: l.name,
                sub: `${code} · ระบบ ${fmt(l.systemQty)} ${l.unit}`,
                onClick: () => ctx.openEntity("product", code),
              };
            }),
            {
              name: r.whLabel,
              sub: `คลังสินค้า · ${r.scopeLabel}`,
              onClick: () => ctx.openEntity("warehouse", r.warehouse),
            },
            {
              name: "Stock Inquiry",
              sub: "ดูยอดคงเหลือปัจจุบัน",
              onClick: () => ctx.goto("/m/stock-inquiry"),
            },
          ],
        },
      ],
    },

    {
      key: "timeline",
      label: "Timeline",
      blocks: (r): Block[] => [
        {
          type: "timeline",
          title: "Count Timeline",
          items: (r.history ?? []).map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },

    {
      key: "audit",
      label: "Audit Log",
      blocks: (r): Block[] => [{ type: "audit", title: "Audit Log", items: r.audit ?? [] }],
    },
  ],

  actions: (rec, ctx) => [
    { label: "มอบหมายผู้ตรวจนับ", icon: "user", disabled: !rec.canAssign, run: () => cntAssign(rec, ctx) },
    { label: "ยืนยันแผน", icon: "calendar", disabled: rec.status !== "Draft", run: () => cntPlan(rec, ctx) },
    { label: "เริ่มตรวจนับ", icon: "play", disabled: !rec.canStart, run: () => cntStart(rec, ctx) },
    { label: "หยุดชั่วคราว", icon: "clock", disabled: !rec.canPause, run: () => cntPause(rec, ctx) },
    { sep: true },
    { label: "บันทึกผลนับ", icon: "edit", disabled: !rec.canEnterCounts, run: () => cntEnter(rec, ctx) },
    {
      label: "ระบุว่าไม่พบสินค้า",
      icon: "xCircle",
      disabled: !rec.canEnterCounts,
      run: () => cntMarkEmpty(rec, ctx),
    },
    { label: "ส่งผลนับ", icon: "send", disabled: !rec.canSubmit, run: () => cntSubmit(rec, ctx) },
    { sep: true },
    {
      label: "ระบุสาเหตุส่วนต่าง",
      icon: "file",
      disabled: rec.acc.varianceLines === 0,
      run: () => cntSetRootCause(rec, ctx),
    },
    {
      label: "ยอมรับส่วนต่าง",
      icon: "check",
      disabled: !rec.canReview && rec.status !== "Variance Review",
      run: () => cntAcceptVariance(rec, ctx),
    },
    {
      label: "ขอให้นับซ้ำ",
      icon: "refresh",
      disabled: !rec.canRecount,
      run: () => cntRequestRecount(rec, ctx),
    },
    { sep: true },
    {
      label: "อนุมัติ",
      icon: "checkCircle",
      disabled: !rec.canApprove,
      disabledReason: "ต้องปิดบรรทัดที่ต้องนับซ้ำก่อน",
      run: () => cntApprove(rec, ctx),
    },
    {
      label: "ไม่อนุมัติ",
      icon: "xCircle",
      danger: true,
      disabled: !rec.canReject,
      run: () => cntReject(rec, ctx),
    },
    {
      label: "ขอให้แก้ไข",
      icon: "edit",
      disabled: !rec.canReject,
      run: () => cntRequestRevision(rec, ctx),
    },
    {
      label: "สร้างใบปรับปรุงสต๊อก",
      icon: "sliders",
      disabled: !rec.canCreateAdjustment,
      run: () => cntCreateAdjustment(rec, ctx),
    },
    { sep: true },
    {
      label: "การเคลื่อนไหวระหว่างนับ",
      icon: "alert",
      disabled: rec.movementWarnings === 0,
      run: () => cntMovementDecision(rec, ctx),
    },
    { label: "บันทึกปัญหา", icon: "alert", disabled: rec.status === "Draft", run: () => cntException(rec, ctx) },
    {
      label: "ปิดปัญหา",
      icon: "check",
      disabled: rec.openExceptions === 0,
      run: () => cntCloseException(rec, ctx),
    },
    { sep: true },
    { label: "พิมพ์ใบนับ", icon: "printer", run: () => cntPrint(rec, ctx) },
    {
      label: "เปิดการนับใหม่",
      icon: "refresh",
      disabled: !rec.canReopen,
      run: () => cntReopen(rec, ctx),
    },
    {
      label: "ยกเลิกแผน",
      icon: "circleSlash",
      danger: true,
      disabled: !rec.canCancel,
      run: () => cntCancel(rec, ctx),
    },
  ],
};

export const cycleCountSchemas: EntitySchemas<CntRow> = { list, detail };
