import {
  TRANSFERS,
  TRANSFER_METHODS,
  TRANSFER_TYPES,
  TRF_PRIORITIES,
  TRF_STOCK_STATUSES,
  nextTransferCode,
  type Transfer,
  type TrfLine,
} from "@/data/transfers";
import { fmt, stamp, today } from "@/lib/format";
import type { FormSchema, FormState, GridRow } from "@/lib/types";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import {
  blockingIssues,
  decorateTransfers,
  destinationWarnings,
  selectableSerials,
  sourceStock,
  transferableQty,
  type TrfRow,
} from "@/lib/domain/transfer";
import { invalidateMovements } from "@/lib/domain/movement";
import { Badge } from "@/components/ui";

/* ============================================================
   CREATE / EDIT STOCK TRANSFER

   The form never writes a stock balance. It writes a document; the
   quantity only moves when the document is posted, dispatched or
   received. Everything it offers to transfer is bounded by what
   Stock Inquiry says is actually transferable.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const WH_OPTIONS = WAREHOUSES.filter((w) => w.status === "Active").map(
  (w) => `${w.code} ${w.name}`,
);

const whCode = (label: string) => String(label ?? "").split(" ")[0] ?? "";

/** Transferable quantity for one grid row, given the header's source. */
function rowTransferable(state: FormState, row: GridRow) {
  return transferableQty(
    String(row.code ?? ""),
    whCode(String(state.srcWarehouse ?? "")),
    String(state.srcStatus ?? "Available"),
  );
}

const blank = (): FormState => ({
  code: nextTransferCode(),
  transferDate: today(),
  method: "Direct Transfer",
  type: "Bin Transfer",
  priority: "Normal",
  requestedBy: "Admin",
  assignedTo: "",
  expectedDate: today(),
  reason: "",
  reference: "",
  remark: "",

  srcWarehouse: WH_OPTIONS[0] ?? "",
  srcZone: "",
  srcRack: "",
  srcShelf: "",
  srcBin: "",
  srcStatus: "Available",

  dstWarehouse: WH_OPTIONS[0] ?? "",
  dstZone: "",
  dstRack: "",
  dstShelf: "",
  dstBin: "",
  dstStatus: "Available",

  items: [],
  dispatchVehicle: "",
  dispatchDriver: "",
  dispatchSeal: "",
  packages: 1,
});

const toState = (r: TrfRow): FormState => ({
  code: r.code,
  transferDate: r.transferDate,
  method: r.method,
  type: r.type,
  priority: r.priority,
  requestedBy: r.requestedBy,
  assignedTo: r.assignedTo,
  expectedDate: r.expectedDate,
  reason: r.reason,
  reference: r.reference,
  remark: r.remark,

  srcWarehouse: WH_OPTIONS.find((w) => w.startsWith(r.srcWarehouse)) ?? r.srcWarehouse,
  srcZone: r.srcZone,
  srcRack: r.srcRack,
  srcShelf: r.srcShelf,
  srcBin: r.srcBin,
  srcStatus: r.srcStatus,

  dstWarehouse: WH_OPTIONS.find((w) => w.startsWith(r.dstWarehouse)) ?? r.dstWarehouse,
  dstZone: r.dstZone,
  dstRack: r.dstRack,
  dstShelf: r.dstShelf,
  dstBin: r.dstBin,
  dstStatus: r.dstStatus,

  items: r.items.map((l) => ({
    line: l.line,
    code: l.code,
    name: l.name,
    unit: l.unit,
    lot: l.lot,
    exp: l.exp,
    serials: l.serials.join(", "),
    requested: l.requested,
    transferable: transferableQty(l.code, r.srcWarehouse, r.srcStatus),
    note: l.note,
  })),

  dispatchVehicle: r.dispatches?.[0]?.vehicle ?? "",
  dispatchDriver: r.dispatches?.[0]?.driver ?? "",
  dispatchSeal: r.dispatches?.[0]?.seal ?? "",
  packages: r.dispatches?.[0]?.packages ?? 1,
});

/** Everything the state knows, folded back into a document. */
function toDocument(state: FormState, base?: Transfer): Transfer {
  const src = whCode(String(state.srcWarehouse));
  const dst = whCode(String(state.dstWarehouse));
  const rows = (state.items as GridRow[]) ?? [];

  const items: TrfLine[] = rows.map((row, i) => {
    const serials = String(row.serials ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const prev = base?.items?.[i];
    return {
      line: i + 1,
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      unit: String(row.unit ?? ""),
      lot: String(row.lot ?? ""),
      exp: String(row.exp ?? ""),
      serials,
      requested: num(row.requested),
      dispatched: prev?.dispatched ?? 0,
      received: prev?.received ?? 0,
      short: prev?.short ?? 0,
      damaged: prev?.damaged ?? 0,
      dstBin: "",
      dstStatus: "",
      note: String(row.note ?? ""),
    };
  });

  return {
    ...(base ?? {}),
    code: String(state.code),
    transferDate: String(state.transferDate),
    method: String(state.method),
    type: String(state.type),
    priority: String(state.priority),
    status: base?.status ?? "Draft",
    approvalStatus: base?.approvalStatus ?? "Not Submitted",

    requestedBy: String(state.requestedBy),
    assignedTo: String(state.assignedTo ?? ""),
    approvedBy: base?.approvedBy ?? "",
    approvedDate: base?.approvedDate ?? "",
    rejectReason: base?.rejectReason ?? "",
    cancelReason: base?.cancelReason ?? "",
    reversalReason: base?.reversalReason ?? "",

    expectedDate: String(state.expectedDate ?? ""),
    reason: String(state.reason ?? ""),
    reference: String(state.reference ?? ""),
    remark: String(state.remark ?? ""),

    srcWarehouse: src,
    srcZone: String(state.srcZone ?? ""),
    srcRack: String(state.srcRack ?? ""),
    srcShelf: String(state.srcShelf ?? ""),
    srcBin: String(state.srcBin ?? ""),
    srcStatus: String(state.srcStatus ?? "Available"),
    srcBranch: src === "WH-CNX" ? "Chiang Mai" : "Bangkok",

    dstWarehouse: dst,
    dstZone: String(state.dstZone ?? ""),
    dstRack: String(state.dstRack ?? ""),
    dstShelf: String(state.dstShelf ?? ""),
    dstBin: String(state.dstBin ?? ""),
    dstStatus: String(state.dstStatus ?? "Available"),
    dstBranch: dst === "WH-CNX" ? "Chiang Mai" : "Bangkok",

    items,
    dispatches: base?.dispatches ?? [],
    receipts: base?.receipts ?? [],
    exceptions: base?.exceptions ?? [],

    reversalOf: base?.reversalOf ?? "",
    reversedBy: base?.reversedBy ?? "",

    history: base?.history ?? [],
    audit: base?.audit ?? [],

    created: base?.created ?? stamp(),
    createdBy: base?.createdBy ?? "Admin",
    updated: stamp(),
    updatedBy: "Admin",
  } as Transfer;
}

export const stockTransferForm: FormSchema<TrfRow> = {
  key: "stock-transfer",
  entityLabel: "ใบโอนย้ายสินค้า",
  titleField: "code",
  saveButton: "บันทึกใบโอนย้าย",
  saveTitle: "บันทึกแล้ว",
  savedLabel: "ใบโอนย้าย",

  blank,
  toState,

  /** A transfer stops being editable the moment quantity has moved. */
  editGuard: (rec) =>
    rec.isEditable
      ? null
      : rec.isLimitedEdit
        ? null
        : `ใบโอนย้ายสถานะ ${rec.status} แก้ไขไม่ได้ — ต้องยกเลิก กลับรายการ หรือปรับปรุงยอดแทน`,

  save: (state, ctx) => {
    const existing = TRANSFERS.find((t) => t.code === state.code);
    const doc = toDocument(state, existing);

    const issues = blockingIssues(doc);
    if (issues.length) {
      ctx.toast("บันทึกไม่ได้", issues[0].message, "danger");
      return;
    }

    if (existing) Object.assign(existing, doc);
    else TRANSFERS.unshift(doc);

    (doc.history ??= []).unshift({
      t: existing ? "Updated" : "Created",
      d: existing ? "แก้ไขใบโอนย้าย" : "สร้างใบโอนย้าย",
      u: "Admin",
      when: stamp(),
      kind: existing ? "info" : "",
    });

    decorateTransfers();
    invalidateMovements();
    ctx.refresh();

    const warnings = destinationWarnings(doc);
    ctx.toast(
      existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบโอนย้ายแล้ว",
      warnings.length ? `${doc.code} · ⚠ ${warnings[0]}` : doc.code,
      warnings.length ? "warning" : "success",
    );
    ctx.goto(`/m/stock-transfer/${doc.code}`);
  },

  /** Choosing a source resets the lines: their transferable ceiling changed. */
  onChange: (path, state) => {
    if (path === "srcWarehouse" || path === "srcStatus") {
      for (const row of (state.items as GridRow[]) ?? []) {
        row.transferable = rowTransferable(state, row);
      }
    }
    if (path === "method" && state.method === "Direct Transfer") {
      state.dispatchVehicle = "";
      state.dispatchDriver = "";
      state.dispatchSeal = "";
    }
  },

  onGridChange: (path, state) => {
    for (const row of (state.items as GridRow[]) ?? []) {
      row.transferable = rowTransferable(state, row);
      /* The grid can never ask for more than the source can give. */
      if (num(row.requested) > num(row.transferable)) row.requested = num(row.transferable);
    }
    void path;
  },

  newRow: () => ({
    code: "",
    name: "",
    unit: "",
    lot: "",
    exp: "",
    serials: "",
    requested: 0,
    transferable: 0,
    note: "",
  }),

  lookup: {
    product: (q) => {
      const term = q.trim().toLowerCase();
      return sourceStock("")
        .filter(
          (p) =>
            !term ||
            p.code.toLowerCase().includes(term) ||
            p.name.toLowerCase().includes(term),
        )
        .slice(0, 12)
        .map((p) => ({
          code: p.code,
          name: p.name,
          meta: `โอนได้ ${fmt(p.transferable)} ${p.unit}${p.lot ? ` · ${p.lot}` : ""}`,
        }));
    },
  },

  onLookupPick: (source, gridPath, index, hit, state) => {
    if (source !== "product") return;
    const rows = (state[gridPath] as GridRow[]) ?? [];
    const row = rows[index];
    if (!row) return;

    const stock = sourceStock(whCode(String(state.srcWarehouse ?? ""))).find(
      (p) => p.code === hit.code,
    );
    row.code = hit.code;
    row.name = hit.name;
    row.unit = stock?.unit ?? "";
    row.lot = stock?.lot ?? "";
    row.exp = stock?.exp ?? "";
    row.transferable = rowTransferable(state, row);
    row.requested = 0;
  },

  findDuplicates: (state) => {
    const rows = (state.items as GridRow[]) ?? [];
    const seen = new Map<string, number>();
    const hits: { code: string; name: string; why: string }[] = [];
    rows.forEach((r, i) => {
      const key = `${r.code}|${r.lot}`;
      if (!r.code) return;
      if (seen.has(key)) {
        hits.push({
          code: String(r.code),
          name: String(r.name ?? ""),
          why: `บรรทัด ${i + 1} ซ้ำกับบรรทัด ${seen.get(key)! + 1} (สินค้าและ Lot เดียวกัน)`,
        });
      } else seen.set(key, i);
    });
    return hits;
  },

  steps: [
    {
      key: "info",
      label: "Transfer Information",
      labelTh: "ข้อมูลใบโอนย้าย",
      blocks: (state) => [
        {
          type: "card",
          title: "ข้อมูลใบโอนย้าย",
          cols: "3",
          fields: [
            { type: "text", path: "code", label: "Transfer Number", readonly: true },
            { type: "date", path: "transferDate", label: "Transfer Date", required: true },
            {
              type: "select",
              path: "method",
              label: "Transfer Method",
              required: true,
              options: [...TRANSFER_METHODS],
              hint:
                state.method === "Two-Step Transfer"
                  ? "จ่ายออก → In Transit → รับเข้า"
                  : "ตัดต้นทางและเพิ่มปลายทางพร้อมกันตอนบันทึก",
            },
            {
              type: "select",
              path: "type",
              label: "Transfer Type",
              required: true,
              options: [...TRANSFER_TYPES],
            },
            { type: "select", path: "priority", label: "Priority", options: [...TRF_PRIORITIES] },
            { type: "text", path: "requestedBy", label: "Requested By", required: true },
            { type: "text", path: "assignedTo", label: "Assigned To" },
            { type: "date", path: "expectedDate", label: "Expected Completion Date" },
            { type: "text", path: "reference", label: "Reference Number" },
            {
              type: "textarea",
              path: "reason",
              label: "Reason",
              required: true,
              span: true,
              rows: 2,
              placeholder: "ระบุเหตุผลของการโอนย้าย",
            },
          ],
        },
      ],
    },

    {
      key: "source",
      label: "Source",
      labelTh: "ต้นทาง",
      blocks: (state) => [
        {
          type: "card",
          title: "ต้นทาง",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "srcWarehouse",
              label: "Source Warehouse",
              required: true,
              options: WH_OPTIONS,
            },
            { type: "text", path: "srcZone", label: "Source Zone" },
            { type: "text", path: "srcRack", label: "Source Rack" },
            { type: "text", path: "srcShelf", label: "Source Shelf" },
            { type: "text", path: "srcBin", label: "Source Bin" },
            {
              type: "select",
              path: "srcStatus",
              label: "Source Stock Status",
              options: [...TRF_STOCK_STATUSES],
            },
          ],
        },
        {
          type: "card",
          title: "สินค้าที่โอนได้จากต้นทาง",
          fields: [
            {
              type: "static",
              label: "ยอดที่โอนได้",
              span: true,
              value: () => {
                const rows = sourceStock(
                  whCode(String(state.srcWarehouse ?? "")),
                  String(state.srcStatus ?? "Available"),
                ).slice(0, 8);
                if (!rows.length) return "ไม่มีสินค้าที่โอนได้จากต้นทางนี้";
                return (
                  <span className="flex flex-wrap gap-2">
                    {rows.map((p) => (
                      <span
                        key={p.code}
                        className="rounded-pill border border-line bg-surface px-2.5 py-1 text-cap"
                      >
                        {p.code} · โอนได้ <strong className="tnum">{fmt(p.transferable)}</strong>{" "}
                        {p.unit}
                      </span>
                    ))}
                  </span>
                );
              },
            },
          ],
        },
      ],
    },

    {
      key: "destination",
      label: "Destination",
      labelTh: "ปลายทาง",
      blocks: (state) => {
        const warnings = destinationWarnings(toDocument(state));
        const same =
          whCode(String(state.srcWarehouse)) === whCode(String(state.dstWarehouse)) &&
          state.srcBin === state.dstBin &&
          state.srcStatus === state.dstStatus;
        return [
          {
            type: "card",
            title: "ปลายทาง",
            cols: "3",
            badge: same ? <Badge tone="danger">ต้นทางซ้ำปลายทาง</Badge> : undefined,
            fields: [
              {
                type: "select",
                path: "dstWarehouse",
                label: "Destination Warehouse",
                required: true,
                options: WH_OPTIONS,
              },
              { type: "text", path: "dstZone", label: "Destination Zone" },
              { type: "text", path: "dstRack", label: "Destination Rack" },
              { type: "text", path: "dstShelf", label: "Destination Shelf" },
              { type: "text", path: "dstBin", label: "Destination Bin" },
              {
                type: "select",
                path: "dstStatus",
                label: "Destination Stock Status",
                options: [...TRF_STOCK_STATUSES],
              },
            ],
          },
          warnings.length > 0 && {
            type: "card",
            title: "ข้อควรระวังปลายทาง",
            fields: [
              {
                type: "note",
                label: "คำเตือน",
                span: true,
                text: warnings.join(" · "),
              },
            ],
          },
        ];
      },
    },

    {
      key: "items",
      label: "Transfer Items",
      labelTh: "รายการสินค้า",
      blocks: () => [
        {
          type: "card",
          title: "รายการสินค้า",
          fields: [
            {
              type: "grid",
              path: "items",
              label: "สินค้าที่จะโอนย้าย",
              span: true,
              addLabel: "เพิ่มรายการ",
              empty: "ยังไม่มีรายการ — กดเพิ่มรายการเพื่อเลือกสินค้าจากต้นทาง",
              cols: [
                { key: "code", label: "Product", type: "lookup", source: "product", width: "200px" },
                { key: "name", label: "Product Name", type: "text", readonly: true },
                { key: "unit", label: "UOM", type: "text", readonly: true, width: "80px" },
                { key: "lot", label: "Lot", type: "text", width: "120px" },
                { key: "exp", label: "Expiry", type: "text", readonly: true, width: "110px" },
                {
                  key: "transferable",
                  label: "Transferable",
                  type: "number",
                  readonly: true,
                  align: "right",
                  width: "110px",
                },
                {
                  key: "requested",
                  label: "Transfer Qty",
                  type: "number",
                  align: "right",
                  width: "110px",
                },
                { key: "serials", label: "Serials", type: "text", width: "220px" },
                { key: "note", label: "Notes", type: "text" },
              ],
            },
          ],
        },
      ],
    },

    {
      key: "lotserial",
      label: "Lot / Serial",
      labelTh: "ล็อต / ซีเรียล",
      blocks: (state) => [
        {
          type: "card",
          title: "Serial ที่เลือกได้จากต้นทาง",
          fields: [
            {
              type: "static",
              label: "Serial",
              span: true,
              value: () => {
                const rows = (state.items as GridRow[]) ?? [];
                const codes = [...new Set(rows.map((r) => String(r.code ?? "")).filter(Boolean))];
                if (!codes.length) return "เลือกสินค้าก่อนเพื่อดู Serial ที่เลือกได้";

                const blocks = codes.map((code) => {
                  const serials = selectableSerials(
                    code,
                    whCode(String(state.srcWarehouse ?? "")),
                  ).slice(0, 10);
                  return (
                    <span key={code} className="flex flex-col gap-1">
                      <span className="text-cap font-semibold">{code}</span>
                      {serials.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {serials.map((s) => (
                            <span
                              key={s.serial}
                              className="rounded-pill border border-line bg-surface px-2 py-0.5 text-cap"
                            >
                              {s.serial}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-cap text-ink-3">
                          ไม่มี Serial ว่างที่ต้นทาง (อาจถูกจองในใบโอนย้ายอื่น)
                        </span>
                      )}
                    </span>
                  );
                });
                return <span className="flex flex-col gap-3">{blocks}</span>;
              },
            },
            {
              type: "note",
              label: "กติกา Serial",
              span: true,
              text: "จำนวน Serial ที่กรอกต้องเท่ากับ Transfer Qty · ห้ามซ้ำ · ต้องเป็น Serial ที่อยู่ที่ต้นทางและไม่ติดใบโอนย้ายอื่น",
            },
          ],
        },
      ],
    },

    {
      key: "dispatch",
      label: "Dispatch Information",
      labelTh: "ข้อมูลการจ่ายออก",
      when: (state) => state.method === "Two-Step Transfer",
      blocks: () => [
        {
          type: "card",
          title: "ข้อมูลการจ่ายออก",
          cols: "3",
          fields: [
            { type: "text", path: "dispatchVehicle", label: "ทะเบียนรถ" },
            { type: "text", path: "dispatchDriver", label: "พนักงานขับรถ" },
            { type: "text", path: "dispatchSeal", label: "หมายเลขซีล" },
            { type: "number", path: "packages", label: "จำนวนหีบห่อ", min: 1 },
          ],
        },
      ],
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
            { type: "textarea", path: "remark", label: "หมายเหตุ", span: true, rows: 3 },
            {
              type: "note",
              label: "เอกสารแนบ",
              span: true,
              text: "การแนบไฟล์จะเปิดใช้งานพร้อมระบบจัดเก็บเอกสารในเฟสถัดไป",
            },
          ],
        },
      ],
    },

    { key: "review", label: "Summary", labelTh: "สรุป", review: true, blocks: () => [] },
  ],

  required: [
    { path: "transferDate", label: "Transfer Date", step: "info" },
    { path: "method", label: "Transfer Method", step: "info" },
    { path: "type", label: "Transfer Type", step: "info" },
    { path: "requestedBy", label: "Requested By", step: "info" },
    { path: "reason", label: "Reason", step: "info" },
    { path: "srcWarehouse", label: "Source Warehouse", step: "source" },
    { path: "dstWarehouse", label: "Destination Warehouse", step: "destination" },
    {
      path: "items",
      label: "รายการสินค้าอย่างน้อย 1 รายการ",
      step: "items",
      test: (s) => ((s.items as GridRow[]) ?? []).some((r) => r.code && num(r.requested) > 0),
    },
  ],

  rules: [
    {
      label: "ต้นทางและปลายทางต้องไม่เหมือนกัน",
      step: "destination",
      test: (s) =>
        whCode(String(s.srcWarehouse)) !== whCode(String(s.dstWarehouse)) ||
        s.srcBin !== s.dstBin ||
        s.srcStatus !== s.dstStatus,
    },
    {
      label: "จำนวนโอนย้ายต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items as GridRow[]) ?? []).every((r) => !r.code || num(r.requested) > 0),
    },
    {
      label: "จำนวนโอนย้ายต้องไม่เกินยอดที่โอนได้",
      step: "items",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every(
          (r) => !r.code || num(r.requested) <= num(r.transferable),
        ),
    },
    {
      label: "จำนวน Serial ต้องเท่ากับจำนวนที่โอนย้าย",
      step: "lotserial",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every((r) => {
          const serials = String(r.serials ?? "")
            .split(/[,\s]+/)
            .filter(Boolean);
          return serials.length === 0 || serials.length === num(r.requested);
        }),
    },
    {
      label: "ห้ามมี Serial ซ้ำ",
      step: "lotserial",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every((r) => {
          const serials = String(r.serials ?? "")
            .split(/[,\s]+/)
            .filter(Boolean);
          return new Set(serials).size === serials.length;
        }),
    },
  ],

};
