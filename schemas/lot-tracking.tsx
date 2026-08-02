import {
  EXPIRY_CLASSES,
  LOT_STATUSES,
  LOT_STOCK_STATUSES,
  MIN_SHELF_LIFE_PCT,
} from "@/data/lots";
import { fmt, money, money0 } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  EXPIRY_TONE,
  LOT_TONE,
  expiryWatch,
  lotCorrections,
  lotCustomers,
  lotGenealogy,
  lotInbound,
  lotInventory,
  lotMovements,
  lotOutbound,
  lotRecall,
  lotReturns,
  lotRows,
  lotSummary,
  type LotRow,
} from "@/lib/domain/lot";
import {
  lotAddNote,
  lotBulk,
  lotCloseRecall,
  lotExport,
  lotExportCustomers,
  lotPlaceRecallHold,
  lotPrint,
  lotReleaseHold,
  lotStartRecall,
} from "@/lib/workflows-lot";
import { Badge, Thumb } from "@/components/ui";

/* ============================================================
   LOT TRACKING — one batch, followed end to end.

   Read-only about inventory: the schema offers no create, no edit,
   no delete and no quantity field. Corrections happen in the module
   that owns them, and a recall hold leaves here as a Stock
   Adjustment draft rather than a silent balance change.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

const expiryCell = (r: LotRow) =>
  r.exp ? (
    <span className="flex flex-col">
      <span>{r.exp}</span>
      <span
        className={
          r.daysToExpiry !== null && r.daysToExpiry < 0
            ? "text-cap font-semibold text-danger"
            : r.daysToExpiry !== null && r.daysToExpiry <= 90
              ? "text-cap font-semibold text-warning"
              : "text-cap text-ink-3"
        }
      >
        {r.daysToExpiry === null
          ? "—"
          : r.daysToExpiry < 0
            ? `เกิน ${Math.abs(r.daysToExpiry)} วัน`
            : `อีก ${r.daysToExpiry} วัน`}
      </span>
    </span>
  ) : (
    <span className="text-ink-3">ไม่มีวันหมดอายุ</span>
  );

/* ---------- List ---------- */

const list: ListSchema<LotRow> = {
  key: "lot-tracking",
  entity: "Lot",
  entityPlural: "lots",
  title: "Lot Tracking",
  subtitle:
    "Trace lot-controlled inventory from supplier receipt through warehouse movement, shipment, customer delivery, and return.",
  crumb: "Lot Tracking",
  crumbParent: "Inventory",
  primaryLabel: "",
  searchPlaceholder:
    "ค้นหา Lot / สินค้า / บาร์โค้ด / ผู้ขาย / ใบสั่งซื้อ / ใบรับ / QC / คลัง / คำสั่งขาย / ลูกค้า / การเรียกคืน",
  emptyTitle: "ไม่พบล็อตที่ตรงกับเงื่อนไข",

  /* A lot is created by receiving goods, never from this screen. */
  hideImportExport: true,
  hideCreate: true,

  source: lotRows,

  searchFields: [
    "lot",
    "product",
    "productName",
    "barcode",
    "supplier",
    "supplierCode",
    "supplierLot",
    "manufacturer",
    "poRef",
    "grRef",
    "qcRef",
    "recallRef",
    "brand",
    "cat",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "active", label: "ใช้งาน", test: (r) => r.lotStatus === "Active" },
    { key: "available", label: "มีของพร้อมขาย", test: (r) => r.available > 0 },
    { key: "qc", label: "ติด QC", test: (r) => r.qcHold > 0 || r.lotStatus === "QC Hold" },
    { key: "near", label: "ใกล้หมดอายุ", test: (r) => r.lotStatus === "Near Expiry" },
    { key: "expired", label: "หมดอายุ", test: (r) => r.expiryClass === "Expired" },
    {
      key: "recall",
      label: "เรียกคืน",
      test: (r) => r.lotStatus === "Recall Hold" || r.recallHold > 0,
    },
    {
      key: "investigation",
      label: "อยู่ระหว่างสอบสวน",
      test: (r) => r.lotStatus === "Under Investigation",
    },
    { key: "depleted", label: "หมดแล้ว", test: (r) => r.lotStatus === "Depleted" },
    { key: "corrected", label: "มีการแก้ไข", test: (r) => r.correctionCount > 0 },
  ],

  filters: [
    {
      id: "lotStatus",
      label: "Lot Status",
      options: () => [...LOT_STATUSES],
      test: (r, v) => r.lotStatus === v,
    },
    {
      id: "stockStatus",
      label: "Stock Status",
      options: () => [...LOT_STOCK_STATUSES],
      test: (r, v) =>
        (v === "Available" && r.available > 0) ||
        (v === "Reserved" && r.reserved > 0) ||
        (v === "QC Hold" && r.qcHold > 0) ||
        (v === "Return Hold" && r.returnHold > 0) ||
        (v === "Damaged" && r.damaged > 0) ||
        (v === "Blocked" && r.blocked > 0) ||
        (v === "Expired" && r.expiredQty > 0) ||
        (v === "Recall Hold" && r.recallHold > 0) ||
        (v === "In Transit" && r.inTransit > 0),
    },
    {
      id: "product",
      label: "Product",
      options: () => uniq(lotRows().map((r) => r.product)),
      test: (r, v) => r.product === v,
    },
    {
      id: "cat",
      label: "Category",
      options: () => uniq(lotRows().map((r) => r.cat)),
      test: (r, v) => r.cat === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(lotRows().map((r) => r.brand)),
      test: (r, v) => r.brand === v,
    },
    {
      id: "supplier",
      label: "Supplier",
      options: () => uniq(lotRows().map((r) => r.supplier)),
      test: (r, v) => r.supplier === v,
    },
    {
      id: "manufacturer",
      label: "Manufacturer",
      options: () => uniq(lotRows().map((r) => r.manufacturer)),
      test: (r, v) => r.manufacturer === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => uniq(lotRows().flatMap((r) => r.warehouses)),
      test: (r, v) => r.warehouses.includes(v),
    },
    {
      id: "location",
      label: "Location",
      options: () => uniq(lotRows().flatMap((r) => r.locations)).slice(0, 60),
      test: (r, v) => r.locations.includes(v),
    },
    {
      id: "received",
      label: "Received Date",
      options: () => uniq(lotRows().map((r) => r.received)),
      test: (r, v) => r.received === v,
    },
    {
      id: "mfg",
      label: "Manufacturing Date",
      options: () => uniq(lotRows().map((r) => r.mfg)),
      test: (r, v) => r.mfg === v,
    },
    {
      id: "exp",
      label: "Expiry Date",
      options: () => uniq(lotRows().map((r) => r.exp)),
      test: (r, v) => r.exp === v,
    },
    {
      id: "expiryClass",
      label: "Expiry Classification",
      options: () => [...EXPIRY_CLASSES],
      test: (r, v) => r.expiryClass === v,
    },
    { id: "hasAvailable", label: "Available > 0", options: yesNo, test: (r) => r.available > 0 },
    { id: "hasReserved", label: "Reserved > 0", options: yesNo, test: (r) => r.reserved > 0 },
    { id: "qcOnly", label: "QC Hold Only", options: yesNo, test: (r) => r.qcHold > 0 },
    { id: "returnOnly", label: "Return Hold Only", options: yesNo, test: (r) => r.returnHold > 0 },
    {
      id: "recallOnly",
      label: "Recall Hold Only",
      options: yesNo,
      test: (r) => r.recallHold > 0 || r.lotStatus === "Recall Hold",
    },
    { id: "shipped", label: "Shipped Lots", options: yesNo, test: (r) => r.shippedQty > 0 },
    { id: "returned", label: "Returned Lots", options: yesNo, test: (r) => r.returnedQty > 0 },
    { id: "corrected", label: "Corrected Lots", options: yesNo, test: (r) => r.correctionCount > 0 },
    {
      id: "myWarehouse",
      label: "My Warehouse",
      options: () => uniq(lotRows().flatMap((r) => r.warehouses)),
      test: (r, v) => r.warehouses.includes(v),
    },
  ],

  columns: [
    { key: "icon", label: "", cell: (r) => <Thumb size={30}>{r.icon}</Thumb> },
    {
      key: "lot",
      label: "Lot Number",
      sortable: true,
      locked: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold">{r.lot}</span>
          {r.aliases.length > 1 && (
            <span className="text-cap text-ink-3">อ้างอิง {r.aliases.length - 1} เลข</span>
          )}
        </span>
      ),
    },
    { key: "product", label: "Product Code", sortable: true, cell: (r) => r.product },
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
    { key: "brand", label: "Brand", muted: true, defaultHidden: true, cell: (r) => r.brand },
    { key: "cat", label: "Category", muted: true, defaultHidden: true, cell: (r) => r.cat },
    { key: "supplier", label: "Supplier", sortable: true, muted: true, cell: (r) => r.supplier },
    {
      key: "manufacturer",
      label: "Manufacturer",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.manufacturer,
    },
    { key: "mfg", label: "Manufacturing Date", muted: true, defaultHidden: true, cell: (r) => r.mfg || "—" },
    {
      key: "exp",
      label: "Expiry Date",
      sortable: true,
      sortValue: (r) => r.daysToExpiry ?? 1e9,
      cell: expiryCell,
    },
    {
      key: "expiryClass",
      label: "Expiry Risk",
      defaultHidden: true,
      cell: (r) => <Badge tone={EXPIRY_TONE[r.expiryClass] ?? "neutral"}>{r.expiryClass}</Badge>,
    },
    {
      key: "lotStatus",
      label: "Lot Status",
      sortable: true,
      cell: (r) => <Badge tone={LOT_TONE[r.lotStatus] ?? "neutral"}>{r.lotStatus}</Badge>,
    },
    { key: "onHand", label: "Total On Hand", align: "right", sortable: true, cell: (r) => fmt(r.onHand) },
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
    { key: "blocked", label: "Blocked", align: "right", muted: true, defaultHidden: true, cell: (r) => fmt(r.blocked) },
    {
      key: "expiredQty",
      label: "Expired Qty",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (r.expiredQty ? <Badge tone="danger">{fmt(r.expiredQty)}</Badge> : "—"),
    },
    {
      key: "recallHold",
      label: "Recall Hold",
      align: "right",
      defaultHidden: true,
      cell: (r) => (r.recallHold ? <Badge tone="danger">{fmt(r.recallHold)}</Badge> : "—"),
    },
    { key: "inTransit", label: "In Transit", align: "right", muted: true, defaultHidden: true, cell: (r) => fmt(r.inTransit) },
    {
      key: "warehouses",
      label: "Warehouses",
      muted: true,
      cell: (r) => (r.warehouses.length ? r.warehouses.join(", ") : "—"),
    },
    {
      key: "locationCount",
      label: "Locations",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => fmt(r.locationCount),
    },
    {
      key: "originalQty",
      label: "Original Received Qty",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => fmt(r.originalQty),
    },
    { key: "shippedQty", label: "Shipped Qty", align: "right", muted: true, cell: (r) => fmt(r.shippedQty) },
    { key: "returnedQty", label: "Returned Qty", align: "right", muted: true, defaultHidden: true, cell: (r) => fmt(r.returnedQty) },
    {
      key: "unitCost",
      label: "Unit Cost",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => money(r.unitCost),
    },
    {
      key: "inventoryValue",
      label: "Inventory Value",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => money0(r.inventoryValue),
    },
    { key: "lastMovement", label: "Last Movement", muted: true, cell: (r) => r.lastMovement || "—" },
  ],

  secondaryActions: (ctx) => [
    {
      label: "Export Excel",
      icon: "upload",
      run: () =>
        ctx.toast("ส่งออก Excel", `เตรียมไฟล์ ${fmt(lotRows().length)} ล็อต — Future support`, "info"),
    },
    {
      label: "Export CSV",
      icon: "download",
      run: () => ctx.toast("ส่งออก CSV", "เตรียมไฟล์ตามคอลัมน์ที่แสดงอยู่ — Future support", "info"),
    },
    {
      label: "Print",
      icon: "printer",
      run: () => ctx.toast("พิมพ์รายงานล็อต", "Future support", "info"),
    },
    {
      label: "Expiry Monitoring",
      icon: "calendar",
      run: () => {
        const watch = expiryWatch();
        ctx.toast(
          "เฝ้าระวังวันหมดอายุ",
          `หมดอายุแล้ว ${watch.filter((x) => x.expiryClass === "Expired").length} · ภายใน 30 วัน ${
            watch.filter((x) => x.expiryClass === "Expires within 30 days").length
          } · ภายใน 90 วัน ${watch.filter((x) => x.expiryClass === "Expires within 90 days").length}`,
          "warning",
        );
      },
    },
  ],

  hero: (ctx) => {
    const s = lotSummary();
    return {
      kpis: [
        { icon: "layers", label: "Total Active Lots", value: fmt(s.active), goTab: "active" },
        { icon: "checkCircle", label: "Available Lots", value: fmt(s.available), tone: "ok", goTab: "available" },
        { icon: "shield", label: "QC Hold Lots", value: fmt(s.qcHold), tone: "warn", goTab: "qc" },
        { icon: "alert", label: "Recall Hold Lots", value: fmt(s.recallHold), tone: "warn", goTab: "recall" },
        { icon: "calendar", label: "Near Expiry Lots", value: fmt(s.nearExpiry), tone: "warn", goTab: "near" },
        { icon: "clock", label: "Expired Lots", value: fmt(s.expired), tone: "warn", goTab: "expired" },
        { icon: "box", label: "Depleted Lots", value: fmt(s.depleted), goTab: "depleted" },
        { icon: "goodsReceipt", label: "Lots Received This Month", value: fmt(s.receivedThisMonth) },
        { icon: "truck", label: "Lots Shipped This Month", value: fmt(s.shippedThisMonth) },
        {
          icon: "pricing",
          label: "Total Lot Inventory Value",
          value: money0(s.inventoryValue),
          sub: "Operational preview",
          tone: "primary",
          run: () =>
            ctx.toast(
              "Lot Inventory Value",
              "ตัวเลขมูลค่าเป็นค่าประมาณจากต้นทุนเฉลี่ย ระบบบัญชีจริงจะทำในเฟส Finance",
              "info",
            ),
        },
      ],
    };
  },

  rowActions: (rec, ctx) => [
    { label: "เปิดการสอบกลับ", icon: "eye", run: () => ctx.goto(`/m/lot-tracking/${encodeURIComponent(rec.code)}`) },
    { label: "เปิด Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
    {
      label: "เปิด Stock Card",
      icon: "sort",
      run: () => ctx.goto(`/m/product-stock-card/${rec.product}`),
    },
    {
      label: "เปิดใบรับสินค้าต้นทาง",
      icon: "goodsReceipt",
      disabled: !rec.grRef,
      disabledReason: "ล็อตนี้ไม่มีใบรับสินค้าที่อ้างอิงได้",
      run: () => ctx.openEntity("goods-receipt", rec.grRef),
    },
    { sep: true },
    {
      label: "เริ่มการตรวจสอบเรียกคืน",
      icon: "alert",
      danger: true,
      run: () => lotStartRecall(rec, ctx),
    },
    {
      label: "ส่งออกรายชื่อลูกค้า",
      icon: "users",
      disabled: rec.customerCount === 0,
      run: () => lotExportCustomers(rec, ctx),
    },
    { label: "ส่งออกการสอบกลับ", icon: "upload", run: () => lotExport(rec, ctx, "การสอบกลับ") },
    { label: "พิมพ์", icon: "printer", run: () => lotPrint(rec, ctx) },
  ],

  bulkActions: lotBulk,
};

/* ---------- Detail ---------- */

const detail: DetailSchema<LotRow> = {
  key: "lot-tracking",
  entityLabel: "Lot",

  identity: (r) => ({
    image: <Thumb size={44}>{r.icon}</Thumb>,
    code: r.lot,
    title: r.productName,
    copyFields: [
      { label: "Lot Number", value: r.lot },
      { label: "Product Code", value: r.product },
      ...(r.supplierLot ? [{ label: "Supplier Lot", value: r.supplierLot }] : []),
    ],
    badges: [
      { text: r.lotStatus, tone: LOT_TONE[r.lotStatus] ?? "neutral" },
      { text: r.expiryClass, tone: EXPIRY_TONE[r.expiryClass] ?? "neutral" },
      ...(r.recallRef ? [{ text: r.recallRef, tone: "danger" as const }] : []),
      ...(!r.reconciled ? [{ text: "ยอดไม่ตรง", tone: "danger" as const }] : []),
    ],
    tags: [r.supplier, ...(r.warehouses.length ? r.warehouses : ["ไม่มีสต๊อกคงเหลือ"]), r.cat],
  }),

  kpis: (r) => [
    { icon: "box", label: "Total On Hand", value: fmt(r.onHand), goTab: "inventory" },
    { icon: "checkCircle", label: "Available", value: fmt(r.available), goTab: "inventory" },
    { icon: "lock", label: "Reserved", value: fmt(r.reserved), goTab: "outbound" },
    {
      icon: "calendar",
      label: "Days to Expiry",
      value: r.daysToExpiry === null ? "—" : String(r.daysToExpiry),
      sub: r.exp || "ไม่มีวันหมดอายุ",
    },
    { icon: "users", label: "Customers", value: fmt(r.customerCount), goTab: "customers" },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => [
        !r.reconciled && {
          type: "alert",
          tone: "danger",
          title: "ยอดคงเหลือไม่ตรงกัน",
          message:
            "ผลรวมของทุกสถานะไม่เท่ากับ Total On Hand — ตรวจสอบกับ Stock Inquiry และ Stock Card",
        },
        Boolean(r.recallRef) && {
          type: "alert",
          tone: "danger",
          title: "ล็อตนี้อยู่ระหว่างการตรวจสอบเรียกคืน",
          message: `${r.recallRef} — ดูรายละเอียดในแท็บ Recall / Investigation`,
        },
        r.expiryClass === "Expired" && {
          type: "alert",
          tone: "danger",
          title: "ล็อตนี้หมดอายุแล้ว",
          message: `ยอด ${fmt(r.expiredQty)} ${r.unit} ถูกกันออกจากยอดพร้อมขายโดยอัตโนมัติ`,
        },
        r.lotStatus === "Near Expiry" && {
          type: "alert",
          tone: "warn",
          title: "ล็อตนี้ใกล้หมดอายุ",
          message: `เหลืออีก ${r.daysToExpiry} วัน · ลำดับ FEFO ที่ ${r.fefoRank || "—"}`,
        },
        Boolean(r.note) && { type: "note", title: "หมายเหตุ", text: r.note },
        {
          type: "fields",
          title: "Lot Information",
          cols: 2,
          items: [
            { label: "Lot Number", value: r.lot },
            { label: "Manufacturer Lot", value: r.supplierLot || "—" },
            { label: "Product Code", value: r.product },
            { label: "Product Name", value: r.productName },
            { label: "Brand", value: r.brand },
            { label: "Category", value: r.cat },
            { label: "UOM", value: r.unit },
            { label: "Lot Status", value: r.lotStatus },
            { label: "Created From", value: r.grRef || "—" },
            {
              label: "เลขอ้างอิงในโมดูลอื่น",
              value: r.aliases.length > 1 ? r.aliases.slice(1).join(", ") : "—",
              span: true,
            },
          ],
        },
        {
          type: "fields",
          title: "Manufacturing and Expiry",
          cols: 2,
          items: [
            { label: "Manufacturing Date", value: r.mfg || "—" },
            { label: "Expiry Date", value: r.exp || "ไม่มีวันหมดอายุ" },
            {
              label: "Days to Expiry",
              value: r.daysToExpiry === null ? "—" : `${r.daysToExpiry} วัน`,
            },
            {
              label: "Shelf-Life Remaining",
              value: r.shelfLifePct === null ? "—" : `${r.shelfLifePct}%`,
            },
            { label: "Expiry Classification", value: r.expiryClass },
            {
              label: `Minimum Shelf Life (${MIN_SHELF_LIFE_PCT}%)`,
              value: r.meetsMinShelfLife ? "ผ่านเกณฑ์" : "ต่ำกว่าเกณฑ์",
            },
            { label: "FEFO Priority", value: r.fefoRank ? `ลำดับที่ ${r.fefoRank}` : "—" },
            { label: "Original Shelf Life", value: "—", muted: true },
          ],
        },
        {
          type: "fields",
          title: "Source Information",
          cols: 2,
          items: [
            { label: "Supplier", value: `${r.supplierCode} ${r.supplier}` },
            { label: "Supplier Lot Number", value: r.supplierLot || "—" },
            { label: "Manufacturer", value: r.manufacturer },
            { label: "Country of Origin", value: r.country },
            { label: "Purchase Order", value: r.poRef || "—" },
            { label: "Goods Receipt", value: r.grRef || "—" },
            { label: "Received Date", value: r.received || "—" },
            { label: "QC Inspection", value: r.qcRef || "—" },
            { label: "COA / Certificate", value: "—", muted: true },
          ],
        },
        {
          type: "cards",
          title: "Quantity Summary",
          cols: 4,
          items: [
            { label: "Original Received", value: fmt(r.originalQty) },
            { label: "Total On Hand", value: fmt(r.onHand), tone: "accent" },
            { label: "Available", value: fmt(r.available), tone: "accent" },
            { label: "Reserved", value: fmt(r.reserved) },
            { label: "QC Hold", value: fmt(r.qcHold), tone: r.qcHold ? "warn" : undefined },
            { label: "Return Hold", value: fmt(r.returnHold), tone: r.returnHold ? "warn" : undefined },
            { label: "Damaged", value: fmt(r.damaged), tone: r.damaged ? "warn" : undefined },
            { label: "Blocked", value: fmt(r.blocked) },
            { label: "Expired", value: fmt(r.expiredQty), tone: r.expiredQty ? "warn" : undefined },
            { label: "Recall Hold", value: fmt(r.recallHold), tone: r.recallHold ? "warn" : undefined },
            { label: "In Transit", value: fmt(r.inTransit) },
            { label: "Shipped", value: fmt(r.shippedQty) },
            { label: "Returned", value: fmt(r.returnedQty) },
            { label: "Scrapped", value: fmt(r.scrappedQty) },
            { label: "Inventory Value", value: money0(r.inventoryValue), tone: "accent" },
          ],
        },
      ],
      aside: (r) => ({
        rows: [
          { icon: "layers", label: "Lot", value: r.lot },
          { icon: "product", label: "Product", value: r.product, muted: true },
          { icon: "partner", label: "Supplier", value: r.supplier, muted: true },
          { icon: "calendar", label: "Expiry", value: r.exp || "—" },
          { icon: "box", label: "On Hand", value: fmt(r.onHand) },
          { icon: "checkCircle", label: "Available", value: fmt(r.available) },
          { icon: "truck", label: "Shipped", value: fmt(r.shippedQty), muted: true },
          { icon: "users", label: "Customers", value: fmt(r.customerCount), muted: true },
        ],
      }),
    },

    {
      key: "inventory",
      label: "Inventory",
      blocks: (r): Block[] => {
        const bucketTotal =
          r.available + r.reserved + r.qcHold + r.returnHold + r.damaged + r.expiredQty + r.recallHold;
        return [
          {
            type: "cards",
            title: "Stock Status Breakdown",
            cols: 4,
            items: [
              { label: "Available", value: fmt(r.available), tone: "accent" },
              { label: "Reserved", value: fmt(r.reserved) },
              { label: "QC Hold", value: fmt(r.qcHold) },
              { label: "Return Hold", value: fmt(r.returnHold) },
              { label: "Damaged", value: fmt(r.damaged) },
              { label: "Blocked", value: fmt(r.blocked) },
              { label: "Expired", value: fmt(r.expiredQty) },
              { label: "Recall Hold", value: fmt(r.recallHold) },
            ],
          },
          {
            type: "fields",
            title: "Reconciliation",
            cols: 2,
            items: [
              { label: "ผลรวมทุกสถานะ", value: fmt(bucketTotal) },
              { label: "Total On Hand", value: fmt(r.onHand) },
              { label: "In Transit (แยกต่างหาก)", value: fmt(r.inTransit) },
              {
                label: "ผลการกระทบยอด",
                value: r.reconciled ? "ตรงกัน" : `ต่างกัน ${fmt(bucketTotal - r.onHand)}`,
              },
            ],
          },
          {
            type: "table",
            title: "Lot by Warehouse and Location",
            rows: lotInventory(r),
            empty: "ล็อตนี้ไม่มีสต๊อกคงเหลือในคลังใด",
            cols: [
              {
                key: "warehouse",
                label: "Warehouse",
                cell: (x) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{x.warehouse}</span>
                    <span className="text-cap text-ink-3">{x.whName}</span>
                  </span>
                ),
              },
              { key: "zone", label: "Zone", muted: true, cell: (x) => x.zone },
              { key: "rack", label: "Rack", muted: true, cell: (x) => x.rack },
              { key: "shelf", label: "Shelf", muted: true, cell: (x) => x.shelf },
              { key: "bin", label: "Bin", muted: true, cell: (x) => x.bin },
              { key: "stockStatus", label: "Stock Status", cell: (x) => x.stockStatus },
              { key: "available", label: "Available", align: "right", cell: (x) => fmt(x.available) },
              { key: "reserved", label: "Reserved", align: "right", muted: true, cell: (x) => fmt(x.reserved) },
              { key: "qcHold", label: "QC Hold", align: "right", muted: true, cell: (x) => fmt(x.qcHold) },
              { key: "returnHold", label: "Return Hold", align: "right", muted: true, cell: (x) => fmt(x.returnHold) },
              { key: "damaged", label: "Damaged", align: "right", muted: true, cell: (x) => fmt(x.damaged) },
              { key: "expired", label: "Expired", align: "right", muted: true, cell: (x) => fmt(x.expired) },
              {
                key: "onHand",
                label: "Total On Hand",
                align: "right",
                cell: (x) => <span className="font-semibold">{fmt(x.onHand)}</span>,
              },
              { key: "inTransit", label: "In Transit", align: "right", muted: true, cell: (x) => fmt(x.inTransit) },
              { key: "capacity", label: "Capacity", align: "right", muted: true, cell: () => "—" },
              { key: "lastMovement", label: "Last Movement", muted: true, cell: (x) => x.lastMovement },
            ],
          },
          {
            type: "note",
            title: "Reconciliation rule",
            text: "Total On Hand = Available + Reserved + QC Hold + Return Hold + Damaged + Blocked + Expired + Recall Hold · In Transit แสดงแยกตามนโยบายเดียวกับ Stock Card · สินค้าหมดอายุจะไม่ถูกนับเป็นยอดพร้อมขายเด็ดขาด",
          },
        ];
      },
    },

    {
      key: "movement",
      label: "Movement History",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: `Lot Movement History (${lotMovements(r).length})`,
          rows: lotMovements(r),
          empty: "ยังไม่มีความเคลื่อนไหวของล็อตนี้",
          cols: [
            { key: "when", label: "Date and Time", muted: true, cell: (m) => m.when },
            {
              key: "code",
              label: "Movement Number",
              cell: (m) => (
                <button
                  onClick={() => ctx.goto(`/m/stock-card/${m.code}`)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {m.code}
                </button>
              ),
            },
            { key: "type", label: "Movement Type", cell: (m) => m.type },
            {
              key: "sourceDoc",
              label: "Source Document",
              cell: (m) =>
                m.sourceDoc ? (
                  <button
                    onClick={() =>
                      m.sourceModule
                        ? ctx.openEntity(m.sourceModule, m.sourceDoc)
                        : ctx.toast("ยังไม่มีโมดูลนี้", "จะเปิดใช้งานในเฟสถัดไป", "info")
                    }
                    className="text-left font-medium hover:text-primary"
                  >
                    {m.sourceDoc}
                  </button>
                ) : (
                  "—"
                ),
            },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (m) => m.warehouse },
            { key: "fromLoc", label: "From Location", muted: true, cell: (m) => m.fromLoc || "—" },
            { key: "toLoc", label: "To Location", muted: true, cell: (m) => m.toLoc || "—" },
            { key: "statusBefore", label: "Status Before", muted: true, cell: (m) => m.statusBefore },
            { key: "statusAfter", label: "Status After", muted: true, cell: (m) => m.statusAfter },
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
              cell: (m) => (m.qtyOut ? <span className="text-danger">{fmt(m.qtyOut)}</span> : "—"),
            },
            {
              key: "balanceAfter",
              label: "Balance After",
              align: "right",
              cell: (m) => <span className="font-semibold">{fmt(m.balanceAfter)}</span>,
            },
            { key: "user", label: "User", muted: true, cell: (m) => m.user },
            { key: "reference", label: "Reference", muted: true, cell: (m) => m.reference || "—" },
          ],
        },
        {
          type: "note",
          title: "Read-only",
          text: "รายการเคลื่อนไหวแก้ไขไม่ได้ — การแก้ต้องทำผ่านเอกสารต้นทางหรือใบปรับปรุงสต๊อก",
        },
      ],
    },

    {
      key: "inbound",
      label: "Inbound Trace",
      blocks: (r, ctx): Block[] => [
        {
          type: "fields",
          title: "Inbound Details",
          cols: 2,
          items: [
            { label: "Supplier", value: `${r.supplierCode} ${r.supplier}` },
            { label: "Manufacturer", value: r.manufacturer },
            { label: "Country of Origin", value: r.country },
            { label: "Supplier Lot", value: r.supplierLot || "—" },
            { label: "Received Date", value: r.received || "—" },
            { label: "Original Received Qty", value: fmt(r.originalQty) },
            { label: "Initial Warehouse", value: r.warehouses[0] ?? "—" },
            { label: "Initial Location", value: r.locations[0] ?? "—" },
            { label: "COA / Certificate", value: "—", muted: true },
            { label: "Import Reference", value: "—", muted: true },
          ],
        },
        {
          type: "table",
          title: "Supplier → Purchase Order → Goods Receipt → QC → Put Away",
          rows: lotInbound(r),
          empty: "ยังไม่พบเอกสารขาเข้าที่อ้างถึงล็อตนี้",
          cols: [
            {
              key: "doc",
              label: "Document",
              cell: (d) => (
                <button
                  onClick={() => ctx.openEntity(d.entity, d.doc)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {d.doc}
                </button>
              ),
            },
            { key: "type", label: "Document Type", cell: (d) => d.type },
            { key: "date", label: "Date", muted: true, cell: (d) => d.date },
            { key: "status", label: "Status", cell: (d) => <Badge tone="info">{d.status}</Badge> },
            { key: "qty", label: "Quantity", align: "right", cell: (d) => fmt(d.qty) },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (d) => d.warehouse },
            { key: "user", label: "User", muted: true, cell: (d) => d.user },
            { key: "result", label: "Result", muted: true, cell: (d) => d.result },
          ],
        },
      ],
    },

    {
      key: "outbound",
      label: "Outbound Trace",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Reservation → Picking → Shipment → Customer",
          rows: lotOutbound(r),
          empty: "ล็อตนี้ยังไม่ถูกจ่ายออก",
          cols: [
            {
              key: "soRef",
              label: "Sales Order",
              cell: (o) =>
                o.soRef ? (
                  <button
                    onClick={() => ctx.openEntity("sales-order", o.soRef)}
                    className="text-left font-semibold hover:text-primary"
                  >
                    {o.soRef}
                  </button>
                ) : (
                  "—"
                ),
            },
            { key: "customer", label: "Customer", cell: (o) => o.customer },
            { key: "reserved", label: "Reserved Qty", align: "right", muted: true, cell: (o) => fmt(o.reserved) },
            { key: "picked", label: "Picked Qty", align: "right", muted: true, cell: (o) => fmt(o.picked) },
            {
              key: "shipped",
              label: "Shipped Qty",
              align: "right",
              cell: (o) => <span className="font-semibold">{fmt(o.shipped)}</span>,
            },
            { key: "doRef", label: "Delivery Order", muted: true, cell: (o) => o.doRef || "—" },
            {
              key: "shipment",
              label: "Shipment",
              cell: (o) =>
                o.shipment ? (
                  <button
                    onClick={() => ctx.openEntity("shipment", o.shipment)}
                    className="text-left font-medium hover:text-primary"
                  >
                    {o.shipment}
                  </button>
                ) : (
                  "—"
                ),
            },
            {
              key: "invoice",
              label: "Invoice",
              cell: (o) =>
                o.invoice ? (
                  <button
                    onClick={() => ctx.openEntity("sales-invoice", o.invoice)}
                    className="text-left font-medium hover:text-primary"
                  >
                    {o.invoice}
                  </button>
                ) : (
                  "—"
                ),
            },
            { key: "deliveryDate", label: "Delivery Date", muted: true, cell: (o) => o.deliveryDate || "—" },
            { key: "returned", label: "Return Qty", align: "right", muted: true, cell: (o) => fmt(o.returned) },
            { key: "status", label: "Status", cell: (o) => <Badge tone="info">{o.status}</Badge> },
          ],
        },
      ],
    },

    {
      key: "customers",
      label: "Customers",
      blocks: (r, ctx): Block[] => [
        {
          type: "alert",
          tone: "info",
          title: "รายชื่อลูกค้าสำหรับการเรียกคืน",
          message:
            "รายการนี้คือคำตอบของคำถามสำคัญที่สุดในการเรียกคืน — ใครได้รับล็อตนี้ไปบ้าง และคงเหลือสุทธิเท่าใด",
        },
        {
          type: "table",
          title: `Customer Traceability (${lotCustomers(r).length})`,
          rows: lotCustomers(r),
          empty: "ยังไม่มีลูกค้าที่ได้รับล็อตนี้",
          cols: [
            { key: "customerCode", label: "Customer Code", muted: true, cell: (c) => c.customerCode || "—" },
            {
              key: "customer",
              label: "Customer Name",
              cell: (c) => (
                <button
                  onClick={() =>
                    c.customerCode
                      ? ctx.openEntity("business-partner", c.customerCode)
                      : ctx.toast("ไม่มีรหัสลูกค้า", c.customer, "info")
                  }
                  className="text-left font-semibold hover:text-primary"
                >
                  {c.customer}
                </button>
              ),
            },
            { key: "type", label: "Customer Type", muted: true, cell: (c) => c.type },
            { key: "contact", label: "Contact Person", muted: true, cell: (c) => c.contact },
            { key: "phone", label: "Phone", muted: true, cell: (c) => c.phone },
            { key: "orders", label: "Sales Order", muted: true, cell: (c) => c.orders.join(", ") || "—" },
            { key: "invoices", label: "Invoice", muted: true, cell: (c) => c.invoices.join(", ") || "—" },
            { key: "shipments", label: "Shipment", muted: true, cell: (c) => c.shipments.join(", ") },
            { key: "shipmentDate", label: "Shipment Date", muted: true, cell: (c) => c.shipmentDate },
            { key: "delivered", label: "Delivered Qty", align: "right", cell: (c) => fmt(c.delivered) },
            { key: "returned", label: "Returned Qty", align: "right", muted: true, cell: (c) => fmt(c.returned) },
            {
              key: "net",
              label: "Net Customer Qty",
              align: "right",
              cell: (c) => <span className="font-semibold">{fmt(c.net)}</span>,
            },
            { key: "salesRep", label: "Sales Rep", muted: true, cell: (c) => c.salesRep || "—" },
            {
              key: "recallContact",
              label: "Recall Contact",
              cell: (c) => <Badge tone="neutral">{c.recallContact}</Badge>,
            },
          ],
        },
        {
          type: "note",
          title: "Net formula",
          text: "Net Customer Qty = Delivered Qty − Returned Qty · เฟส 1 ไม่ส่งการแจ้งเตือนจริงถึงลูกค้า",
        },
      ],
    },

    {
      key: "supplier",
      label: "Supplier",
      blocks: (r, ctx): Block[] => [
        {
          type: "fields",
          title: "Supplier Traceability",
          cols: 2,
          items: [
            { label: "Supplier Code", value: r.supplierCode },
            { label: "Supplier Name", value: r.supplier },
            { label: "Supplier Lot", value: r.supplierLot || "—" },
            { label: "Manufacturer", value: r.manufacturer },
            { label: "Manufacturer Lot", value: r.supplierLot || "—" },
            { label: "Country", value: r.country },
            { label: "Supplier Contact", value: r.supplierContact },
            { label: "Purchase Order", value: r.poRef || "—" },
            { label: "Goods Receipt", value: r.grRef || "—" },
            { label: "Quantity Received", value: fmt(r.originalQty) },
            { label: "QC Result", value: r.qcRef ? "ตรวจแล้ว" : "—" },
            { label: "Claim Status", value: "—", muted: true },
          ],
        },
        {
          type: "entity",
          title: "Supplier documents",
          items: [
            ...(r.poRef
              ? [
                  {
                    name: r.poRef,
                    sub: "Purchase Order",
                    onClick: () => ctx.openEntity("purchase-order", r.poRef),
                  },
                ]
              : []),
            ...(r.grRef
              ? [
                  {
                    name: r.grRef,
                    sub: "Goods Receipt",
                    onClick: () => ctx.openEntity("goods-receipt", r.grRef),
                  },
                ]
              : []),
            ...(r.qcRef
              ? [
                  {
                    name: r.qcRef,
                    sub: "QC Inspection",
                    onClick: () => ctx.openEntity("qc-inspection", r.qcRef),
                  },
                ]
              : []),
            {
              name: "Supplier Claim",
              sub: "ยังไม่มีโมดูลนี้",
              onClick: () => ctx.goto("/soon?m=Supplier%20Claim"),
            },
          ],
        },
      ],
    },

    {
      key: "returns",
      label: "Returns",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: `Returns Traceability (${lotReturns(r).length})`,
          rows: lotReturns(r),
          empty: "ยังไม่มีการรับคืนที่เกี่ยวข้องกับล็อตนี้",
          cols: [
            {
              key: "code",
              label: "Return Number",
              cell: (x) => (
                <button
                  onClick={() => ctx.openEntity("sales-return", x.code)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {x.code}
                </button>
              ),
            },
            { key: "customer", label: "Customer", cell: (x) => x.customer },
            { key: "shipmentRef", label: "Source Shipment", muted: true, cell: (x) => x.shipmentRef || "—" },
            { key: "requested", label: "Requested", align: "right", muted: true, cell: (x) => fmt(x.requested) },
            { key: "received", label: "Received Qty", align: "right", cell: (x) => fmt(x.received) },
            { key: "accepted", label: "QC Accepted", align: "right", muted: true, cell: (x) => fmt(x.accepted) },
            { key: "rejected", label: "QC Rejected", align: "right", muted: true, cell: (x) => fmt(x.rejected) },
            { key: "reason", label: "Return Reason", muted: true, cell: (x) => x.reason || "—" },
            { key: "disposition", label: "Disposition", muted: true, cell: (x) => x.disposition },
            {
              key: "creditNote",
              label: "Credit Note",
              cell: (x) =>
                x.creditNote ? (
                  <button
                    onClick={() => ctx.openEntity("credit-note", x.creditNote)}
                    className="text-left font-medium hover:text-primary"
                  >
                    {x.creditNote}
                  </button>
                ) : (
                  "—"
                ),
            },
            { key: "status", label: "Status", cell: (x) => <Badge tone="info">{x.status}</Badge> },
          ],
        },
        {
          type: "note",
          title: "Return rule",
          text: "ของคืนจะอยู่ในสถานะ Return Hold หรือ QC Hold จนกว่าจะทำ Disposition เสร็จ — ไม่กลับเป็นยอดพร้อมขายทันที",
        },
      ],
    },

    {
      key: "recall",
      label: "Recall / Investigation",
      blocks: (r, ctx): Block[] => {
        const review = lotRecall(r);
        return [
          review
            ? {
                type: "fields",
                title: `Recall Review ${review.code}`,
                cols: 2,
                items: [
                  { label: "Recall Reference", value: review.code },
                  { label: "Recall Type", value: review.type },
                  { label: "Severity", value: review.severity },
                  { label: "Status", value: review.status },
                  { label: "Hold Status", value: review.holdStatus },
                  { label: "Initiated By", value: review.initiatedBy },
                  { label: "Initiated Date", value: review.initiatedDate },
                  { label: "Affected Qty", value: fmt(review.affectedQty) },
                  { label: "Available Qty", value: fmt(review.availableQty) },
                  { label: "Shipped Qty", value: fmt(review.shippedQty) },
                  { label: "Customer Count", value: fmt(review.customerCount) },
                  {
                    label: "Stock Adjustment",
                    value: review.adjustmentRef || "ยังไม่ได้กันสต๊อก",
                  },
                  { label: "Reason", value: review.reason, span: true },
                ],
              }
            : {
                type: "alert",
                tone: "info",
                title: "ยังไม่มีการตรวจสอบเรียกคืน",
                message:
                  "กด “เริ่มการตรวจสอบเรียกคืน” เพื่อเปิดเรื่อง — การเปิดเรื่องยังไม่เปลี่ยนสถานะสต๊อก",
              },
          review && {
            type: "timeline",
            title: "Investigation Notes",
            items: review.notes.map((n) => ({
              title: n.note,
              user: n.by,
              when: n.when,
              kind: "warn",
            })),
          },
          review?.adjustmentRef
            ? {
                type: "docs",
                title: "Recall Hold handoff",
                items: [
                  {
                    name: review.adjustmentRef,
                    meta: "ใบปรับปรุงสต๊อก Available → Recall Hold",
                    onClick: () => ctx.openEntity("stock-adjustment", review.adjustmentRef),
                  },
                ],
              }
            : {
                type: "note",
                title: "Recall Hold",
                text: "การกันสต๊อกจะสร้างใบปรับปรุงสต๊อกแบบเปลี่ยนสถานะเป็นร่าง — Lot Tracking ไม่แก้ยอดสต๊อกโดยตรง",
              },
          {
            type: "cards",
            title: "Recall Impact",
            cols: 4,
            items: [
              { label: "Available", value: fmt(r.available), tone: "accent" },
              { label: "Shipped", value: fmt(r.shippedQty), tone: "warn" },
              { label: "Customers", value: fmt(r.customerCount), tone: "warn" },
              { label: "Returned", value: fmt(r.returnedQty) },
            ],
          },
        ];
      },
    },

    {
      key: "genealogy",
      label: "Lot Genealogy",
      blocks: (r): Block[] => {
        const links = lotGenealogy(r);
        return [
          {
            type: "alert",
            tone: "info",
            title: "Phase 1 Traceability Placeholder",
            message:
              "ความสัมพันธ์ล็อตแม่–ล็อตลูกเก็บเป็นข้อมูลอ้างอิงเท่านั้น ยังไม่มีระบบการผลิตอยู่เบื้องหลัง",
          },
          {
            type: "tree",
            title: "Parent / Child",
            nodes: links.length
              ? [
                  {
                    label: r.lot,
                    sub: `${r.productName} · ${fmt(r.onHand)} ${r.unit}`,
                    children: links.map((g) => ({
                      label: r.aliases.includes(g.parent) ? g.child : g.parent,
                      sub: `${g.type} · ${fmt(g.qty)} · ${g.document} · ${g.date}`,
                    })),
                  },
                ]
              : [],
          },
          {
            type: "table",
            title: "Genealogy Records",
            rows: links,
            empty: "ยังไม่มีความสัมพันธ์ล็อตแม่–ล็อตลูก",
            cols: [
              { key: "parent", label: "Parent Lot", cell: (g) => <span className="font-semibold">{g.parent}</span> },
              { key: "child", label: "Child Lot", cell: (g) => <span className="font-semibold">{g.child}</span> },
              { key: "type", label: "Relationship", cell: (g) => <Badge tone="info">{g.type}</Badge> },
              { key: "qty", label: "Quantity", align: "right", cell: (g) => fmt(g.qty) },
              { key: "date", label: "Conversion Date", muted: true, cell: (g) => g.date },
              { key: "document", label: "Source Document", muted: true, cell: (g) => g.document },
              { key: "user", label: "User", muted: true, cell: (g) => g.user },
            ],
          },
        ];
      },
    },

    {
      key: "corrections",
      label: "Corrections",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: `Lot Correction History (${lotCorrections(r).length})`,
          rows: lotCorrections(r),
          empty: "ล็อตนี้ยังไม่เคยถูกแก้ไข",
          cols: [
            {
              key: "code",
              label: "Correction Number",
              cell: (c) => (
                <button
                  onClick={() => ctx.openEntity("stock-adjustment", c.code)}
                  className="text-left font-semibold hover:text-primary"
                >
                  {c.code}
                </button>
              ),
            },
            { key: "date", label: "Date", muted: true, cell: (c) => c.date },
            { key: "fromLot", label: "Incorrect Lot", cell: (c) => c.fromLot },
            { key: "toLot", label: "Correct Lot", cell: (c) => <span className="font-semibold">{c.toLot}</span> },
            { key: "product", label: "Product", muted: true, cell: (c) => c.product },
            { key: "qty", label: "Quantity", align: "right", cell: (c) => fmt(c.qty) },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (c) => c.warehouse },
            { key: "location", label: "Location", muted: true, cell: (c) => c.location },
            { key: "reason", label: "Reason", muted: true, cell: (c) => c.reason },
            { key: "approvedBy", label: "Approved By", muted: true, cell: (c) => c.approvedBy },
            {
              key: "status",
              label: "Status",
              cell: (c) => <Badge tone={c.status === "Posted" ? "success" : "warning"}>{c.status}</Badge>,
            },
          ],
        },
        {
          type: "note",
          title: "Correction rule",
          text: "การแก้ไข Lot สร้างคู่รายการ Lot Correction Out / In — ล็อตเดิมไม่ถูกลบหรือเขียนทับ",
        },
      ],
    },

    {
      key: "docs",
      label: "Documents",
      blocks: (r, ctx): Block[] => {
        const inbound = lotInbound(r);
        const outbound = lotOutbound(r);
        const returns = lotReturns(r);
        const review = lotRecall(r);

        return [
          {
            type: "docs",
            title: "Lot lifecycle",
            empty: "ยังไม่มีเอกสารที่อ้างถึงล็อตนี้",
            items: [
              {
                name: r.supplier,
                meta: `Supplier · ${r.supplierCode} · ${r.country}`,
              },
              ...inbound.map((d) => ({
                name: d.doc,
                meta: `${d.type} · ${d.status} · ${d.date} · ${fmt(d.qty)} · ${d.user}`,
                onClick: () => ctx.openEntity(d.entity, d.doc),
              })),
              ...outbound
                .filter((o) => o.shipment)
                .map((o) => ({
                  name: o.shipment,
                  meta: `Shipment · ${o.status} · ${o.deliveryDate} · ${fmt(o.shipped)} · ${o.customer}`,
                  onClick: () => ctx.openEntity("shipment", o.shipment),
                })),
              ...returns.map((x) => ({
                name: x.code,
                meta: `Sales Return · ${x.status} · ${fmt(x.received)} · ${x.customer}`,
                onClick: () => ctx.openEntity("sales-return", x.code),
              })),
              ...lotCorrections(r).map((c) => ({
                name: c.code,
                meta: `Lot Correction · ${c.status} · ${c.date} · ${fmt(c.qty)}`,
                onClick: () => ctx.openEntity("stock-adjustment", c.code),
              })),
              ...(review
                ? [
                    {
                      name: review.code,
                      meta: `Recall Review · ${review.status} · ${review.initiatedDate}`,
                    },
                  ]
                : []),
            ],
          },
          {
            type: "entity",
            title: "Related records",
            items: [
              {
                name: r.productName,
                sub: `${r.product} · Product Master`,
                onClick: () => ctx.openEntity("product", r.product),
              },
              ...r.warehouses.map((w) => ({
                name: w,
                sub: "Warehouse",
                onClick: () => ctx.openEntity("warehouse", w),
              })),
              {
                name: "Stock Inquiry",
                sub: "ยอดคงเหลือปัจจุบัน",
                onClick: () => ctx.goto("/m/stock-inquiry"),
              },
              {
                name: "Stock Card",
                sub: "บัญชีแยกประเภทของสินค้า",
                onClick: () => ctx.goto(`/m/product-stock-card/${r.product}`),
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
        const events = [
          r.received && {
            title: "Lot Created",
            detail: `รับเข้าจาก ${r.supplier}${r.grRef ? ` · ${r.grRef}` : ""}`,
            when: r.received,
            kind: "primary",
          },
          ...lotInbound(r).map((d) => ({
            title: d.type,
            detail: `${d.doc} · ${fmt(d.qty)} ${r.unit} · ${d.result}`,
            user: d.user,
            when: d.date,
            kind: "info",
          })),
          ...lotMovements(r)
            .slice(0, 15)
            .map((m) => ({
              title: m.type,
              detail: `${m.sourceDoc || m.whLabel} · คงเหลือ ${fmt(m.balanceAfter)}`,
              user: m.user,
              when: m.when,
              kind: m.direction === "In" ? "primary" : m.direction === "Out" ? "info" : "warn",
            })),
          ...lotReturns(r).map((x) => ({
            title: "Returned",
            detail: `${x.code} · ${fmt(x.received)} ${r.unit} · ${x.customer}`,
            when: "",
            kind: "warn",
          })),
          r.expiryClass === "Expired" && {
            title: "Expired",
            detail: `หมดอายุเมื่อ ${r.exp}`,
            when: r.exp,
            kind: "warn",
          },
          r.recallRef && {
            title: "Recall Review Started",
            detail: r.recallRef,
            when: lotRecall(r)?.initiatedDate ?? "",
            kind: "warn",
          },
          r.lotStatus === "Depleted" && {
            title: "Depleted",
            detail: "ล็อตนี้ถูกใช้หมดแล้ว",
            when: r.lastMovement,
            kind: "",
          },
        ].filter(Boolean) as { title: string; detail?: string; user?: string; when?: string; kind?: string }[];

        return [{ type: "timeline", title: "Lot Timeline", items: events }];
      },
    },

    {
      key: "audit",
      label: "Audit Log",
      blocks: (r): Block[] => [
        {
          type: "audit",
          title: "Audit Log",
          items: lotMovements(r)
            .slice(0, 10)
            .map((m) => ({
              event: `${m.type} — ${m.code}`,
              user: m.user,
              when: m.when,
              field: "Balance",
              from: fmt(m.balanceBefore),
              to: fmt(m.balanceAfter),
              kind: m.direction === "In" ? "primary" : "info",
            })),
        },
        {
          type: "note",
          title: "Read-only module",
          text: "Lot Tracking ไม่แก้ไขจำนวน วันหมดอายุ สถานะ คลัง หรือผู้ขาย — ทุกการแก้ไขต้องทำผ่านเอกสารต้นทาง",
        },
      ],
    },
  ],

  actions: (rec, ctx) => [
    { label: "เปิด Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
    {
      label: "เปิด Stock Card",
      icon: "sort",
      run: () => ctx.goto(`/m/product-stock-card/${rec.product}`),
    },
    { label: "เปิดข้อมูลสินค้า", icon: "product", run: () => ctx.openEntity("product", rec.product) },
    { sep: true },
    {
      label: "เริ่มการตรวจสอบเรียกคืน",
      icon: "alert",
      danger: true,
      run: () => lotStartRecall(rec, ctx),
    },
    {
      label: "กันสต๊อกเข้า Recall Hold",
      icon: "lock",
      danger: true,
      disabled: !rec.recallRef || rec.available <= 0,
      disabledReason: "ต้องเริ่มการตรวจสอบก่อน และต้องมียอดพร้อมขายคงเหลือ",
      run: () => lotPlaceRecallHold(rec, ctx),
    },
    {
      label: "บันทึกผลการตรวจสอบ",
      icon: "edit",
      disabled: !rec.recallRef,
      run: () => lotAddNote(rec, ctx),
    },
    {
      label: "ปลดการกันสต๊อก",
      icon: "check",
      disabled: !rec.recallRef,
      run: () => lotReleaseHold(rec, ctx),
    },
    {
      label: "ปิดการตรวจสอบ",
      icon: "circleSlash",
      disabled: !rec.recallRef,
      run: () => lotCloseRecall(rec, ctx),
    },
    { sep: true },
    {
      label: "ส่งออกรายชื่อลูกค้า",
      icon: "users",
      disabled: rec.customerCount === 0,
      run: () => lotExportCustomers(rec, ctx),
    },
    { label: "ส่งออกการสอบกลับผู้ขาย", icon: "upload", run: () => lotExport(rec, ctx, "การสอบกลับผู้ขาย") },
    { label: "ส่งออกประวัติการเคลื่อนไหว", icon: "upload", run: () => lotExport(rec, ctx, "ประวัติการเคลื่อนไหว") },
    { label: "พิมพ์รายงานการสอบกลับ", icon: "printer", run: () => lotPrint(rec, ctx) },
  ],
};

export const lotTrackingSchemas: EntitySchemas<LotRow> = { list, detail };
