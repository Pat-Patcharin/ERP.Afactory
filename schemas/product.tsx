import {
  PRODUCTS,
  getProduct,
  isStocked,
  productStock,
  stockStatus,
  type ProductRow,
} from "@/lib/domain/product";
import {
  productGoodsReceipts,
  productPurchaseByYear,
  productPurchaseKpi,
  productPurchaseOrders,
} from "@/lib/domain/product-analytics";
import { REG_TONE, STATUS_TONE, tone } from "@/lib/badges";
import { DASH, daysUntil, fmt, money } from "@/lib/format";
import { checkPermission } from "@/lib/permissions";
import type { BadgeTone, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, Barcode, LinkButton } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { PRODUCT_FORM } from "./forms/product";

/* ============================================================
   PRODUCT — the reference implementation. Every other master
   follows this exact three-part shape: list, detail, form.
   ============================================================ */

const regBadge = (status: string) => (
  <Badge tone={tone(REG_TONE, status)}>{status}</Badge>
);

/**
 * Warehouse rows store code and name as one string ("WH-01 Samut Prakan"),
 * which is how the documents carry it. Split on the first space so the two
 * can be columns; a warehouse with no name keeps the whole string as its code
 * rather than losing it.
 */
export function splitWarehouse(wh: string): { code: string; name: string } {
  const m = String(wh ?? "").trim().match(/^(\S+)\s+(.*)$/);
  return m ? { code: m[1], name: m[2] } : { code: String(wh ?? ""), name: "" };
}

/* ---------- LIST ---------- */

export const PRODUCT_LIST: ListSchema<ProductRow> = {
  key: "product",
  entity: "Product",
  entityPlural: "Products",
  title: "Product Master",
  subtitle:
    "จัดการข้อมูลสินค้า หน่วยนับ ราคา ผู้ขายสินค้า และข้อมูลคลังสินค้า",
  crumb: "Product",
  primaryLabel: "Create Product",
  searchPlaceholder: "ค้นหารหัสสินค้า ชื่อ หรือบาร์โค้ด...",
  emptyTitle: "ไม่พบสินค้าที่ตรงกับเงื่อนไข",

  source: () => PRODUCTS,
  searchFields: ["code", "name", "nameTh", "barcode"],

  tabs: [
    { key: "all", label: "All" },
    { key: "Active", label: "Active", test: (p) => p.status === "Active" },
    {
      key: "Low",
      label: "Low Stock",
      /* Only what the warehouse actually holds. A catalogue product has no
         stock record at all, and calling that "low" would bury the handful
         of items genuinely running out. */
      test: (p) => isStocked(p) && p.availTotal <= p.lowLevel,
    },
    {
      key: "Draft",
      label: "Draft",
      /* Where the blocked price rows land: no cost, no price, or a GP the
         private tier cannot reach. */
      test: (p) => p.status === "Draft",
    },
    { key: "Inactive", label: "Inactive", test: (p) => p.status === "Inactive" },
  ],

  filters: [
    {
      id: "cat",
      label: "Category",
      options: () => [...new Set(PRODUCTS.map((p) => p.cat))],
      test: (p, v) => p.cat === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => [...new Set(PRODUCTS.map((p) => p.brand))],
      test: (p, v) => p.brand === v,
    },
    {
      id: "status",
      label: "Status",
      options: () => ["Active", "Draft", "Inactive"],
      test: (p, v) => p.status === v,
    },
  ],

  columns: [
    {
      /* No thumbnail: the image is decorative at list scale and the code is
         what a user scans for. It still identifies the record on the detail
         page, where there is room for it. */
      key: "code",
      label: "Product Code",
      sortable: true,
      cell: (p) =>
        p.priceRef?.codePending ? (
          /* 51 price rows carry no code. The key shown is the price row's
             own, which is why it must not look like a product code. */
          <span className="flex items-center gap-2">
            <span className="tnum text-ink-2">{p.code}</span>
            <Badge tone="warning">รอรหัส</Badge>
          </span>
        ) : (
          <span className="font-medium tnum">{p.code}</span>
        ),
    },
    { key: "name", label: "Product Name", sortable: true, cell: (p) => p.name },
    { key: "cat", label: "Category", muted: true, cell: (p) => p.cat },
    { key: "brand", label: "Brand", muted: true, cell: (p) => p.brand },
    { key: "unit", label: "Base Unit", muted: true, cell: (p) => p.unit },
    {
      key: "price",
      label: "Selling Price",
      sortable: true,
      align: "right",
      cell: (p) => money(p.price),
    },
    {
      key: "stock",
      label: "Available Stock",
      sortable: true,
      align: "right",
      sortValue: (p) => (isStocked(p) ? p.availTotal : -1),
      cell: (p) =>
        !isStocked(p) ? (
          <span className="text-ink-3" title="ยังไม่มีระเบียนสต๊อกในคลัง">
            {DASH}
          </span>
        ) : (
          <span className={p.availTotal <= p.lowLevel ? "font-semibold text-danger" : ""}>
            {fmt(p.availTotal)}
          </span>
        ),
    },
    {
      key: "status",
      label: "Status",
      cell: (p) => <Badge tone={tone(STATUS_TONE, p.status)}>{p.status}</Badge>,
    },
  ],

  rowActions: (p, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("product", r.code) },
    {
      label: "Edit",
      icon: "edit",
      run: (r) => ctx.goto(`/m/product/${r.code}/edit`),
    },
    {
      label: "Duplicate",
      icon: "copy",
      run: (r) => ctx.toast("ทำสำเนาสินค้า", `${r.code} — Future support`, "info"),
    },
    { sep: true },
    {
      label: "Open Full Detail",
      icon: "external",
      run: (r) => ctx.goto(`/m/product/${r.code}`),
    },
    {
      label: "History",
      icon: "clock",
      run: (r) => ctx.goto(`/m/product/${r.code}?tab=history`),
    },
    { sep: true },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      run: (r) =>
        ctx.confirm({
          title: "Delete this product?",
          message: (
            <>
              <strong>{r.code}</strong> — {r.name}{" "}
              จะถูกลบออกจาก Product Master การกระทำนี้ย้อนกลับไม่ได้
            </>
          ),
          confirmText: "Delete product",
          onConfirm: () =>
            ctx.toast("ลบสินค้าแล้ว", `${r.code} — Future support`, "danger"),
        }),
    },
  ],
};

/* ---------- DETAIL ---------- */

export const PRODUCT_DETAIL: DetailSchema<ProductRow> = {
  key: "product",
  entityLabel: "Product",

  identity: (p) => ({
    image: p.icon,
    code: p.code,
    title: p.name,
    copyFields: [
      { label: "Product code", value: p.code },
      { label: "Barcode", value: p.barcode },
    ],
    badges: [
      { text: p.status, tone: tone(STATUS_TONE, p.status) },
      ...(p.demo ? ([{ text: "Demo", tone: "info" }] as const) : []),
      ...(isStocked(p) && p.availTotal <= p.lowLevel
        ? ([{ text: "Low stock", tone: "warning" }] as const)
        : []),
      ...(p.priceRef?.codePending
        ? ([{ text: "รอรหัสสินค้า", tone: "warning" }] as const)
        : []),
    ],
    tags: [p.cat, p.brand, p.series],
  }),

  /* Four compact KPI cards. Each jumps to its related tab. */
  kpis: (p) => [
    {
      icon: "box",
      label: "Available Stock",
      value: isStocked(p) ? fmt(p.availTotal) : DASH,
      sub: isStocked(p) ? p.unit : "ยังไม่มีระเบียนสต๊อก",
      goTab: "warehouse",
    },
    {
      icon: "layers",
      label: "Stock on Hand",
      value: fmt(p.onHandTotal),
      sub: p.unit,
      goTab: "warehouse",
    },
    {
      icon: "tag",
      label: "Standard Selling Price",
      value: money(p.price),
      sub: p.pricing.currency,
      goTab: "price",
    },
    {
      icon: "truck",
      label: "Main Supplier",
      value: p.supplier,
      sub: p.sup.code,
      wide: true,
      goTab: "supplier",
    },
  ],

  tabs: [
    /* ---------- 1. OVERVIEW ---------- */
    {
      key: "overview",
      label: "Overview",
      aside: (p) => {
        const reg = p.detail.regRows[0];
        const mainWh = p.detail.whRows.length
          ? [...p.detail.whRows].sort((a, b) => b.onHand - a.onHand)[0].wh
          : null;

        return {
          top: (
            <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-card p-5 shadow-xs">
              <div className="grid h-[150px] w-full place-items-center rounded-btn border border-line bg-surface text-[56px]">
                {p.icon}
              </div>
              <Badge tone={tone(STATUS_TONE, p.status)}>{p.status}</Badge>
            </div>
          ),
          rows: [
            reg
              ? { icon: "shield", label: "Registration", value: regBadge(reg.status) }
              : {
                  icon: "shield",
                  label: "Registration",
                  value: "ยังไม่ขึ้นทะเบียน",
                  muted: true,
                },
            /* Expiry lives on the Registration & Warranty tab, which is where
               someone acting on it is already looking. The rail carries the
               facts a reader needs on every tab, not the ones one tab owns. */
            {
              icon: "box",
              label: "Main Warehouse",
              value: mainWh ?? "ยังไม่กำหนดคลัง",
              muted: !mainWh,
            },
            {
              icon: "truck",
              label: "Main Supplier",
              value: p.supplier || "ยังไม่กำหนด",
              muted: !p.supplier,
            },
            { icon: "layers", label: "Base Unit", value: p.unit },
            { icon: "clock", label: "Last Updated", value: p.updated, muted: true },
          ],
          bottom: (
            <div className="rounded-card border border-line bg-card px-5 py-4 shadow-xs">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                Barcode
              </p>
              <Barcode code={p.barcode} />
            </div>
          ),
        };
      },
      blocks: (p) => {
        const c = p.detail.cls;
        return [
          {
            type: "fields",
            title: "General Information",
            cols: 2,
            items: [
              { label: "Product Code", value: p.code },
              { label: "Brand", value: p.brand },
              { label: "ชื่อภาษาไทย", value: p.nameTh },
              { label: "Series", value: p.series },
              { label: "English Name", value: p.nameEn },
              {
                label: "Status",
                value: <Badge tone={tone(STATUS_TONE, p.status)}>{p.status}</Badge>,
              },
              { label: "Category", value: p.cat },
              { label: "Demo Product", value: p.demo ? "Yes" : "No", muted: !p.demo },
              { label: "Description", value: p.desc, span: true },
            ],
          },
          {
            type: "fields",
            title: "Product Classification",
            cols: 2,
            items: [
              { label: "Product Type", value: c.ptype },
              { label: "Medical Device Class", value: c.devClass },
              { label: "Storage Condition", value: c.storage },
              { label: "Country of Origin", value: c.origin },
              { label: "Manufacturer", value: c.maker },
            ],
          },
          /* ---- Units & Barcode, folded in from the tab it used to own.
             A base unit and a barcode are things a reader wants while they
             are still reading the header, not after a tab switch. ---- */
          {
            type: "cards",
            title: "Base Unit",
            cols: 3,
            items: [
              { label: "Base Unit", value: p.unit, tone: "accent" },
              { label: "Weight", value: p.weight },
              { label: "Dimension", value: p.dim },
            ],
          },
          {
            type: "table",
            title: "Alternative Units",
            rows: p.detail.units,
            empty: "มีเฉพาะหน่วยนับหลัก",
            cols: [
              { key: "unit", label: "Unit" },
              { key: "type", label: "Unit Type", muted: true },
              { key: "conv", label: "Conversion" },
              {
                key: "barcode",
                label: "Barcode",
                cell: (r) => <span className="tnum">{r.barcode}</span>,
              },
              {
                key: "active",
                label: "Active",
                cell: (r) => (
                  <Badge tone={r.active ? "success" : "neutral"}>
                    {r.active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
            ],
          },
          {
            type: "fields",
            title: "Identification",
            cols: 2,
            items: [
              {
                label: "Primary Barcode",
                value: <span className="tnum">{p.barcode}</span>,
              },
              { label: "QR Code", value: <span className="tnum">{p.barcode}</span> },
            ],
          },
          {
            type: "planned",
            title: "RFID",
            label: "RFID Tagging",
            message: "Planned for future phase — ยังไม่เปิดใช้งานในระยะนี้",
          },
        ];
      },
    },


    /* ---------- 3. PRICE ---------- */
    {
      key: "price",
      label: "Price",
      blocks: (p) => {
        const c = p.pricing;
        const d = p.detail;
        const canCost = checkPermission("canViewCost");
        return [
          {
            type: "cards",
            title: "Price Summary",
            items: [
              {
                label: "Standard Selling Price",
                value: money(p.price),
                unit: c.currency,
                tone: "accent",
              },
              canCost
                ? {
                    label: "Latest Purchase Price",
                    value: money(c.lastCost),
                    unit: c.currency,
                  }
                : {
                    label: "Latest Purchase Price",
                    value: "••••",
                    sub: "Restricted",
                    tone: "locked",
                  },
              canCost
                ? {
                    label: "Moving Average Cost",
                    value: money(c.avgCost),
                    unit: c.currency,
                  }
                : {
                    label: "Moving Average Cost",
                    value: "••••",
                    sub: "Restricted",
                    tone: "locked",
                  },
              { label: "Currency", value: c.currency },
            ],
          },
          !canCost && { type: "restricted" },

          /* ---- The four tiers, for products the price file priced ---- */
          p.priceRef && {
            type: "cards",
            title: "ราคา 4 ชั้น — จาก Price List Master",
            cols: 4,
            items: [
              { label: "ราคาราชการ", value: money(c.gov), unit: c.currency },
              {
                label: "ราคาเอกชน",
                value: money(c.retail),
                unit: c.currency,
                sub: "ราคาแคตตาล็อก",
                tone: "accent",
              },
              { label: "ราคา Dealer", value: money(c.dealer), unit: c.currency },
              {
                /* Not a fourth price a customer can be sold at — the line the
                   quote needs approval to cross. */
                label: "Last Price — เพดานล่าง",
                value: p.priceRef.floor === null ? DASH : money(p.priceRef.floor),
                sub: "ต่ำกว่านี้ต้องขออนุมัติ",
                tone: "warn",
              },
            ],
          },
          p.priceRef && {
            type: "note",
            text: `ทุกช่องเป็นราคาก่อน VAT · GP คิดจากราคาขายตรง ๆ ไม่หาร 1.07 · แถวต้นทางคือ ${p.priceRef.row} จากชีต ${p.priceRef.sheet}`,
          },
          p.priceRef &&
            !p.priceRef.sellable && {
              type: "alert",
              tone: p.priceRef.priceStatus === "PENDING_COST" ? "danger" : "warn",
              title: `สถานะราคา: ${p.priceRef.priceStatus} — ยังขายไม่ได้`,
              message: p.desc || "ราคายังไม่ครบทั้ง 4 ชั้น",
            },
          p.priceRef &&
            p.priceRef.conflicts.length > 0 && {
              type: "alert",
              /* Two products sharing a code is a data fault someone has to fix;
                 the same product entered twice is only untidy. */
              tone: p.priceRef.conflictClash ? "danger" : "warn",
              title: p.priceRef.conflictClash
                ? `รหัสนี้ถูกใช้กับสินค้าคนละตัว ${p.priceRef.conflicts.length + 1} รายการ`
                : `รหัสนี้มีแถวซ้ำในไฟล์ราคา ${p.priceRef.conflicts.length + 1} แถว`,
              message: `ระบบใช้แถว ${p.priceRef.row} เป็นสินค้านี้ และพักแถว ${p.priceRef.conflicts.join(", ")} ไว้ ${
                p.priceRef.conflictClash
                  ? "— ต้องแยกรหัสที่ไฟล์ต้นทางก่อนนำไปใช้ขาย"
                  : "— ชื่อสินค้าตรงกัน จึงถือเป็นรายการเดียว"
              }`,
            },
          {
            type: "table",
            title: "Price Lists",
            rows: d.priceLists,
            empty: "ยังไม่มีรายการราคา",
            cols: [
              { key: "name", label: "Price List" },
              { key: "price", label: "Price", align: "right", cell: (r) => money(r.price) },
              { key: "cur", label: "Currency", muted: true },
              { key: "from", label: "Effective Date", muted: true },
              { key: "to", label: "Expiry Date", muted: true },
              {
                key: "status",
                label: "Status",
                cell: (r) => (
                  <Badge tone={r.status === "Active" ? "success" : "neutral"}>
                    {r.status}
                  </Badge>
                ),
              },
            ],
          },
          {
            type: "table",
            title: "Tier Price",
            rows: d.tiers,
            empty: "ไม่มีราคาขั้นบันได",
            cols: [
              {
                key: "min",
                label: "Minimum Qty",
                align: "right",
                cell: (r) => fmt(r.min),
              },
              {
                key: "max",
                label: "Maximum Qty",
                align: "right",
                cell: (r) => (r.max === null ? "ไม่จำกัด" : fmt(r.max)),
              },
              {
                key: "price",
                label: "Unit Price",
                align: "right",
                cell: (r) => money(r.price),
              },
            ],
          },
          {
            type: "table",
            title: "Contract & Exception Price",
            rows: d.contracts,
            empty: "ไม่มีสัญญาราคาพิเศษ",
            cols: [
              { key: "cust", label: "Customer" },
              {
                key: "type",
                label: "Price Type",
                cell: (r) => (
                  <Badge tone={r.type === "Contract" ? "info" : "neutral"}>{r.type}</Badge>
                ),
              },
              { key: "price", label: "Price", align: "right", cell: (r) => money(r.price) },
              { key: "from", label: "Start Date", muted: true },
              { key: "to", label: "End Date", muted: true },
              {
                key: "status",
                label: "Status",
                cell: (r) => (
                  <Badge tone={r.status === "Active" ? "success" : "neutral"}>
                    {r.status}
                  </Badge>
                ),
              },
            ],
          },
          {
            type: "fields",
            title: "Tax",
            cols: 2,
            items: [
              { label: "VAT", value: c.vat },
              { label: "Price Effective Date", value: c.effective || DASH },
            ],
          },
        ];
      },
    },

    /* ---------- 4. WAREHOUSE & STOCK ---------- */
    {
      key: "warehouse",
      label: "Warehouse & Stock",
      blocks: (p, ctx) => {
        const d = p.detail;
        const isLow = p.availTotal <= p.lowLevel;
        const noWh = d.whRows.every((r) => r.onHand === 0 && r.res === 0);

        const status = stockStatus(p.onHandTotal, p.resTotal, p.lowLevel);

        /* A table, not cards: these are one measure each of the same
           quantity, and a column of figures compares far better than a
           grid of tiles. Available and Stock Status are the two lines a
           reader is actually looking for, so both carry emphasis. */
        const summaryRows: {
          metric: string;
          qty: number;
          note: string;
          strong?: boolean;
          badge?: { text: string; tone: BadgeTone };
        }[] = [
          { metric: "Stock on Hand", qty: p.onHandTotal, note: "ยอดคงเหลือทั้งหมดทุกคลัง" },
          { metric: "Reserved", qty: p.resTotal, note: "ถูกจองไว้กับเอกสารขาย" },
          { metric: "Back Order", qty: p.backOrder, note: "ค้างส่งลูกค้า" },
          { metric: "On Order", qty: p.onOrderTotal, note: "อยู่ระหว่างสั่งซื้อ" },
          {
            metric: "Available",
            qty: p.availTotal,
            note: "On Hand − Reserved",
            strong: true,
          },
          { metric: "Reorder Point", qty: p.lowLevel, note: "จุดสั่งซื้อ" },
          { metric: "Stock Status", qty: 0, note: "เทียบ Available กับจุดสั่งซื้อ", badge: status },
        ];

        return [
          {
            type: "table",
            title: "Stock Summary",
            rows: summaryRows,
            empty: "",
            cols: [
              {
                key: "metric",
                label: "Measure",
                cell: (r) => (r.strong ? <strong>{r.metric}</strong> : r.metric),
              },
              {
                key: "qty",
                label: "Quantity",
                align: "right",
                cell: (r) =>
                  r.badge ? (
                    <Badge tone={r.badge.tone}>{r.badge.text}</Badge>
                  ) : (
                    <span className={r.strong ? "font-semibold" : undefined}>
                      {fmt(r.qty)} {p.unit}
                    </span>
                  ),
              },
              { key: "note", label: "หมายเหตุ", muted: true },
            ],
          },
          isLow && {
            type: "alert",
            tone: "warn",
            title: "สต๊อกต่ำกว่าจุดสั่งซื้อ",
            message: `Available ${fmt(p.availTotal)} ${p.unit} ต่ำกว่าจุดสั่งซื้อ ${fmt(
              p.lowLevel,
            )} ${p.unit} — ควรเปิด Purchase Request`,
          },
          noWh && {
            type: "alert",
            tone: "warn",
            title: "ยังไม่มีการกำหนดคลังสินค้า",
            message:
              "สินค้านี้ยังไม่ถูกผูกเข้ากับคลังใด — ติดต่อฝ่ายคลังสินค้าเพื่อกำหนดคำแหน่งจัดเก็บ",
          },
          {
            /* Where the stock physically sits, and how much. The reserved /
               available / reorder breakdown is a company-wide question and
               is answered once by Stock Summary above — repeating it per
               warehouse made an eight-column table nobody read across. */
            type: "table",
            title: "Stock by Warehouse",
            rows: d.whRows,
            empty: "ยังไม่มีการกำหนดคลังสินค้า",
            cols: [
              {
                key: "code",
                label: "Warehouse Code",
                cell: (r) => <span className="font-medium">{splitWarehouse(r.wh).code}</span>,
              },
              {
                key: "name",
                label: "Warehouse Name",
                cell: (r) => splitWarehouse(r.wh).name || DASH,
              },
              { key: "loc", label: "Location", muted: true },
              {
                key: "onHand",
                label: "Quantity",
                align: "right",
                cell: (r) => (
                  <span className="font-medium">
                    {fmt(r.onHand)} {p.unit}
                  </span>
                ),
              },
            ],
          },
          d.lotTracked
            ? {
                type: "table",
                title: "Lot Tracking",
                rows: d.lots,
                empty: "ยังไม่มีข้อมูล Lot",
                cols: [
                  { key: "lot", label: "Lot Number" },
                  {
                    key: "exp",
                    label: "Expiry Date",
                    cell: (r) => {
                      const dd = daysUntil(r.exp);
                      return dd !== null && dd < 180 ? (
                        <span className="font-semibold text-warning-text">{r.exp}</span>
                      ) : (
                        r.exp
                      );
                    },
                  },
                  { key: "wh", label: "Warehouse", muted: true },
                  { key: "loc", label: "Location", muted: true },
                  { key: "qty", label: "Quantity", align: "right", cell: (r) => fmt(r.qty) },
                  {
                    key: "status",
                    label: "Status",
                    cell: (r) => (
                      <Badge tone={r.status === "Near Expiry" ? "warning" : "success"}>
                        {r.status}
                      </Badge>
                    ),
                  },
                ],
              }
            : {
                type: "planned",
                title: "Lot Tracking",
                label: "Lot / Serial Tracking",
                message: "สินค้านี้ไม่เปิดใช้การติดตาม Lot",
              },
          d.serialTracked && {
            type: "table",
            title: "Serial Tracking",
            rows: d.serials,
            empty: "ยังไม่มีข้อมูล Serial",
            cols: [
              { key: "sn", label: "Serial Number" },
              { key: "wh", label: "Warehouse", muted: true },
              { key: "loc", label: "Location", muted: true },
              { key: "ref", label: "Receipt Reference", muted: true },
              { key: "status", label: "Status" },
            ],
          },
        ];
      },
    },

    /* ---------- 5. SUPPLIER ---------- */
    {
      key: "supplier",
      label: "Supplier",
      blocks: (p, ctx) => {
        const s = p.sup;
        const d = p.detail;
        const canCost = checkPermission("canViewCost");

        if (!p.supplier)
          return [
            {
              type: "alert",
              tone: "warn",
              title: "ยังไม่ได้กำหนดผู้ขายสินค้า",
              message:
                "สินค้านี้ยังไม่มีผู้ขายสินค้าหลัก — ไม่สามารถเปิด Purchase Request ได้จนกว่าจะกำหนด",
            },
          ];

        return [
          {
            type: "entity",
            title: "Main Supplier",
            items: [
              {
                name: p.supplier,
                sub: `${s.code} · ${s.country}`,
                end: <Badge tone="info">Main Supplier</Badge>,
                onClick: () =>
                  ctx.toast("ผู้ขายสินค้า", `${p.supplier} — Future support`, "info"),
              },
            ],
          },
          {
            type: "fields",
            title: "Purchase Terms",
            cols: 2,
            items: [
              { label: "Supplier Code", value: s.code },
              { label: "Supplier Item Code", value: s.itemCode },
              { label: "Purchase Unit", value: s.punit },
              {
                label: "Conversion Rate",
                value: s.punit.match(/\((.+)\)/)?.[1] ?? `1 ${p.unit}`,
              },
              { label: "MOQ", value: s.moq },
              { label: "Lead Time", value: s.lead },
              canCost
                ? { label: "Latest Purchase Price", value: s.lastPrice }
                : {
                    label: "Latest Purchase Price",
                    value: "Restricted by permission",
                    muted: true,
                  },
              { label: "Currency", value: p.pricing.currency },
              { label: "Supplier Warranty", value: s.warranty },
              { label: "Country", value: s.country },
            ],
          },
          {
            type: "table",
            title: "Alternative Suppliers",
            rows: d.altSupRows,
            empty: "ยังไม่มีผู้ขายสินค้าสำรองสำหรับสินค้านี้",
            cols: [
              {
                key: "name",
                label: "Supplier",
                cell: (r) => (
                  <LinkButton
                    onClick={() =>
                      ctx.toast("ผู้ขายสินค้า", `${r.name} — Future support`, "info")
                    }
                  >
                    {r.name}
                  </LinkButton>
                ),
              },
              { key: "punit", label: "Purchase Unit", muted: true },
              { key: "moq", label: "MOQ", muted: true },
              { key: "lead", label: "Lead Time", muted: true },
              {
                key: "price",
                label: "Latest Price",
                align: "right",
                cell: (r) => (canCost ? money(r.price) : "••••"),
              },
              {
                key: "cur",
                label: "Currency",
                muted: true,
                cell: () => p.pricing.currency,
              },
              {
                key: "status",
                label: "Status",
                cell: (r) => <Badge tone="success">{r.status}</Badge>,
              },
            ],
          },
        ];
      },
    },

    /* ---------- 6. REGISTRATION & WARRANTY ---------- */
    {
      key: "registration",
      label: "Registration & Warranty",
      blocks: (p, ctx) => {
        const d = p.detail;
        const w = d.warranty;
        const main = d.regRows[0];

        let alert = null;
        if (!main) {
          alert = {
            type: "alert" as const,
            tone: "warn" as const,
            title: "ยังไม่ได้ขึ้นทะเบียน",
            message: "สินค้านี้อยู่ระหว่างยื่นคำขอ — ยังไม่สามารถจำหน่ายได้",
          };
        } else {
          const days = daysUntil(main.exp);
          if (main.status === "Expired" || (days !== null && days < 0)) {
            alert = {
              type: "alert" as const,
              tone: "danger" as const,
              title: "ทะเบียนหมดอายุแล้ว",
              message: `หมดอายุเมื่อ ${main.exp} — ห้ามจำหน่ายจนกว่าจะต่ออายุทะเบียน`,
            };
          } else if (days !== null && days <= 90) {
            alert = {
              type: "alert" as const,
              tone: "warn" as const,
              title: "ทะเบียนใกล้หมดอายุ",
              message: `เหลืออีก ${days} วัน (หมดอายุ ${main.exp}) — ควรเริ่มดำเนินการต่ออายุ`,
            };
          }
        }

        return [
          alert,
          {
            type: "table",
            title: "Product Registration",
            rows: d.regRows,
            empty: "ยังไม่มีข้อมูลการขึ้นทะเบียน",
            cols: [
              { key: "type", label: "Registration Type" },
              { key: "no", label: "Registration Number" },
              { key: "issue", label: "Issue Date", muted: true },
              {
                key: "exp",
                label: "Expiry Date",
                cell: (r) => {
                  const dd = daysUntil(r.exp);
                  return dd !== null && dd <= 90 ? (
                    <span className="font-semibold text-warning-text">{r.exp}</span>
                  ) : (
                    r.exp
                  );
                },
              },
              { key: "status", label: "Status", cell: (r) => regBadge(r.status) },
              {
                key: "doc",
                label: "Document",
                cell: (r) =>
                  r.doc && r.doc !== DASH ? (
                    <LinkButton
                      onClick={() =>
                        ctx.toast("เปิดเอกสาร", `${r.doc} — Future support`, "info")
                      }
                    >
                      ดูเอกสาร
                    </LinkButton>
                  ) : (
                    <span className="text-ink-2">{DASH}</span>
                  ),
              },
            ],
          },
          {
            type: "fields",
            title: "Warranty",
            cols: 2,
            items: [
              { label: "Supplier Warranty Period", value: `${w.sup} ${w.unit}` },
              { label: "Customer Warranty Period", value: `${w.cust} ${w.unit}` },
              { label: "Warranty Unit", value: w.unit },
              { label: "Warranty Start Event", value: w.startEvent },
            ],
          },
        ];
      },
    },

    /* ---------- 7. DOCUMENTS ---------- */
    {
      key: "documents",
      label: "Documents",
      blocks: (p, ctx) => {
        const docs = p.detail.docs;
        if (!docs.length)
          return [
            {
              type: "empty",
              title: "Documents",
              icon: "file",
              heading: "ยังไม่มีเอกสารแนบ",
              message:
                "เอกสารสินค้า เช่น แคตตาล็อก ใบรับรอง หรือคู่มือ จะแสดงที่นี่",
            },
          ];

        return [
          {
            type: "table",
            title: `Documents (${docs.length})`,
            rows: docs,
            cols: [
              {
                key: "name",
                label: "File Name",
                cell: (r) => (
                  <span className="inline-flex items-center gap-2">
                    <Icon name="file" size={15} className="text-ink-3" />
                    {r.name}
                  </span>
                ),
              },
              {
                key: "type",
                label: "Document Type",
                cell: (r) => <Badge tone="neutral">{r.type}</Badge>,
              },
              { key: "size", label: "File Size", align: "right", muted: true },
              { key: "by", label: "Uploaded By", muted: true },
              { key: "date", label: "Uploaded Date", muted: true },
              {
                key: "act",
                label: "Action",
                cell: (r) => (
                  <span className="flex justify-end gap-0.5">
                    <button
                      title="Preview"
                      onClick={() =>
                        ctx.toast("ดูตัวอย่าง", `${r.name} — Future support`, "info")
                      }
                      className="grid h-[30px] w-[30px] place-items-center rounded-btn text-ink-2 hover:bg-neutral-soft hover:text-ink"
                    >
                      <Icon name="eye" size={15} />
                    </button>
                    <button
                      title="Download"
                      onClick={() =>
                        ctx.toast("ดาวน์โหลด", `${r.name} — Future support`, "info")
                      }
                      className="grid h-[30px] w-[30px] place-items-center rounded-btn text-ink-2 hover:bg-neutral-soft hover:text-ink"
                    >
                      <Icon name="download" size={15} />
                    </button>
                  </span>
                ),
              },
            ],
          },
        ];
      },
    },

    /* ---------- 8. PURCHASE HISTORY ----------
       Was the audit trail. What a buyer opening a product actually asks is
       "what have we paid for this, and to whom" — the field-change log
       belongs to Administration › Audit Log, which owns it for every module. */
    {
      key: "history",
      label: "Purchase History",
      blocks: (p, ctx) => {
        const kpi = productPurchaseKpi(p);
        const lines = productPurchaseOrders(p);
        const receipts = productGoodsReceipts(p);
        const year = productPurchaseByYear(p)[0];
        const canCost = checkPermission("canViewCost");

        if (!lines.length && !receipts.length) {
          return [
            {
              type: "empty",
              heading: "ยังไม่มีประวัติการสั่งซื้อ",
              message: "สินค้านี้ยังไม่เคยถูกสั่งซื้อผ่านใบสั่งซื้อในระบบ",
              icon: "purchaseOrder",
            },
          ];
        }

        return [
          {
            type: "cards",
            title: "Purchase Summary",
            cols: 3,
            items: [
              canCost && {
                label: "Total Purchase",
                value: money(year?.spend ?? kpi.spend),
                unit: p.pricing.currency,
                sub: year ? `ปี ${year.year}` : "",
                tone: "accent",
              },
              canCost && {
                label: "Average Cost",
                value: money(kpi.avgPrice),
                unit: `${p.pricing.currency} / ${p.unit}`,
                sub: "ถ่วงน้ำหนักตามจำนวน",
              },
              {
                label: "Purchase Orders",
                value: fmt(year?.orders ?? kpi.orders),
                sub: year ? `ปี ${year.year}` : "",
              },
            ],
          },

          {
            type: "table",
            title: `Purchase Orders (${lines.length})`,
            rows: lines,
            empty: "ยังไม่มีใบสั่งซื้อ",
            cols: [
              {
                key: "doc",
                label: "PO No.",
                cell: (l) => (
                  <LinkButton onClick={() => ctx.openEntity("purchase-order", l.doc)}>
                    {l.doc}
                  </LinkButton>
                ),
              },
              { key: "date", label: "Date", muted: true },
              { key: "supplier", label: "Supplier" },
              { key: "qty", label: "Qty", align: "right", cell: (l) => `${fmt(l.qty)} ${l.unit}` },
              ...(canCost
                ? ([
                    {
                      key: "price",
                      label: "Unit Cost",
                      align: "right",
                      cell: (l: (typeof lines)[number]) => money(l.price),
                    },
                    {
                      key: "amount",
                      label: "Amount",
                      align: "right",
                      cell: (l: (typeof lines)[number]) => money(l.amount),
                    },
                  ] as const)
                : []),
              { key: "buyer", label: "ผู้สั่งซื้อ", muted: true, cell: (l) => l.buyer || DASH },
              {
                key: "status",
                label: "Status",
                cell: (l) => <Badge tone="neutral">{l.status}</Badge>,
              },
            ],
          },

          {
            type: "table",
            title: `Goods Receipts (${receipts.length})`,
            rows: receipts,
            empty: "ยังไม่มีการรับสินค้า",
            cols: [
              {
                key: "doc",
                label: "GR No.",
                cell: (r) => (
                  <LinkButton onClick={() => ctx.openEntity("goods-receipt", r.doc)}>
                    {r.doc}
                  </LinkButton>
                ),
              },
              { key: "date", label: "Receipt Date", muted: true },
              { key: "supplier", label: "Supplier", muted: true },
              { key: "warehouse", label: "Warehouse", muted: true },
              { key: "accepted", label: "Accepted", align: "right", cell: (r) => fmt(r.accepted) },
              {
                key: "rejected",
                label: "Rejected",
                align: "right",
                cell: (r) =>
                  r.rejected ? (
                    <span className="font-semibold text-danger-text">{fmt(r.rejected)}</span>
                  ) : (
                    <span className="text-ink-3">{DASH}</span>
                  ),
              },
              {
                key: "status",
                label: "Status",
                cell: (r) => <Badge tone="neutral">{r.status}</Badge>,
              },
            ],
          },
        ];
      },
    },
  ],

  actions: (p, ctx) => [
    {
      label: "Duplicate Product",
      icon: "copy",
      run: () =>
        ctx.toast("ทำสำเนาสินค้า", "เปิดฟอร์มสร้างสินค้าจากต้นแบบ — Future support", "info"),
    },
    {
      label: "Print Product Sheet",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ Product Sheet", "กำลังสร้างเอกสาร — Future support", "info"),
    },
    {
      label: "Export Product Data",
      icon: "upload",
      run: () => ctx.toast("ส่งออกข้อมูลสินค้า", "กำลังเตรียมไฟล์ Excel — Future support", "info"),
    },
    { sep: true },
    {
      label: "Activate / Deactivate",
      icon: "circleSlash",
      run: () =>
        ctx.toast(
          p.status === "Active" ? "ปิดใช้งานสินค้า" : "เปิดใช้งานสินค้า",
          `${p.code} — Future support`,
          "info",
        ),
    },
    {
      label: "Delete Product",
      icon: "trash",
      danger: true,
      run: () =>
        ctx.confirm({
          title: "Delete this product?",
          message: (
            <>
              <strong>{p.code}</strong> — {p.name} จะถูกลบออกจาก Product Master
            </>
          ),
          confirmText: "Delete product",
          onConfirm: () => {
            ctx.toast("ลบสินค้าแล้ว", `${p.code} — Future support`, "danger");
            ctx.goto("/m/product");
          },
        }),
    },
  ],
};

export const productSchemas: EntitySchemas<ProductRow> = {
  list: PRODUCT_LIST,
  detail: PRODUCT_DETAIL,
  form: PRODUCT_FORM,
};

export { getProduct, productStock };
