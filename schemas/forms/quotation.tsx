import { QT_CHANNELS, QT_PRICE_LISTS, QT_REJECT_REASONS, QT_VALIDITY_DAYS } from "@/data/quotations";
import { PAY_TERMS } from "@/data/partners";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { docGrandTotal, lineNet } from "@/lib/domain/lines";
import {
  QUOTATIONS,
  creditCheck,
  customerOptions,
  decorateQuotations,
  getCustomer,
  nextQuotationCode,
  salesRepOptions,
  type QtRow,
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
   QUOTATION FORM

   A price offer, nothing more. No warehouse, no reservation, no
   commitment — the only date that matters is how long the price
   is good for.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const draftTotal = (rows: GridRow[]) => docGrandTotal({ items: rows });

/** Default validity: today + the standard window. */
function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + QT_VALIDITY_DAYS);
  return d.toISOString().slice(0, 10);
}

export const QT_FORM: FormSchema<QtRow> = {
  key: "quotation",
  entityLabel: "Quotation",
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
    code: nextQuotationCode(),
    customerPick: "",
    customer: "",
    customerCode: "",
    salesRep: "",
    quoteDate: toInputDate(today()),
    validUntil: defaultValidUntil(),
    status: "Draft",
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "",
    rejectReason: "",
    note: "",
    items: [],
  }),

  toState: (q) => ({
    _mode: "edit",
    code: q.code,
    customerPick: `${q.customerCode} - ${q.customer}`,
    customer: q.customer,
    customerCode: q.customerCode,
    salesRep: q.salesRep,
    quoteDate: toInputDate(q.quoteDate),
    validUntil: toInputDate(q.validUntil),
    status: q.status,
    currency: q.currency,
    payTerm: q.payTerm,
    priceList: q.priceList,
    channel: q.channel,
    customerRef: q.customerRef,
    rejectReason: q.rejectReason,
    note: q.note,
    items: (q.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    {
      key: "customer",
      label: "Customer",
      railLabel: "ลูกค้า",
      labelTh: "ลูกค้าและช่วงยืนราคา",
      blocks: () => [
        {
          type: "note",
          label: "ใบเสนอราคาไม่จองสต๊อกและไม่ผูกมัด",
          text: "เอกสารนี้เป็นขั้นตอนทางเลือก ใช้เสนอราคาให้ลูกค้าพิจารณา — เมื่อลูกค้าตอบรับจึงแปลงเป็นคำขอขาย",
        },
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
              hint: "เลือกลูกค้าก่อน — ระบบดึงเงื่อนไขชำระและพนักงานขายให้อัตโนมัติ",
            },
            {
              type: "select",
              path: "salesRep",
              label: "Sales Representative",
              required: true,
              options: salesRepOptions(),
            },
            { type: "date", path: "quoteDate", label: "Quote Date", required: true },
            {
              type: "date",
              path: "validUntil",
              label: "Valid Until",
              required: true,
              hint: `ยืนราคาถึงวันนี้ ค่าเริ่มต้น ${QT_VALIDITY_DAYS} วัน`,
            },
            {
              type: "text",
              path: "customerRef",
              label: "Customer Reference",
              placeholder: "RFQ-DS-6806",
            },
          ],
        },
        {
          type: "card",
          title: "Pricing Terms",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "priceList",
              label: "Price List",
              required: true,
              options: opts(QT_PRICE_LISTS),
            },
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            { type: "select", path: "payTerm", label: "Payment Term", options: opts(PAY_TERMS) },
            { type: "select", path: "channel", label: "Sales Channel", options: opts(QT_CHANNELS) },
            {
              type: "select",
              path: "rejectReason",
              label: "Reject Reason",
              options: opts(QT_REJECT_REASONS),
              when: (s) => s.status === "Rejected",
            },
          ],
        },
      ],
    },

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
          hint: "คอลัมน์ Available เป็นข้อมูลอ้างอิงเท่านั้น ใบเสนอราคาไม่จองสต๊อก",
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
    { path: "quoteDate", label: "Quote Date", step: "customer" },
    { path: "validUntil", label: "Valid Until", step: "customer" },
    { path: "priceList", label: "Price List", step: "customer" },
    { path: "currency", label: "Currency", step: "customer" },
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
      test: (s) => !s.validUntil || !s.quoteDate || String(s.validUntil) > String(s.quoteDate),
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
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.qty) > 0 && num(r.price) > 0),
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
  },

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
      <RailCard icon="quotation" title="Quotation Preview" tone="accent">
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

    if (!s.customerPick) {
      return (
        <RailCard icon="partner" title="Customer Insight">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกลูกค้าเพื่อดูวงเงินเครดิตคงเหลือและเงื่อนไขชำระที่ผูกไว้
          </p>
        </RailCard>
      );
    }

    return (
      <RailCard icon="partner" title="Customer Insight" tone={!credit.withinLimit ? "warn" : "default"}>
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
        <RailRow label="ช่องทางขาย" value={String(s.channel ?? "")} />
        {!credit.withinLimit && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            เกินวงเงิน {money0(credit.overBy)} บาท — เสนอราคาได้ แต่ตอนอนุมัติคำขอขาย
            ฝ่ายบัญชีจะต้องพิจารณาเครดิตก่อน
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
          {row("Quote Date", toDisplayDate(s.quoteDate), "customer")}
          {row("Valid Until", toDisplayDate(s.validUntil), "customer")}
          {row("Price List", s.priceList, "customer")}
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
            <span className="text-[13px] font-semibold">มูลค่ารวม</span>
            <span className="ml-auto text-lg font-semibold tnum">{money(draftTotal(rows))}</span>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = QUOTATIONS.find((x) => x.code === code);

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
      quoteDate: toDisplayDate(s.quoteDate),
      validUntil: toDisplayDate(s.validUntil),
      currency: String(s.currency ?? "THB"),
      payTerm: String(s.payTerm ?? ""),
      priceList: String(s.priceList ?? ""),
      channel: String(s.channel ?? ""),
      customerRef: String(s.customerRef ?? ""),
      rejectReason: String(s.rejectReason ?? ""),
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
      QUOTATIONS.unshift({
        code,
        ...patch,
        status: "Draft",
        srRef: "",
        created: now,
        createdBy: FORM_USER,
        history: [
          { t: "Created", d: "สร้างใบเสนอราคาจากฟอร์ม", u: FORM_USER, when: now, kind: "primary" },
        ],
      } as unknown as QtRow);
    }

    decorateQuotations();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบเสนอราคาแล้ว",
      message: `${code} — ${patch.customer}`,
      goto: `/m/quotation/${encodeURIComponent(code)}`,
    });
  },
};
