import {
  WAREHOUSES,
  decorateWarehouses,
  flattenBins,
  whTreeNodes,
  type WarehouseRow,
} from "@/lib/domain/warehouse";
import { WH_TEMPS, WH_TYPES } from "@/data/warehouses";
import { STATUS_TONE, WH_TYPE_TONE, tone } from "@/lib/badges";
import { DASH, daysUntil, fmt, money0 } from "@/lib/format";
import type { DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { WAREHOUSE_FORM } from "./forms/warehouse";

/* ============================================================
   WAREHOUSE — WMS-ready. The location tree is
   Warehouse › Zone › Rack › Shelf › Bin, and bin-level flags are
   stored now so future WMS features read them without a migration.
   ============================================================ */

const yesNo = (v: boolean) => (
  <span
    className={`inline-flex items-center gap-1.5 font-medium ${
      v ? "text-success-text" : "text-ink-3"
    }`}
  >
    <Icon name={v ? "check" : "close"} size={14} strokeWidth={2.2} />
    {v ? "Yes" : "No"}
  </span>
);

export const WAREHOUSE_LIST: ListSchema<WarehouseRow> = {
  key: "warehouse",
  entity: "Warehouse",
  entityPlural: "Warehouses",
  title: "Warehouse Master",
  subtitle: "จัดการคลังสินค้า ตำแหน่งจัดเก็บ และการตั้งค่าการรับเข้า",
  crumb: "Warehouse",
  primaryLabel: "Create Warehouse",
  searchPlaceholder: "ค้นหารหัสคลัง ชื่อคลัง ที่อยู่ หรือผู้จัดการ...",
  emptyTitle: "ไม่พบคลังสินค้าที่ตรงกับเงื่อนไข",

  source: () => WAREHOUSES,
  searchFields: ["code", "name", "nameTh", "fullAddr", "manager"],

  tabs: [
    { key: "all", label: "All" },
    { key: "Active", label: "Active", test: (w) => w.status === "Active" },
    { key: "Inactive", label: "Inactive", test: (w) => w.status !== "Active" },
    { key: "main", label: "Main Warehouse", test: (w) => w.type === "Main Warehouse" },
    { key: "cold", label: "Cold Storage", test: (w) => w.type === "Cold Storage" },
    { key: "ret", label: "Returns", test: (w) => w.type === "Returns" },
    { key: "trn", label: "Transit", test: (w) => w.type === "Transit" },
  ],

  filters: [
    { id: "type", label: "Warehouse Type", options: () => [...WH_TYPES], test: (w, v) => w.type === v },
    { id: "status", label: "Status", options: () => ["Active", "Inactive"], test: (w, v) => w.status === v },
    { id: "temp", label: "Temperature", options: () => [...WH_TEMPS], test: (w, v) => w.rules.temp === v },
    {
      id: "sales",
      label: "Allow Sales",
      options: () => ["Yes", "No"],
      test: (w, v) => (v === "Yes") === Boolean(w.config.sales),
    },
    {
      id: "prov",
      label: "Province",
      options: () => [...new Set(WAREHOUSES.map((w) => w.addr.prov))],
      test: (w, v) => w.addr.prov === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "Warehouse Code",
      sortable: true,
      cell: (w) => (
        <CellMedia>
          <Thumb>{w.icon}</Thumb>
          <span className="font-medium">{w.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "name",
      label: "Warehouse Name",
      sortable: true,
      cell: (w) => (
        <>
          {w.name}
          <CellSub>{w.nameTh}</CellSub>
        </>
      ),
    },
    {
      key: "type",
      label: "Warehouse Type",
      cell: (w) => <Badge tone={tone(WH_TYPE_TONE, w.type)}>{w.type}</Badge>,
    },
    { key: "manager", label: "Manager", muted: true, cell: (w) => w.manager || DASH },
    {
      key: "temp",
      label: "Temperature",
      sortable: true,
      sortValue: (w) => w.rules.temp,
      cell: (w) =>
        w.rules.temp === "Ambient" ? (
          <Badge tone="success">Ambient</Badge>
        ) : (
          <Badge tone="info">{w.rules.temp}</Badge>
        ),
    },
    {
      key: "cap",
      label: "Capacity",
      align: "right",
      sortable: true,
      sortValue: (w) => w.rules.maxCap,
      cell: (w) => `${fmt(w.rules.maxCap)} ${w.rules.capUnit}`,
    },
    {
      key: "util",
      label: "Current Stock %",
      align: "right",
      sortable: true,
      sortValue: (w) => w.util,
      cell: (w) => (
        <UtilBar pct={w.util} tone={w.util >= 85 ? "high" : w.util >= 60 ? "mid" : undefined} />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (w) => <Badge tone={tone(STATUS_TONE, w.status)}>{w.status}</Badge>,
    },
    {
      key: "updated",
      label: "Updated",
      muted: true,
      sortable: true,
      cell: (w) => w.updated.split(" ")[0],
    },
  ],

  rowActions: (wh, ctx) => {
    const setStatus = (r: WarehouseRow, st: string, msg: string, t?: "info") => {
      r.status = st;
      decorateWarehouses();
      ctx.refresh();
      ctx.toast(msg, `${r.code} — ${r.name}`, t);
    };
    return [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("warehouse", r) },
      { label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/warehouse/${r.code}/edit`) },
      {
        label: "Duplicate",
        icon: "copy",
        run: (r) => ctx.toast("ทำสำเนาคลังสินค้า", `${r.code} — Future support`, "info"),
      },
      { sep: true },
      wh.status === "Active"
        ? { label: "Deactivate", icon: "circleSlash", run: (r) => setStatus(r, "Inactive", "ปิดใช้งานแล้ว", "info") }
        : { label: "Activate", icon: "checkCircle", run: (r) => setStatus(r, "Active", "เปิดใช้งานแล้ว") },
      { label: "Stock Overview", icon: "box", run: (r) => ctx.goto(`/m/warehouse/${r.code}`) },
      { label: "Location Structure", icon: "grid", run: (r) => ctx.goto(`/m/warehouse/${r.code}`) },
      { sep: true },
      {
        label: "Delete",
        icon: "trash",
        danger: true,
        disabled: wh.hasStock,
        disabledReason: `มีสินค้าคงเหลือ ${fmt(wh.inv.qty)} หน่วย — ต้องย้ายสินค้าออกก่อน`,
        run: (r) =>
          ctx.confirm({
            title: "Delete this warehouse?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.name} จะถูกลบถาวร
              </>
            ),
            confirmText: "Delete warehouse",
            onConfirm: () => {
              const i = WAREHOUSES.indexOf(r);
              if (i > -1) WAREHOUSES.splice(i, 1);
              decorateWarehouses();
              ctx.refresh();
              ctx.toast("ลบคลังสินค้าแล้ว", `${r.code} — ${r.name}`, "danger");
            },
          }),
      },
    ];
  },
};

export const WAREHOUSE_DETAIL: DetailSchema<WarehouseRow> = {
  key: "warehouse",
  entityLabel: "Warehouse",

  identity: (w) => ({
    image: w.icon,
    code: w.code,
    title: w.name,
    copyFields: [
      { label: "Warehouse code", value: w.code },
      { label: "Address", value: w.fullAddr },
    ],
    badges: [
      { text: w.status, tone: tone(STATUS_TONE, w.status) },
      { text: w.type, tone: tone(WH_TYPE_TONE, w.type) },
      ...(w.config.isDefault ? ([{ text: "Default", tone: "info" }] as const) : []),
    ],
    tags: [w.nameTh, w.rules.temp, w.addr.prov].filter(Boolean),
  }),

  kpis: (w) => [
    { icon: "box", label: "Total SKU", value: fmt(w.inv.sku), sub: "รายการ", goTab: "inventory" },
    {
      icon: "layers",
      label: "Utilization",
      value: `${w.util}%`,
      sub: `${fmt(w.rules.curCap)}/${fmt(w.rules.maxCap)} ${w.rules.capUnit}`,
      goTab: "rules",
    },
    {
      icon: "tag",
      label: "Bin Locations",
      value: fmt(w.binCount),
      sub: `${w.zoneCount} zones`,
      goTab: "locations",
    },
    {
      icon: "truck",
      label: "Manager",
      value: w.manager || DASH,
      sub: w.phone || "",
      wide: true,
      goTab: "overview",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (w) => [
        {
          type: "fields",
          title: "General Information",
          cols: 2,
          items: [
            { label: "Warehouse Code", value: w.code },
            { label: "Status", value: <Badge tone={tone(STATUS_TONE, w.status)}>{w.status}</Badge> },
            { label: "Warehouse Name", value: w.name },
            { label: "ชื่อภาษาไทย", value: w.nameTh },
            { label: "Warehouse Type", value: <Badge tone={tone(WH_TYPE_TONE, w.type)}>{w.type}</Badge> },
            { label: "Default Warehouse", value: yesNo(w.config.isDefault) },
            { label: "Warehouse Manager", value: w.manager || DASH },
            { label: "Phone", value: w.phone || DASH },
            { label: "Email", value: w.email || DASH },
          ],
        },
        { type: "note", title: "Description", text: w.desc || DASH },
        {
          type: "fields",
          title: "System Information",
          cols: 2,
          items: [
            { label: "Created Date", value: w.created, muted: true },
            { label: "Created By", value: w.createdBy, muted: true },
            { label: "Last Updated", value: w.updated, muted: true },
            { label: "Updated By", value: w.updatedBy, muted: true },
          ],
        },
      ],
    },

    {
      key: "config",
      label: "Configuration",
      blocks: (w) => [
        {
          type: "flags",
          title: "Allowed Transactions",
          cols: 2,
          items: [
            { label: "Allow Purchase Receipt", value: w.config.purchase },
            { label: "Allow Sales Shipment", value: w.config.sales },
            { label: "Allow Stock Transfer", value: w.config.transfer },
            { label: "Allow Production", value: w.config.production },
            { label: "Allow Returns", value: w.config.returns },
            { label: "Allow Negative Stock", value: w.config.negative },
          ],
        },
        {
          type: "fields",
          title: "Valuation",
          cols: 2,
          items: [
            { label: "Default Warehouse", value: yesNo(w.config.isDefault) },
            { label: "Inventory Valuation Method", value: w.config.valuation },
            { label: "Default Cost Method", value: w.config.costing },
          ],
        },
      ],
    },

    {
      key: "address",
      label: "Address",
      blocks: (w) => [
        {
          type: "fields",
          title: "Primary Address",
          cols: 2,
          items: [
            { label: "Address", value: w.addr.line, span: true },
            { label: "Subdistrict", value: w.addr.sub },
            { label: "District", value: w.addr.dist },
            { label: "Province", value: w.addr.prov },
            { label: "Postal Code", value: w.addr.zip },
            { label: "Country", value: w.addr.country },
            { label: "Latitude", value: w.addr.lat || DASH },
            { label: "Longitude", value: w.addr.lng || DASH },
          ],
        },
      ],
    },

    {
      key: "locations",
      label: "Location Structure",
      blocks: (w) => [
        {
          type: "cards",
          title: "Structure Summary",
          items: [
            { label: "Zones", value: fmt(w.zoneCount), tone: "accent" },
            { label: "Racks", value: fmt(w.rackCount) },
            { label: "Shelves", value: fmt(w.shelfCount) },
            { label: "Bins", value: fmt(w.binCount) },
          ],
        },
        {
          type: "tree",
          title: "Warehouse › Zone › Rack › Shelf › Bin",
          nodes: whTreeNodes(w),
          empty: "ยังไม่ได้กำหนดโครงสร้างตำแหน่งจัดเก็บ",
        },
        {
          type: "table",
          title: "Bin Locations",
          rows: flattenBins(w),
          empty: "ยังไม่มีตำแหน่งจัดเก็บสินค้า",
          cols: [
            { key: "path", label: "Location Path", cell: (r) => <span className="tnum">{r.path}</span> },
            { key: "name", label: "Bin Name" },
            { key: "binType", label: "Bin Type", cell: (r) => <Badge tone="neutral">{r.binType}</Badge> },
            {
              key: "cap",
              label: "Capacity",
              align: "right",
              cell: (r) => `${fmt(r.cap)} ${r.capUnit}`,
            },
            { key: "temp", label: "Temperature", muted: true },
            {
              key: "pick",
              label: "Pick",
              cell: (r) =>
                r.pick ? <span className="text-success-text">✓</span> : <span className="text-ink-2">{DASH}</span>,
            },
            {
              key: "putaway",
              label: "Put Away",
              cell: (r) =>
                r.putaway ? <span className="text-success-text">✓</span> : <span className="text-ink-2">{DASH}</span>,
            },
            {
              key: "status",
              label: "Status",
              cell: (r) => (
                <Badge tone={r.status === "Active" ? "success" : "neutral"}>{r.status}</Badge>
              ),
            },
          ],
        },
        {
          type: "planned",
          title: "WMS Features",
          label: "Barcode · QR · RFID · Wave Picking · Cycle Count",
          message:
            "โครงสร้าง Location Path พร้อมรองรับแล้ว — ฟีเจอร์จะเปิดใช้งานใน Phase ถัดไป",
        },
      ],
    },

    {
      key: "rules",
      label: "Storage Rules",
      blocks: (w) => {
        const r = w.rules;
        const high = w.util >= 85;
        return [
          high && {
            type: "alert",
            tone: "warn",
            title: "พื้นที่จัดเก็บใกล้เต็ม",
            message: `ใช้งานแล้ว ${w.util}% (${fmt(r.curCap)}/${fmt(r.maxCap)} ${r.capUnit})`,
          },
          {
            type: "cards",
            title: "Capacity",
            cols: 3,
            items: [
              { label: "Maximum Capacity", value: fmt(r.maxCap), unit: r.capUnit, tone: "accent" },
              { label: "Current Capacity", value: fmt(r.curCap), unit: r.capUnit },
              { label: "Utilization", value: `${w.util}%`, tone: high ? "warn" : undefined },
            ],
          },
          {
            type: "fields",
            title: "Storage Conditions",
            cols: 2,
            items: [
              {
                label: "Temperature",
                value: (
                  <Badge tone={r.temp === "Ambient" ? "success" : "info"}>{r.temp}</Badge>
                ),
              },
              { label: "Capacity Unit", value: r.capUnit },
              { label: "Humidity Control", value: yesNo(r.humidity) },
              { label: "Hazardous Storage", value: yesNo(r.hazardous) },
              { label: "Controlled Substance", value: yesNo(r.controlled) },
              { label: "Secure Storage", value: r.secure },
            ],
          },
          { type: "note", title: "Remarks", text: r.remarks || DASH },
        ];
      },
    },

    {
      key: "inventory",
      label: "Inventory Summary",
      blocks: (w) => [
        {
          type: "cards",
          title: "Stock",
          cols: 3,
          items: [
            { label: "Total SKU", value: fmt(w.inv.sku), tone: "accent" },
            { label: "Total Quantity", value: fmt(w.inv.qty) },
            { label: "Inventory Value", value: money0(w.inv.value), unit: "THB" },
          ],
        },
        {
          type: "cards",
          title: "Movement",
          items: [
            { label: "Available", value: fmt(w.inv.available) },
            { label: "Reserved", value: fmt(w.inv.reserved) },
            { label: "Pending Receipt", value: fmt(w.inv.pendingIn) },
            { label: "Pending Shipment", value: fmt(w.inv.pendingOut) },
          ],
        },
        {
          type: "fields",
          title: "Definitions",
          cols: 1,
          items: [
            { label: "Available", value: "Total Quantity − Reserved", muted: true },
            { label: "Pending Receipt", value: "ปริมาณที่รอรับเข้าจาก PO / Transfer", muted: true },
            { label: "Pending Shipment", value: "ปริมาณที่จองแล้วรอจ่ายออก", muted: true },
          ],
        },
      ],
    },

    {
      key: "documents",
      label: "Documents",
      blocks: (w) => {
        const soon = w.docs.filter((d) => {
          const dd = daysUntil(d.expiry);
          return dd !== null && dd <= 90;
        });
        return [
          soon.length > 0 && {
            type: "alert",
            tone: "warn",
            title: "เอกสารใกล้หมดอายุ",
            message: `${soon.length} ฉบับจะหมดอายุภายใน 90 วัน: ${soon.map((d) => d.name).join(", ")}`,
          },
          {
            type: "table",
            title: `Documents (${w.docs.length})`,
            rows: w.docs,
            empty: "ยังไม่มีเอกสารแนบ",
            cols: [
              { key: "type", label: "Document Type", cell: (d) => <Badge tone="neutral">{d.type}</Badge> },
              { key: "name", label: "File Name" },
              { key: "issue", label: "Issue Date", muted: true },
              {
                key: "expiry",
                label: "Expiry Date",
                cell: (d) => {
                  const dd = daysUntil(d.expiry);
                  return dd !== null && dd <= 90 ? (
                    <span className="font-semibold text-warning-text">{d.expiry}</span>
                  ) : (
                    d.expiry
                  );
                },
              },
              { key: "status", label: "Status", cell: (d) => <Badge tone="success">{d.status}</Badge> },
              { key: "by", label: "Uploaded By", muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "history",
      label: "History",
      blocks: (w) => [
        {
          type: "timeline",
          title: "Activity",
          items: w.history.map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },
  ],
};

export const warehouseSchemas: EntitySchemas<WarehouseRow> = {
  list: WAREHOUSE_LIST,
  detail: WAREHOUSE_DETAIL,
  form: WAREHOUSE_FORM,
};
