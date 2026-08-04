import {
  PL_AREAS,
  PL_CHANNELS,
  PL_CUSTOMER_SCOPE,
  PL_RULE_TYPES,
  PL_STATUS,
  PL_TYPES,
} from "@/data/price-lists";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import {
  PRICE_LISTS,
  decoratePLs,
  plRuleSummary,
  type PriceListRow,
} from "@/lib/domain/pricing";
import { daysUntil, stamp, toDisplayDate, toInputDate } from "@/lib/format";
import type { FormSchema } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, isCreate, opts, saved } from "./common";

/* ============================================================
   PRICE LIST FORM — pricing POLICY only. Per-product prices are
   edited in the Product Pricing workspace, which is why this form
   never shows a product grid.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** Rule types whose `value` carries a percentage or an amount. */
const VALUED_RULES = new Set(["Markup", "Markdown", "Discount %", "Margin %"]);

const needsValue = (s: { rule?: { ruleType?: string } }) =>
  VALUED_RULES.has(String(s.rule?.ruleType ?? ""));

/** `cards` writes a flags object; the record stores an array of scope names. */
const scopeList = (flags: Record<string, boolean> | undefined) =>
  Object.entries(flags ?? {})
    .filter(([, on]) => on)
    .map(([k]) => k);

export const PRICE_LIST_FORM: FormSchema<PriceListRow> = {
  key: "price-list",
  entityLabel: "Price List",
  titleField: "name",
  saveButton: "Save Price List",
  statusBadge: {
    Active: "success",
    Draft: "warning",
    Inactive: "neutral",
    Expired: "danger",
  },

  blank: () => ({
    _mode: "create",
    code: "",
    name: "",
    desc: "",
    type: "Standard",
    currency: "THB",
    status: "Draft",
    priority: 5,
    effective: "",
    expiry: "",
    custGroup: "",
    channel: "",
    area: "All Areas",
    scopeFlags: {},
    priorityKey: "Price List",
    rule: {
      ruleType: "Fixed Price",
      value: 0,
      allowOverride: false,
      minMargin: 15,
      maxDiscount: 20,
      formula: "",
      rulePriority: 5,
    },
  }),

  toState: (p) => ({
    _mode: "edit",
    code: p.code,
    name: p.name,
    desc: p.desc,
    type: p.type,
    currency: p.currency,
    status: p.status,
    priority: p.priority,
    effective: toInputDate(p.effective),
    expiry: toInputDate(p.expiry),
    custGroup: p.custGroup,
    channel: p.channel,
    area: p.area,
    scopeFlags: Object.fromEntries((p.scope ?? []).map((k) => [k, true])),
    priorityKey: p.priorityKey,
    rule: { ...p.rule },
  }),

  steps: [
    /* ---------- 1. GENERAL ---------- */
    {
      key: "general",
      label: "General",
      railLabel: "ข้อมูลทั่วไป",
      labelTh: "รหัส ชื่อ และประเภท",
      blocks: () => [
        {
          type: "card",
          title: "Price List",
          cols: "2",
          fields: [
            {
              type: "text",
              path: "code",
              label: "Price List Code",
              required: true,
              placeholder: "PL-CLINIC-2026",
              when: isCreate,
            },
            {
              type: "static",
              path: "code",
              label: "Price List Code",
              when: (s) => !isCreate(s),
            },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: opts(PL_STATUS),
            },
            {
              type: "text",
              path: "name",
              label: "Price List Name",
              required: true,
              span: true,
              placeholder: "Clinic Price 2026",
            },
            {
              type: "select",
              path: "type",
              label: "Price List Type",
              required: true,
              options: opts(PL_TYPES),
            },
            {
              type: "select",
              path: "currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            { type: "textarea", path: "desc", label: "Description", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 2. VALIDITY ---------- */
    {
      key: "validity",
      label: "Validity",
      railLabel: "ช่วงเวลา",
      labelTh: "วันเริ่มและวันสิ้นสุด",
      blocks: () => [
        {
          type: "card",
          title: "Effective Period",
          cols: "3",
          fields: [
            { type: "date", path: "effective", label: "Effective Date", required: true },
            {
              type: "date",
              path: "expiry",
              label: "Expiry Date",
              hint: "เว้นว่างไว้หากไม่มีวันสิ้นสุด",
            },
            {
              type: "static",
              label: "สถานะช่วงเวลา",
              value: (s) => {
                if (!s.expiry) return "ไม่มีวันสิ้นสุด";
                const d = daysUntil(toDisplayDate(s.expiry));
                if (d === null) return "—";
                if (d < 0) return `หมดอายุแล้ว ${Math.abs(d)} วัน`;
                return `เหลืออีก ${d} วัน`;
              },
            },
          ],
        },
      ],
    },

    /* ---------- 3. SCOPE ---------- */
    {
      key: "scope",
      label: "Scope",
      railLabel: "ขอบเขต",
      labelTh: "ใช้กับลูกค้ากลุ่มใด",
      blocks: () => [
        {
          type: "cards",
          path: "scopeFlags",
          label: "Customer Scope",
          required: true,
          hint: "รายการราคานี้จะถูกเสนอให้ลูกค้ากลุ่มที่เลือกไว้เท่านั้น",
          cardOptions: PL_CUSTOMER_SCOPE.map((k) => ({ key: k, label: k })),
        },
        {
          type: "card",
          title: "Additional Scope",
          cols: "3",
          fields: [
            { type: "select", path: "channel", label: "Sales Channel", options: opts(PL_CHANNELS) },
            { type: "select", path: "area", label: "Area", options: opts(PL_AREAS) },
            {
              type: "text",
              path: "custGroup",
              label: "Customer Group",
              placeholder: "คลินิกทั่วไป",
            },
          ],
        },
      ],
    },

    /* ---------- 4. PRICING RULE ---------- */
    {
      key: "rule",
      label: "Pricing Rule",
      railLabel: "กฎการคิดราคา",
      labelTh: "สูตรและเพดานส่วนลด",
      blocks: (s) => [
        {
          type: "card",
          title: "Rule",
          cols: "3",
          badge: (
            <span className="text-cap text-ink-2">{plRuleSummary(s.rule)}</span>
          ),
          fields: [
            {
              type: "select",
              path: "rule.ruleType",
              label: "Rule Type",
              required: true,
              options: opts(PL_RULE_TYPES),
            },
            {
              type: "number",
              path: "rule.value",
              label: "Value (%)",
              min: 0,
              step: "0.1",
              when: needsValue,
              hint: "ใช้กับกฎแบบ Markup / Markdown / Discount / Margin",
            },
            {
              type: "text",
              path: "rule.formula",
              label: "Formula",
              when: (st) => st.rule?.ruleType === "Formula",
              placeholder: "cost * 1.35 + 20",
            },
            {
              type: "number",
              path: "priority",
              label: "Priority",
              required: true,
              min: 1,
              max: 99,
              hint: "ตัวเลขน้อย = ลำดับความสำคัญสูงกว่า",
            },
          ],
        },
        {
          type: "card",
          title: "Guard Rails",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "rule.minMargin",
              label: "Minimum Margin (%)",
              min: 0,
              max: 100,
              step: "0.5",
            },
            {
              type: "number",
              path: "rule.maxDiscount",
              label: "Maximum Discount (%)",
              min: 0,
              max: 100,
              step: "0.5",
            },
            {
              type: "toggle",
              path: "rule.allowOverride",
              label: "Allow Manual Override",
              onText: "แก้ราคาได้",
              offText: "ล็อกราคา",
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
    { path: "code", label: "Price List Code", step: "general" },
    { path: "name", label: "Price List Name", step: "general" },
    { path: "type", label: "Price List Type", step: "general" },
    { path: "currency", label: "Currency", step: "general" },
    { path: "status", label: "Status", step: "general" },
    { path: "effective", label: "Effective Date", step: "validity" },
    {
      path: "scopeFlags",
      label: "Customer Scope",
      step: "scope",
      test: (s) => scopeList(s.scopeFlags).length > 0,
    },
    { path: "rule.ruleType", label: "Rule Type", step: "rule" },
    { path: "priority", label: "Priority", step: "rule" },
  ],

  rules: [
    {
      label: "รหัสรายการราคาต้องไม่ซ้ำ",
      step: "general",
      test: (s) =>
        !isCreate(s) || !PRICE_LISTS.some((p) => p.code === String(s.code ?? "").trim()),
    },
    {
      label: "วันสิ้นสุดต้องอยู่หลังวันเริ่มใช้",
      step: "validity",
      test: (s) => !s.expiry || !s.effective || String(s.expiry) > String(s.effective),
    },
    {
      label: "รายการราคาที่ตั้งเป็น Active ต้องยังไม่หมดอายุ",
      step: "validity",
      test: (s) => {
        if (s.status !== "Active" || !s.expiry) return true;
        const d = daysUntil(toDisplayDate(s.expiry));
        return d === null || d >= 0;
      },
    },
    {
      label: "กฎแบบ Markup / Markdown / Discount / Margin ต้องระบุค่า",
      step: "rule",
      test: (s) => !needsValue(s) || num(s.rule?.value) > 0,
    },
    {
      label: "กฎแบบ Formula ต้องระบุสูตร",
      step: "rule",
      test: (s) => s.rule?.ruleType !== "Formula" || Boolean(String(s.rule?.formula ?? "").trim()),
    },
    {
      label: "ส่วนลดสูงสุดต้องไม่ทำให้กำไรต่ำกว่ากำไรขั้นต่ำ",
      step: "rule",
      test: (s) => num(s.rule?.maxDiscount) + num(s.rule?.minMargin) <= 100,
    },
    {
      label: "ลำดับความสำคัญต้องอยู่ระหว่าง 1–99",
      step: "rule",
      test: (s) => num(s.priority) >= 1 && num(s.priority) <= 99,
    },
  ],

  findDuplicates: (s) => {
    const type = String(s.type ?? "");
    const scope = scopeList(s.scopeFlags);
    if (!type || scope.length === 0) return [];
    return PRICE_LISTS.filter(
      (p) =>
        p.code !== s.code &&
        p.status === "Active" &&
        p.type === type &&
        (p.scope ?? []).some((k) => scope.includes(k)),
    )
      .slice(0, 3)
      .map((p) => ({
        code: p.code,
        name: p.name,
        why: `ทับซ้อนขอบเขต ${type}`,
      }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("price-list", code),

  sidePanel: (s) => {
    const scope = scopeList(s.scopeFlags);
    const headroom = 100 - num(s.rule?.maxDiscount) - num(s.rule?.minMargin);

    return (
      <RailCard icon="priceList" title="Rule Preview" tone={headroom < 0 ? "warn" : "default"}>
        <RailRow label="กฎการคิดราคา" value={plRuleSummary(s.rule)} />
        <RailRow label="ขอบเขตลูกค้า" value={scope.length ? scope.join(", ") : "ยังไม่ได้เลือก"} />
        <RailRow label="ช่องทาง" value={String(s.channel ?? "") || "ทุกช่องทาง"} />
        <RailRow label="พื้นที่" value={String(s.area ?? "") || "ทุกพื้นที่"} />
        <RailRow label="ลำดับความสำคัญ" value={num(s.priority)} />
        <RailRow
          label="ส่วนต่างที่เหลือ"
          value={`${headroom}%`}
          tone={headroom < 0 ? "danger" : headroom < 10 ? "warn" : "ok"}
        />
        {headroom < 0 && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            ส่วนลดสูงสุดกับกำไรขั้นต่ำรวมกันเกิน 100% — พนักงานขายจะไม่สามารถใช้ส่วนลดเต็มเพดานได้
          </p>
        )}
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = PRICE_LISTS.find((p) => p.code === code);

    const patch = {
      name: String(s.name ?? "").trim(),
      desc: String(s.desc ?? ""),
      type: String(s.type ?? ""),
      currency: String(s.currency ?? "THB"),
      status: String(s.status ?? "Draft"),
      priority: num(s.priority),
      effective: toDisplayDate(s.effective),
      expiry: toDisplayDate(s.expiry),
      custGroup: String(s.custGroup ?? ""),
      channel: String(s.channel ?? ""),
      area: String(s.area ?? ""),
      scope: scopeList(s.scopeFlags),
      priorityKey: String(s.priorityKey ?? "Price List"),
      rule: {
        ruleType: String(s.rule?.ruleType ?? "Fixed Price"),
        value: num(s.rule?.value),
        allowOverride: Boolean(s.rule?.allowOverride),
        minMargin: num(s.rule?.minMargin),
        maxDiscount: num(s.rule?.maxDiscount),
        formula: String(s.rule?.formula ?? ""),
        rulePriority: num(s.priority),
      },
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Price list updated",
        d: "แก้ไขนโยบายราคาจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      PRICE_LISTS.push({
        code,
        ...patch,
        productsCount: 0,
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Price list created",
            d: "สร้างรายการราคาจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as PriceListRow);
    }

    decoratePLs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างรายการราคาแล้ว",
      message: `${code} — ${patch.name}`,
      goto: `/m/price-list/${encodeURIComponent(code)}`,
    });
  },
};
