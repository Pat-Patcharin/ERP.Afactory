import {
  PICK_LINE_STATUS,
  PICK_PRIORITY,
  PICK_SHORT_REASONS,
  PICK_STAFF,
  PICK_STRATEGIES,
} from "@/data/picking";
import type { PickingTask } from "@/data/picking";
import { paAllBins, paBinShort } from "@/lib/domain/inbound";
import { productStock } from "@/lib/domain/product";
import {
  PICKING_TASKS,
  decoratePicks,
  getSO,
  nextPickCode,
  openSalesOrders,
  warehouseOptions,
  type PickRow,
} from "@/lib/domain/outbound";
import { fmt, stamp, isoToDmy, dmyToIso } from "@/lib/format";
import type { FormSchema, GridRow } from "@/lib/types";
import { FORM_USER, opts, saved } from "./common";

/* ============================================================
   PICKING FORM

   The picker's screen. Everything except the picked quantity and
   the bin comes from the sales order, so the form deliberately
   leaves only those two columns freely editable.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const binOptions = () => paAllBins().map((b) => b.path);

const shortOf = (r: GridRow) => Math.max(0, num(r.ordered) - num(r.picked));

export const PICK_FORM: FormSchema<PickRow> = {
  key: "picking",
  entityLabel: "Picking Task",
  saveButton: "Save Picking Task",
  statusBadge: {
    Waiting: "info",
    Assigned: "warning",
    "In Progress": "warning",
    Completed: "success",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextPickCode(),
    soRef: "",
    customer: "",
    customerCode: "",
    warehouse: "",
    assignedTo: "",
    priority: "Normal",
    status: "Waiting",
    pickDate: "",
    dueDate: "",
    strategy: "FEFO (หมดอายุก่อน หยิบก่อน)",
    remark: "",
    items: [],
  }),

  toState: (t) => ({
    _mode: "edit",
    code: t.code,
    soRef: t.soRef,
    customer: t.customer,
    customerCode: t.customerCode,
    warehouse: t.warehouse,
    assignedTo: t.assignedTo,
    priority: t.priority,
    status: t.status,
    pickDate: dmyToIso(t.pickDate),
    dueDate: dmyToIso(t.dueDate),
    strategy: t.strategy,
    remark: t.remark,
    items: (t.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. TASK ---------- */
    {
      key: "task",
      label: "Task",
      railLabel: "ข้อมูลงาน",
      labelTh: "ใบสั่งขายและผู้รับผิดชอบ",
      blocks: (s) => [
        {
          type: "card",
          title: "Task Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Pick No." },
            {
              type: "select",
              path: "soRef",
              label: "Sales Order",
              required: true,
              options: openSalesOrders().map((so) => so.code),
              hint: "เลือกใบสั่งขายแล้วระบบจะดึงรายการที่ยังไม่ได้หยิบมาให้",
              when: (st) => st._mode === "create",
            },
            {
              type: "static",
              path: "soRef",
              label: "Sales Order",
              when: (st) => st._mode !== "create",
            },
            { type: "static", path: "customer", label: "Customer" },
            {
              type: "select",
              path: "warehouse",
              label: "Warehouse",
              required: true,
              options: warehouseOptions(),
              readonly: Boolean(s.soRef),
            },
            {
              type: "select",
              path: "assignedTo",
              label: "Assigned To",
              options: opts(PICK_STAFF),
              hint: "เว้นว่างไว้เพื่อสร้างงานรอมอบหมาย",
            },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(PICK_PRIORITY),
            },
            { type: "date", path: "dueDate", label: "Due Date", required: true },
            {
              type: "select",
              path: "strategy",
              label: "Picking Strategy",
              required: true,
              options: opts(PICK_STRATEGIES),
              hint: "บอกผู้หยิบว่าจะเดินคลังอย่างไร",
            },
          ],
        },
      ],
    },

    /* ---------- 2. LINES ---------- */
    {
      key: "lines",
      label: "Pick Lines",
      railLabel: "รายการหยิบ",
      labelTh: "จำนวนที่หยิบได้จริง",
      blocks: () => [
        {
          type: "note",
          label: "กรอกเฉพาะจำนวนที่หยิบได้จริงและช่องเก็บ",
          text: "จำนวนที่สั่งมาจากใบสั่งขาย แก้ที่นี่ไม่ได้ — ถ้าหยิบได้ไม่ครบ ให้ระบุเหตุผลในช่อง Note เพื่อให้ฝ่ายขายติดตามต่อ",
        },
        {
          type: "grid",
          path: "items",
          label: "Lines to Pick",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกใบสั่งขายในขั้นตอนแรกเพื่อดึงรายการที่ต้องหยิบ",
          cols: [
            { key: "line", label: "#", type: "static", align: "right", muted: true, width: "44px" },
            { key: "code", label: "Product", type: "static", width: "150px" },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "180px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "60px" },
            { key: "ordered", label: "Ordered", type: "static", align: "right", muted: true, width: "80px" },
            {
              key: "onHand",
              label: "Available",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => {
                const st = productStock(String(r.code ?? ""));
                return st ? fmt(st.available) : "—";
              },
            },
            { key: "picked", label: "Picked", type: "number", align: "right", required: true, width: "90px" },
            {
              key: "short",
              label: "ขาด",
              type: "computed",
              align: "right",
              get: (r) => (shortOf(r) > 0 ? fmt(shortOf(r)) : "—"),
              cls: (r) => (shortOf(r) > 0 ? "font-semibold text-warning-text" : ""),
            },
            { key: "lot", label: "Lot", type: "text", width: "130px" },
            { key: "bin", label: "Bin", type: "select", options: binOptions(), width: "230px" },
            {
              key: "status",
              label: "Line Status",
              type: "select",
              options: opts(PICK_LINE_STATUS),
              width: "130px",
            },
            { key: "note", label: "Note", type: "select", options: opts(PICK_SHORT_REASONS), width: "150px" },
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
    { path: "soRef", label: "Sales Order", step: "task" },
    { path: "warehouse", label: "Warehouse", step: "task" },
    { path: "priority", label: "Priority", step: "task" },
    { path: "dueDate", label: "Due Date", step: "task" },
    { path: "strategy", label: "Picking Strategy", step: "task" },
    {
      path: "items",
      label: "รายการที่ต้องหยิบอย่างน้อย 1 บรรทัด",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.ordered) > 0),
    },
  ],

  rules: [
    {
      label: "จำนวนที่หยิบต้องไม่เกินจำนวนที่สั่ง",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.picked) <= num(r.ordered)),
    },
    {
      label: "จำนวนที่หยิบต้องไม่ติดลบ",
      step: "lines",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.picked) >= 0),
    },
    {
      label: "บรรทัดที่หยิบไม่ครบต้องระบุเหตุผลในช่อง Note",
      step: "lines",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => shortOf(r) === 0 || Boolean(String(r.note ?? "").trim()),
        ),
    },
    {
      label: "บรรทัดที่หยิบแล้วต้องระบุช่องเก็บที่หยิบมา",
      step: "lines",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => num(r.picked) === 0 || Boolean(String(r.bin ?? "").trim()),
        ),
    },
    {
      label: "งานที่มอบหมายแล้วต้องเลือกผู้รับผิดชอบ",
      step: "task",
      test: (s) => s.status === "Waiting" || Boolean(String(s.assignedTo ?? "").trim()),
    },
  ],

  /** The sales order decides what has to be picked and from where. */
  onChange: (path, s) => {
    if (path !== "soRef") return;
    const so = getSO(String(s.soRef ?? ""));
    if (!so) return;

    s.customer = so.customer;
    s.customerCode = so.customerCode;
    s.warehouse = so.warehouse;
    s.priority = so.priority;
    s.dueDate = dmyToIso(so.deliveryDate);

    s.items = (so.items ?? [])
      .filter((it) => num(it.qty) - num(it.picked) > 0)
      .map((it, i) => ({
        line: i + 1,
        code: it.code,
        name: it.name,
        unit: it.unit,
        lot: "",
        ordered: num(it.qty) - num(it.picked),
        picked: 0,
        bin: "",
        status: "Pending",
        note: "",
      }));
  },

  /** Keep the line status honest as the picker types quantities. */
  onGridChange: (path, s) => {
    if (path !== "items") return;
    for (const r of (s.items ?? []) as GridRow[]) {
      if (num(r.picked) === 0) r.status = "Pending";
      else if (num(r.picked) < num(r.ordered)) r.status = "Short";
      else r.status = "Picked";
    }
  },

  newRow: () => ({
    line: 0,
    code: "",
    name: "",
    unit: "",
    lot: "",
    ordered: 0,
    picked: 0,
    bin: "",
    status: "Pending",
    note: "",
  }),

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PICKING_TASKS.find((t) => t.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        lot: String(r.lot ?? ""),
        ordered: num(r.ordered),
        picked: num(r.picked),
        bin: String(r.bin ?? ""),
        status: String(r.status ?? "Pending"),
        note: String(r.note ?? ""),
      }));

    const assignedTo = String(s.assignedTo ?? "");
    const anyPicked = items.some((it) => it.picked > 0);

    const patch = {
      soRef: String(s.soRef ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      warehouse: String(s.warehouse ?? ""),
      assignedTo,
      priority: String(s.priority ?? "Normal"),
      pickDate: isoToDmy(s.pickDate) || (anyPicked ? now.split(" ")[0] : ""),
      dueDate: isoToDmy(s.dueDate),
      strategy: String(s.strategy ?? ""),
      remark: String(s.remark ?? ""),
      items,
      /* Status follows the work actually recorded, not a dropdown. */
      status: anyPicked ? "In Progress" : assignedTo ? "Assigned" : "Waiting",
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      /* Never downgrade a task the workflow already closed. */
      if (["Completed", "Cancelled"].includes(existing.status)) patch.status = existing.status;
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Picking task updated",
        d: "แก้ไขงานหยิบสินค้าจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      const fresh: PickingTask = {
        code,
        ...patch,
        packRef: "",
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.soRef ? `Created from ${patch.soRef}` : "Created",
            d: "สร้างงานหยิบสินค้าจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      };
      PICKING_TASKS.unshift(fresh as PickRow);
    }

    decoratePicks();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างงานหยิบสินค้าแล้ว",
      message: `${code} — ${items.length} บรรทัด · ช่องเก็บหลัก ${paBinShort(items[0]?.bin)}`,
      goto: `/m/picking/${encodeURIComponent(code)}`,
    });
  },
};
