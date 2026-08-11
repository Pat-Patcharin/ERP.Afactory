import type { PutAwayTask } from "@/data/putaway";
import { PA_PRIORITY, PA_STAFF } from "@/data/putaway";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import {
  GOODS_RECEIPTS,
  PUTAWAY_TASKS,
  QC_INSPECTIONS,
  decorateGRs,
  decoratePAs,
  getGR,
  nextPACode,
  paAllBins,
  paBinInfo,
  paBinShort,
  paSuggestBins,
  paTotalQty,
  type PaRow,
} from "@/lib/domain/inbound";
import { fmt, stamp } from "@/lib/format";
import type { FormSchema, GridRow } from "@/lib/types";
import { FORM_USER, opts, saved } from "./common";

/* ============================================================
   PUT AWAY FORM — the last inbound step. Confirming a task is
   what finally makes stock available, so the bin each line lands
   in is the only thing this form really asks about.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** Receipts that have cleared QC (or never needed it) are ready to store. */
const readyGRs = () =>
  GOODS_RECEIPTS.filter((g) => g.status === "Ready for Put Away");

const binOptions = () => paAllBins().map((b) => b.path);

export const PA_FORM: FormSchema<PaRow> = {
  key: "put-away",
  entityLabel: "Put Away Task",
  saveButton: "Save Put Away Task",
  statusBadge: {
    Waiting: "info",
    Assigned: "warning",
    "In Progress": "warning",
    Completed: "success",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextPACode(),
    grRef: "",
    qcRef: "",
    warehouse: WAREHOUSES[0] ? `${WAREHOUSES[0].code} ${WAREHOUSES[0].name}` : "",
    priority: "Medium",
    status: "Waiting",
    assignedTo: "",
    createdFrom: "Goods Receipt",
    items: [],
  }),

  toState: (t) => ({
    _mode: "edit",
    code: t.code,
    grRef: t.grRef,
    qcRef: t.qcRef,
    warehouse: t.warehouse,
    priority: t.priority,
    status: t.status,
    assignedTo: t.assignedTo,
    createdFrom: t.createdFrom,
    items: (t.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. TASK ---------- */
    {
      key: "task",
      label: "Task",
      railLabel: "ข้อมูลงาน",
      labelTh: "ที่มาและผู้รับผิดชอบ",
      blocks: () => [
        {
          type: "card",
          title: "Task Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Task Number" },
            {
              type: "select",
              path: "grRef",
              label: "Goods Receipt",
              required: true,
              options: readyGRs().map((g) => g.code),
              hint: "แสดงเฉพาะใบรับของที่ผ่าน QC แล้วหรือไม่ต้องตรวจ",
            },
            { type: "static", path: "qcRef", label: "QC Reference" },
            {
              type: "select",
              path: "warehouse",
              label: "Warehouse",
              required: true,
              options: WAREHOUSES.map((w) => `${w.code} ${w.name}`),
            },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(PA_PRIORITY),
            },
            {
              type: "select",
              path: "assignedTo",
              label: "Assigned To",
              options: opts(PA_STAFF),
              hint: "เว้นว่างไว้เพื่อสร้างงานรอมอบหมาย",
            },
          ],
        },
      ],
    },

    /* ---------- 2. BIN ASSIGNMENT ---------- */
    {
      key: "bins",
      label: "Bin Assignment",
      railLabel: "ตำแหน่งจัดเก็บ",
      labelTh: "เลือก Bin ปลายทาง",
      blocks: () => [
        {
          type: "note",
          label: "คอลัมน์ Suggested มาจากการให้คะแนนพื้นที่ว่าง อุณหภูมิ และสินค้าเดิมในช่อง",
          text: "เลือก Bin ที่ระบบแนะนำได้เลย หรือกำหนดเองหากมีเหตุผลเฉพาะหน้างาน",
        },
        {
          type: "grid",
          path: "items",
          label: "Lines to Store",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกใบรับของในขั้นตอนแรกเพื่อดึงรายการที่ต้องจัดเก็บ",
          cols: [
            { key: "code", label: "Product", type: "static", width: "150px" },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "190px" },
            { key: "lot", label: "Lot / Serial", type: "text", width: "130px" },
            { key: "qty", label: "Qty", type: "number", align: "right", required: true, width: "90px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "64px" },
            { key: "curLoc", label: "From", type: "static", muted: true, width: "130px" },
            {
              key: "suggestBin",
              label: "Suggested",
              type: "computed",
              muted: true,
              get: (r) => paBinShort(r.suggestBin),
            },
            {
              key: "destBin",
              label: "Destination Bin",
              type: "select",
              options: binOptions(),
              width: "230px",
            },
            {
              key: "fit",
              label: "พื้นที่ว่าง",
              type: "computed",
              align: "right",
              get: (r) => {
                const info = paBinInfo(String(r.destBin ?? ""));
                if (!info) return "—";
                return `${fmt(info.free)} / ${fmt(info.cap)}`;
              },
              cls: (r) => {
                const info = paBinInfo(String(r.destBin ?? ""));
                return info && info.free < num(r.qty) ? "font-semibold text-danger" : "";
              },
            },
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
    { path: "grRef", label: "Goods Receipt", step: "task" },
    { path: "warehouse", label: "Warehouse", step: "task" },
    { path: "priority", label: "Priority", step: "task" },
    {
      path: "items",
      label: "รายการที่ต้องจัดเก็บอย่างน้อย 1 บรรทัด",
      step: "bins",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.qty) > 0),
    },
  ],

  rules: [
    {
      label: "จำนวนที่จัดเก็บต้องมากกว่า 0 ทุกบรรทัด",
      step: "bins",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.qty) > 0),
    },
    {
      label: "Bin ปลายทางต้องมีพื้นที่ว่างพอสำหรับจำนวนที่จัดเก็บ",
      step: "bins",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) => {
          const info = paBinInfo(String(r.destBin ?? ""));
          return !info || info.free >= num(r.qty);
        }),
    },
    {
      label: "Bin ปลายทางต้องอยู่ในคลังเดียวกับงานจัดเก็บ",
      step: "bins",
      test: (s) => {
        const whCode = String(s.warehouse ?? "").split(" ")[0];
        return ((s.items ?? []) as GridRow[]).every((r) => {
          const dest = String(r.destBin ?? "");
          return !dest || dest.startsWith(`${whCode}/`);
        });
      },
    },
    {
      label: "งานที่มอบหมายแล้วต้องเลือก Bin ปลายทางครบทุกบรรทัด",
      step: "bins",
      test: (s) =>
        !s.assignedTo ||
        ((s.items ?? []) as GridRow[]).every((r) => String(r.destBin ?? "").trim()),
    },
  ],

  /** The receipt decides what has to be stored and where it is standing now. */
  onChange: (path, s) => {
    if (path !== "grRef") return;
    const gr = getGR(String(s.grRef ?? ""));
    if (!gr) return;

    const inspection = QC_INSPECTIONS.find((q) => q.grRef === gr.code);

    s.warehouse = gr.warehouse;
    s.qcRef = inspection?.code ?? "";
    s.createdFrom = inspection ? "QC Inspection" : "Goods Receipt";

    s.items = (gr.items ?? [])
      .filter((it) => num(it.receiveNow) > 0)
      .map((it, i) => {
        const qty = num(it.accepted) || num(it.receiveNow);
        const best = paSuggestBins(it.code, qty)[0];
        return {
          line: i + 1,
          code: it.code,
          name: it.name,
          lot: "",
          serial: "",
          qty,
          unit: it.unit,
          curLoc: gr.qc?.qcWh || gr.warehouse,
          suggestBin: best?.path ?? "",
          destBin: best?.path ?? "",
          status: "Waiting",
        };
      });
  },

  newRow: () => ({
    line: 0,
    code: "",
    name: "",
    lot: "",
    serial: "",
    qty: "",
    unit: "",
    curLoc: "",
    suggestBin: "",
    destBin: "",
    status: "Waiting",
  }),

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PUTAWAY_TASKS.find((t) => t.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        lot: String(r.lot ?? ""),
        serial: String(r.serial ?? ""),
        qty: num(r.qty),
        unit: String(r.unit ?? ""),
        curLoc: String(r.curLoc ?? ""),
        suggestBin: String(r.suggestBin ?? ""),
        destBin: String(r.destBin ?? ""),
        status: String(r.status ?? "Waiting"),
      }));

    const assignedTo = String(s.assignedTo ?? "");
    const patch = {
      grRef: String(s.grRef ?? ""),
      qcRef: String(s.qcRef ?? ""),
      warehouse: String(s.warehouse ?? ""),
      priority: String(s.priority ?? "Medium"),
      assignedTo,
      createdFrom: String(s.createdFrom ?? "Goods Receipt"),
      status: assignedTo ? "Assigned" : "Waiting",
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Put away task updated",
        d: "แก้ไขงานจัดเก็บจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      const fresh: PutAwayTask = {
        code,
        ...patch,
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Put away task created",
            d: `สร้างงานจัดเก็บ ${fmt(paTotalQty({ items }))} หน่วย จาก ${patch.grRef}`,
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      };
      PUTAWAY_TASKS.unshift(fresh as PaRow);
    }

    /* The receipt is not finished until its goods have somewhere to live. */
    const gr = getGR(patch.grRef);
    if (gr && gr.status === "Ready for Put Away") {
      gr.updated = now;
      decorateGRs();
    }

    decoratePAs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างงานจัดเก็บแล้ว",
      message: assignedTo
        ? `${code} — มอบหมายให้ ${assignedTo}`
        : `${code} — รอมอบหมาย`,
      goto: `/m/put-away/${encodeURIComponent(code)}`,
    });
  },
};
