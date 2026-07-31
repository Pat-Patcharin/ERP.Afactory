import { PO_BUYERS, PO_CURRENCIES, PO_INCOTERMS } from "@/data/purchase-orders";
import { PAY_TERMS } from "@/data/partners";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import {
  PO_SUPPLIERS,
  PURCHASE_ORDERS,
  decoratePOs,
  nextPOCode,
  poDiscTotal,
  poGrandTotal,
  poLineNet,
  poSubtotal,
  poSupplierInfo,
  poTaxTotal,
  type PoRow,
} from "@/lib/domain/purchase";
import { fmt, money, stamp, toDisplayDate, toInputDate, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import {
  FORM_USER,
  RailCard,
  RailRow,
  RailTotal,
  isCreate,
  opts,
  saved,
} from "./common";

/* ============================================================
   PURCHASE ORDER FORM

   A PO belongs to exactly one supplier, so choosing the supplier
   first is not a formality — it sets the currency, the payment
   term and the prices the buyer is expected to pay.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

export const PO_FORM: FormSchema<PoRow> = {
  key: "purchase-order",
  entityLabel: "Purchase Order",
  saveButton: "Save Purchase Order",
  statusBadge: {
    Draft: "neutral",
    Open: "info",
    "Partial Received": "warning",
    Completed: "success",
    Cancelled: "neutral",
    Closed: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextPOCode(),
    supplier: "",
    buyer: "",
    orderDate: toInputDate(today()),
    expectedDate: "",
    warehouse: WAREHOUSES[0] ? `${WAREHOUSES[0].code} ${WAREHOUSES[0].name}` : "",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 30 วัน",
    incoterm: "FOB",
    remark: "",
    prRef: "",
    status: "Draft",
    items: [],
  }),

  toState: (po) => ({
    _mode: "edit",
    code: po.code,
    supplier: po.supplier,
    buyer: po.buyer,
    orderDate: toInputDate(po.orderDate),
    expectedDate: toInputDate(po.expectedDate),
    warehouse: po.warehouse,
    currency: po.currency,
    fx: po.fx,
    payTerm: po.payTerm,
    incoterm: po.incoterm,
    remark: po.remark,
    prRef: po.prRef,
    status: po.status,
    items: (po.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. SUPPLIER ---------- */
    {
      key: "supplier",
      label: "Supplier",
      railLabel: "ผู้ขายสินค้า",
      labelTh: "ผู้ขายและเงื่อนไขการชำระ",
      blocks: () => [
        {
          type: "card",
          title: "Order Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "PO Number" },
            {
              type: "select",
              path: "supplier",
              label: "Supplier",
              required: true,
              options: PO_SUPPLIERS,
              hint: "เลือกผู้ขายก่อน — ระบบจะตั้งสกุลเงินและเงื่อนไขชำระให้อัตโนมัติ",
            },
            {
              type: "select",
              path: "buyer",
              label: "Buyer",
              required: true,
              options: opts(PO_BUYERS),
            },
            { type: "date", path: "orderDate", label: "Order Date", required: true },
            {
              type: "date",
              path: "expectedDate",
              label: "Expected Delivery Date",
              required: true,
            },
            {
              type: "select",
              path: "warehouse",
              label: "Receiving Warehouse",
              required: true,
              options: WAREHOUSES.map((w) => `${w.code} ${w.name}`),
            },
          ],
        },
        {
          type: "card",
          title: "Commercial Terms",
          cols: "4",
          fields: [
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            {
              type: "number",
              path: "fx",
              label: "Exchange Rate",
              required: true,
              min: 0,
              step: "0.0001",
              hint: "THB = 1",
            },
            { type: "select", path: "payTerm", label: "Payment Term", options: opts(PAY_TERMS) },
            { type: "select", path: "incoterm", label: "Incoterm", options: opts(PO_INCOTERMS) },
            {
              type: "text",
              path: "prRef",
              label: "Purchase Request Reference",
              span: true,
              placeholder: "PR2506-0001",
              hint: "กรอกเมื่อใบสั่งซื้อนี้อ้างอิงใบขอซื้อ",
            },
          ],
        },
      ],
    },

    /* ---------- 2. LINES ---------- */
    {
      key: "items",
      label: "Items",
      railLabel: "รายการสั่งซื้อ",
      labelTh: "สินค้า ราคา ส่วนลด ภาษี",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Order Lines",
          required: true,
          addLabel: "เพิ่มรายการสั่งซื้อ",
          empty: "ยังไม่มีรายการ — พิมพ์รหัสหรือชื่อสินค้าในช่อง Product เพื่อค้นหา",
          hint: "ยอดสุทธิต่อบรรทัด = จำนวน × ราคา − ส่วนลด + ภาษี",
          cols: [
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "160px",
              placeholder: "ค้นหาสินค้า...",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "220px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "70px" },
            { key: "qty", label: "Qty", type: "number", align: "right", required: true, width: "90px" },
            { key: "price", label: "Unit Price", type: "number", align: "right", required: true, width: "110px" },
            { key: "disc", label: "Disc %", type: "number", align: "right", width: "80px" },
            { key: "tax", label: "Tax %", type: "number", align: "right", width: "80px" },
            {
              key: "net",
              label: "Net Amount",
              type: "computed",
              align: "right",
              get: (r) => money(poLineNet(r)),
            },
          ],
        },
        {
          type: "card",
          title: "Remark",
          cols: "2",
          fields: [
            {
              type: "textarea",
              path: "remark",
              label: "Remark to Supplier",
              span: true,
              rows: 3,
              placeholder: "เงื่อนไขเพิ่มเติม เช่น กำหนดส่งแบ่งงวด หรือข้อกำหนดบรรจุภัณฑ์",
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
    { path: "supplier", label: "Supplier", step: "supplier" },
    { path: "buyer", label: "Buyer", step: "supplier" },
    { path: "orderDate", label: "Order Date", step: "supplier" },
    { path: "expectedDate", label: "Expected Delivery Date", step: "supplier" },
    { path: "warehouse", label: "Receiving Warehouse", step: "supplier" },
    { path: "currency", label: "Currency", step: "supplier" },
    { path: "fx", label: "Exchange Rate", step: "supplier" },
    {
      path: "items",
      label: "รายการสั่งซื้ออย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันที่คาดว่าจะได้รับต้องไม่อยู่ก่อนวันที่สั่งซื้อ",
      step: "supplier",
      test: (s) =>
        !s.expectedDate || !s.orderDate || String(s.expectedDate) >= String(s.orderDate),
    },
    {
      label: "อัตราแลกเปลี่ยนของสกุลเงิน THB ต้องเป็น 1",
      step: "supplier",
      test: (s) => s.currency !== "THB" || num(s.fx) === 1,
    },
    {
      label: "อัตราแลกเปลี่ยนต้องมากกว่า 0",
      step: "supplier",
      test: (s) => num(s.fx) > 0,
    },
    {
      label: "ทุกบรรทัดต้องเลือกสินค้าที่มีอยู่ในระบบ",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) =>
          PRODUCTS.some((p) => p.code === String(r.code ?? "").trim()),
        ),
    },
    {
      label: "จำนวนและราคาต่อหน่วยต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) => num(r.qty) > 0 && num(r.price) > 0),
    },
    {
      label: "ส่วนลดต้องอยู่ระหว่าง 0–100%",
      step: "items",
      test: (s) =>
        ((s.items ?? []) as GridRow[]).every((r) => num(r.disc) >= 0 && num(r.disc) <= 100),
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
        .map((p) => ({ code: p.code, name: p.name, meta: `ต้นทุนล่าสุด ${money(p.pricing.lastCost)}` }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const row = ((s[path] ?? []) as GridRow[])[index];
    if (!row) return;
    const st = productStock(hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.unit = st?.unit ?? "";
    if (!num(row.price)) row.price = st?.lastCost ?? 0;
    if (!num(row.qty)) row.qty = 1;
    if (row.tax === "" || row.tax === undefined) row.tax = 7;
  },

  /** Adopting the supplier's terms is the whole reason to pick them first. */
  onChange: (path, s) => {
    if (path !== "supplier") return;
    const info = poSupplierInfo(String(s.supplier ?? ""));
    if (!s.expectedDate && s.orderDate) {
      const d = new Date(String(s.orderDate));
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + (info.lead || 7));
        s.expectedDate = d.toISOString().slice(0, 10);
      }
    }
  },

  newRow: () => ({ code: "", name: "", unit: "", qty: "", price: "", disc: 0, tax: 7, recv: 0 }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const doc = { items: rows };
    const cur = String(s.currency ?? "THB");
    return (
      <RailCard icon="purchaseOrder" title="Order Preview" tone="accent">
        <RailRow label="เลขที่ใบสั่งซื้อ" value={String(s.code ?? "")} />
        <RailRow label="จำนวนรายการ" value={rows.length} />
        <RailRow label="ยอดก่อนส่วนลด" value={money(poSubtotal(doc))} />
        <RailRow label="ส่วนลดรวม" value={`− ${money(poDiscTotal(doc))}`} />
        <RailRow label="ภาษีรวม" value={money(poTaxTotal(doc))} />
        <RailTotal label={`ยอดรวมสุทธิ (${cur})`} value={money(poGrandTotal(doc))} />
        {cur !== "THB" && num(s.fx) > 0 && (
          <p className="mt-2 text-cap text-ink-2 tnum">
            ≈ {money(poGrandTotal(doc) * num(s.fx))} THB @ {num(s.fx)}
          </p>
        )}
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const name = String(s.supplier ?? "");
    if (!name) {
      return (
        <RailCard icon="truck" title="Supplier Insight">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกผู้ขายสินค้าเพื่อดูประวัติการส่งมอบ ราคาล่าสุด และยอดค้างชำระ
          </p>
        </RailCard>
      );
    }

    const info = poSupplierInfo(name);
    const lateRisk = info.otd < 90;

    return (
      <RailCard icon="truck" title="Supplier Insight" tone={lateRisk ? "warn" : "default"}>
        <RailRow label="เรตติ้ง" value={`${info.rating} · ${info.ratingLabel}`} />
        <RailRow
          label="ส่งตรงเวลา"
          value={`${info.otd}%`}
          tone={lateRisk ? "warn" : "ok"}
        />
        <RailRow label="Lead time เฉลี่ย" value={`${info.lead} วัน`} />
        <RailRow label="ราคาซื้อล่าสุด" value={money(info.lastPrice)} />
        <RailRow label="ยอดค้างกับผู้ขาย" value={money(info.outstanding)} />
        {lateRisk && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            ผู้ขายรายนี้ส่งตรงเวลา {info.otd}% — เผื่อเวลาในวันที่คาดว่าจะได้รับ
            หรือแจ้งคลังล่วงหน้า
          </p>
        )}
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PURCHASE_ORDERS.find((p) => p.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r) => ({
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        qty: num(r.qty),
        price: num(r.price),
        disc: num(r.disc),
        tax: num(r.tax),
        recv: num(r.recv),
      }));

    const patch = {
      supplier: String(s.supplier ?? ""),
      buyer: String(s.buyer ?? ""),
      orderDate: toDisplayDate(s.orderDate),
      expectedDate: toDisplayDate(s.expectedDate),
      warehouse: String(s.warehouse ?? ""),
      currency: String(s.currency ?? "THB"),
      fx: num(s.fx) || 1,
      payTerm: String(s.payTerm ?? ""),
      incoterm: String(s.incoterm ?? ""),
      remark: String(s.remark ?? ""),
      prRef: String(s.prRef ?? ""),
      items,
      updated: now,
      updatedBy: FORM_USER,
    };

    if (existing) {
      Object.assign(existing, patch);
    } else {
      PURCHASE_ORDERS.unshift({
        code,
        ...patch,
        status: "Draft",
        receipts: [],
        created: now,
        createdBy: FORM_USER,
      } as unknown as PoRow);
    }

    decoratePOs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบสั่งซื้อแล้ว",
      message: isCreate(s)
        ? `${code} — สถานะ Draft, ${fmt(items.length)} รายการ`
        : `${code} — ${fmt(items.length)} รายการ`,
      goto: `/m/purchase-order/${encodeURIComponent(code)}`,
    });
  },
};
