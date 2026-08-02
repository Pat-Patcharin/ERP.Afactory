import { COSTING_METHODS, MOVEMENT_TYPES } from "@/data/movements";
import { fmt, money, money0 } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  DIRECTION_TONE,
  MOVEMENT_STATUS_TONE,
  isThisWeek,
  isToday,
  movementRows,
  movementSummary,
  serialTimeline,
  type MovementRow,
} from "@/lib/domain/movement";
import { Badge, Thumb } from "@/components/ui";

/* ============================================================
   STOCK CARD — the movement ledger.

   Every row explains one quantity change: what changed, when, which
   document caused it, and what the balance was on either side. The
   schema offers no edit and no delete, and the engine's create button
   is switched off — a correction is a new movement, never a rewrite
   of a posted one.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

/** Before → after, the pattern the whole Stock Impact tab is built from. */
const delta = (label: string, before: number, after: number) => ({
  label,
  value: (
    <span className="tnum">
      {fmt(before)}
      <span className="mx-1.5 text-ink-3">→</span>
      <span
        className={
          after > before
            ? "font-semibold text-success"
            : after < before
              ? "font-semibold text-info"
              : "font-semibold"
        }
      >
        {fmt(after)}
      </span>
    </span>
  ),
});

/* ---------- List ---------- */

const list: ListSchema<MovementRow> = {
  key: "stock-card",
  entity: "Movement",
  entityPlural: "movements",
  title: "Stock Card",
  subtitle:
    "Trace every inventory movement and running balance by product, warehouse, location, lot, and serial number.",
  crumb: "Stock Card",
  crumbParent: "Inventory",
  primaryLabel: "",
  searchPlaceholder:
    "ค้นหา สินค้า / บาร์โค้ด / เลขที่เอกสาร / คลัง / ตำแหน่ง / Lot / Serial / ลูกค้า / ผู้ทำรายการ",
  emptyTitle: "ไม่พบความเคลื่อนไหวที่ตรงกับเงื่อนไข",

  /* A ledger is written by other modules, never from this screen. */
  hideImportExport: true,
  hideCreate: true,

  source: movementRows,

  searchFields: [
    "code",
    "product",
    "productName",
    "barcode",
    "sourceDoc",
    "reference",
    "warehouse",
    "whName",
    "fromLoc",
    "toLoc",
    "lot",
    "serial",
    "partner",
    "user",
    "type",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "in", label: "รับเข้า", test: (r) => r.direction === "In" },
    { key: "out", label: "จ่ายออก", test: (r) => r.direction === "Out" },
    { key: "transfer", label: "โอนย้าย", test: (r) => r.type.startsWith("Transfer") },
    {
      key: "adjust",
      label: "ปรับปรุง",
      test: (r) => r.type.includes("Adjustment") || r.type.startsWith("Scrap"),
    },
    { key: "reserve", label: "การจอง", test: (r) => r.type.includes("Reserved") },
    { key: "return", label: "รับคืน", test: (r) => r.type.includes("Return") },
    { key: "count", label: "นับสต๊อก", test: (r) => r.type.startsWith("Count") },
    { key: "today", label: "วันล่าสุด", test: (r) => isToday(r) },
    { key: "week", label: "7 วันล่าสุด", test: (r) => isThisWeek(r) },
  ],

  filters: [
    {
      id: "dateFrom",
      label: "Date From",
      options: () => uniq(movementRows().map((r) => r.date)),
      test: (r, v) => r.ts >= dateValue(v),
    },
    {
      id: "dateTo",
      label: "Date To",
      options: () => uniq(movementRows().map((r) => r.date)),
      test: (r, v) => r.ts <= dateValue(v) + 86_400_000,
    },
    {
      id: "type",
      label: "Movement Type",
      options: () => MOVEMENT_TYPES.map((t) => t.type),
      test: (r, v) => r.type === v || r.type === `${v} Reversal`,
    },
    {
      id: "direction",
      label: "Direction",
      options: () => ["In", "Out", "Transfer", "Status Change", "No Quantity Change"],
      test: (r, v) => r.direction === v,
    },
    {
      id: "product",
      label: "Product",
      options: () => uniq(movementRows().map((r) => r.product)),
      test: (r, v) => r.product === v,
    },
    {
      id: "cat",
      label: "Category",
      options: () => uniq(movementRows().map((r) => r.cat)),
      test: (r, v) => r.cat === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(movementRows().map((r) => r.brand)),
      test: (r, v) => r.brand === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => uniq(movementRows().map((r) => r.whLabel)),
      test: (r, v) => r.whLabel === v,
    },
    {
      id: "zone",
      label: "Zone",
      options: () => uniq(movementRows().map((r) => r.zone)),
      test: (r, v) => r.zone === v,
    },
    {
      id: "rack",
      label: "Rack",
      options: () => uniq(movementRows().map((r) => r.rack)),
      test: (r, v) => r.rack === v,
    },
    {
      id: "bin",
      label: "Bin",
      options: () => uniq(movementRows().map((r) => r.bin)),
      test: (r, v) => r.bin === v,
    },
    {
      id: "lot",
      label: "Lot Number",
      options: () => uniq(movementRows().map((r) => r.lot)),
      test: (r, v) => r.lot === v,
    },
    {
      id: "serial",
      label: "Serial Number",
      options: () => uniq(movementRows().map((r) => r.serial)).slice(0, 60),
      test: (r, v) => r.serial === v,
    },
    {
      id: "module",
      label: "Source Module",
      options: () => uniq(movementRows().map((r) => r.sourceModuleLabel)),
      test: (r, v) => r.sourceModuleLabel === v,
    },
    {
      id: "doc",
      label: "Source Document",
      options: () => uniq(movementRows().map((r) => r.sourceDoc)).slice(0, 60),
      test: (r, v) => r.sourceDoc === v,
    },
    {
      id: "user",
      label: "User",
      options: () => uniq(movementRows().map((r) => r.user)),
      test: (r, v) => r.user === v,
    },
    {
      id: "statusBefore",
      label: "Status Before",
      options: () => uniq(movementRows().map((r) => r.statusBefore)),
      test: (r, v) => r.statusBefore === v,
    },
    {
      id: "statusAfter",
      label: "Status After",
      options: () => uniq(movementRows().map((r) => r.statusAfter)),
      test: (r, v) => r.statusAfter === v,
    },
    { id: "inOnly", label: "Quantity In Only", options: yesNo, test: (r) => r.qtyIn > 0 },
    { id: "outOnly", label: "Quantity Out Only", options: yesNo, test: (r) => r.qtyOut > 0 },
    {
      id: "cost",
      label: "Has Cost Impact",
      options: yesNo,
      test: (r) => r.valueIn > 0 || r.valueOut > 0,
    },
    {
      id: "reversed",
      label: "Reversed Movements",
      options: yesNo,
      test: (r) => r.status === "Reversed" || Boolean(r.reversalOf),
    },
    {
      id: "myWarehouse",
      label: "My Warehouse",
      options: () => ["WH-BKK Bangkok Main Warehouse"],
      test: (r, v) => r.whLabel === v,
    },
  ],

  columns: [
    {
      key: "when",
      label: "Movement Date",
      sortable: true,
      sortValue: (r) => r.ts,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.date}</span>
          <span className="text-cap text-ink-3">{r.time}</span>
        </span>
      ),
    },
    {
      key: "code",
      label: "Movement No.",
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
    {
      key: "product",
      label: "Product Code",
      sortable: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <Thumb size={26}>{r.icon}</Thumb>
          <span className="font-semibold">{r.product}</span>
        </span>
      ),
    },
    {
      key: "productName",
      label: "Product Name",
      sortable: true,
      defaultHidden: true,
      cell: (r) => r.productName,
    },
    { key: "type", label: "Movement Type", sortable: true, cell: (r) => r.type },
    {
      key: "direction",
      label: "Direction",
      sortable: true,
      cell: (r) => <Badge tone={DIRECTION_TONE[r.direction]}>{r.direction}</Badge>,
    },
    {
      key: "sourceDoc",
      label: "Source Document",
      sortable: true,
      cell: (r) => (r.sourceDoc ? <span className="font-medium">{r.sourceDoc}</span> : "—"),
    },
    {
      key: "sourceModuleLabel",
      label: "Source Module",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.sourceModuleLabel,
    },
    {
      key: "warehouse",
      label: "Warehouse",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.warehouse}</span>
          <span className="text-cap text-ink-3">{r.whName}</span>
        </span>
      ),
    },
    { key: "fromLoc", label: "From Location", muted: true, defaultHidden: true, cell: (r) => r.fromLoc || "—" },
    { key: "toLoc", label: "To Location", muted: true, defaultHidden: true, cell: (r) => r.toLoc || "—" },
    { key: "lot", label: "Lot Number", muted: true, defaultHidden: true, cell: (r) => r.lot || "—" },
    { key: "serial", label: "Serial Number", muted: true, defaultHidden: true, cell: (r) => r.serial || "—" },
    { key: "unit", label: "UOM", muted: true, defaultHidden: true, cell: (r) => r.unit },
    {
      key: "qtyIn",
      label: "Qty In",
      align: "right",
      sortable: true,
      cell: (r) => (r.qtyIn ? <span className="font-semibold text-success">{fmt(r.qtyIn)}</span> : "—"),
    },
    {
      key: "qtyOut",
      label: "Qty Out",
      align: "right",
      sortable: true,
      cell: (r) => (r.qtyOut ? <span className="font-semibold text-info">{fmt(r.qtyOut)}</span> : "—"),
    },
    {
      key: "balanceBefore",
      label: "Balance Before",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => fmt(r.balanceBefore),
    },
    {
      key: "balanceAfter",
      label: "Balance After",
      align: "right",
      sortable: true,
      cell: (r) => <span className="font-semibold">{fmt(r.balanceAfter)}</span>,
    },
    {
      key: "statusBefore",
      label: "Status Before",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.statusBefore,
    },
    {
      key: "statusAfter",
      label: "Status After",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.statusAfter,
    },
    {
      key: "unitCost",
      label: "Unit Cost",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => money(r.unitCost),
    },
    {
      key: "valueImpact",
      label: "Value Impact",
      align: "right",
      muted: true,
      defaultHidden: true,
      sortValue: (r) => r.valueIn - r.valueOut,
      cell: (r) => money(r.valueIn - r.valueOut),
    },
    { key: "user", label: "Performed By", muted: true, cell: (r) => r.user },
    { key: "reference", label: "Reference", muted: true, defaultHidden: true, cell: (r) => r.reference || "—" },
    {
      key: "status",
      label: "Status",
      sortable: true,
      cell: (r) => (
        <Badge tone={MOVEMENT_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
      ),
    },
  ],

  secondaryActions: (ctx) => [
    {
      label: "Export Excel",
      icon: "upload",
      run: () =>
        ctx.toast(
          "ส่งออก Excel",
          `เตรียมไฟล์ตามตัวกรองปัจจุบัน ${fmt(movementRows().length)} รายการ — Future support`,
          "info",
        ),
    },
    {
      label: "Export CSV",
      icon: "download",
      run: () =>
        ctx.toast("ส่งออก CSV", "เตรียมไฟล์ตามคอลัมน์ที่แสดงอยู่ — Future support", "info"),
    },
    {
      label: "Print",
      icon: "printer",
      run: () => ctx.toast("สั่งพิมพ์", "เตรียม Stock Card สำหรับพิมพ์ — Future support", "info"),
    },
    {
      label: "Product Stock Card",
      icon: "file",
      run: () => ctx.goto("/m/product-stock-card"),
    },
  ],

  hero: (ctx) => {
    const s = movementSummary();
    return {
      kpis: [
        { icon: "sort", label: "Total Movements", value: fmt(s.total), sub: "ทั้งบัญชีแยกประเภท", goTab: "all" },
        { icon: "arrowDown", label: "Inbound Today", value: fmt(s.inboundToday), sub: "วันทำการล่าสุด", tone: "ok", goTab: "in" },
        { icon: "arrowUp", label: "Outbound Today", value: fmt(s.outboundToday), sub: "วันทำการล่าสุด", goTab: "out" },
        { icon: "truck", label: "Transfer Movements", value: fmt(s.transfers), sub: "โอนย้ายระหว่างคลัง", goTab: "transfer" },
        { icon: "sliders", label: "Adjustment Movements", value: fmt(s.adjustments), sub: "ปรับปรุงยอด", tone: "warn", goTab: "adjust" },
        { icon: "lock", label: "Reservation Movements", value: fmt(s.reservations), sub: "การจองสต๊อก", goTab: "reserve" },
        { icon: "return", label: "Return Movements", value: fmt(s.returns), sub: "รับคืนและปล่อยคืนสต๊อก", goTab: "return" },
        {
          icon: "trend",
          label: "Net Movement Today",
          value: `${s.netToday >= 0 ? "+" : ""}${fmt(s.netToday)}`,
          sub: "รับเข้า − จ่ายออก",
          tone: s.netToday >= 0 ? "ok" : "warn",
          goTab: "today",
        },
        { icon: "product", label: "Products Moved Today", value: fmt(s.productsToday), sub: "SKU ที่มีการเคลื่อนไหว", goTab: "today" },
        {
          icon: "pricing",
          label: "Inventory Value Change",
          value: money0(s.valueToday),
          sub: "Operational Cost Preview",
          tone: "primary",
          run: () =>
            ctx.toast(
              "Operational Cost Preview",
              "ตัวเลขต้นทุนเป็นค่าประมาณ ระบบบัญชีจริงจะทำในเฟส Finance",
              "info",
            ),
        },
      ],
    };
  },

  rowActions: (rec, ctx) => [
    { label: "เปิดรายละเอียดการเคลื่อนไหว", icon: "eye", run: () => ctx.goto(`/m/stock-card/${rec.code}`) },
    {
      label: rec.sourceDoc ? `เปิด ${rec.sourceModuleLabel}` : "ไม่มีเอกสารต้นทาง",
      icon: "file",
      disabled: !rec.sourceDoc || !rec.sourceModule,
      disabledReason: "รายการนี้เกิดจากงานคลังโดยตรง ไม่มีเอกสารต้นทาง",
      run: () => ctx.openEntity(rec.sourceModule, rec.sourceDoc),
    },
    { label: "เปิด Stock Card ของสินค้า", icon: "product", run: () => ctx.goto(`/m/product-stock-card/${rec.product}`) },
    {
      label: "ส่งออกรายการนี้",
      icon: "upload",
      run: () => ctx.toast("ส่งออกรายการ", `${rec.code} — Future support`, "info"),
    },
  ],

  bulkActions: (rows, ctx) => [
    {
      label: "ส่งออกรายการที่เลือก",
      icon: "upload",
      run: () =>
        ctx.toast("ส่งออกรายการที่เลือก", `${rows.length} รายการ — Future support`, "info"),
    },
  ],
};

/** dd/mm/yyyy from the filter options back to a timestamp. */
function dateValue(v: string) {
  const [d, m, y] = v.split("/").map(Number);
  return d && m && y ? new Date(y, m - 1, d).getTime() : 0;
}

/* ---------- Movement detail ---------- */

const detail: DetailSchema<MovementRow> = {
  key: "stock-card",
  entityLabel: "Stock Movement",

  identity: (r) => ({
    image: <Thumb size={44}>{r.icon}</Thumb>,
    code: r.code,
    title: `${r.type} — ${r.productName}`,
    copyFields: [
      { label: "Movement No.", value: r.code },
      { label: "Product", value: r.product },
      ...(r.sourceDoc ? [{ label: "Source Document", value: r.sourceDoc }] : []),
    ],
    badges: [
      { text: r.direction, tone: DIRECTION_TONE[r.direction] },
      { text: r.status, tone: MOVEMENT_STATUS_TONE[r.status] ?? "neutral" },
      ...(r.reversalOf ? [{ text: "Reversal", tone: "danger" as const }] : []),
    ],
    tags: [r.whLabel, r.when, r.sourceModuleLabel],
  }),

  kpis: (r) => [
    {
      icon: r.qtyIn ? "arrowDown" : "arrowUp",
      label: "Quantity",
      value: r.qtyIn ? `+${fmt(r.qtyIn)}` : r.qtyOut ? `−${fmt(r.qtyOut)}` : "0",
      sub: r.unit,
    },
    { icon: "box", label: "Balance Before", value: fmt(r.balanceBefore), goTab: "impact" },
    { icon: "checkCircle", label: "Balance After", value: fmt(r.balanceAfter), goTab: "impact" },
    {
      icon: "pricing",
      label: "Value Impact",
      value: money(r.valueIn - r.valueOut),
      sub: "Cost preview",
      goTab: "cost",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => [
        {
          type: "fields",
          title: "Movement Information",
          cols: 2,
          items: [
            { label: "Movement No.", value: r.code },
            { label: "Movement Type", value: r.type },
            { label: "Direction", value: r.direction },
            { label: "Posted Date", value: r.when },
            { label: "Performed By", value: r.user },
            { label: "Reference", value: r.reference || "—" },
            { label: "Status", value: r.status },
            { label: "Source Module", value: r.sourceModuleLabel },
          ],
        },
        {
          type: "fields",
          title: "Product Information",
          cols: 2,
          items: [
            { label: "Product Code", value: r.product },
            { label: "Product Name", value: r.productName },
            { label: "Barcode", value: r.barcode },
            { label: "Category", value: r.cat },
            { label: "Brand", value: r.brand },
            { label: "UOM", value: r.unit },
          ],
        },
        {
          type: "fields",
          title: "Warehouse and Location",
          cols: 2,
          items: [
            { label: "Warehouse", value: r.whLabel },
            { label: "From Location", value: r.fromLoc || "—" },
            { label: "To Location", value: r.toLoc || "—" },
            { label: "Zone / Rack / Bin", value: `${r.zone || "—"} / ${r.rack || "—"} / ${r.bin || "—"}` },
          ],
        },
        r.status === "Reversed" && {
          type: "alert",
          tone: "danger",
          title: "รายการนี้ถูกกลับรายการแล้ว",
          message: `ยกเลิกด้วย ${r.reversedBy} — รายการที่ผ่านบัญชีแล้วจะไม่ถูกแก้ไข แต่จะออกรายการกลับทางแทน`,
        },
        Boolean(r.reversalOf) && {
          type: "alert",
          tone: "warn",
          title: "รายการกลับทาง",
          message: `กลับรายการของ ${r.reversalOf}`,
        },
      ],
    },

    {
      key: "impact",
      label: "Stock Impact",
      blocks: (r): Block[] => [
        {
          type: "cards",
          title: "Quantity Impact",
          cols: 4,
          items: [
            { label: "Quantity In", value: fmt(r.qtyIn), tone: r.qtyIn ? "accent" : undefined },
            { label: "Quantity Out", value: fmt(r.qtyOut), tone: r.qtyOut ? "warn" : undefined },
            { label: "Balance Before", value: fmt(r.balanceBefore) },
            { label: "Balance After", value: fmt(r.balanceAfter), tone: "accent" },
          ],
        },
        {
          type: "fields",
          title: "Stock Status Impact",
          cols: 2,
          items: [
            delta("On Hand", r.balanceBefore, r.balanceAfter),
            delta("Available", r.availBefore, r.availAfter),
            delta("Reserved", r.resBefore, r.resAfter),
            delta("QC Hold", r.qcBefore, r.qcAfter),
            delta("Return Hold", r.retBefore, r.retAfter),
            delta("Damaged", r.dmgBefore, r.dmgAfter),
            delta("Blocked", r.blkBefore, r.blkAfter),
            { label: "Status", value: `${r.statusBefore} → ${r.statusAfter}` },
          ],
        },
        {
          type: "note",
          title: "Balance rule",
          text: "Balance After = Balance Before + Quantity In − Quantity Out. การจองสต๊อกเป็นการย้ายสถานะ ไม่ลด On Hand.",
        },
      ],
    },

    {
      key: "source",
      label: "Source Document",
      blocks: (r, ctx): Block[] => [
        {
          type: "fields",
          title: "Source Document",
          cols: 2,
          items: [
            { label: "Source Module", value: r.sourceModuleLabel },
            { label: "Document Type", value: r.type },
            { label: "Document Number", value: r.sourceDoc || "—" },
            { label: "Document Date", value: r.when },
            { label: "Customer / Supplier", value: r.partner || "—" },
            { label: "Source Line", value: r.sourceDoc ? `บรรทัดที่ ${r.sourceLine}` : "—" },
            { label: "Source Status", value: r.sourceStatus || "—" },
          ],
        },
        {
          type: "docs",
          title: "Document Relationship",
          empty: "รายการนี้ไม่ได้อ้างอิงเอกสารต้นทาง",
          items: [
            r.sourceDoc && {
              name: r.sourceDoc,
              meta: `${r.sourceModuleLabel} · ${r.sourceStatus} · ${fmt(r.qtyIn || r.qtyOut)} ${r.unit} · ${r.user}`,
              onClick: () =>
                r.sourceModule
                  ? ctx.openEntity(r.sourceModule, r.sourceDoc)
                  : ctx.toast("ยังไม่มีโมดูลนี้", "จะเปิดใช้งานในเฟสถัดไป", "info"),
            },
            r.reference && {
              name: r.reference,
              meta: "เอกสารอ้างอิงต้นทาง",
              onClick: () => ctx.toast("เอกสารอ้างอิง", r.reference, "info"),
            },
            r.reversalOf && {
              name: r.reversalOf,
              meta: "รายการต้นฉบับที่ถูกกลับรายการ",
              onClick: () => ctx.goto(`/m/stock-card/${r.reversalOf}`),
            },
            r.reversedBy && {
              name: r.reversedBy,
              meta: "รายการกลับทางของรายการนี้",
              onClick: () => ctx.goto(`/m/stock-card/${r.reversedBy}`),
            },
          ].filter(Boolean) as { name: string; meta: string; onClick: () => void }[],
        },
      ],
    },

    {
      key: "lot",
      label: "Lot / Serial",
      blocks: (r, ctx): Block[] => [
        {
          type: "fields",
          title: "Lot / Serial",
          cols: 2,
          items: [
            { label: "Lot Number", value: r.lot || "—" },
            { label: "Serial Number", value: r.serial || "—" },
            { label: "Quantity", value: `${fmt(r.qtyIn || r.qtyOut)} ${r.unit}` },
            { label: "Location", value: r.toLoc || "—" },
          ],
        },
        r.serial
          ? {
              type: "timeline",
              title: `Serial ${r.serial}`,
              items: serialTimeline(r.serial),
            }
          : {
              type: "empty",
              title: "Serial",
              heading: "ไม่มี Serial",
              message: "สินค้ารายการนี้ไม่ได้ควบคุมด้วย Serial",
            },
        Boolean(r.lot) && {
          type: "entity",
          title: "Lot tracking",
          items: [
            {
              name: r.lot,
              sub: "เปิดการติดตาม Lot",
              onClick: () => ctx.goto("/soon?m=Lot%20Tracking"),
            },
          ],
        },
      ],
    },

    {
      key: "cost",
      label: "Cost Preview",
      blocks: (r): Block[] => [
        {
          type: "alert",
          tone: "info",
          title: "Operational Cost Preview",
          message:
            "ตัวเลขในส่วนนี้เป็นค่าประมาณเพื่อการปฏิบัติงาน ยังไม่ได้ผ่านระบบต้นทุนจริง การบันทึกบัญชีจะทำในเฟส Finance",
        },
        {
          type: "cards",
          title: "Cost Impact",
          cols: 3,
          items: [
            { label: "Unit Cost", value: money(r.unitCost), sub: r.currency },
            { label: "Quantity", value: fmt(r.qtyIn || r.qtyOut), sub: r.unit },
            { label: "Value In", value: money(r.valueIn) },
            { label: "Value Out", value: money(r.valueOut) },
            { label: "Balance Value", value: money0(r.balanceValue), tone: "accent" },
            { label: "Costing Method", value: r.costingMethod },
          ],
        },
        {
          type: "fields",
          title: "Costing basis",
          cols: 2,
          items: [
            { label: "Costing Method", value: r.costingMethod },
            { label: "Currency", value: r.currency },
            { label: "Methods planned", value: COSTING_METHODS.join(", "), span: true },
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
          title: "Movement Timeline",
          items: [
            {
              title: "Posted",
              detail: `${r.type} · ${fmt(r.qtyIn || r.qtyOut)} ${r.unit}`,
              user: r.user,
              when: r.when,
              kind: "primary",
            },
            r.sourceDoc
              ? {
                  title: `${r.sourceModuleLabel} ${r.sourceDoc}`,
                  detail: `สถานะเอกสาร ${r.sourceStatus}`,
                  user: r.user,
                  when: r.when,
                  kind: "info",
                }
              : {
                  title: "งานคลังโดยตรง",
                  detail: "ไม่มีเอกสารต้นทาง",
                  user: r.user,
                  when: r.when,
                },
            ...(r.reversedBy
              ? [
                  {
                    title: "Reversed",
                    detail: `กลับรายการด้วย ${r.reversedBy}`,
                    user: r.user,
                    when: r.when,
                    kind: "warn",
                  },
                ]
              : []),
          ],
        },
        {
          type: "audit",
          title: "Audit Log",
          items: [
            {
              event: "Movement posted",
              user: r.user,
              when: r.when,
              field: "Balance",
              from: fmt(r.balanceBefore),
              to: fmt(r.balanceAfter),
              kind: "primary",
            },
            {
              event: "Stock status updated",
              user: r.user,
              when: r.when,
              field: "Available",
              from: fmt(r.availBefore),
              to: fmt(r.availAfter),
              kind: "info",
            },
            ...(r.reversedBy
              ? [
                  {
                    event: "Reversed",
                    user: r.user,
                    when: r.when,
                    field: "Status",
                    from: "Posted",
                    to: "Reversed",
                    kind: "warn",
                  },
                ]
              : []),
          ],
        },
      ],
      aside: (r) => ({
        rows: [
          { icon: "box", label: "Balance Before", value: fmt(r.balanceBefore) },
          { icon: "checkCircle", label: "Balance After", value: fmt(r.balanceAfter) },
          { icon: "lock", label: "Reserved", value: `${fmt(r.resBefore)} → ${fmt(r.resAfter)}`, muted: true },
          { icon: "shield", label: "QC Hold", value: `${fmt(r.qcBefore)} → ${fmt(r.qcAfter)}`, muted: true },
          { icon: "user", label: "Performed By", value: r.user, muted: true },
          { icon: "clock", label: "Posted", value: r.when, muted: true },
        ],
      }),
    },
  ],

  actions: (rec, ctx) => [
    {
      label: "เปิด Stock Card ของสินค้า",
      icon: "product",
      run: () => ctx.goto(`/m/product-stock-card/${rec.product}`),
    },
    {
      label: rec.sourceDoc ? `เปิด ${rec.sourceModuleLabel}` : "ไม่มีเอกสารต้นทาง",
      icon: "file",
      disabled: !rec.sourceDoc || !rec.sourceModule,
      run: () => ctx.openEntity(rec.sourceModule, rec.sourceDoc),
    },
    {
      label: "ส่งออกรายการนี้",
      icon: "upload",
      run: () => ctx.toast("ส่งออกรายการ", `${rec.code} — Future support`, "info"),
    },
  ],
};

export const stockCardSchemas: EntitySchemas<MovementRow> = { list, detail };
