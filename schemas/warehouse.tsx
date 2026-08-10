import {
  WAREHOUSES,
  decorateWarehouses,
  flattenBins,
  whTreeNodes,
  type WarehouseRow,
} from "@/lib/domain/warehouse";
import { warehouseItems } from "@/lib/domain/product";
import { checkPermission } from "@/lib/permissions";
import { WH_TEMPS, WH_TYPES } from "@/data/warehouses";
import { STATUS_TONE, WH_TYPE_TONE, tone } from "@/lib/badges";
import { canViewField } from "@/lib/domain/admin";
import { DASH, daysUntil, fmt, money0 } from "@/lib/format";
import type { DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellSub, LinkButton } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { isPhoto } from "@/components/engine/FormFields";
import { WAREHOUSE_FORM } from "./forms/warehouse";

/* ============================================================
   WAREHOUSE — WMS-ready. The location tree is
   Warehouse › Zone › Rack › Shelf › Bin, and bin-level flags are
   stored now so future WMS features read them without a migration.
   ============================================================ */

/**
 * The picture is an uploaded photograph now. Warehouses seeded with an emoji
 * keep rendering as text, and one with neither falls back to the generic mark
 * rather than an empty square — same treatment the product and partner
 * records already get.
 */
function WarehouseAvatar({ value, name }: { value: string; name: string }) {
  if (isPhoto(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt={name} className="h-full w-full rounded-card object-cover" />
    );
  }
  return value ? <>{value}</> : <Icon name="warehouse" size={34} className="text-ink-3" />;
}

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
  searchPlaceholder: "ค้นหารหัสคลัง ชื่อคลัง หรือที่อยู่...",
  emptyTitle: "ไม่พบคลังสินค้าที่ตรงกับเงื่อนไข",

  source: () => WAREHOUSES,
  searchFields: ["code", "name", "fullAddr"],

  tabs: [
    { key: "all", label: "All" },
    { key: "Active", label: "Active", test: (w) => w.status === "Active" },
    { key: "Inactive", label: "Inactive", test: (w) => w.status !== "Active" },
    { key: "main", label: "Main Warehouse", test: (w) => w.type === "Main Warehouse" },
    { key: "branch", label: "Branch", test: (w) => w.type === "Branch Warehouse" },
    { key: "ret", label: "Return", test: (w) => w.type === "Return Warehouse" },
    { key: "svc", label: "Service", test: (w) => w.type === "Service Warehouse" },
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
      /* No thumbnail: the icon is decorative at list scale and the code is
         what a user scans for. It still identifies the record on the detail
         page, where there is room for it. */
      key: "code",
      label: "Warehouse Code",
      sortable: true,
      cell: (w) => <span className="font-medium">{w.code}</span>,
    },
    {
      key: "name",
      label: "Warehouse Name",
      sortable: true,
      cell: (w) => (
        <>
          {w.name}
          <CellSub>{w.type}</CellSub>
        </>
      ),
    },
    {
      key: "type",
      label: "Warehouse Type",
      cell: (w) => <Badge tone={tone(WH_TYPE_TONE, w.type)}>{w.type}</Badge>,
    },
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
    /* What is actually in the warehouse, in quantity and in money. Capacity
       and utilisation describe the building; these describe the business,
       and are what a list of warehouses is usually opened to compare. */
    {
      key: "qty",
      label: "Stock Qty",
      align: "right",
      sortable: true,
      sortValue: (w) => w.inv.qty,
      cell: (w) => <span className="tnum">{fmt(w.inv.qty)}</span>,
    },
    {
      key: "value",
      label: "Inventory Value",
      align: "right",
      sortable: true,
      sortValue: (w) => w.inv.value,
      cell: (w) =>
        /* Layer 2 of the permission framework: a role without inventory-value
           sight gets no figure, not a masked one. */
        canViewField("inventoryValue") ? (
          <span className="tnum font-medium">{money0(w.inv.value)}</span>
        ) : (
          <span className="text-ink-3">••••</span>
        ),
    },
    {
      key: "sku",
      label: "SKU",
      align: "right",
      muted: true,
      defaultHidden: true,
      sortable: true,
      sortValue: (w) => w.inv.sku,
      cell: (w) => fmt(w.inv.sku),
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
      { label: "View", icon: "eye", run: (r) => ctx.openEntity("warehouse", r.code) },
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
    image: <WarehouseAvatar value={w.icon} name={w.name} />,
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
    tags: [w.rules.temp, w.addr.prov].filter(Boolean),
  }),

  /* No KPI strip. The stock figures have a tab of their own and the header
     is for identifying the warehouse, not for reading it. */
  kpis: () => [],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      /* Everything a user reads about a warehouse rather than configures:
         who it is, where it is, and what it may hold. The switches that
         decide how it behaves are maintenance, and live in the edit form. */
      blocks: (w) => [
        {
          type: "fields",
          title: "General Information",
          cols: 2,
          items: [
            { label: "Warehouse Code", value: w.code },
            { label: "Status", value: <Badge tone={tone(STATUS_TONE, w.status)}>{w.status}</Badge> },
            { label: "Warehouse Name", value: w.name },
            { label: "Warehouse Type", value: <Badge tone={tone(WH_TYPE_TONE, w.type)}>{w.type}</Badge> },
            { label: "Default Warehouse", value: yesNo(w.config.isDefault) },
          ],
        },
        { type: "note", title: "Description", text: w.desc || DASH },
        {
          type: "fields",
          title: "Address",
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
        {
          type: "fields",
          title: "Storage Conditions",
          cols: 2,
          items: [
            {
              label: "Temperature",
              value: (
                <Badge tone={w.rules.temp === "Ambient" ? "success" : "info"}>{w.rules.temp}</Badge>
              ),
            },
            { label: "Humidity Control", value: yesNo(w.rules.humidity) },
            { label: "Hazardous Storage", value: yesNo(w.rules.hazardous) },
            { label: "Controlled Substance", value: yesNo(w.rules.controlled) },
            { label: "Secure Storage", value: w.rules.secure },
            { label: "Remarks", value: w.rules.remarks || DASH, span: true },
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
        w.binCount === 0 && {
          /* The create form no longer asks for a four-level bin structure —
             laying out a building is not master data entry. Saying so here
             is what stops a warehouse quietly never appearing in Put Away. */
          type: "alert",
          tone: "warn",
          title: "ยังไม่มี Bin ในคลังนี้",
          message:
            "งาน Put Away แนะนำตำแหน่งจัดเก็บจากผังนี้ — คลังที่ยังไม่มี Bin จะไม่ถูกเสนอ · ผังจัดเก็บกำหนดแยกจากการสร้างคลัง",
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
      key: "inventory",
      label: "Warehouse Items",
      /* The items this warehouse is cleared to hold, and what is on the
         shelf of each. It used to be four aggregate tiles — SKU count, total
         quantity, inventory value — which say how big the warehouse is and
         nothing about what is in it. */
      blocks: (w, ctx) => {
        const items = warehouseItems(`${w.code} ${w.name}`);
        const low = items.filter((i) => i.low);
        const value = items.reduce((t, i) => t + i.value, 0);
        const canCost = checkPermission("canViewCost");

        return [
          {
            type: "cards",
            title: "Stock",
            cols: 4,
            items: [
              { label: "รายการที่เก็บได้", value: fmt(items.length), tone: "accent" },
              { label: "จำนวนรวม", value: fmt(items.reduce((t, i) => t + i.onHand, 0)) },
              {
                label: "ต่ำกว่าจุดสั่งซื้อ",
                value: fmt(low.length),
                tone: low.length ? "warn" : undefined,
              },
              canCost
                ? { label: "มูลค่าตามต้นทุน", value: money0(value), unit: "THB" }
                : { label: "มูลค่าตามต้นทุน", value: "••••", sub: "Restricted", tone: "locked" },
            ],
          },
          {
            type: "table",
            title: `Warehouse Items (${items.length})`,
            rows: items,
            empty: "ยังไม่มีสินค้ารายการใดถูกกำหนดให้เก็บที่คลังนี้",
            cols: [
              {
                key: "code",
                label: "Product Code",
                cell: (i) => (
                  <LinkButton onClick={() => ctx.openEntity("product", i.code)}>
                    {i.code}
                  </LinkButton>
                ),
              },
              { key: "name", label: "Product Name", cell: (i) => i.name },
              { key: "bin", label: "Bin", muted: true, cell: (i) => i.bin || DASH },
              {
                key: "onHand",
                label: "On Hand",
                align: "right",
                cell: (i) => `${fmt(i.onHand)} ${i.unit}`,
              },
              {
                key: "reserved",
                label: "Reserved",
                align: "right",
                muted: true,
                cell: (i) => fmt(i.reserved),
              },
              {
                key: "available",
                label: "Available",
                align: "right",
                cell: (i) => (
                  <span className={i.low ? "font-semibold text-danger" : ""}>
                    {fmt(i.available)}
                  </span>
                ),
              },
              {
                /* This warehouse's own figure, not the company default —
                   which is the whole point of holding it per warehouse. */
                key: "rop",
                label: "Reorder Point",
                align: "right",
                muted: true,
                cell: (i) => (i.rop > 0 ? fmt(i.rop) : "ไม่สั่งซื้อ"),
              },
              {
                key: "value",
                label: "Value",
                align: "right",
                cell: (i) => (canCost ? money0(i.value) : "••••"),
              },
              {
                key: "warn",
                label: "",
                cell: (i) =>
                  i.storageWarn ? <Badge tone="danger">{i.storageWarn}</Badge> : null,
              },
            ],
          },
          !canCost && { type: "restricted" },
        ];
      },
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

    /* No Receiving History tab.

       It listed the same movement rows the Stock Card already shows, keyed
       by warehouse instead of by product — a second reading of one ledger,
       on the screen least likely to be opened for it. */
  ],
};

export const warehouseSchemas: EntitySchemas<WarehouseRow> = {
  list: WAREHOUSE_LIST,
  detail: WAREHOUSE_DETAIL,
  form: WAREHOUSE_FORM,
};
