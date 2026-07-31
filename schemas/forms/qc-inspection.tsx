import {
  QC_DECISIONS,
  QC_FAIL_ACTIONS,
  QC_INSPECTORS,
  QC_METHODS,
  QC_PRIORITY,
  QC_SAMPLING,
} from "@/data/qc";
import { GR_WAREHOUSES } from "@/data/goods-receipts";
import {
  GOODS_RECEIPTS,
  QC_INSPECTIONS,
  decorateGRs,
  decorateQCs,
  getGR,
  newChecklist,
  nextQCCode,
  qcChecklistStats,
  qcPendingQty,
  qcSupplierStat,
  type QcRow,
} from "@/lib/domain/inbound";
import { fmt, stamp, toDisplayDate, toInputDate, today } from "@/lib/format";
import type { FormSchema, GridRow } from "@/lib/types";
import {
  FORM_USER,
  RailCard,
  RailRow,
  RailTotal,
  opts,
  saved,
} from "./common";

/* ============================================================
   QC INSPECTION FORM

   The checklist is the document. Everything else — quantities,
   the fail action, the NCR — follows from what the inspector
   actually ticked, which is why the decision step only appears
   once the checklist has been worked through.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isDecided = (s: { result?: string }) =>
  Boolean(s.result) && s.result !== "Pending";
const isFailing = (s: { result?: string }) =>
  s.result === "Fail" || s.result === "Partial Pass";

/** Receipts sitting in QC Hold are the only things worth inspecting. */
const pendingGRs = () =>
  GOODS_RECEIPTS.filter((g) => g.qcStatus === "Pending" || g.status === "Pending QC");

export const QC_FORM: FormSchema<QcRow> = {
  key: "qc-inspection",
  entityLabel: "QC Inspection",
  saveButton: "Save Inspection",
  statusBadge: {
    Waiting: "info",
    "In Progress": "warning",
    Hold: "neutral",
    Completed: "success",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextQCCode(),
    grRef: "",
    poRef: "",
    supplier: "",
    product: "",
    productName: "",
    lot: "",
    serial: "",
    warehouse: "WH-QC Quality Hold",
    inspector: "",
    dueDate: "",
    priority: "Medium",
    status: "Waiting",
    result: "Pending",
    receivedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    unit: "",
    method: "Visual",
    sampling: "AQL 2.5",
    sampleSize: 0,
    sampleAccept: 0,
    sampleReject: 0,
    expiry: "",
    inspectionDate: toInputDate(today()),
    checklist: newChecklist(),
    reason: "",
    correctiveAction: "",
    failAction: "",
    ncrRef: "",
    round: 1,
  }),

  toState: (q) => ({
    _mode: "edit",
    code: q.code,
    grRef: q.grRef,
    poRef: q.poRef,
    supplier: q.supplier,
    product: q.product,
    productName: q.productName,
    lot: q.lot,
    serial: q.serial,
    warehouse: q.warehouse,
    inspector: q.inspector,
    dueDate: toInputDate(q.dueDate),
    priority: q.priority,
    status: q.status,
    result: q.result,
    receivedQty: q.receivedQty,
    acceptedQty: q.acceptedQty,
    rejectedQty: q.rejectedQty,
    unit: q.unit,
    method: q.method,
    sampling: q.sampling,
    sampleSize: q.sampleSize,
    sampleAccept: q.sampleAccept,
    sampleReject: q.sampleReject,
    expiry: toInputDate(q.expiry),
    inspectionDate: toInputDate(q.inspectionDate),
    checklist: (q.checklist ?? newChecklist()).map((c) => ({ ...c })),
    reason: q.reason,
    correctiveAction: q.correctiveAction,
    failAction: q.failAction,
    ncrRef: q.ncrRef,
    round: q.round,
  }),

  steps: [
    /* ---------- 1. SUBJECT ---------- */
    {
      key: "subject",
      label: "Subject",
      railLabel: "สิ่งที่ตรวจ",
      labelTh: "ใบรับของและสินค้า",
      blocks: (s) => [
        {
          type: "card",
          title: "Inspection Subject",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "QC Number" },
            {
              type: "select",
              path: "grRef",
              label: "Goods Receipt",
              required: true,
              options: pendingGRs().map((g) => g.code),
              hint: "เลือกใบรับของแล้วระบบจะดึงสินค้าและจำนวนมาให้",
            },
            { type: "static", path: "poRef", label: "PO Reference" },
            { type: "static", path: "supplier", label: "Supplier" },
            { type: "static", path: "product", label: "Product Code" },
            { type: "static", path: "productName", label: "Product Name" },
            { type: "text", path: "lot", label: "Lot Number" },
            { type: "text", path: "serial", label: "Serial Number" },
            { type: "date", path: "expiry", label: "Expiry Date" },
            {
              type: "number",
              path: "receivedQty",
              label: "Received Qty",
              required: true,
              min: 0,
              readonly: Boolean(s.grRef),
            },
            { type: "static", path: "unit", label: "Unit" },
            {
              type: "select",
              path: "warehouse",
              label: "Holding Warehouse",
              options: opts(GR_WAREHOUSES),
            },
          ],
        },
      ],
    },

    /* ---------- 2. PLAN ---------- */
    {
      key: "plan",
      label: "Plan",
      railLabel: "แผนการตรวจ",
      labelTh: "ผู้ตรวจและวิธีสุ่ม",
      blocks: () => [
        {
          type: "card",
          title: "Inspection Plan",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "inspector",
              label: "Inspector",
              required: true,
              options: opts(QC_INSPECTORS),
            },
            { type: "date", path: "inspectionDate", label: "Inspection Date", required: true },
            { type: "date", path: "dueDate", label: "Due Date", required: true },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(QC_PRIORITY),
            },
            {
              type: "select",
              path: "method",
              label: "Inspection Method",
              required: true,
              options: opts(QC_METHODS),
            },
            {
              type: "select",
              path: "sampling",
              label: "Sampling Plan",
              required: true,
              options: opts(QC_SAMPLING),
            },
            { type: "number", path: "sampleSize", label: "Sample Size", min: 0 },
            { type: "number", path: "sampleAccept", label: "Accept Number (Ac)", min: 0 },
            { type: "number", path: "sampleReject", label: "Reject Number (Re)", min: 0 },
          ],
        },
      ],
    },

    /* ---------- 3. CHECKLIST ---------- */
    {
      key: "checklist",
      label: "Checklist",
      railLabel: "รายการตรวจ",
      labelTh: "ผ่าน / ไม่ผ่าน / ไม่เกี่ยวข้อง",
      blocks: () => [
        {
          type: "grid",
          path: "checklist",
          label: "Inspection Checklist",
          required: true,
          addLabel: "เพิ่มรายการตรวจ",
          empty: "ยังไม่มีรายการตรวจ",
          hint: "ทุกรายการต้องมีผลก่อนสรุปผลการตรวจ — เลือก N/A สำหรับรายการที่ไม่เกี่ยวข้อง",
          cols: [
            { key: "item", label: "Check Item", type: "text", required: true, width: "240px" },
            {
              key: "result",
              label: "Result",
              type: "seg",
              width: "190px",
              segOptions: [
                { val: "pass", label: "ผ่าน", tone: "ok" },
                { val: "fail", label: "ไม่ผ่าน", tone: "danger" },
                { val: "na", label: "N/A", tone: "neutral" },
              ],
            },
            { key: "comment", label: "Comment", type: "text" },
          ],
        },
      ],
    },

    /* ---------- 4. DECISION ---------- */
    {
      key: "decision",
      label: "Decision",
      railLabel: "สรุปผล",
      labelTh: "ผลตรวจและการจัดการ",
      blocks: (s) => [
        {
          type: "card",
          title: "Result",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "result",
              label: "Inspection Result",
              required: true,
              options: opts(QC_DECISIONS),
            },
            {
              type: "number",
              path: "acceptedQty",
              label: "Accepted Qty",
              required: true,
              min: 0,
              max: num(s.receivedQty),
            },
            {
              type: "number",
              path: "rejectedQty",
              label: "Rejected Qty",
              required: true,
              min: 0,
              max: num(s.receivedQty),
            },
            {
              type: "static",
              label: "ยังไม่ตัดสิน",
              value: (st) => `${fmt(qcPendingQty(st))} ${String(st.unit ?? "")}`,
            },
          ],
        },
        {
          type: "card",
          title: "Non-Conformance",
          cols: "2",
          badge: <span className="text-cap text-danger-text">แสดงเมื่อผลตรวจไม่ผ่านทั้งหมด</span>,
          fields: [
            {
              type: "select",
              path: "failAction",
              label: "Fail Action",
              required: true,
              options: opts(QC_FAIL_ACTIONS),
              when: isFailing,
            },
            {
              type: "textarea",
              path: "reason",
              label: "Reason for Rejection",
              required: true,
              span: true,
              rows: 2,
              when: isFailing,
            },
            {
              type: "textarea",
              path: "correctiveAction",
              label: "Corrective Action Requested",
              span: true,
              rows: 2,
              when: isFailing,
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
    { path: "grRef", label: "Goods Receipt", step: "subject" },
    { path: "receivedQty", label: "Received Qty", step: "subject" },
    { path: "inspector", label: "Inspector", step: "plan" },
    { path: "inspectionDate", label: "Inspection Date", step: "plan" },
    { path: "dueDate", label: "Due Date", step: "plan" },
    { path: "priority", label: "Priority", step: "plan" },
    { path: "method", label: "Inspection Method", step: "plan" },
    { path: "sampling", label: "Sampling Plan", step: "plan" },
    {
      path: "checklist",
      label: "รายการตรวจอย่างน้อย 1 รายการ",
      step: "checklist",
      test: (s) => ((s.checklist ?? []) as GridRow[]).some((c) => String(c.item ?? "").trim()),
    },
    { path: "result", label: "Inspection Result", step: "decision" },
    { path: "acceptedQty", label: "Accepted Qty", step: "decision" },
    { path: "rejectedQty", label: "Rejected Qty", step: "decision" },
    {
      path: "failAction",
      label: "Fail Action",
      step: "decision",
      test: (s) => !isFailing(s) || Boolean(s.failAction),
    },
    {
      path: "reason",
      label: "Reason for Rejection",
      step: "decision",
      test: (s) => !isFailing(s) || Boolean(String(s.reason ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันครบกำหนดต้องไม่อยู่ก่อนวันที่ตรวจ",
      step: "plan",
      test: (s) =>
        !s.dueDate || !s.inspectionDate || String(s.dueDate) >= String(s.inspectionDate),
    },
    {
      label: "จำนวนตัวอย่างต้องไม่เกินจำนวนที่รับเข้า",
      step: "plan",
      test: (s) => num(s.sampleSize) <= num(s.receivedQty),
    },
    {
      label: "ต้องระบุผลของทุกรายการตรวจก่อนสรุปผล",
      step: "checklist",
      test: (s) =>
        !isDecided(s) ||
        ((s.checklist ?? []) as GridRow[]).every((c) => Boolean(String(c.result ?? "").trim())),
    },
    {
      label: "จำนวนที่รับได้ + ที่ปฏิเสธ ต้องไม่เกินจำนวนที่รับเข้า",
      step: "decision",
      test: (s) => num(s.acceptedQty) + num(s.rejectedQty) <= num(s.receivedQty),
    },
    {
      label: "ผลตรวจ Pass ต้องรับของทั้งหมดและไม่มีของถูกปฏิเสธ",
      step: "decision",
      test: (s) =>
        s.result !== "Pass" ||
        (num(s.acceptedQty) === num(s.receivedQty) && num(s.rejectedQty) === 0),
    },
    {
      label: "ผลตรวจ Fail ต้องปฏิเสธของทั้งหมด",
      step: "decision",
      test: (s) => s.result !== "Fail" || num(s.rejectedQty) === num(s.receivedQty),
    },
    {
      label: "ผลตรวจ Partial Pass ต้องมีทั้งของที่รับได้และของที่ปฏิเสธ",
      step: "decision",
      test: (s) =>
        s.result !== "Partial Pass" || (num(s.acceptedQty) > 0 && num(s.rejectedQty) > 0),
    },
    {
      label: "มีรายการตรวจที่ไม่ผ่าน — ผลสรุปต้องไม่ใช่ Pass",
      step: "decision",
      test: (s) => {
        const anyFail = ((s.checklist ?? []) as GridRow[]).some((c) => c.result === "fail");
        return !anyFail || s.result !== "Pass";
      },
    },
  ],

  /** Choosing the receipt fills in everything the inspector should not retype. */
  onChange: (path, s) => {
    if (path !== "grRef") return;
    const gr = getGR(String(s.grRef ?? ""));
    if (!gr) return;

    const line = (gr.items ?? []).find((it) => it.qc) ?? gr.items?.[0];
    s.poRef = gr.poRef;
    s.supplier = gr.supplier;
    s.warehouse = gr.qc?.qcWh || "WH-QC Quality Hold";
    s.inspector = s.inspector || gr.qc?.inspector || "";
    s.dueDate = s.dueDate || toInputDate(gr.qc?.dueDate);

    if (line) {
      s.product = line.code;
      s.productName = line.name;
      s.unit = line.unit;
      s.receivedQty = num(line.receiveNow);
      /* AQL 2.5 on a general lot — roughly the square root, capped at the lot. */
      s.sampleSize = Math.min(
        num(line.receiveNow),
        Math.max(1, Math.ceil(Math.sqrt(num(line.receiveNow)))),
      );
    }
  },

  newRow: () => ({ item: "", result: "", comment: "" }),

  previewCard: (s) => {
    const stats = qcChecklistStats(s);
    const done = stats.total - stats.pending;
    return (
      <RailCard icon="qc" title="Checklist Progress" tone={stats.fail ? "warn" : "accent"}>
        <RailRow label="ตรวจแล้ว" value={`${done}/${stats.total}`} />
        <RailRow label="ผ่าน" value={stats.pass} tone="ok" />
        <RailRow label="ไม่ผ่าน" value={stats.fail} tone={stats.fail ? "danger" : undefined} />
        <RailRow label="ไม่เกี่ยวข้อง" value={stats.na} />
        <RailTotal
          label="ตัดสินแล้ว"
          value={`${fmt(num(s.acceptedQty) + num(s.rejectedQty))} / ${fmt(s.receivedQty)}`}
        />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const supplier = String(s.supplier ?? "");
    if (!supplier) {
      return (
        <RailCard icon="truck" title="Supplier Quality">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกใบรับของเพื่อดูสถิติคุณภาพย้อนหลังของผู้ขายรายนี้
          </p>
        </RailCard>
      );
    }

    const stat = qcSupplierStat(supplier);
    const stats = qcChecklistStats(s);
    const failRate = num(s.receivedQty)
      ? Math.round((num(s.rejectedQty) / num(s.receivedQty)) * 100)
      : 0;
    const worseThanNorm = failRate > stat.failRate;

    return (
      <RailCard icon="shield" title="Supplier Quality" tone={worseThanNorm ? "warn" : "default"}>
        <RailRow label="ผู้ขาย" value={supplier} />
        <RailRow label="อัตราไม่ผ่านปกติ" value={`${stat.failRate}%`} />
        <RailRow
          label="อัตราไม่ผ่านครั้งนี้"
          value={`${failRate}%`}
          tone={worseThanNorm ? "danger" : "ok"}
        />
        <RailRow label="NCR ที่ยังเปิดอยู่" value={stat.openNcr} tone={stat.openNcr ? "warn" : undefined} />
        {worseThanNorm && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            อัตราไม่ผ่านครั้งนี้สูงกว่าค่าปกติของผู้ขาย — ควรออก NCR และแจ้งฝ่ายจัดซื้อ
          </p>
        )}
        {stats.fail > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            มี {stats.fail} รายการตรวจที่ไม่ผ่าน — ผลสรุปต้องไม่ใช่ Pass
          </p>
        )}
      </RailCard>
    );
  },

  /* Failing an inspection creates an NCR and moves stock to the claim warehouse. */
  beforeSave: (s, proceed, ctx) => {
    if (!isFailing(s)) {
      proceed();
      return;
    }
    ctx.confirm({
      title: "บันทึกผลตรวจไม่ผ่าน?",
      message: (
        <>
          ปฏิเสธ <strong>{fmt(s.rejectedQty)}</strong> {String(s.unit ?? "")} ของ{" "}
          <strong>{String(s.productName ?? "")}</strong>
          <br />
          ระบบจะออก NCR และย้ายของไป {String(s.failAction ?? "คลังเคลม")}
        </>
      ),
      confirmText: "ยืนยันผลไม่ผ่าน",
      tone: "danger",
      onConfirm: proceed,
    });
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = QC_INSPECTIONS.find((q) => q.code === code);
    const failing = isFailing(s);
    const decided = isDecided(s);

    const patch = {
      grRef: String(s.grRef ?? ""),
      poRef: String(s.poRef ?? ""),
      supplier: String(s.supplier ?? ""),
      product: String(s.product ?? ""),
      productName: String(s.productName ?? ""),
      lot: String(s.lot ?? ""),
      serial: String(s.serial ?? ""),
      warehouse: failing
        ? "WH-CLAIM Claim Warehouse"
        : String(s.warehouse ?? "WH-QC Quality Hold"),
      inspector: String(s.inspector ?? ""),
      dueDate: toDisplayDate(s.dueDate),
      priority: String(s.priority ?? "Medium"),
      result: String(s.result ?? "Pending"),
      status: decided ? "Completed" : "In Progress",
      receivedQty: num(s.receivedQty),
      acceptedQty: num(s.acceptedQty),
      rejectedQty: num(s.rejectedQty),
      unit: String(s.unit ?? ""),
      method: String(s.method ?? ""),
      sampling: String(s.sampling ?? ""),
      sampleSize: num(s.sampleSize),
      sampleAccept: num(s.sampleAccept),
      sampleReject: num(s.sampleReject),
      expiry: toDisplayDate(s.expiry),
      inspectionDate: toDisplayDate(s.inspectionDate),
      checklist: ((s.checklist ?? []) as GridRow[])
        .filter((c) => String(c.item ?? "").trim())
        .map((c) => ({
          item: String(c.item).trim(),
          result: String(c.result ?? ""),
          comment: String(c.comment ?? ""),
        })),
      reason: String(s.reason ?? ""),
      correctiveAction: String(s.correctiveAction ?? ""),
      failAction: String(s.failAction ?? ""),
      ncrRef:
        String(s.ncrRef ?? "") ||
        (failing ? `NCR2506-${String(QC_INSPECTIONS.length + 1).padStart(3, "0")}` : ""),
      round: num(s.round) || 1,
      updated: now,
      updatedBy: FORM_USER,
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: decided ? `Inspection ${patch.result}` : "Inspection updated",
        d: `ตรวจ ${fmt(patch.receivedQty)} ${patch.unit} — รับได้ ${fmt(patch.acceptedQty)}`,
        u: patch.inspector,
        when: now,
        kind: failing ? "warn" : "primary",
      });
    } else {
      QC_INSPECTIONS.unshift({
        code,
        ...patch,
        claimRef: "",
        prevResult: "",
        created: now,
        createdBy: FORM_USER,
        history: [
          {
            t: "Inspection created",
            d: `สร้างใบตรวจจาก ${patch.grRef}`,
            u: patch.inspector || FORM_USER,
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as QcRow);
    }

    /* Route the outcome back to the receipt that raised this inspection. */
    const gr = getGR(patch.grRef);
    if (gr && decided) {
      gr.qcStatus =
        patch.result === "Pass"
          ? "Passed"
          : patch.result === "Partial Pass"
            ? "Partial Pass"
            : "Failed";
      gr.status = patch.result === "Fail" ? "Partial" : "Ready for Put Away";
      gr.updated = now;
      decorateGRs();
    }

    decorateQCs();
    saved(ctx, {
      title: existing ? "บันทึกผลตรวจแล้ว" : "สร้างใบตรวจ QC แล้ว",
      message: decided
        ? `${code} — ผล ${patch.result}${patch.ncrRef ? ` · ${patch.ncrRef}` : ""}`
        : `${code} — อยู่ระหว่างตรวจ`,
      goto: `/m/qc-inspection/${encodeURIComponent(code)}`,
    });
  },
};
