import {
  EXCEPTION_TYPES,
  INSTALL_STATUSES,
  LIFECYCLE_STATUSES,
  OWNER_TYPES,
  PHYSICAL_STATUSES,
  RETURN_DISPOSITIONS,
  SERVICE_TYPES,
  WARRANTY_EXPIRING_DAYS,
  WARRANTY_STATUSES,
} from "@/data/serials";
import { fmt, money, money0 } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  EXCEPTION_TONE,
  LIFECYCLE_TONE,
  OWNER_TONE,
  PHYSICAL_TONE,
  WARRANTY_TONE,
  canSeeCost,
  duplicateSources,
  openExceptions,
  replacementValid,
  serialClaims,
  serialCorrections,
  serialCustomers,
  serialDocs,
  serialExceptions,
  serialInbound,
  serialInstall,
  serialLocationHistory,
  serialMovements,
  serialOutbound,
  serialReplacements,
  serialReturns,
  serialRows,
  serialService,
  serialSummary,
  serialTimeline,
  serialsNamed,
  statusIssues,
  warrantyWatch,
  type SerialRow,
} from "@/lib/domain/serial";
import {
  openException,
  serialAddExceptionNote,
  serialBulk,
  serialCloseException,
  serialCreateAdjustment,
  serialCreateInstall,
  serialCreateServiceRequest,
  serialEscalate,
  serialExport,
  serialOpenClaim,
  serialPrint,
  serialRequestMasterReview,
  serialScan,
  serialStartInvestigation,
} from "@/lib/workflows-serial";
import { Badge, Thumb } from "@/components/ui";

/* ============================================================
   SERIAL TRACKING — one unit, its whole life on one page.

   Read-only about inventory: the schema offers no create, no edit,
   no delete and no field a user can type into. A correction leaves
   here as a Stock Adjustment draft; everything else is a record of
   what other modules already did.
   ============================================================ */

const uniq = (v: (string | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

const dash = (v: string) => v || "—";

const warrantyCell = (r: SerialRow) =>
  r.warrantyEnd ? (
    <span className="flex flex-col">
      <span>{r.warrantyEnd}</span>
      <span
        className={
          r.warrantyDays !== null && r.warrantyDays < 0
            ? "text-cap font-semibold text-danger"
            : r.warrantyDays !== null && r.warrantyDays <= WARRANTY_EXPIRING_DAYS
              ? "text-cap font-semibold text-warning"
              : "text-cap text-ink-3"
        }
      >
        {r.warrantyDays === null
          ? "—"
          : r.warrantyDays < 0
            ? `หมดแล้ว ${Math.abs(r.warrantyDays)} วัน`
            : `อีก ${r.warrantyDays} วัน`}
      </span>
    </span>
  ) : (
    <span className="text-ink-3">ยังไม่เริ่มรับประกัน</span>
  );

/* ---------- List ---------- */

const list: ListSchema<SerialRow> = {
  key: "serial-tracking",
  entity: "Serial",
  entityPlural: "serials",
  title: "Serial Tracking",
  subtitle:
    "Trace serialized inventory from supplier receipt through warehouse movement, customer delivery, installation, return, repair, and replacement.",
  crumb: "Serial Tracking",
  crumbParent: "Inventory",
  primaryLabel: "",
  searchPlaceholder:
    "ค้นหา Serial / สินค้า / บาร์โค้ด / ผู้ขาย / ใบสั่งซื้อ / ใบรับ / QC / คลัง / คำสั่งขาย / ใบส่งของ / ลูกค้า / ใบแจ้งซ่อม / การเคลม",
  emptyTitle: "ไม่พบหมายเลขเครื่องที่ตรงกับเงื่อนไข",

  /* A serial is created by receiving goods, never from this screen. */
  hideImportExport: true,
  hideCreate: true,

  source: serialRows,

  searchFields: [
    "serial",
    "mfrSerial",
    "product",
    "productName",
    "barcode",
    "brand",
    "model",
    "supplier",
    "supplierCode",
    "poRef",
    "grRef",
    "qcRef",
    "paRef",
    "warehouse",
    "location",
    "soRef",
    "shipRef",
    "invRef",
    "customer",
    "customerCode",
    "installRef",
    "serviceJob",
    "returnRef",
    "claimRef",
    "correctedFrom",
    "correctedTo",
    "exceptionRef",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "available", label: "พร้อมขาย", test: (r) => r.physical === "Available" },
    { key: "reserved", label: "ถูกจอง", test: (r) => r.physical === "Reserved" },
    { key: "qc", label: "ติด QC", test: (r) => r.physical === "QC Hold" },
    { key: "transit", label: "ระหว่างขนส่ง", test: (r) => r.physical === "In Transit" },
    { key: "delivered", label: "ส่งมอบแล้ว", test: (r) => r.lifecycle === "Delivered" },
    { key: "installed", label: "ติดตั้งแล้ว", test: (r) => r.lifecycle === "Installed" },
    { key: "returned", label: "รับคืน", test: (r) => r.physical === "Return Hold" },
    { key: "repair", label: "ซ่อม", test: (r) => r.physical === "Service Hold" },
    {
      key: "warranty",
      label: "รับประกันอยู่",
      test: (r) => r.warrantyStatus === "Active",
    },
    {
      key: "expiring",
      label: "ประกันใกล้หมด",
      test: (r) => r.warrantyStatus === "Expiring Soon",
    },
    { key: "blocked", label: "ระงับ", test: (r) => r.lifecycle === "Blocked" },
    { key: "scrapped", label: "ตัดออก", test: (r) => r.lifecycle === "Scrapped" },
    { key: "corrected", label: "แก้ไขหมายเลข", test: (r) => r.correctionCount > 0 },
  ],

  filters: [
    {
      id: "lifecycle",
      label: "Lifecycle Status",
      options: () => [...LIFECYCLE_STATUSES],
      test: (r, v) => r.lifecycle === v,
    },
    {
      id: "physical",
      label: "Physical Stock Status",
      options: () => [...PHYSICAL_STATUSES],
      test: (r, v) => r.physical === v,
    },
    {
      id: "ownerType",
      label: "Current Owner Type",
      options: () => [...OWNER_TYPES],
      test: (r, v) => r.ownerType === v,
    },
    {
      id: "product",
      label: "Product",
      options: () => uniq(serialRows().map((r) => r.product)),
      test: (r, v) => r.product === v,
    },
    {
      id: "cat",
      label: "Product Category",
      options: () => uniq(serialRows().map((r) => r.cat)),
      test: (r, v) => r.cat === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(serialRows().map((r) => r.brand)),
      test: (r, v) => r.brand === v,
    },
    {
      id: "supplier",
      label: "Supplier",
      options: () => uniq(serialRows().map((r) => r.supplier)),
      test: (r, v) => r.supplier === v,
    },
    {
      id: "manufacturer",
      label: "Manufacturer",
      options: () => uniq(serialRows().map((r) => r.manufacturer)),
      test: (r, v) => r.manufacturer === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => uniq(serialRows().map((r) => r.warehouse)),
      test: (r, v) => r.warehouse === v,
    },
    {
      id: "zone",
      label: "Zone",
      options: () => uniq(serialRows().map((r) => r.zone)),
      test: (r, v) => r.zone === v,
    },
    {
      id: "rack",
      label: "Rack",
      options: () => uniq(serialRows().map((r) => r.rack)),
      test: (r, v) => r.rack === v,
    },
    {
      id: "shelf",
      label: "Shelf",
      options: () => uniq(serialRows().map((r) => r.shelf)),
      test: (r, v) => r.shelf === v,
    },
    {
      id: "bin",
      label: "Bin",
      options: () => uniq(serialRows().map((r) => r.bin)).slice(0, 60),
      test: (r, v) => r.bin === v,
    },
    {
      id: "received",
      label: "Received Date",
      options: () => uniq(serialRows().map((r) => r.receivedDate)),
      test: (r, v) => r.receivedDate === v,
    },
    {
      id: "delivered",
      label: "Delivery Date",
      options: () => uniq(serialRows().map((r) => r.deliveryDate)),
      test: (r, v) => r.deliveryDate === v,
    },
    {
      id: "installed",
      label: "Installation Date",
      options: () => uniq(serialRows().map((r) => r.installDate)),
      test: (r, v) => r.installDate === v,
    },
    {
      id: "warrantyStatus",
      label: "Warranty Status",
      options: () => [...WARRANTY_STATUSES],
      test: (r, v) => r.warrantyStatus === v,
    },
    {
      id: "warrantyEnd",
      label: "Warranty Expiry",
      options: () => uniq(serialRows().map((r) => r.warrantyEnd)),
      test: (r, v) => r.warrantyEnd === v,
    },
    {
      id: "customer",
      label: "Customer",
      options: () => uniq(serialRows().map((r) => r.customer)),
      test: (r, v) => r.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Representative",
      options: () => uniq(serialRows().map((r) => r.salesRep)),
      test: (r, v) => r.salesRep === v,
    },
    {
      id: "installStatus",
      label: "Installation Status",
      options: () => [...INSTALL_STATUSES],
      test: (r, v) => r.installStatus === v,
    },
    {
      id: "repairOnly",
      label: "Under Repair Only",
      options: yesNo,
      test: (r) => r.physical === "Service Hold",
    },
    {
      id: "returnedOnly",
      label: "Returned Only",
      options: yesNo,
      test: (r) => r.returnCount > 0,
    },
    {
      id: "correctedOnly",
      label: "Corrected Only",
      options: yesNo,
      test: (r) => r.correctionCount > 0,
    },
    {
      id: "exceptionOnly",
      label: "Missing / Exception Only",
      options: yesNo,
      test: (r) => r.exceptionCount > 0 || r.conflict || r.duplicate,
    },
    {
      id: "myWarehouse",
      label: "My Warehouse",
      options: () => uniq(serialRows().map((r) => r.warehouse)),
      test: (r, v) => r.warehouse === v,
    },
    {
      id: "myCustomers",
      label: "My Customers",
      options: () => uniq(serialRows().map((r) => r.salesRep)),
      test: (r, v) => r.salesRep === v,
    },
  ],

  columns: [
    { key: "icon", label: "", cell: (r) => <Thumb size={30}>{r.icon}</Thumb> },
    {
      key: "serial",
      label: "Serial Number",
      sortable: true,
      locked: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold">{r.serial}</span>
          <span className="text-cap text-ink-3">{r.mfrSerial}</span>
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
          <span className="text-cap text-ink-3">{r.model}</span>
        </span>
      ),
    },
    { key: "brand", label: "Brand", muted: true, defaultHidden: true, cell: (r) => dash(r.brand) },
    { key: "cat", label: "Category", muted: true, defaultHidden: true, cell: (r) => dash(r.cat) },
    {
      key: "lifecycle",
      label: "Lifecycle Status",
      sortable: true,
      cell: (r) => <Badge tone={LIFECYCLE_TONE[r.lifecycle] ?? "neutral"}>{r.lifecycle}</Badge>,
    },
    {
      key: "physical",
      label: "Physical Stock Status",
      sortable: true,
      cell: (r) => <Badge tone={PHYSICAL_TONE[r.physical] ?? "neutral"}>{r.physical}</Badge>,
    },
    {
      key: "warehouse",
      label: "Current Warehouse",
      sortable: true,
      cell: (r) =>
        r.warehouse ? (
          <span className="flex flex-col">
            <span>{r.warehouse}</span>
            <span className="text-cap text-ink-3">{r.whName}</span>
          </span>
        ) : (
          <span className="text-ink-3">ไม่อยู่ในคลัง</span>
        ),
    },
    { key: "location", label: "Current Location", muted: true, cell: (r) => dash(r.location) },
    {
      key: "customer",
      label: "Current Customer",
      sortable: true,
      cell: (r) => (r.ownerType === "Customer" ? r.customer : dash("")),
    },
    { key: "supplier", label: "Supplier", muted: true, defaultHidden: true, cell: (r) => r.supplier },
    { key: "receivedDate", label: "Received Date", muted: true, defaultHidden: true, cell: (r) => dash(r.receivedDate) },
    { key: "grRef", label: "Goods Receipt", muted: true, defaultHidden: true, cell: (r) => dash(r.grRef) },
    {
      key: "qcResult",
      label: "QC Result",
      defaultHidden: true,
      cell: (r) => (
        <Badge tone={r.qcResult === "Passed" ? "success" : r.qcResult === "Failed" ? "danger" : "warning"}>
          {r.qcResult}
        </Badge>
      ),
    },
    { key: "soRef", label: "Sales Order", muted: true, defaultHidden: true, cell: (r) => dash(r.soRef) },
    { key: "shipRef", label: "Shipment", muted: true, defaultHidden: true, cell: (r) => dash(r.shipRef) },
    { key: "deliveryDate", label: "Delivery Date", muted: true, cell: (r) => dash(r.deliveryDate) },
    { key: "installDate", label: "Installation Date", muted: true, defaultHidden: true, cell: (r) => dash(r.installDate) },
    { key: "warrantyStart", label: "Warranty Start", muted: true, defaultHidden: true, cell: (r) => dash(r.warrantyStart) },
    {
      key: "warrantyEnd",
      label: "Warranty End",
      sortable: true,
      sortValue: (r) => r.warrantyDays ?? 1e9,
      cell: warrantyCell,
    },
    {
      key: "warrantyStatus",
      label: "Warranty Status",
      cell: (r) => <Badge tone={WARRANTY_TONE[r.warrantyStatus] ?? "neutral"}>{r.warrantyStatus}</Badge>,
    },
    { key: "returnRef", label: "Return Number", muted: true, defaultHidden: true, cell: (r) => dash(r.returnRef) },
    { key: "serviceJob", label: "Service Job", muted: true, defaultHidden: true, cell: (r) => dash(r.serviceJob) },
    {
      key: "replacedBy",
      label: "Replacement Serial",
      muted: true,
      defaultHidden: true,
      cell: (r) => dash(r.replacedBy),
    },
    {
      key: "unitCost",
      label: "Unit Cost",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => (canSeeCost() ? money(r.unitCost) : "—"),
    },
    { key: "lastMovement", label: "Last Movement", muted: true, cell: (r) => dash(r.lastMovement) },
    { key: "updated", label: "Updated At", muted: true, defaultHidden: true, cell: (r) => dash(r.updated) },
  ],

  secondaryActions: (ctx) => [
    {
      label: "Export Excel",
      icon: "upload",
      run: () =>
        ctx.toast(
          "ส่งออก Excel",
          `เตรียมไฟล์ ${fmt(serialRows().length)} หมายเลข — Future support`,
          "info",
        ),
    },
    {
      label: "Export CSV",
      icon: "download",
      run: () => ctx.toast("ส่งออก CSV", "เตรียมไฟล์ตามคอลัมน์ที่แสดงอยู่ — Future support", "info"),
    },
    {
      label: "Print",
      icon: "printer",
      run: () => ctx.toast("พิมพ์รายงานหมายเลขเครื่อง", "Future support", "info"),
    },
    { label: "Scan Serial", icon: "barcode", run: () => serialScan(ctx) },
    {
      label: "Warranty Monitoring",
      icon: "shield",
      run: () => {
        const watch = warrantyWatch();
        ctx.toast(
          "เฝ้าระวังการรับประกัน",
          `หมดประกันแล้ว ${watch.filter((x) => x.warrantyStatus === "Expired").length} · ใกล้หมด ${
            watch.filter((x) => x.warrantyStatus === "Expiring Soon").length
          } เครื่อง`,
          "warning",
        );
      },
    },
  ],

  hero: (ctx) => {
    const s = serialSummary();
    return {
      kpis: [
        { icon: "barcode", label: "Total Serials", value: fmt(s.total) },
        { icon: "checkCircle", label: "Available", value: fmt(s.available), tone: "ok", goTab: "available" },
        { icon: "lock", label: "Reserved", value: fmt(s.reserved), goTab: "reserved" },
        { icon: "truck", label: "In Transit", value: fmt(s.inTransit), goTab: "transit" },
        { icon: "delivery", label: "Delivered", value: fmt(s.delivered), goTab: "delivered" },
        { icon: "warehouse", label: "Installed", value: fmt(s.installed), goTab: "installed" },
        { icon: "return", label: "Return Hold", value: fmt(s.returnHold), tone: "warn", goTab: "returned" },
        { icon: "settings", label: "Under Repair", value: fmt(s.underRepair), tone: "warn", goTab: "repair" },
        { icon: "shield", label: "Warranty Active", value: fmt(s.warrantyActive), tone: "ok", goTab: "warranty" },
        {
          icon: "clock",
          label: "Warranty Expiring",
          value: fmt(s.warrantyExpiring),
          tone: "warn",
          goTab: "expiring",
          sub: `ภายใน ${WARRANTY_EXPIRING_DAYS} วัน`,
        },
        { icon: "circleSlash", label: "Blocked", value: fmt(s.blocked), tone: "warn", goTab: "blocked" },
        {
          icon: "trash",
          label: "Scrapped",
          value: fmt(s.scrapped),
          goTab: "scrapped",
          run: () =>
            ctx.toast(
              "Scrapped Serials",
              "หมายเลขที่ตัดออกแล้วจะกลับมาพร้อมขายไม่ได้ ต้องกลับรายการใบปรับปรุงเท่านั้น",
              "info",
            ),
        },
      ],
    };
  },

  panels: (rows, ctx) => {
    const flagged = rows.filter((r) => r.conflict || r.duplicate || r.exceptionCount > 0);
    const open = openExceptions();
    const watch = warrantyWatch().slice(0, 8);

    return [
      flagged.length > 0 && {
        type: "alert",
        tone: "danger",
        title: `พบข้อมูลหมายเลขเครื่องที่ต้องตรวจสอบ ${fmt(flagged.length)} รายการ`,
        message:
          "หมายเลขซ้ำ ความเป็นเจ้าของขัดแย้ง หรือหาเครื่องไม่พบ — เปิดเรื่องสอบสวนก่อนแก้ไขผ่านใบปรับปรุงสต๊อก",
      },
      open.length > 0 && {
        type: "table",
        title: "Serial Exception Review",
        rows: open,
        cols: [
          { key: "code", label: "Exception", cell: (x) => <span className="font-semibold">{x.code}</span> },
          { key: "serial", label: "Serial", cell: (x) => x.serial },
          { key: "product", label: "Product", muted: true, cell: (x) => x.product },
          { key: "type", label: "Type", cell: (x) => x.type },
          {
            key: "severity",
            label: "Severity",
            cell: (x) => (
              <Badge tone={x.severity === "Critical" || x.severity === "High" ? "danger" : "warning"}>
                {x.severity}
              </Badge>
            ),
          },
          { key: "responsible", label: "Responsible", muted: true, cell: (x) => x.responsible },
          { key: "followUp", label: "Follow-Up", muted: true, cell: (x) => dash(x.followUp) },
          {
            key: "status",
            label: "Status",
            cell: (x) => <Badge tone={EXCEPTION_TONE[x.status] ?? "neutral"}>{x.status}</Badge>,
          },
        ],
      },
      watch.length > 0 && {
        type: "table",
        title: "Warranty Watch",
        rows: watch,
        cols: [
          {
            key: "serial",
            label: "Serial",
            cell: (x) => (
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => ctx.goto(`/m/serial-tracking/${encodeURIComponent(x.code)}`)}
              >
                {x.serial}
              </button>
            ),
          },
          { key: "productName", label: "Product", cell: (x) => x.productName },
          { key: "customer", label: "Customer", muted: true, cell: (x) => dash(x.customer) },
          { key: "warrantyEnd", label: "Warranty End", cell: (x) => x.warrantyEnd },
          {
            key: "warrantyDays",
            label: "Days",
            align: "right",
            cell: (x) => (x.warrantyDays === null ? "—" : fmt(x.warrantyDays)),
          },
          {
            key: "warrantyStatus",
            label: "Status",
            cell: (x) => <Badge tone={WARRANTY_TONE[x.warrantyStatus] ?? "neutral"}>{x.warrantyStatus}</Badge>,
          },
        ],
      },
    ];
  },

  rowActions: (rec, ctx) => [
    {
      label: "เปิดการสอบกลับ",
      icon: "eye",
      run: () => ctx.goto(`/m/serial-tracking/${encodeURIComponent(rec.code)}`),
    },
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
      disabledReason: "หมายเลขนี้ไม่มีใบรับสินค้าที่อ้างอิงได้",
      run: () => ctx.openEntity("goods-receipt", rec.grRef),
    },
    {
      label: "เปิดใบส่งของ",
      icon: "truck",
      disabled: !rec.shipRef,
      disabledReason: "หมายเลขนี้ยังไม่ถูกส่งออก",
      run: () => ctx.openEntity("shipment", rec.shipRef),
    },
    { sep: true },
    {
      label: "เริ่มการสอบสวน",
      icon: "alert",
      danger: true,
      run: () => serialStartInvestigation(rec, ctx),
    },
    { label: "ส่งออกการสอบกลับ", icon: "upload", run: () => serialExport(rec, ctx, "การสอบกลับ") },
    { label: "พิมพ์", icon: "printer", run: () => serialPrint(rec, ctx) },
  ],

  bulkActions: serialBulk,
};

/* ---------- Detail ---------- */

const docTable = (r: SerialRow) => serialDocs(r);

const detail: DetailSchema<SerialRow> = {
  key: "serial-tracking",
  entityLabel: "Serial",

  identity: (r) => ({
    image: <Thumb size={44}>{r.icon}</Thumb>,
    code: r.serial,
    title: r.productName,
    copyFields: [
      { label: "Serial Number", value: r.serial },
      { label: "Product Code", value: r.product },
      ...(r.mfrSerial ? [{ label: "Manufacturer Serial", value: r.mfrSerial }] : []),
    ],
    badges: [
      { text: r.lifecycle, tone: LIFECYCLE_TONE[r.lifecycle] ?? "neutral" },
      { text: r.physical, tone: PHYSICAL_TONE[r.physical] ?? "neutral" },
      { text: r.warrantyStatus, tone: WARRANTY_TONE[r.warrantyStatus] ?? "neutral" },
      { text: r.ownerType, tone: OWNER_TONE[r.ownerType] ?? "neutral" },
      ...(r.conflict ? [{ text: "Ownership Conflict", tone: "danger" as const }] : []),
      ...(r.duplicate ? [{ text: "Duplicate Serial", tone: "danger" as const }] : []),
    ],
    tags: [r.ownerType, r.owner || "—", r.cat].filter(Boolean),
  }),

  kpis: (r) => [
    { icon: "warehouse", label: "Current Location", value: r.location || r.owner || "—", wide: true },
    { icon: "user", label: "Current Customer", value: r.customer || "—", goTab: "customer" },
    {
      icon: "shield",
      label: "Warranty Days Left",
      value: r.warrantyDays === null ? "—" : fmt(r.warrantyDays),
      sub: r.warrantyEnd || "ยังไม่เริ่ม",
      goTab: "warranty",
    },
    { icon: "settings", label: "Service Jobs", value: fmt(r.serviceCount), goTab: "service" },
    { icon: "return", label: "Returns", value: fmt(r.returnCount), goTab: "returns" },
  ],

  actions: (rec, ctx) => [
    { label: "เปิด Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
    {
      label: "เปิด Stock Card",
      icon: "sort",
      run: () => ctx.goto(`/m/product-stock-card/${rec.product}`),
    },
    {
      label: "เปิดสินค้าต้นแบบ",
      icon: "product",
      disabled: rec.isEquipment,
      disabledReason: "อุปกรณ์ที่ประกาศไว้ยังไม่มีในทะเบียนสินค้า",
      run: () => ctx.openEntity("product", rec.product),
    },
    {
      label: "เปิดลูกค้า",
      icon: "partner",
      disabled: !rec.customerCode,
      disabledReason: "หมายเลขนี้ยังไม่ถูกส่งมอบให้ลูกค้า",
      run: () =>
        ctx.toast("ข้อมูลลูกค้า", `${rec.customerCode} · ${rec.customer}`, "info"),
    },
    { sep: true },
    { label: "เริ่มการสอบสวน", icon: "alert", danger: true, run: () => serialStartInvestigation(rec, ctx) },
    {
      label: "บันทึกผลการสอบสวน",
      icon: "edit",
      disabled: !openException(rec),
      disabledReason: "ยังไม่มีเรื่องสอบสวนที่เปิดอยู่",
      run: () => serialAddExceptionNote(rec, ctx),
    },
    {
      label: "ตั้งใบปรับปรุงสต๊อก",
      icon: "sliders",
      danger: true,
      disabled: !openException(rec),
      disabledReason: "ต้องเปิดเรื่องสอบสวนก่อน",
      run: () => serialCreateAdjustment(rec, ctx),
    },
    {
      label: "ขอตรวจสอบข้อมูลหลัก",
      icon: "file",
      disabled: !openException(rec),
      disabledReason: "ต้องเปิดเรื่องสอบสวนก่อน",
      run: () => serialRequestMasterReview(rec, ctx),
    },
    {
      label: "ยกระดับเรื่อง",
      icon: "trend",
      danger: true,
      disabled: !openException(rec),
      disabledReason: "ต้องเปิดเรื่องสอบสวนก่อน",
      run: () => serialEscalate(rec, ctx),
    },
    {
      label: "ปิดเรื่องสอบสวน",
      icon: "checkCircle",
      disabled: !openException(rec),
      disabledReason: "ไม่มีเรื่องที่เปิดอยู่",
      run: () => serialCloseException(rec, ctx),
    },
    { sep: true },
    { label: "บันทึกการติดตั้ง", icon: "calendar", run: () => serialCreateInstall(rec, ctx) },
    { label: "เปิดใบแจ้งซ่อม", icon: "settings", run: () => serialCreateServiceRequest(rec, ctx) },
    { label: "เปิดใบเคลมผู้ขาย", icon: "shield", run: () => serialOpenClaim(rec, ctx) },
    { label: "ส่งออกการสอบกลับ", icon: "upload", run: () => serialExport(rec, ctx, "การสอบกลับ") },
    { label: "พิมพ์รายงาน", icon: "printer", run: () => serialPrint(rec, ctx) },
  ],

  tabs: [
    /* ---------- 1. Overview ---------- */
    {
      key: "overview",
      label: "Overview",
      blocks: (r): Block[] => [
        ...statusIssues(r).map(
          (i) =>
            ({
              type: "alert",
              tone: "danger",
              title: i.title,
              message: i.detail,
            }) as Block,
        ),
        Boolean(r.note) && { type: "note", title: "หมายเหตุ", text: r.note },
        {
          type: "fields",
          title: "Serial Information",
          cols: 2,
          items: [
            { label: "Serial Number", value: r.serial },
            { label: "Manufacturer Serial Number", value: dash(r.mfrSerial) },
            { label: "Product Code", value: r.product },
            { label: "Product Name", value: r.productName },
            { label: "Brand", value: dash(r.brand) },
            { label: "Category", value: dash(r.cat) },
            { label: "Model", value: dash(r.model) },
            { label: "UOM", value: r.unit },
            { label: "Lifecycle Status", value: r.lifecycle },
            { label: "Created From Document", value: dash(r.grRef) },
          ],
        },
        {
          type: "fields",
          title: "Source Information",
          cols: 2,
          items: [
            { label: "Supplier", value: `${r.supplierCode} ${r.supplier}` },
            { label: "Manufacturer", value: r.manufacturer },
            { label: "Purchase Order", value: dash(r.poRef) },
            { label: "Goods Receipt", value: dash(r.grRef) },
            { label: "Received Date", value: dash(r.receivedDate) },
            { label: "QC Inspection", value: dash(r.qcRef) },
            { label: "QC Result", value: r.qcResult },
            { label: "Initial Warehouse", value: dash(r.initialWarehouse) },
            { label: "Initial Location", value: dash(r.initialLocation), span: true },
          ],
        },
        {
          type: "fields",
          title: "Current Assignment",
          cols: 2,
          items: [
            { label: "Physical Stock Status", value: r.physical },
            { label: "Current Warehouse", value: r.warehouse || "ไม่อยู่ในคลัง" },
            { label: "Current Location", value: dash(r.location) },
            { label: "Current Customer", value: dash(r.customer) },
            { label: "Sales Order", value: dash(r.soRef) },
            { label: "Shipment", value: dash(r.shipRef) },
            { label: "Delivery Date", value: dash(r.deliveryDate) },
            { label: "Installation Reference", value: dash(r.installRef) },
            { label: "Assigned Sales Representative", value: dash(r.salesRep), span: true },
          ],
        },
        {
          type: "fields",
          title: "Warranty and Service",
          cols: 2,
          items: [
            { label: "Warranty Type", value: r.warrantyType },
            { label: "Warranty Start", value: dash(r.warrantyStart) },
            { label: "Warranty End", value: dash(r.warrantyEnd) },
            {
              label: "Days Remaining",
              value: r.warrantyDays === null ? "—" : `${fmt(r.warrantyDays)} วัน`,
            },
            { label: "Warranty Status", value: r.warrantyStatus },
            { label: "Service Job Count", value: fmt(r.serviceCount) },
            { label: "Return Count", value: fmt(r.returnCount) },
            { label: "Repair Count", value: fmt(r.repairCount) },
            { label: "Replacement Status", value: r.replacementStatus, span: true },
          ],
        },
        canSeeCost()
          ? {
              type: "cards",
              title: "Cost Preview",
              cols: 3,
              items: [
                { label: "Unit Cost", value: money(r.unitCost), tone: "accent" },
                { label: "Inventory Value", value: money0(r.physical === "Available" ? r.unitCost : 0) },
                { label: "Quantity", value: "1", sub: r.unit },
              ],
            }
          : { type: "restricted", title: "Cost Preview" },
      ],
      aside: (r) => ({
        rows: [
          { icon: "barcode", label: "Serial", value: r.serial },
          { icon: "product", label: "Product", value: r.product, muted: true },
          { icon: "tag", label: "Lifecycle", value: r.lifecycle },
          { icon: "box", label: "Stock Status", value: r.physical },
          { icon: "user", label: "Owner", value: r.owner || "—" },
          { icon: "warehouse", label: "Location", value: r.location || "—", muted: true },
          { icon: "shield", label: "Warranty", value: r.warrantyStatus },
          { icon: "clock", label: "Last Movement", value: dash(r.lastMovement), muted: true },
        ],
      }),
    },

    /* ---------- 2. Current status ---------- */
    {
      key: "status",
      label: "Current Status",
      blocks: (r): Block[] => {
        const issues = statusIssues(r);
        return [
          issues.length === 0
            ? {
                type: "alert",
                tone: "success",
                title: "สถานะปัจจุบันสอดคล้องกัน",
                message: "หมายเลขนี้มีเจ้าของและตำแหน่งเดียวตามที่ควรเป็น",
              }
            : {
                type: "alert",
                tone: "danger",
                title: issues[0].title,
                message: issues.map((i) => i.detail).join(" · "),
              },
          {
            type: "fields",
            title: "Current State",
            cols: 2,
            items: [
              { label: "Lifecycle Status", value: r.lifecycle },
              { label: "Physical Stock Status", value: r.physical },
              { label: "Current Owner Type", value: r.ownerType },
              { label: "Current Owner", value: r.owner || "—" },
              { label: "Current Warehouse", value: r.warehouse || "ไม่อยู่ในคลัง" },
              { label: "Current Location", value: dash(r.location) },
              { label: "Current Customer", value: dash(r.customer) },
              { label: "Last Movement", value: dash(r.lastMovement) },
              { label: "Last Verified Date", value: dash(r.lastVerified), span: true },
            ],
          },
          {
            type: "flags",
            title: "Open Documents",
            cols: 2,
            items: [
              { label: `Open Reservation ${r.openReservation || ""}`.trim(), value: Boolean(r.openReservation) },
              { label: `Open Transfer ${r.openTransfer || ""}`.trim(), value: Boolean(r.openTransfer) },
              { label: `Open Return ${r.openReturn || ""}`.trim(), value: Boolean(r.openReturn) },
              { label: `Open Service Job ${r.openServiceJob || ""}`.trim(), value: Boolean(r.openServiceJob) },
              { label: `Open Claim ${r.openClaim || ""}`.trim(), value: Boolean(r.openClaim) },
            ],
          },
          {
            type: "fields",
            title: "In Transit",
            cols: 2,
            items: [
              { label: "In Transit From", value: dash(r.transitFrom) },
              { label: "In Transit To", value: dash(r.transitTo) },
              { label: "Last Count Date", value: dash(r.lastCount) },
              { label: "Quantity", value: "1", muted: true },
            ],
          },
        ];
      },
    },

    /* ---------- 3. Location history ---------- */
    {
      key: "location",
      label: "Location History",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Location History",
          rows: serialLocationHistory(r),
          empty: "ยังไม่มีประวัติการเคลื่อนย้ายของหมายเลขนี้",
          cols: [
            { key: "when", label: "Date and Time", cell: (x) => x.when },
            { key: "event", label: "Event", cell: (x) => <span className="font-semibold">{x.event}</span> },
            { key: "whFrom", label: "Warehouse From", muted: true, cell: (x) => dash(x.whFrom) },
            { key: "locFrom", label: "Location From", muted: true, cell: (x) => dash(x.locFrom) },
            { key: "whTo", label: "Warehouse To", muted: true, cell: (x) => dash(x.whTo) },
            { key: "locTo", label: "Location To", muted: true, cell: (x) => dash(x.locTo) },
            { key: "statusBefore", label: "Stock Status Before", muted: true, cell: (x) => dash(x.statusBefore) },
            { key: "statusAfter", label: "Stock Status After", cell: (x) => dash(x.statusAfter) },
            { key: "transfer", label: "Transfer Number", muted: true, cell: (x) => dash(x.transfer) },
            { key: "movement", label: "Movement Number", muted: true, cell: (x) => dash(x.movement) },
            {
              key: "doc",
              label: "Document",
              cell: (x) =>
                x.doc && x.entity ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => ctx.openEntity(x.entity, x.doc)}
                  >
                    {x.doc}
                  </button>
                ) : (
                  dash(x.doc)
                ),
            },
            { key: "user", label: "User", muted: true, cell: (x) => x.user },
          ],
        },
        {
          type: "note",
          title: "ทำไมแก้ไขไม่ได้",
          text: "ประวัติตำแหน่งสร้างขึ้นจากเอกสารที่บันทึกไปแล้ว การแก้ไขต้องทำที่เอกสารต้นทางหรือใบปรับปรุงสต๊อก",
        },
      ],
    },

    /* ---------- 4. Movement history ---------- */
    {
      key: "movement",
      label: "Movement History",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Serial Movement History",
          rows: serialMovements(r),
          empty: "ยังไม่มีรายการเคลื่อนไหวของหมายเลขนี้",
          cols: [
            { key: "when", label: "Date and Time", cell: (x) => x.when },
            { key: "movement", label: "Movement Number", muted: true, cell: (x) => dash(x.movement) },
            { key: "type", label: "Movement Type", cell: (x) => <span className="font-semibold">{x.type}</span> },
            {
              key: "doc",
              label: "Source Document",
              cell: (x) =>
                x.doc && x.entity ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => ctx.openEntity(x.entity, x.doc)}
                  >
                    {x.doc}
                  </button>
                ) : (
                  dash(x.doc)
                ),
            },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (x) => dash(x.warehouse) },
            { key: "fromLoc", label: "From Location", muted: true, cell: (x) => dash(x.fromLoc) },
            { key: "toLoc", label: "To Location", muted: true, cell: (x) => dash(x.toLoc) },
            { key: "statusBefore", label: "Status Before", muted: true, cell: (x) => dash(x.statusBefore) },
            { key: "statusAfter", label: "Status After", cell: (x) => dash(x.statusAfter) },
            { key: "qtyIn", label: "Qty In", align: "right", cell: (x) => (x.qtyIn ? fmt(x.qtyIn) : "—") },
            { key: "qtyOut", label: "Qty Out", align: "right", cell: (x) => (x.qtyOut ? fmt(x.qtyOut) : "—") },
            {
              key: "balanceAfter",
              label: "Balance After",
              align: "right",
              cell: (x) => <span className="font-semibold">{fmt(x.balanceAfter)}</span>,
            },
            { key: "user", label: "User", muted: true, cell: (x) => x.user },
            { key: "reference", label: "Reference", muted: true, cell: (x) => x.reference },
          ],
        },
        {
          type: "note",
          title: "หน่วยนับของหมายเลขเครื่อง",
          text: "หมายเลขเครื่องหนึ่งหมายเลขคือหนึ่งหน่วยเสมอ ยอดคงเหลือจึงเป็น 1 หรือ 0 เท่านั้น",
        },
      ],
    },

    /* ---------- 5. Inbound trace ---------- */
    {
      key: "inbound",
      label: "Inbound Trace",
      blocks: (r, ctx): Block[] => [
        {
          type: "tree",
          title: "Supplier → Available Serial",
          nodes: serialInbound(r).map((s) => ({
            label: `${s.stage} · ${s.doc}`,
            sub: [s.date, s.status, s.place].filter((x) => x && x !== "—").join(" · "),
            badge: s.result,
            badgeTone: s.result === "Failed" ? ("danger" as const) : ("neutral" as const),
          })),
        },
        {
          type: "table",
          title: "Inbound Stages",
          rows: serialInbound(r),
          cols: [
            { key: "stage", label: "Stage", cell: (x) => <span className="font-semibold">{x.stage}</span> },
            {
              key: "doc",
              label: "Document Number",
              cell: (x) =>
                x.entity ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => ctx.openEntity(x.entity, x.doc)}
                  >
                    {x.doc}
                  </button>
                ) : (
                  x.doc
                ),
            },
            { key: "date", label: "Date", muted: true, cell: (x) => dash(x.date) },
            { key: "status", label: "Status", cell: (x) => dash(x.status) },
            { key: "place", label: "Warehouse / Location", muted: true, cell: (x) => dash(x.place) },
            { key: "result", label: "Result", cell: (x) => dash(x.result) },
            { key: "user", label: "User", muted: true, cell: (x) => dash(x.user) },
          ],
        },
        {
          type: "fields",
          title: "Inbound Details",
          cols: 2,
          items: [
            { label: "Supplier", value: `${r.supplierCode} ${r.supplier}` },
            { label: "Manufacturer", value: r.manufacturer },
            { label: "Country of Origin", value: r.country },
            { label: "Purchase Order Line", value: r.poRef ? `${r.poRef} บรรทัดที่ ${r.poLine}` : "—" },
            { label: "Goods Receipt Line", value: r.grRef ? `${r.grRef} บรรทัดที่ ${r.grLine}` : "—" },
            { label: "Received Condition", value: r.receivedCondition },
            { label: "QC Checklist Result", value: r.qcResult },
            { label: "Initial Stock Status", value: r.qcResult === "Passed" ? "Available" : "QC Hold" },
            { label: "COA / Certificate", value: "—", muted: true },
            {
              label: "Initial Cost",
              value: canSeeCost() ? money(r.unitCost) : "ถูกจำกัดสิทธิ์",
              muted: true,
            },
          ],
        },
      ],
    },

    /* ---------- 6. Outbound trace ---------- */
    {
      key: "outbound",
      label: "Outbound Trace",
      blocks: (r, ctx): Block[] => {
        const stages = serialOutbound(r);
        if (!stages.length) {
          return [
            {
              type: "empty",
              heading: "หมายเลขนี้ยังไม่ถูกส่งออก",
              message: "เมื่อมีการจอง หยิบ และส่งของ ขั้นตอนทั้งหมดจะปรากฏที่นี่",
              icon: "truck",
            },
          ];
        }
        return [
          {
            type: "tree",
            title: "Reservation → Customer Delivery",
            nodes: stages.map((s) => ({
              label: `${s.stage} · ${s.doc}`,
              sub: [s.date, s.status, s.place].filter((x) => x && x !== "—").join(" · "),
              badge: s.result,
            })),
          },
          {
            type: "table",
            title: "Outbound Stages",
            rows: stages,
            cols: [
              { key: "stage", label: "Stage", cell: (x) => <span className="font-semibold">{x.stage}</span> },
              {
                key: "doc",
                label: "Document Number",
                cell: (x) =>
                  x.entity ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => ctx.openEntity(x.entity, x.doc)}
                    >
                      {x.doc}
                    </button>
                  ) : (
                    x.doc
                  ),
              },
              { key: "date", label: "Date", muted: true, cell: (x) => dash(x.date) },
              { key: "status", label: "Status", cell: (x) => dash(x.status) },
              { key: "place", label: "Customer", muted: true, cell: (x) => dash(x.place) },
              { key: "result", label: "Result", muted: true, cell: (x) => dash(x.result) },
              { key: "user", label: "User", muted: true, cell: (x) => dash(x.user) },
            ],
          },
          {
            type: "fields",
            title: "Outbound Details",
            cols: 2,
            items: [
              { label: "Sales Order", value: dash(r.soRef) },
              { label: "Customer", value: dash(r.customer) },
              { label: "Reservation Date", value: dash(r.deliveryDate) },
              { label: "Picking Date", value: dash(r.deliveryDate) },
              { label: "Packing Reference", value: dash(r.doRef) },
              { label: "Invoice", value: dash(r.invRef) },
              { label: "Shipment", value: dash(r.shipRef) },
              { label: "Delivery Date", value: dash(r.deliveryDate) },
              { label: "Recipient", value: dash(r.siteContact) },
              { label: "Sales Representative", value: dash(r.salesRep) },
              { label: "Proof of Delivery", value: "—", muted: true, span: true },
            ],
          },
        ];
      },
    },

    /* ---------- 7. Customer ---------- */
    {
      key: "customer",
      label: "Customer",
      blocks: (r, ctx): Block[] => {
        const rows = serialCustomers(r);
        if (!rows.length) {
          return [
            {
              type: "empty",
              heading: "หมายเลขนี้ยังไม่มีลูกค้า",
              message: "ความเป็นเจ้าของจะบันทึกเมื่อส่งมอบให้ลูกค้าแล้ว",
              icon: "users",
            },
          ];
        }
        return [
          {
            type: "table",
            title: "Customer Ownership",
            rows,
            cols: [
              { key: "customerCode", label: "Customer Code", cell: (x) => x.customerCode },
              {
                key: "customer",
                label: "Customer Name",
                cell: (x) => <span className="font-semibold">{x.customer}</span>,
              },
              { key: "type", label: "Customer Type", muted: true, cell: (x) => dash(x.type) },
              {
                key: "soRef",
                label: "Sales Order",
                cell: (x) =>
                  x.soRef ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => ctx.openEntity("sales-order", x.soRef)}
                    >
                      {x.soRef}
                    </button>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "invRef",
                label: "Invoice",
                cell: (x) =>
                  x.invRef ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => ctx.openEntity("sales-invoice", x.invRef)}
                    >
                      {x.invRef}
                    </button>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "shipRef",
                label: "Shipment",
                cell: (x) =>
                  x.shipRef ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => ctx.openEntity("shipment", x.shipRef)}
                    >
                      {x.shipRef}
                    </button>
                  ) : (
                    "—"
                  ),
              },
              { key: "deliveryDate", label: "Delivery Date", muted: true, cell: (x) => dash(x.deliveryDate) },
              { key: "installDate", label: "Installation Date", muted: true, cell: (x) => dash(x.installDate) },
              { key: "returnDate", label: "Return Date", muted: true, cell: (x) => dash(x.returnDate) },
              { key: "status", label: "Ownership Status", cell: (x) => <Badge tone="info">{x.status}</Badge> },
              { key: "rep", label: "Sales Representative", muted: true, cell: (x) => dash(x.rep) },
            ],
          },
          {
            type: "note",
            title: "การเปลี่ยนเจ้าของ",
            text: "ความเป็นเจ้าของเปลี่ยนได้ผ่านการส่งของ การรับคืน หรือการเปลี่ยนเครื่องเท่านั้น ไม่สามารถแก้จากหน้านี้",
          },
        ];
      },
    },

    /* ---------- 8. Installation ---------- */
    {
      key: "installation",
      label: "Installation",
      blocks: (r, ctx): Block[] => {
        const install = serialInstall(r);
        return [
          {
            type: "fields",
            title: "Installation",
            cols: 2,
            items: [
              { label: "Installation Required", value: r.installRequired ? "ต้องติดตั้ง" : "ไม่ต้องติดตั้ง" },
              { label: "Installation Status", value: r.installStatus },
              { label: "Installation Reference", value: dash(r.installRef) },
              { label: "Installation Date", value: dash(r.installDate) },
              { label: "Installed By", value: dash(r.installedBy) },
              { label: "Customer Site", value: dash(r.site) },
              { label: "Site Contact", value: dash(r.siteContact) },
              { label: "Acceptance Result", value: dash(r.acceptance) },
              { label: "Installation Note", value: dash(r.installNote), span: true },
              { label: "Attachment", value: "—", muted: true, span: true },
            ],
          },
          install && {
            type: "docs",
            title: "Installation Record",
            items: [
              {
                name: install.code,
                meta: `${install.status} · ${install.scheduled || "ยังไม่นัดหมาย"} · ${install.installedBy || "ยังไม่มอบหมาย"}`,
                onClick: () =>
                  ctx.toast("บันทึกการติดตั้ง", `${install.code} — โมดูล Service จะรองรับในเฟสถัดไป`, "info"),
              },
            ],
          },
          {
            type: "planned",
            label: "Installation Module",
            message: "การนัดหมาย ตรวจรับ และใบรับรองการติดตั้งจะทำในโมดูล Service",
          },
        ];
      },
    },

    /* ---------- 9. Warranty ---------- */
    {
      key: "warranty",
      label: "Warranty",
      blocks: (r): Block[] => [
        r.warrantyStatus === "Expiring Soon" && {
          type: "alert",
          tone: "warn",
          title: "การรับประกันใกล้หมดอายุ",
          message: `เหลืออีก ${fmt(r.warrantyDays ?? 0)} วัน — ควรเสนอสัญญาบริการต่อเนื่องให้ลูกค้า`,
        },
        r.warrantyStatus === "Expired" && {
          type: "alert",
          tone: "danger",
          title: "หมดการรับประกันแล้ว",
          message: "งานบริการหลังจากนี้จะคิดค่าใช้จ่ายตามอัตราปกติ",
        },
        {
          type: "fields",
          title: "Warranty",
          cols: 2,
          items: [
            { label: "Warranty Type", value: r.warrantyType },
            { label: "Warranty Start Basis", value: r.warrantyBasis },
            { label: "Warranty Start Date", value: dash(r.warrantyStart) },
            { label: "Warranty End Date", value: dash(r.warrantyEnd) },
            { label: "Warranty Duration", value: `${r.warrantyMonths} เดือน` },
            {
              label: "Days Remaining",
              value: r.warrantyDays === null ? "—" : `${fmt(r.warrantyDays)} วัน`,
            },
            { label: "Warranty Status", value: r.warrantyStatus },
            { label: "Supplier Warranty End", value: dash(r.supplierWarrantyEnd) },
            { label: "Extended Warranty", value: "—", muted: true },
            { label: "Claim Count", value: fmt(r.claimCount) },
            { label: "Last Claim Date", value: dash(r.lastClaimDate), span: true },
          ],
        },
        {
          type: "planned",
          label: "Warranty Engine",
          message: `เกณฑ์ปัจจุบันเป็นค่าประมาณ: เริ่มนับจากวันติดตั้งหรือวันส่งมอบ และเตือนล่วงหน้า ${WARRANTY_EXPIRING_DAYS} วัน`,
        },
      ],
    },

    /* ---------- 10. Service and repair ---------- */
    {
      key: "service",
      label: "Service / Repair",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Service and Repair History",
          rows: serialService(r),
          empty: "ยังไม่มีประวัติงานบริการของหมายเลขนี้",
          cols: [
            { key: "code", label: "Service Job", cell: (x) => <span className="font-semibold">{x.code}</span> },
            { key: "type", label: "Service Type", cell: (x) => x.type },
            { key: "opened", label: "Open Date", muted: true, cell: (x) => x.opened },
            { key: "closed", label: "Close Date", muted: true, cell: (x) => dash(x.closed) },
            { key: "customerCode", label: "Customer", muted: true, cell: (x) => x.customerCode },
            { key: "problem", label: "Problem", cell: (x) => x.problem },
            { key: "diagnosis", label: "Diagnosis", muted: true, cell: (x) => dash(x.diagnosis) },
            { key: "action", label: "Action", muted: true, cell: (x) => dash(x.action) },
            { key: "parts", label: "Parts Used", muted: true, cell: (x) => dash(x.parts) },
            { key: "technician", label: "Technician", muted: true, cell: (x) => x.technician },
            {
              key: "underWarranty",
              label: "Warranty Status",
              cell: (x) => (
                <Badge tone={x.underWarranty ? "success" : "neutral"}>
                  {x.underWarranty ? "ในประกัน" : "นอกประกัน"}
                </Badge>
              ),
            },
            { key: "status", label: "Service Status", cell: (x) => x.status },
          ],
        },
        {
          type: "cards",
          title: "Service Summary",
          cols: 4,
          items: [
            { label: "Service Jobs", value: fmt(r.serviceCount) },
            { label: "Repairs", value: fmt(r.repairCount) },
            { label: "Last Service", value: dash(r.lastServiceDate) },
            { label: "Open Job", value: dash(r.openServiceJob), tone: r.openServiceJob ? "warn" : undefined },
          ],
        },
        {
          type: "planned",
          label: "Service Module",
          message: `ประเภทงานที่รองรับในอนาคต: ${SERVICE_TYPES.join(" · ")}`,
        },
        {
          type: "docs",
          title: "Service Actions",
          items: [
            {
              name: "เปิดใบแจ้งซ่อมใหม่",
              meta: "สร้างใบแจ้งซ่อมสำหรับหมายเลขนี้",
              onClick: () => serialCreateServiceRequest(r, ctx),
            },
            {
              name: "ส่งออกประวัติงานบริการ",
              meta: `${fmt(r.serviceCount)} รายการ`,
              onClick: () => serialExport(r, ctx, "ประวัติงานบริการ"),
            },
          ],
        },
      ],
    },

    /* ---------- 11. Returns and replacement ---------- */
    {
      key: "returns",
      label: "Returns / Replacement",
      blocks: (r, ctx): Block[] => {
        const returns = serialReturns(r);
        const replacements = serialReplacements(r);
        const valid = replacementValid(r);
        const partner = r.replacedBy || r.replacementOf;
        const partnerRow = partner ? serialsNamed(partner)[0] : undefined;

        return [
          !valid && {
            type: "alert",
            tone: "danger",
            title: "ความสัมพันธ์การเปลี่ยนเครื่องผิดปกติ",
            message: "พบการอ้างอิงวนกลับมาที่หมายเลขเดิม ต้องแก้ไขที่เอกสารการเปลี่ยนเครื่อง",
          },
          {
            type: "table",
            title: "Return Trace",
            rows: returns,
            empty: "หมายเลขนี้ยังไม่เคยถูกรับคืน",
            cols: [
              {
                key: "code",
                label: "Return Number",
                cell: (x) => (
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => ctx.openEntity("sales-return", x.code)}
                  >
                    {x.code}
                  </button>
                ),
              },
              { key: "returnDate", label: "Return Date", muted: true, cell: (x) => x.returnDate },
              { key: "customerCode", label: "Customer", muted: true, cell: (x) => x.customerCode },
              { key: "reason", label: "Reason", cell: (x) => x.reason },
              { key: "condition", label: "Received Condition", muted: true, cell: (x) => x.condition },
              {
                key: "qcResult",
                label: "QC Result",
                cell: (x) => (
                  <Badge tone={x.qcResult === "Passed" ? "success" : x.qcResult === "Failed" ? "danger" : "warning"}>
                    {x.qcResult}
                  </Badge>
                ),
              },
              { key: "disposition", label: "Disposition", cell: (x) => x.disposition },
              { key: "creditNote", label: "Credit Note", muted: true, cell: (x) => dash(x.creditNote) },
              { key: "replacementSo", label: "Replacement Sales Order", muted: true, cell: (x) => dash(x.replacementSo) },
              { key: "replacementSerial", label: "Replacement Serial", cell: (x) => dash(x.replacementSerial) },
              { key: "status", label: "Status", cell: (x) => x.status },
            ],
          },
          partnerRow && {
            type: "entity",
            title: "Replacement Relationship",
            items: [
              {
                name: r.serial,
                sub: `${r.lifecycle} · ${r.productName}`,
                avatar: r.icon,
                end: <Badge tone={LIFECYCLE_TONE[r.lifecycle] ?? "neutral"}>{r.replacedBy ? "Returned Serial" : "Replacement Serial"}</Badge>,
              },
              {
                name: partnerRow.serial,
                sub: `${partnerRow.lifecycle} · ${partnerRow.productName}`,
                avatar: partnerRow.icon,
                end: (
                  <Badge tone={LIFECYCLE_TONE[partnerRow.lifecycle] ?? "neutral"}>
                    {r.replacedBy ? "Replacement Serial" : "Returned Serial"}
                  </Badge>
                ),
                onClick: () => ctx.goto(`/m/serial-tracking/${encodeURIComponent(partnerRow.code)}`),
              },
            ],
          },
          replacements.length > 0 && {
            type: "table",
            title: "Replacement Documents",
            rows: replacements,
            cols: [
              { key: "code", label: "Replacement", cell: (x) => <span className="font-semibold">{x.code}</span> },
              { key: "date", label: "Date", muted: true, cell: (x) => x.date },
              { key: "returnedSerial", label: "Returned Serial", cell: (x) => x.returnedSerial },
              { key: "replacementSerial", label: "Replacement Serial", cell: (x) => x.replacementSerial },
              { key: "reason", label: "Reason", muted: true, cell: (x) => x.reason },
              { key: "document", label: "Document", muted: true, cell: (x) => x.document },
              { key: "status", label: "Status", cell: (x) => x.status },
            ],
          },
          {
            type: "note",
            title: "Disposition ที่รองรับ",
            text: RETURN_DISPOSITIONS.join(" · "),
          },
        ];
      },
    },

    /* ---------- 12. Supplier claim ---------- */
    {
      key: "claim",
      label: "Supplier Claim",
      blocks: (r, ctx): Block[] => [
        {
          type: "table",
          title: "Supplier Claim Trace",
          rows: serialClaims(r),
          empty: "หมายเลขนี้ยังไม่มีการเคลมกับผู้ขาย",
          cols: [
            { key: "code", label: "Claim Number", cell: (x) => <span className="font-semibold">{x.code}</span> },
            { key: "supplierCode", label: "Supplier", cell: (x) => x.supplierCode },
            { key: "claimDate", label: "Claim Date", muted: true, cell: (x) => x.claimDate },
            { key: "reason", label: "Claim Reason", cell: (x) => x.reason },
            {
              key: "relatedReturn",
              label: "Related Return",
              cell: (x) =>
                x.relatedReturn ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => ctx.openEntity("sales-return", x.relatedReturn)}
                  >
                    {x.relatedReturn}
                  </button>
                ) : (
                  "—"
                ),
            },
            {
              key: "relatedQc",
              label: "Related QC",
              cell: (x) =>
                x.relatedQc ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => ctx.openEntity("qc-inspection", x.relatedQc)}
                  >
                    {x.relatedQc}
                  </button>
                ) : (
                  "—"
                ),
            },
            { key: "status", label: "Claim Status", cell: (x) => x.status },
            { key: "replacementSerial", label: "Replacement Serial from Supplier", cell: (x) => dash(x.replacementSerial) },
            { key: "creditRef", label: "Credit Reference", muted: true, cell: (x) => dash(x.creditRef) },
          ],
        },
        {
          type: "fields",
          title: "Supplier",
          cols: 2,
          items: [
            { label: "Supplier", value: `${r.supplierCode} ${r.supplier}` },
            { label: "Manufacturer", value: r.manufacturer },
            { label: "Country of Origin", value: r.country },
            { label: "Supplier Warranty End", value: dash(r.supplierWarrantyEnd) },
          ],
        },
        {
          type: "planned",
          label: "Supplier Claim Module",
          message: "การยื่นเคลม การติดตามผล และเครดิตจากผู้ขายจะทำในโมดูล Supplier Claim",
        },
        {
          type: "docs",
          title: "Claim Actions",
          items: [
            {
              name: "เปิดใบเคลมผู้ขาย",
              meta: r.supplier,
              onClick: () => serialOpenClaim(r, ctx),
            },
            {
              name: "ส่งออกการสอบกลับการเคลม",
              meta: `${fmt(r.claimCount)} รายการ`,
              onClick: () => serialExport(r, ctx, "การสอบกลับการเคลม"),
            },
          ],
        },
      ],
    },

    /* ---------- 13. Corrections ---------- */
    {
      key: "corrections",
      label: "Corrections",
      blocks: (r, ctx): Block[] => {
        const corrections = serialCorrections(r);
        return [
          corrections.length > 0 && {
            type: "tree",
            title: "Original Serial → Corrected Serial",
            nodes: corrections.map((c) => ({
              label: `${c.code} · ${c.reason}`,
              sub: `${c.date} · ${c.warehouse} ${c.location}`,
              badge: c.status,
              children: [
                { label: `Serial Correction Out · ${c.wrongSerial}`, sub: "หมายเลขเดิมถูกตัดออก" },
                { label: `Serial Correction In · ${c.correctSerial}`, sub: "หมายเลขใหม่ถูกบันทึกเข้า" },
              ],
            })),
          },
          {
            type: "table",
            title: "Serial Correction History",
            rows: corrections,
            empty: "หมายเลขนี้ไม่เคยถูกแก้ไข",
            cols: [
              {
                key: "code",
                label: "Correction Number",
                cell: (x) => (
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => ctx.openEntity("stock-adjustment", x.code)}
                  >
                    {x.code}
                  </button>
                ),
              },
              { key: "date", label: "Date", muted: true, cell: (x) => x.date },
              { key: "wrongSerial", label: "Incorrect Serial", cell: (x) => x.wrongSerial },
              { key: "correctSerial", label: "Correct Serial", cell: (x) => x.correctSerial },
              { key: "product", label: "Product", muted: true, cell: (x) => x.product },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (x) => x.warehouse },
              { key: "location", label: "Location", muted: true, cell: (x) => x.location },
              { key: "reason", label: "Reason", cell: (x) => x.reason },
              { key: "approvedBy", label: "Approved By", muted: true, cell: (x) => x.approvedBy },
              { key: "status", label: "Status", cell: (x) => x.status },
            ],
          },
          {
            type: "note",
            title: "ประวัติเดิมไม่ถูกลบ",
            text: "การแก้ไขหมายเลขจะสร้างรายการเข้า-ออกคู่กัน หมายเลขเดิมยังคงอยู่ในระบบพร้อมประวัติทั้งหมด",
          },
        ];
      },
    },

    /* ---------- 14. Exceptions ---------- */
    {
      key: "exceptions",
      label: "Exceptions",
      blocks: (r, ctx): Block[] => {
        const exceptions = serialExceptions(r);
        const dupes = duplicateSources(r.product, r.serial);
        return [
          {
            type: "table",
            title: "Serial Exception Review",
            rows: exceptions,
            empty: "หมายเลขนี้ไม่มีเรื่องผิดปกติ",
            cols: [
              { key: "code", label: "Exception Reference", cell: (x) => <span className="font-semibold">{x.code}</span> },
              { key: "type", label: "Exception Type", cell: (x) => x.type },
              {
                key: "severity",
                label: "Severity",
                cell: (x) => (
                  <Badge tone={x.severity === "Critical" || x.severity === "High" ? "danger" : "warning"}>
                    {x.severity}
                  </Badge>
                ),
              },
              { key: "expected", label: "Expected State", muted: true, cell: (x) => x.expected },
              { key: "actual", label: "Actual State", cell: (x) => x.actual },
              { key: "description", label: "Description", muted: true, cell: (x) => x.description },
              { key: "responsible", label: "Responsible Party", muted: true, cell: (x) => x.responsible },
              { key: "evidence", label: "Evidence", muted: true, cell: (x) => dash(x.evidence) },
              { key: "resolution", label: "Resolution", muted: true, cell: (x) => dash(x.resolution) },
              { key: "followUp", label: "Follow-Up Date", muted: true, cell: (x) => dash(x.followUp) },
              {
                key: "adjustmentRef",
                label: "Stock Adjustment",
                cell: (x) =>
                  x.adjustmentRef ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => ctx.openEntity("stock-adjustment", x.adjustmentRef)}
                    >
                      {x.adjustmentRef}
                    </button>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "status",
                label: "Status",
                cell: (x) => <Badge tone={EXCEPTION_TONE[x.status] ?? "neutral"}>{x.status}</Badge>,
              },
            ],
          },
          dupes.length > 1 && {
            type: "table",
            title: "Duplicate Serial Sources",
            rows: dupes,
            cols: [
              { key: "serial", label: "Serial", cell: (x) => x.serial },
              { key: "model", label: "Product", cell: (x) => x.model },
              { key: "mfrSerial", label: "Manufacturer Serial", cell: (x) => dash(x.mfrSerial ?? "") },
              { key: "warehouse", label: "Warehouse", cell: (x) => dash(x.warehouse ?? "") },
              { key: "bin", label: "Bin", muted: true, cell: (x) => dash(x.bin ?? "") },
              { key: "grRef", label: "Goods Receipt", muted: true, cell: (x) => dash(x.grRef ?? "") },
              { key: "note", label: "Note", muted: true, cell: (x) => dash(x.note ?? "") },
            ],
          },
          exceptions.length > 0 && {
            type: "timeline",
            title: "Investigation Notes",
            items: exceptions.flatMap((x) =>
              x.notes.map((n) => ({
                title: x.code,
                detail: n.note,
                user: n.by,
                when: n.when,
                kind: "warn",
              })),
            ),
          },
          {
            type: "note",
            title: "ประเภทข้อผิดพลาดที่รองรับ",
            text: EXCEPTION_TYPES.join(" · "),
          },
        ];
      },
    },

    /* ---------- 15. Documents ---------- */
    {
      key: "docs",
      label: "Documents",
      blocks: (r, ctx): Block[] => [
        {
          type: "docs",
          title: "Document Relationship",
          items: docTable(r).map((d) => ({
            name: `${d.name} · ${d.type}`,
            meta: [d.status, d.date, d.party, d.user].filter((x) => x && x !== "—").join(" · "),
            onClick: () =>
              d.entity
                ? ctx.openEntity(d.entity, d.name)
                : ctx.toast(d.type, `${d.name} — โมดูลนี้จะรองรับในเฟสถัดไป`, "info"),
          })),
          empty: "ยังไม่มีเอกสารที่เกี่ยวข้อง",
        },
        {
          type: "table",
          title: "Document Cards",
          rows: docTable(r),
          cols: [
            { key: "name", label: "Document Number", cell: (x) => <span className="font-semibold">{x.name}</span> },
            { key: "type", label: "Document Type", cell: (x) => x.type },
            { key: "status", label: "Status", cell: (x) => dash(x.status) },
            { key: "date", label: "Date", muted: true, cell: (x) => dash(x.date) },
            { key: "party", label: "Customer / Supplier", muted: true, cell: (x) => dash(x.party) },
            { key: "user", label: "User", muted: true, cell: (x) => dash(x.user) },
          ],
        },
      ],
    },

    /* ---------- 16. Timeline ---------- */
    {
      key: "timeline",
      label: "Timeline",
      blocks: (r): Block[] => [
        {
          type: "timeline",
          title: "Serial Lifecycle Timeline",
          items: serialTimeline(r),
        },
      ],
    },

    /* ---------- 17. Audit ---------- */
    {
      key: "audit",
      label: "Audit Log",
      blocks: (r): Block[] => [
        {
          type: "audit",
          title: "Audit Log",
          items: serialTimeline(r).map((e) => ({
            event: e.title,
            user: e.user,
            when: e.when,
            field: "Lifecycle Status",
            from: "—",
            to: e.title,
            kind: e.kind,
          })),
        },
        {
          type: "planned",
          label: "Full Audit Trail",
          message: "การบันทึกผู้แก้ไขรายฟิลด์จะเปิดใช้พร้อมระบบสิทธิ์ผู้ใช้จริง",
        },
      ],
    },
  ],
};

export const serialTrackingSchemas: EntitySchemas<SerialRow> = { list, detail };
