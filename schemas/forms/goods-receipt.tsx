import {
  GR_DISCREPANCY,
  GR_NONPO_REASONS,
  GR_PKG_CONDITION,
  GR_RECEIVERS,
  GR_WAREHOUSES,
} from "@/data/goods-receipts";
import { QC_INSPECTORS } from "@/data/qc";
import { OPT } from "@/data/options";
import { PRODUCTS } from "@/lib/domain/product";
import { PURCHASE_ORDERS, getPO } from "@/lib/domain/purchase";
import {
  GOODS_RECEIPTS,
  decorateGRs,
  grItemFinalRecv,
  grItemRemaining,
  grItemVariance,
  grProductControls,
  grTotalReceiving,
  nextGRCode,
  type GrRow,
} from "@/lib/domain/inbound";
import { fmt, stamp, toDisplayDate, toInputDate, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import {
  FORM_USER,
  RailCard,
  RailRow,
  RailTotal,
  opts,
  saved,
} from "./common";

/* ============================================================
   GOODS RECEIPT FORM

   Receiving is the point where a document becomes stock, so this
   is the one form that asks for confirmation before committing:
   goods needing QC land in QC Hold and are NOT available yet.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isPoBased = (s: { type?: string }) => s.type !== "Non-PO";
const needsQc = (s: { items?: GridRow[] }) =>
  ((s.items ?? []) as GridRow[]).some((it) => it.qc);

/** Open POs are the only sensible thing to receive against. */
const openPOs = () =>
  PURCHASE_ORDERS.filter((p) => ["Open", "Partial Received"].includes(p.status));

export const GR_FORM: FormSchema<GrRow> = {
  key: "goods-receipt",
  entityLabel: "Goods Receipt",
  saveButton: "Post Goods Receipt",
  statusBadge: {
    Draft: "neutral",
    Waiting: "info",
    Partial: "warning",
    "Pending QC": "warning",
    "Ready for Put Away": "info",
    Completed: "success",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextGRCode(),
    type: "PO Based",
    poRef: "",
    supplier: "",
    warehouse: GR_WAREHOUSES[0],
    receiptDate: toInputDate(today()),
    expectedDate: "",
    receiver: "",
    status: "Draft",
    qcStatus: "Not Required",
    discrepancy: "None",
    deliveryNote: "",
    invoiceRef: "",
    transporter: "",
    driver: "",
    vehicle: "",
    dock: "",
    packages: 0,
    pkgCondition: "Good",
    seal: "",
    remark: "",
    nonPoReason: "",
    items: [],
    qc: {
      type: "Incoming Inspection",
      plan: "AQL 2.5",
      inspector: "",
      dueDate: "",
      qcWh: "WH-QC Quality Hold",
      claimWh: "WH-CLAIM Claim Warehouse",
    },
  }),

  toState: (gr) => ({
    _mode: "edit",
    code: gr.code,
    type: gr.type,
    poRef: gr.poRef,
    supplier: gr.supplier,
    warehouse: gr.warehouse,
    receiptDate: toInputDate(gr.receiptDate),
    expectedDate: toInputDate(gr.expectedDate),
    receiver: gr.receiver,
    status: gr.status,
    qcStatus: gr.qcStatus,
    discrepancy: gr.discrepancy,
    deliveryNote: gr.deliveryNote,
    invoiceRef: gr.invoiceRef,
    transporter: gr.transporter,
    driver: gr.driver,
    vehicle: gr.vehicle,
    dock: gr.dock,
    packages: gr.packages,
    pkgCondition: gr.pkgCondition,
    seal: gr.seal,
    remark: gr.remark,
    nonPoReason: gr.nonPoReason ?? "",
    /* Lot and serial detail is captured on the QC and Put Away steps, not here. */
    items: (gr.items ?? []).map(({ lots, serials, ...rest }) => ({ ...rest })),
    qc: { ...gr.qc, dueDate: toInputDate(gr.qc?.dueDate) },
  }),

  steps: [
    /* ---------- 1. HEADER ---------- */
    {
      key: "header",
      label: "Receipt",
      railLabel: "ข้อมูลการรับ",
      labelTh: "อ้างอิงใบสั่งซื้อและคลัง",
      blocks: (s) => [
        {
          type: "card",
          title: "Receipt Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "GR Number" },
            {
              type: "select",
              path: "type",
              label: "Receipt Type",
              required: true,
              options: ["PO Based", "Non-PO"],
              hint: "Non-PO ใช้กับของแถม ตัวอย่าง หรือของทดแทน",
            },
            {
              type: "select",
              path: "poRef",
              label: "Purchase Order",
              required: true,
              options: openPOs().map((p) => p.code),
              when: isPoBased,
              hint: "เลือกใบสั่งซื้อแล้วระบบจะดึงรายการที่ค้างรับมาให้",
            },
            {
              type: "select",
              path: "nonPoReason",
              label: "Non-PO Reason",
              required: true,
              options: opts(GR_NONPO_REASONS),
              when: (st) => !isPoBased(st),
            },
            {
              type: "select",
              path: "supplier",
              label: "Supplier",
              required: true,
              options: opts(OPT.supplier),
              readonly: isPoBased(s) && Boolean(s.poRef),
            },
            {
              type: "select",
              path: "warehouse",
              label: "Receiving Warehouse",
              required: true,
              options: opts(GR_WAREHOUSES),
            },
            { type: "date", path: "receiptDate", label: "Receipt Date", required: true },
            { type: "date", path: "expectedDate", label: "Expected Date" },
            {
              type: "select",
              path: "receiver",
              label: "Receiver",
              required: true,
              options: opts(GR_RECEIVERS),
            },
          ],
        },
      ],
    },

    /* ---------- 2. DELIVERY ---------- */
    {
      key: "delivery",
      label: "Delivery",
      railLabel: "การจัดส่ง",
      labelTh: "รถ คนขับ และสภาพหีบห่อ",
      blocks: () => [
        {
          type: "card",
          title: "Documents",
          cols: "3",
          fields: [
            {
              type: "text",
              path: "deliveryNote",
              label: "Delivery Note No.",
              required: true,
              placeholder: "DN-2506-0123",
            },
            { type: "text", path: "invoiceRef", label: "Invoice Reference" },
            { type: "text", path: "dock", label: "Receiving Dock", placeholder: "Dock 2" },
          ],
        },
        {
          type: "card",
          title: "Transport",
          cols: "3",
          fields: [
            { type: "text", path: "transporter", label: "Transporter" },
            { type: "text", path: "driver", label: "Driver" },
            { type: "text", path: "vehicle", label: "Vehicle Plate", placeholder: "1กก-1234" },
            { type: "number", path: "packages", label: "Packages", min: 0 },
            {
              type: "select",
              path: "pkgCondition",
              label: "Package Condition",
              required: true,
              options: opts(GR_PKG_CONDITION),
            },
            { type: "text", path: "seal", label: "Seal Number" },
          ],
        },
      ],
    },

    /* ---------- 3. LINES ---------- */
    {
      key: "items",
      label: "Items",
      railLabel: "รายการรับ",
      labelTh: "จำนวนที่รับจริง",
      blocks: (s) => [
        {
          type: "grid",
          path: "items",
          label: "Received Lines",
          required: true,
          addLabel: isPoBased(s) ? "เพิ่มรายการนอกใบสั่งซื้อ" : "เพิ่มรายการที่รับ",
          empty: isPoBased(s)
            ? "เลือกใบสั่งซื้อในขั้นตอนแรกเพื่อดึงรายการที่ค้างรับ"
            : "ยังไม่มีรายการ — ค้นหาสินค้าในช่อง Product",
          hint: "รับเกินจำนวนที่ค้างได้ แต่ต้องระบุสาเหตุความคลาดเคลื่อน",
          cols: [
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "150px",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "180px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "64px" },
            {
              key: "ordered",
              label: "Ordered",
              type: "static",
              align: "right",
              muted: true,
              width: "80px",
            },
            {
              key: "remaining",
              label: "ค้างรับ",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => fmt(grItemRemaining(r)),
            },
            {
              key: "receiveNow",
              label: "Receive Now",
              type: "number",
              align: "right",
              required: true,
              width: "100px",
            },
            {
              key: "variance",
              label: "ส่วนต่าง",
              type: "computed",
              align: "right",
              get: (r) => {
                const v = grItemVariance(r);
                return v === 0 ? "—" : v > 0 ? `+${fmt(v)}` : fmt(v);
              },
              cls: (r) => (grItemVariance(r) !== 0 ? "font-semibold text-warning-text" : ""),
            },
            { key: "location", label: "Location", type: "text", width: "110px" },
            { key: "qc", label: "QC", type: "check", width: "50px" },
            {
              key: "disc",
              label: "Discrepancy",
              type: "select",
              options: opts(GR_DISCREPANCY),
              width: "150px",
            },
          ],
        },
        {
          type: "card",
          title: "Overall",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "discrepancy",
              label: "Overall Discrepancy",
              required: true,
              options: opts(GR_DISCREPANCY),
            },
            { type: "textarea", path: "remark", label: "Remark", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 4. QC ROUTING ---------- */
    {
      key: "qc",
      label: "QC Routing",
      railLabel: "การตรวจสอบ",
      labelTh: "ผู้ตรวจและคลังพักตรวจ",
      when: needsQc,
      blocks: () => [
        {
          type: "note",
          label: "สินค้าที่ติ๊ก QC จะเข้าคลังพักตรวจ ไม่นับเป็นสต๊อกพร้อมขาย",
          text: "สต๊อกจะพร้อมใช้งานหลังผ่าน QC และจัดเก็บ (Put Away) เท่านั้น",
        },
        {
          type: "card",
          title: "Inspection Plan",
          cols: "3",
          fields: [
            {
              type: "text",
              path: "qc.type",
              label: "Inspection Type",
              placeholder: "Incoming Inspection",
            },
            { type: "text", path: "qc.plan", label: "Sampling Plan", placeholder: "AQL 2.5" },
            {
              type: "select",
              path: "qc.inspector",
              label: "Inspector",
              required: true,
              options: opts(QC_INSPECTORS),
            },
            { type: "date", path: "qc.dueDate", label: "Due Date", required: true },
            { type: "text", path: "qc.qcWh", label: "QC Hold Warehouse", readonly: true },
            { type: "text", path: "qc.claimWh", label: "Claim Warehouse", readonly: true },
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
    { path: "type", label: "Receipt Type", step: "header" },
    {
      path: "poRef",
      label: "Purchase Order",
      step: "header",
      test: (s) => !isPoBased(s) || Boolean(s.poRef),
    },
    {
      path: "nonPoReason",
      label: "Non-PO Reason",
      step: "header",
      test: (s) => isPoBased(s) || Boolean(s.nonPoReason),
    },
    { path: "supplier", label: "Supplier", step: "header" },
    { path: "warehouse", label: "Receiving Warehouse", step: "header" },
    { path: "receiptDate", label: "Receipt Date", step: "header" },
    { path: "receiver", label: "Receiver", step: "header" },
    { path: "deliveryNote", label: "Delivery Note No.", step: "delivery" },
    { path: "pkgCondition", label: "Package Condition", step: "delivery" },
    { path: "discrepancy", label: "Overall Discrepancy", step: "items" },
    {
      path: "items",
      label: "รายการที่รับอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.receiveNow) > 0),
    },
    { path: "qc.inspector", label: "Inspector", step: "qc" },
    { path: "qc.dueDate", label: "QC Due Date", step: "qc" },
  ],

  rules: [
    {
      label: "จำนวนที่รับต้องไม่ติดลบ",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.receiveNow) >= 0),
    },
    {
      label: "การรับเกินจำนวนที่ค้างต้องระบุสาเหตุความคลาดเคลื่อนในบรรทัดนั้น",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => grItemVariance(r) <= 0 || Boolean(String(r.disc ?? "").trim()),
        ),
    },
    {
      label: "เมื่อมีบรรทัดที่คลาดเคลื่อน สรุปความคลาดเคลื่อนต้องไม่เป็น None",
      step: "items",
      test: (s) => {
        const rows = (s.items ?? []) as GridRow[];
        const anyDisc = rows.some((r) => r.disc && r.disc !== "None");
        return !anyDisc || s.discrepancy !== "None";
      },
    },
    {
      label: "หีบห่อที่เสียหายต้องระบุความคลาดเคลื่อนและหมายเหตุ",
      step: "items",
      test: (s) =>
        s.pkgCondition === "Good" ||
        (s.discrepancy !== "None" && Boolean(String(s.remark ?? "").trim())),
    },
  ],

  lookup: {
    product: (q): LookupHit[] => {
      const t = q.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) => !t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t),
      )
        .slice(0, 20)
        .map((p) => ({ code: p.code, name: p.name, meta: p.unit }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const row = ((s[path] ?? []) as GridRow[])[index];
    if (!row) return;
    const p = PRODUCTS.find((x) => x.code === hit.code);
    const ctl = grProductControls(hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.unit = p?.unit ?? "";
    row.qc = ctl.qc;
    row.lot = ctl.lot;
    row.serial = ctl.serial;
    row.expiry = ctl.expiry;
  },

  /** Choosing the PO is what makes this a receipt rather than a blank form. */
  onChange: (path, s) => {
    if (path !== "poRef" && path !== "type") return;

    if (path === "type" && !isPoBased(s)) {
      s.poRef = "";
      return;
    }

    const po = getPO(String(s.poRef ?? ""));
    if (!po) return;

    s.supplier = po.supplier;
    s.expectedDate = toInputDate(po.expectedDate);
    if (po.warehouse) s.warehouse = po.warehouse;

    s.items = (po.items ?? [])
      .filter((it) => num(it.qty) - num(it.recv) > 0)
      .map((it, i) => {
        const ctl = grProductControls(it.code);
        return {
          line: i + 1,
          code: it.code,
          name: it.name,
          unit: it.unit,
          ordered: num(it.qty),
          prevRecv: num(it.recv),
          receiveNow: num(it.qty) - num(it.recv),
          accepted: 0,
          rejected: 0,
          warehouse: po.warehouse,
          location: "",
          qc: ctl.qc,
          lot: ctl.lot,
          serial: ctl.serial,
          expiry: ctl.expiry,
          disc: "",
        };
      });
  },

  newRow: () => ({
    line: 0,
    code: "",
    name: "",
    unit: "",
    ordered: 0,
    prevRecv: 0,
    receiveNow: "",
    accepted: 0,
    rejected: 0,
    location: "",
    qc: false,
    disc: "",
  }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const qcLines = rows.filter((r) => r.qc).length;
    return (
      <RailCard icon="goodsReceipt" title="Receipt Preview" tone="accent">
        <RailRow label="เลขที่ใบรับ" value={String(s.code ?? "")} />
        <RailRow label="อ้างอิง" value={String(s.poRef ?? "") || String(s.nonPoReason ?? "—")} />
        <RailRow label="จำนวนบรรทัด" value={rows.length} />
        <RailRow label="ต้องตรวจ QC" value={`${qcLines} บรรทัด`} tone={qcLines ? "warn" : "ok"} />
        <RailTotal label="รับเข้าทั้งหมด" value={fmt(grTotalReceiving({ items: rows }))} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const over = rows.filter((r) => grItemVariance(r) > 0);
    const short = rows.filter((r) => grItemVariance(r) < 0);
    const qcLines = rows.filter((r) => r.qc);

    return (
      <RailCard
        icon="alert"
        title="Receiving Check"
        tone={over.length || s.pkgCondition !== "Good" ? "warn" : "default"}
      >
        <RailRow label="รับครบพอดี" value={`${rows.length - over.length - short.length} บรรทัด`} tone="ok" />
        <RailRow label="รับเกิน" value={`${over.length} บรรทัด`} tone={over.length ? "warn" : undefined} />
        <RailRow label="รับขาด" value={`${short.length} บรรทัด`} />
        <RailRow label="สภาพหีบห่อ" value={String(s.pkgCondition ?? "")} tone={s.pkgCondition === "Good" ? "ok" : "warn"} />
        {qcLines.length > 0 && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            {qcLines.length} บรรทัดจะถูกรับเข้า {String(s.qc?.qcWh ?? "คลังพักตรวจ")} —
            ยังไม่นับเป็นสต๊อกพร้อมขายจนกว่าจะผ่าน QC และจัดเก็บ
          </p>
        )}
        {short.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            ใบสั่งซื้อจะยังคงสถานะ Partial Received เพราะยังรับไม่ครบ
          </p>
        )}
      </RailCard>
    );
  },

  /* Receiving moves real stock, so it asks before it commits. */
  beforeSave: (s, proceed, ctx) => {
    const rows = (s.items ?? []) as GridRow[];
    const totalQty = grTotalReceiving({ items: rows });
    const qcLines = rows.filter((r) => r.qc).length;

    ctx.confirm({
      title: "บันทึกการรับของ?",
      message: (
        <>
          รับเข้า <strong>{fmt(totalQty)}</strong> หน่วย จาก {rows.length} รายการ เข้าคลัง{" "}
          <strong>{String(s.warehouse ?? "")}</strong>
          {qcLines > 0 && (
            <>
              <br />
              {qcLines} รายการต้องตรวจ QC ก่อน — สินค้าจะยังไม่พร้อมใช้งานจนกว่าจะจัดเก็บ
            </>
          )}
        </>
      ),
      confirmText: "บันทึกการรับของ",
      tone: "primary",
      onConfirm: proceed,
    });
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = GOODS_RECEIPTS.find((g) => g.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        ordered: num(r.ordered),
        prevRecv: num(r.prevRecv),
        receiveNow: num(r.receiveNow),
        /* QC lines stay unaccepted until the inspection decides. */
        accepted: r.qc ? 0 : num(r.receiveNow),
        rejected: 0,
        warehouse: String(s.warehouse ?? ""),
        location: String(r.location ?? ""),
        qc: Boolean(r.qc),
        lot: Boolean(r.lot),
        serial: Boolean(r.serial),
        expiry: Boolean(r.expiry),
        lots: [],
        serials: [],
        disc: String(r.disc ?? ""),
      }));

    const anyQc = items.some((it) => it.qc);
    const fullyReceived = items.every((it) => grItemFinalRecv(it) >= it.ordered);

    const patch = {
      type: String(s.type ?? "PO Based"),
      poRef: String(s.poRef ?? ""),
      supplier: String(s.supplier ?? ""),
      warehouse: String(s.warehouse ?? ""),
      receiptDate: toDisplayDate(s.receiptDate),
      expectedDate: toDisplayDate(s.expectedDate),
      receiver: String(s.receiver ?? ""),
      discrepancy: String(s.discrepancy ?? "None"),
      deliveryNote: String(s.deliveryNote ?? ""),
      invoiceRef: String(s.invoiceRef ?? ""),
      transporter: String(s.transporter ?? ""),
      driver: String(s.driver ?? ""),
      vehicle: String(s.vehicle ?? ""),
      dock: String(s.dock ?? ""),
      packages: num(s.packages),
      pkgCondition: String(s.pkgCondition ?? "Good"),
      seal: String(s.seal ?? ""),
      remark: String(s.remark ?? ""),
      nonPoReason: String(s.nonPoReason ?? ""),
      items,
      qc: { ...(s.qc ?? {}), dueDate: toDisplayDate(s.qc?.dueDate) },
      qcStatus: anyQc ? "Pending" : "Not Required",
      status: anyQc ? "Pending QC" : fullyReceived ? "Ready for Put Away" : "Partial",
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Goods receipt updated",
        d: "แก้ไขใบรับของจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      GOODS_RECEIPTS.unshift({
        code,
        ...patch,
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Goods received",
            d: `รับเข้า ${fmt(grTotalReceiving({ items }))} หน่วย จาก ${items.length} รายการ`,
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as GrRow);
    }

    /* Hand the received quantities back to the purchase order. */
    const po = getPO(patch.poRef);
    if (po) {
      for (const it of items) {
        const line = (po.items ?? []).find((x) => x.code === it.code);
        if (line) line.recv = num(line.recv) + it.receiveNow;
      }
      const done = (po.items ?? []).every((x) => num(x.recv) >= num(x.qty));
      po.status = done ? "Completed" : "Partial Received";
      po.updated = now;
      po.updatedBy = FORM_USER();
    }

    decorateGRs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "บันทึกการรับของแล้ว",
      message: anyQc
        ? `${code} — ส่งตรวจ QC ก่อนจัดเก็บ`
        : `${code} — พร้อมจัดเก็บเข้าคลัง`,
      goto: `/m/goods-receipt/${encodeURIComponent(code)}`,
    });
  },
};
