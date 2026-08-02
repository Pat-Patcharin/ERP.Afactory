import {
  ADJUSTMENTS,
  ADJ_ACTIONS,
  ADJ_PRIORITIES,
  ADJ_REF_TYPES,
  ADJ_STOCK_STATUSES,
  ADJ_TYPES,
  findReason,
  nextAdjustmentCode,
  reasonsFor,
  type AdjLine,
  type Adjustment,
  type ReasonGroup,
} from "@/data/adjustments";
import { fmt, money, stamp, today } from "@/lib/format";
import type { FormSchema, FormState, GridRow } from "@/lib/types";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { PRODUCTS } from "@/lib/domain/product";
import {
  adjustableSerials,
  approvalTriggers,
  blockingIssues,
  decorateAdjustments,
  eligibleQty,
  evidenceRequired,
  isDecrease,
  isIncrease,
  isStatusChange,
  lineMovementTypes,
  stockImpact,
  type AdjRow,
} from "@/lib/domain/adjustment";
import { invalidateMovements } from "@/lib/domain/movement";
import { Badge } from "@/components/ui";

/* ============================================================
   CREATE / EDIT STOCK ADJUSTMENT

   The reason code is picked first because everything downstream
   depends on it: which statuses a line may move between, whether
   evidence is mandatory, and whether the document needs approval
   before it can post. The form shows those consequences as the
   user types rather than only at save.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const WH_OPTIONS = WAREHOUSES.filter((w) => w.status === "Active").map(
  (w) => `${w.code} ${w.name}`,
);

const whCode = (label: string) => String(label ?? "").split(" ")[0] ?? "";

const REASON_GROUPS: ReasonGroup[] = ["Positive", "Negative", "Status", "Correction"];

/** The lines the form is working with, as document lines. */
function toLines(state: FormState, base?: Adjustment): AdjLine[] {
  const rows = (state.items as GridRow[]) ?? [];
  const split = (v: unknown) =>
    String(v ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  return rows.map((row, i) => {
    const prev = base?.items?.[i];
    const product = PRODUCTS.find((p) => p.code === row.code);
    return {
      line: i + 1,
      code: String(row.code ?? ""),
      name: String(row.name ?? product?.name ?? ""),
      unit: String(row.unit ?? product?.unit ?? ""),
      cat: String(row.cat ?? product?.cat ?? ""),
      action: String(row.action ?? "Increase Quantity"),
      qty: num(row.qty),
      statusFrom: String(row.statusFrom ?? "Available"),
      statusTo: String(row.statusTo ?? "Available"),
      locFrom: String(row.locFrom ?? ""),
      locTo: String(row.locTo ?? ""),
      lot: String(row.lot ?? ""),
      lotTo: String(row.lotTo ?? ""),
      exp: String(row.exp ?? ""),
      expTo: String(row.expTo ?? ""),
      serials: split(row.serials),
      serialsTo: split(row.serialsTo),
      unitCost: num(row.unitCost ?? product?.pricing?.avgCost ?? product?.price),
      reason: String(row.reason ?? state.reason ?? ""),
      note: String(row.note ?? ""),
      ...(prev ? {} : {}),
    };
  });
}

/** Fold the form state back into a document. */
function toDocument(state: FormState, base?: Adjustment): Adjustment {
  const wh = whCode(String(state.warehouse));
  const group = (state.reasonGroup as ReasonGroup) ?? "Positive";

  return {
    ...(base ?? {}),
    code: String(state.code),
    adjDate: String(state.adjDate),
    type: String(state.type),
    reason: String(state.reason ?? ""),
    reasonGroup: group,
    priority: String(state.priority ?? "Normal"),
    status: base?.status ?? "Draft",
    approvalStatus: base?.approvalStatus ?? "Not Submitted",

    requestedBy: String(state.requestedBy ?? "Admin"),
    reviewer: String(state.reviewer ?? ""),
    approvedBy: base?.approvedBy ?? "",
    approvedDate: base?.approvedDate ?? "",
    postedBy: base?.postedBy ?? "",
    postedDate: base?.postedDate ?? "",
    rejectReason: base?.rejectReason ?? "",
    cancelReason: base?.cancelReason ?? "",
    reversalReason: base?.reversalReason ?? "",
    reversalOf: base?.reversalOf ?? "",
    reversedBy: base?.reversedBy ?? "",

    refType: String(state.refType ?? "Manual Request"),
    refDoc: String(state.refDoc ?? ""),
    description: String(state.description ?? ""),

    warehouse: wh,
    zone: String(state.zone ?? ""),
    rack: String(state.rack ?? ""),
    shelf: String(state.shelf ?? ""),
    bin: String(state.bin ?? ""),
    branch: wh === "WH-CNX" ? "Chiang Mai" : "Bangkok",

    items: toLines(state, base),
    evidence: base?.evidence ?? [],
    exceptions: base?.exceptions ?? [],

    history: base?.history ?? [],
    audit: base?.audit ?? [],

    created: base?.created ?? stamp(),
    createdBy: base?.createdBy ?? "Admin",
    updated: stamp(),
    updatedBy: "Admin",
  } as Adjustment;
}

const blank = (): FormState => ({
  code: nextAdjustmentCode(),
  adjDate: today(),
  type: "Positive Adjustment",
  reasonGroup: "Positive",
  reason: "Found Stock",
  priority: "Normal",
  requestedBy: "Admin",
  reviewer: "",
  refType: "Manual Request",
  refDoc: "",
  description: "",

  warehouse: WH_OPTIONS[0] ?? "",
  zone: "",
  rack: "",
  shelf: "",
  bin: "",

  items: [],
});

const toState = (r: AdjRow): FormState => ({
  code: r.code,
  adjDate: r.adjDate,
  type: r.type,
  reasonGroup: r.reasonGroup,
  reason: r.reason,
  priority: r.priority,
  requestedBy: r.requestedBy,
  reviewer: r.reviewer,
  refType: r.refType,
  refDoc: r.refDoc,
  description: r.description,

  warehouse: WH_OPTIONS.find((w) => w.startsWith(r.warehouse)) ?? r.warehouse,
  zone: r.zone,
  rack: r.rack,
  shelf: r.shelf,
  bin: r.bin,

  items: r.items.map((l) => ({
    code: l.code,
    name: l.name,
    unit: l.unit,
    cat: l.cat,
    action: l.action,
    qty: l.qty,
    eligible: eligibleQty(l.code, r.warehouse, l.statusFrom),
    statusFrom: l.statusFrom,
    statusTo: l.statusTo,
    locFrom: l.locFrom,
    locTo: l.locTo,
    lot: l.lot,
    lotTo: l.lotTo,
    exp: l.exp,
    expTo: l.expTo,
    serials: l.serials.join(", "),
    serialsTo: l.serialsTo.join(", "),
    unitCost: l.unitCost,
    note: l.note,
  })),
});

export const stockAdjustmentForm: FormSchema<AdjRow> = {
  key: "stock-adjustment",
  entityLabel: "ใบปรับปรุงสต๊อก",
  titleField: "code",
  saveButton: "บันทึกใบปรับปรุง",
  saveTitle: "บันทึกแล้ว",
  savedLabel: "ใบปรับปรุง",

  blank,
  toState,

  /** Once a document is approved or posted it stops being a draft. */
  editGuard: (rec) =>
    rec.isEditable || rec.isLimitedEdit
      ? null
      : `ใบปรับปรุงสถานะ ${rec.status} แก้ไขไม่ได้ — ต้องยกเลิก กลับรายการ หรือสร้างใบใหม่แทน`,

  save: (state, ctx) => {
    const existing = ADJUSTMENTS.find((a) => a.code === state.code);
    const doc = toDocument(state, existing);

    const issues = blockingIssues(doc);
    if (issues.length) {
      ctx.toast("บันทึกไม่ได้", issues[0].message, "danger");
      return;
    }

    if (existing) Object.assign(existing, doc);
    else ADJUSTMENTS.unshift(doc);

    (doc.history ??= []).unshift({
      t: existing ? "Updated" : "Created",
      d: existing ? "แก้ไขใบปรับปรุงสต๊อก" : `สร้างใบปรับปรุงสต๊อก · เหตุผล ${doc.reason}`,
      u: "Admin",
      when: stamp(),
      kind: existing ? "info" : "",
    });

    decorateAdjustments();
    invalidateMovements();
    ctx.refresh();
    ctx.toast(
      existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบปรับปรุงแล้ว",
      evidenceRequired(doc) && !doc.evidence.length
        ? `${doc.code} · ⚠ ต้องแนบหลักฐานก่อนบันทึกเข้าสต๊อก`
        : doc.code,
      evidenceRequired(doc) && !doc.evidence.length ? "warning" : "success",
    );
    ctx.goto(`/m/stock-adjustment/${doc.code}`);
  },

  /** Reason group drives the reason list, the type and the line defaults. */
  onChange: (path, state) => {
    if (path === "reasonGroup") {
      const first = reasonsFor(state.reasonGroup as ReasonGroup)[0];
      state.reason = first?.code ?? "";
      state.type =
        state.reasonGroup === "Positive"
          ? "Positive Adjustment"
          : state.reasonGroup === "Negative"
            ? "Negative Adjustment"
            : state.reasonGroup === "Status"
              ? "Stock Status Adjustment"
              : "Location Correction";
    }

    if (path === "reason" || path === "reasonGroup") {
      const meta = findReason(String(state.reason), state.reasonGroup as ReasonGroup);
      for (const row of (state.items as GridRow[]) ?? []) {
        if (!meta) continue;
        if (meta.group === "Positive") row.action = "Increase Quantity";
        else if (meta.group === "Negative") row.action = "Decrease Quantity";
        else if (meta.group === "Status") {
          row.action = "Change Stock Status";
          row.statusFrom = meta.fromStatus[0] ?? row.statusFrom ?? "Available";
          row.statusTo = meta.defaultTo;
        }
      }
    }

    if (path === "warehouse") {
      for (const row of (state.items as GridRow[]) ?? []) {
        row.eligible = eligibleQty(
          String(row.code ?? ""),
          whCode(String(state.warehouse)),
          String(row.statusFrom ?? "Available"),
        );
      }
    }
  },

  onGridChange: (path, state) => {
    for (const row of (state.items as GridRow[]) ?? []) {
      row.eligible = eligibleQty(
        String(row.code ?? ""),
        whCode(String(state.warehouse)),
        String(row.statusFrom ?? "Available"),
      );
      /* A decrease can never take more than the source status holds. */
      const meta = findReason(String(state.reason), state.reasonGroup as ReasonGroup);
      const takesStock =
        row.action === "Decrease Quantity" ||
        row.action === "Scrap" ||
        row.action === "Change Stock Status";
      if (takesStock && !meta?.negativeAllowed && num(row.qty) > num(row.eligible)) {
        row.qty = num(row.eligible);
      }
    }
    void path;
  },

  newRow: (_path, isFirst) => ({
    code: "",
    name: "",
    unit: "",
    cat: "",
    action: isFirst ? "Increase Quantity" : "Increase Quantity",
    qty: 0,
    eligible: 0,
    statusFrom: "Available",
    statusTo: "Available",
    locFrom: "",
    locTo: "",
    lot: "",
    lotTo: "",
    exp: "",
    expTo: "",
    serials: "",
    serialsTo: "",
    unitCost: 0,
    note: "",
  }),

  lookup: {
    product: (q) => {
      const term = q.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) =>
          !term ||
          p.code.toLowerCase().includes(term) ||
          p.name.toLowerCase().includes(term) ||
          String(p.barcode).includes(term),
      )
        .slice(0, 12)
        .map((p) => ({
          code: p.code,
          name: p.name,
          meta: `${p.cat} · คงเหลือ ${fmt(eligibleQty(p.code, "", "Available"))} ${p.unit}`,
        }));
    },
  },

  onLookupPick: (source, gridPath, index, hit, state) => {
    if (source !== "product") return;
    const rows = (state[gridPath] as GridRow[]) ?? [];
    const row = rows[index];
    if (!row) return;
    const p = PRODUCTS.find((x) => x.code === hit.code);

    row.code = hit.code;
    row.name = hit.name;
    row.unit = p?.unit ?? "";
    row.cat = p?.cat ?? "";
    row.unitCost = p?.pricing?.avgCost ?? p?.price ?? 0;
    row.eligible = eligibleQty(
      hit.code,
      whCode(String(state.warehouse)),
      String(row.statusFrom ?? "Available"),
    );
    row.qty = 0;
  },

  findDuplicates: (state) => {
    const rows = (state.items as GridRow[]) ?? [];
    const seen = new Map<string, number>();
    const hits: { code: string; name: string; why: string }[] = [];
    rows.forEach((r, i) => {
      if (!r.code) return;
      const key = `${r.code}|${r.lot}|${r.action}`;
      if (seen.has(key)) {
        hits.push({
          code: String(r.code),
          name: String(r.name ?? ""),
          why: `บรรทัด ${i + 1} ซ้ำกับบรรทัด ${seen.get(key)! + 1} (สินค้า Lot และการกระทำเดียวกัน)`,
        });
      } else seen.set(key, i);
    });
    return hits;
  },

  steps: [
    {
      key: "info",
      label: "Adjustment Information",
      labelTh: "ข้อมูลใบปรับปรุง",
      blocks: (state) => {
        const meta = findReason(String(state.reason), state.reasonGroup as ReasonGroup);
        return [
          {
            type: "card",
            title: "ข้อมูลใบปรับปรุง",
            cols: "3",
            badge: meta ? (
              <span className="flex gap-1.5">
                {meta.approvalRequired && <Badge tone="warning">ต้องอนุมัติ</Badge>}
                {meta.evidenceRequired && <Badge tone="danger">ต้องมีหลักฐาน</Badge>}
              </span>
            ) : undefined,
            fields: [
              { type: "text", path: "code", label: "Adjustment Number", readonly: true },
              { type: "date", path: "adjDate", label: "Adjustment Date", required: true },
              {
                type: "select",
                path: "reasonGroup",
                label: "Reason Group",
                required: true,
                options: REASON_GROUPS,
                hint: "กลุ่มเหตุผลกำหนดประเภทและการกระทำของแต่ละบรรทัด",
              },
              {
                type: "select",
                path: "reason",
                label: "Adjustment Reason",
                required: true,
                options: reasonsFor((state.reasonGroup as ReasonGroup) ?? "Positive").map(
                  (r) => r.code,
                ),
              },
              {
                type: "select",
                path: "type",
                label: "Adjustment Type",
                required: true,
                options: [...ADJ_TYPES],
              },
              { type: "select", path: "priority", label: "Priority", options: [...ADJ_PRIORITIES] },
              { type: "text", path: "requestedBy", label: "Requested By", required: true },
              { type: "text", path: "reviewer", label: "Assigned Reviewer" },
              {
                type: "select",
                path: "refType",
                label: "Reference Document Type",
                options: [...ADJ_REF_TYPES],
              },
              { type: "text", path: "refDoc", label: "Reference Document Number" },
              {
                type: "textarea",
                path: "description",
                label: "Description",
                required: true,
                span: true,
                rows: 2,
                placeholder: "อธิบายสาเหตุและสิ่งที่พบ",
              },
            ],
          },
          meta && {
            type: "card",
            title: `กติกาของเหตุผล "${meta.code}"`,
            fields: [
              {
                type: "static",
                label: "เงื่อนไขควบคุม",
                span: true,
                value: () => (
                  <span className="flex flex-wrap gap-2 text-cap">
                    <span className="rounded-pill border border-line bg-surface px-2.5 py-1">
                      อนุมัติ: {meta.approvalRequired ? "ต้องมี" : "ตามเกณฑ์ปริมาณ/มูลค่า"}
                    </span>
                    <span className="rounded-pill border border-line bg-surface px-2.5 py-1">
                      หลักฐาน: {meta.evidenceRequired ? "บังคับ" : "ไม่บังคับ"}
                    </span>
                    <span className="rounded-pill border border-line bg-surface px-2.5 py-1">
                      สถานะต้นทาง: {meta.fromStatus.length ? meta.fromStatus.join(", ") : "ทุกสถานะ"}
                    </span>
                    <span className="rounded-pill border border-line bg-surface px-2.5 py-1">
                      สถานะปลายทาง: {meta.toStatus.length ? meta.toStatus.join(", ") : "ทุกสถานะ"}
                    </span>
                    <span className="rounded-pill border border-line bg-surface px-2.5 py-1">
                      เกณฑ์มูลค่า: {money(meta.valueThreshold)}
                    </span>
                    <span className="rounded-pill border border-line bg-surface px-2.5 py-1">
                      สิทธิ์: {meta.roles.join(", ")}
                    </span>
                  </span>
                ),
              },
            ],
          },
        ];
      },
    },

    {
      key: "warehouse",
      label: "Warehouse and Location",
      labelTh: "คลังและตำแหน่ง",
      blocks: () => [
        {
          type: "card",
          title: "คลังและตำแหน่ง",
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
          ],
        },
      ],
    },

    {
      key: "items",
      label: "Adjustment Items",
      labelTh: "รายการปรับปรุง",
      blocks: () => [
        {
          type: "card",
          title: "รายการปรับปรุง",
          fields: [
            {
              type: "grid",
              path: "items",
              label: "สินค้าที่ต้องปรับปรุง",
              span: true,
              addLabel: "เพิ่มรายการ",
              empty: "ยังไม่มีรายการ — กดเพิ่มรายการเพื่อเลือกสินค้า",
              cols: [
                { key: "code", label: "Product", type: "lookup", source: "product", width: "190px" },
                { key: "name", label: "Product Name", type: "text", readonly: true },
                { key: "unit", label: "UOM", type: "text", readonly: true, width: "70px" },
                {
                  key: "action",
                  label: "Adjustment Action",
                  type: "select",
                  options: [...ADJ_ACTIONS],
                  width: "170px",
                },
                {
                  key: "eligible",
                  label: "Eligible",
                  type: "number",
                  readonly: true,
                  align: "right",
                  width: "90px",
                },
                { key: "qty", label: "Quantity", type: "number", align: "right", width: "100px" },
                {
                  key: "statusFrom",
                  label: "Status From",
                  type: "select",
                  options: [...ADJ_STOCK_STATUSES],
                  width: "130px",
                },
                {
                  key: "statusTo",
                  label: "Status To",
                  type: "select",
                  options: [...ADJ_STOCK_STATUSES],
                  width: "130px",
                },
                { key: "locFrom", label: "Location From", type: "text", width: "130px" },
                { key: "locTo", label: "Location To", type: "text", width: "130px" },
                { key: "lot", label: "Lot", type: "text", width: "110px" },
                { key: "lotTo", label: "Correct Lot", type: "text", width: "110px" },
                { key: "unitCost", label: "Unit Cost", type: "number", align: "right", width: "100px" },
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
          title: "Lot และ Serial",
          fields: [
            {
              type: "grid",
              path: "items",
              label: "ข้อมูลติดตามรายบรรทัด",
              span: true,
              addLabel: "เพิ่มรายการ",
              empty: "ยังไม่มีรายการ",
              cols: [
                { key: "code", label: "Product", type: "text", readonly: true, width: "150px" },
                { key: "lot", label: "Lot เดิม", type: "text", width: "120px" },
                { key: "lotTo", label: "Lot ใหม่", type: "text", width: "120px" },
                { key: "exp", label: "Expiry เดิม", type: "text", width: "120px" },
                { key: "expTo", label: "Expiry ใหม่", type: "text", width: "120px" },
                { key: "serials", label: "Serial เดิม", type: "text", width: "200px" },
                { key: "serialsTo", label: "Serial ใหม่", type: "text", width: "200px" },
              ],
            },
            {
              type: "static",
              label: "Serial ที่แก้ไขได้ในคลังนี้",
              span: true,
              value: () => {
                const codes = [
                  ...new Set(
                    ((state.items as GridRow[]) ?? [])
                      .map((r) => String(r.code ?? ""))
                      .filter(Boolean),
                  ),
                ];
                if (!codes.length) return "เลือกสินค้าก่อนเพื่อดู Serial";
                return (
                  <span className="flex flex-col gap-3">
                    {codes.map((code) => {
                      const serials = adjustableSerials(
                        code,
                        whCode(String(state.warehouse ?? "")),
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
                                  {s.serial} · {s.status}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-cap text-ink-3">
                              ไม่มี Serial ที่แก้ไขได้ในคลังนี้
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </span>
                );
              },
            },
            {
              type: "note",
              label: "กติกาการแก้ไข",
              span: true,
              text: "การแก้ Lot หรือ Serial จะไม่ทับข้อมูลเดิม แต่สร้างคู่รายการออก/เข้าใน Stock Card · Serial ใหม่ต้องยังไม่มีในระบบ · จำนวน Serial เดิมและใหม่ต้องเท่ากัน",
            },
          ],
        },
      ],
    },

    {
      key: "evidence",
      label: "Reason and Evidence",
      labelTh: "เหตุผลและหลักฐาน",
      blocks: (state) => {
        const doc = toDocument(state);
        const required = evidenceRequired(doc);
        return [
          {
            type: "card",
            title: "เหตุผลและหลักฐาน",
            badge: required ? (
              <Badge tone="danger">ต้องมีหลักฐาน</Badge>
            ) : (
              <Badge tone="neutral">ไม่บังคับ</Badge>
            ),
            fields: [
              {
                type: "static",
                label: "เหตุผลที่เลือก",
                value: () => `${state.reason} (${state.reasonGroup})`,
              },
              {
                type: "static",
                label: "สถานะหลักฐาน",
                value: () =>
                  required
                    ? "ต้องแนบหลักฐานอย่างน้อย 1 รายการก่อนบันทึกเข้าสต๊อก"
                    : "แนบเพิ่มได้เพื่อการตรวจสอบย้อนหลัง",
              },
              {
                type: "note",
                label: "การแนบไฟล์",
                span: true,
                text: "แนบหลักฐานได้จากหน้ารายละเอียดหลังบันทึกเอกสาร — ระบบจัดเก็บไฟล์จริงจะเปิดใช้งานในเฟสถัดไป",
              },
            ],
          },
        ];
      },
    },

    {
      key: "approval",
      label: "Approval Preview",
      labelTh: "ตัวอย่างการอนุมัติ",
      blocks: (state) => {
        const doc = toDocument(state);
        const approvalReasons = approvalTriggers(doc);
        const row = { approvalReasons, needsApproval: approvalReasons.length > 0 };
        return [
          {
            type: "card",
            title: "ตัวอย่างเส้นทางการอนุมัติ",
            badge: row.needsApproval ? (
              <Badge tone="warning">ต้องขออนุมัติ</Badge>
            ) : (
              <Badge tone="success">บันทึกได้ทันที</Badge>
            ),
            fields: [
              {
                type: "static",
                label: "เหตุที่ต้องขออนุมัติ",
                span: true,
                value: () =>
                  row.approvalReasons.length ? (
                    <span className="flex flex-col gap-1">
                      {row.approvalReasons.map((r) => (
                        <span key={r} className="text-body">
                          • {r}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "ไม่เข้าเงื่อนไขที่ต้องขออนุมัติ"
                  ),
              },
            ],
          },
        ];
      },
    },

    {
      key: "impact",
      label: "Stock Impact Preview",
      labelTh: "ผลกระทบต่อสต๊อก",
      blocks: (state) => {
        const doc = toDocument(state);
        const impact = stockImpact(doc);
        return [
          {
            type: "card",
            title: "ผลกระทบต่อสต๊อก",
            fields: [
              {
                type: "static",
                label: "ก่อน → หลัง",
                span: true,
                value: () => {
                  if (!impact.length) return "เพิ่มรายการสินค้าเพื่อดูผลกระทบ";
                  return (
                    <span className="flex flex-col gap-2">
                      {impact.map((x) => (
                        <span
                          key={x.product}
                          className="flex flex-wrap items-center gap-2 rounded-btn border border-line p-3 text-cap"
                        >
                          <span className="min-w-[160px] font-semibold">{x.name}</span>
                          <span className="tnum">
                            On Hand {fmt(x.onHandBefore)} → {fmt(x.onHandAfter)}
                          </span>
                          <span className="tnum text-ink-2">
                            Available {fmt(x.availableBefore)} → {fmt(x.availableAfter)}
                          </span>
                          <span className="tnum text-ink-2">
                            QC {fmt(x.qcBefore)} → {fmt(x.qcAfter)}
                          </span>
                          <span className="tnum text-ink-2">
                            Damaged {fmt(x.damagedBefore)} → {fmt(x.damagedAfter)}
                          </span>
                          {x.goesNegative && <Badge tone="danger">ผลลัพธ์ติดลบ</Badge>}
                          {x.releasesRestricted && (
                            <Badge tone="warning">ปล่อยสต๊อกที่กันไว้</Badge>
                          )}
                          {x.highValue && <Badge tone="warning">มูลค่าสูง</Badge>}
                        </span>
                      ))}
                    </span>
                  );
                },
              },
              {
                type: "static",
                label: "รายการที่จะสร้างใน Stock Card",
                span: true,
                value: () => {
                  const types = doc.items.flatMap((l) =>
                    lineMovementTypes(l, doc.reason).map((t) => `บรรทัด ${l.line}: ${t}`),
                  );
                  return types.length ? types.join(" · ") : "ยังไม่มีรายการ";
                },
              },
            ],
          },
        ];
      },
    },

    { key: "review", label: "Summary", labelTh: "สรุป", review: true, blocks: () => [] },
  ],

  required: [
    { path: "adjDate", label: "Adjustment Date", step: "info" },
    { path: "type", label: "Adjustment Type", step: "info" },
    { path: "reason", label: "Adjustment Reason", step: "info" },
    { path: "requestedBy", label: "Requested By", step: "info" },
    { path: "description", label: "Description", step: "info" },
    { path: "warehouse", label: "Warehouse", step: "warehouse" },
    {
      path: "items",
      label: "รายการอย่างน้อย 1 รายการ",
      step: "items",
      test: (s) => ((s.items as GridRow[]) ?? []).some((r) => r.code && num(r.qty) > 0),
    },
  ],

  rules: [
    {
      label: "จำนวนต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items as GridRow[]) ?? []).every((r) => !r.code || num(r.qty) > 0),
    },
    {
      label: "จำนวนที่ปรับลดต้องไม่เกินยอดที่มี",
      step: "items",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every(
          (r) =>
            !r.code ||
            !(r.action === "Decrease Quantity" || r.action === "Scrap") ||
            num(r.qty) <= num(r.eligible),
        ),
    },
    {
      label: "สถานะต้นทางและปลายทางต้องต่างกัน",
      step: "items",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every(
          (r) => !r.code || r.action !== "Change Stock Status" || r.statusFrom !== r.statusTo,
        ),
    },
    {
      label: "เส้นทางสถานะต้องได้รับอนุญาต",
      step: "items",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every(
          (r) =>
            !r.code ||
            r.action !== "Change Stock Status" ||
            lineMovementTypes({
              action: "Change Stock Status",
              statusFrom: String(r.statusFrom),
              statusTo: String(r.statusTo),
            } as AdjLine).length > 0,
        ),
    },
    {
      label: "ตำแหน่งต้นทางและปลายทางต้องต่างกัน",
      step: "items",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every(
          (r) => !r.code || r.action !== "Correct Location" || (r.locTo && r.locFrom !== r.locTo),
        ),
    },
    {
      label: "การย้ายข้ามคลังต้องใช้ Stock Transfer",
      step: "items",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every((r) => {
          if (r.action !== "Correct Location") return true;
          const from = String(r.locFrom ?? "").split("/")[0];
          const to = String(r.locTo ?? "").split("/")[0];
          return !(from.includes("WH-") && to.includes("WH-") && from !== to);
        }),
    },
    {
      label: "Lot เดิมและ Lot ใหม่ต้องต่างกัน",
      step: "lotserial",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every(
          (r) => !r.code || r.action !== "Correct Lot" || (r.lotTo && r.lot !== r.lotTo),
        ),
    },
    {
      label: "จำนวน Serial เดิมและใหม่ต้องเท่ากันและห้ามซ้ำ",
      step: "lotserial",
      test: (s) =>
        ((s.items as GridRow[]) ?? []).every((r) => {
          if (r.action !== "Correct Serial") return true;
          const from = String(r.serials ?? "").split(/[,\s]+/).filter(Boolean);
          const to = String(r.serialsTo ?? "").split(/[,\s]+/).filter(Boolean);
          return (
            from.length > 0 &&
            from.length === to.length &&
            new Set([...from, ...to]).size === from.length + to.length
          );
        }),
    },
  ],

  previewCard: (state) => {
    const doc = toDocument(state);
    const rows = doc.items.filter((l) => l.code);
    const qtyIn = rows.filter(isIncrease).reduce((t, l) => t + l.qty, 0);
    const qtyOut = rows.filter(isDecrease).reduce((t, l) => t + l.qty, 0);
    const statusQty = rows.filter(isStatusChange).reduce((t, l) => t + l.qty, 0);

    return (
      <div className="flex flex-col gap-3">
        <div className="text-body font-semibold">{String(state.reason)}</div>
        <div className="text-cap text-ink-2">
          {whCode(String(state.warehouse))} · {String(state.bin || "—")}
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          {qtyIn > 0 && (
            <span className="tnum text-xl font-bold text-success">+{fmt(qtyIn)}</span>
          )}
          {qtyOut > 0 && (
            <span className="tnum text-xl font-bold text-danger">−{fmt(qtyOut)}</span>
          )}
          {statusQty > 0 && (
            <span className="tnum text-xl font-bold text-warning">±{fmt(statusQty)}</span>
          )}
          <span className="text-cap text-ink-2">{rows.length} รายการ</span>
        </div>
        <Badge tone="info">{String(state.type)}</Badge>
      </div>
    );
  },
};

