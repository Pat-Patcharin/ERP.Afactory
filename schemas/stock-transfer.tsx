import {
  TRANSFER_METHODS,
  TRANSFER_STATUSES,
  TRANSFER_TYPES,
  TRF_PRIORITIES,
  TRF_STOCK_STATUSES,
} from "@/data/transfers";
import { PRIORITY_TONE, tone } from "@/lib/badges";
import { fmt } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  TRF_LINE_TONE,
  TRF_METHOD_TONE,
  TRF_TONE,
  destinationWarnings,
  lineRemainingDispatch,
  lineRemainingReceipt,
  lineStatus,
  transferRows,
  transferSummary,
  transferableQty,
  type TrfRow,
} from "@/lib/domain/transfer";
import { movementRows } from "@/lib/domain/movement";
import {
  trfApprove,
  trfAssign,
  trfBulk,
  trfCancel,
  trfCloseException,
  trfDispatch,
  trfException,
  trfMarkReady,
  trfPost,
  trfReceive,
  trfReject,
  trfRequestRevision,
  trfReverse,
  trfSubmit,
} from "@/lib/workflows-transfer";
import { Badge } from "@/components/ui";

/* ============================================================
   STOCK TRANSFER — moving stock without changing how much there is.

   The document decides where quantity sits; Stock Card records the
   movement it caused. Nothing on this screen edits a balance: every
   quantity change comes from dispatch, receipt or posting, and a
   posted transfer is corrected by reversal, never by an edit.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

/** Source → destination, the visual the whole module is organised around. */
const routeCell = (r: TrfRow) => (
  <span className="flex items-center gap-2">
    <span className="flex flex-col">
      <span className="font-medium">{r.srcWarehouse}</span>
      <span className="text-cap text-ink-3">{r.srcLocation}</span>
    </span>
    <span className="text-ink-3">→</span>
    <span className="flex flex-col">
      <span className="font-medium">{r.dstWarehouse}</span>
      <span className="text-cap text-ink-3">{r.dstLocation}</span>
    </span>
  </span>
);

const progressCell = (r: TrfRow) => (
  <span className="flex items-center gap-2">
    <span className="block h-[5px] w-16 overflow-hidden rounded-pill bg-line">
      <span
        className={
          r.progress >= 100
            ? "block h-full rounded-pill bg-success"
            : "block h-full rounded-pill bg-primary"
        }
        style={{ width: `${Math.min(100, r.progress)}%` }}
      />
    </span>
    <span className="tnum text-cap text-ink-2">{r.progress}%</span>
  </span>
);

/* ---------- List ---------- */

const list: ListSchema<TrfRow> = {
  key: "stock-transfer",
  entity: "Stock Transfer",
  entityPlural: "transfers",
  title: "Stock Transfer",
  subtitle:
    "Move inventory between warehouses, locations, bins, and stock statuses with complete traceability.",
  crumb: "Stock Transfer",
  crumbParent: "Inventory",
  primaryLabel: "สร้างใบโอนย้าย",
  searchPlaceholder:
    "ค้นหา เลขที่ใบโอนย้าย / สินค้า / บาร์โค้ด / คลัง / ตำแหน่ง / Lot / Serial / ผู้ร้องขอ / อ้างอิง",
  emptyTitle: "ไม่พบใบโอนย้ายที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: transferRows,

  searchFields: [
    "code",
    "reference",
    "srcWarehouse",
    "dstWarehouse",
    "srcLocation",
    "dstLocation",
    "requestedBy",
    "assignedTo",
    "type",
    "method",
    "reason",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "draft", label: "ร่าง", test: (r) => r.status === "Draft" },
    { key: "pending", label: "รออนุมัติ", test: (r) => r.status === "Pending Approval" },
    { key: "approved", label: "อนุมัติแล้ว", test: (r) => r.status === "Approved" },
    { key: "ready", label: "พร้อมโอน", test: (r) => r.status === "Ready to Transfer" },
    { key: "transit", label: "ระหว่างขนส่ง", test: (r) => r.inTransitQty > 0 },
    {
      key: "partial",
      label: "บางส่วน",
      test: (r) => r.status.startsWith("Partially"),
    },
    { key: "done", label: "เสร็จสิ้น", test: (r) => r.status === "Completed" },
    {
      key: "exception",
      label: "มีปัญหา",
      test: (r) => r.openExceptions > 0 || r.status === "Exception",
    },
    { key: "cancelled", label: "ยกเลิก", test: (r) => r.status === "Cancelled" },
  ],

  filters: [
    {
      id: "status",
      label: "Transfer Status",
      options: () => [...TRANSFER_STATUSES],
      test: (r, v) => r.status === v,
    },
    {
      id: "method",
      label: "Transfer Method",
      options: () => [...TRANSFER_METHODS],
      test: (r, v) => r.method === v,
    },
    {
      id: "type",
      label: "Transfer Type",
      options: () => [...TRANSFER_TYPES],
      test: (r, v) => r.type === v,
    },
    {
      id: "date",
      label: "Transfer Date",
      options: () => uniq(transferRows().map((r) => r.transferDate)),
      test: (r, v) => r.transferDate === v,
    },
    {
      id: "src",
      label: "Source Warehouse",
      options: () => uniq(transferRows().map((r) => r.srcWarehouse)),
      test: (r, v) => r.srcWarehouse === v,
    },
    {
      id: "dst",
      label: "Destination Warehouse",
      options: () => uniq(transferRows().map((r) => r.dstWarehouse)),
      test: (r, v) => r.dstWarehouse === v,
    },
    {
      id: "srcZone",
      label: "Source Zone",
      options: () => uniq(transferRows().map((r) => r.srcZone)),
      test: (r, v) => r.srcZone === v,
    },
    {
      id: "dstZone",
      label: "Destination Zone",
      options: () => uniq(transferRows().map((r) => r.dstZone)),
      test: (r, v) => r.dstZone === v,
    },
    {
      id: "product",
      label: "Product",
      options: () => uniq(transferRows().flatMap((r) => r.items.map((i) => i.code))),
      test: (r, v) => r.items.some((i) => i.code === v),
    },
    {
      id: "lot",
      label: "Lot",
      options: () => uniq(transferRows().flatMap((r) => r.items.map((i) => i.lot))),
      test: (r, v) => r.items.some((i) => i.lot === v),
    },
    {
      id: "serial",
      label: "Serial",
      options: () =>
        uniq(transferRows().flatMap((r) => r.items.flatMap((i) => i.serials))).slice(0, 60),
      test: (r, v) => r.items.some((i) => i.serials.includes(v)),
    },
    {
      id: "priority",
      label: "Priority",
      options: () => [...TRF_PRIORITIES],
      test: (r, v) => r.priority === v,
    },
    {
      id: "requestedBy",
      label: "Requested By",
      options: () => uniq(transferRows().map((r) => r.requestedBy)),
      test: (r, v) => r.requestedBy === v,
    },
    {
      id: "approvedBy",
      label: "Approved By",
      options: () => uniq(transferRows().map((r) => r.approvedBy)),
      test: (r, v) => r.approvedBy === v,
    },
    {
      id: "assignedTo",
      label: "Assigned To",
      options: () => uniq(transferRows().map((r) => r.assignedTo)),
      test: (r, v) => r.assignedTo === v,
    },
    {
      id: "srcStatus",
      label: "Source Stock Status",
      options: () => [...TRF_STOCK_STATUSES],
      test: (r, v) => r.srcStatus === v,
    },
    {
      id: "dstStatus",
      label: "Destination Stock Status",
      options: () => [...TRF_STOCK_STATUSES],
      test: (r, v) => r.dstStatus === v,
    },
    { id: "transit", label: "In Transit Only", options: yesNo, test: (r) => r.inTransitQty > 0 },
    {
      id: "exception",
      label: "Exception Only",
      options: yesNo,
      test: (r) => r.openExceptions > 0 || r.status === "Exception",
    },
    {
      id: "mine",
      label: "My Transfers",
      options: () => ["Admin", "Warin S.", "Nattapong K.", "Suda R.", "Somchai B."],
      test: (r, v) => r.requestedBy === v || r.assignedTo === v,
    },
    {
      id: "myWarehouse",
      label: "My Warehouse",
      options: () => uniq(transferRows().map((r) => r.srcWarehouse)),
      test: (r, v) => r.srcWarehouse === v || r.dstWarehouse === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "Transfer Number",
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
    { key: "transferDate", label: "Transfer Date", sortable: true, cell: (r) => r.transferDate },
    {
      key: "method",
      label: "Method",
      sortable: true,
      cell: (r) => <Badge tone={TRF_METHOD_TONE[r.method] ?? "neutral"}>{r.method}</Badge>,
    },
    { key: "type", label: "Transfer Type", sortable: true, muted: true, cell: (r) => r.type },
    { key: "route", label: "Source → Destination", cell: routeCell },
    {
      key: "srcWarehouse",
      label: "Source Warehouse",
      sortable: true,
      muted: true,
      defaultHidden: true,
      cell: (r) => r.srcLabel,
    },
    {
      key: "srcLocation",
      label: "Source Location",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.srcLocation,
    },
    {
      key: "dstWarehouse",
      label: "Destination Warehouse",
      sortable: true,
      muted: true,
      defaultHidden: true,
      cell: (r) => r.dstLabel,
    },
    {
      key: "dstLocation",
      label: "Destination Location",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.dstLocation,
    },
    { key: "itemCount", label: "Items", align: "right", muted: true, cell: (r) => fmt(r.itemCount) },
    {
      key: "requestedQty",
      label: "Requested Qty",
      align: "right",
      sortable: true,
      cell: (r) => fmt(r.requestedQty),
    },
    {
      key: "dispatchedQty",
      label: "Dispatched Qty",
      align: "right",
      muted: true,
      cell: (r) => fmt(r.dispatchedQty),
    },
    {
      key: "receivedQty",
      label: "Received Qty",
      align: "right",
      muted: true,
      cell: (r) => fmt(r.receivedQty),
    },
    {
      key: "inTransitQty",
      label: "In-Transit Qty",
      align: "right",
      sortable: true,
      cell: (r) =>
        r.inTransitQty ? <Badge tone="warning">{fmt(r.inTransitQty)}</Badge> : "—",
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      defaultHidden: true,
      cell: (r) => <Badge tone={tone(PRIORITY_TONE, r.priority)}>{r.priority}</Badge>,
    },
    {
      key: "approvalStatus",
      label: "Approval",
      defaultHidden: true,
      cell: (r) => <Badge tone={TRF_TONE[r.approvalStatus] ?? "neutral"}>{r.approvalStatus}</Badge>,
    },
    {
      key: "status",
      label: "Transfer Status",
      sortable: true,
      cell: (r) => <Badge tone={TRF_TONE[r.status] ?? "neutral"}>{r.status}</Badge>,
    },
    { key: "progress", label: "Progress", cell: progressCell },
    {
      key: "requestedBy",
      label: "Requested By",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.requestedBy,
    },
    { key: "updated", label: "Updated At", sortable: true, muted: true, cell: (r) => r.updated },
  ],

  secondaryActions: (ctx) => [
    {
      label: "โอนย้ายทันที",
      icon: "truck",
      run: () => ctx.goto("/m/stock-transfer/new?method=direct"),
    },
    {
      label: "รับเข้าใบโอนย้าย",
      icon: "goodsReceipt",
      run: () => {
        const open = transferRows().find((r) => r.canReceive);
        if (!open) {
          ctx.toast("ไม่มีใบรอรับเข้า", "ยังไม่มีใบโอนย้ายที่อยู่ระหว่างขนส่ง", "info");
          return;
        }
        ctx.goto(`/m/stock-transfer/${open.code}`);
      },
    },
    {
      label: "Export",
      icon: "upload",
      run: () =>
        ctx.toast("ส่งออกข้อมูล", `เตรียมไฟล์ ${fmt(transferRows().length)} ใบ — Future support`, "info"),
    },
  ],

  hero: () => {
    const s = transferSummary();
    return {
      kpis: [
        { icon: "truck", label: "Total Transfers", value: fmt(s.total), goTab: "all" },
        { icon: "file", label: "Draft", value: fmt(s.draft), goTab: "draft" },
        {
          icon: "clock",
          label: "Pending Approval",
          value: fmt(s.pendingApproval),
          tone: "warn",
          goTab: "pending",
        },
        { icon: "checkCircle", label: "Ready to Transfer", value: fmt(s.ready), goTab: "ready" },
        { icon: "sort", label: "In Transit", value: fmt(s.inTransit), tone: "warn", goTab: "transit" },
        {
          icon: "layers",
          label: "Partially Received",
          value: fmt(s.partiallyReceived),
          tone: "warn",
          goTab: "partial",
        },
        {
          icon: "check",
          label: "Completed Today",
          value: fmt(s.completedToday),
          tone: "ok",
          goTab: "done",
        },
        { icon: "alert", label: "Exceptions", value: fmt(s.exceptions), tone: "warn", goTab: "exception" },
        { icon: "xCircle", label: "Cancelled", value: fmt(s.cancelled), goTab: "cancelled" },
        { icon: "box", label: "Total Transfer Qty", value: fmt(s.totalQty), tone: "primary" },
      ],
    };
  },

  rowActions: (rec, ctx) => [
    { label: "เปิดรายละเอียด", icon: "eye", run: () => ctx.goto(`/m/stock-transfer/${rec.code}`) },
    {
      label: "แก้ไข",
      icon: "edit",
      disabled: !rec.isEditable,
      disabledReason: "แก้ไขได้เฉพาะสถานะ Draft, Rejected และ Revision Requested",
      run: () => ctx.goto(`/m/stock-transfer/${rec.code}/edit`),
    },
    { sep: true },
    {
      label: "ส่งขออนุมัติ",
      icon: "send",
      disabled: !rec.canSubmit,
      run: () => trfSubmit(rec, ctx),
    },
    { label: "อนุมัติ", icon: "checkCircle", disabled: !rec.canApprove, run: () => trfApprove(rec, ctx) },
    {
      label: "ไม่อนุมัติ",
      icon: "xCircle",
      danger: true,
      disabled: !rec.canReject,
      run: () => trfReject(rec, ctx),
    },
    { sep: true },
    { label: "โอนย้ายทันที", icon: "play", disabled: !rec.canPost, run: () => trfPost(rec, ctx) },
    { label: "จ่ายออก", icon: "truck", disabled: !rec.canDispatch, run: () => trfDispatch(rec, ctx) },
    {
      label: "รับเข้า",
      icon: "goodsReceipt",
      disabled: !rec.canReceive,
      run: () => trfReceive(rec, ctx),
    },
    { sep: true },
    {
      label: "ยกเลิก",
      icon: "circleSlash",
      danger: true,
      disabled: !rec.canCancel,
      disabledReason: "ใบที่จ่ายออกแล้วต้องรับเข้าหรือกลับรายการแทนการยกเลิก",
      run: () => trfCancel(rec, ctx),
    },
    {
      label: "กลับรายการ",
      icon: "refresh",
      danger: true,
      disabled: !rec.canReverse,
      run: () => trfReverse(rec, ctx),
    },
  ],

  bulkActions: trfBulk,
};

/* ---------- Detail ---------- */

const detail: DetailSchema<TrfRow> = {
  key: "stock-transfer",
  entityLabel: "Stock Transfer",

  identity: (r) => ({
    code: r.code,
    title: `${r.srcLabel} → ${r.dstLabel}`,
    copyFields: [
      { label: "Transfer Number", value: r.code },
      ...(r.reference ? [{ label: "Reference", value: r.reference }] : []),
    ],
    badges: [
      { text: r.status, tone: TRF_TONE[r.status] ?? "neutral" },
      { text: r.method, tone: TRF_METHOD_TONE[r.method] ?? "neutral" },
      ...(r.openExceptions ? [{ text: `${r.openExceptions} exception`, tone: "danger" as const }] : []),
      ...(r.reversalOf ? [{ text: "Reversal", tone: "danger" as const }] : []),
    ],
    tags: [r.type, r.srcLocation, r.dstLocation, r.priority],
  }),

  kpis: (r) => [
    { icon: "box", label: "Requested", value: fmt(r.requestedQty), goTab: "items" },
    { icon: "truck", label: "Dispatched", value: fmt(r.dispatchedQty), goTab: "dispatch" },
    { icon: "goodsReceipt", label: "Received", value: fmt(r.receivedQty), goTab: "receipt" },
    { icon: "sort", label: "In Transit", value: fmt(r.inTransitQty), goTab: "dispatch" },
    { icon: "trend", label: "Progress", value: `${r.progress}%` },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => {
        const warnings = destinationWarnings(r);
        return [
          r.status === "Reversed" && {
            type: "alert",
            tone: "danger",
            title: "ใบโอนย้ายนี้ถูกกลับรายการแล้ว",
            message: `กลับรายการด้วย ${r.reversedBy} — เอกสารที่ผ่านการบันทึกแล้วจะไม่ถูกแก้ไข`,
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
          warnings.length > 0 && {
            type: "alert",
            tone: "warn",
            title: "ข้อควรระวังปลายทาง",
            message: warnings.join(" · "),
          },
          {
            type: "fields",
            title: "Transfer Information",
            cols: 2,
            items: [
              { label: "Transfer Number", value: r.code },
              { label: "Transfer Date", value: r.transferDate },
              { label: "Transfer Method", value: r.method },
              { label: "Transfer Type", value: r.type },
              { label: "Priority", value: r.priority },
              { label: "Status", value: r.status },
              { label: "Requested By", value: r.requestedBy },
              { label: "Assigned To", value: r.assignedTo || "—" },
              { label: "Expected Completion", value: r.expectedDate },
              { label: "Reference", value: r.reference || "—" },
              { label: "Reason", value: r.reason, span: true },
            ],
          },
          {
            type: "fields",
            title: "Source Information",
            cols: 2,
            items: [
              { label: "Source Warehouse", value: r.srcLabel },
              { label: "Source Branch", value: r.srcBranch },
              { label: "Zone / Rack / Shelf / Bin", value: r.srcLocation },
              { label: "Source Stock Status", value: r.srcStatus },
              {
                label: "Available at Source",
                value: fmt(
                  r.items.reduce(
                    (t, i) => t + transferableQty(i.code, r.srcWarehouse, r.srcStatus),
                    0,
                  ),
                ),
              },
            ],
          },
          {
            type: "fields",
            title: "Destination Information",
            cols: 2,
            items: [
              { label: "Destination Warehouse", value: r.dstLabel },
              { label: "Destination Branch", value: r.dstBranch },
              { label: "Zone / Rack / Shelf / Bin", value: r.dstLocation },
              { label: "Destination Stock Status", value: r.dstStatus },
              { label: "Capacity", value: "—", muted: true },
            ],
          },
          {
            type: "cards",
            title: "Transfer Summary",
            cols: 4,
            items: [
              { label: "Total Items", value: fmt(r.itemCount) },
              { label: "Requested Qty", value: fmt(r.requestedQty), tone: "accent" },
              { label: "Dispatched Qty", value: fmt(r.dispatchedQty) },
              { label: "Received Qty", value: fmt(r.receivedQty) },
              { label: "In-Transit Qty", value: fmt(r.inTransitQty), tone: r.inTransitQty ? "warn" : undefined },
              { label: "Short Qty", value: fmt(r.shortQty), tone: r.shortQty ? "warn" : undefined },
              { label: "Damaged Qty", value: fmt(r.damagedQty), tone: r.damagedQty ? "warn" : undefined },
              { label: "Progress", value: `${r.progress}%`, tone: "accent" },
            ],
          },
        ];
      },
      aside: (r) => ({
        rows: [
          { icon: "warehouse", label: "Source", value: r.srcLabel },
          { icon: "mapPin", label: "Source Bin", value: r.srcLocation, muted: true },
          { icon: "arrowDown", label: "Status", value: `${r.srcStatus} → ${r.dstStatus}`, muted: true },
          { icon: "warehouse", label: "Destination", value: r.dstLabel },
          { icon: "mapPin", label: "Destination Bin", value: r.dstLocation, muted: true },
          { icon: "box", label: "Requested", value: fmt(r.requestedQty) },
          { icon: "truck", label: "In Transit", value: fmt(r.inTransitQty), muted: true },
        ],
      }),
    },

    {
      key: "items",
      label: "Transfer Items",
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Transfer Item Grid",
          rows: r.items,
          empty: "ยังไม่มีรายการสินค้า",
          cols: [
            { key: "line", label: "#", align: "right", muted: true, cell: (l) => l.line },
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
            { key: "srcLoc", label: "Source Location", muted: true, cell: () => r.srcLocation },
            { key: "srcStatus", label: "Source Status", muted: true, cell: () => r.srcStatus },
            {
              key: "transferable",
              label: "Transferable Qty",
              align: "right",
              muted: true,
              cell: (l) => fmt(transferableQty(l.code, r.srcWarehouse, r.srcStatus)),
            },
            {
              key: "requested",
              label: "Requested",
              align: "right",
              cell: (l) => <span className="font-semibold">{fmt(l.requested)}</span>,
            },
            { key: "dispatched", label: "Dispatched", align: "right", cell: (l) => fmt(l.dispatched) },
            { key: "received", label: "Received", align: "right", cell: (l) => fmt(l.received) },
            {
              key: "remainDispatch",
              label: "Remaining Dispatch",
              align: "right",
              muted: true,
              cell: (l) => fmt(lineRemainingDispatch(l)),
            },
            {
              key: "remainReceipt",
              label: "Remaining Receipt",
              align: "right",
              muted: true,
              cell: (l) => fmt(lineRemainingReceipt(l)),
            },
            { key: "unit", label: "UOM", muted: true, cell: (l) => l.unit },
            { key: "lot", label: "Lot", muted: true, cell: (l) => l.lot || "—" },
            { key: "exp", label: "Expiry", muted: true, cell: (l) => l.exp || "—" },
            {
              key: "serials",
              label: "Serials",
              align: "right",
              muted: true,
              cell: (l) => (l.serials.length ? fmt(l.serials.length) : "—"),
            },
            { key: "dstLoc", label: "Destination", muted: true, cell: (l) => l.dstBin || r.dstLocation },
            {
              key: "dstStatus",
              label: "Destination Status",
              muted: true,
              cell: (l) => l.dstStatus || r.dstStatus,
            },
            {
              key: "status",
              label: "Item Status",
              cell: (l) => (
                <Badge tone={TRF_LINE_TONE[lineStatus(l)] ?? "neutral"}>{lineStatus(l)}</Badge>
              ),
            },
            { key: "note", label: "Notes", muted: true, cell: (l) => l.note || "—" },
          ],
        },
        {
          type: "note",
          title: "Formulas",
          text: "Transferable Qty = On Hand − Reserved − QC Hold − Return Hold − Damaged − Blocked − Expired · Remaining Dispatch = Requested − Dispatched · Remaining Receipt = Dispatched − Received − Short − Damaged",
        },
      ],
    },

    {
      key: "lotserial",
      label: "Lot / Serial",
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Lot",
          rows: r.items.filter((l) => l.lot),
          empty: "ไม่มีรายการที่ควบคุมด้วย Lot",
          cols: [
            { key: "lot", label: "Lot Number", cell: (l) => <span className="font-semibold">{l.lot}</span> },
            { key: "name", label: "Product", muted: true, cell: (l) => l.name },
            { key: "requested", label: "Transfer Qty", align: "right", cell: (l) => fmt(l.requested) },
            { key: "exp", label: "Expiry Date", muted: true, cell: (l) => l.exp || "—" },
            { key: "src", label: "Warehouse", muted: true, cell: () => r.srcLabel },
            { key: "loc", label: "Location", muted: true, cell: () => r.srcLocation },
            {
              key: "status",
              label: "Status",
              cell: (l) => <Badge tone={TRF_LINE_TONE[lineStatus(l)] ?? "neutral"}>{lineStatus(l)}</Badge>,
            },
          ],
        },
        {
          type: "table",
          title: "Serial",
          rows: r.items.flatMap((l) =>
            l.serials.map((s) => ({ serial: s, line: l.line, name: l.name, code: l.code })),
          ),
          empty: "ไม่มีรายการที่ควบคุมด้วย Serial",
          cols: [
            {
              key: "serial",
              label: "Serial Number",
              cell: (s) => <span className="font-semibold">{s.serial}</span>,
            },
            { key: "name", label: "Product", muted: true, cell: (s) => s.name },
            { key: "wh", label: "Current Warehouse", muted: true, cell: () => r.srcWarehouse },
            { key: "loc", label: "Current Location", muted: true, cell: () => r.srcLocation },
            { key: "status", label: "Current Status", muted: true, cell: () => r.srcStatus },
            { key: "line", label: "Line", align: "right", muted: true, cell: (s) => s.line },
          ],
        },
        {
          type: "note",
          title: "Serial rule",
          text: "จำนวน Serial ที่เลือกต้องเท่ากับจำนวนที่โอนย้าย และห้ามซ้ำกับใบโอนย้ายที่ยังเปิดอยู่.",
        },
      ],
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
            { label: "Approved By", value: r.approvedBy || "—" },
            { label: "Approved Date", value: r.approvedDate || "—" },
            { label: "Requested By", value: r.requestedBy },
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
              message: "ใบโอนย้ายนี้อยู่ในเกณฑ์ที่ดำเนินการได้ทันที",
            },
        {
          type: "timeline",
          title: "Approval flow",
          items: [
            { title: "Draft", detail: `สร้างโดย ${r.createdBy}`, when: r.created, kind: "" },
            {
              title: "Warehouse Supervisor",
              detail: r.approvalStatus === "Not Required" ? "ไม่ต้องผ่านขั้นนี้" : "ตรวจสอบความถูกต้อง",
              kind: "info",
            },
            {
              title: "Inventory Manager",
              detail: r.approvedBy ? `อนุมัติโดย ${r.approvedBy}` : "รอการอนุมัติ",
              when: r.approvedDate,
              kind: r.approvedBy ? "primary" : "",
            },
          ],
        },
      ],
    },

    {
      key: "dispatch",
      label: "Dispatch",
      when: (r) => r.isTwoStep,
      blocks: (r): Block[] => [
        {
          type: "cards",
          title: "In-Transit Inventory",
          cols: 4,
          items: [
            { label: "Dispatched", value: fmt(r.dispatchedQty) },
            { label: "Received", value: fmt(r.receivedQty) },
            { label: "In Transit", value: fmt(r.inTransitQty), tone: r.inTransitQty ? "warn" : undefined },
            { label: "Remaining Dispatch", value: fmt(r.remainingDispatch) },
          ],
        },
        {
          type: "table",
          title: "Dispatch Records",
          rows: r.dispatches ?? [],
          empty: "ยังไม่มีการจ่ายออก",
          cols: [
            { key: "code", label: "Dispatch Number", cell: (d) => <span className="font-semibold">{d.code}</span> },
            { key: "date", label: "Dispatch Date", muted: true, cell: (d) => d.date },
            { key: "by", label: "Dispatched By", muted: true, cell: (d) => d.by },
            { key: "qty", label: "Total Qty", align: "right", cell: (d) => fmt(d.qty) },
            { key: "packages", label: "Packages", align: "right", muted: true, cell: (d) => fmt(d.packages) },
            { key: "vehicle", label: "Vehicle", muted: true, cell: (d) => d.vehicle || "—" },
            { key: "driver", label: "Driver", muted: true, cell: (d) => d.driver || "—" },
            { key: "seal", label: "Seal", muted: true, cell: (d) => d.seal || "—" },
          ],
        },
      ],
    },

    {
      key: "receipt",
      label: "Receipt",
      when: (r) => r.isTwoStep,
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Receipt Records",
          rows: r.receipts ?? [],
          empty: "ยังไม่มีการรับเข้า",
          cols: [
            { key: "code", label: "Receipt Number", cell: (v) => <span className="font-semibold">{v.code}</span> },
            { key: "dispatchRef", label: "Dispatch", muted: true, cell: (v) => v.dispatchRef || "—" },
            { key: "date", label: "Receipt Date", muted: true, cell: (v) => v.date },
            { key: "by", label: "Received By", muted: true, cell: (v) => v.by },
            { key: "qty", label: "Received Qty", align: "right", cell: (v) => fmt(v.qty) },
            {
              key: "short",
              label: "Short Qty",
              align: "right",
              cell: (v) => (v.short ? <Badge tone="warning">{fmt(v.short)}</Badge> : "—"),
            },
            {
              key: "damaged",
              label: "Damaged Qty",
              align: "right",
              cell: (v) => (v.damaged ? <Badge tone="danger">{fmt(v.damaged)}</Badge> : "—"),
            },
            { key: "condition", label: "Package Condition", muted: true, cell: (v) => v.condition },
            { key: "seal", label: "Seal Status", muted: true, cell: (v) => v.seal },
            { key: "reference", label: "Delivery Reference", muted: true, cell: (v) => v.reference || "—" },
          ],
        },
        {
          type: "cards",
          title: "Receipt Summary",
          cols: 4,
          items: [
            { label: "Received", value: fmt(r.receivedQty), tone: "accent" },
            { label: "Short", value: fmt(r.shortQty), tone: r.shortQty ? "warn" : undefined },
            { label: "Damaged", value: fmt(r.damagedQty), tone: r.damagedQty ? "warn" : undefined },
            { label: "Remaining Receipt", value: fmt(r.remainingReceipt) },
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
          title: "Transfer Exceptions",
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
            { key: "expected", label: "Expected", align: "right", muted: true, cell: (e) => fmt(e.expected) },
            { key: "actual", label: "Actual", align: "right", muted: true, cell: (e) => fmt(e.actual) },
            {
              key: "variance",
              label: "Variance",
              align: "right",
              cell: (e) => <Badge tone="danger">{fmt(e.actual - e.expected)}</Badge>,
            },
            { key: "description", label: "Description", muted: true, cell: (e) => e.description },
            { key: "responsible", label: "Responsible", muted: true, cell: (e) => e.responsible },
            { key: "resolution", label: "Resolution", muted: true, cell: (e) => e.resolution || "—" },
            { key: "followUp", label: "Follow-Up", muted: true, cell: (e) => e.followUp || "—" },
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
            empty:
              "ยังไม่มีรายการใน Stock Card — จะสร้างขึ้นเมื่อโอนย้าย จ่ายออก หรือรับเข้า",
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
                  <Badge tone={m.qtyIn ? "success" : m.qtyOut ? "info" : "warning"}>
                    {m.qtyIn ? `+${fmt(m.qtyIn)}` : m.qtyOut ? `−${fmt(m.qtyOut)}` : "±0"}
                  </Badge>
                ),
              },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (m) => m.warehouse },
              { key: "fromLoc", label: "From", muted: true, cell: (m) => m.fromLoc || "—" },
              { key: "toLoc", label: "To", muted: true, cell: (m) => m.toLoc || "—" },
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
            title: "Movement rule",
            text: "โอนย้ายทันทีสร้างคู่ Transfer Out / Transfer In ที่หักล้างกัน · โอนย้ายสองขั้นตอนสร้าง Transfer Out ตอนจ่ายออกและ Transfer In ตอนรับเข้า · การเปลี่ยนสถานะสต๊อกสร้างรายการเดียวโดยยอด On Hand ไม่เปลี่ยน.",
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
          title: "Transfer chain",
          empty: "ยังไม่มีเอกสารเกี่ยวข้อง",
          items: [
            {
              name: r.code,
              meta: `Stock Transfer Request · ${r.status} · ${fmt(r.requestedQty)} หน่วย · ${r.requestedBy}`,
            },
            ...(r.approvedBy
              ? [{ name: "Approval", meta: `${r.approvedBy} · ${r.approvedDate}` }]
              : []),
            ...(r.dispatches ?? []).map((d) => ({
              name: d.code,
              meta: `Transfer Dispatch · ${d.date} · ${fmt(d.qty)} หน่วย · ${d.by}`,
            })),
            ...(r.inTransitQty
              ? [{ name: "In Transit", meta: `${fmt(r.inTransitQty)} หน่วยอยู่ระหว่างขนส่ง` }]
              : []),
            ...(r.receipts ?? []).map((v) => ({
              name: v.code,
              meta: `Transfer Receipt · ${v.date} · ${fmt(v.qty)} หน่วย · ${v.by}`,
            })),
            ...(r.reversalOf
              ? [
                  {
                    name: r.reversalOf,
                    meta: "เอกสารต้นฉบับที่ถูกกลับรายการ",
                    onClick: () => ctx.goto(`/m/stock-transfer/${r.reversalOf}`),
                  },
                ]
              : []),
            ...(r.reversedBy
              ? [
                  {
                    name: r.reversedBy,
                    meta: "เอกสารกลับรายการของใบนี้",
                    onClick: () => ctx.goto(`/m/stock-transfer/${r.reversedBy}`),
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
              sub: `${l.code} · ${fmt(l.requested)} ${l.unit}`,
              onClick: () => ctx.openEntity("product", l.code),
            })),
            {
              name: r.srcLabel,
              sub: `คลังต้นทาง · ${r.srcLocation}`,
              onClick: () => ctx.openEntity("warehouse", r.srcWarehouse),
            },
            {
              name: r.dstLabel,
              sub: `คลังปลายทาง · ${r.dstLocation}`,
              onClick: () => ctx.openEntity("warehouse", r.dstWarehouse),
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
          title: "Transfer Timeline",
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
    { label: "ส่งขออนุมัติ", icon: "send", disabled: !rec.canSubmit, run: () => trfSubmit(rec, ctx) },
    { label: "อนุมัติ", icon: "checkCircle", disabled: !rec.canApprove, run: () => trfApprove(rec, ctx) },
    {
      label: "ไม่อนุมัติ",
      icon: "xCircle",
      danger: true,
      disabled: !rec.canReject,
      run: () => trfReject(rec, ctx),
    },
    {
      label: "ขอให้แก้ไข",
      icon: "edit",
      disabled: !rec.canReject,
      run: () => trfRequestRevision(rec, ctx),
    },
    { sep: true },
    {
      label: "ทำเครื่องหมายพร้อมโอน",
      icon: "checkCircle",
      disabled: !rec.canMarkReady,
      run: () => trfMarkReady(rec, ctx),
    },
    { label: "มอบหมายผู้ดำเนินการ", icon: "user", disabled: rec.isReadOnly, run: () => trfAssign(rec, ctx) },
    { sep: true },
    { label: "โอนย้ายทันที", icon: "play", disabled: !rec.canPost, run: () => trfPost(rec, ctx) },
    { label: "จ่ายออก", icon: "truck", disabled: !rec.canDispatch, run: () => trfDispatch(rec, ctx) },
    { label: "รับเข้า", icon: "goodsReceipt", disabled: !rec.canReceive, run: () => trfReceive(rec, ctx) },
    { sep: true },
    { label: "บันทึกปัญหา", icon: "alert", disabled: rec.status === "Draft", run: () => trfException(rec, ctx) },
    {
      label: "ปิดปัญหา",
      icon: "check",
      disabled: rec.openExceptions === 0,
      run: () => trfCloseException(rec, ctx),
    },
    { sep: true },
    {
      label: "ยกเลิก",
      icon: "circleSlash",
      danger: true,
      disabled: !rec.canCancel,
      run: () => trfCancel(rec, ctx),
    },
    {
      label: "กลับรายการ",
      icon: "refresh",
      danger: true,
      disabled: !rec.canReverse,
      run: () => trfReverse(rec, ctx),
    },
    {
      label: "พิมพ์",
      icon: "printer",
      run: () => ctx.toast("สั่งพิมพ์", `${rec.code} — Future support`, "info"),
    },
  ],
};

export const stockTransferSchemas: EntitySchemas<TrfRow> = { list, detail };
