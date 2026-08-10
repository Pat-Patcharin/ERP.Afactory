import type { SalesReturn } from "@/data/sales-returns";
import {
  RTN_CONDITIONS,
  RTN_METHODS,
  RTN_PRIORITY,
  RTN_REASONS,
  RTN_RESOLUTIONS,
  RTN_SOURCE_TYPES,
  RTN_TYPES,
  RTN_WAREHOUSES,
} from "@/data/sales-returns";
import { INV_BRANCHES } from "@/data/sales-invoices";
import { PRODUCTS } from "@/lib/domain/product";
import {
  SALES_RETURNS,
  decorateReturns,
  duplicateSerials,
  headerFromReturnSource,
  lineCredit,
  nextReturnCode,
  remainingReturnable,
  returnSourceOptions,
  returnableLinesFrom,
  serialMismatches,
  submitReadiness,
  type RtnRow,
} from "@/lib/domain/sales-return";
import { fmt, money, money0, stamp, isoToDmy, dmyToIso, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, RailTotal, ReviewCard, opts, saved } from "./common";
import { catalogPrice } from "@/lib/domain/pricing";

/* ============================================================
   SALES RETURN FORM

   Create Return Request and Create From Source are the same form:
   step 1 picks the source document and pulls the returnable lines,
   already netted against what earlier returns claimed.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const isManual = (s: { sourceType?: string }) => s.sourceType === "Manual";

const overReturn = (r: GridRow) => num(r.requestedQty) > remainingReturnable(r);

const draftCredit = (rows: GridRow[]) =>
  Math.round(rows.reduce((t, r) => t + num(r.requestedQty) * num(r.unitPrice), 0) * 100) / 100;

export const RTN_FORM: FormSchema<RtnRow> = {
  key: "sales-return",
  entityLabel: "Return Request",
  saveButton: "Save Draft",
  titleField: "customer",
  statusBadge: {
    Draft: "neutral",
    "Pending Approval": "warning",
    Approved: "success",
    "Partially Approved": "warning",
    "Waiting Return": "info",
    "Partially Received": "warning",
    Received: "success",
    "Pending QC": "warning",
    "QC Completed": "success",
    "Disposition Pending": "warning",
    "Disposition Completed": "success",
    "Credit Note Pending": "warning",
    Credited: "success",
    Closed: "neutral",
    Rejected: "danger",
    Cancelled: "neutral",
  },

  /* Rule 15: once goods physically arrive the document is read-only. */
  editGuard: (r) =>
    ["Draft", "Rejected"].includes(r.status)
      ? null
      : `${r.code} อยู่ในสถานะ ${r.status} — ` +
        (["Received", "Partially Received", "Pending QC", "QC Completed"].includes(r.status)
          ? "รับสินค้าคืนแล้ว แก้จำนวนไม่ได้ ต้องใช้ Record Exception หรือปรับผ่าน QC แทน"
          : ["Cancelled", "Closed", "Credited"].includes(r.status)
            ? "คำขอคืนที่ปิดหรือยกเลิกแล้วเป็นเอกสารอ่านอย่างเดียว"
            : "คำขอที่อนุมัติหรือออก RMA แล้วต้องขอแก้ไขผ่านการ Reject กลับเป็นร่างก่อน"),

  blank: () => ({
    _mode: "create",
    code: nextReturnCode(),
    rmaNo: "",
    sourceType: "Shipment",
    sourceDoc: "",
    shipmentRef: "",
    invoiceRef: "",
    soRef: "",
    customer: "",
    customerCode: "",
    customerGroup: "",
    contactPerson: "",
    contactPhone: "",
    email: "",
    pickupAddress: "",
    salesRep: "",
    returnDate: dmyToIso(today()),
    returnType: "",
    returnReason: "",
    priority: "Normal",
    branch: "Head Office",
    returnWarehouse: "Return Center",
    customerRef: "",
    status: "Draft",
    approvalStatus: "Not Submitted",
    receivingStatus: "Not Applicable",
    qcStatus: "Not Applicable",
    dispositionStatus: "Not Applicable",
    creditNoteStatus: "Not Applicable",
    returnMethod: "Customer Ships Back",
    pickupRequired: false,
    requestedResolution: "Credit Note",
    originalInvoiceDate: "",
    originalAmount: 0,
    note: "",
    items: [],
  }),

  toState: (r) => ({
    _mode: "edit",
    code: r.code,
    rmaNo: r.rmaNo,
    sourceType: r.sourceType,
    sourceDoc: r.sourceDoc,
    shipmentRef: r.shipmentRef,
    invoiceRef: r.invoiceRef,
    soRef: r.soRef,
    customer: r.customer,
    customerCode: r.customerCode,
    customerGroup: r.customerGroup,
    contactPerson: r.contactPerson,
    contactPhone: r.contactPhone,
    email: r.email,
    pickupAddress: r.pickupAddress,
    salesRep: r.salesRep,
    returnDate: dmyToIso(r.returnDate),
    returnType: r.returnType,
    returnReason: r.returnReason,
    priority: r.priority,
    branch: r.branch,
    returnWarehouse: r.returnWarehouse,
    customerRef: r.customerRef,
    status: r.status,
    approvalStatus: r.approvalStatus,
    receivingStatus: r.receivingStatus,
    qcStatus: r.qcStatus,
    dispositionStatus: r.dispositionStatus,
    creditNoteStatus: r.creditNoteStatus,
    returnMethod: r.returnMethod,
    pickupRequired: r.pickupRequired,
    requestedResolution: r.requestedResolution,
    originalInvoiceDate: r.originalInvoiceDate,
    originalAmount: r.originalAmount,
    note: r.note,
    items: (r.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. SOURCE DOCUMENT ---------- */
    {
      key: "source",
      label: "Source Document",
      railLabel: "Source Document",
      labelTh: "เอกสารต้นทาง",
      blocks: (s) => [
        {
          type: "note",
          label: "ของที่รับคืนไม่เข้าสต๊อกพร้อมขายทันที",
          text: "สินค้าจะเข้าคลังรับคืน / QC Hold ก่อน แล้วจึงกลายเป็นสต๊อกขายได้เมื่อ QC รับและยืนยัน Disposition — คำขอคืนนี้ไม่ออกใบลดหนี้ให้อัตโนมัติ",
        },
        {
          type: "card",
          title: "Create From Source",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Return Number" },
            {
              type: "select",
              path: "sourceType",
              label: "Source Type",
              required: true,
              options: opts(RTN_SOURCE_TYPES),
              hint: "เลือก Manual หากลูกค้าคืนโดยไม่อ้างอิงเอกสารใด",
            },
            {
              type: "select",
              path: "sourceDoc",
              label: "Source Document",
              required: true,
              options: returnSourceOptions(String(s.sourceType ?? "")).map((o) => o.code),
              when: (st) => !isManual(st),
              hint: "เลือกเอกสารแล้วระบบจะดึงบรรทัดที่ยังคืนได้มาให้",
            },
            {
              type: "static",
              label: "Source Summary",
              span: true,
              value: (st) => {
                if (isManual(st)) return "คำขอคืนแบบ Manual — ไม่อ้างอิงเอกสารต้นทาง";
                if (!st.sourceDoc) return "ยังไม่ได้เลือกเอกสารต้นทาง";
                const rows = (st.items ?? []) as GridRow[];
                const open = rows.filter((r) => remainingReturnable(r) > 0).length;
                return `${st.sourceDoc} · ดึงมา ${rows.length} บรรทัด · ยังคืนได้ ${open} บรรทัด`;
              },
            },
          ],
        },
      ],
    },

    /* ---------- 2. RETURN INFORMATION ---------- */
    {
      key: "info",
      label: "Return Information",
      railLabel: "Return Information",
      labelTh: "ประเภทและเหตุผลการคืน",
      blocks: () => [
        {
          type: "card",
          title: "Return Information",
          cols: "3",
          fields: [
            { type: "date", path: "returnDate", label: "Return Date", required: true },
            { type: "select", path: "returnType", label: "Return Type", required: true, options: opts(RTN_TYPES) },
            { type: "select", path: "priority", label: "Priority", required: true, options: opts(RTN_PRIORITY) },
            {
              type: "select",
              path: "returnReason",
              label: "Return Reason",
              required: true,
              options: opts(RTN_REASONS),
            },
            { type: "static", path: "rmaNo", label: "RMA Number", value: (s) => String(s.rmaNo ?? "") || "ออกให้ตอน Authorize" },
            { type: "text", path: "salesRep", label: "Sales Representative" },
            { type: "select", path: "branch", label: "Branch", options: opts(INV_BRANCHES) },
            {
              type: "select",
              path: "returnWarehouse",
              label: "Return Warehouse",
              required: true,
              options: opts(RTN_WAREHOUSES),
              hint: "คลังที่จะรับของคืนเข้ามาพักไว้",
            },
            { type: "text", path: "customerRef", label: "Customer Reference" },
          ],
        },
      ],
    },

    /* ---------- 3. CUSTOMER ---------- */
    {
      key: "customer",
      label: "Customer",
      railLabel: "Customer",
      labelTh: "ลูกค้าและที่อยู่รับของ",
      blocks: () => [
        {
          type: "card",
          title: "Customer",
          cols: "3",
          fields: [
            { type: "text", path: "customer", label: "Customer Name", required: true },
            { type: "static", path: "customerCode", label: "Customer Code" },
            { type: "static", path: "customerGroup", label: "Customer Group" },
            { type: "text", path: "contactPerson", label: "Contact Person" },
            { type: "text", path: "contactPhone", label: "Contact Phone" },
            { type: "text", path: "email", label: "Email" },
            {
              type: "textarea",
              path: "pickupAddress",
              label: "Return Pickup Address",
              span: true,
              rows: 2,
            },
          ],
        },
      ],
    },

    /* ---------- 4. RETURN ITEMS ---------- */
    {
      key: "items",
      label: "Return Items",
      railLabel: "Return Items",
      labelTh: "รายการที่ขอคืน",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Return Items",
          required: true,
          addLabel: "เพิ่มบรรทัด",
          empty: "เลือกเอกสารต้นทางในขั้นแรก หรือค้นหาสินค้าที่นี่",
          hint: "Remaining Returnable = Shipped Qty − Previously Returned Qty",
          cols: [
            { key: "line", label: "#", type: "static", align: "right", muted: true, width: "42px" },
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "150px",
              placeholder: "ค้นหาสินค้า...",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "160px" },
            { key: "sourceLine", label: "Src Line", type: "static", align: "right", muted: true, width: "70px" },
            { key: "shippedQty", label: "Shipped", type: "static", align: "right", muted: true, width: "76px" },
            { key: "prevReturnedQty", label: "Prev. Returned", type: "static", align: "right", muted: true, width: "100px" },
            {
              key: "remaining",
              label: "Remaining",
              type: "computed",
              align: "right",
              get: (r) => fmt(remainingReturnable(r)),
              cls: (r) => (remainingReturnable(r) === 0 ? "text-ink-3" : ""),
            },
            { key: "requestedQty", label: "Requested Qty", type: "number", align: "right", required: true, width: "105px" },
            {
              key: "over",
              label: "เกิน",
              type: "computed",
              align: "right",
              get: (r) => {
                const over = num(r.requestedQty) - remainingReturnable(r);
                return over > 0 ? fmt(over) : "—";
              },
              cls: (r) => (overReturn(r) ? "font-semibold text-danger" : ""),
            },
            { key: "unit", label: "UOM", type: "static", muted: true, width: "58px" },
            { key: "serial", label: "Serial Number", type: "text", width: "150px" },
            { key: "lot", label: "Lot Number", type: "text", width: "130px" },
            { key: "expiry", label: "Expiry", type: "date", width: "130px" },
            { key: "condition", label: "Product Condition", type: "select", options: opts(RTN_CONDITIONS), width: "150px" },
            { key: "reason", label: "Return Reason", type: "select", options: opts(RTN_REASONS), width: "180px" },
            { key: "unitPrice", label: "Unit Price", type: "number", align: "right", width: "105px" },
            {
              key: "credit",
              label: "Estimated Credit",
              type: "computed",
              align: "right",
              get: (r) => money(num(r.requestedQty) * num(r.unitPrice)),
            },
            {
              key: "sealOpened",
              label: "ซีลเปิด",
              type: "check",
              align: "right",
              width: "72px",
            },
            { key: "note", label: "Notes", type: "text", width: "130px" },
          ],
        },
        {
          type: "card",
          title: "Item Totals",
          cols: "4",
          fields: [
            { type: "static", label: "Total Items", value: (s) => fmt(((s.items ?? []) as GridRow[]).length) },
            {
              type: "static",
              label: "Requested Qty",
              value: (s) => fmt(((s.items ?? []) as GridRow[]).reduce((t, r) => t + num(r.requestedQty), 0)),
            },
            {
              type: "static",
              label: "Over-return Lines",
              value: (s) => fmt(((s.items ?? []) as GridRow[]).filter(overReturn).length),
            },
            {
              type: "static",
              label: "Estimated Credit",
              value: (s) => money(draftCredit((s.items ?? []) as GridRow[])),
            },
          ],
        },
      ],
    },

    /* ---------- 5. PICKUP ---------- */
    {
      key: "pickup",
      label: "Pickup / Return Delivery",
      railLabel: "Pickup / Return Delivery",
      labelTh: "วิธีนำของกลับ",
      blocks: () => [
        {
          type: "card",
          title: "Return Delivery",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "returnMethod",
              label: "Return Method",
              required: true,
              options: opts(RTN_METHODS),
            },
            {
              type: "toggle",
              path: "pickupRequired",
              label: "Pickup Required",
              onText: "เราไปรับของ",
              offText: "ลูกค้าส่งกลับเอง",
            },
            { type: "text", path: "contactPerson", label: "Pickup Contact" },
            {
              type: "note",
              label: "Expected Return Date กำหนดตอน Authorize",
              text: "วันที่คาดว่าจะได้รับของคืนและวันหมดอายุ RMA จะถูกกำหนดในขั้นตอน Authorize Return หลังคำขอผ่านการอนุมัติ",
              span: true,
            },
          ],
        },
      ],
    },

    /* ---------- 6. EVIDENCE ---------- */
    {
      key: "evidence",
      label: "Evidence and Attachments",
      railLabel: "Evidence and Attachments",
      labelTh: "หลักฐานประกอบ",
      blocks: () => [
        {
          type: "card",
          title: "Evidence",
          cols: "2",
          fields: [
            {
              type: "textarea",
              path: "note",
              label: "Customer Remark",
              span: true,
              rows: 3,
              placeholder: "รายละเอียดจากลูกค้า เช่น พบความเสียหายตอนเปิดกล่อง",
            },
            {
              type: "note",
              label: "Photo Evidence",
              text: "การอัปโหลดรูปถ่ายจะเปิดใช้พร้อมระบบจัดเก็บเอกสารในเฟสถัดไป — สินค้าที่ระบุสภาพ Damaged หรือ Defective ควรมีรูปประกอบ",
            },
          ],
        },
      ],
    },

    /* ---------- 7. REQUESTED RESOLUTION ---------- */
    {
      key: "resolution",
      label: "Requested Resolution",
      railLabel: "Requested Resolution",
      labelTh: "วิธีการชดเชยที่ขอ",
      blocks: () => [
        {
          type: "card",
          title: "Requested Resolution",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "requestedResolution",
              label: "Requested Resolution",
              required: true,
              options: opts(RTN_RESOLUTIONS),
              hint: "เลือก Credit Note หากลูกค้าขอลดหนี้ — ใบลดหนี้จะออกเป็นเอกสารแยกหลังอนุมัติ",
            },
            {
              type: "note",
              label: "Replacement / Exchange",
              text: "หากเลือก Replacement หรือ Exchange จะมีปุ่ม Create Replacement Sales Order ในหน้ารายละเอียด — การจัดส่งจริงทำผ่านโมดูล Sales Order",
            },
          ],
        },
      ],
    },

    /* ---------- 8. SUMMARY ---------- */
    {
      key: "review",
      label: "Summary",
      railLabel: "Summary",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "sourceType", label: "Source Type", step: "source" },
    {
      path: "sourceDoc",
      label: "Source Document",
      step: "source",
      test: (s) => isManual(s) || Boolean(String(s.sourceDoc ?? "").trim()),
    },
    { path: "returnDate", label: "Return Date", step: "info" },
    { path: "returnType", label: "Return Type", step: "info" },
    { path: "returnReason", label: "Return Reason", step: "info" },
    { path: "priority", label: "Priority", step: "info" },
    { path: "returnWarehouse", label: "Return Warehouse", step: "info" },
    { path: "customer", label: "Customer", step: "customer" },
    {
      path: "items",
      label: "รายการที่ขอคืนอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => num(r.requestedQty) > 0),
    },
    { path: "returnMethod", label: "Return Method", step: "pickup" },
    { path: "requestedResolution", label: "Requested Resolution", step: "resolution" },
  ],

  rules: [
    {
      label: "ทุกบรรทัดต้องเลือกสินค้าที่มีอยู่ในระบบ",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) =>
          PRODUCTS.some((p) => p.code === String(r.code ?? "").trim()),
        ),
    },
    {
      label: "จำนวนที่ขอคืนต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.requestedQty) > 0),
    },
    {
      label: "จำนวนที่ขอคืนต้องไม่เกินจำนวนคงเหลือที่คืนได้",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => !overReturn(r)),
    },
    {
      label: "ราคาต่อหน่วยต้องไม่ติดลบ",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.unitPrice) >= 0),
    },
    {
      label: "ห้ามมี Serial Number ซ้ำในคำขอเดียวกัน",
      step: "items",
      test: (s) => duplicateSerials({ items: (s.items ?? []) as never }).length === 0,
    },
    {
      label: "สินค้าที่ระบุสภาพชำรุดต้องระบุเหตุผลการคืนของบรรทัดนั้น",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) =>
            !["Damaged", "Defective"].includes(String(r.condition)) ||
            Boolean(String(r.reason ?? "").trim()),
        ),
    },
    {
      label: "การเคลมประกันต้องระบุ Serial Number",
      step: "items",
      test: (s) =>
        s.returnType !== "Warranty Return" ||
        ((s.items ?? []) as GridRow[]).every((r) => Boolean(String(r.serial ?? "").trim())),
    },
    {
      label: "สินค้าที่ระบุว่าหมดอายุต้องกรอกวันหมดอายุ",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every(
          (r) => r.condition !== "Expired" || Boolean(String(r.expiry ?? "").trim()),
        ),
    },
  ],

  lookup: {
    product: (q): LookupHit[] => {
      const t = q.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) =>
          !t ||
          p.code.toLowerCase().includes(t) ||
          p.name.toLowerCase().includes(t) ||
          p.nameTh.includes(q.trim()),
      )
        .slice(0, 20)
        .map((p) => ({ code: p.code, name: p.name, meta: money0(catalogPrice(p.code)) }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const row = ((s[path] ?? []) as GridRow[])[index];
    if (!row) return;
    const p = PRODUCTS.find((x) => x.code === hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.unit = p?.unit ?? "";
    if (!num(row.unitPrice)) row.unitPrice = catalogPrice(hit.code);
    if (!num(row.requestedQty)) row.requestedQty = 1;
    /* Manual lines have no source, so everything they carry is returnable. */
    row.shippedQty = num(row.requestedQty);
    row.prevReturnedQty = 0;
    if (!row.condition) row.condition = "New / Unopened";
  },

  onChange: (path, s) => {
    if (path === "sourceType") {
      s.sourceDoc = "";
      s.items = [];
      return;
    }

    if (path === "sourceDoc") {
      const type = String(s.sourceType ?? "");
      const doc = String(s.sourceDoc ?? "");
      if (!doc) return;

      const head = headerFromReturnSource(type, doc);
      if (head) {
        s.customer = head.customer;
        s.customerCode = head.customerCode;
        s.contactPerson = head.contactPerson;
        s.contactPhone = head.contactPhone;
        s.pickupAddress = head.pickupAddress;
        s.salesRep = head.salesRep;
        s.shipmentRef = head.shipmentRef;
        s.invoiceRef = head.invoiceRef;
        s.soRef = head.soRef;
        s.customerRef = head.customerRef;
        s.originalInvoiceDate = head.originalInvoiceDate;
        s.originalAmount = head.originalAmount;
      }
      s.items = returnableLinesFrom(type, doc, String(s.code ?? "")).map((it) => ({ ...it }));
      return;
    }

    /* The header return type seeds any line that has no reason of its own. */
    if (path === "returnReason") {
      for (const r of (s.items ?? []) as GridRow[]) {
        if (!String(r.reason ?? "").trim()) r.reason = String(s.returnReason ?? "");
      }
    }
  },

  newRow: () => ({
    line: 0,
    code: "",
    name: "",
    sourceLine: 0,
    shippedQty: 0,
    prevReturnedQty: 0,
    requestedQty: "",
    approvedQty: 0,
    receivedQty: 0,
    inspectedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    holdQty: 0,
    unit: "",
    serial: "",
    lot: "",
    expiry: "",
    condition: "New / Unopened",
    reason: "",
    unitPrice: "",
    disposition: "",
    destWarehouse: "",
    destLocation: "",
    sealOpened: false,
    note: "",
  }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <RailCard icon="return" title="Return Preview" tone="accent">
        <RailRow label="เลขที่" value={String(s.code ?? "")} />
        <RailRow label="ลูกค้า" value={String(s.customer ?? "") || "ยังไม่ได้เลือก"} />
        <RailRow label="ต้นทาง" value={String(s.sourceDoc ?? "") || "Manual"} />
        <RailRow label="ประเภทการคืน" value={String(s.returnType ?? "") || "—"} />
        <RailRow label="จำนวนบรรทัด" value={rows.length} />
        <RailRow
          label="จำนวนที่ขอคืน"
          value={`${fmt(rows.reduce((t, r) => t + num(r.requestedQty), 0))} หน่วย`}
        />
        <RailTotal label="Estimated Credit (THB)" value={money(draftCredit(rows))} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const issues = submitReadiness({
      items: (s.items ?? []) as never,
      customer: String(s.customer ?? ""),
      returnType: String(s.returnType ?? ""),
      returnReason: String(s.returnReason ?? ""),
      returnWarehouse: String(s.returnWarehouse ?? ""),
      requestedResolution: String(s.requestedResolution ?? ""),
      shipmentRef: String(s.shipmentRef ?? ""),
      returnDate: String(s.returnDate ?? ""),
      originalInvoiceDate: String(s.originalInvoiceDate ?? ""),
    });
    const blocking = issues.filter((i) => i.blocking);
    const warnings = issues.filter((i) => !i.blocking);
    const mismatch = serialMismatches({
      shipmentRef: String(s.shipmentRef ?? ""),
      items: (s.items ?? []) as never,
    });

    if (!s.sourceDoc && !isManual(s)) {
      return (
        <RailCard icon="shield" title="Return Readiness">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกเอกสารต้นทางในขั้นแรก เพื่อตรวจว่าคำขอคืนนี้ส่งขออนุมัติได้หรือยัง
          </p>
        </RailCard>
      );
    }

    return (
      <RailCard icon="shield" title="Return Readiness" tone={blocking.length ? "warn" : "default"}>
        <RailRow
          label="สถานะความพร้อม"
          value={blocking.length ? `ติด ${blocking.length} เรื่อง` : "ส่งขออนุมัติได้"}
          tone={blocking.length ? "danger" : "ok"}
        />
        <RailRow label="บรรทัดทั้งหมด" value={((s.items ?? []) as GridRow[]).length} />
        <RailRow
          label="ขอคืนเกินสิทธิ์"
          value={`${((s.items ?? []) as GridRow[]).filter(overReturn).length} บรรทัด`}
          tone={((s.items ?? []) as GridRow[]).filter(overReturn).length ? "danger" : "ok"}
        />
        <RailRow label="Serial ไม่ตรงต้นทาง" value={`${mismatch.length} รายการ`} tone={mismatch.length ? "warn" : "ok"} />
        <RailRow label="ข้อควรระวัง" value={`${warnings.length} เรื่อง`} />
        {blocking.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-cap leading-relaxed text-warning-text">
            {blocking.slice(0, 5).map((b) => (
              <li key={b.label}>• {b.label}</li>
            ))}
          </ul>
        )}
        {blocking.length === 0 && warnings.length > 0 && (
          <p className="mt-3 text-cap leading-relaxed text-ink-2">
            {warnings.map((w) => w.label).join(" · ")}
          </p>
        )}
      </RailCard>
    );
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <>
        <ReviewCard title="Return & Customer">
          {row("Return Number", s.code, "source")}
          {row("Source Document", s.sourceDoc || "Manual", "source")}
          {row("Customer", s.customer, "customer")}
          {row("Return Date", isoToDmy(s.returnDate), "info")}
          {row("Return Type", s.returnType, "info")}
          {row("Return Reason", s.returnReason, "info")}
          {row("Return Warehouse", s.returnWarehouse, "info")}
          {row("Return Method", s.returnMethod, "pickup")}
          {row("Requested Resolution", s.requestedResolution, "resolution")}
        </ReviewCard>
        <ReviewCard title="Return Items">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-[9px] text-[13px] last:border-b-0"
            >
              <span className="font-medium tnum">{String(r.code ?? "—")}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{String(r.name ?? "")}</span>
              <span className="text-ink-2">{String(r.condition ?? "")}</span>
              <span className="tnum">
                {fmt(r.requestedQty)} {String(r.unit ?? "")}
              </span>
              <span className="w-24 text-right font-medium tnum">
                {money(num(r.requestedQty) * num(r.unitPrice))}
              </span>
            </div>
          ))}
          <div className="flex items-baseline gap-3 pt-3">
            <span className="text-[13px] font-semibold">Estimated Credit</span>
            <span className="ml-auto text-lg font-semibold tnum">{money(draftCredit(rows))}</span>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = SALES_RETURNS.find((x) => x.code === code);

    if (existing && !["Draft", "Rejected"].includes(existing.status)) {
      ctx.toast(
        "แก้ไขไม่ได้",
        `${code} อยู่ในสถานะ ${existing.status} — คำขอที่อนุมัติหรือรับของแล้วแก้ไขไม่ได้`,
        "warning",
      );
      return;
    }

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim() && num(r.requestedQty) > 0)
      .map((r, i) => ({
        line: i + 1,
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        sourceLine: num(r.sourceLine) || i + 1,
        shippedQty: num(r.shippedQty),
        prevReturnedQty: num(r.prevReturnedQty),
        requestedQty: num(r.requestedQty),
        approvedQty: num(r.approvedQty),
        receivedQty: num(r.receivedQty),
        inspectedQty: num(r.inspectedQty),
        acceptedQty: num(r.acceptedQty),
        rejectedQty: num(r.rejectedQty),
        holdQty: num(r.holdQty),
        unit: String(r.unit ?? ""),
        serial: String(r.serial ?? ""),
        lot: String(r.lot ?? ""),
        expiry: isoToDmy(r.expiry),
        condition: String(r.condition ?? "New / Unopened"),
        reason: String(r.reason ?? s.returnReason ?? ""),
        unitPrice: num(r.unitPrice),
        disposition: String(r.disposition ?? ""),
        destWarehouse: String(r.destWarehouse ?? ""),
        destLocation: String(r.destLocation ?? ""),
        sealOpened: Boolean(r.sealOpened),
        note: String(r.note ?? ""),
      }));

    const patch = {
      sourceType: String(s.sourceType ?? "Manual"),
      sourceDoc: String(s.sourceDoc ?? ""),
      shipmentRef: String(s.shipmentRef ?? ""),
      invoiceRef: String(s.invoiceRef ?? ""),
      soRef: String(s.soRef ?? ""),
      customer: String(s.customer ?? ""),
      customerCode: String(s.customerCode ?? ""),
      customerGroup: String(s.customerGroup ?? ""),
      contactPerson: String(s.contactPerson ?? ""),
      contactPhone: String(s.contactPhone ?? ""),
      email: String(s.email ?? ""),
      pickupAddress: String(s.pickupAddress ?? ""),
      salesRep: String(s.salesRep ?? ""),
      returnDate: isoToDmy(s.returnDate),
      returnType: String(s.returnType ?? ""),
      returnReason: String(s.returnReason ?? ""),
      priority: String(s.priority ?? "Normal"),
      branch: String(s.branch ?? ""),
      returnWarehouse: String(s.returnWarehouse ?? ""),
      customerRef: String(s.customerRef ?? ""),
      returnMethod: String(s.returnMethod ?? ""),
      pickupRequired: Boolean(s.pickupRequired),
      requestedResolution: String(s.requestedResolution ?? ""),
      originalInvoiceDate: String(s.originalInvoiceDate ?? ""),
      originalAmount: num(s.originalAmount),
      note: String(s.note ?? ""),
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Return request updated",
        d: "แก้ไขคำขอคืนจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
      (existing.audit ??= []).unshift({
        event: "Return edited",
        user: FORM_USER(),
        when: now,
        field: "items",
        from: `${existing.itemCount} lines`,
        to: `${items.length} lines`,
        kind: "info",
      });
    } else {
      const fresh: SalesReturn = {
        code,
        rmaNo: "",
        ...patch,
        /* Always Draft — submitting for approval is a separate, deliberate step,
           and no credit note is ever created here. */
        status: "Draft",
        approvalStatus: "Not Submitted",
        receivingStatus: "Not Applicable",
        qcStatus: "Not Applicable",
        dispositionStatus: "Not Applicable",
        creditNoteStatus: "Not Applicable",
        expectedReturnDate: "",
        authExpiryDate: "",
        returnInstructions: "",
        packingInstructions: "",
        authorizedBy: "",
        authorizedAt: "",
        replacementRef: "",
        creditNoteRef: "",
        supplierClaimRef: "",
        rejectReason: "",
        cancelReason: "",
        approvals: [],
        receiving: null,
        qc: null,
        exceptions: [],
        evidence: [],
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.sourceDoc ? `Created from ${patch.sourceDoc}` : "Return request created",
            d: patch.sourceDoc
              ? `สร้างคำขอคืนจาก${patch.sourceType} ${patch.sourceDoc}`
              : "สร้างคำขอคืนแบบ Manual",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
        audit: [
          { event: "Return created", user: FORM_USER(), when: now, field: "—", from: "—", to: "Draft", kind: "" },
        ],
      };
      SALES_RETURNS.unshift(fresh as RtnRow);
    }

    decorateReturns();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างคำขอคืนแล้ว",
      message: `${code} — ${items.length} บรรทัด · ${money0(draftCredit(items as unknown as GridRow[]))} THB`,
      goto: `/m/sales-return/${encodeURIComponent(code)}`,
    });
  },
};

export { lineCredit };
