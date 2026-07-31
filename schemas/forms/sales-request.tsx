import {
  SR_CHANNELS,
  SR_PRICE_LISTS,
  SR_PRIORITY,
  SR_REJECT_REASONS,
} from "@/data/sales-requests";
import { PAY_TERMS } from "@/data/partners";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { docGrandTotal, lineNet } from "@/lib/domain/lines";
import {
  SALES_REQUESTS,
  availabilityFor,
  convertibleQuotations,
  creditCheck,
  customerOptions,
  decorateSalesRequests,
  getCustomer,
  getQT,
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

   The required entry point of the outbound process. It may start
   from an accepted quotation or from nothing at all — the customer
   simply phoned. Either way it goes through internal approval
   before an order exists, and it never reserves stock.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const draftTotal = (rows: GridRow[]) => docGrandTotal({ items: rows });

export const SR_FORM: FormSchema<SrRow> = {
  key: "sales-request",
  entityLabel: "Sales Request",
  saveButton: "Save Sales Request",
  statusBadge: {
    Draft: "neutral",
    Submitted: "warning",
    Approved: "success",
    Rejected: "danger",
    Converted: "info",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextSalesRequestCode(),
    quotationRef: "",
    customerPick: "",
    customer: "",
    customerCode: "",
    salesRep: "",
    requestDate: toInputDate(today()),
    requiredDate: "",
    status: "Draft",
    priority: "Normal",
    warehouse: "",
    currency: "THB",
    payTerm: "เครดิต 30 วัน",
    priceList: "PL-STD-2026 Standard",
    channel: "Direct",
    customerRef: "",
    rejectReason: "",
    note: "",
    items: [],
  }),

  toState: (sr) => ({
    _mode: "edit",
    code: sr.code,
    quotationRef: sr.quotationRef,
    customerPick: `${sr.customerCode} - ${sr.customer}`,
    customer: sr.customer,
    customerCode: sr.customerCode,
    salesRep: sr.salesRep,
    requestDate: toInputDate(sr.requestDate),
    requiredDate: toInputDate(sr.requiredDate),
    status: sr.status,
    priority: sr.priority,
    warehouse: sr.warehouse,
    currency: sr.currency,
    payTerm: sr.payTerm,
    priceList: sr.priceList,
    channel: sr.channel,
    customerRef: sr.customerRef,
    rejectReason: sr.rejectReason,
    note: sr.note,
    items: (sr.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. REQUEST ---------- */
    {
      key: "request",
      label: "Request",
      railLabel: "คำขอ",
      labelTh: "ลูกค้าและกำหนดที่ต้องการ",
      blocks: () => [
        {
          type: "note",
          label: "คำขอขายไม่จองสต๊อก",
          text: "เอกสารนี้บันทึกความต้องการของลูกค้าและผ่านการอนุมัติภายใน — สต๊อกจะถูกจองเมื่อยืนยันใบสั่งขายเท่านั้น",
        },
        {
          type: "card",
          title: "Request Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "Request No." },
            {
              type: "select",
              path: "quotationRef",
              label: "Source Quotation (ไม่บังคับ)",
              options: convertibleQuotations().map((q) => q.code),
              hint: "เลือกใบเสนอราคาที่ลูกค้าตอบรับ เพื่อดึงลูกค้าและรายการมาทั้งชุด — เว้นว่างได้หากลูกค้าติดต่อตรง",
              when: (s) => s._mode === "create",
            },
            {
              type: "static",
              path: "quotationRef",
              label: "Source Quotation",
              value: (s) => String(s.quotationRef ?? "") || "ไม่มี — ลูกค้าติดต่อตรง",
              when: (s) => s._mode !== "create",
            },
            {
              type: "select",
              path: "customerPick",
              label: "Customer",
              required: true,
              options: customerOptions(),
              hint: "ระบบดึงเงื่อนไขชำระและพนักงานขายจากคู่ค้าให้อัตโนมัติ",
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
              path: "requiredDate",
              label: "Required Date",
              required: true,
              hint: "วันที่ลูกค้าต้องการของ — ใช้เป็นกำหนดส่งของใบสั่งขาย",
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
              label: "Preferred Warehouse",
              required: true,
              options: warehouseOptions(),
              hint: "คลังที่คาดว่าจะจ่ายของ — ยังไม่ผูกสต๊อกในขั้นนี้",
            },
            {
              type: "text",
              path: "customerRef",
              label: "Customer Reference",
              placeholder: "PO-DS-69-0331",
            },
            {
              type: "select",
              path: "rejectReason",
              label: "Reject Reason",
              options: opts(SR_REJECT_REASONS),
              when: (s) => s.status === "Rejected",
              hint: "บันทึกไว้ให้พนักงานขายติดตามกับลูกค้า",
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
      labelTh: "สินค้าที่ลูกค้าขอ",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Requested Items",
          required: true,
          addLabel: "เพิ่มรายการสินค้า",
          empty: "ยังไม่มีรายการ — เลือกใบเสนอราคาในขั้นแรก หรือค้นหาสินค้าที่นี่",
          hint: "คอลัมน์ Available / ขาด เป็นข้อมูลอ้างอิง ณ ขณะนี้ — คำขอขายไม่จองสต๊อก",
          cols: [
            {
              key: "code",
              label: "Product",
              type: "lookup",
              source: "product",
              required: true,
              width: "155px",
              placeholder: "ค้นหาสินค้า...",
            },
            { key: "name", label: "Product Name", type: "static", muted: true, width: "190px" },
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
                return a && a.shortBy > 0 ? "font-semibold text-warning-text" : "";
              },
            },
            { key: "price", label: "Unit Price", type: "number", align: "right", required: true, width: "105px" },
            { key: "disc", label: "Disc %", type: "number", align: "right", width: "78px" },
            { key: "tax", label: "Tax %", type: "number", align: "right", width: "78px" },
            {
              key: "net",
              label: "Net Amount",
              type: "computed",
              align: "right",
              get: (r) => money(lineNet(r)),
            },
            { key: "note", label: "Note", type: "text", width: "130px" },
          ],
        },
        {
          type: "card",
          title: "Justification",
          cols: "2",
          fields: [
            {
              type: "textarea",
              path: "note",
              label: "Note",
              span: true,
              rows: 3,
              placeholder: "บริบทที่ผู้อนุมัติควรรู้ เช่น ลูกค้าประจำ สั่งซ้ำทุกเดือน หรือขอส่วนลดพิเศษเพราะปริมาณมาก",
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
    { path: "customerPick", label: "Customer", step: "request" },
    { path: "salesRep", label: "Sales Representative", step: "request" },
    { path: "requestDate", label: "Request Date", step: "request" },
    { path: "requiredDate", label: "Required Date", step: "request" },
    { path: "priority", label: "Priority", step: "request" },
    { path: "priceList", label: "Price List", step: "request" },
    { path: "currency", label: "Currency", step: "request" },
    { path: "warehouse", label: "Preferred Warehouse", step: "request" },
    {
      path: "rejectReason",
      label: "Reject Reason",
      step: "request",
      test: (s) => s.status !== "Rejected" || Boolean(s.rejectReason),
    },
    {
      path: "items",
      label: "รายการสินค้าอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันที่ลูกค้าต้องการของต้องไม่อยู่ก่อนวันที่ขอ",
      step: "request",
      test: (s) =>
        !s.requiredDate || !s.requestDate || String(s.requiredDate) >= String(s.requestDate),
    },
    {
      label: "ลูกค้าที่เลือกต้องมีบทบาท Customer หรือ Dealer",
      step: "request",
      test: (s) => {
        if (!s.customerPick) return true;
        const bp = getCustomer(String(s.customerPick));
        return Boolean(bp?.roles?.customer || bp?.roles?.dealer);
      },
    },
    {
      label: "ลูกค้าที่เลือกต้องไม่อยู่ในสถานะ Blocked",
      step: "request",
      test: (s) =>
        !s.customerPick || getCustomer(String(s.customerPick))?.status !== "Blocked",
    },
    {
      label: "ใบเสนอราคาที่อ้างอิงต้องเป็นของลูกค้ารายเดียวกัน",
      step: "request",
      test: (s) => {
        if (!s.quotationRef || !s.customerCode) return true;
        return getQT(String(s.quotationRef))?.customerCode === s.customerCode;
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
    /* Picking the customer adopts their commercial defaults. */
    if (path === "customerPick") {
      const bp = getCustomer(String(s.customerPick ?? ""));
      if (!bp) return;
      s.customerCode = bp.code;
      s.customer = bp.nameTh || bp.nameEn;
      if (bp.sales?.payTerm) s.payTerm = bp.sales.payTerm;
      if (bp.sales?.rep) s.salesRep = bp.sales.rep;
      if (bp.cls?.channel) s.channel = bp.cls.channel;
      return;
    }

    /* An accepted quotation carries the customer and the agreed prices. */
    if (path === "quotationRef") {
      const qt = getQT(String(s.quotationRef ?? ""));
      if (!qt) return;
      s.customerPick = `${qt.customerCode} - ${qt.customer}`;
      s.customerCode = qt.customerCode;
      s.customer = qt.customer;
      s.salesRep = qt.salesRep;
      s.currency = qt.currency;
      s.payTerm = qt.payTerm;
      s.priceList = qt.priceList;
      s.channel = qt.channel;
      s.customerRef = qt.customerRef;
      s.requiredDate = toInputDate(qt.validUntil);
      s.items = (qt.items ?? []).map((it) => ({ ...it }));
    }
  },

  newRow: () => ({ code: "", name: "", unit: "", qty: "", price: "", disc: 0, tax: 7, note: "" }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <RailCard icon="salesRequest" title="Request Preview" tone="accent">
        <RailRow label="เลขที่" value={String(s.code ?? "")} />
        <RailRow label="ลูกค้า" value={String(s.customer ?? "") || "ยังไม่ได้เลือก"} />
        <RailRow
          label="ที่มา"
          value={String(s.quotationRef ?? "") || "ลูกค้าติดต่อตรง"}
        />
        <RailRow label="จำนวนรายการ" value={rows.length} />
        <RailRow label="ต้องการวันที่" value={toDisplayDate(s.requiredDate) || "—"} />
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
    const short = rows
      .map((r) => ({ row: r, a: availabilityFor(String(r.code ?? ""), num(r.qty)) }))
      .filter((x) => x.a && x.a.shortBy > 0);

    if (!s.customerPick) {
      return (
        <RailCard icon="shield" title="Approval Readiness">
          <p className="text-cap leading-relaxed text-ink-2">
            เลือกลูกค้าและใส่รายการสินค้า เพื่อดูว่าคำขอนี้จะผ่านการอนุมัติภายในได้หรือไม่
          </p>
        </RailCard>
      );
    }

    return (
      <RailCard
        icon="shield"
        title="Approval Readiness"
        tone={!credit.withinLimit ? "warn" : "default"}
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
          label="สินค้าสต๊อกไม่พอตอนนี้"
          value={`${short.length} รายการ`}
          tone={short.length ? "warn" : "ok"}
        />
        {!credit.withinLimit && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            เกินวงเงิน {money0(credit.overBy)} บาท — ผู้อนุมัติยังอนุมัติคำขอได้
            แต่ใบสั่งขายที่แปลงออกมาจะถูกตั้งเป็น On Hold
          </p>
        )}
        {short.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            {short.slice(0, 3).map((x) => x.row.code).join(", ")} มีไม่พอ ณ ขณะนี้ —
            คำขอขายไม่จองสต๊อก จึงยังส่งขออนุมัติได้ แต่ควรแจ้งกำหนดส่งให้ลูกค้าตามจริง
          </p>
        )}
      </RailCard>
    );
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <>
        <ReviewCard title="Request & Terms">
          {row("Request No.", s.code, "request")}
          {row("Source Quotation", s.quotationRef || "ไม่มี — ลูกค้าติดต่อตรง", "request")}
          {row("Customer", s.customer, "request")}
          {row("Sales Rep", s.salesRep, "request")}
          {row("Request Date", toDisplayDate(s.requestDate), "request")}
          {row("Required Date", toDisplayDate(s.requiredDate), "request")}
          {row("Price List", s.priceList, "request")}
          {row("Preferred Warehouse", s.warehouse, "request")}
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
    const quotationRef = String(s.quotationRef ?? "");

    const patch = {
      quotationRef,
      customer: bp ? bp.nameTh || bp.nameEn : String(s.customer ?? ""),
      customerCode: bp?.code ?? String(s.customerCode ?? ""),
      salesRep: String(s.salesRep ?? ""),
      requestDate: toDisplayDate(s.requestDate),
      requiredDate: toDisplayDate(s.requiredDate),
      priority: String(s.priority ?? "Normal"),
      warehouse: String(s.warehouse ?? ""),
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
        t: "Sales request updated",
        d: "แก้ไขคำขอขายจากฟอร์ม",
        u: FORM_USER,
        when: now,
        kind: "primary",
      });
    } else {
      SALES_REQUESTS.unshift({
        code,
        ...patch,
        /* Approval is a deliberate step — a new request always starts as Draft. */
        status: "Draft",
        approvedBy: "",
        approvedDate: "",
        soRef: "",
        created: now,
        createdBy: FORM_USER,
        history: [
          {
            t: quotationRef ? `Created from ${quotationRef}` : "Created",
            d: quotationRef
              ? "สร้างคำขอขายจากใบเสนอราคาที่ลูกค้าตอบรับ"
              : "สร้างคำขอขายจากฟอร์ม (ลูกค้าติดต่อตรง)",
            u: FORM_USER,
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as SrRow);

      /* Close the loop on the quotation this request came from. */
      const qt = getQT(quotationRef);
      if (qt && !qt.srRef) {
        qt.srRef = code;
        qt.status = "Converted";
        qt.updated = now;
      }
    }

    decorateSalesRequests();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างคำขอขายแล้ว",
      message: `${code} — ${patch.customer}`,
      goto: `/m/sales-request/${encodeURIComponent(code)}`,
    });
  },
};
