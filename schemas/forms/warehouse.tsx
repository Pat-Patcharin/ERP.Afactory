import type { Warehouse } from "@/data/warehouses";
import {
  WH_CAP_UNIT,
  WH_COSTING,
  WH_LEVELS,
  WH_SECURITY,
  WH_TEMPS,
  WH_TYPES,
  WH_VALUATION,
} from "@/data/warehouses";
import { PROVINCES } from "@/data/partners";
import { validEmail, validPhone, validZip } from "@/lib/domain/partner";
import {
  WAREHOUSES,
  decorateWarehouses,
  flattenBins,
  type WarehouseRow,
} from "@/lib/domain/warehouse";
import { fmt, stamp } from "@/lib/format";
import type { FormSchema } from "@/lib/types";
import { FORM_USER, isCreate, opts, saved } from "./common";

/* ============================================================
   WAREHOUSE FORM — the only master with a tree field. The
   Zone › Rack › Shelf › Bin structure is built inline rather
   than in a separate screen, because a warehouse without bins
   cannot receive goods.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

interface TreeNodeState {
  code?: string;
  name?: string;
  children?: TreeNodeState[];
}

/* The four storage levels, read off the record rather than retyped here so
   they cannot drift from it. Zone → Rack → Shelf → Bin, and only the bin
   carries capacity and the pick/putaway flags. */
type Zone = Warehouse["locations"][number];
type Rack = Zone["children"][number];
type Shelf = Rack["children"][number];
type Bin = Shelf["children"][number];

/** Strip the tree back to what the field edits, so editing round-trips cleanly. */
const toTree = (nodes: { code: string; name: string; children?: unknown }[]): TreeNodeState[] =>
  (nodes ?? []).map((n) => ({
    code: n.code,
    name: n.name,
    children: toTree((n.children ?? []) as { code: string; name: string; children?: unknown }[]),
  }));

const countDepth = (nodes: TreeNodeState[], depth: number): number =>
  depth === 0
    ? nodes.length
    : nodes.reduce((t, n) => t + countDepth(n.children ?? [], depth - 1), 0);

export const WAREHOUSE_FORM: FormSchema<WarehouseRow> = {
  key: "warehouse",
  entityLabel: "Warehouse",
  titleField: "name",
  saveButton: "Save Warehouse",
  statusBadge: { Active: "success", Inactive: "neutral" },

  blank: () => ({
    _mode: "create",
    code: "",
    icon: "🏭",
    name: "",
    nameTh: "",
    type: "Main Warehouse",
    status: "Active",
    desc: "",
    manager: "",
    phone: "",
    email: "",
    config: {
      purchase: true,
      sales: true,
      transfer: true,
      production: false,
      returns: false,
      negative: false,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: { line: "", sub: "", dist: "", prov: "", zip: "", country: "ประเทศไทย", maps: "" },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 0,
      curCap: 0,
      capUnit: "m²",
      remarks: "",
    },
    locations: [],
  }),

  toState: (w) => ({
    _mode: "edit",
    code: w.code,
    icon: w.icon,
    name: w.name,
    nameTh: w.nameTh,
    type: w.type,
    status: w.status,
    desc: w.desc,
    manager: w.manager,
    phone: w.phone,
    email: w.email,
    config: { ...w.config },
    addr: { ...w.addr },
    rules: { ...w.rules },
    locations: toTree(w.locations ?? []),
  }),

  steps: [
    /* ---------- 1. GENERAL ---------- */
    {
      key: "general",
      label: "General",
      railLabel: "ข้อมูลทั่วไป",
      labelTh: "รหัส ชื่อ และประเภทคลัง",
      blocks: () => [
        {
          type: "card",
          title: "Warehouse Identity",
          cols: "2",
          fields: [
            {
              type: "photo",
              path: "icon",
              label: "Warehouse Photo",
              icon: "warehouse",
              span: true,
            },
            {
              type: "text",
              path: "code",
              label: "Warehouse Code",
              required: true,
              placeholder: "WH-BKK",
              hint: "รหัสสั้นที่จำง่าย ใช้อ้างอิงในทุกเอกสาร",
              when: isCreate,
            },
            {
              type: "static",
              path: "code",
              label: "Warehouse Code",
              when: (s) => !isCreate(s),
            },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: ["Active", "Inactive"],
            },
            {
              type: "text",
              path: "name",
              label: "Warehouse Name",
              required: true,
              placeholder: "Bangkok Main Warehouse",
            },
            {
              type: "select",
              path: "type",
              label: "Warehouse Type",
              required: true,
              options: opts(WH_TYPES),
            },
            { type: "textarea", path: "desc", label: "Description", span: true, rows: 2 },
          ],
        },
        /* No Responsible Person card. A manager is a person who changes jobs,
           and the name on the record went stale the day they did — who to
           ring belongs to the org chart, not to the building. */
      ],
    },

    /* ---------- 2. ADDRESS ---------- */
    {
      key: "address",
      label: "Address",
      railLabel: "ที่ตั้ง",
      labelTh: "ที่อยู่คลังสินค้า",
      blocks: () => [
        {
          type: "card",
          title: "Location",
          cols: "2",
          fields: [
            { type: "text", path: "addr.line", label: "Address", required: true, span: true },
            { type: "text", path: "addr.sub", label: "แขวง/ตำบล" },
            { type: "text", path: "addr.dist", label: "เขต/อำเภอ" },
            {
              type: "select",
              path: "addr.prov",
              label: "จังหวัด",
              required: true,
              options: opts(PROVINCES),
            },
            { type: "text", path: "addr.zip", label: "รหัสไปรษณีย์", placeholder: "10110" },
            { type: "text", path: "addr.country", label: "ประเทศ" },
            {
              type: "text",
              path: "addr.maps",
              label: "Google Maps Link",
              span: true,
              placeholder: "https://maps.google.com/?q=13.7,100.5",
            },
          ],
        },
      ],
    },

    /* ---------- 3. TRANSACTION CONFIG ---------- */
    {
      key: "config",
      label: "Configuration",
      railLabel: "การตั้งค่า",
      labelTh: "ธุรกรรมที่คลังนี้รองรับ",
      blocks: () => [
        {
          type: "card",
          title: "Allowed Transactions",
          cols: "3",
          fields: [
            { type: "toggle", path: "config.purchase", label: "Purchase Receipt", onText: "รับซื้อได้", offText: "ไม่รับซื้อ" },
            { type: "toggle", path: "config.sales", label: "Sales Issue", onText: "จ่ายขายได้", offText: "ไม่จ่ายขาย" },
            { type: "toggle", path: "config.transfer", label: "Transfer", onText: "โอนย้ายได้", offText: "ไม่โอนย้าย" },
            { type: "toggle", path: "config.production", label: "Production", onText: "ใช้ในการผลิต", offText: "ไม่ใช้ผลิต" },
            { type: "toggle", path: "config.returns", label: "Returns", onText: "รับคืนได้", offText: "ไม่รับคืน" },
            {
              type: "toggle",
              path: "config.negative",
              label: "Allow Negative Stock",
              onText: "อนุญาตติดลบ",
              offText: "ห้ามติดลบ",
            },
          ],
        },
        /* No Default Warehouse switch.

           A single system-wide default is a company setting wearing a
           warehouse's clothes: it lived on eight records so that seven of
           them could say "no", and nothing downstream ever read it —
           every document picks its warehouse explicitly. */
        /* Valuation is not a per-warehouse choice any more.
           Stock is valued at moving average throughout, which is what the
           cost figures on the product record already are — offering five
           methods per warehouse invited two stores to value the same item
           two ways, and nothing downstream could have honoured the answer. */
      ],
    },

    /* ---------- 4. STORAGE RULES ---------- */
    {
      key: "rules",
      label: "Storage Rules",
      railLabel: "เงื่อนไขจัดเก็บ",
      labelTh: "อุณหภูมิและการรักษาสภาพ",
      blocks: () => [
        {
          type: "card",
          title: "Conditions",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "rules.temp",
              label: "Temperature",
              required: true,
              options: opts(WH_TEMPS),
            },
            {
              type: "select",
              path: "rules.secure",
              label: "Security Level",
              options: opts(WH_SECURITY),
            },
            { type: "toggle", path: "rules.humidity", label: "Humidity Controlled", onText: "ควบคุมความชื้น", offText: "ไม่ควบคุม" },
            { type: "toggle", path: "rules.hazardous", label: "Hazardous Goods", onText: "เก็บวัตถุอันตรายได้", offText: "ไม่รับวัตถุอันตราย" },
            { type: "toggle", path: "rules.controlled", label: "Controlled Substances", onText: "เก็บของควบคุมได้", offText: "ไม่เก็บของควบคุม" },
          ],
        },
        {
          type: "card",
          title: "Remarks",
          cols: "2",
          fields: [
            { type: "textarea", path: "rules.remarks", label: "Remarks", span: true, rows: 2 },
          ],
        },
        /* No Capacity card. "Current Usage" was typed by hand beside a
           maximum, so the utilisation figure was only ever as fresh as the
           last person who remembered to update it — and the warehouse
           already knows what it is holding. */
      ],
    },

    /* No Locations step.

       The bin tree is still stored and still read: Put Away and Picking
       resolve their bin lists from it. What is gone is typing a four-level
       Zone › Rack › Shelf › Bin structure into a create form, which is a
       warehouse layout job rather than a master-data one. A warehouse
       created here has no bins until somebody lays it out. */

    {
      key: "review",
      label: "Review",
      railLabel: "ตรวจทาน",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "code", label: "Warehouse Code", step: "general" },
    { path: "name", label: "Warehouse Name", step: "general" },
    { path: "type", label: "Warehouse Type", step: "general" },
    { path: "status", label: "Status", step: "general" },
    { path: "addr.line", label: "Address", step: "address" },
    { path: "addr.prov", label: "จังหวัด", step: "address" },
    { path: "rules.temp", label: "Temperature", step: "rules" },
  ],

  rules: [
    {
      label: "รหัสคลังต้องไม่ซ้ำกับคลังที่มีอยู่",
      step: "general",
      test: (s) =>
        !isCreate(s) || !WAREHOUSES.some((w) => w.code === String(s.code ?? "").trim()),
    },
    {
      label: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก",
      step: "address",
      test: (s) => validZip(String(s.addr?.zip ?? "")),
    },
  ],

  findDuplicates: (s) => {
    const name = String(s.name ?? "").trim().toLowerCase();
    if (name.length < 4) return [];
    return WAREHOUSES.filter(
      (w) => w.code !== s.code && w.name.toLowerCase() === name,
    ).map((w) => ({ code: w.code, name: w.name, why: "ชื่อคลังซ้ำ" }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("warehouse", code),

  /* No insight rail.

     It counted Zones, Racks, Shelves and Bins from a tree this form no
     longer edits, and read a utilisation off a capacity nobody keeps
     current — four zeroes and two dashes on every new warehouse, taking a
     third of the width to say nothing. */

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = WAREHOUSES.find((w) => w.code === code);

    /* Bin attributes (pick/putaway flags, capacity) are not edited by the tree
       field, so carry them across by bin code and default anything new. */
    const priorBins = new Map(
      existing ? flattenBins(existing).map((b) => [b.bin, b]) : [],
    );

    /* One function per level instead of one function that took a depth and
       returned `unknown[]`.

       The old shape was honest about being unprovable: a tree whose leaves are
       a different shape from its branches cannot be typed by a single
       recursive call, so it returned `unknown[]` and the double cast on the
       write took care of the rest. Nothing checked that a bin came out with a
       bin's fields on it. Four named levels cost a few lines and the compiler
       can read every one of them. */
    const named = (n: TreeNodeState) => ({
      code: String(n.code).trim(),
      name: String(n.name ?? ""),
    });
    const kids = (n: TreeNodeState) =>
      (n.children ?? []).filter((c) => String(c.code ?? "").trim());
    const live = (nodes: TreeNodeState[]) =>
      nodes.filter((n) => String(n.code ?? "").trim());

    const buildBin = (n: TreeNodeState): Bin => {
      const prior = priorBins.get(String(n.code).trim());
      return {
        ...named(n),
        binType: prior?.binType ?? "Storage",
        cap: prior?.cap ?? 100,
        capUnit: prior?.capUnit ?? String(s.rules?.capUnit ?? "Qty"),
        temp: prior?.temp ?? String(s.rules?.temp ?? "Ambient"),
        pick: prior?.pick ?? true,
        putaway: prior?.putaway ?? true,
        status: prior?.status ?? "Active",
      };
    };
    const buildShelf = (n: TreeNodeState): Shelf => ({
      ...named(n),
      children: kids(n).map(buildBin),
    });
    const buildRack = (n: TreeNodeState): Rack => ({
      ...named(n),
      children: kids(n).map(buildShelf),
    });
    const buildZone = (n: TreeNodeState): Zone => ({
      ...named(n),
      children: kids(n).map(buildRack),
    });

    const patch = {
      icon: String(s.icon ?? "🏭"),
      name: String(s.name ?? "").trim(),
      nameTh: String(s.nameTh ?? ""),
      type: String(s.type ?? ""),
      status: String(s.status ?? "Active"),
      desc: String(s.desc ?? ""),
      manager: String(s.manager ?? ""),
      phone: String(s.phone ?? ""),
      email: String(s.email ?? ""),
      config: { ...(s.config ?? {}) },
      addr: { ...(s.addr ?? {}), lat: existing?.addr.lat ?? "", lng: existing?.addr.lng ?? "" },
      rules: {
        ...(s.rules ?? {}),
        maxCap: num(s.rules?.maxCap),
        curCap: num(s.rules?.curCap),
      },
      locations: live((s.locations ?? []) as TreeNodeState[]).map(buildZone),
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Warehouse updated",
        d: "แก้ไขข้อมูลคลังสินค้าจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      const fresh: Warehouse = {
        code,
        ...patch,
        inv: {
          sku: 0,
          qty: 0,
          value: 0,
          reserved: 0,
          available: 0,
          pendingIn: 0,
          pendingOut: 0,
        },
        docs: [],
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Warehouse created",
            d: "สร้างคลังสินค้าเข้าระบบจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      };
      WAREHOUSES.push(fresh as WarehouseRow);
    }

    decorateWarehouses();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างคลังสินค้าแล้ว",
      message: `${code} — ${patch.name}`,
      goto: `/m/warehouse/${encodeURIComponent(code)}`,
    });
  },
};
