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
import { FORM_USER, RailCard, RailRow, isCreate, opts, saved } from "./common";

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
      isDefault: false,
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
      labelTh: "รหัส ชื่อ และผู้ดูแล",
      blocks: () => [
        {
          type: "card",
          title: "Warehouse Identity",
          cols: "2",
          fields: [
            { type: "image", path: "icon", label: "Icon", span: true },
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
            { type: "text", path: "nameTh", label: "ชื่อภาษาไทย" },
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
        {
          type: "card",
          title: "Responsible Person",
          cols: "3",
          fields: [
            {
              type: "text",
              path: "manager",
              label: "Warehouse Manager",
              required: true,
              placeholder: "Somchai B.",
            },
            { type: "text", path: "phone", label: "Phone", placeholder: "02-123-4567" },
            { type: "text", path: "email", label: "Email" },
          ],
        },
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
      labelTh: "ธุรกรรมและการตีมูลค่า",
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
        {
          type: "card",
          title: "Valuation",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "config.valuation",
              label: "Valuation Method",
              required: true,
              options: opts(WH_VALUATION),
            },
            {
              type: "select",
              path: "config.costing",
              label: "Costing Method",
              options: opts(WH_COSTING),
            },
            {
              type: "toggle",
              path: "config.isDefault",
              label: "Default Warehouse",
              onText: "คลังหลักของระบบ",
              offText: "คลังทั่วไป",
            },
          ],
        },
      ],
    },

    /* ---------- 4. STORAGE RULES ---------- */
    {
      key: "rules",
      label: "Storage Rules",
      railLabel: "เงื่อนไขจัดเก็บ",
      labelTh: "อุณหภูมิและความจุ",
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
          title: "Capacity",
          cols: "3",
          fields: [
            { type: "number", path: "rules.maxCap", label: "Maximum Capacity", min: 0 },
            { type: "number", path: "rules.curCap", label: "Current Usage", min: 0 },
            {
              type: "select",
              path: "rules.capUnit",
              label: "Capacity Unit",
              options: opts(WH_CAP_UNIT),
            },
            {
              type: "static",
              label: "Utilisation",
              value: (s) => {
                const max = num(s.rules?.maxCap);
                if (!max) return "—";
                return `${Math.round((num(s.rules?.curCap) / max) * 100)}%`;
              },
            },
            { type: "textarea", path: "rules.remarks", label: "Remarks", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 5. LOCATIONS ---------- */
    {
      key: "locations",
      label: "Locations",
      railLabel: "ผังจัดเก็บ",
      labelTh: "Zone › Rack › Shelf › Bin",
      blocks: () => [
        {
          type: "note",
          label: "ผังจัดเก็บกำหนดว่ารับของเข้าคลังนี้ได้หรือไม่",
          text: "งาน Put Away จะแนะนำ Bin จากผังนี้ — คลังที่ยังไม่มี Bin จะไม่ถูกเสนอเป็นตำแหน่งจัดเก็บ",
        },
        {
          type: "tree",
          path: "locations",
          label: "Storage Structure",
          required: true,
          addLabel: "เพิ่ม Zone",
          empty: "ยังไม่มีโครงสร้างจัดเก็บ — เพิ่ม Zone แรกเพื่อเริ่มต้น",
          levels: WH_LEVELS,
        },
      ],
    },

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
    { path: "manager", label: "Warehouse Manager", step: "general" },
    { path: "addr.line", label: "Address", step: "address" },
    { path: "addr.prov", label: "จังหวัด", step: "address" },
    { path: "config.valuation", label: "Valuation Method", step: "config" },
    { path: "rules.temp", label: "Temperature", step: "rules" },
    {
      path: "locations",
      label: "โครงสร้างจัดเก็บอย่างน้อย 1 Zone",
      step: "locations",
      test: (s) => ((s.locations ?? []) as TreeNodeState[]).some((z) => String(z.code ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "รหัสคลังต้องไม่ซ้ำกับคลังที่มีอยู่",
      step: "general",
      test: (s) =>
        !isCreate(s) || !WAREHOUSES.some((w) => w.code === String(s.code ?? "").trim()),
    },
    {
      label: "อีเมลผู้ดูแลคลังต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "general",
      test: (s) => validEmail(String(s.email ?? "")),
    },
    {
      label: "เบอร์โทรต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "general",
      test: (s) => validPhone(String(s.phone ?? "")),
    },
    {
      label: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก",
      step: "address",
      test: (s) => validZip(String(s.addr?.zip ?? "")),
    },
    {
      label: "มีคลังหลักของระบบได้เพียงคลังเดียว",
      step: "config",
      test: (s) =>
        !s.config?.isDefault ||
        !WAREHOUSES.some((w) => w.config?.isDefault && w.code !== s.code),
    },
    {
      label: "ปริมาณที่ใช้อยู่ต้องไม่เกินความจุสูงสุด",
      step: "rules",
      test: (s) => !num(s.rules?.maxCap) || num(s.rules.curCap) <= num(s.rules.maxCap),
    },
    {
      label: "ทุก Zone ต้องมีรหัสกำกับ",
      step: "locations",
      test: (s) =>
        ((s.locations ?? []) as TreeNodeState[]).every((z) => String(z.code ?? "").trim()),
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

  sidePanel: (s) => {
    const tree = (s.locations ?? []) as TreeNodeState[];
    const max = num(s.rules?.maxCap);
    const util = max ? Math.round((num(s.rules?.curCap) / max) * 100) : 0;

    return (
      <RailCard icon="warehouse" title="Storage Insight" tone={util > 85 ? "warn" : "default"}>
        <RailRow label="Zone" value={countDepth(tree, 0)} />
        <RailRow label="Rack" value={countDepth(tree, 1)} />
        <RailRow label="Shelf" value={countDepth(tree, 2)} />
        <RailRow label="Bin" value={countDepth(tree, 3)} />
        <RailRow
          label="Utilisation"
          value={max ? `${util}%` : "—"}
          tone={util > 85 ? "warn" : util > 0 ? "ok" : undefined}
        />
        <RailRow label="ความจุสูงสุด" value={max ? `${fmt(max)} ${String(s.rules?.capUnit ?? "")}` : "—"} />
        {countDepth(tree, 3) === 0 && (
          <p className="mt-3 text-cap leading-relaxed text-ink-2">
            ยังไม่มี Bin — คลังนี้จะยังไม่ถูกเสนอเป็นตำแหน่งจัดเก็บในงาน Put Away
          </p>
        )}
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = WAREHOUSES.find((w) => w.code === code);

    /* Bin attributes (pick/putaway flags, capacity) are not edited by the tree
       field, so carry them across by bin code and default anything new. */
    const priorBins = new Map(
      existing ? flattenBins(existing).map((b) => [b.bin, b]) : [],
    );

    const build = (nodes: TreeNodeState[], depth: number): unknown[] =>
      nodes
        .filter((n) => String(n.code ?? "").trim())
        .map((n) => {
          const base = { code: String(n.code).trim(), name: String(n.name ?? "") };
          if (depth < 3) {
            return { ...base, children: build(n.children ?? [], depth + 1) };
          }
          const prior = priorBins.get(base.code);
          return {
            ...base,
            binType: prior?.binType ?? "Storage",
            cap: prior?.cap ?? 100,
            capUnit: prior?.capUnit ?? String(s.rules?.capUnit ?? "Qty"),
            temp: prior?.temp ?? String(s.rules?.temp ?? "Ambient"),
            pick: prior?.pick ?? true,
            putaway: prior?.putaway ?? true,
            status: prior?.status ?? "Active",
          };
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
      locations: build((s.locations ?? []) as TreeNodeState[], 0),
      updated: now,
      updatedBy: FORM_USER,
    };

    /* A new default warehouse demotes the previous one. */
    if (s.config?.isDefault) {
      for (const w of WAREHOUSES) {
        if (w.code !== code && w.config) w.config.isDefault = false;
      }
    }

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Warehouse updated",
        d: "แก้ไขข้อมูลคลังสินค้าจากฟอร์ม",
        u: FORM_USER,
        when: now,
        kind: "primary",
      });
    } else {
      WAREHOUSES.push({
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
        createdBy: FORM_USER,
        history: [
          {
            t: "Warehouse created",
            d: "สร้างคลังสินค้าเข้าระบบจากฟอร์ม",
            u: FORM_USER,
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as WarehouseRow);
    }

    decorateWarehouses();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างคลังสินค้าแล้ว",
      message: `${code} — ${patch.name}`,
      goto: `/m/warehouse/${encodeURIComponent(code)}`,
    });
  },
};
