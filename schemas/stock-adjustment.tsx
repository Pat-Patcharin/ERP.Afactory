import {
  ADJ_STATUSES,
  ADJ_STOCK_STATUSES,
  ADJ_TYPES,
  REASON_CODES,
  findReason,
} from "@/data/adjustments";
import { PRIORITY_TONE, tone } from "@/lib/badges";
import { fmt, money, money0 } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  ADJ_ACTION_TONE,
  ADJ_DIRECTION_TONE,
  ADJ_TONE,
  adjustmentRows,
  adjustmentSummary,
  eligibleQty,
  isDecrease,
  isIncrease,
  isStatusChange,
  lineMovementTypes,
  lineValue,
  stockImpact,
  type AdjRow,
} from "@/lib/domain/adjustment";
import { movementRows } from "@/lib/domain/movement";
import {
  adjAddEvidence,
  adjApprove,
  adjAssign,
  adjBulk,
  adjCancel,
  adjCloseException,
  adjException,
  adjPost,
  adjReject,
  adjRequestRevision,
  adjReverse,
  adjSubmit,
} from "@/lib/workflows-adjustment";
import { Badge } from "@/components/ui";

/* ============================================================
   STOCK ADJUSTMENT — controlled corrections.

   The reason code drives the controls: whether approval is needed,
   whether evidence is mandatory, and which stock statuses the line
   may move between. Posting is the only step that commits, and it
   is gated on all three. A posted document is corrected by
   reversal, never by an edit.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

/** Signed quantity, coloured the way the ledger reads it. */
const netCell = (r: AdjRow) =>
  r.netQty > 0 ? (
    <span className="font-semibold text-success">+{fmt(r.netQty)}</span>
  ) : r.netQty < 0 ? (
    <span className="font-semibold text-danger">{fmt(r.netQty)}</span>
  ) : r.statusQty > 0 ? (
    <span className="font-semibold text-warning">±{fmt(r.statusQty)}</span>
  ) : (
    <span className="text-ink-3">—</span>
  );

/* ---------- List ---------- */

const list: ListSchema<AdjRow> = {
  key: "stock-adjustment",
  entity: "Stock Adjustment",
  entityPlural: "adjustments",
  title: "Stock Adjustment",
  subtitle:
    "Create controlled inventory corrections with complete reason, approval, and movement traceability.",
  crumb: "Stock Adjustment",
  crumbParent: "Inventory",
  primaryLabel: "สร้างใบปรับปรุง",
  searchPlaceholder:
    "ค้นหา เลขที่ใบปรับปรุง / สินค้า / คลัง / ตำแหน่ง / Lot / Serial / เหตุผล / เอกสารอ้างอิง / ผู้ร้องขอ",
  emptyTitle: "ไม่พบใบปรับปรุงที่ตรงกับเงื่อนไข",

  source: adjustmentRows,

  searchFields: [
    "code",
    "reason",
    "type",
    "refDoc",
    "refType",
    "warehouse",
    "whLabel",
    "location",
    "requestedBy",
    "approvedBy",
    "postedBy",
    "description",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "draft", label: "ร่าง", test: (r) => r.status === "Draft" },
    { key: "pending", label: "รออนุมัติ", test: (r) => r.status === "Pending Approval" },
    { key: "approved", label: "อนุมัติแล้ว", test: (r) => r.status === "Approved" },
    { key: "ready", label: "พร้อมบันทึก", test: (r) => r.status === "Ready to Post" },
    { key: "posted", label: "บันทึกแล้ว", test: (r) => r.status === "Posted" },
    { key: "positive", label: "ปรับเพิ่ม", test: (r) => r.qtyIn > 0 },
    { key: "negative", label: "ปรับลด", test: (r) => r.qtyOut > 0 },
    { key: "status", label: "เปลี่ยนสถานะ", test: (r) => r.statusQty > 0 },
    { key: "cancelled", label: "ยกเลิก", test: (r) => r.status === "Cancelled" },
    {
      key: "reversed",
      label: "กลับรายการ",
      test: (r) => r.status === "Reversed" || Boolean(r.reversalOf),
    },
  ],

  filters: [
    {
      id: "status",
      label: "Adjustment Status",
      options: () => [...ADJ_STATUSES],
      test: (r, v) => r.status === v,
    },
    {
      id: "type",
      label: "Adjustment Type",
      options: () => [...ADJ_TYPES],
      test: (r, v) => r.type === v,
    },
    {
      id: "reason",
      label: "Adjustment Reason",
      options: () => uniq(REASON_CODES.map((x) => x.code)),
      test: (r, v) => r.reason === v,
    },
    {
      id: "date",
      label: "Adjustment Date",
      options: () => uniq(adjustmentRows().map((r) => r.adjDate)),
      test: (r, v) => r.adjDate === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => uniq(adjustmentRows().map((r) => r.whLabel)),
      test: (r, v) => r.whLabel === v,
    },
    {
      id: "zone",
      label: "Zone",
      options: () => uniq(adjustmentRows().map((r) => r.zone)),
      test: (r, v) => r.zone === v,
    },
    {
      id: "rack",
      label: "Rack",
      options: () => uniq(adjustmentRows().map((r) => r.rack)),
      test: (r, v) => r.rack === v,
    },
    {
      id: "bin",
      label: "Bin",
      options: () => uniq(adjustmentRows().map((r) => r.bin)),
      test: (r, v) => r.bin === v,
    },
    {
      id: "product",
      label: "Product",
      options: () => uniq(adjustmentRows().flatMap((r) => r.items.map((l) => l.code))),
      test: (r, v) => r.items.some((l) => l.code === v),
    },
    {
      id: "cat",
      label: "Category",
      options: () => uniq(adjustmentRows().flatMap((r) => r.items.map((l) => l.cat))),
      test: (r, v) => r.items.some((l) => l.cat === v),
    },
    {
      id: "lot",
      label: "Lot",
      options: () => uniq(adjustmentRows().flatMap((r) => r.items.map((l) => l.lot))),
      test: (r, v) => r.items.some((l) => l.lot === v || l.lotTo === v),
    },
    {
      id: "serial",
      label: "Serial",
      options: () =>
        uniq(
          adjustmentRows().flatMap((r) => r.items.flatMap((l) => [...l.serials, ...l.serialsTo])),
        ).slice(0, 60),
      test: (r, v) => r.items.some((l) => l.serials.includes(v) || l.serialsTo.includes(v)),
    },
    {
      id: "statusFrom",
      label: "Stock Status From",
      options: () => [...ADJ_STOCK_STATUSES],
      test: (r, v) => r.items.some((l) => l.statusFrom === v),
    },
    {
      id: "statusTo",
      label: "Stock Status To",
      options: () => [...ADJ_STOCK_STATUSES],
      test: (r, v) => r.items.some((l) => l.statusTo === v),
    },
    { id: "positive", label: "Positive Only", options: yesNo, test: (r) => r.qtyIn > 0 },
    { id: "negative", label: "Negative Only", options: yesNo, test: (r) => r.qtyOut > 0 },
    {
      id: "value",
      label: "Has Value Impact",
      options: yesNo,
      test: (r) => r.valueImpact !== 0,
    },
    {
      id: "cycleCount",
      label: "Cycle Count Related",
      options: yesNo,
      test: (r) => r.refType === "Cycle Count" || r.reason.startsWith("Cycle Count"),
    },
    {
      id: "returnRelated",
      label: "Return Related",
      options: yesNo,
      test: (r) => r.refType === "Sales Return" || r.reason.startsWith("Return"),
    },
    {
      id: "mine",
      label: "My Adjustments",
      options: () => uniq(adjustmentRows().map((r) => r.requestedBy)),
      test: (r, v) => r.requestedBy === v || r.reviewer === v,
    },
    {
      id: "myWarehouse",
      label: "My Warehouse",
      options: () => uniq(adjustmentRows().map((r) => r.warehouse)),
      test: (r, v) => r.warehouse === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "Adjustment Number",
      sortable: true,
      locked: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold">{r.code}</span>
          {r.reversalOf && (
            <span className="text-cap text-danger">Reversal of {r.reversalOf}</span>
          )}
        </span>
      ),
    },
    { key: "adjDate", label: "Adjustment Date", sortable: true, cell: (r) => r.adjDate },
    {
      key: "type",
      label: "Adjustment Type",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.type}</span>
          <Badge tone={ADJ_DIRECTION_TONE[r.direction] ?? "neutral"}>{r.direction}</Badge>
        </span>
      ),
    },
    { key: "reason", label: "Reason", sortable: true, cell: (r) => r.reason },
    {
      key: "warehouse",
      label: "Warehouse",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.warehouse}</span>
          <span className="text-cap text-ink-3">{r.location}</span>
        </span>
      ),
    },
    { key: "location", label: "Location", muted: true, defaultHidden: true, cell: (r) => r.location },
    { key: "itemCount", label: "Items", align: "right", muted: true, cell: (r) => fmt(r.itemCount) },
    {
      key: "qtyIn",
      label: "Quantity In",
      align: "right",
      sortable: true,
      cell: (r) => (r.qtyIn ? <span className="font-semibold text-success">{fmt(r.qtyIn)}</span> : "—"),
    },
    {
      key: "qtyOut",
      label: "Quantity Out",
      align: "right",
      sortable: true,
      cell: (r) => (r.qtyOut ? <span className="font-semibold text-danger">{fmt(r.qtyOut)}</span> : "—"),
    },
    { key: "netQty", label: "Net", align: "right", sortable: true, cell: netCell },
    {
      key: "statusQty",
      label: "Status Changes",
      align: "right",
      muted: true,
      cell: (r) => (r.statusQty ? fmt(r.statusQty) : "—"),
    },
    {
      key: "valueImpact",
      label: "Value Impact",
      align: "right",
      sortable: true,
      muted: true,
      defaultHidden: true,
      cell: (r) => money(r.valueImpact),
    },
    {
      key: "approvalStatus",
      label: "Approval Status",
      defaultHidden: true,
      cell: (r) => <Badge tone={ADJ_TONE[r.approvalStatus] ?? "neutral"}>{r.approvalStatus}</Badge>,
    },
    {
      key: "status",
      label: "Adjustment Status",
      sortable: true,
      cell: (r) => <Badge tone={ADJ_TONE[r.status] ?? "neutral"}>{r.status}</Badge>,
    },
    {
      key: "refDoc",
      label: "Reference Document",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.refDoc || "—",
    },
    {
      key: "priority",
      label: "Priority",
      defaultHidden: true,
      cell: (r) => <Badge tone={tone(PRIORITY_TONE, r.priority)}>{r.priority}</Badge>,
    },
    { key: "requestedBy", label: "Requested By", muted: true, cell: (r) => r.requestedBy },
    {
      key: "postedBy",
      label: "Posted By",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.postedBy || "—",
    },
    { key: "updated", label: "Updated At", sortable: true, muted: true, cell: (r) => r.updated },
  ],

  secondaryActions: (ctx) => [
    {
      label: "ปรับเพิ่ม",
      icon: "plus",
      run: () => ctx.goto("/m/stock-adjustment/new?kind=positive"),
    },
    {
      label: "ปรับลด",
      icon: "minus",
      run: () => ctx.goto("/m/stock-adjustment/new?kind=negative"),
    },
    {
      label: "เปลี่ยนสถานะ",
      icon: "sort",
      run: () => ctx.goto("/m/stock-adjustment/new?kind=status"),
    },
    {
      label: "Export",
      icon: "upload",
      run: () =>
        ctx.toast("ส่งออกข้อมูล", `เตรียมไฟล์ ${fmt(adjustmentRows().length)} ใบ — Future support`, "info"),
    },
  ],

  hero: (ctx) => {
    const s = adjustmentSummary();
    return {
      kpis: [
        { icon: "sliders", label: "Total Adjustments", value: fmt(s.total), goTab: "all" },
        { icon: "file", label: "Draft", value: fmt(s.draft), goTab: "draft" },
        {
          icon: "clock",
          label: "Pending Approval",
          value: fmt(s.pendingApproval),
          tone: "warn",
          goTab: "pending",
        },
        { icon: "checkCircle", label: "Approved", value: fmt(s.approved), goTab: "approved" },
        { icon: "check", label: "Posted Today", value: fmt(s.postedToday), tone: "ok", goTab: "posted" },
        { icon: "arrowUp", label: "Positive Adjustments", value: fmt(s.positive), tone: "ok", goTab: "positive" },
        { icon: "arrowDown", label: "Negative Adjustments", value: fmt(s.negative), tone: "warn", goTab: "negative" },
        { icon: "layers", label: "Status Adjustments", value: fmt(s.statusChange), goTab: "status" },
        { icon: "refresh", label: "Reversed", value: fmt(s.reversed), tone: "warn", goTab: "reversed" },
        {
          icon: "pricing",
          label: "Total Value Impact",
          value: money0(s.valueImpact),
          sub: "Operational preview",
          tone: "primary",
          run: () =>
            ctx.toast(
              "Value Impact Preview",
              "ตัวเลขมูลค่าเป็นค่าประมาณ ระบบบัญชีจริงจะทำในเฟส Finance",
              "info",
            ),
        },
      ],
    };
  },

  rowActions: (rec, ctx) => [
    { label: "เปิดรายละเอียด", icon: "eye", run: () => ctx.goto(`/m/stock-adjustment/${rec.code}`) },
    {
      label: "แก้ไข",
      icon: "edit",
      disabled: !rec.isEditable && !rec.isLimitedEdit,
      disabledReason: "แก้ไขได้เฉพาะสถานะ Draft, Rejected, Revision Requested และ Pending Approval",
      run: () => ctx.goto(`/m/stock-adjustment/${rec.code}/edit`),
    },
    { sep: true },
    { label: "ส่งขออนุมัติ", icon: "send", disabled: !rec.canSubmit, run: () => adjSubmit(rec, ctx) },
    { label: "อนุมัติ", icon: "checkCircle", disabled: !rec.canApprove, run: () => adjApprove(rec, ctx) },
    {
      label: "ไม่อนุมัติ",
      icon: "xCircle",
      danger: true,
      disabled: !rec.canReject,
      run: () => adjReject(rec, ctx),
    },
    { sep: true },
    {
      label: "บันทึกเข้าสต๊อก",
      icon: "play",
      disabled: !rec.canPost,
      disabledReason: "ต้องอนุมัติและแนบหลักฐานให้ครบก่อนบันทึก",
      run: () => adjPost(rec, ctx),
    },
    { label: "แนบหลักฐาน", icon: "upload", disabled: rec.isReadOnly, run: () => adjAddEvidence(rec, ctx) },
    { sep: true },
    {
      label: "ยกเลิก",
      icon: "circleSlash",
      danger: true,
      disabled: !rec.canCancel,
      run: () => adjCancel(rec, ctx),
    },
    {
      label: "กลับรายการ",
      icon: "refresh",
      danger: true,
      disabled: !rec.canReverse,
      disabledReason: "กลับรายการได้เฉพาะใบที่บันทึกแล้วและยังไม่ถูกกลับรายการ",
      run: () => adjReverse(rec, ctx),
    },
  ],

  bulkActions: adjBulk,
};

/* ---------- Detail ---------- */

const detail: DetailSchema<AdjRow> = {
  key: "stock-adjustment",
  entityLabel: "Stock Adjustment",

  identity: (r) => ({
    code: r.code,
    title: `${r.type} · ${r.reason}`,
    copyFields: [
      { label: "Adjustment Number", value: r.code },
      ...(r.refDoc ? [{ label: "Reference", value: r.refDoc }] : []),
    ],
    badges: [
      { text: r.status, tone: ADJ_TONE[r.status] ?? "neutral" },
      { text: r.direction, tone: ADJ_DIRECTION_TONE[r.direction] ?? "neutral" },
      ...(r.openExceptions ? [{ text: `${r.openExceptions} exception`, tone: "danger" as const }] : []),
      ...(r.reversalOf ? [{ text: "Reversal", tone: "danger" as const }] : []),
    ],
    tags: [r.whLabel, r.location, r.priority, r.refType],
  }),

  kpis: (r) => [
    { icon: "arrowDown", label: "Quantity In", value: fmt(r.qtyIn), goTab: "items" },
    { icon: "arrowUp", label: "Quantity Out", value: fmt(r.qtyOut), goTab: "items" },
    {
      icon: "trend",
      label: "Net Impact",
      value: `${r.netQty >= 0 ? "+" : ""}${fmt(r.netQty)}`,
      goTab: "impact",
    },
    { icon: "layers", label: "Status Qty", value: fmt(r.statusQty), goTab: "impact" },
    { icon: "pricing", label: "Value Impact", value: money(r.valueImpact), sub: "Preview" },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => [
        r.status === "Reversed" && {
          type: "alert",
          tone: "danger",
          title: "ใบปรับปรุงนี้ถูกกลับรายการแล้ว",
          message: `กลับรายการด้วย ${r.reversedBy} — เอกสารที่บันทึกแล้วจะไม่ถูกแก้ไข`,
        },
        Boolean(r.reversalOf) && {
          type: "alert",
          tone: "warn",
          title: "เอกสารกลับรายการ",
          message: `กลับรายการของ ${r.reversalOf}${r.reversalReason ? ` — ${r.reversalReason}` : ""}`,
        },
        Boolean(r.cancelReason) && {
          type: "alert",
          tone: "warn",
          title: "ยกเลิกแล้ว",
          message: r.cancelReason,
        },
        Boolean(r.rejectReason) && {
          type: "alert",
          tone: "danger",
          title: r.status === "Rejected" ? "ไม่อนุมัติ" : "ขอให้แก้ไข",
          message: r.rejectReason,
        },
        r.negativeRisk && {
          type: "alert",
          tone: "danger",
          title: "ผลลัพธ์ทำให้สต๊อกติดลบ",
          message: "ตรวจสอบจำนวนหรือขออนุมัติสิทธิ์สต๊อกติดลบก่อนบันทึก",
        },
        r.needsEvidence && !r.evidenceComplete && {
          type: "alert",
          tone: "warn",
          title: "ยังไม่มีหลักฐาน",
          message: `เหตุผล "${r.reason}" ต้องแนบหลักฐานก่อนบันทึกเข้าสต๊อก`,
        },
        {
          type: "fields",
          title: "Adjustment Information",
          cols: 2,
          items: [
            { label: "Adjustment Number", value: r.code },
            { label: "Adjustment Date", value: r.adjDate },
            { label: "Adjustment Type", value: r.type },
            { label: "Adjustment Reason", value: `${r.reason} (${r.reasonGroup})` },
            { label: "Priority", value: r.priority },
            { label: "Status", value: r.status },
            { label: "Requested By", value: r.requestedBy },
            { label: "Assigned Reviewer", value: r.reviewer || "—" },
            { label: "Reference Document", value: r.refDoc ? `${r.refType} · ${r.refDoc}` : r.refType },
            { label: "Description", value: r.description, span: true },
          ],
        },
        {
          type: "fields",
          title: "Warehouse Information",
          cols: 2,
          items: [
            { label: "Warehouse", value: r.whLabel },
            { label: "Branch", value: r.branch },
            { label: "Zone / Rack / Shelf / Bin", value: r.location },
            { label: "Current Location Status", value: r.items[0]?.statusFrom ?? "—" },
            { label: "Warehouse Manager", value: "Patcharin T.", muted: true },
          ],
        },
        {
          type: "cards",
          title: "Quantity Summary",
          cols: 4,
          items: [
            { label: "Total Items", value: fmt(r.itemCount) },
            { label: "Total Qty In", value: fmt(r.qtyIn), tone: r.qtyIn ? "accent" : undefined },
            { label: "Total Qty Out", value: fmt(r.qtyOut), tone: r.qtyOut ? "warn" : undefined },
            { label: "Net Qty Change", value: `${r.netQty >= 0 ? "+" : ""}${fmt(r.netQty)}` },
            { label: "Status Change Qty", value: fmt(r.statusQty) },
            { label: "Serial Count", value: fmt(r.serialCount) },
            { label: "Lot Count", value: fmt(r.lotCount) },
            { label: "Value Impact", value: money(r.valueImpact), tone: "accent" },
          ],
        },
        {
          type: "flags",
          title: "Control Information",
          cols: 2,
          items: [
            { label: `Approval required — ${r.approvalStatus}`, value: r.needsApproval },
            { label: `Evidence required — ${(r.evidence ?? []).length} แนบแล้ว`, value: r.needsEvidence },
            { label: "Evidence complete", value: r.evidenceComplete },
            { label: "Negative inventory risk", value: r.negativeRisk },
            { label: "Restricted stock release", value: r.restrictedRelease },
            { label: `Posted — ${r.postedBy || "ยังไม่บันทึก"}`, value: r.status === "Posted" },
          ],
        },
      ],
      aside: (r) => ({
        rows: [
          { icon: "warehouse", label: "Warehouse", value: r.whLabel },
          { icon: "mapPin", label: "Location", value: r.location, muted: true },
          { icon: "file", label: "Reason", value: r.reason },
          { icon: "arrowDown", label: "Qty In", value: fmt(r.qtyIn) },
          { icon: "arrowUp", label: "Qty Out", value: fmt(r.qtyOut) },
          { icon: "pricing", label: "Value", value: money(r.valueImpact), muted: true },
          { icon: "user", label: "Requested By", value: r.requestedBy, muted: true },
          { icon: "clock", label: "Posted", value: r.postedDate || "—", muted: true },
        ],
      }),
    },

    {
      key: "items",
      label: "Adjustment Items",
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Adjustment Item Grid",
          rows: r.items,
          empty: "ยังไม่มีรายการ",
          cols: [
            { key: "line", label: "#", align: "right", muted: true, cell: (l) => l.line },
            {
              key: "code",
              label: "Product",
              cell: (l) => (
                <span className="flex flex-col">
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-cap text-ink-3">
                    {l.code} · {l.cat}
                  </span>
                </span>
              ),
            },
            { key: "location", label: "Location", muted: true, cell: (l) => l.locFrom || r.location },
            {
              key: "action",
              label: "Adjustment Action",
              cell: (l) => (
                <Badge tone={ADJ_ACTION_TONE[l.action] ?? "neutral"}>{l.action}</Badge>
              ),
            },
            {
              key: "onHand",
              label: "On Hand",
              align: "right",
              muted: true,
              cell: (l) => fmt(eligibleQty(l.code, r.warehouse, "Available")),
            },
            {
              key: "eligible",
              label: "Eligible Qty",
              align: "right",
              muted: true,
              cell: (l) => fmt(eligibleQty(l.code, r.warehouse, l.statusFrom)),
            },
            {
              key: "qty",
              label: "Quantity",
              align: "right",
              cell: (l) => (
                <span
                  className={
                    isIncrease(l)
                      ? "font-semibold text-success"
                      : isDecrease(l)
                        ? "font-semibold text-danger"
                        : "font-semibold"
                  }
                >
                  {isIncrease(l) ? "+" : isDecrease(l) ? "−" : "±"}
                  {fmt(l.qty)}
                </span>
              ),
            },
            { key: "unit", label: "UOM", muted: true, cell: (l) => l.unit },
            { key: "statusFrom", label: "Status From", muted: true, cell: (l) => l.statusFrom },
            {
              key: "statusTo",
              label: "Status To",
              muted: true,
              cell: (l) => (isStatusChange(l) ? l.statusTo : "—"),
            },
            { key: "locFrom", label: "Location From", muted: true, cell: (l) => l.locFrom || "—" },
            { key: "locTo", label: "Location To", muted: true, cell: (l) => l.locTo || "—" },
            {
              key: "lot",
              label: "Lot",
              muted: true,
              cell: (l) => (l.lotTo ? `${l.lot} → ${l.lotTo}` : l.lot || "—"),
            },
            {
              key: "exp",
              label: "Expiry",
              muted: true,
              cell: (l) => (l.expTo ? `${l.exp} → ${l.expTo}` : l.exp || "—"),
            },
            {
              key: "serials",
              label: "Serial",
              muted: true,
              cell: (l) =>
                l.serialsTo.length
                  ? `${l.serials.join(", ")} → ${l.serialsTo.join(", ")}`
                  : l.serials.length
                    ? l.serials.join(", ")
                    : "—",
            },
            { key: "unitCost", label: "Unit Cost", align: "right", muted: true, cell: (l) => money(l.unitCost) },
            {
              key: "value",
              label: "Value Impact",
              align: "right",
              muted: true,
              cell: (l) => money(lineValue(l)),
            },
            { key: "reason", label: "Reason", muted: true, cell: (l) => l.reason || r.reason },
            { key: "note", label: "Notes", muted: true, cell: (l) => l.note || "—" },
          ],
        },
        {
          type: "note",
          title: "Adjustment rules",
          text: "ปรับเพิ่ม/ลดเปลี่ยนยอด On Hand · เปลี่ยนสถานะไม่เปลี่ยน On Hand แต่ย้ายจำนวนระหว่างสถานะ · การแก้ไขตำแหน่ง Lot หรือ Serial สร้างคู่รายการออก/เข้าโดยไม่ทับข้อมูลเดิม",
        },
      ],
    },

    {
      key: "impact",
      label: "Stock Impact",
      blocks: (r): Block[] => {
        const impact = stockImpact(r);
        return [
          {
            type: "cards",
            title: "Document Impact",
            cols: 4,
            items: [
              { label: "Total Qty In", value: fmt(r.qtyIn), tone: "accent" },
              { label: "Total Qty Out", value: fmt(r.qtyOut), tone: "warn" },
              { label: "Net Qty", value: `${r.netQty >= 0 ? "+" : ""}${fmt(r.netQty)}` },
              { label: "Status Change Qty", value: fmt(r.statusQty) },
            ],
          },
          {
            type: "table",
            title: "Stock Impact Preview",
            rows: impact,
            empty: "ยังไม่มีรายการให้คำนวณ",
            cols: [
              {
                key: "product",
                label: "Product",
                cell: (x) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{x.name}</span>
                    <span className="text-cap text-ink-3">{x.product}</span>
                  </span>
                ),
              },
              {
                key: "onHand",
                label: "On Hand",
                align: "right",
                cell: (x) => `${fmt(x.onHandBefore)} → ${fmt(x.onHandAfter)}`,
              },
              {
                key: "available",
                label: "Available",
                align: "right",
                cell: (x) => `${fmt(x.availableBefore)} → ${fmt(x.availableAfter)}`,
              },
              {
                key: "reserved",
                label: "Reserved",
                align: "right",
                muted: true,
                cell: (x) => `${fmt(x.reservedBefore)} → ${fmt(x.reservedAfter)}`,
              },
              {
                key: "qc",
                label: "QC Hold",
                align: "right",
                muted: true,
                cell: (x) => `${fmt(x.qcBefore)} → ${fmt(x.qcAfter)}`,
              },
              {
                key: "ret",
                label: "Return Hold",
                align: "right",
                muted: true,
                cell: (x) => `${fmt(x.returnBefore)} → ${fmt(x.returnAfter)}`,
              },
              {
                key: "dmg",
                label: "Damaged",
                align: "right",
                muted: true,
                cell: (x) => `${fmt(x.damagedBefore)} → ${fmt(x.damagedAfter)}`,
              },
              {
                key: "blk",
                label: "Blocked",
                align: "right",
                muted: true,
                cell: (x) => `${fmt(x.blockedBefore)} → ${fmt(x.blockedAfter)}`,
              },
              {
                key: "value",
                label: "Value",
                align: "right",
                muted: true,
                cell: (x) => `${money0(x.valueBefore)} → ${money0(x.valueAfter)}`,
              },
              {
                key: "flags",
                label: "Highlights",
                cell: (x) => (
                  <span className="flex flex-wrap gap-1">
                    {x.goesNegative && <Badge tone="danger">ติดลบ</Badge>}
                    {x.releasesRestricted && <Badge tone="warning">ปล่อยสต๊อกที่กันไว้</Badge>}
                    {x.highValue && <Badge tone="warning">มูลค่าสูง</Badge>}
                    {!x.goesNegative && !x.releasesRestricted && !x.highValue && (
                      <span className="text-ink-3">—</span>
                    )}
                  </span>
                ),
              },
            ],
          },
          {
            type: "note",
            title: "Status rule",
            text: "การเปลี่ยนสถานะสต๊อกไม่เปลี่ยนยอด On Hand รวม — ย้ายจำนวนจากสถานะหนึ่งไปอีกสถานะเท่านั้น",
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
            { label: "Assigned Reviewer", value: r.reviewer || "—" },
            { label: "Approved By", value: r.approvedBy || "—" },
            { label: "Approved Date", value: r.approvedDate || "—" },
            { label: "Reject / Revision Reason", value: r.rejectReason || "—", span: true },
          ],
        },
        r.approvalReasons.length > 0
          ? {
              type: "flags",
              title: "เหตุที่ต้องขออนุมัติ",
              items: r.approvalReasons.map((f) => ({ label: f, value: true })),
            }
          : {
              type: "alert",
              tone: "success",
              title: "ไม่ต้องขออนุมัติ",
              message: "ใบปรับปรุงนี้อยู่ในเกณฑ์ที่บันทึกได้ทันที",
            },
        {
          type: "timeline",
          title: "Approval flow",
          items: [
            { title: "Draft", detail: `สร้างโดย ${r.createdBy}`, when: r.created, kind: "" },
            {
              title: "Warehouse Supervisor",
              detail: findReason(r.reason, r.reasonGroup)?.roles.join(", ") ?? "",
              kind: "info",
            },
            {
              title: "Inventory Manager",
              detail: r.approvedBy ? `อนุมัติโดย ${r.approvedBy}` : "รอการอนุมัติ",
              when: r.approvedDate,
              kind: r.approvedBy ? "primary" : "",
            },
            {
              title: "Finance Review",
              detail:
                Math.abs(r.valueImpact) >= 20_000
                  ? "มูลค่าสูง ต้องผ่านฝ่ายการเงิน"
                  : "ไม่เข้าเกณฑ์มูลค่าสูง",
              kind: Math.abs(r.valueImpact) >= 20_000 ? "warn" : "",
            },
          ],
        },
      ],
    },

    {
      key: "evidence",
      label: "Evidence",
      blocks: (r, ctx): Block[] => [
        r.needsEvidence
          ? {
              type: "alert",
              tone: r.evidenceComplete ? "success" : "warn",
              title: r.evidenceComplete ? "หลักฐานครบถ้วน" : "ต้องแนบหลักฐาน",
              message: `เหตุผล "${r.reason}" กำหนดให้ต้องมีหลักฐานประกอบ`,
            }
          : {
              type: "alert",
              tone: "info",
              title: "ไม่บังคับหลักฐาน",
              message: "แนบเพิ่มได้เพื่อการตรวจสอบย้อนหลัง",
            },
        {
          type: "docs",
          title: `หลักฐานที่แนบ (${(r.evidence ?? []).length})`,
          empty: "ยังไม่มีหลักฐานแนบ",
          items: (r.evidence ?? []).map((e) => ({
            name: e.name,
            meta: `${e.type} · ${e.size} · ${e.by} · ${e.when}`,
            onClick: () => ctx.toast("เปิดไฟล์", `${e.name} — Future support`, "info"),
          })),
        },
        {
          type: "flags",
          title: "Evidence checklist",
          cols: 2,
          items: [
            { label: "หลักฐานที่ต้องมีตามเหตุผล", value: r.evidenceComplete },
            { label: "มีรูปถ่ายประกอบ", value: (r.evidence ?? []).some((e) => e.type.includes("Photo")) },
            { label: "มีเอกสารอนุมัติ", value: (r.evidence ?? []).some((e) => e.type === "Approval Document") },
            { label: "มีใบนับสต๊อก", value: (r.evidence ?? []).some((e) => e.type === "Count Sheet") },
          ],
        },
      ],
    },

    {
      key: "exceptions",
      label: "Exceptions",
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Adjustment Exceptions",
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
      ],
    },

    {
      key: "movement",
      label: "Stock Movement",
      blocks: (r, ctx): Block[] => {
        const moves = movementRows().filter((m) => m.sourceDoc === r.code);
        return [
          {
            type: "table",
            title: `Stock Card movements (${moves.length})`,
            rows: moves,
            empty: "ยังไม่มีรายการใน Stock Card — จะสร้างขึ้นเมื่อบันทึกเข้าสต๊อก",
            cols: [
              {
                key: "code",
                label: "Movement",
                cell: (m) => (
                  <button
                    onClick={() => ctx.goto(`/m/stock-card/${m.code}`)}
                    className="text-left font-semibold hover:text-primary"
                  >
                    {m.code}
                  </button>
                ),
              },
              { key: "when", label: "Date", muted: true, cell: (m) => m.when },
              { key: "type", label: "Movement Type", cell: (m) => m.type },
              { key: "product", label: "Product", muted: true, cell: (m) => m.product },
              {
                key: "qty",
                label: "Qty",
                align: "right",
                cell: (m) => (
                  <Badge tone={m.qtyIn ? "success" : m.qtyOut ? "danger" : "warning"}>
                    {m.qtyIn ? `+${fmt(m.qtyIn)}` : m.qtyOut ? `−${fmt(m.qtyOut)}` : "±0"}
                  </Badge>
                ),
              },
              {
                key: "status",
                label: "Status",
                muted: true,
                cell: (m) => `${m.statusBefore} → ${m.statusAfter}`,
              },
              { key: "fromLoc", label: "From", muted: true, cell: (m) => m.fromLoc || "—" },
              { key: "toLoc", label: "To", muted: true, cell: (m) => m.toLoc || "—" },
              { key: "lot", label: "Lot", muted: true, cell: (m) => m.lot || "—" },
              { key: "serial", label: "Serial", muted: true, cell: (m) => m.serial || "—" },
              {
                key: "balanceAfter",
                label: "Balance After",
                align: "right",
                cell: (m) => fmt(m.balanceAfter),
              },
              { key: "user", label: "User", muted: true, cell: (m) => m.user },
            ],
          },
          {
            type: "note",
            title: "Movements this document will create",
            text: r.items
              .flatMap((l) => lineMovementTypes(l, r.reason).map((t) => `บรรทัด ${l.line}: ${t}`))
              .join(" · ") || "ยังไม่มีรายการ",
          },
        ];
      },
    },

    {
      key: "docs",
      label: "Document Relationship",
      blocks: (r, ctx): Block[] => [
        {
          type: "docs",
          title: "Adjustment chain",
          empty: "ยังไม่มีเอกสารเกี่ยวข้อง",
          items: [
            ...(r.refDoc
              ? [
                  {
                    name: r.refDoc,
                    meta: `เอกสารต้นทาง · ${r.refType}`,
                    onClick: () => {
                      const map: Record<string, string> = {
                        "Sales Return": "sales-return",
                        "Return QC": "qc-inspection",
                      };
                      const entity = map[r.refType];
                      if (entity) ctx.openEntity(entity, r.refDoc);
                      else ctx.toast("ยังไม่มีโมดูลนี้", `${r.refType} จะเปิดใช้งานในเฟสถัดไป`, "info");
                    },
                  },
                ]
              : []),
            {
              name: r.code,
              meta: `Stock Adjustment · ${r.status} · ${r.reason} · ${r.requestedBy}`,
            },
            ...(r.approvedBy ? [{ name: "Approval", meta: `${r.approvedBy} · ${r.approvedDate}` }] : []),
            ...(r.postedBy
              ? [{ name: "Posted Stock Movement", meta: `${r.postedBy} · ${r.postedDate}` }]
              : []),
            ...(r.reversalOf
              ? [
                  {
                    name: r.reversalOf,
                    meta: "เอกสารต้นฉบับที่ถูกกลับรายการ",
                    onClick: () => ctx.goto(`/m/stock-adjustment/${r.reversalOf}`),
                  },
                ]
              : []),
            ...(r.reversedBy
              ? [
                  {
                    name: r.reversedBy,
                    meta: "เอกสารกลับรายการของใบนี้",
                    onClick: () => ctx.goto(`/m/stock-adjustment/${r.reversedBy}`),
                  },
                ]
              : []),
          ],
        },
        {
          type: "entity",
          title: "Related records",
          items: [
            ...r.items.map((l) => ({
              name: l.name,
              sub: `${l.code} · ${fmt(l.qty)} ${l.unit}`,
              onClick: () => ctx.openEntity("product", l.code),
            })),
            {
              name: r.whLabel,
              sub: `คลังสินค้า · ${r.location}`,
              onClick: () => ctx.openEntity("warehouse", r.warehouse),
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
          title: "Adjustment Timeline",
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
    { label: "ส่งขออนุมัติ", icon: "send", disabled: !rec.canSubmit, run: () => adjSubmit(rec, ctx) },
    { label: "อนุมัติ", icon: "checkCircle", disabled: !rec.canApprove, run: () => adjApprove(rec, ctx) },
    {
      label: "ไม่อนุมัติ",
      icon: "xCircle",
      danger: true,
      disabled: !rec.canReject,
      run: () => adjReject(rec, ctx),
    },
    {
      label: "ขอให้แก้ไข",
      icon: "edit",
      disabled: !rec.canReject,
      run: () => adjRequestRevision(rec, ctx),
    },
    { label: "มอบหมายผู้ตรวจสอบ", icon: "user", disabled: rec.isReadOnly, run: () => adjAssign(rec, ctx) },
    { sep: true },
    { label: "บันทึกเข้าสต๊อก", icon: "play", disabled: !rec.canPost, run: () => adjPost(rec, ctx) },
    { label: "แนบหลักฐาน", icon: "upload", disabled: rec.isReadOnly, run: () => adjAddEvidence(rec, ctx) },
    { sep: true },
    { label: "บันทึกปัญหา", icon: "alert", disabled: rec.status === "Draft", run: () => adjException(rec, ctx) },
    {
      label: "ปิดปัญหา",
      icon: "check",
      disabled: rec.openExceptions === 0,
      run: () => adjCloseException(rec, ctx),
    },
    { sep: true },
    {
      label: "ยกเลิก",
      icon: "circleSlash",
      danger: true,
      disabled: !rec.canCancel,
      run: () => adjCancel(rec, ctx),
    },
    {
      label: "กลับรายการ",
      icon: "refresh",
      danger: true,
      disabled: !rec.canReverse,
      run: () => adjReverse(rec, ctx),
    },
    {
      label: "พิมพ์",
      icon: "printer",
      run: () => ctx.toast("สั่งพิมพ์", `${rec.code} — Future support`, "info"),
    },
  ],
};

export const stockAdjustmentSchemas: EntitySchemas<AdjRow> = { list, detail };
