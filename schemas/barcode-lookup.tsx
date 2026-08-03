import { GS1_AIS, PACK_LEVELS, SCAN_OUTCOMES, SYMBOLOGIES, UNKNOWN_CODES } from "@/data/barcodes";
import { fmt, money, money0 } from "@/lib/format";
import type { IconName } from "@/lib/icons";
import type { ActionCtx, BadgeTone, Block } from "@/lib/types";
import {
  DOC_PREFIXES,
  KIND_LABEL,
  documents,
  findDocument,
  findLocation,
  findPackage,
  findProductBarcode,
  getCatalogProduct,
  locationStock,
  packageItems,
  productBarcodes,
  productMaster,
  productMovements,
  type EntityKind,
  type Match,
  type Recognition,
} from "@/lib/domain/barcode";
import {
  productByWarehouse,
  productIncoming,
  productLots,
  productReservations,
  productRows,
  productSerials,
  productTotals,
} from "@/lib/domain/stock";
import { LOT_TONE, EXPIRY_TONE, getLot } from "@/lib/domain/lot";
import {
  LIFECYCLE_TONE,
  PHYSICAL_TONE,
  WARRANTY_TONE,
  canSeeCost,
  getSerial,
  serialInbound,
  serialOutbound,
  statusIssues,
} from "@/lib/domain/serial";
import { bcCopy, bcLabelPreview, bcReportUnknown, bcSoon, type LabelSpec } from "@/lib/workflows-barcode";

/* ============================================================
   BARCODE LOOKUP — result views.

   One scan, six shapes of answer. Each view reads the module that
   owns the entity rather than keeping a copy, so a result can never
   disagree with the screen it links to. Every action either opens
   another module, copies a value, or previews a label; none of them
   writes stock.
   ============================================================ */

const dash = (v: string | undefined) => v || "—";

export interface QuickAction {
  label: string;
  icon: IconName;
  run: () => void;
}

export interface ResultTab {
  key: string;
  label: string;
  blocks: Block[];
}

export interface ResultView {
  kind: EntityKind;
  typeLabel: string;
  icon: string;
  code: string;
  title: string;
  subtitle: string;
  badges: { text: string; tone: BadgeTone }[];
  summary: Block;
  tabs: ResultTab[];
  actions: QuickAction[];
  label: LabelSpec;
}

/* ---------- Product ---------- */

function productView(m: Match, ctx: ActionCtx): ResultView {
  const code = m.key;
  const cat = getCatalogProduct(code)!;
  const master = productMaster(code);
  const t = productTotals(code);
  const rows = productRows(code);
  const levels = productBarcodes().filter((b) => b.product === code);

  return {
    kind: "product",
    typeLabel: "Product",
    icon: cat.icon,
    code: cat.code,
    title: cat.name,
    subtitle: `${dash(cat.barcode)} · ${dash(cat.brand)} · ${dash(cat.cat)}`,
    badges: [
      { text: m.status, tone: "success" },
      { text: `UOM ${dash(cat.unit)}`, tone: "neutral" },
      ...(cat.equipment ? [{ text: "Serialised", tone: "info" as BadgeTone }] : []),
    ],
    summary: {
      type: "cards",
      title: "Stock Summary",
      cols: 4,
      items: [
        { label: "On Hand", value: fmt(t.onHand), tone: "accent" },
        { label: "Available", value: fmt(t.available), tone: "accent" },
        { label: "Reserved", value: fmt(t.reserved) },
        { label: "QC Hold", value: fmt(t.qcHold), tone: t.qcHold ? "warn" : undefined },
        { label: "Return Hold", value: fmt(t.returnHold), tone: t.returnHold ? "warn" : undefined },
        { label: "Damaged", value: fmt(t.damaged), tone: t.damaged ? "warn" : undefined },
        { label: "In Transit", value: fmt(t.inTransit) },
        { label: "On Order", value: fmt(t.onOrder) },
      ],
    },
    tabs: [
      {
        key: "overview",
        label: "Overview",
        blocks: [
          {
            type: "fields",
            title: "Product",
            cols: 2,
            items: [
              { label: "Product Code", value: cat.code },
              { label: "Product Name", value: cat.name },
              { label: "Barcode", value: dash(cat.barcode) },
              { label: "Brand", value: dash(cat.brand) },
              { label: "Category", value: dash(cat.cat) },
              { label: "Default UOM", value: dash(cat.unit) },
              { label: "Status", value: m.status },
              {
                label: "Average Cost",
                value: canSeeCost() ? money(t.avgCost) : "Restricted",
                muted: !canSeeCost(),
              },
              {
                label: "Inventory Value",
                value: canSeeCost() ? money0(t.value) : "Restricted",
                muted: !canSeeCost(),
                span: true,
              },
            ],
          },
          {
            type: "table",
            title: "Scannable Barcodes",
            rows: levels,
            cols: [
              { key: "barcode", label: "Barcode", cell: (x) => <span className="tnum font-semibold">{x.barcode}</span> },
              { key: "level", label: "Packing Level", cell: (x) => x.level.label },
              { key: "unit", label: "UOM", muted: true, cell: (x) => x.level.unit },
              { key: "packSize", label: "Pack Size", align: "right", cell: (x) => fmt(x.level.packSize) },
              {
                key: "primary",
                label: "Printed on Master",
                cell: (x) => (x.primary ? "ใช่" : "—"),
              },
            ],
          },
        ],
      },
      {
        key: "warehouse",
        label: "By Warehouse",
        blocks: [
          {
            type: "table",
            title: "By Warehouse",
            rows: productByWarehouse(code),
            empty: "สินค้านี้ไม่มีสต๊อกคงเหลือ",
            cols: [
              { key: "warehouse", label: "Warehouse", cell: (x) => x.warehouse },
              { key: "whName", label: "Name", muted: true, cell: (x) => x.whName },
              { key: "available", label: "Available", align: "right", cell: (x) => fmt(x.available) },
              { key: "reserved", label: "Reserved", align: "right", muted: true, cell: (x) => fmt(x.reserved) },
              { key: "qcHold", label: "QC Hold", align: "right", muted: true, cell: (x) => fmt(x.qcHold) },
              { key: "returnHold", label: "Return Hold", align: "right", muted: true, cell: (x) => fmt(x.returnHold) },
              { key: "transit", label: "In Transit", align: "right", muted: true, cell: (x) => fmt(x.transit) },
              { key: "total", label: "Total", align: "right", cell: (x) => fmt(x.total) },
            ],
          },
        ],
      },
      {
        key: "location",
        label: "By Location",
        blocks: [
          {
            type: "table",
            title: "By Location",
            rows,
            empty: "สินค้านี้ไม่มีตำแหน่งจัดเก็บ",
            cols: [
              { key: "warehouse", label: "Warehouse", cell: (x) => x.warehouse },
              { key: "zone", label: "Zone", muted: true, cell: (x) => x.zone },
              { key: "rack", label: "Rack", muted: true, cell: (x) => x.rack },
              { key: "bin", label: "Bin", cell: (x) => x.bin },
              { key: "lot", label: "Lot", muted: true, cell: (x) => dash(x.lot) },
              { key: "onHand", label: "On Hand", align: "right", cell: (x) => fmt(x.onHand) },
              { key: "available", label: "Available", align: "right", cell: (x) => fmt(x.available) },
              { key: "status", label: "Status", cell: (x) => x.status },
            ],
          },
        ],
      },
      {
        key: "lots",
        label: "Lots",
        blocks: [
          {
            type: "table",
            title: "Lots",
            rows: productLots(code),
            empty: "สินค้านี้ไม่ได้ควบคุมด้วยล็อต",
            cols: [
              { key: "lot", label: "Lot", cell: (x) => x.lot },
              { key: "mfg", label: "Manufacturing", muted: true, cell: (x) => dash(x.mfg) },
              { key: "exp", label: "Expiry", cell: (x) => dash(x.exp) },
              { key: "days", label: "Days to Expiry", align: "right", cell: (x) => (x.days === null ? "—" : fmt(x.days)) },
              { key: "qty", label: "On Hand", align: "right", cell: (x) => fmt(x.qty) },
            ],
          },
        ],
      },
      {
        key: "serials",
        label: "Serials",
        blocks: [
          {
            type: "table",
            title: "Serials",
            rows: productSerials(code).slice(0, 25),
            empty: "สินค้านี้ไม่ได้ควบคุมด้วยหมายเลขเครื่อง",
            cols: [
              { key: "serial", label: "Serial", cell: (x) => x.serial },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (x) => x.warehouse },
              { key: "location", label: "Location", muted: true, cell: (x) => x.location },
              { key: "status", label: "Status", cell: (x) => x.status },
              { key: "doc", label: "Document", muted: true, cell: (x) => dash(x.doc) },
            ],
          },
        ],
      },
      {
        key: "reservations",
        label: "Reservations",
        blocks: [
          {
            type: "table",
            title: "Reservations",
            rows: productReservations(code),
            empty: "ยังไม่มีการจองสินค้านี้",
            cols: [
              { key: "soRef", label: "Sales Order", cell: (x) => x.soRef },
              { key: "customer", label: "Customer", cell: (x) => x.customer },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (x) => x.warehouse },
              { key: "qty", label: "Quantity", align: "right", cell: (x) => fmt(x.qty) },
              { key: "date", label: "Date", muted: true, cell: (x) => x.date },
              { key: "status", label: "Status", cell: (x) => x.status },
            ],
          },
        ],
      },
      {
        key: "incoming",
        label: "Incoming",
        blocks: [
          {
            type: "table",
            title: "Incoming",
            rows: productIncoming(code),
            empty: "ไม่มีของกำลังเข้า",
            cols: [
              { key: "poRef", label: "Purchase Order", cell: (x) => dash(x.poRef) },
              { key: "supplier", label: "Supplier", cell: (x) => x.supplier },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (x) => x.warehouse },
              { key: "qty", label: "Quantity", align: "right", cell: (x) => fmt(x.qty) },
              { key: "eta", label: "ETA", muted: true, cell: (x) => x.eta },
              { key: "status", label: "Status", cell: (x) => x.status },
            ],
          },
        ],
      },
      {
        key: "movement",
        label: "Recent Movement",
        blocks: [
          {
            type: "table",
            title: "Recent Movement",
            rows: productMovements(code),
            empty: "ยังไม่มีความเคลื่อนไหว",
            cols: [
              { key: "when", label: "Date and Time", cell: (x) => x.when },
              { key: "code", label: "Movement", cell: (x) => x.code },
              { key: "type", label: "Type", cell: (x) => x.type },
              { key: "sourceDoc", label: "Source Document", muted: true, cell: (x) => dash(x.sourceDoc) },
              { key: "warehouse", label: "Warehouse", muted: true, cell: (x) => x.warehouse },
              { key: "qtyIn", label: "In", align: "right", cell: (x) => (x.qtyIn ? fmt(x.qtyIn) : "—") },
              { key: "qtyOut", label: "Out", align: "right", cell: (x) => (x.qtyOut ? fmt(x.qtyOut) : "—") },
              { key: "balanceAfter", label: "Balance", align: "right", cell: (x) => fmt(x.balanceAfter) },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        label: "Open Product Master",
        icon: "product",
        run: () =>
          cat.equipment
            ? bcSoon(ctx, "อุปกรณ์ที่ประกาศไว้", "รุ่นอุปกรณ์ยังไม่มีในทะเบียนสินค้า")
            : ctx.openEntity("product", code),
      },
      { label: "Open Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
      { label: "Open Stock Card", icon: "file", run: () => ctx.goto(`/m/product-stock-card/${code}`) },
      { label: "View Lot Tracking", icon: "layers", run: () => ctx.goto("/m/lot-tracking") },
      { label: "View Serial Tracking", icon: "barcode", run: () => ctx.goto("/m/serial-tracking") },
      { label: "Copy Product Code", icon: "copy", run: () => bcCopy(ctx, code, "รหัสสินค้า") },
    ],
    label: {
      kind: "Product",
      code: cat.barcode || cat.code,
      name: cat.name,
      rows: [
        ["Product Code", cat.code],
        ["Brand", dash(cat.brand)],
        ["UOM", dash(cat.unit)],
        ["On Hand", fmt(t.onHand)],
        ["Master Barcode", dash(master?.barcode ?? cat.barcode)],
        ["Packing Levels", String(PACK_LEVELS.length)],
      ],
    },
  };
}

/* ---------- Lot ---------- */

function lotView(m: Match, ctx: ActionCtx): ResultView {
  const lot = getLot(m.key)!;

  return {
    kind: "lot",
    typeLabel: "Lot",
    icon: lot.icon,
    code: lot.lot,
    title: lot.productName,
    subtitle: `${lot.product} · ${dash(lot.supplier)}`,
    badges: [
      { text: lot.lotStatus, tone: LOT_TONE[lot.lotStatus] ?? "neutral" },
      { text: lot.expiryClass, tone: EXPIRY_TONE[lot.expiryClass] ?? "neutral" },
    ],
    summary: {
      type: "cards",
      title: "Inventory Breakdown",
      cols: 4,
      items: [
        { label: "Total On Hand", value: fmt(lot.onHand), tone: "accent" },
        { label: "Available", value: fmt(lot.available), tone: "accent" },
        { label: "Reserved", value: fmt(lot.reserved) },
        { label: "QC Hold", value: fmt(lot.qcHold), tone: lot.qcHold ? "warn" : undefined },
        { label: "Return Hold", value: fmt(lot.returnHold), tone: lot.returnHold ? "warn" : undefined },
        { label: "Damaged", value: fmt(lot.damaged), tone: lot.damaged ? "warn" : undefined },
        { label: "Blocked", value: fmt(lot.blocked) },
        { label: "Expired", value: fmt(lot.expiredQty), tone: lot.expiredQty ? "warn" : undefined },
        { label: "Recall Hold", value: fmt(lot.recallHold), tone: lot.recallHold ? "warn" : undefined },
        { label: "In Transit", value: fmt(lot.inTransit) },
      ],
    },
    tabs: [
      {
        key: "overview",
        label: "Overview",
        blocks: [
          lot.expiryClass === "Expired" && {
            type: "alert",
            tone: "danger",
            title: "ล็อตนี้หมดอายุแล้ว",
            message: `ยอด ${fmt(lot.expiredQty)} ${lot.unit} ถูกกันออกจากยอดพร้อมขาย`,
          },
          Boolean(lot.recallRef) && {
            type: "alert",
            tone: "danger",
            title: "อยู่ระหว่างการตรวจสอบเรียกคืน",
            message: `${lot.recallRef} — เปิดดูรายละเอียดใน Lot Tracking`,
          },
          {
            type: "fields",
            title: "Lot",
            cols: 2,
            items: [
              { label: "Lot Number", value: lot.lot },
              { label: "Product", value: `${lot.product} · ${lot.productName}` },
              { label: "Manufacturing Date", value: dash(lot.mfg) },
              { label: "Expiry Date", value: dash(lot.exp) },
              {
                label: "Days to Expiry",
                value: lot.daysToExpiry === null ? "—" : `${fmt(lot.daysToExpiry)} วัน`,
              },
              { label: "Supplier", value: `${lot.supplierCode} ${lot.supplier}` },
              { label: "Goods Receipt", value: dash(lot.grRef) },
              { label: "QC Result", value: lot.qcRef ? `${lot.qcRef} · ผ่าน` : "—" },
              { label: "Current Warehouses", value: lot.warehouses.join(", ") || "ไม่มีสต๊อกคงเหลือ" },
              { label: "Customer Count", value: fmt(lot.customerCount) },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        label: "Open Lot Tracking",
        icon: "layers",
        run: () => ctx.goto(`/m/lot-tracking/${encodeURIComponent(lot.code)}`),
      },
      { label: "Open Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
      { label: "Open Stock Card", icon: "file", run: () => ctx.goto(`/m/product-stock-card/${lot.product}`) },
      {
        label: "Open Goods Receipt",
        icon: "goodsReceipt",
        run: () =>
          lot.grRef
            ? ctx.openEntity("goods-receipt", lot.grRef)
            : bcSoon(ctx, "ไม่มีใบรับสินค้า", "ล็อตนี้ไม่มีใบรับที่อ้างอิงได้"),
      },
      {
        label: "View Customers",
        icon: "users",
        run: () =>
          lot.customerCount
            ? ctx.goto(`/m/lot-tracking/${encodeURIComponent(lot.code)}`)
            : bcSoon(ctx, "ยังไม่มีลูกค้า", "ล็อตนี้ยังไม่ถูกส่งออก"),
      },
      {
        label: "Start Recall Review",
        icon: "alert",
        run: () =>
          bcSoon(
            ctx,
            "เริ่มการตรวจสอบเรียกคืน",
            "ต้องทำในโมดูล Lot Tracking เพื่อให้มีการอนุมัติกำกับ",
          ),
      },
      { label: "Copy Lot Number", icon: "copy", run: () => bcCopy(ctx, lot.lot, "หมายเลขล็อต") },
    ],
    label: {
      kind: "Lot",
      code: lot.lot,
      name: lot.productName,
      rows: [
        ["Product", lot.product],
        ["Manufacturing", dash(lot.mfg)],
        ["Expiry", dash(lot.exp)],
        ["Available", fmt(lot.available)],
        ["Supplier", lot.supplier],
        ["Status", lot.lotStatus],
      ],
    },
  };
}

/* ---------- Serial ---------- */

function serialView(m: Match, ctx: ActionCtx): ResultView {
  const s = getSerial(m.key)!;
  const issues = statusIssues(s);
  const inbound = serialInbound(s);
  const outbound = serialOutbound(s);

  return {
    kind: "serial",
    typeLabel: "Serial",
    icon: s.icon,
    code: s.serial,
    title: s.productName,
    subtitle: `${s.product} · ${dash(s.mfrSerial)}`,
    badges: [
      { text: s.lifecycle, tone: LIFECYCLE_TONE[s.lifecycle] ?? "neutral" },
      { text: s.physical, tone: PHYSICAL_TONE[s.physical] ?? "neutral" },
      { text: s.warrantyStatus, tone: WARRANTY_TONE[s.warrantyStatus] ?? "neutral" },
    ],
    summary: {
      type: "cards",
      title: "Current State",
      cols: 4,
      items: [
        { label: "Owner Type", value: s.ownerType, tone: "accent" },
        { label: "Current Owner", value: s.owner || "—" },
        { label: "Warehouse", value: s.warehouse || "ไม่อยู่ในคลัง" },
        { label: "Location", value: s.location || "—" },
        { label: "Customer", value: s.customer || "—" },
        { label: "Open Reservation", value: dash(s.openReservation) },
        { label: "Open Return", value: dash(s.openReturn) },
        { label: "Open Service Job", value: dash(s.openServiceJob) },
      ],
    },
    tabs: [
      {
        key: "state",
        label: "Current State",
        blocks: [
          ...issues.map(
            (i) =>
              ({ type: "alert", tone: "danger", title: i.title, message: i.detail }) as Block,
          ),
          (s.lifecycle === "Blocked" || s.lifecycle === "Scrapped") && {
            type: "alert",
            tone: "danger",
            title: `หมายเลขนี้ถูก${s.lifecycle === "Blocked" ? "ระงับ" : "ตัดออก"}แล้ว`,
            message: "ห้ามนำไปจ่ายออกจนกว่าจะมีการกลับรายการในโมดูลต้นทาง",
          },
          !s.warehouse && !s.customerCode && {
            type: "alert",
            tone: "warn",
            title: "ยังไม่มีคลังหรือลูกค้ากำกับ",
            message: "หมายเลขนี้ไม่มีทั้งตำแหน่งในคลังและลูกค้าปลายทาง",
          },
          {
            type: "fields",
            title: "Current Status",
            cols: 2,
            items: [
              { label: "Lifecycle Status", value: s.lifecycle },
              { label: "Physical Stock Status", value: s.physical },
              { label: "Current Owner Type", value: s.ownerType },
              { label: "Current Owner", value: s.owner || "—" },
              { label: "Warehouse", value: s.warehouse || "ไม่อยู่ในคลัง" },
              { label: "Location", value: dash(s.location) },
              { label: "Customer", value: dash(s.customer) },
              { label: "Open Transfer", value: dash(s.openTransfer) },
              { label: "Last Movement", value: dash(s.lastMovement), span: true },
            ],
          },
        ],
      },
      {
        key: "trace",
        label: "Traceability",
        blocks: [
          {
            type: "fields",
            title: "Traceability Summary",
            cols: 2,
            items: [
              { label: "Supplier", value: `${s.supplierCode} ${s.supplier}` },
              { label: "Goods Receipt", value: dash(s.grRef) },
              { label: "QC", value: `${dash(s.qcRef)} · ${s.qcResult}` },
              { label: "Sales Order", value: dash(s.soRef) },
              { label: "Shipment", value: dash(s.shipRef) },
              { label: "Delivery Date", value: dash(s.deliveryDate) },
              { label: "Installation", value: dash(s.installRef) },
              { label: "Warranty", value: `${s.warrantyStatus} · ${dash(s.warrantyEnd)}` },
              { label: "Return", value: dash(s.returnRef) },
              {
                label: "Repair / Replacement",
                value: [s.serviceJob, s.replacedBy].filter(Boolean).join(" · ") || "—",
                span: true,
              },
            ],
          },
          {
            type: "table",
            title: "Inbound Trace",
            rows: inbound,
            cols: [
              { key: "stage", label: "Stage", cell: (x) => x.stage },
              { key: "doc", label: "Document", cell: (x) => x.doc },
              { key: "date", label: "Date", muted: true, cell: (x) => dash(x.date) },
              { key: "status", label: "Status", cell: (x) => dash(x.status) },
              { key: "result", label: "Result", muted: true, cell: (x) => dash(x.result) },
            ],
          },
          outbound.length > 0 && {
            type: "table",
            title: "Outbound Trace",
            rows: outbound,
            cols: [
              { key: "stage", label: "Stage", cell: (x) => x.stage },
              { key: "doc", label: "Document", cell: (x) => x.doc },
              { key: "date", label: "Date", muted: true, cell: (x) => dash(x.date) },
              { key: "status", label: "Status", cell: (x) => dash(x.status) },
              { key: "place", label: "Customer", muted: true, cell: (x) => dash(x.place) },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        label: "Open Serial Tracking",
        icon: "barcode",
        run: () => ctx.goto(`/m/serial-tracking/${encodeURIComponent(s.code)}`),
      },
      { label: "Open Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
      { label: "Open Stock Card", icon: "file", run: () => ctx.goto(`/m/product-stock-card/${s.product}`) },
      {
        label: "Open Shipment",
        icon: "truck",
        run: () =>
          s.shipRef
            ? ctx.openEntity("shipment", s.shipRef)
            : bcSoon(ctx, "ยังไม่ถูกส่งออก", "หมายเลขนี้ยังไม่มีใบส่งของ"),
      },
      {
        label: "Open Customer",
        icon: "partner",
        run: () =>
          s.customerCode
            ? bcSoon(ctx, "ข้อมูลลูกค้า", `${s.customerCode} · ${s.customer}`)
            : bcSoon(ctx, "ยังไม่มีลูกค้า", "หมายเลขนี้ยังไม่ถูกส่งมอบ"),
      },
      {
        label: "Open Service History",
        icon: "settings",
        run: () => bcSoon(ctx, "ประวัติงานบริการ", "โมดูล Service จะรองรับในเฟสถัดไป"),
      },
      { label: "Copy Serial Number", icon: "copy", run: () => bcCopy(ctx, s.serial, "หมายเลขเครื่อง") },
    ],
    label: {
      kind: "Serial",
      code: s.serial,
      name: s.productName,
      rows: [
        ["Product", s.product],
        ["Manufacturer Serial", dash(s.mfrSerial)],
        ["Lifecycle", s.lifecycle],
        ["Warranty End", dash(s.warrantyEnd)],
        ["Warehouse", s.warehouse || "—"],
        ["Customer", dash(s.customer)],
      ],
    },
  };
}

/* ---------- Location ---------- */

function locationView(m: Match, ctx: ActionCtx): ResultView {
  const l = findLocation(m.key)!;
  const rows = locationStock(l.key);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + pick(r), 0);

  return {
    kind: "location",
    typeLabel: "Location",
    icon: "🏷️",
    code: `${l.zone}-${l.rack}-${l.bin}`,
    title: l.whName,
    subtitle: l.key,
    badges: [
      { text: l.status, tone: l.status === "Blocked" ? "danger" : "success" },
      { text: l.warehouse, tone: "neutral" },
    ],
    summary: {
      type: "cards",
      title: "Location Summary",
      cols: 4,
      items: [
        { label: "Total Products", value: fmt(new Set(rows.map((r) => r.product)).size), tone: "accent" },
        { label: "Total Quantity", value: fmt(sum((r) => r.onHand)), tone: "accent" },
        { label: "Available", value: fmt(sum((r) => r.available)) },
        { label: "Reserved", value: fmt(sum((r) => r.reserved)) },
        { label: "QC Hold", value: fmt(sum((r) => r.qcHold)) },
        { label: "Return Hold", value: fmt(sum((r) => r.returnHold)) },
        { label: "Damaged", value: fmt(sum((r) => r.damaged)) },
        { label: "Capacity Utilization", value: "—", sub: "Phase 2" },
      ],
    },
    tabs: [
      {
        key: "stock",
        label: "Stock at Location",
        blocks: [
          {
            type: "fields",
            title: "Location",
            cols: 2,
            items: [
              { label: "Location Code", value: l.key },
              { label: "Warehouse", value: `${l.warehouse} · ${l.whName}` },
              { label: "Zone", value: l.zone },
              { label: "Rack", value: l.rack },
              { label: "Shelf", value: l.shelf },
              { label: "Bin", value: l.bin },
              { label: "Status", value: l.status },
              { label: "Capacity", value: "—", muted: true },
            ],
          },
          {
            type: "table",
            title: "Stock at this Location",
            rows,
            empty: "ตำแหน่งนี้ยังไม่มีสินค้า",
            cols: [
              { key: "product", label: "Product", cell: (x) => `${x.product} · ${x.productName}` },
              { key: "lot", label: "Lot", muted: true, cell: (x) => dash(x.lot) },
              { key: "serial", label: "Serial", muted: true, cell: (x) => dash(x.serial) },
              { key: "status", label: "Stock Status", cell: (x) => x.status },
              { key: "onHand", label: "Quantity", align: "right", cell: (x) => fmt(x.onHand) },
              { key: "unit", label: "UOM", muted: true, cell: (x) => x.unit },
              { key: "exp", label: "Expiry", muted: true, cell: (x) => dash(x.exp) },
              { key: "updated", label: "Last Movement", muted: true, cell: (x) => dash(x.updated) },
            ],
          },
        ],
      },
    ],
    actions: [
      { label: "Open Stock Inquiry", icon: "search", run: () => ctx.goto("/m/stock-inquiry") },
      { label: "Open Stock Card", icon: "file", run: () => ctx.goto("/m/stock-card") },
      {
        label: "Create Stock Transfer",
        icon: "truck",
        run: () =>
          bcSoon(
            ctx,
            "สร้างใบโอนย้าย",
            "ต้องทำในโมดูล Stock Transfer — Barcode Lookup ไม่ย้ายสต๊อกเอง",
          ),
      },
      {
        label: "Start Spot Count",
        icon: "checkCircle",
        run: () =>
          bcSoon(ctx, "เริ่มนับเฉพาะจุด", "ต้องทำในโมดูล Cycle Count เพื่อให้มีใบนับกำกับ"),
      },
      {
        label: "Print Location Label",
        icon: "printer",
        run: () =>
          bcLabelPreview(ctx, {
            kind: "Location",
            code: l.key,
            name: l.whName,
            rows: [
              ["Warehouse", l.warehouse],
              ["Zone", l.zone],
              ["Rack", l.rack],
              ["Shelf", l.shelf],
              ["Bin", l.bin],
              ["Status", l.status],
            ],
          }),
      },
      { label: "Copy Location Code", icon: "copy", run: () => bcCopy(ctx, l.key, "รหัสตำแหน่ง") },
    ],
    label: {
      kind: "Location",
      code: l.key,
      name: l.whName,
      rows: [
        ["Warehouse", l.warehouse],
        ["Zone", l.zone],
        ["Rack", l.rack],
        ["Shelf", l.shelf],
        ["Bin", l.bin],
        ["Status", l.status],
      ],
    },
  };
}

/* ---------- Package ---------- */

function packageView(m: Match, ctx: ActionCtx): ResultView {
  const p = findPackage(m.key)!;
  const items = packageItems(p);

  return {
    kind: "package",
    typeLabel: "Package",
    icon: "📦",
    code: p.barcode,
    title: `${p.shipment} · ${p.customer}`,
    subtitle: `${p.no} · ${dash(p.boxType)}`,
    badges: [
      { text: p.status, tone: "info" },
      { text: p.deliveryStatus, tone: p.deliveryStatus === "Delivered" ? "success" : "neutral" },
    ],
    summary: {
      type: "cards",
      title: "Package Summary",
      cols: 4,
      items: [
        { label: "Box Type", value: dash(p.boxType), tone: "accent" },
        { label: "Weight", value: `${fmt(p.weight)} kg` },
        { label: "Dimensions", value: p.dims },
        { label: "Item Count", value: fmt(items.length) },
        {
          label: "Total Quantity",
          value: fmt(items.reduce((t, i) => t + (i.shipmentQty || i.orderedQty || 0), 0)),
        },
        { label: "Dispatch Date", value: dash(p.dispatch) },
        { label: "Expected Delivery", value: dash(p.expected) },
        { label: "Delivery Status", value: p.deliveryStatus },
      ],
    },
    tabs: [
      {
        key: "items",
        label: "Package Items",
        blocks: [
          {
            type: "fields",
            title: "Package",
            cols: 2,
            items: [
              { label: "Package Number", value: p.barcode },
              { label: "Shipment", value: p.shipment },
              { label: "Customer", value: `${p.customerCode} ${p.customer}` },
              { label: "Package Status", value: p.status },
              { label: "Tracking Number", value: dash(p.tracking) },
              { label: "Carrier", value: dash(p.carrier) },
              { label: "Delivery Order", value: dash(p.doRef) },
              { label: "Box Type", value: dash(p.boxType) },
            ],
          },
          {
            type: "table",
            title: "Package Items",
            rows: items,
            empty: "กล่องนี้ยังไม่มีรายการสินค้า",
            cols: [
              { key: "code", label: "Product", cell: (x) => `${x.code} · ${x.name}` },
              { key: "lot", label: "Lot", muted: true, cell: (x) => dash(x.lot) },
              { key: "serial", label: "Serial", muted: true, cell: (x) => dash(x.serial) },
              {
                key: "qty",
                label: "Quantity",
                align: "right",
                cell: (x) => fmt(x.shipmentQty || x.orderedQty || 0),
              },
              { key: "unit", label: "UOM", muted: true, cell: (x) => x.unit },
              { key: "doLine", label: "Delivery Order Line", muted: true, cell: (x) => fmt(x.doLine) },
              { key: "shipment", label: "Shipment", muted: true, cell: () => p.shipment },
            ],
          },
        ],
      },
    ],
    actions: [
      { label: "Open Shipment", icon: "truck", run: () => ctx.openEntity("shipment", p.shipment) },
      {
        label: "Open Delivery Order",
        icon: "delivery",
        run: () =>
          p.doRef && findDocument(p.doRef)
            ? ctx.openEntity("delivery-order", p.doRef)
            : bcSoon(ctx, "ใบส่งของ", `${dash(p.doRef)} ไม่อยู่ในชุดข้อมูลปัจจุบัน`),
      },
      {
        label: "Print Package Label",
        icon: "printer",
        run: () =>
          bcLabelPreview(ctx, {
            kind: "Package",
            code: p.barcode,
            name: `${p.shipment} · ${p.customer}`,
            rows: [
              ["Tracking", dash(p.tracking)],
              ["Carrier", dash(p.carrier)],
              ["Weight", `${fmt(p.weight)} kg`],
              ["Dimensions", p.dims],
              ["Items", fmt(items.length)],
              ["Status", p.status],
            ],
          }),
      },
      {
        label: "View Tracking",
        icon: "external",
        run: () => bcSoon(ctx, "ติดตามพัสดุ", "การเชื่อมต่อระบบขนส่งจะทำในเฟสถัดไป"),
      },
      {
        label: "Copy Tracking Number",
        icon: "copy",
        run: () => bcCopy(ctx, p.tracking || p.barcode, "เลขติดตาม"),
      },
    ],
    label: {
      kind: "Package",
      code: p.barcode,
      name: `${p.shipment} · ${p.customer}`,
      rows: [
        ["Tracking", dash(p.tracking)],
        ["Carrier", dash(p.carrier)],
        ["Weight", `${fmt(p.weight)} kg`],
        ["Dimensions", p.dims],
        ["Items", fmt(items.length)],
        ["Delivery", p.deliveryStatus],
      ],
    },
  };
}

/* ---------- Document ---------- */

function documentView(m: Match, ctx: ActionCtx): ResultView {
  const d = findDocument(m.key)!;
  const related = documents().filter(
    (x) => x.code !== d.code && x.party !== "—" && x.party === d.party,
  );

  return {
    kind: "document",
    typeLabel: "Document",
    icon: "📄",
    code: d.code,
    title: d.type,
    subtitle: `${dash(d.party)} · ${dash(d.warehouse)}`,
    badges: [
      { text: d.status, tone: "neutral" },
      { text: d.type, tone: "info" },
    ],
    summary: {
      type: "cards",
      title: "Document Summary",
      cols: 4,
      items: [
        { label: "Document Type", value: d.type, tone: "accent" },
        { label: "Status", value: d.status },
        { label: "Date", value: dash(d.date) },
        { label: "Item Count", value: fmt(d.items) },
        { label: "Quantity", value: fmt(d.qty) },
        {
          label: "Amount",
          value: canSeeCost() ? money0(d.amount) : "Restricted",
          tone: canSeeCost() ? undefined : "locked",
        },
        { label: "Created By", value: dash(d.createdBy) },
        { label: "Last Updated", value: dash(d.updated) },
      ],
    },
    tabs: [
      {
        key: "document",
        label: "Document",
        blocks: [
          {
            type: "fields",
            title: "Document",
            cols: 2,
            items: [
              { label: "Document Number", value: d.code },
              { label: "Document Type", value: d.type },
              { label: "Status", value: d.status },
              { label: "Date", value: dash(d.date) },
              { label: "Customer / Supplier", value: dash(d.party) },
              { label: "Warehouse", value: dash(d.warehouse) },
              { label: "Item Count", value: fmt(d.items) },
              { label: "Quantity", value: fmt(d.qty) },
              {
                label: "Amount",
                value: canSeeCost() ? money0(d.amount) : "Restricted",
                muted: !canSeeCost(),
              },
              { label: "Created By", value: dash(d.createdBy) },
            ],
          },
          {
            type: "docs",
            title: "Related Documents",
            items: related.slice(0, 8).map((x) => ({
              name: `${x.code} · ${x.type}`,
              meta: [x.status, x.date, x.party].filter((v) => v && v !== "—").join(" · "),
              onClick: () => ctx.openEntity(x.entity, x.code),
            })),
            empty: "ไม่พบเอกสารที่เกี่ยวข้อง",
          },
        ],
      },
    ],
    actions: [
      { label: "Open Document", icon: "external", run: () => ctx.openEntity(d.entity, d.code) },
      {
        label: "Open Related Documents",
        icon: "link",
        run: () =>
          related.length
            ? ctx.goto(`/m/${d.entity}`)
            : bcSoon(ctx, "ไม่มีเอกสารที่เกี่ยวข้อง", d.code),
      },
      { label: "Copy Document Number", icon: "copy", run: () => bcCopy(ctx, d.code, "เลขที่เอกสาร") },
    ],
    label: {
      kind: "Document",
      code: d.code,
      name: d.type,
      rows: [
        ["Status", d.status],
        ["Date", dash(d.date)],
        ["Party", dash(d.party)],
        ["Warehouse", dash(d.warehouse)],
        ["Items", fmt(d.items)],
        ["Quantity", fmt(d.qty)],
      ],
    },
  };
}

/* ---------- Router ---------- */

const VIEWS: Record<EntityKind, (m: Match, ctx: ActionCtx) => ResultView> = {
  product: productView,
  lot: lotView,
  serial: serialView,
  location: locationView,
  package: packageView,
  document: documentView,
};

/** One match in, one result view out. The kind decides which. */
export const resultView = (m: Match, ctx: ActionCtx): ResultView => VIEWS[m.kind](m, ctx);

/* ---------- Non-result states ---------- */

export function gs1Blocks(rec: Recognition): Block[] {
  if (!rec.gs1) return [];
  return [
    {
      type: "table",
      title: "GS1 Parsing — Phase 1 Placeholder",
      rows: rec.gs1.fields,
      empty: "ไม่พบ Application Identifier ที่รองรับ",
      cols: [
        { key: "ai", label: "AI", cell: (f) => `(${f.ai})` },
        { key: "label", label: "Field", cell: (f) => <span className="font-semibold">{f.label}</span> },
        { key: "value", label: "Raw Value", muted: true, cell: (f) => f.value },
        { key: "display", label: "Parsed", cell: (f) => f.display },
      ],
    },
    {
      type: "note",
      title: "Phase 1 GS1 Parsing Placeholder",
      text: `รองรับ ${GS1_AIS.map((a) => `(${a.ai}) ${a.label}`).join(" · ")} — ยังไม่ตรวจสอบความถูกต้องตามมาตรฐาน GS1 เต็มรูปแบบ`,
    },
  ];
}

export function unknownBlocks(rec: Recognition, meta: { when: string; user: string; warehouse: string }): Block[] {
  return [
    {
      type: "alert",
      tone: "warn",
      title: "Code Not Found",
      message:
        "No Product, Lot, Serial, Location, Package, or Document matched this code.",
    },
    {
      type: "fields",
      title: "Scan",
      cols: 2,
      items: [
        { label: "Scanned Code", value: rec.raw },
        { label: "Detected Type", value: rec.codeType },
        { label: "Symbology", value: rec.symbology },
        { label: "Scan Time", value: meta.when },
        { label: "User", value: meta.user },
        { label: "Warehouse Context", value: meta.warehouse },
        ...(rec.checkDigitOk === undefined
          ? []
          : [
              {
                label: "Check Digit (placeholder)",
                value: rec.checkDigitOk ? "ผ่าน" : "ไม่ผ่าน — ตัวเลขจำลอง",
                muted: true,
              },
            ]),
      ],
    },
    {
      type: "note",
      title: "รหัสที่มักสแกนแล้วไม่พบ",
      text: UNKNOWN_CODES.slice(0, 5)
        .map((u) => `${u.code} — ${u.note}`)
        .join(" · "),
    },
  ];
}

export function invalidBlocks(rec: Recognition): Block[] {
  return [
    {
      type: "alert",
      tone: "danger",
      title: "Invalid Code",
      message: rec.issue ?? "รูปแบบรหัสไม่ถูกต้อง",
    },
    {
      type: "fields",
      title: "Validation",
      cols: 2,
      items: [
        { label: "Raw Input", value: rec.raw },
        { label: "Detected Format", value: rec.codeType },
        { label: "Validation Issue", value: rec.issue ?? "—", span: true },
        { label: "Suggested Correction", value: rec.suggestion ?? "—", span: true },
      ],
    },
    ...gs1Blocks(rec),
  ];
}

export function multiBlocks(rec: Recognition): Block[] {
  return [
    {
      type: "alert",
      tone: "warn",
      title: `รหัสนี้ตรงกับ ${rec.matches.length} รายการ`,
      message: "เลือกรายการที่ต้องการ — ระบบจะไม่เดาให้เมื่อความมั่นใจไม่พอ",
    },
    {
      type: "fields",
      title: "Scan",
      cols: 2,
      items: [
        { label: "Scanned Code", value: rec.raw },
        { label: "Match Count", value: fmt(rec.matches.length) },
        { label: "Detected Type", value: rec.codeType },
        { label: "Recognition Confidence", value: "—", muted: true },
      ],
    },
  ];
}

/* ---------- Help ---------- */

export const supportedTypes = () => [...SYMBOLOGIES];

export const docPrefixHelp = () => DOC_PREFIXES;

export const outcomes = () => [...SCAN_OUTCOMES];

export const kindLabel = (k: EntityKind) => KIND_LABEL[k];

/** Examples the landing page offers as one-click scans. */
export function helpExamples(): { code: string; note: string }[] {
  const bc = productBarcodes().find((b) => b.primary);
  return [
    { code: bc?.barcode ?? "8851234000131", note: "บาร์โค้ดสินค้า (EAN-13)" },
    { code: "AA-TH003-WL", note: "รหัสสินค้า" },
    { code: "LOT-26001", note: "หมายเลขล็อต" },
    { code: "GT1-TH-000128", note: "หมายเลขเครื่อง" },
    { code: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01", note: "รหัสตำแหน่งจัดเก็บ" },
    { code: "PKG-SHP-260031-01", note: "หมายเลขกล่อง" },
    { code: "INV-2026-000021", note: "เลขที่เอกสาร" },
    {
      code: "(01)08851234000131(10)LOT-26001(17)280630(21)GT1-TH-000128",
      note: "GS1 Composite",
    },
    { code: "LOT-26010", note: "ตัวอย่างรหัสที่ตรงหลายรายการ" },
    { code: "9999999999999", note: "ตัวอย่างรหัสที่ไม่พบ" },
  ];
}

export { findProductBarcode, bcReportUnknown };
