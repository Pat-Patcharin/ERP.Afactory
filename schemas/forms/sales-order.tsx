import { SO_CHANNELS, SO_INCOTERMS, SO_PRIORITY } from "@/data/sales-orders";
import type { SalesOrder } from "@/data/sales-orders";
import { BILL_TYPES, PAY_TERMS } from "@/data/partners";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import {
  docGrandTotal,
  docDiscTotal,
  docSubtotal,
  docTaxTotal,
  lineNet,
  recordTotals,
} from "@/lib/domain/lines";
import { STANDARD_VAT_RATE, planBillTypeChange, priceApproval } from "@/lib/domain/doc-draft";
import { PriceApprovalNotice } from "@/components/document/PriceApprovalNotice";
import {
  BillTypeNotice,
  billTypeConfirmText,
  billTypeDialogTitle,
} from "@/components/document/BillTypeNotice";
import {
  SALES_ORDERS,
  SALES_REQUESTS,
  availabilityFor,
  blockedForDraftPartner,
  creditCheck,
  customerOptions,
  decorateSOs,
  getCustomer,
  nextSOCode,
  salesRepOptions,
  shipToOptions,
  warehouseOptions,
  type SoRow,
} from "@/lib/domain/outbound";
import { fmt, money, money0, stamp, isoToDmy, dmyToIso, today } from "@/lib/format";
import type { FormSchema, FormState, GridRow, LookupHit } from "@/lib/types";
import {
  FORM_USER,
  RailCard,
  RailRow,
  RailTotal,
  ReviewCard,
  opts,
  saved,
} from "./common";

/* ============================================================
   SALES ORDER FORM

   Two things decide whether this order can be honoured: is the
   customer inside their credit limit, and is the stock actually
   on the shelf. Both are computed live in the right rail rather
   than discovered at picking time.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** The three header charges as the state holds them. */
const chargesOf = (s: FormState) => ({
  headerDisc: num(s.headerDisc),
  freight: num(s.freight),
  otherCharges: num(s.otherCharges),
});

/**
 * What the order comes to, charges and all.
 *
 * `docGrandTotal` — lines only — used to be the figure on the rail, on the
 * credit check and on the saved record. Once an order can carry freight, that
 * is no longer the amount the customer is asked for, and the rail quoting one
 * number while the sheet beside it quotes another is the fault A1 was about.
 */
const draftTotal = (s: FormState) =>
  recordTotals({ items: (s.items ?? []) as GridRow[], ...chargesOf(s) }).grandTotal;

/** Approved sales requests that have not become an order yet. */
const approvedRequests = () =>
  SALES_REQUESTS.filter((s) => s.status === "Approved" && !s.soRef).map((s) => s.code);

export const SO_FORM: FormSchema<SoRow> = {
  key: "sales-order",
  entityLabel: "Sales Order",
  saveButton: "Save Sales Order",
  statusBadge: {
    Draft: "neutral",
    Confirmed: "info",
    "On Hold": "danger",
    Picking: "warning",
    "Partially Delivered": "warning",
    Completed: "success",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextSOCode(),
    billType: "VAT",
    customerPick: "",
    customer: "",
    customerCode: "",
    salesRep: "",
    orderDate: dmyToIso(today()),
    deliveryDate: "",
    warehouse: "",
    currency: "THB",
    fx: 1,
    payTerm: "เครดิต 30 วัน",
    incoterm: "DAP",
    shipTo: "",
    status: "Draft",
    priority: "Normal",
    channel: "Direct",
    srRef: "",
    customerPo: "",
    remark: "",
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: [],
  }),

  toState: (so) => ({
    _mode: "edit",
    code: so.code,
    billType: so.billType,
    customerPick: `${so.customerCode} - ${so.customer}`,
    customer: so.customer,
    customerCode: so.customerCode,
    salesRep: so.salesRep,
    orderDate: dmyToIso(so.orderDate),
    deliveryDate: dmyToIso(so.deliveryDate),
    warehouse: so.warehouse,
    currency: so.currency,
    fx: so.fx,
    payTerm: so.payTerm,
    incoterm: so.incoterm,
    shipTo: so.shipTo,
    status: so.status,
    priority: so.priority,
    channel: so.channel,
    srRef: so.srRef,
    customerPo: so.customerPo,
    remark: so.remark,
    headerDisc: so.headerDisc,
    freight: so.freight,
    otherCharges: so.otherCharges,
    items: (so.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. CUSTOMER ---------- */
    {
      key: "customer",
      label: "Customer",
      railLabel: "ลูกค้า",
      labelTh: "ลูกค้าและเงื่อนไขการขาย",
      blocks: (s) => [
        {
          type: "card",
          title: "Order Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "SO Number" },
            {
              type: "select",
              path: "customerPick",
              label: "Customer",
              required: true,
              options: customerOptions(),
              hint: "เลือกลูกค้าก่อน — ระบบดึงเงื่อนไขชำระ ที่อยู่จัดส่ง และวงเงินเครดิตมาให้",
            },
            {
              type: "select",
              path: "salesRep",
              label: "Sales Representative",
              required: true,
              options: salesRepOptions(),
            },
            { type: "date", path: "orderDate", label: "Order Date", required: true },
            { type: "date", path: "deliveryDate", label: "Delivery Date", required: true },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(SO_PRIORITY),
            },
            {
              type: "select",
              path: "srRef",
              label: "Source Sales Request",
              options: approvedRequests(),
              hint: "เลือกคำขอขายที่อนุมัติแล้ว เพื่อดึงลูกค้าและรายการมาทั้งชุด",
              when: (st) => st._mode === "create",
            },
            {
              type: "static",
              path: "srRef",
              label: "Source Sales Request",
              when: (st) => st._mode !== "create",
            },
            { type: "text", path: "customerPo", label: "Customer PO No.", placeholder: "PO-DS-69-0331" },
          ],
        },
        {
          type: "card",
          title: "Delivery & Terms",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "warehouse",
              label: "Source Warehouse",
              required: true,
              options: warehouseOptions(),
            },
            {
              type: "select",
              path: "shipTo",
              label: "Ship To",
              required: true,
              options: shipToOptions(String(s.customerPick ?? "")),
              hint: "ที่อยู่จากสมุดที่อยู่ของลูกค้า",
            },
            { type: "select", path: "incoterm", label: "Incoterm", options: opts(SO_INCOTERMS) },
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            { type: "number", path: "fx", label: "Exchange Rate", required: true, min: 0, step: "0.0001", hint: "THB = 1" },
            { type: "select", path: "payTerm", label: "Payment Term", options: opts(PAY_TERMS) },
            { type: "select", path: "channel", label: "Sales Channel", options: opts(SO_CHANNELS) },
            {
              type: "select",
              path: "billType",
              label: "Bill Type",
              options: opts(BILL_TYPES),
              hint: "เปลี่ยนแล้วภาษีทุกบรรทัดจะถูกคำนวณใหม่ — ดูผลกระทบในแผงด้านขวา",
            },
          ],
        },
      ],
    },

    /* ---------- 2. LINES ---------- */
    {
      key: "items",
      label: "Items",
      railLabel: "รายการสินค้า",
      labelTh: "สินค้า ราคา และสต๊อก",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Order Lines",
          required: true,
          addLabel: "เพิ่มรายการสินค้า",
          empty: "ยังไม่มีรายการ — เลือกใบเสนอราคาในขั้นแรก หรือค้นหาสินค้าที่นี่",
          hint: "คอลัมน์ ขาด แสดงจำนวนที่สต๊อกไม่พอ — ยังบันทึกได้ แต่จะหยิบของไม่ครบ",
          cols: [
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "150px",
              placeholder: "ค้นหาสินค้า...",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "180px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "60px" },
            { key: "qty", label: "Qty", type: "number", align: "right", required: true, width: "85px" },
            {
              key: "avail",
              label: "Available",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => {
                const st = productStock(String(r.code ?? ""));
                return st ? fmt(st.available) : "—";
              },
            },
            {
              key: "short",
              label: "ขาด",
              type: "computed",
              align: "right",
              get: (r) => {
                const a = availabilityFor(String(r.code ?? ""), num(r.qty));
                return a && a.shortBy > 0 ? fmt(a.shortBy) : "—";
              },
              cls: (r) => {
                const a = availabilityFor(String(r.code ?? ""), num(r.qty));
                return a && a.shortBy > 0 ? "font-semibold text-danger" : "";
              },
            },
            { key: "price", label: "Unit Price", type: "number", align: "right", required: true, width: "100px" },
            { key: "disc", label: "Disc %", type: "number", align: "right", width: "75px" },
            { key: "tax", label: "Tax %", type: "number", align: "right", width: "75px" },
            {
              key: "net",
              label: "Net Amount",
              type: "computed",
              align: "right",
              get: (r) => money(lineNet(r)),
            },
          ],
        },
        {
          /* Amounts in baht, matching the quotation and the request the order
             came from. The discount applies after the line discounts and
             before VAT; freight and other charges are taxed at the document's
             own rate. One formula for all of it — `docTotals` in lines.ts. */
          type: "card",
          title: "Charges",
          cols: "3",
          fields: [
            { type: "number", path: "headerDisc", label: "Header Discount", min: 0, step: "0.01" },
            { type: "number", path: "freight", label: "Freight", min: 0, step: "0.01" },
            { type: "number", path: "otherCharges", label: "Other Charges", min: 0, step: "0.01" },
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
              label: "Remark",
              span: true,
              rows: 3,
              placeholder: "เงื่อนไขการส่งมอบ เช่น ส่งเช้าเท่านั้น หรือแบ่งส่งหลายงวด",
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
    {
      path: "srRef",
      label: "Source Sales Request",
      step: "customer",
      /* Sales Request is required by the process; only pre-existing orders
         raised before this rule existed are allowed through without one. */
      test: (s) => s._mode !== "create" || Boolean(String(s.srRef ?? "").trim()),
    },
    { path: "customerPick", label: "Customer", step: "customer" },
    { path: "salesRep", label: "Sales Representative", step: "customer" },
    { path: "orderDate", label: "Order Date", step: "customer" },
    { path: "deliveryDate", label: "Delivery Date", step: "customer" },
    { path: "priority", label: "Priority", step: "customer" },
    { path: "warehouse", label: "Source Warehouse", step: "customer" },
    { path: "shipTo", label: "Ship To", step: "customer" },
    { path: "currency", label: "Currency", step: "customer" },
    { path: "fx", label: "Exchange Rate", step: "customer" },
    {
      path: "items",
      label: "รายการสินค้าอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันส่งมอบต้องไม่อยู่ก่อนวันที่สั่งขาย",
      step: "customer",
      test: (s) => !s.deliveryDate || !s.orderDate || String(s.deliveryDate) >= String(s.orderDate),
    },
    {
      label: "อัตราแลกเปลี่ยนของสกุลเงิน THB ต้องเป็น 1",
      step: "customer",
      test: (s) => s.currency !== "THB" || num(s.fx) === 1,
    },
    {
      label: "ลูกค้าที่เลือกต้องไม่อยู่ในสถานะ Blocked",
      step: "customer",
      test: (s) => {
        if (!s.customerPick) return true;
        return getCustomer(String(s.customerPick))?.status !== "Blocked";
      },
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
        .map((p) => ({
          code: p.code,
          name: p.name,
          meta: `${money0(p.price)} · คงเหลือ ${fmt(p.availTotal)}`,
        }));
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
    if (!num(row.price)) row.price = p?.price ?? 0;
    if (!num(row.qty)) row.qty = 1;
    if (row.tax === "" || row.tax === undefined) row.tax = 7;
    if (row.disc === "" || row.disc === undefined) row.disc = 0;
    row.picked = num(row.picked);
    row.delivered = num(row.delivered);
  },

  onChange: (path, s) => {
    /* The customer sets the commercial defaults and the ship-to list. */
    if (path === "customerPick") {
      const bp = getCustomer(String(s.customerPick ?? ""));
      if (!bp) return;
      s.customerCode = bp.code;
      s.customer = bp.nameTh || bp.nameEn;
      if (bp.sales?.payTerm) s.payTerm = bp.sales.payTerm;
      if (bp.sales?.rep) s.salesRep = bp.sales.rep;
      if (bp.cls?.channel) s.channel = bp.cls.channel;
      if (bp.billType) s.billType = bp.billType;
      const addresses = shipToOptions(String(s.customerPick));
      s.shipTo = addresses[0] ?? "";
      return;
    }

    /**
     * Switching VAT ⇄ Non VAT retaxes every line.
     *
     * The engine's onChange carries no `ctx`, so this surface cannot raise a
     * dialog at the moment of the change the way the two document editors do.
     * Instead the lines are retaxed immediately, the right rail shows exactly
     * what the editors' dialog shows — from the same plan — and `save`, which
     * does have `ctx`, asks before it writes. Same figures, same words, one
     * beat later.
     */
    if (path === "billType") {
      const to = String(s.billType ?? "") === "Non VAT" ? 0 : STANDARD_VAT_RATE;
      for (const r of (s.items ?? []) as GridRow[]) {
        if (String(r.code ?? "").trim()) r.tax = to;
      }
      return;
    }

    /* Choosing an accepted quotation pulls its priced lines across. */
    if (path === "srRef") {
      const sr = SALES_REQUESTS.find((x) => x.code === String(s.srRef ?? ""));
      if (!sr) return;
      s.customerPick = `${sr.customerCode} - ${sr.customer}`;
      s.customerCode = sr.customerCode;
      s.customer = sr.customer;
      s.salesRep = sr.salesRep;
      s.warehouse = sr.warehouse;
      s.currency = sr.currency;
      s.payTerm = sr.payTerm;
      s.channel = sr.channel;
      s.priority = sr.priority;
      s.customerPo = sr.customerRef;
      s.deliveryDate = dmyToIso(sr.requiredDate);
      /* The charges come across with the lines. They are part of what the
         customer agreed to, not decoration on the request. */
      s.headerDisc = sr.headerDisc;
      s.freight = sr.freight;
      s.otherCharges = sr.otherCharges;
      const addresses = shipToOptions(s.customerPick);
      s.shipTo = addresses[0] ?? "";
      s.items = (sr.items ?? []).map((it) => ({
        code: it.code,
        name: it.name,
        unit: it.unit,
        qty: it.qty,
        price: it.price,
        disc: it.disc,
        tax: it.tax,
        picked: 0,
        delivered: 0,
        note: it.note,
      }));
    }
  },

  newRow: () => ({
    code: "",
    name: "",
    unit: "",
    qty: "",
    price: "",
    disc: 0,
    tax: 7,
    picked: 0,
    delivered: 0,
    note: "",
  }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const t = recordTotals({ items: rows, ...chargesOf(s) });
    const cur = String(s.currency ?? "THB");
    return (
      <RailCard icon="salesOrder" title="Order Preview" tone="accent">
        <RailRow label="เลขที่" value={String(s.code ?? "")} />
        <RailRow label="ลูกค้า" value={String(s.customer ?? "") || "ยังไม่ได้เลือก"} />
        <RailRow label="ยอดก่อนส่วนลด" value={money0(t.subtotal)} />
        <RailRow label="ส่วนลดรวม" value={`− ${money0(t.lineDiscount + t.headerDiscount)}`} />
        {t.freight > 0 && <RailRow label="ค่าขนส่ง" value={money0(t.freight)} />}
        {t.otherCharges > 0 && <RailRow label="ค่าใช้จ่ายอื่น" value={money0(t.otherCharges)} />}
        <RailRow label="ภาษีรวม" value={money0(t.vat)} />
        <RailTotal label={`ยอดรวมสุทธิ (${cur})`} value={money0(t.grandTotal)} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const total = draftTotal(s);
    const credit = creditCheck(String(s.customerPick ?? ""), total);
    const short = rows
      .map((r) => ({ row: r, a: availabilityFor(String(r.code ?? ""), num(r.qty)) }))
      .filter((x) => x.a && x.a.shortBy > 0);

    if (!s.customerPick) {
      return (
        <RailCard icon="shield" title="Credit & Stock Check">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกลูกค้าและใส่รายการสินค้า เพื่อตรวจวงเงินเครดิตและความพร้อมของสต๊อก
          </p>
        </RailCard>
      );
    }

    const blocked = !credit.withinLimit || short.length > 0;

    /* What flipping the bill type would do, measured against the SAVED order:
       the lines on screen have already been retaxed by onChange, so the
       document as it stands is the only honest "before". Same plan, same
       component, same figures as the dialog in the two document editors. */
    const original = SALES_ORDERS.find((x) => x.code === String(s.code ?? ""));
    const billPlan =
      original && String(s.billType ?? "") !== original.billType
        ? planBillTypeChange(
            {
              items: original.items ?? [],
              billType: original.billType,
              headerDisc: original.headerDisc,
              freight: original.freight,
              otherCharges: original.otherCharges,
            },
            String(s.billType ?? ""),
          )
        : null;

    /* The same wrapper the two document editors read — no second opinion
       about what a price needs. */
    const price = priceApproval(rows);

    return (
      <>
        {(price.level === "manager" || price.noCost.length || price.uncheckable.length) && (
          <RailCard
            icon="shield"
            title="การอนุมัติราคา"
            tone={price.noCost.length || price.level === "manager" ? "warn" : "default"}
          >
            <PriceApprovalNotice plan={price} />
          </RailCard>
        )}
        {billPlan && (
          <RailCard icon="pricing" title="เปลี่ยนประเภทใบกำกับ" tone="warn">
            <BillTypeNotice plan={billPlan} />
            <p className="mt-3 text-cap leading-relaxed text-ink-2">
              ระบบจะถามยืนยันอีกครั้งตอนกดบันทึก
            </p>
          </RailCard>
        )}
      <RailCard icon="shield" title="Credit & Stock Check" tone={blocked ? "warn" : "default"}>
        <RailRow label="สถานะเครดิต" value={credit.status} />
        <RailRow
          label="วงเงินคงเหลือ"
          value={credit.cashOnly ? "เงินสดเท่านั้น" : money0(credit.available)}
        />
        <RailRow
          label="ยอดหลังรวมใบนี้"
          value={credit.cashOnly ? "—" : money0(credit.projected)}
          tone={credit.withinLimit ? "ok" : "danger"}
        />
        <RailRow
          label="บรรทัดที่สต๊อกไม่พอ"
          value={`${short.length} รายการ`}
          tone={short.length ? "danger" : "ok"}
        />
        {!credit.withinLimit && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            เกินวงเงิน {money0(credit.overBy)} บาท — เมื่อกดยืนยันใบสั่งขาย ระบบจะตั้งเป็น
            On Hold รอฝ่ายบัญชีอนุมัติ
          </p>
        )}
        {short.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            {short
              .slice(0, 3)
              .map((x) => `${x.row.code} ขาด ${fmt(x.a!.shortBy)}`)
              .join(", ")}
            {short.length > 3 ? ` และอีก ${short.length - 3} รายการ` : ""} — ยังบันทึกได้
            แต่จะหยิบของไม่ครบในรอบเดียว
          </p>
        )}
      </RailCard>
      </>
    );
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <>
        <ReviewCard title="Customer & Delivery">
          {row("SO Number", s.code, "customer")}
          {row("Customer", s.customer, "customer")}
          {row("Sales Rep", s.salesRep, "customer")}
          {row("Order Date", isoToDmy(s.orderDate), "customer")}
          {row("Delivery Date", isoToDmy(s.deliveryDate), "customer")}
          {row("Ship To", s.shipTo, "customer")}
          {row("Source Warehouse", s.warehouse, "customer")}
          {row("Payment Term", s.payTerm, "customer")}
        </ReviewCard>
        <ReviewCard title="Items">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-[9px] text-[13px] last:border-b-0"
            >
              <span className="font-medium tnum">{String(r.code ?? "—")}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{String(r.name ?? "")}</span>
              <span className="tnum">
                {fmt(r.qty)} {String(r.unit ?? "")}
              </span>
              <span className="w-24 text-right font-medium tnum">{money(lineNet(r))}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-3 pt-3">
            <span className="text-[13px] font-semibold">ยอดรวมสุทธิ</span>
            <span className="ml-auto text-lg font-semibold tnum">{money(draftTotal(s))}</span>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = SALES_ORDERS.find((x) => x.code === code);

    /* A partner nobody has confirmed cannot be sold to. Checked here, at the
       write, rather than by hiding the customer from the picker: the picker
       is also how an existing order's customer is read back, and a stale tab
       reaches this function without passing the form at all. */
    const draftPartner = blockedForDraftPartner(String(s.customerCode ?? ""));
    if (draftPartner) {
      ctx.toast("บันทึกใบสั่งขายไม่ได้", draftPartner, "danger");
      return;
    }

    /* The bill type moved since this order was last saved. `save` is the
       first point on this surface that has a ctx, so this is where the
       question gets asked — with the same plan, the same component and the
       same wording as the dialog in the two document editors. */
    const billPlan = existing
      ? planBillTypeChange(
          {
            items: existing.items ?? [],
            billType: existing.billType,
            /* The order's own charges, not zeros. The dialog quotes a before
               and an after figure, and quoting either without the freight the
               order carries is the same lie the sheet used to tell. */
            headerDisc: existing.headerDisc,
            freight: existing.freight,
            otherCharges: existing.otherCharges,
          },
          String(s.billType ?? ""),
        )
      : null;

    if (billPlan) {
      ctx.confirm({
        title: billTypeDialogTitle(billPlan),
        message: (
          <>
            <p className="mb-3 text-ink-2">
              {code} · {String(s.customer ?? "")}
            </p>
            <BillTypeNotice plan={billPlan} />
          </>
        ),
        confirmText: billTypeConfirmText(billPlan),
        tone: billPlan.overwritten.length ? "danger" : "primary",
        /* Re-enter with the question answered. `existing.billType` now
           matches, so planBillTypeChange returns null and the save runs. */
        onConfirm: () => {
          existing!.billType = String(s.billType ?? "");
          SO_FORM.save(s, ctx);
        },
      });
      return;
    }

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
        picked: num(r.picked),
        delivered: num(r.delivered),
        note: String(r.note ?? ""),
      }));

    const bp = getCustomer(String(s.customerPick ?? ""));

    /* The credit check is asked about the amount the customer will be billed,
       which includes the freight. */
    const charges = chargesOf(s);
    const total = recordTotals({ items, ...charges }).grandTotal;
    const credit = creditCheck(String(s.customerPick ?? ""), total);

    const patch = {
      customer: bp ? bp.nameTh || bp.nameEn : String(s.customer ?? ""),
      customerCode: bp?.code ?? String(s.customerCode ?? ""),
      salesRep: String(s.salesRep ?? ""),
      orderDate: isoToDmy(s.orderDate),
      deliveryDate: isoToDmy(s.deliveryDate),
      warehouse: String(s.warehouse ?? ""),
      currency: String(s.currency ?? "THB"),
      fx: num(s.fx) || 1,
      payTerm: String(s.payTerm ?? ""),
      incoterm: String(s.incoterm ?? ""),
      shipTo: String(s.shipTo ?? ""),
      priority: String(s.priority ?? "Normal"),
      channel: String(s.channel ?? ""),
      billType: String(s.billType ?? "VAT"),
      srRef: String(s.srRef ?? ""),
      customerPo: String(s.customerPo ?? ""),
      remark: String(s.remark ?? ""),
      ...charges,
      creditApproved: credit.withinLimit,
      creditNote: credit.withinLimit
        ? credit.cashOnly
          ? "ชำระเงินสด"
          : "อยู่ในวงเงิน"
        : `เกินวงเงิน ${money0(credit.overBy)} บาท`,
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Sales order updated",
        d: "แก้ไขใบสั่งขายจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      const fresh: SalesOrder = {
        code,
        ...patch,
        /* A new order always lands as Draft — confirming it is a separate,
           deliberate step that runs the credit check. */
        status: "Draft",
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: patch.srRef ? `Created from ${patch.srRef}` : "Created",
            /* The form only ever converts a Sales Request; it said
               "ใบเสนอราคา", which is a different document. */
            d: patch.srRef ? "แปลงจากคำขอขาย" : "สร้างใบสั่งขายจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      };
      SALES_ORDERS.unshift(fresh as SoRow);

      /* Close the loop on the quotation this order came from. */
      const sr = SALES_REQUESTS.find((x) => x.code === patch.srRef);
      if (sr && !sr.soRef) {
        sr.soRef = code;
        sr.status = "Converted";
        sr.updated = now;
      }
    }

    decorateSOs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบสั่งขายแล้ว",
      message: credit.withinLimit
        ? `${code} — ${patch.customer}`
        : `${code} — เกินวงเงินเครดิต ${money0(credit.overBy)} บาท`,
      goto: `/m/sales-order/${encodeURIComponent(code)}`,
    });
  },
};
