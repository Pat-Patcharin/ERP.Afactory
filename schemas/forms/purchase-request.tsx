import type { PurchaseRequest } from "@/data/purchase-requests";
import { PR_DEPARTMENTS, PR_PRIORITY, PR_REQUESTERS } from "@/data/purchase-requests";
import { OPT } from "@/data/options";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import {
  PURCHASE_REQUESTS,
  decoratePRs,
  nextPRCode,
  prLineTotal,
  prTotal,
  type PrRow,
} from "@/lib/domain/purchase";
import { fmt, money, stamp, isoToDmy, dmyToIso, today } from "@/lib/format";
import type { FormSchema, GridRow, LookupHit } from "@/lib/types";
import {
  FORM_USER,
  RailCard,
  RailRow,
  RailTotal,
  ReviewCard,
  isCreate,
  opts,
  saved,
} from "./common";

/* ============================================================
   PURCHASE REQUEST FORM

   The line grid is the point of this form: picking a product pulls
   its live stock position onto the row, so the requester sees why
   the quantity they are about to type is or is not sensible.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/**
 * Live stock for a line. Read on demand rather than copied onto the row, so
 * the figures can never drift from the product master while the form is open.
 */
const lineStock = (row: GridRow) => productStock(String(row.code ?? ""));

const isBelowRop = (row: GridRow) => {
  const st = lineStock(row);
  return Boolean(st) && st!.available <= st!.rop;
};

export const PR_FORM: FormSchema<PrRow> = {
  key: "purchase-request",
  entityLabel: "Purchase Request",
  saveButton: "Save Purchase Request",
  statusBadge: {
    Draft: "neutral",
    Open: "warning",
    Approved: "success",
    Rejected: "danger",
    Converted: "info",
    Cancelled: "neutral",
  },

  blank: () => ({
    _mode: "create",
    code: nextPRCode(),
    dept: "",
    requester: "",
    priority: "Normal",
    date: dmyToIso(today()),
    needBy: "",
    warehouse: "",
    supplier: "",
    note: "",
    status: "Draft",
    items: [],
  }),

  toState: (pr) => ({
    _mode: "edit",
    code: pr.code,
    dept: pr.dept,
    requester: pr.requester,
    priority: pr.priority,
    date: dmyToIso(pr.date),
    needBy: dmyToIso(pr.needBy),
    warehouse: pr.warehouse,
    supplier: pr.supplier,
    note: pr.note,
    status: pr.status,
    items: (pr.items ?? []).map((it) => ({ ...it })),
  }),

  steps: [
    /* ---------- 1. HEADER ---------- */
    {
      key: "header",
      label: "Request",
      railLabel: "ข้อมูลใบขอซื้อ",
      labelTh: "ผู้ขอและกำหนดที่ต้องการ",
      blocks: () => [
        {
          type: "card",
          title: "Request Header",
          cols: "3",
          fields: [
            { type: "static", path: "code", label: "PR Number" },
            {
              type: "select",
              path: "dept",
              label: "Department",
              required: true,
              options: opts(PR_DEPARTMENTS),
            },
            {
              type: "select",
              path: "requester",
              label: "Requester",
              required: true,
              options: opts(PR_REQUESTERS),
            },
            {
              type: "select",
              path: "priority",
              label: "Priority",
              required: true,
              options: opts(PR_PRIORITY),
            },
            { type: "date", path: "date", label: "Request Date", required: true },
            {
              type: "date",
              path: "needBy",
              label: "Need By Date",
              required: true,
              hint: "วันที่ต้องการใช้ของ — ใช้คำนวณว่าทันหรือไม่",
            },
            {
              type: "select",
              path: "warehouse",
              label: "Deliver To Warehouse",
              required: true,
              options: WAREHOUSES.map((w) => `${w.code} ${w.name}`),
            },
            {
              type: "select",
              path: "supplier",
              label: "Suggested Supplier",
              options: opts(OPT.supplier),
              hint: "ไม่บังคับ — ฝ่ายจัดซื้อเป็นผู้เลือกผู้ขายจริง",
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
      labelTh: "สินค้าและจำนวนที่ขอ",
      blocks: () => [
        {
          type: "grid",
          path: "items",
          label: "Requested Items",
          required: true,
          addLabel: "เพิ่มรายการสินค้า",
          empty: "ยังไม่มีรายการ — พิมพ์รหัสหรือชื่อสินค้าในช่อง Product เพื่อค้นหา",
          hint: "คอลัมน์ Available / ROP / แนะนำ มาจากสต๊อกจริงของสินค้าที่เลือก",
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
            { key: "unit", label: "Unit", type: "static", muted: true, width: "70px" },
            {
              key: "avail",
              label: "Available",
              type: "computed",
              align: "right",
              get: (r) => {
                const st = lineStock(r);
                return st ? fmt(st.available) : "—";
              },
              cls: (r) => (isBelowRop(r) ? "font-semibold text-danger" : ""),
            },
            {
              key: "rop",
              label: "ROP",
              type: "computed",
              align: "right",
              muted: true,
              get: (r) => {
                const st = lineStock(r);
                return st ? fmt(st.rop) : "—";
              },
            },
            {
              key: "suggested",
              label: "แนะนำ",
              type: "computed",
              align: "right",
              get: (r) => {
                const st = lineStock(r);
                return st ? fmt(st.suggested) : "—";
              },
            },
            { key: "qty", label: "Qty", type: "number", align: "right", required: true, width: "90px" },
            { key: "price", label: "Est. Price", type: "number", align: "right", width: "110px" },
            {
              key: "total",
              label: "Line Total",
              type: "computed",
              align: "right",
              get: (r) => money(prLineTotal(r)),
            },
            { key: "note", label: "Note", type: "text", width: "150px" },
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
              label: "Reason for Request",
              span: true,
              rows: 3,
              placeholder: "อธิบายเหตุผลที่ต้องขอซื้อ เช่น สต๊อกต่ำกว่าจุดสั่งซื้อ หรือมีคำสั่งซื้อจากลูกค้า",
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
    { path: "dept", label: "Department", step: "header" },
    { path: "requester", label: "Requester", step: "header" },
    { path: "priority", label: "Priority", step: "header" },
    { path: "date", label: "Request Date", step: "header" },
    { path: "needBy", label: "Need By Date", step: "header" },
    { path: "warehouse", label: "Deliver To Warehouse", step: "header" },
    {
      path: "items",
      label: "รายการสินค้าอย่างน้อย 1 บรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).some((r) => String(r.code ?? "").trim()),
    },
  ],

  rules: [
    {
      label: "วันที่ต้องการใช้ต้องไม่อยู่ก่อนวันที่ขอ",
      step: "header",
      test: (s) => !s.needBy || !s.date || String(s.needBy) >= String(s.date),
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
      label: "จำนวนที่ขอต้องมากกว่า 0 ทุกบรรทัด",
      step: "items",
      test: (s) => ((s.items ?? []) as GridRow[]).every((r) => num(r.qty) > 0),
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
          meta: `คงเหลือ ${fmt(p.availTotal)} ${p.unit}`,
        }));
    },
  },

  onLookupPick: (source, path, index, hit, s) => {
    if (source !== "product") return;
    const rows = (s[path] ?? []) as GridRow[];
    const row = rows[index];
    if (!row) return;

    const st = productStock(hit.code);
    row.code = hit.code;
    row.name = hit.name;
    row.unit = st?.unit ?? "";
    row.price = st?.lastCost ?? 0;
    /* Pre-fill the suggested top-up, which is the number the requester
       usually wants — they can still overwrite it. */
    if (!num(row.qty)) row.qty = st?.suggested || 0;
  },

  newRow: () => ({ code: "", name: "", unit: "", qty: "", price: "", note: "" }),

  previewCard: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <RailCard icon="purchaseRequest" title="Request Preview" tone="accent">
        <RailRow label="เลขที่ใบขอซื้อ" value={String(s.code ?? "")} />
        <RailRow label="จำนวนรายการ" value={rows.length} />
        <RailRow
          label="จำนวนหน่วยรวม"
          value={fmt(rows.reduce((t, r) => t + num(r.qty), 0))}
        />
        <RailTotal label="มูลค่าประมาณการ" value={money(prTotal({ items: rows }))} />
      </RailCard>
    );
  },

  sidePanel: (s) => {
    const rows = (s.items ?? []) as GridRow[];
    const low = rows.filter(isBelowRop);
    const overSuggested = rows.filter((r) => {
      const st = lineStock(r);
      return st && st.suggested > 0 && num(r.qty) > st.suggested * 2;
    });

    return (
      <RailCard
        icon="bulb"
        title="Purchasing Insight"
        tone={low.length ? "warn" : "default"}
      >
        <RailRow
          label="ต่ำกว่าจุดสั่งซื้อ"
          value={`${low.length} รายการ`}
          tone={low.length ? "warn" : "ok"}
        />
        <RailRow label="ขอเกินคำแนะนำมาก" value={`${overSuggested.length} รายการ`} />
        <RailRow label="ผู้ขายที่เสนอ" value={String(s.supplier ?? "") || "ยังไม่ระบุ"} />
        {low.length > 0 && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            {low
              .slice(0, 3)
              .map((r) => r.code)
              .join(", ")}
            {low.length > 3 ? ` และอีก ${low.length - 3} รายการ` : ""} อยู่ต่ำกว่าจุดสั่งซื้อ —
            ใบขอซื้อนี้มีเหตุผลรองรับชัดเจน
          </p>
        )}
        {overSuggested.length > 0 && (
          <p className="mt-2 text-cap leading-relaxed text-ink-2">
            บางรายการขอมากกว่าคำแนะนำเกินสองเท่า — ผู้อนุมัติมักขอเหตุผลเพิ่มเติม
          </p>
        )}
      </RailCard>
    );
  },

  reviewCards: (s, row) => {
    const rows = (s.items ?? []) as GridRow[];
    return (
      <>
        <ReviewCard title="Request Header">
          {row("PR Number", s.code, "header")}
          {row("Department", s.dept, "header")}
          {row("Requester", s.requester, "header")}
          {row("Priority", s.priority, "header")}
          {row("Request Date", isoToDmy(s.date), "header")}
          {row("Need By Date", isoToDmy(s.needBy), "header")}
          {row("Deliver To", s.warehouse, "header")}
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
              <span className="w-24 text-right font-medium tnum">{money(prLineTotal(r))}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-3 pt-3">
            <span className="text-[13px] font-semibold">มูลค่าประมาณการรวม</span>
            <span className="ml-auto text-lg font-semibold tnum">
              {money(prTotal({ items: rows }))}
            </span>
          </div>
        </ReviewCard>
      </>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PURCHASE_REQUESTS.find((p) => p.code === code);

    const items = ((s.items ?? []) as GridRow[])
      .filter((r) => String(r.code ?? "").trim())
      .map((r) => ({
        code: String(r.code).trim(),
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        qty: num(r.qty),
        price: num(r.price),
        note: String(r.note ?? ""),
      }));

    const patch = {
      dept: String(s.dept ?? ""),
      requester: String(s.requester ?? ""),
      priority: String(s.priority ?? "Normal"),
      date: isoToDmy(s.date),
      needBy: isoToDmy(s.needBy),
      warehouse: String(s.warehouse ?? ""),
      supplier: String(s.supplier ?? ""),
      note: String(s.note ?? ""),
      /* A1 made these three required on the record and taught the document
         editor to write them. This form is the OTHER way a purchase request
         gets created, and it kept building one without them — the double cast
         below meant the compiler had nothing to say about it. Found by taking
         the cast off, which is the whole point of A1c. */
      headerDisc: num(s.headerDisc),
      freight: num(s.freight),
      otherCharges: num(s.otherCharges),
      items,
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
    } else {
      const fresh: PurchaseRequest = {
        code,
        ...patch,
        status: "Draft",
        approvals: [],
        created: now,
        createdBy: FORM_USER(),
      };
      PURCHASE_REQUESTS.unshift(fresh as PrRow);
    }

    decoratePRs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างใบขอซื้อแล้ว",
      message: isCreate(s)
        ? `${code} — สถานะ Draft พร้อมส่งขออนุมัติ`
        : `${code} — ${items.length} รายการ`,
      goto: `/m/purchase-request/${encodeURIComponent(code)}`,
    });
  },
};
