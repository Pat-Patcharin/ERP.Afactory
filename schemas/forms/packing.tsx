import {
  PACK_BOX_TYPES,
  PACK_HANDLING,
  PACK_PRIORITY,
  PACK_STAFF,
} from "@/data/packing";
import {
  PACKING_TASKS,
  decoratePacks,
  getPick,
  nextPackCode,
  packablePicks,
  warehouseOptions,
  type PackRow,
} from "@/lib/domain/outbound";
import { fmt, stamp, toDisplayDate, toInputDate } from "@/lib/format";
import type { FormSchema, GridRow } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, RailTotal, opts, saved } from "./common";

/* ============================================================
   PACKING FORM

   Two grids that have to agree with each other: what goes in the
   boxes, and what the boxes are. Every packed line must name a box
   that actually exists on this task.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** Box numbers declared on this task — the only valid targets for a line. */
const boxNumbers = (s: { packages?: GridRow[] }) =>
  ((s.packages ?? []) as GridRow[])
    .map((b) => String(b.box ?? "").trim())
    .filter(Boolean);

export const PACK_FORM: FormSchema<PackRow> = {
  key: "packing",
  entityLabel: "Packing Task",
  saveButton: "Save Packing Task",
  statusBadge: {
    Waiting: "info",
    "In Progress": "warning",
    Completed: "success",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextPackCode(),
    pickRef: "",
    soRef: "",
    customer: "",
    customerCode: "",
    warehouse: "",
    packer: "",
    status: "Waiting",
    packDate: "",
    dueDate: "",
    priority: "Normal",
    handling: "ปกติ",
    remark: "",
    items: [],
    packages: [],
  }),

  toState: (t) => ({
    _mode: "edit",
    code: t.code,
    pickRef: t.pickRef,
    soRef: t.soRef,
    customer: t.customer,
    customerCode: t.customerCode,
    warehouse: t.warehouse,
    packer: t.packer,
    status: t.status,
    packDate: toInputDate(t.packDate),
    dueDate: toInputDate(t.dueDate),
    priority: t.priority,
    handling: t.handling,
    remark: t.remark,
    items: (t.items ?? []).map((it) => ({ ...it })),
    packages: (t.packages ?? []).map((b) => ({ ...b })),
  }),

  steps: [
    /* ---------- 1. TASK ---------- */
    {
      key: "task",
      label: "Task",
      railLabel: "ข้อมูลงาน",
      labelTh: "ใบหยิบสินค้าและผู้แพ็ค",
      blocks: () => [
        {
          type: "card",
          title: "Task Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Pack No." },
            {
              type: "select",
              path: "pickRef",
              label: "Picking Task",
              required: true,
              options: packablePicks().map((p) => p.code),
              hint: "แสดงเฉพาะใบหยิบสินค้าที่ปิดงานแล้วและยังไม่มีงานแพ็ค",
              when: (st) => st._mode === "create",
            },
            {
              type: "static",
              path: "pickRef",
              label: "Picking Task",
              when: (st) => st._mode !== "create",
            },
            { type: "static", path: "soRef", label: "Sales Order" },
            { type: "static", path: "customer", label: "Customer" },
            {
              type: "select",
              path: "warehouse",
              label: "Warehouse",
              required: true,
              options: warehouseOptions(),
            },
            { type: "select", path: "packer", label: "Packer", options: opts(PACK_STAFF) },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(PACK_PRIORITY),
            },
            { type: "date", path: "dueDate", label: "Due Date", required: true },
            {
              type: "select",
              path: "handling",
              label: "Handling",
              required: true,
              options: opts(PACK_HANDLING),
              hint: "ข้อมูลนี้จะถูกส่งต่อไปยังใบส่งของและผู้ขนส่ง",
            },
          ],
        },
      ],
    },

    /* ---------- 2. BOXES ---------- */
    {
      key: "boxes",
      label: "Boxes",
      railLabel: "กล่อง",
      labelTh: "กล่องและน้ำหนัก",
      blocks: () => [
        {
          type: "note",
          label: "สร้างกล่องก่อน แล้วค่อยจับสินค้าลงกล่อง",
          text: "หมายเลขกล่องที่สร้างที่นี่จะกลายเป็นตัวเลือกในคอลัมน์ Box ของขั้นตอนถัดไป",
        },
        {
          type: "grid",
          path: "packages",
          label: "Packages",
          required: true,
          addLabel: "เพิ่มกล่อง",
          empty: "ยังไม่มีกล่อง — ต้องมีอย่างน้อย 1 ใบก่อนปิดงานแพ็ค",
          cols: [
            { key: "box", label: "Box No.", type: "text", required: true, width: "110px", placeholder: "BOX-01" },
            { key: "type", label: "Box Type", type: "select", options: opts(PACK_BOX_TYPES), width: "210px" },
            { key: "weight", label: "Weight (กก.)", type: "number", align: "right", width: "110px" },
            { key: "dim", label: "Dimension", type: "text", width: "130px", placeholder: "60×40×40" },
            { key: "sealNo", label: "Seal No.", type: "text", width: "130px" },
            { key: "note", label: "Note", type: "text" },
          ],
        },
      ],
    },

    /* ---------- 3. LINES ---------- */
    {
      key: "lines",
      label: "Items",
      railLabel: "จับลงกล่อง",
      labelTh: "สินค้าและกล่องปลายทาง",
      blocks: (s) => [
        {
          type: "grid",
          path: "items",
          label: "Items to Pack",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกใบหยิบสินค้าในขั้นตอนแรกเพื่อดึงรายการที่ต้องแพ็ค",
          hint: "จำนวนที่แพ็คต้องไม่เกินจำนวนที่ฝ่ายหยิบส่งมา",
          cols: [
            { key: "line", label: "#", type: "static", align: "right", muted: true, width: "44px" },
            { key: "code", label: "Product", type: "static", width: "150px" },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "200px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "60px" },
            { key: "qty", label: "Qty from Pick", type: "static", align: "right", muted: true, width: "110px" },
            { key: "packedQty", label: "Packed", type: "number", align: "right", required: true, width: "95px" },
            {
              key: "remaining",
              label: "คงเหลือ",
              type: "computed",
              align: "right",
              get: (r) => {
                const left = Math.max(0, num(r.qty) - num(r.packedQty));
                return left > 0 ? fmt(left) : "—";
              },
              cls: (r) =>
                num(r.qty) - num(r.packedQty) > 0 ? "font-semibold text-warning-text" : "",
            },
            {
              key: "box",
              label: "Box",
              type: "select",
              options: boxNumbers(s),
              width: "120px",
              placeholder: "เลือกกล่อง",
            },
            { key: "note", label: "Note", type: "text", width: "150px" },
          ],
        },
        {
          type: "card",
          title: "Remark",
          cols: "2",
          fields: [
            { type: "textarea", path: "remark", label: "Remark", span: true, rows: 2 },
          ],
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
    { path: "pickRef", label: "Picking Task", step: "task" },
    { path: "warehouse", label: "Warehouse", step: "task" },
    { path: "priority", label: "Priority", step: "task" },
    { path: "dueDate", label: "Due Date", step: "task" },
    { path: "handling", label: "Handling", step: "task" },
    {
      path: "packages",
      label: "กล่องอย่างน้อย 1 ใบ",
      step: "boxes",
      test: (s) => boxNumbers(s).length > 0,
    },
    {
      path: "items",
      label: "รายการที่ต้องแพ็คอย่างน้อย 1 บรรทัด",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.qty) > 0),
    },
  ],

  rules: [
    {
      label: "หมายเลขกล่องต้องไม่ซ้ำกัน",
      step: "boxes",
      test: (s) => {
        const list = boxNumbers(s);
        return new Set(list).size === list.length;
      },
    },
    {
      label: "น้ำหนักกล่องต้องไม่ติดลบ",
      step: "boxes",
      test: (s) => ((s.packages ?? []) as GridRow[]).every((b) => num(b.weight) >= 0),
    },
    {
      label: "จำนวนที่แพ็คต้องไม่เกินจำนวนที่ฝ่ายหยิบส่งมา",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.packedQty) <= num(r.qty)),
    },
    {
      label: "บรรทัดที่แพ็คแล้วต้องระบุกล่องปลายทาง",
      step: "lines",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => num(r.packedQty) === 0 || Boolean(String(r.box ?? "").trim()),
        ),
    },
    {
      label: "กล่องที่ระบุในบรรทัดต้องมีอยู่ในรายการกล่อง",
      step: "lines",
      test: (s) => {
        const boxes = boxNumbers(s);
        return ((s.items ?? []) as GridRow[]).every((r) => {
          const b = String(r.box ?? "").trim();
          return !b || boxes.includes(b);
        });
      },
    },
  ],

  /** The picking task decides what arrives on the packing bench. */
  onChange: (path, s) => {
    if (path !== "pickRef") return;
    const pick = getPick(String(s.pickRef ?? ""));
    if (!pick) return;

    s.soRef = pick.soRef;
    s.customer = pick.customer;
    s.customerCode = pick.customerCode;
    s.warehouse = pick.warehouse;
    s.priority = pick.priority;
    s.dueDate = toInputDate(pick.dueDate);

    s.items = (pick.items ?? [])
      .filter((it) => num(it.picked) > 0)
      .map((it, i) => ({
        line: i + 1,
        code: it.code,
        name: it.name,
        unit: it.unit,
        qty: num(it.picked),
        packedQty: num(it.picked),
        box: "",
        note: "",
      }));
  },

  newRow: (path) => {
    if (path === "packages")
      return { box: "", type: "Carton M (40×30×25 cm)", weight: 0, dim: "", sealNo: "", note: "" };
    return { line: 0, code: "", name: "", unit: "", qty: 0, packedQty: 0, box: "", note: "" };
  },

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const boxes = (s.packages ?? []) as GridRow[];
    const packed = rows.reduce((t, r) => t + num(r.packedQty), 0);
    const total = rows.reduce((t, r) => t + num(r.qty), 0);
    const weight = Math.round(boxes.reduce((t, b) => t + num(b.weight), 0) * 100) / 100;

    return (
      <RailCard icon="packing" title="Pack Preview" tone="accent">
        <RailRow label="เลขที่งาน" value={String(s.code ?? "") || "ออกให้ตอนบันทึก"} />
        <RailRow label="ใบสั่งขาย" value={String(s.soRef ?? "") || "—"} />
        <RailRow label="จำนวนกล่อง" value={boxes.length} />
        <RailRow label="น้ำหนักรวม" value={`${weight} กก.`} />
        <RailTotal label="แพ็คแล้ว / ทั้งหมด" value={`${fmt(packed)} / ${fmt(total)}`} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const boxes = boxNumbers(s);
    const unboxed = rows.filter((r) => num(r.packedQty) > 0 && !String(r.box ?? "").trim());
    const partial = rows.filter((r) => num(r.packedQty) < num(r.qty));
    const emptyBoxes = boxes.filter(
      (b) => !rows.some((r) => String(r.box ?? "").trim() === b),
    );

    return (
      <RailCard
        icon="box"
        title="Packing Check"
        tone={unboxed.length || emptyBoxes.length ? "warn" : "default"}
      >
        <RailRow label="กล่องที่สร้างไว้" value={boxes.length} tone={boxes.length ? "ok" : "warn"} />
        <RailRow
          label="บรรทัดที่ยังไม่จับกล่อง"
          value={`${unboxed.length} บรรทัด`}
          tone={unboxed.length ? "danger" : "ok"}
        />
        <RailRow label="แพ็คไม่ครบจำนวน" value={`${partial.length} บรรทัด`} tone={partial.length ? "warn" : "ok"} />
        <RailRow label="กล่องที่ยังว่าง" value={`${emptyBoxes.length} ใบ`} />
        {String(s.handling ?? "") !== "ปกติ" && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            งานนี้ต้องระวังพิเศษ ({String(s.handling)}) — ติดสัญลักษณ์บนกล่องทุกใบ
            และระบุในใบส่งของ
          </p>
        )}
        {emptyBoxes.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            กล่อง {emptyBoxes.join(", ")} ยังไม่มีสินค้าอยู่ข้างใน — ลบทิ้งหรือจับสินค้าลงไป
          </p>
        )}
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PACKING_TASKS.find((t) => t.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        qty: num(r.qty),
        packedQty: num(r.packedQty),
        box: String(r.box ?? ""),
        note: String(r.note ?? ""),
      }));

    const packages = ((s.packages ?? []) as GridRow[])
      .filter((b) => String(b.box ?? "").trim())
      .map((b) => ({
        box: String(b.box).trim(),
        type: String(b.type ?? ""),
        weight: num(b.weight),
        dim: String(b.dim ?? ""),
        sealNo: String(b.sealNo ?? ""),
        note: String(b.note ?? ""),
      }));

    const packer = String(s.packer ?? "");
    const anyPacked = items.some((it) => it.packedQty > 0);

    const patch = {
      pickRef: String(s.pickRef ?? ""),
      soRef: String(s.soRef ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      warehouse: String(s.warehouse ?? ""),
      packer,
      packDate: toDisplayDate(s.packDate) || (anyPacked ? now.split(" ")[0] : ""),
      dueDate: toDisplayDate(s.dueDate),
      priority: String(s.priority ?? "Normal"),
      handling: String(s.handling ?? "ปกติ"),
      remark: String(s.remark ?? ""),
      items,
      packages,
      status: anyPacked ? "In Progress" : "Waiting",
      updated: now,
      updatedBy: FORM_USER,
    };

    if (existing) {
      if (["Completed", "Cancelled"].includes(existing.status)) patch.status = existing.status;
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Packing task updated",
        d: "แก้ไขงานแพ็คจากฟอร์ม",
        u: FORM_USER,
        when: now,
        kind: "primary",
      });
    } else {
      PACKING_TASKS.unshift({
        code,
        ...patch,
        doRef: "",
        created: now,
        createdBy: FORM_USER,
        history: [
          {
            t: patch.pickRef ? `Created from ${patch.pickRef}` : "Created",
            d: "สร้างงานแพ็คจากฟอร์ม",
            u: FORM_USER,
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as PackRow);

      /* Close the loop on the pick this task came from. */
      const pick = getPick(patch.pickRef);
      if (pick && !pick.packRef) pick.packRef = code;
    }

    decoratePacks();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างงานแพ็คแล้ว",
      message: `${code} — ${packages.length} กล่อง · ${fmt(items.length)} รายการ`,
      goto: `/m/packing/${encodeURIComponent(code)}`,
    });
  },
};
