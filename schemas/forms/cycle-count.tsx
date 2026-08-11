import {
  ABC_CLASSES,
  COUNTS,
  COUNT_METHODS,
  COUNT_PRIORITIES,
  COUNT_PRODUCTS,
  COUNT_SCOPES,
  COUNT_STOCK_STATUSES,
  COUNT_TYPES,
  nextCountCode,
  type CntLine,
  type Count,
} from "@/data/counts";
import { fmt, stamp, today } from "@/lib/format";
import type { FormSchema, FormState, GridRow } from "@/lib/types";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { eligibleQty } from "@/lib/domain/adjustment";
import { blockingIssues, decorateCounts, type CntRow } from "@/lib/domain/count";
import { Badge } from "@/components/ui";

/* ============================================================
   CREATE / EDIT COUNT PLAN

   Planning a count is choosing a scope and freezing what the system
   believes. The form builds the count sheet from that scope and
   stores the system quantity on each line — the snapshot the whole
   variance calculation is measured against.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const WH_OPTIONS = WAREHOUSES.filter((w) => w.status === "Active").map(
  (w) => `${w.code} ${w.name}`,
);

const whCode = (label: string) => String(label ?? "").split(" ")[0] ?? "";

const CATEGORIES = [...new Set(COUNT_PRODUCTS.map((p) => p.cat))].sort();

/** The count sheet lines the plan will start with. */
function toLines(state: FormState, base?: Count): CntLine[] {
  const rows = (state.lines as GridRow[]) ?? [];
  const wh = whCode(String(state.warehouse));

  return rows.map((row, i) => {
    const p = COUNT_PRODUCTS.find((x) => x.code === row.code);
    const prev = base?.lines?.[i];
    return {
      line: i + 1,
      code: String(row.code ?? ""),
      name: String(row.name ?? p?.name ?? ""),
      barcode: String(row.barcode ?? p?.barcode ?? ""),
      unit: String(row.unit ?? p?.unit ?? ""),
      cat: String(row.cat ?? p?.cat ?? ""),
      brand: String(row.brand ?? p?.brand ?? ""),
      abc: String(row.abc ?? p?.abc ?? "C"),

      warehouse: wh,
      zone: String(row.zone ?? state.zone ?? ""),
      rack: String(row.rack ?? state.rack ?? ""),
      shelf: String(state.shelf ?? ""),
      bin: String(row.bin ?? state.bin ?? ""),

      stockStatus: String(row.stockStatus ?? state.statusScope ?? "Available"),
      lot: String(row.lot ?? ""),
      mfg: "",
      exp: String(row.exp ?? ""),
      serialRequired: Boolean(p?.serialTracked),

      /* The snapshot: what the system holds at planning time. */
      systemQty: num(row.systemQty),
      unitCost: num(row.unitCost ?? p?.cost),

      firstCount: prev?.firstCount ?? null,
      recount: prev?.recount ?? null,
      finalCount: prev?.finalCount ?? null,

      packages: prev?.packages ?? 0,
      unitsPerPackage: prev?.unitsPerPackage ?? 0,
      looseUnits: prev?.looseUnits ?? 0,

      serials: prev?.serials ?? [],

      counter: prev?.counter ?? "",
      countTime: prev?.countTime ?? "",
      rootCause: prev?.rootCause ?? "",
      reviewStatus: prev?.reviewStatus ?? "Pending",
      excluded: prev?.excluded ?? false,
      excludeReason: prev?.excludeReason ?? "",
      note: String(row.note ?? ""),
    };
  });
}

function toDocument(state: FormState, base?: Count): Count {
  const wh = whCode(String(state.warehouse));
  return {
    ...(base ?? {}),
    code: String(state.code),
    countDate: String(state.countDate),
    type: String(state.type),
    method: String(state.method),
    scope: String(state.scope),
    priority: String(state.priority ?? "Normal"),
    status: base?.status ?? "Draft",
    approvalStatus: base?.approvalStatus ?? "Not Required",

    scheduledStart: String(state.scheduledStart ?? ""),
    scheduledEnd: String(state.scheduledEnd ?? ""),
    snapshotAt: base?.snapshotAt ?? stamp(),

    warehouse: wh,
    zone: String(state.zone ?? ""),
    rack: String(state.rack ?? ""),
    shelf: String(state.shelf ?? ""),
    bin: String(state.bin ?? ""),
    category: String(state.category ?? ""),
    abcClass: String(state.abcClass ?? ""),
    statusScope: String(state.statusScope ?? "Available"),

    counter: String(state.counter ?? ""),
    secondaryCounter: String(state.secondaryCounter ?? ""),
    supervisor: String(state.supervisor ?? ""),
    requestedBy: String(state.requestedBy ?? "Admin"),
    assignedAt: base?.assignedAt ?? "",
    startedAt: base?.startedAt ?? "",
    submittedAt: base?.submittedAt ?? "",
    reviewedAt: base?.reviewedAt ?? "",
    approvedBy: base?.approvedBy ?? "",
    approvedAt: base?.approvedAt ?? "",

    reference: String(state.reference ?? ""),
    description: String(state.description ?? ""),
    instructions: String(state.instructions ?? ""),

    rejectReason: base?.rejectReason ?? "",
    cancelReason: base?.cancelReason ?? "",
    reopenReason: base?.reopenReason ?? "",
    recountReason: base?.recountReason ?? "",
    round: base?.round ?? 1,

    adjustmentRef: base?.adjustmentRef ?? "",
    adjustmentStatus: base?.adjustmentStatus ?? "Not Required",

    lines: toLines(state, base),
    exceptions: base?.exceptions ?? [],
    movements: base?.movements ?? [],
    evidence: base?.evidence ?? [],

    history: base?.history ?? [],
    audit: base?.audit ?? [],

    created: base?.created ?? stamp(),
    createdBy: base?.createdBy ?? "Admin",
    updated: stamp(),
    updatedBy: "Admin",
  } as Count;
}

const blank = (): FormState => ({
  code: nextCountCode(),
  countDate: today(),
  type: "Cycle Count",
  method: "Blind Count",
  scope: "All Products in Selected Locations",
  priority: "Normal",
  requestedBy: "Admin",
  reference: "",
  description: "",
  instructions: "",

  scheduledStart: `${today()} 08:00`,
  scheduledEnd: `${today()} 17:00`,

  warehouse: WH_OPTIONS[0] ?? "",
  zone: "",
  rack: "",
  shelf: "",
  bin: "",
  category: "",
  abcClass: "",
  statusScope: "Available",

  counter: "",
  secondaryCounter: "",
  supervisor: "Patcharin T.",

  lines: [],
});

const toState = (r: CntRow): FormState => ({
  code: r.code,
  countDate: r.countDate,
  type: r.type,
  method: r.method,
  scope: r.scope,
  priority: r.priority,
  requestedBy: r.requestedBy,
  reference: r.reference,
  description: r.description,
  instructions: r.instructions,

  scheduledStart: r.scheduledStart,
  scheduledEnd: r.scheduledEnd,

  warehouse: WH_OPTIONS.find((w) => w.startsWith(r.warehouse)) ?? r.warehouse,
  zone: r.zone,
  rack: r.rack,
  shelf: r.shelf,
  bin: r.bin,
  category: r.category,
  abcClass: r.abcClass,
  statusScope: r.statusScope,

  counter: r.counter,
  secondaryCounter: r.secondaryCounter,
  supervisor: r.supervisor,

  lines: r.lines.map((l) => ({
    code: l.code,
    name: l.name,
    barcode: l.barcode,
    unit: l.unit,
    cat: l.cat,
    brand: l.brand,
    abc: l.abc,
    zone: l.zone,
    rack: l.rack,
    bin: l.bin,
    stockStatus: l.stockStatus,
    lot: l.lot,
    exp: l.exp,
    systemQty: l.systemQty,
    unitCost: l.unitCost,
    note: l.note,
  })),
});

export const cycleCountForm: FormSchema<CntRow> = {
  key: "cycle-count",
  entityLabel: "แผนตรวจนับสต๊อก",
  titleField: "code",
  saveButton: "บันทึกแผนตรวจนับ",
  saveTitle: "บันทึกแล้ว",
  savedLabel: "แผนตรวจนับ",

  blank,
  toState,

  /** Once counting has started the plan is no longer a plan. */
  editGuard: (rec) =>
    rec.isEditable || rec.isLimitedEdit
      ? null
      : `แผนตรวจนับสถานะ ${rec.status} แก้ไขไม่ได้ — ต้องเปิดการนับใหม่หรือสร้างแผนใหม่แทน`,

  save: (state, ctx) => {
    const existing = COUNTS.find((c) => c.code === state.code);
    const doc = toDocument(state, existing);

    const issues = blockingIssues(doc);
    if (issues.length) {
      ctx.toast("บันทึกไม่ได้", issues[0].message, "danger");
      return;
    }

    if (existing) Object.assign(existing, doc);
    else COUNTS.unshift(doc);

    (doc.history ??= []).unshift({
      t: existing ? "Updated" : "Created",
      d: existing
        ? "แก้ไขแผนตรวจนับ"
        : `สร้างแผนตรวจนับ · ${doc.type} · ${doc.method} · ${doc.lines.length} บรรทัด`,
      u: "Admin",
      when: stamp(),
      kind: existing ? "info" : "",
    });

    decorateCounts();
    ctx.refresh();
    ctx.toast(
      existing ? "บันทึกการแก้ไขแล้ว" : "สร้างแผนตรวจนับแล้ว",
      `${doc.code} · ${doc.lines.length} บรรทัด`,
      "success",
    );
    ctx.goto(`/m/cycle-count/${doc.code}`);
  },

  /** Choosing a warehouse or status re-reads the snapshot for every line. */
  onChange: (path, state) => {
    if (path === "warehouse" || path === "statusScope") {
      for (const row of (state.lines as GridRow[]) ?? []) {
        row.systemQty = eligibleQty(
          String(row.code ?? ""),
          whCode(String(state.warehouse)),
          String(state.statusScope ?? "Available"),
        );
      }
    }
    if (path === "type" && state.type === "Serial Verification") {
      state.method = "Serial Verification";
    }
    if (path === "type" && state.type === "Lot Verification") {
      state.method = "Lot Verification";
    }
  },

  onGridChange: (path, state) => {
    for (const row of (state.lines as GridRow[]) ?? []) {
      if (!row.systemQty) {
        row.systemQty = eligibleQty(
          String(row.code ?? ""),
          whCode(String(state.warehouse)),
          String(row.stockStatus ?? state.statusScope ?? "Available"),
        );
      }
      if (num(row.systemQty) < 0) row.systemQty = 0;
    }
    void path;
  },

  newRow: () => ({
    code: "",
    name: "",
    barcode: "",
    unit: "",
    cat: "",
    brand: "",
    abc: "C",
    zone: "",
    rack: "",
    bin: "",
    stockStatus: "Available",
    lot: "",
    exp: "",
    systemQty: 0,
    unitCost: 0,
    note: "",
  }),

  lookup: {
    product: (q) => {
      const term = q.trim().toLowerCase();
      return COUNT_PRODUCTS.filter(
        (p) =>
          !term ||
          p.code.toLowerCase().includes(term) ||
          p.name.toLowerCase().includes(term) ||
          p.barcode.includes(term),
      )
        .slice(0, 12)
        .map((p) => ({
          code: p.code,
          name: p.name,
          meta: `${p.cat} · ABC ${p.abc} · ${p.unit}`,
        }));
    },
  },

  onLookupPick: (source, gridPath, index, hit, state) => {
    if (source !== "product") return;
    const rows = (state[gridPath] as GridRow[]) ?? [];
    const row = rows[index];
    if (!row) return;
    const p = COUNT_PRODUCTS.find((x) => x.code === hit.code);

    row.code = hit.code;
    row.name = hit.name;
    row.barcode = p?.barcode ?? "";
    row.unit = p?.unit ?? "";
    row.cat = p?.cat ?? "";
    row.brand = p?.brand ?? "";
    row.abc = p?.abc ?? "C";
    row.unitCost = p?.cost ?? 0;
    row.zone = row.zone || String(state.zone ?? "");
    row.rack = row.rack || String(state.rack ?? "");
    row.bin = row.bin || String(state.bin ?? "");
    row.stockStatus = row.stockStatus || String(state.statusScope ?? "Available");
    row.systemQty = eligibleQty(
      hit.code,
      whCode(String(state.warehouse)),
      String(row.stockStatus),
    );
  },

  findDuplicates: (state) => {
    const rows = (state.lines as GridRow[]) ?? [];
    const seen = new Map<string, number>();
    const hits: { code: string; name: string; why: string }[] = [];
    rows.forEach((r, i) => {
      if (!r.code) return;
      const key = `${r.code}|${r.zone}-${r.rack}-${r.bin}|${r.lot}|${r.stockStatus}`;
      if (seen.has(key)) {
        hits.push({
          code: String(r.code),
          name: String(r.name ?? ""),
          why: `บรรทัด ${i + 1} ซ้ำกับบรรทัด ${seen.get(key)! + 1} (สินค้า ตำแหน่ง Lot และสถานะเดียวกัน)`,
        });
      } else seen.set(key, i);
    });
    return hits;
  },

  steps: [
    {
      key: "info",
      label: "Count Information",
      labelTh: "ข้อมูลการตรวจนับ",
      blocks: (state) => [
        {
          type: "card",
          title: "ข้อมูลการตรวจนับ",
          cols: "3",
          badge:
            state.method === "Blind Count" ? <Badge tone="primary">Blind Count</Badge> : undefined,
          fields: [
            { type: "text", path: "code", label: "Count Number", readonly: true },
            { type: "select", path: "type", label: "Count Type", required: true, options: [...COUNT_TYPES] },
            {
              type: "select",
              path: "method",
              label: "Count Method",
              required: true,
              options: [...COUNT_METHODS],
              hint:
                state.method === "Blind Count"
                  ? "ผู้ตรวจนับจะไม่เห็นยอดระบบจนกว่าจะส่งผลนับ"
                  : "ผู้ตรวจนับเห็นยอดระบบระหว่างการนับได้",
            },
            { type: "date", path: "countDate", label: "Count Date", required: true },
            { type: "text", path: "scheduledStart", label: "Scheduled Start", required: true },
            { type: "text", path: "scheduledEnd", label: "Scheduled End" },
            { type: "select", path: "priority", label: "Priority", options: [...COUNT_PRIORITIES] },
            { type: "text", path: "requestedBy", label: "Requested By", required: true },
            { type: "text", path: "reference", label: "Reference Number" },
            {
              type: "textarea",
              path: "description",
              label: "Description",
              required: true,
              span: true,
              rows: 2,
              placeholder: "อธิบายวัตถุประสงค์ของการตรวจนับรอบนี้",
            },
          ],
        },
      ],
    },

    {
      key: "scope",
      label: "Warehouse and Scope",
      labelTh: "คลังและขอบเขต",
      blocks: () => [
        {
          type: "card",
          title: "คลังและขอบเขต",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "warehouse",
              label: "Warehouse",
              required: true,
              options: WH_OPTIONS,
            },
            { type: "text", path: "zone", label: "Zone" },
            { type: "text", path: "rack", label: "Rack" },
            { type: "text", path: "shelf", label: "Shelf" },
            { type: "text", path: "bin", label: "Bin" },
            {
              type: "select",
              path: "scope",
              label: "Count Scope",
              required: true,
              options: [...COUNT_SCOPES],
            },
            { type: "select", path: "category", label: "Product Category", options: ["", ...CATEGORIES] },
            { type: "select", path: "abcClass", label: "ABC Class", options: ["", ...ABC_CLASSES] },
            {
              type: "select",
              path: "statusScope",
              label: "Stock Status",
              options: [...COUNT_STOCK_STATUSES],
            },
          ],
        },
      ],
    },

    {
      key: "lines",
      label: "Product / Location Selection",
      labelTh: "เลือกสินค้าและตำแหน่ง",
      blocks: () => [
        {
          type: "card",
          title: "รายการที่จะตรวจนับ",
          fields: [
            {
              type: "grid",
              path: "lines",
              label: "Count Sheet",
              span: true,
              addLabel: "เพิ่มรายการ",
              empty: "ยังไม่มีรายการ — กดเพิ่มรายการเพื่อเลือกสินค้าที่จะตรวจนับ",
              cols: [
                { key: "code", label: "Product", type: "lookup", source: "product", width: "190px" },
                { key: "name", label: "Product Name", type: "text", readonly: true },
                { key: "unit", label: "UOM", type: "text", readonly: true, width: "70px" },
                { key: "abc", label: "ABC", type: "text", readonly: true, width: "60px" },
                { key: "zone", label: "Zone", type: "text", width: "80px" },
                { key: "rack", label: "Rack", type: "text", width: "80px" },
                { key: "bin", label: "Bin", type: "text", width: "90px" },
                {
                  key: "stockStatus",
                  label: "Stock Status",
                  type: "select",
                  options: [...COUNT_STOCK_STATUSES],
                  width: "130px",
                },
                { key: "lot", label: "Lot", type: "text", width: "110px" },
                { key: "exp", label: "Expiry", type: "text", width: "110px" },
                {
                  key: "systemQty",
                  label: "System Qty (Snapshot)",
                  type: "number",
                  align: "right",
                  width: "150px",
                },
                { key: "note", label: "Notes", type: "text" },
              ],
            },
          ],
        },
      ],
    },

    {
      key: "method",
      label: "Count Method",
      labelTh: "วิธีการนับ",
      blocks: (state) => [
        {
          type: "card",
          title: "วิธีการนับ",
          fields: [
            {
              type: "static",
              label: "สิ่งที่ผู้ตรวจนับจะเห็น",
              span: true,
              value: () =>
                state.method === "Blind Count" ? (
                  <span className="flex flex-col gap-1 text-body">
                    <span>เห็น: สินค้า · ตำแหน่ง · Lot · ความต้องการ Serial · หน่วยนับ · ช่องกรอก</span>
                    <span className="text-danger">
                      ไม่เห็น: ยอดระบบ · ยอดที่คาดหวัง · ส่วนต่าง · มูลค่า
                    </span>
                  </span>
                ) : (
                  "ผู้ตรวจนับเห็นยอดระบบและส่วนต่างระหว่างการนับได้"
                ),
            },
            {
              type: "note",
              label: "การเปิดเผยข้อมูล",
              span: true,
              text: "เมื่อส่งผลนับแล้ว ยอดระบบและส่วนต่างจะถูกเปิดเผยให้ผู้ตรวจสอบเสมอ ไม่ว่าจะเป็นการนับแบบใด",
            },
          ],
        },
      ],
    },

    {
      key: "assignment",
      label: "Assignment",
      labelTh: "การมอบหมาย",
      blocks: (state) => {
        const clash = state.counter && state.counter === state.supervisor;
        return [
          {
            type: "card",
            title: "การมอบหมาย",
            cols: "3",
            badge: clash ? <Badge tone="danger">แบ่งแยกหน้าที่ไม่ผ่าน</Badge> : undefined,
            fields: [
              {
                type: "select",
                path: "counter",
                label: "Primary Counter",
                options: ["", "Warin S.", "Nattapong K.", "Suda R."],
              },
              {
                type: "select",
                path: "secondaryCounter",
                label: "Secondary Counter",
                options: ["", "Warin S.", "Nattapong K.", "Suda R."],
              },
              {
                type: "select",
                path: "supervisor",
                label: "Supervisor",
                required: true,
                options: ["Patcharin T.", "Somchai B."],
              },
              {
                type: "textarea",
                path: "instructions",
                label: "Instructions",
                span: true,
                rows: 2,
                placeholder: "คำแนะนำสำหรับผู้ตรวจนับ",
              },
            ],
          },
        ];
      },
    },

    {
      key: "control",
      label: "Count Control",
      labelTh: "การควบคุม",
      blocks: (state) => {
        const lines = (state.lines as GridRow[]) ?? [];
        const products = new Set(lines.map((l) => String(l.code)).filter(Boolean)).size;
        const locations = new Set(lines.map((l) => `${l.zone}-${l.rack}-${l.bin}`)).size;
        const lots = new Set(lines.map((l) => String(l.lot)).filter(Boolean)).size;
        const systemTotal = lines.reduce((t, l) => t + num(l.systemQty), 0);

        return [
          {
            type: "card",
            title: "ตัวอย่างขอบเขต",
            fields: [
              {
                type: "static",
                label: "Scope Preview",
                span: true,
                value: () => (
                  <span className="flex flex-wrap gap-2 text-cap">
                    {[
                      ["คลัง", "1"],
                      ["ตำแหน่ง", fmt(locations)],
                      ["สินค้า", fmt(products)],
                      ["Lot", fmt(lots)],
                      ["บรรทัด", fmt(lines.length)],
                      ["ยอดระบบรวม", fmt(systemTotal)],
                      ["เวลาโดยประมาณ", `${Math.max(1, Math.round(lines.length * 1.5))} นาที`],
                    ].map(([label, value]) => (
                      <span
                        key={label}
                        className="rounded-pill border border-line bg-surface px-2.5 py-1"
                      >
                        {label} <strong className="tnum">{value}</strong>
                      </span>
                    ))}
                  </span>
                ),
              },
              {
                type: "note",
                label: "Snapshot และการล็อกสต๊อก",
                span: true,
                text: "ยอดระบบจะถูกบันทึกเป็น Snapshot เมื่อกดเริ่มตรวจนับ · เฟส 1 ไม่ล็อกธุรกรรมจริง แต่จะแจ้งเตือนหากมีความเคลื่อนไหวหลัง Snapshot",
              },
              {
                type: "note",
                label: "เกณฑ์ส่วนต่าง (mock)",
                span: true,
                text: "ยอมรับได้ ±1 หน่วย หรือ ±2% · มูลค่า ±5,000 · Serial ไม่ตรง สินค้าที่ไม่คาดคิด และสินค้าหายทั้งบรรทัด ต้องนับซ้ำเสมอ",
              },
            ],
          },
        ];
      },
    },

    {
      key: "notes",
      label: "Notes",
      labelTh: "หมายเหตุ",
      blocks: () => [
        {
          type: "card",
          title: "หมายเหตุและเอกสารแนบ",
          fields: [
            {
              type: "textarea",
              path: "instructions",
              label: "คำแนะนำเพิ่มเติม",
              span: true,
              rows: 3,
            },
            {
              type: "note",
              label: "เอกสารแนบ",
              span: true,
              text: "แนบใบนับและรูปถ่ายได้จากหน้ารายละเอียดหลังบันทึกแผน",
            },
          ],
        },
      ],
    },

    { key: "review", label: "Summary", labelTh: "สรุป", review: true, blocks: () => [] },
  ],

  required: [
    { path: "countDate", label: "Count Date", step: "info" },
    { path: "type", label: "Count Type", step: "info" },
    { path: "method", label: "Count Method", step: "info" },
    { path: "requestedBy", label: "Requested By", step: "info" },
    { path: "description", label: "Description", step: "info" },
    { path: "scheduledStart", label: "Scheduled Start", step: "info" },
    { path: "warehouse", label: "Warehouse", step: "scope" },
    { path: "scope", label: "Count Scope", step: "scope" },
    { path: "supervisor", label: "Supervisor", step: "assignment" },
    {
      path: "lines",
      label: "รายการตรวจนับอย่างน้อย 1 รายการ",
      step: "lines",
      test: (s) => ((s.lines as GridRow[]) ?? []).some((r) => r.code),
    },
  ],

  rules: [
    {
      label: "ยอดระบบต้องไม่ติดลบ",
      step: "lines",
      test: (s) => ((s.lines as GridRow[]) ?? []).every((r) => num(r.systemQty) >= 0),
    },
    {
      label: "ห้ามมีรายการซ้ำ (สินค้า ตำแหน่ง Lot และสถานะเดียวกัน)",
      step: "lines",
      test: (s) => {
        const rows = ((s.lines as GridRow[]) ?? []).filter((r) => r.code);
        const keys = rows.map((r) => `${r.code}|${r.zone}-${r.rack}-${r.bin}|${r.lot}|${r.stockStatus}`);
        return new Set(keys).size === keys.length;
      },
    },
    {
      label: "ผู้ตรวจนับและผู้ตรวจสอบต้องเป็นคนละคน",
      step: "assignment",
      test: (s) => !s.counter || s.counter !== s.supervisor,
    },
    {
      label: "ผู้ตรวจนับหลักและผู้ตรวจนับสำรองต้องเป็นคนละคน",
      step: "assignment",
      test: (s) => !s.secondaryCounter || s.counter !== s.secondaryCounter,
    },
  ],

};
