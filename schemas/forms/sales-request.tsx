import { SR_CHANNELS, SR_PRICE_LISTS, SR_PRIORITY } from "@/data/sales-requests";
import { PAY_TERMS } from "@/data/partners";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { docGrandTotal, lineNet } from "@/lib/domain/lines";
import {
  SALES_REQUESTS,
  creditCheck,
  customerOptions,
  decorateSalesRequests,
  getCustomer,
  nextSalesRequestCode,
  salesRepOptions,
  warehouseOptions,
  type SrRow,
} from "@/lib/domain/outbound";
import { fmt, money, money0, stamp, toDisplayDate, toInputDate, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
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
   SALES REQUEST FORM

   A quotation is a promise about price, so the form leads with the
   customer — their price list and credit position decide what the
   rest of the document is allowed to say.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** Draft rows are loose objects; the line maths only needs qty/price/disc/tax. */
const draftTotal = (rows: GridRow[]) => docGrandTotal({ items: rows });

export const SR_FORM: FormSchema<SrRow> = {
  key: "sales-request",
  entityLabel: "Sales Request",
  saveButton: "Save Quotation",
  statusBadge: {
    Draft: "neutral",
    Sent: "info",
    Accepted: "success",
    Rejected: "danger",
    Expired: "danger",
    Converted: "info",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextSalesRequestCode(),
    customerPick: "",
    customer: "",
    customerCode: "",
    salesRep: "",
    requestDate: toInputDate(today()),
    validUntil: "",
    status: "Draft",
    priority: "Normal",
    warehouse: "",
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "",
    note: "",
    items: [],
  }),

  toState: (sr) => ({
    _mode: "edit",
    code: sr.code,
    customerPick: `${sr.customerCode} - ${sr.customer}`,
    customer: sr.customer,
    customerCode: sr.customerCode,
    salesRep: sr.salesRep,
    requestDate: toInputDate(sr.requestDate),
    validUntil: toInputDate(sr.validUntil),
    status: sr.status,
    priority: sr.priority,
    warehouse: sr.warehouse,
    currency: sr.currency,
    payTerm: sr.payTerm,
    priceList: sr.priceList,
    channel: sr.channel,
    customerRef: sr.customerRef,
    note: sr.note,
    items: (sr.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. CUSTOMER ---------- */
    {
      key: "customer",
      label: "Customer",
      railLabel: "ลูกค้า",
      labelTh: "ลูกค้าและเงื่อนไขราคา",
      blocks: () => [
        {
          type: "card",
          title: "Quotation Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Quotation No." },
            {
              type: "select",
              path: "customerPick",
              label: "Customer",
              required: true,
              options: customerOptions(),
              hint: "เลือกลูกค้าก่อน — ระบบจะดึงเงื่อนไขชำระและพนักงานขายให้อัตโนมัติ",
            },
            {
              type: "select",
              path: "salesRep",
              label: "Sales Representative",
              required: true,
              options: salesRepOptions(),
            },
            { type: "date", path: "requestDate", label: "Request Date", required: true },
            {
              type: "date",
              path: "validUntil",
              label: "Valid Until",
              required: true,
              hint: "พ้นวันนี้แล้วใบเสนอราคาจะถือว่าหมดอายุ",
            },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(SR_PRIORITY),
            },
          ],
        },
        {
          type: "card",
          title: "Commercial Terms",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "priceList",
              label: "Price List",
              required: true,
              options: opts(SR_PRICE_LISTS),
              hint: "ใช้กำหนดราคาตั้งต้นของแต่ละบรรทัด",
            },
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            { type: "select", path: "payTerm", label: "Payment Term", options: opts(PAY_TERMS) },
            { type: "select", path: "channel", label: "Sales Channel", options: opts(SR_CHANNELS) },
            {
              type: "select",
              path: "warehouse",
              label: "Source Warehouse",
              required: true,
              options: warehouseOptions(),
            },
            {
              type: "text",
              path: "customerRef",
              label: "Customer Reference",
              placeholder: "REQ-DS-6806",
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
      labelTh: "สินค้าและราคาที่เสนอ",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Quoted Items",
          required: true,
          addLabel: "เพิ่มรายการสินค้า",
          empty: "ยังไม่มีรายการ — พิมพ์รหัสหรือชื่อสินค้าในช่อง Product เพื่อค้นหา",
          hint: "คอลัมน์ Available มาจากสต๊อกจริง ใช้ดูว่าเสนอแล้วส่งได้จริงหรือไม่",
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
            { key: "name", label: "Product Name", type: "static", muted: true, width: "200px" },
            { key: "unit", label: "Unit", type: "static", muted: true, width: "64px" },
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
              cls: (r) => {
                const st = productStock(String(r.code ?? ""));
                return st && st.available < num(r.qty) ? "font-semibold text-warning-text" : "";
              },
            },
            { key: "qty", label: "Qty", type: "number", align: "right", required: true, width: "90px" },
            { key: "price", label: "Unit Price", type: "number", align: "right", required: true, width: "110px" },
            { key: "disc", label: "Disc %", type: "number", align: "right", width: "80px" },
            { key: "tax", label: "Tax %", type: "number", align: "right", width: "80px" },
            {
              key: "net",
              label: "Net Amount",
              type: "computed",
              align: "right",
              get: (r) => money(lineNet(r)),
            },
            { key: "note", label: "Note", type: "text", width: "140px" },
          ],
        },
        {
          type: "card",
          title: "Note to Customer",
          cols: "2",
          fields: [
            {
              type: "textarea",
              path: "note",
              label: "Note",
              span: true,
              rows: 3,
              placeholder: "เงื่อนไขเพิ่มเติม เช่น ราคานี้รวมค่าจัดส่ง หรือยืนราคาถึงสิ้นเดือน",
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
    { path: "customerPick", label: "Customer", step: "customer" },
    { path: "salesRep", label: "Sales Representative", step: "customer" },
    { path: "requestDate", label: "Request Date", step: "customer" },
    { path: "validUntil", label: "Valid Until", step: "customer" },
    { path: "priority", label: "Priority", step: "customer" },
    { path: "priceList", label: "Price List", step: "customer" },
    { path: "currency", label: "Currency", step: "customer" },
    { path: "warehouse", label: "Source Warehouse", step: "customer" },
    {
      path: "items",
      label: "รายการสินค้าอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันหมดอายุต้องอยู่หลังวันที่ออกใบเสนอราคา",
      step: "customer",
      test: (s) => !s.validUntil || !s.requestDate || String(s.validUntil) > String(s.requestDate),
    },
    {
      label: "ลูกค้าที่เลือกต้องมีบทบาท Customer หรือ Dealer",
      step: "customer",
      test: (s) => {
        if (!s.customerPick) return true;
        const bp = getCustomer(String(s.customerPick));
        return Boolean(bp?.roles?.customer || bp?.roles?.dealer);
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
    /* Selling price comes from the product master, not the last purchase cost. */
    if (!num(row.price)) row.price = p?.price ?? 0;
    if (!num(row.qty)) row.qty = 1;
    if (row.tax === "" || row.tax === undefined) row.tax = 7;
    if (row.disc === "" || row.disc === undefined) row.disc = 0;
  },

  /** Picking the customer adopts their commercial defaults. */
  onChange: (path, s) => {
    if (path !== "customerPick") return;
    const bp = getCustomer(String(s.customerPick ?? ""));
    if (!bp) return;

    s.customerCode = bp.code;
    s.customer = bp.nameTh || bp.nameEn;
    if (bp.sales?.payTerm) s.payTerm = bp.sales.payTerm;
    if (bp.sales?.rep) s.salesRep = bp.sales.rep;
    if (bp.cls?.channel) s.channel = bp.cls.channel;
  },

  newRow: () => ({ code: "", name: "", unit: "", qty: "", price: "", disc: 0, tax: 7, note: "" }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <RailCard icon="salesRequest" title="Quotation Preview" tone="accent">
        <RailRow label="เลขที่" value={String(s.code ?? "")} />
        <RailRow label="ลูกค้า" value={String(s.customer ?? "") || "ยังไม่ได้เลือก"} />
        <RailRow label="จำนวนรายการ" value={rows.length} />
        <RailRow label="ยืนราคาถึง" value={toDisplayDate(s.validUntil) || "—"} />
        <RailTotal
          label={`มูลค่ารวม (${String(s.currency ?? "THB")})`}
          value={money0(draftTotal(rows))}
        />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const total = draftTotal(rows);
    const credit = creditCheck(String(s.customerPick ?? ""), total);
    const short = rows.filter((r) => {
      const st = productStock(String(r.code ?? ""));
      return st && st.available < num(r.qty);
    });

    if (!s.customerPick) {
      return (
        <RailCard icon="partner" title="Customer Insight">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกลูกค้าเพื่อดูวงเงินเครดิตคงเหลือ เงื่อนไขชำระ และประวัติการซื้อ
          </p>
        </RailCard>
      );
    }

    return (
      <RailCard
        icon="partner"
        title="Customer Insight"
        tone={!credit.withinLimit || short.length ? "warn" : "default"}
      >
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
          label="สินค้าสต๊อกไม่พอ"
          value={`${short.length} รายการ`}
          tone={short.length ? "warn" : "ok"}
        />
        {!credit.withinLimit && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            เกินวงเงิน {money0(credit.overBy)} บาท — ถ้าลูกค้าตอบรับ ใบสั่งขายจะถูกตั้งเป็น
            On Hold รอฝ่ายบัญชีอนุมัติ
          </p>
        )}
        {short.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            {short.map((r) => r.code).slice(0, 3).join(", ")} มีสต๊อกน้อยกว่าที่เสนอ —
            ตรวจกำหนดส่งก่อนยืนราคา
          </p>
        )}
      </RailCard>
    );
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <>
        <ReviewCard title="Customer & Terms">
          {row("Quotation No.", s.code, "customer")}
          {row("Customer", s.customer, "customer")}
          {row("Sales Rep", s.salesRep, "customer")}
          {row("Valid Until", toDisplayDate(s.validUntil), "customer")}
          {row("Price List", s.priceList, "customer")}
          {row("Payment Term", s.payTerm, "customer")}
          {row("Source Warehouse", s.warehouse, "customer")}
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
            <span className="text-[13px] font-semibold">มูลค่ารวม</span>
            <span className="ml-auto text-lg font-semibold tnum">
              {money(draftTotal(rows))}
            </span>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = SALES_REQUESTS.find((x) => x.code === code);

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
        note: String(r.note ?? ""),
      }));

    const bp = getCustomer(String(s.customerPick ?? ""));
    const patch = {
      customer: bp ? bp.nameTh || bp.nameEn : String(s.customer ?? ""),
      customerCode: bp?.code ?? String(s.customerCode ?? ""),
      salesRep: String(s.salesRep ?? ""),
      requestDate: toDisplayDate(s.requestDate),
      validUntil: toDisplayDate(s.validUntil),
      priority: String(s.priority ?? "Normal"),
      warehouse: String(s.warehouse ?? ""),
      currency: String(s.currency ?? "THB"),
      payTerm: String(s.payTerm ?? ""),
      priceList: String(s.priceList ?? ""),
      channel: String(s.channel ?? ""),
      customerRef: String(s.customerRef ?? ""),
      note: String(s.note ?? ""),
      items,
      updated: now,
      updatedBy: FORM_USER,
    };

    if (existing) {
      Object.assign(existing, patch);
      (existing.history ??= []).unshift({
        t: "Quotation updated",
        d: "แก้ไขใบเสนอราคาจากฟอร์ม",
        u: FORM_USER,
        when: now,
        kind: "primary",
      });
    } else {
      SALES_REQUESTS.unshift({
        code,
        ...patch,
        status: "Draft",
        soRef: "",
        created: now,
        createdBy: FORM_USER,
        history: [
          {
            t: "Created",
            d: "สร้างใบเสนอราคาจากฟอร์ม",
            u: FORM_USER,
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as SrRow);
    }

    decorateSalesRequests();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบเสนอราคาแล้ว",
      message: `${code} — ${patch.customer}`,
      goto: `/m/sales-request/${encodeURIComponent(code)}`,
    });
  },
};
