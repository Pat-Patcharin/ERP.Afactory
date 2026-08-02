import { fmt } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  MOVEMENT_STATUS_TONE,
  cardIncoming,
  cardReservations,
  ledgerSummary,
  movementsByLocation,
  movementsByLot,
  movementsBySerial,
  movementsByWarehouse,
  productCards,
  productLedger,
  serialTimeline,
  type ProductCardRow,
} from "@/lib/domain/movement";
import { Badge, Thumb } from "@/components/ui";

/* ============================================================
   PRODUCT STOCK CARD — one product's ledger.

   The movement list answers "what happened"; this answers "what
   happened to this product". Same records, grouped nine ways, all
   read-only. Reservations and incoming come from Stock Inquiry so
   the two screens can never disagree.
   ============================================================ */

const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort();

/* ---------- List ---------- */

const list: ListSchema<ProductCardRow> = {
  key: "product-stock-card",
  entity: "Stock Card",
  entityPlural: "stock cards",
  title: "Product Stock Card",
  subtitle: "เลือกสินค้าเพื่อดูบัญชีแยกประเภทและยอดคงเหลือสะสมของสินค้านั้น",
  crumb: "Product Stock Card",
  crumbParent: "Inventory",
  primaryLabel: "",
  searchPlaceholder: "ค้นหา รหัสสินค้า / ชื่อสินค้า / บาร์โค้ด / แบรนด์",
  emptyTitle: "ไม่พบสินค้าที่ตรงกับเงื่อนไข",

  hideImportExport: true,
  hideCreate: true,

  source: productCards,
  searchFields: ["code", "name", "barcode", "brand", "cat"],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "moved", label: "มีความเคลื่อนไหว", test: (r) => r.movements > 0 },
    { key: "held", label: "มีของติด Hold", test: (r) => r.qcHold + r.returnHold > 0 },
  ],

  filters: [
    {
      id: "cat",
      label: "Category",
      options: () => uniq(productCards().map((r) => r.cat)),
      test: (r, v) => r.cat === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(productCards().map((r) => r.brand)),
      test: (r, v) => r.brand === v,
    },
  ],

  columns: [
    { key: "icon", label: "", cell: (r) => <Thumb size={30}>{r.icon}</Thumb> },
    {
      key: "code",
      label: "Product Code",
      sortable: true,
      locked: true,
      cell: (r) => <span className="font-semibold">{r.code}</span>,
    },
    {
      key: "name",
      label: "Product Name",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.name}</span>
          <span className="text-cap text-ink-3">
            {r.cat} · {r.brand}
          </span>
        </span>
      ),
    },
    { key: "unit", label: "UOM", muted: true, cell: (r) => r.unit },
    { key: "onHand", label: "On Hand", align: "right", sortable: true, cell: (r) => fmt(r.onHand) },
    {
      key: "available",
      label: "Available",
      align: "right",
      sortable: true,
      cell: (r) => <span className="font-semibold">{fmt(r.available)}</span>,
    },
    { key: "reserved", label: "Reserved", align: "right", muted: true, cell: (r) => fmt(r.reserved) },
    { key: "qcHold", label: "QC Hold", align: "right", muted: true, defaultHidden: true, cell: (r) => fmt(r.qcHold) },
    { key: "returnHold", label: "Return Hold", align: "right", muted: true, defaultHidden: true, cell: (r) => fmt(r.returnHold) },
    { key: "damaged", label: "Damaged", align: "right", muted: true, defaultHidden: true, cell: (r) => fmt(r.damaged) },
    {
      key: "movements",
      label: "Movements",
      align: "right",
      sortable: true,
      cell: (r) => <Badge tone="info">{fmt(r.movements)}</Badge>,
    },
    { key: "totalIn", label: "Total In", align: "right", muted: true, cell: (r) => fmt(r.totalIn) },
    { key: "totalOut", label: "Total Out", align: "right", muted: true, cell: (r) => fmt(r.totalOut) },
    { key: "lastMovement", label: "Last Movement", muted: true, cell: (r) => r.lastMovement },
    { key: "lastType", label: "Last Type", muted: true, defaultHidden: true, cell: (r) => r.lastType },
  ],

  secondaryActions: (ctx) => [
    { label: "Movement Ledger", icon: "sort", run: () => ctx.goto("/m/stock-card") },
  ],

  rowActions: (rec, ctx) => [
    { label: "เปิด Stock Card", icon: "eye", run: () => ctx.goto(`/m/product-stock-card/${rec.code}`) },
    { label: "เปิด Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
    { label: "เปิดข้อมูลสินค้า", icon: "product", run: () => ctx.openEntity("product", rec.code) },
  ],
};

/* ---------- Detail ---------- */

const detail: DetailSchema<ProductCardRow> = {
  key: "product-stock-card",
  entityLabel: "Product Stock Card",

  identity: (r) => ({
    image: <Thumb size={44}>{r.icon}</Thumb>,
    code: r.code,
    title: r.name,
    copyFields: [
      { label: "Product Code", value: r.code },
      { label: "Barcode", value: r.barcode },
    ],
    badges: [{ text: `${fmt(r.movements)} movements`, tone: "info" }],
    tags: [r.cat, r.brand, r.unit],
  }),

  kpis: (r) => [
    { icon: "box", label: "On Hand", value: fmt(r.onHand), sub: r.unit },
    { icon: "checkCircle", label: "Available", value: fmt(r.available), goTab: "balance" },
    { icon: "lock", label: "Reserved", value: fmt(r.reserved), goTab: "reservations" },
    { icon: "shield", label: "QC Hold", value: fmt(r.qcHold), goTab: "balance" },
    { icon: "return", label: "Return Hold", value: fmt(r.returnHold), goTab: "balance" },
    { icon: "trash", label: "Damaged", value: fmt(r.damaged), goTab: "balance" },
  ],

  tabs: [
    {
      key: "balance",
      label: "Running Balance",
      blocks: (r): Block[] => {
        const ledger = productLedger(r.code);
        const s = ledgerSummary(ledger);
        return [
          {
            type: "cards",
            title: "Period Summary",
            cols: 4,
            items: [
              { label: "Opening Balance", value: fmt(s.opening) },
              { label: "Period Total In", value: fmt(s.totalIn), tone: "accent" },
              { label: "Period Total Out", value: fmt(s.totalOut), tone: "warn" },
              {
                label: "Net Movement",
                value: `${s.net >= 0 ? "+" : ""}${fmt(s.net)}`,
              },
              { label: "Closing Balance", value: fmt(s.closing), tone: "accent" },
              { label: "Movements", value: fmt(s.count) },
              { label: "Available", value: fmt(r.available) },
              { label: "Reserved", value: fmt(r.reserved) },
            ],
          },
          {
            type: "table",
            /* Oldest first — the order the balance is actually built in. */
            title: "Movement Ledger (เก่า → ใหม่)",
            rows: ledger,
            empty: "ยังไม่มีความเคลื่อนไหวของสินค้านี้",
            cols: [
              { key: "when", label: "Date and Time", muted: true, cell: (m) => m.when },
              { key: "type", label: "Movement Type", cell: (m) => m.type },
              {
                key: "sourceDoc",
                label: "Document",
                cell: (m) => (m.sourceDoc ? <span className="font-medium">{m.sourceDoc}</span> : "—"),
              },
              {
                key: "desc",
                label: "Description",
                muted: true,
                cell: (m) => `${m.sourceModuleLabel}${m.partner ? ` · ${m.partner}` : ""}`,
              },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (m) => m.warehouse },
              { key: "toLoc", label: "Location", muted: true, cell: (m) => m.toLoc || "—" },
              {
                key: "qtyIn",
                label: "Qty In",
                align: "right",
                cell: (m) => (m.qtyIn ? <span className="text-success">{fmt(m.qtyIn)}</span> : "—"),
              },
              {
                key: "qtyOut",
                label: "Qty Out",
                align: "right",
                cell: (m) => (m.qtyOut ? <span className="text-info">{fmt(m.qtyOut)}</span> : "—"),
              },
              {
                key: "balanceAfter",
                label: "Balance",
                align: "right",
                cell: (m) => <span className="font-semibold">{fmt(m.balanceAfter)}</span>,
              },
              { key: "availAfter", label: "Available", align: "right", muted: true, cell: (m) => fmt(m.availAfter) },
              { key: "resAfter", label: "Reserved", align: "right", muted: true, cell: (m) => fmt(m.resAfter) },
              { key: "qcAfter", label: "QC Hold", align: "right", muted: true, cell: (m) => fmt(m.qcAfter) },
              { key: "retAfter", label: "Return Hold", align: "right", muted: true, cell: (m) => fmt(m.retAfter) },
              { key: "dmgAfter", label: "Damaged", align: "right", muted: true, cell: (m) => fmt(m.dmgAfter) },
              { key: "user", label: "User", muted: true, cell: (m) => m.user },
            ],
          },
          {
            type: "note",
            title: "Running balance rule",
            text: "Balance After = Balance Before + Quantity In − Quantity Out. ยอดคงเหลือถูกบันทึกไว้ในแต่ละรายการ การเรียงลำดับใหม่จึงไม่เปลี่ยนตัวเลข.",
          },
        ];
      },
      aside: (r) => {
        const s = ledgerSummary(productLedger(r.code));
        return {
          rows: [
            { icon: "box", label: "Opening", value: fmt(s.opening) },
            { icon: "arrowDown", label: "Total In", value: fmt(s.totalIn) },
            { icon: "arrowUp", label: "Total Out", value: fmt(s.totalOut) },
            { icon: "trend", label: "Net", value: `${s.net >= 0 ? "+" : ""}${fmt(s.net)}` },
            { icon: "checkCircle", label: "Closing", value: fmt(s.closing) },
            { icon: "sort", label: "Movements", value: fmt(s.count), muted: true },
          ],
        };
      },
    },

    {
      key: "warehouse",
      label: "By Warehouse",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Warehouse Movement Summary",
          rows: movementsByWarehouse(r.code),
          empty: "ยังไม่มีความเคลื่อนไหวในคลังใด",
          cols: [
            {
              key: "warehouse",
              label: "Warehouse",
              cell: (w) => (
                <button
                  onClick={() => ctx.openEntity("warehouse", w.warehouse)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {w.warehouse}
                  <span className="ml-2 font-normal text-ink-3">{w.whName}</span>
                </button>
              ),
            },
            { key: "opening", label: "Opening", align: "right", muted: true, cell: (w) => fmt(w.opening) },
            { key: "inbound", label: "Inbound", align: "right", cell: (w) => fmt(w.inbound) },
            { key: "outbound", label: "Outbound", align: "right", cell: (w) => fmt(w.outbound) },
            { key: "transferIn", label: "Transfer In", align: "right", muted: true, cell: (w) => fmt(w.transferIn) },
            { key: "transferOut", label: "Transfer Out", align: "right", muted: true, cell: (w) => fmt(w.transferOut) },
            { key: "adjustment", label: "Adjustment", align: "right", muted: true, cell: (w) => fmt(w.adjustment) },
            {
              key: "closing",
              label: "Closing",
              align: "right",
              cell: (w) => <span className="font-semibold">{fmt(w.closing)}</span>,
            },
            { key: "lastMovement", label: "Last Movement", muted: true, cell: (w) => w.lastMovement },
          ],
        },
      ],
    },

    {
      key: "location",
      label: "By Location",
      blocks: (r): Block[] => [
        {
          type: "table",
          title: "Warehouse → Zone → Rack → Bin",
          rows: movementsByLocation(r.code),
          empty: "ยังไม่มีความเคลื่อนไหวในตำแหน่งใด",
          cols: [
            {
              key: "location",
              label: "Location",
              cell: (l) => (
                <span className="flex flex-col">
                  <span className="font-semibold">{l.location}</span>
                  <span className="text-cap text-ink-3">{l.warehouse}</span>
                </span>
              ),
            },
            { key: "movementIn", label: "Movement In", align: "right", cell: (l) => fmt(l.movementIn) },
            { key: "movementOut", label: "Movement Out", align: "right", cell: (l) => fmt(l.movementOut) },
            {
              key: "currentQty",
              label: "Current Qty",
              align: "right",
              cell: (l) => <span className="font-semibold">{fmt(l.currentQty)}</span>,
            },
            { key: "lastMovement", label: "Last Movement", muted: true, cell: (l) => l.lastMovement },
            { key: "lotCount", label: "Lot Count", align: "right", muted: true, cell: (l) => fmt(l.lotCount) },
            { key: "serialCount", label: "Serial Count", align: "right", muted: true, cell: (l) => fmt(l.serialCount) },
            { key: "capacity", label: "Capacity", align: "right", muted: true, cell: () => "—" },
            { key: "util", label: "Utilization", align: "right", muted: true, cell: () => "—" },
          ],
        },
        {
          type: "note",
          title: "Capacity",
          text: "ความจุและอัตราการใช้พื้นที่ระดับ Bin จะเปิดใช้งานพร้อมโมดูล Stock Transfer.",
        },
      ],
    },

    {
      key: "lot",
      label: "Lot Movement",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Lot Movement",
          rows: movementsByLot(r.code),
          empty: "สินค้านี้ไม่ได้ควบคุมด้วย Lot",
          cols: [
            {
              key: "lot",
              label: "Lot Number",
              cell: (l) => (
                <button
                  onClick={() => ctx.goto("/soon?m=Lot%20Tracking")}
                  className="text-left font-semibold hover:text-primary"
                >
                  {l.lot}
                </button>
              ),
            },
            { key: "mfg", label: "Manufacturing", muted: true, cell: (l) => l.mfg },
            { key: "exp", label: "Expiry", muted: true, cell: (l) => l.exp },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (l) => l.warehouse },
            { key: "location", label: "Location", muted: true, cell: (l) => l.location },
            { key: "opening", label: "Opening", align: "right", muted: true, cell: (l) => fmt(l.opening) },
            { key: "qtyIn", label: "Qty In", align: "right", cell: (l) => fmt(l.qtyIn) },
            { key: "qtyOut", label: "Qty Out", align: "right", cell: (l) => fmt(l.qtyOut) },
            {
              key: "closing",
              label: "Closing",
              align: "right",
              cell: (l) => <span className="font-semibold">{fmt(l.closing)}</span>,
            },
            { key: "status", label: "Status", cell: (l) => <Badge tone="info">{l.status}</Badge> },
            { key: "sourceReceipt", label: "Source Receipt", muted: true, cell: (l) => l.sourceReceipt || "—" },
            { key: "lastMovement", label: "Last Movement", muted: true, cell: (l) => l.lastMovement },
          ],
        },
      ],
    },

    {
      key: "serial",
      label: "Serial Movement",
      blocks: (r, ctx): Block[] => {
        const serials = movementsBySerial(r.code);
        const first = serials[0];
        return [
          {
            type: "table",
            title: "Serial Movement",
            rows: serials,
            empty: "สินค้านี้ไม่ได้ควบคุมด้วย Serial",
            cols: [
              {
                key: "serial",
                label: "Serial Number",
                cell: (s) => (
                  <button
                    onClick={() => ctx.goto("/soon?m=Serial%20Tracking")}
                    className="text-left font-semibold hover:text-primary"
                  >
                    {s.serial}
                  </button>
                ),
              },
              { key: "warehouse", label: "Current Warehouse", muted: true, cell: (s) => s.warehouse },
              { key: "location", label: "Current Location", muted: true, cell: (s) => s.location },
              {
                key: "status",
                label: "Current Status",
                cell: (s) => (
                  <Badge tone={s.status === "In Stock" ? "success" : "info"}>{s.status}</Badge>
                ),
              },
              { key: "sourceReceipt", label: "Source GR", muted: true, cell: (s) => s.sourceReceipt },
              { key: "customer", label: "Customer", muted: true, cell: (s) => s.customer },
              { key: "salesOrder", label: "Sales Order", muted: true, cell: (s) => s.salesOrder },
              { key: "shipment", label: "Shipment", muted: true, cell: (s) => s.shipment },
              { key: "returnDoc", label: "Return", muted: true, cell: (s) => s.returnDoc },
              { key: "warranty", label: "Warranty", muted: true, cell: () => "—" },
              { key: "lastMovement", label: "Last Movement", muted: true, cell: (s) => s.lastMovement },
            ],
          },
          first
            ? {
                type: "timeline",
                title: `Serial Timeline — ${first.serial}`,
                items: serialTimeline(first.serial),
              }
            : null,
        ];
      },
    },

    {
      key: "reservations",
      label: "Reservations",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "สต๊อกที่ถูกจองไว้",
          rows: cardReservations(r.code),
          empty: "ยังไม่มีคำสั่งขายที่จองสินค้านี้",
          cols: [
            {
              key: "soRef",
              label: "Sales Order",
              cell: (v) => (
                <button
                  onClick={() => ctx.openEntity("sales-order", v.soRef)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {v.soRef}
                </button>
              ),
            },
            { key: "qty", label: "Reserved Qty", align: "right", cell: (v) => fmt(v.qty) },
            { key: "customer", label: "Customer", muted: true, cell: (v) => v.customer },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (v) => v.warehouse },
            { key: "date", label: "Date", muted: true, cell: (v) => v.date },
            { key: "status", label: "Status", cell: (v) => <Badge tone="info">{v.status}</Badge> },
          ],
        },
      ],
    },

    {
      key: "incoming",
      label: "Incoming",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "สินค้าที่กำลังเข้า",
          rows: cardIncoming(r.code),
          empty: "ไม่มีสินค้าระหว่างสั่งซื้อ",
          cols: [
            {
              key: "poRef",
              label: "Purchase Order",
              cell: (v) =>
                v.documented ? (
                  <button
                    onClick={() => ctx.openEntity("purchase-order", v.poRef)}
                    className="text-left font-semibold hover:text-primary"
                  >
                    {v.poRef}
                  </button>
                ) : (
                  <span className="text-ink-3">ยังไม่ออกใบสั่งซื้อ</span>
                ),
            },
            { key: "qty", label: "Incoming Qty", align: "right", cell: (v) => fmt(v.qty) },
            { key: "eta", label: "ETA", muted: true, cell: (v) => v.eta },
            { key: "supplier", label: "Supplier", muted: true, cell: (v) => v.supplier },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (v) => v.warehouse },
            {
              key: "status",
              label: "Status",
              cell: (v) => <Badge tone={v.documented ? "info" : "neutral"}>{v.status}</Badge>,
            },
          ],
        },
      ],
    },

    {
      key: "trace",
      label: "Document Trace",
      blocks: (r, ctx): Block[] => {
        const ledger = productLedger(r.code).filter((m) => m.sourceDoc);
        const seen = new Set<string>();
        const docs = ledger
          .filter((m) => !seen.has(m.sourceDoc) && seen.add(m.sourceDoc))
          .map((m) => ({
            name: `${m.sourceDoc} — ${m.sourceModuleLabel}`,
            meta: `${m.sourceStatus} · ${m.date} · ${fmt(m.qtyIn || m.qtyOut)} ${r.unit} · ${m.user}`,
            onClick: () =>
              m.sourceModule
                ? ctx.openEntity(m.sourceModule, m.sourceDoc)
                : ctx.toast("ยังไม่มีโมดูลนี้", "จะเปิดใช้งานในเฟสถัดไป", "info"),
          }));

        return [
          {
            type: "note",
            title: "Document chain",
            text: "Purchase Order → Goods Receipt → QC Inspection → Put Away → Stock Movement · Sales Order → Reservation → Picking → Shipment → Stock Movement · Sales Return → Return Receipt → Disposition → Stock Movement",
          },
          {
            type: "docs",
            title: `เอกสารต้นทางทั้งหมด (${docs.length})`,
            empty: "ยังไม่มีเอกสารต้นทางสำหรับสินค้านี้",
            items: docs,
          },
          {
            type: "table",
            title: "รายการที่ถูกกลับรายการ",
            rows: productLedger(r.code).filter((m) => m.status === "Reversed" || m.reversalOf),
            empty: "ไม่มีรายการที่ถูกกลับรายการ",
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
              { key: "type", label: "Type", muted: true, cell: (m) => m.type },
              { key: "when", label: "Date", muted: true, cell: (m) => m.when },
              {
                key: "link",
                label: "Linkage",
                cell: (m) =>
                  m.reversalOf ? `Reversal of ${m.reversalOf}` : `Reversed by ${m.reversedBy}`,
              },
              {
                key: "status",
                label: "Status",
                cell: (m) => (
                  <Badge tone={MOVEMENT_STATUS_TONE[m.status] ?? "neutral"}>{m.status}</Badge>
                ),
              },
            ],
          },
        ];
      },
    },

    {
      key: "timeline",
      label: "Timeline",
      blocks: (r): Block[] => {
        const recent = [...productLedger(r.code)].reverse().slice(0, 20);
        return [
          {
            type: "timeline",
            title: "ความเคลื่อนไหวล่าสุด 20 รายการ",
            items: recent.map((m) => ({
              title: `${m.type} · ${m.qtyIn ? `+${fmt(m.qtyIn)}` : m.qtyOut ? `−${fmt(m.qtyOut)}` : "0"}`,
              detail: `${m.sourceDoc || m.whLabel} · คงเหลือ ${fmt(m.balanceAfter)}`,
              user: m.user,
              when: m.when,
              kind:
                m.direction === "In" ? "primary" : m.direction === "Out" ? "info" : "warn",
            })),
          },
          {
            type: "audit",
            title: "Audit Log",
            items: recent.slice(0, 8).map((m) => ({
              event: `${m.type} — ${m.code}`,
              user: m.user,
              when: m.when,
              field: "Balance",
              from: fmt(m.balanceBefore),
              to: fmt(m.balanceAfter),
              kind: m.direction === "In" ? "primary" : "info",
            })),
          },
        ];
      },
    },
  ],

  actions: (rec, ctx) => [
    { label: "Open Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
    { label: "View Product Master", icon: "product", run: () => ctx.openEntity("product", rec.code) },
    {
      label: "Export Stock Card",
      icon: "upload",
      run: () => ctx.toast("ส่งออก Stock Card", `${rec.code} — Future support`, "info"),
    },
    {
      label: "Print",
      icon: "printer",
      run: () => ctx.toast("สั่งพิมพ์ Stock Card", `${rec.code} — Future support`, "info"),
    },
  ],
};

export const productStockCardSchemas: EntitySchemas<ProductCardRow> = { list, detail };
