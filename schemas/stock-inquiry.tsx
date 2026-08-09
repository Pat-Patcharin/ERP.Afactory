import { STOCK_STATUSES } from "@/data/stock";
import { fmt, money, money0 } from "@/lib/format";
import type {
  Block,
  DetailSchema,
  EntitySchemas,
  ListSchema,
} from "@/lib/types";
import {
  STOCK_TONE,
  lowStockProducts,
  negativePositions,
  nearExpiryLots,
  productByWarehouse,
  productIncoming,
  productLots,
  productReservations,
  productSerials,
  productTotals,
  stockMovements,
  stockRows,
  stockSummary,
  stockTotals,
  type StockRow,
} from "@/lib/domain/stock";
import { getProduct } from "@/lib/domain/product";
import { Badge, Thumb } from "@/components/ui";

/* ============================================================
   STOCK INQUIRY — the central inventory lookup.

   Read-only by design: warehouse, sales, purchasing, service and
   management all open the same screen, and none of them move stock
   from here. There is no form schema and no create action; every
   action either opens a drawer or hands off to the module that owns
   the change.

   The whole screen is the shared list engine — same table, search,
   filter drawer, quick view and column settings every other module
   uses. What is specific to inventory lives in this schema.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

/** Availability shown against its reorder point. */
const availTone = (r: StockRow) =>
  r.available < 0 ? "danger" : r.available <= r.rop ? "warning" : "success";

/* ---------- List ---------- */

const list: ListSchema<StockRow> = {
  key: "stock-inquiry",
  entity: "Stock Position",
  entityPlural: "positions",
  title: "Stock Inquiry",
  subtitle: "Real-time Inventory Visibility",
  crumb: "Stock Inquiry",
  crumbParent: "Inventory",
  primaryLabel: "",
  searchPlaceholder: "ค้นหา รหัสสินค้า / บาร์โค้ด / ชื่อ / แบรนด์ / Lot / Serial / คลัง / Bin",
  emptyTitle: "ไม่พบสินค้าคงคลังที่ตรงกับเงื่อนไข",

  /* Nothing is created or imported from an inquiry screen. */
  hideImportExport: true,
  hideCreate: true,

  source: stockRows,

  searchFields: [
    "product",
    "productName",
    "barcode",
    "brand",
    "cat",
    "lot",
    "serial",
    "warehouse",
    "whName",
    "zone",
    "bin",
    "code",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "available", label: "พร้อมขาย", test: (r) => r.available > 0 },
    { key: "low", label: "ต่ำกว่า ROP", test: (r) => r.available <= r.rop },
    {
      key: "hold",
      label: "ติด Hold",
      test: (r) => r.qcHold > 0 || r.returnHold > 0 || r.damaged > 0 || r.blocked,
    },
    {
      key: "expiry",
      label: "ใกล้/หมดอายุ",
      test: (r) => r.expDays !== null && r.expDays <= 90,
    },
    { key: "negative", label: "ติดลบ", test: (r) => r.available < 0 },
  ],

  filters: [
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => uniq(stockRows().map((r) => r.whLabel)),
      test: (r, v) => r.whLabel === v,
    },
    {
      id: "cat",
      label: "Product Category",
      options: () => uniq(stockRows().map((r) => r.cat)),
      test: (r, v) => r.cat === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(stockRows().map((r) => r.brand)),
      test: (r, v) => r.brand === v,
    },
    {
      id: "status",
      label: "Inventory Status",
      options: () => [...STOCK_STATUSES],
      test: (r, v) => r.status === v,
    },
    {
      id: "lot",
      label: "Lot",
      options: () => uniq(stockRows().map((r) => r.lot)),
      test: (r, v) => r.lot === v,
    },
    {
      id: "serial",
      label: "Serial",
      options: () => uniq(stockRows().map((r) => r.serial)).slice(0, 60),
      test: (r, v) => r.serial === v,
    },
    {
      id: "expiry",
      label: "Expiry",
      options: () => ["ภายใน 30 วัน", "ภายใน 60 วัน", "ภายใน 90 วัน", "หมดอายุแล้ว"],
      test: (r, v) => {
        if (r.expDays === null) return false;
        if (v === "หมดอายุแล้ว") return r.expDays < 0;
        const within = Number(v.replace(/\D/g, ""));
        return r.expDays >= 0 && r.expDays <= within;
      },
    },
    {
      id: "zone",
      label: "Location",
      options: () => uniq(stockRows().map((r) => r.zone)),
      test: (r, v) => r.zone === v,
    },
    {
      id: "bin",
      label: "Bin",
      options: () => uniq(stockRows().map((r) => r.bin)).slice(0, 60),
      test: (r, v) => r.bin === v,
    },
    {
      id: "availableOnly",
      label: "Available Only",
      options: yesNo,
      test: (r) => r.available > 0,
    },
    {
      id: "lowOnly",
      label: "Low Stock Only",
      options: yesNo,
      test: (r) => r.available <= r.rop,
    },
    {
      id: "nearExpiry",
      label: "Near Expiry",
      options: yesNo,
      test: (r) => r.expDays !== null && r.expDays >= 0 && r.expDays <= 90,
    },
    {
      id: "expired",
      label: "Expired",
      options: yesNo,
      test: (r) => r.expDays !== null && r.expDays < 0,
    },
    {
      id: "negative",
      label: "Negative Stock",
      options: yesNo,
      test: (r) => r.available < 0,
    },
  ],

  /**
   * Twenty-five columns. The dozen an operator reads at a glance open by
   * default; the rest wait behind Column Settings rather than forcing a
   * horizontal scroll on every visit.
   */
  columns: [
    {
      key: "icon",
      label: "",
      cell: (r) => <Thumb size={30}>{r.icon}</Thumb>,
    },
    {
      key: "product",
      label: "Product Code",
      sortable: true,
      locked: true,
      cell: (r) => <span className="font-semibold">{r.product}</span>,
    },
    {
      key: "productName",
      label: "Product Name",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.productName}</span>
          <span className="text-cap text-ink-3">{r.barcode}</span>
        </span>
      ),
    },
    {
      key: "cat",
      label: "Category",
      sortable: true,
      muted: true,
      defaultHidden: true,
      cell: (r) => r.cat,
    },
    {
      key: "brand",
      label: "Brand",
      sortable: true,
      muted: true,
      defaultHidden: true,
      cell: (r) => r.brand,
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
    { key: "zone", label: "Zone", sortable: true, muted: true, defaultHidden: true, cell: (r) => r.zone },
    { key: "rack", label: "Rack", muted: true, defaultHidden: true, cell: (r) => r.rack },
    { key: "bin", label: "Bin", sortable: true, muted: true, cell: (r) => r.bin },
    { key: "unit", label: "UOM", muted: true, cell: (r) => r.unit },
    {
      key: "onHand",
      label: "On Hand",
      align: "right",
      sortable: true,
      cell: (r) => fmt(r.onHand),
    },
    {
      key: "reserved",
      label: "Reserved",
      align: "right",
      sortable: true,
      muted: true,
      cell: (r) => fmt(r.reserved),
    },
    {
      key: "available",
      label: "Available",
      align: "right",
      sortable: true,
      cell: (r) => (
        <span
          className={
            availTone(r) === "danger"
              ? "font-semibold text-danger"
              : availTone(r) === "warning"
                ? "font-semibold text-warning"
                : "font-semibold"
          }
        >
          {fmt(r.available)}
        </span>
      ),
    },
    {
      key: "qcHold",
      label: "QC Hold",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.qcHold ? fmt(r.qcHold) : "—"),
    },
    {
      key: "returnHold",
      label: "Return Hold",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.returnHold ? fmt(r.returnHold) : "—"),
    },
    {
      key: "damaged",
      label: "Damaged",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.damaged ? fmt(r.damaged) : "—"),
    },
    {
      key: "inTransit",
      label: "In Transit",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.inTransit ? fmt(r.inTransit) : "—"),
    },
    {
      key: "onOrder",
      label: "On Order",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.onOrder ? fmt(r.onOrder) : "—"),
    },
    {
      key: "backOrder",
      label: "Back Order",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.backOrder ? fmt(r.backOrder) : "—"),
    },
    {
      key: "rop",
      label: "Reorder Point",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => fmt(r.rop),
    },
    {
      key: "safety",
      label: "Safety Stock",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => fmt(r.safety),
    },
    { key: "lot", label: "Lot Number", sortable: true, muted: true, cell: (r) => r.lot || "—" },
    {
      key: "serial",
      label: "Serial Number",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.serial || "—",
    },
    {
      key: "exp",
      label: "Expiry Date",
      sortable: true,
      sortValue: (r) => r.expDays ?? 99_999,
      cell: (r) =>
        r.exp ? (
          <span className="flex flex-col">
            <span>{r.exp}</span>
            <span className="text-cap text-ink-3">
              {r.expDays !== null && r.expDays < 0
                ? `เกิน ${Math.abs(r.expDays)} วัน`
                : `อีก ${r.expDays} วัน`}
            </span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      label: "Inventory Status",
      sortable: true,
      cell: (r) => <Badge tone={STOCK_TONE[r.status]}>{r.status}</Badge>,
    },
    {
      key: "updated",
      label: "Updated Time",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.updated,
    },
  ],

  secondaryActions: (ctx) => [
    {
      label: "Export Excel",
      icon: "upload",
      run: () =>
        ctx.toast(
          "ส่งออก Excel",
          `กำลังเตรียมไฟล์สต๊อก ${fmt(stockRows().length)} รายการ — Future support`,
          "info",
        ),
    },
    {
      label: "Print",
      icon: "printer",
      run: () => ctx.toast("สั่งพิมพ์", "เตรียมรายงานสต๊อกสำหรับพิมพ์ — Future support", "info"),
    },
  ],

  /** Twelve headline figures, each one a jump into the matching view. */
  hero: (ctx) => {
    const s = stockSummary();
    return {
      kpis: [
        {
          icon: "product",
          label: "Total Products",
          value: fmt(s.products),
          sub: `${fmt(s.positions)} ตำแหน่งจัดเก็บ`,
          goTab: "all",
        },
        {
          icon: "pricing",
          label: "Total Inventory Value",
          value: money0(s.value),
          sub: `ต้นทุนเฉลี่ย ${money(s.avgCost)}/หน่วย`,
          tone: "primary",
          run: () => ctx.toast("มูลค่าสต๊อก", "คำนวณจากต้นทุนเฉลี่ย × ยอดพร้อมขาย", "info"),
        },
        {
          icon: "checkCircle",
          label: "Available Stock",
          value: fmt(s.available),
          sub: `จาก On Hand ${fmt(s.onHand)}`,
          tone: "ok",
          goTab: "available",
        },
        {
          icon: "lock",
          label: "Reserved Stock",
          value: fmt(s.reserved),
          sub: "กันไว้ให้คำสั่งขาย",
          goTab: "all",
        },
        {
          icon: "shield",
          label: "QC Hold",
          value: fmt(s.qcHold),
          sub: "รอผลตรวจคุณภาพ",
          tone: "warn",
          goTab: "hold",
        },
        {
          icon: "return",
          label: "Return Hold",
          value: fmt(s.returnHold),
          sub: "ของคืนรอตรวจ",
          tone: "warn",
          goTab: "hold",
        },
        {
          icon: "trash",
          label: "Damaged Stock",
          value: fmt(s.damaged),
          sub: "แยกออกจากยอดพร้อมขาย",
          tone: "warn",
          goTab: "hold",
        },
        {
          icon: "calendar",
          label: "Near Expiry",
          value: fmt(s.nearExpiry),
          sub: "Lot ที่หมดอายุใน 90 วัน",
          tone: "warn",
          goTab: "expiry",
        },
        {
          icon: "clock",
          label: "Expired",
          value: fmt(s.expired),
          sub: "Lot ที่หมดอายุแล้ว",
          tone: "warn",
          goTab: "expiry",
        },
        {
          icon: "alert",
          label: "Low Stock",
          value: fmt(s.lowStock),
          sub: "SKU ต่ำกว่าจุดสั่งซื้อ",
          tone: "warn",
          goTab: "low",
        },
        {
          icon: "xCircle",
          label: "Negative Stock",
          value: fmt(s.negative),
          sub: "ตำแหน่งที่ยอดติดลบ",
          tone: "warn",
          goTab: "negative",
        },
        {
          icon: "sort",
          label: "Today's Movement",
          value: fmt(s.movementToday),
          sub: "เคลื่อนไหววันทำการล่าสุด",
          run: () => ctx.goto("/inventory"),
        },
      ],
    };
  },

  /**
   * The four panels the spec asks for. They read the FILTERED rows, so
   * narrowing the table narrows the summary with it.
   */
  panels: (rows, ctx): Block[] => {
    const t = stockTotals(rows);
    const low = lowStockProducts();
    const near = nearExpiryLots(90);
    const neg = negativePositions();

    return [
      {
        type: "cards",
        title: "Stock Summary",
        cols: 3,
        items: [
          { label: "Total On Hand", value: fmt(t.onHand) },
          { label: "Total Available", value: fmt(t.available), tone: "accent" },
          { label: "Reserved", value: fmt(t.reserved) },
          { label: "QC Hold", value: fmt(t.qcHold), tone: "warn" },
          { label: "Return Hold", value: fmt(t.returnHold), tone: "warn" },
          { label: "Damaged", value: fmt(t.damaged), tone: "warn" },
          { label: "Transit", value: fmt(t.inTransit) },
          { label: "Inventory Value", value: money0(t.value), tone: "accent" },
          { label: "Average Cost", value: money(t.avgCost), sub: "ต่อหน่วย" },
        ],
      },
      {
        type: "table",
        title: `Low Stock — ต่ำกว่าจุดสั่งซื้อ (${low.length})`,
        rows: low,
        empty: "ไม่มีสินค้าต่ำกว่าจุดสั่งซื้อ",
        cols: [
          {
            key: "name",
            label: "Product",
            cell: (r) => (
              <button
                onClick={() => ctx.openEntity("product", r.code)}
                className="text-left font-semibold hover:text-primary"
              >
                {r.name}
                <span className="ml-2 font-normal text-ink-3">{r.code}</span>
              </button>
            ),
          },
          { key: "available", label: "Available", align: "right", cell: (r) => fmt(r.available) },
          { key: "rop", label: "Reorder Point", align: "right", muted: true, cell: (r) => fmt(r.rop) },
          { key: "safety", label: "Safety Stock", align: "right", muted: true, cell: (r) => fmt(r.safety) },
          { key: "onOrder", label: "On Order", align: "right", muted: true, cell: (r) => fmt(r.onOrder) },
          {
            key: "gap",
            label: "ต้องเติม",
            align: "right",
            cell: (r) => <Badge tone="warning">{fmt(Math.max(0, r.gap))}</Badge>,
          },
        ],
      },
      {
        type: "table",
        title: `Near Expiry — 30 / 60 / 90 วัน (${near.length})`,
        rows: near,
        empty: "ไม่มี Lot ที่ใกล้หมดอายุภายใน 90 วัน",
        cols: [
          { key: "lot", label: "Lot", cell: (r) => <span className="font-semibold">{r.lot}</span> },
          { key: "productName", label: "Product", muted: true, cell: (r) => r.productName },
          { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
          { key: "exp", label: "Expiry", muted: true, cell: (r) => r.exp },
          {
            key: "days",
            label: "เหลือ",
            align: "right",
            cell: (r) => (
              <Badge tone={r.days <= 30 ? "danger" : r.days <= 60 ? "warning" : "info"}>
                {r.days} วัน
              </Badge>
            ),
          },
        ],
      },
      {
        type: "table",
        title: `Negative Inventory (${neg.length})`,
        rows: neg,
        empty: "ไม่มีตำแหน่งที่ยอดติดลบ",
        cols: [
          { key: "product", label: "Product", cell: (r) => <span className="font-semibold">{r.product}</span> },
          { key: "whLabel", label: "Warehouse", muted: true, cell: (r) => r.whLabel },
          { key: "bin", label: "Bin", muted: true, cell: (r) => r.bin },
          { key: "onHand", label: "On Hand", align: "right", muted: true, cell: (r) => fmt(r.onHand) },
          {
            key: "available",
            label: "Available",
            align: "right",
            cell: (r) => <Badge tone="danger">{fmt(r.available)}</Badge>,
          },
        ],
      },
    ];
  },

  rowActions: (rec, ctx) => [
    {
      label: "ดูรายละเอียดสต๊อก",
      icon: "eye",
      run: () => ctx.openEntity("stock-inquiry", rec.code),
    },
    {
      label: "เปิดข้อมูลสินค้า",
      icon: "product",
      run: () => ctx.openEntity("product", rec.product),
    },
    {
      label: "เปิดคลังสินค้า",
      icon: "warehouse",
      run: () => ctx.openEntity("warehouse", rec.warehouse),
    },
    {
      label: "ดูความเคลื่อนไหว",
      icon: "sort",
      run: () => ctx.goto("/soon?m=Stock%20Card"),
    },
  ],
};

/* ---------- Drawer / detail ---------- */

const detail: DetailSchema<StockRow> = {
  key: "stock-inquiry",
  entityLabel: "Stock Position",

  identity: (r) => ({
    image: <Thumb size={44}>{r.icon}</Thumb>,
    code: r.product,
    title: r.productName,
    copyFields: [
      { label: "Product Code", value: r.product },
      { label: "Barcode", value: r.barcode },
      ...(r.lot ? [{ label: "Lot", value: r.lot }] : []),
      ...(r.serial ? [{ label: "Serial", value: r.serial }] : []),
    ],
    badges: [{ text: r.status, tone: STOCK_TONE[r.status] }],
    tags: [r.whLabel, `${r.zone}-${r.rack}-${r.bin}`, r.cat, r.brand],
  }),

  kpis: (r) => {
    const t = productTotals(r.product);
    return [
      { icon: "warehouse", label: "Warehouse", value: r.warehouse, sub: r.whName },
      {
        icon: "checkCircle",
        label: "Available",
        value: fmt(r.available),
        sub: `รวมทุกคลัง ${fmt(t.available)}`,
        goTab: "warehouse",
      },
      {
        icon: "lock",
        label: "Reserved",
        value: fmt(r.reserved),
        sub: "กดเพื่อดูคำสั่งขาย",
        goTab: "reservations",
      },
      {
        icon: "cart",
        label: "Incoming",
        value: fmt(t.onOrder),
        sub: "กดเพื่อดูใบสั่งซื้อ",
        goTab: "incoming",
      },
    ];
  },

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => {
        const p = getProduct(r.product);
        const t = productTotals(r.product);
        return [
          {
            type: "fields",
            title: "ข้อมูลสินค้า",
            cols: 2,
            items: [
              { label: "Product Code", value: r.product },
              { label: "Barcode", value: r.barcode },
              { label: "Product Name", value: r.productName },
              { label: "Category", value: r.cat },
              { label: "Brand", value: r.brand },
              { label: "UOM", value: r.unit },
              { label: "Description", value: p?.desc || "—", span: true },
            ],
          },
          {
            type: "cards",
            title: "ยอดคงเหลือรวมทุกคลัง",
            cols: 4,
            items: [
              { label: "Available", value: fmt(t.available), tone: "accent" },
              { label: "Reserved", value: fmt(t.reserved) },
              { label: "QC Hold", value: fmt(t.qcHold), tone: "warn" },
              { label: "Return Hold", value: fmt(t.returnHold), tone: "warn" },
              { label: "Damaged", value: fmt(t.damaged), tone: "warn" },
              { label: "Reorder Point", value: fmt(r.rop) },
              { label: "Safety Stock", value: fmt(r.safety) },
              { label: "Inventory Value", value: money0(t.value), tone: "accent" },
            ],
          },
          {
            type: "fields",
            title: "ตำแหน่งจัดเก็บของแถวนี้",
            cols: 2,
            items: [
              { label: "Warehouse", value: r.whLabel },
              { label: "Zone / Rack / Bin", value: `${r.zone} / ${r.rack} / ${r.bin}` },
              { label: "Lot", value: r.lot || "—" },
              { label: "Serial", value: r.serial || "—" },
              { label: "Expiry Date", value: r.exp || "—" },
              { label: "Updated", value: r.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "warehouse",
      label: "Warehouse",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "ยอดคงเหลือแยกตามคลัง",
          rows: productByWarehouse(r.product),
          empty: "ไม่มีสต๊อกในคลังใด",
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
            { key: "available", label: "Available", align: "right", cell: (w) => fmt(w.available) },
            { key: "reserved", label: "Reserved", align: "right", muted: true, cell: (w) => fmt(w.reserved) },
            { key: "qcHold", label: "QC Hold", align: "right", muted: true, cell: (w) => fmt(w.qcHold) },
            { key: "returnHold", label: "Return Hold", align: "right", muted: true, cell: (w) => fmt(w.returnHold) },
            { key: "transit", label: "Transit", align: "right", muted: true, cell: (w) => fmt(w.transit) },
            { key: "total", label: "Total", align: "right", cell: (w) => <span className="font-semibold">{fmt(w.total)}</span> },
          ],
        },
      ],
    },

    {
      key: "lot",
      label: "Lot",
      when: (r) => !r.serial,
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Lot ของสินค้านี้",
          rows: productLots(r.product),
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
            { key: "qty", label: "Qty", align: "right", cell: (l) => fmt(l.qty) },
            { key: "mfg", label: "Manufacture Date", muted: true, cell: (l) => l.mfg },
            { key: "exp", label: "Expiry Date", muted: true, cell: (l) => l.exp },
            {
              key: "status",
              label: "Status",
              cell: (l) => (
                <Badge
                  tone={
                    (l.days ?? 0) < 0
                      ? "danger"
                      : (l.days ?? 0) <= 90
                        ? "warning"
                        : l.status === "Quarantine"
                          ? "neutral"
                          : "success"
                  }
                >
                  {(l.days ?? 0) < 0
                    ? "Expired"
                    : (l.days ?? 0) <= 90
                      ? "Near Expiry"
                      : l.status}
                </Badge>
              ),
            },
          ],
        },
      ],
    },

    {
      key: "serial",
      label: "Serial",
      when: (r) => Boolean(r.serial),
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Serial ของสินค้านี้",
          rows: productSerials(r.product),
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
            { key: "warehouse", label: "Warehouse", muted: true, cell: (s) => s.warehouse },
            { key: "location", label: "Location", muted: true, cell: (s) => s.location },
            {
              key: "status",
              label: "Current Status",
              cell: (s) => (
                <Badge
                  tone={
                    s.status === "In Stock"
                      ? "success"
                      : s.status === "Reserved"
                        ? "info"
                        : s.status === "Returned"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {s.status}
                </Badge>
              ),
            },
            {
              key: "doc",
              label: "Current Document",
              muted: true,
              cell: (s) => s.doc || "—",
            },
          ],
        },
      ],
    },

    {
      key: "reservations",
      label: "Reservations",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "สต๊อกที่ถูกจองไว้",
          rows: productReservations(r.product),
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
            {
              key: "status",
              label: "Status",
              cell: (v) => (
                <Badge tone={v.status === "Completed" ? "success" : "info"}>{v.status}</Badge>
              ),
            },
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
          rows: productIncoming(r.product),
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
              cell: (v) => (
                <Badge tone={v.documented ? "info" : "neutral"}>{v.status}</Badge>
              ),
            },
          ],
        },
      ],
    },

    {
      key: "movement",
      label: "Recent Movement",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "ความเคลื่อนไหวล่าสุด 20 รายการ",
          rows: stockMovements(r.product, 20),
          empty: "ยังไม่มีความเคลื่อนไหวของสินค้านี้",
          cols: [
            { key: "when", label: "Time", muted: true, cell: (m) => m.when },
            {
              key: "doc",
              label: "Document",
              cell: (m) => (
                <button
                  onClick={() => ctx.openEntity(m.entity, m.doc)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {m.doc}
                </button>
              ),
            },
            { key: "kind", label: "Type", muted: true, cell: (m) => m.kind },
            {
              key: "qty",
              label: "Qty",
              align: "right",
              cell: (m) => (
                <Badge
                  tone={m.dir === "In" ? "success" : m.dir === "Out" ? "info" : "warning"}
                >
                  {m.dir === "In" ? "+" : m.dir === "Out" ? "−" : "±"}
                  {fmt(m.qty)}
                </Badge>
              ),
            },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (m) => m.warehouse || "—" },
            { key: "user", label: "User", muted: true, cell: (m) => m.user || "—" },
            { key: "status", label: "Status", muted: true, cell: (m) => m.status },
          ],
        },
        {
          type: "audit",
          title: "Audit Trail",
          items: stockMovements(r.product, 6).map((m) => ({
            event: `${m.kind} — ${m.doc}`,
            user: m.user || "system",
            when: m.when,
            kind: m.dir === "In" ? "primary" : m.dir === "Out" ? "info" : "warn",
          })),
        },
      ],
      aside: (r) => {
        const t = productTotals(r.product);
        return {
          rows: [
            { icon: "box", label: "On Hand", value: fmt(t.onHand) },
            { icon: "checkCircle", label: "Available", value: fmt(t.available) },
            { icon: "lock", label: "Reserved", value: fmt(t.reserved), muted: true },
            { icon: "shield", label: "QC Hold", value: fmt(t.qcHold), muted: true },
            { icon: "return", label: "Return Hold", value: fmt(t.returnHold), muted: true },
            { icon: "truck", label: "In Transit", value: fmt(t.inTransit), muted: true },
            { icon: "pricing", label: "Inventory Value", value: money0(t.value) },
            { icon: "warehouse", label: "Warehouses", value: fmt(productByWarehouse(r.product).length), muted: true },
          ],
        };
      },
    },
  ],

  actions: (rec, ctx) => [
    {
      label: "เปิดข้อมูลสินค้า",
      icon: "product",
      run: () => ctx.openEntity("product", rec.product),
    },
    {
      label: "เปิดคลังสินค้า",
      icon: "warehouse",
      run: () => ctx.openEntity("warehouse", rec.warehouse),
    },
  ],
};

export const stockInquirySchemas: EntitySchemas<StockRow> = { list, detail };
