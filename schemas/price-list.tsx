import {
  PRICE_LISTS,
  decoratePLs,
  plRuleSummary,
  type PriceListRow,
} from "@/lib/domain/pricing";
import {
  PL_CHANNELS,
  PL_CUSTOMER_SCOPE,
  PL_STATUS,
  PL_TYPES,
} from "@/data/price-lists";
import { PL_TONE, PL_TYPE_TONE, tone } from "@/lib/badges";
import { fmt } from "@/lib/format";
import type { DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { PriorityLadder } from "@/components/pricing/PriorityLadder";
import { PRICE_LIST_FORM } from "./forms/price-list";

/* ============================================================
   PRICE LIST — pricing POLICY: scope, validity and priority
   rules. The per-product prices live in the Product Pricing
   workspace, not here.
   ============================================================ */

export const PL_LIST: ListSchema<PriceListRow> = {
  key: "price-list",
  entity: "Price List",
  entityPlural: "Price Lists",
  title: "Price List Master",
  subtitle: "จัดการนโยบายราคา ขอบเขตลูกค้า ช่วงเวลาใช้งาน และลำดับความสำคัญของราคา",
  crumb: "Price List",
  primaryLabel: "New Price List",
  searchPlaceholder: "ค้นหารหัส ชื่อ ประเภทราคา หรือกลุ่มลูกค้า...",
  emptyTitle: "ไม่พบ Price List ที่ตรงกับเงื่อนไข",

  source: () => PRICE_LISTS,
  searchFields: ["code", "name", "desc", "type", "custGroup", "scopeText"],

  tabs: [
    { key: "all", label: "All" },
    { key: "active", label: "Active", test: (p) => p.status === "Active" },
    { key: "draft", label: "Draft", test: (p) => p.status === "Draft" },
    { key: "inactive", label: "Inactive", test: (p) => p.status === "Inactive" },
    { key: "expired", label: "Expired", test: (p) => p.status === "Expired" },
  ],

  filters: [
    { id: "type", label: "Price Type", options: () => [...PL_TYPES], test: (p, v) => p.type === v },
    {
      id: "currency",
      label: "Currency",
      options: () => [...new Set(PRICE_LISTS.map((p) => p.currency))],
      test: (p, v) => p.currency === v,
    },
    {
      id: "custGroup",
      label: "Customer Group",
      options: () => [...new Set(PRICE_LISTS.map((p) => p.custGroup))],
      test: (p, v) => p.custGroup === v,
    },
    { id: "channel", label: "Sales Channel", options: () => [...PL_CHANNELS], test: (p, v) => p.channel === v },
    { id: "status", label: "Status", options: () => [...PL_STATUS], test: (p, v) => p.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "Price List Code",
      sortable: true,
      cell: (p) => (
        <CellMedia>
          <Thumb>{p.icon}</Thumb>
          <span className="font-medium">{p.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "name",
      label: "Name",
      cell: (p) => (
        <>
          {p.name}
          <CellSub>{p.desc.length > 42 ? `${p.desc.slice(0, 42)}…` : p.desc}</CellSub>
        </>
      ),
    },
    {
      key: "type",
      label: "Price Type",
      sortable: true,
      cell: (p) => <Badge tone={tone(PL_TYPE_TONE, p.type)}>{p.type}</Badge>,
    },
    { key: "currency", label: "Currency", muted: true, cell: (p) => p.currency },
    { key: "priority", label: "Priority", align: "right", sortable: true, cell: (p) => fmt(p.priority) },
    { key: "custGroup", label: "Customer Group", cell: (p) => p.custGroup },
    { key: "channel", label: "Channel", muted: true, cell: (p) => p.channel },
    { key: "effective", label: "Effective", muted: true, sortable: true, cell: (p) => p.effective },
    {
      key: "expiry",
      label: "Expiry",
      cell: (p) =>
        p.isExpiring ? (
          <span className="font-semibold text-warning-text">{p.expiry}</span>
        ) : p.isExpired ? (
          <span className="font-bold text-danger-text">{p.expiry}</span>
        ) : (
          p.expiry
        ),
    },
    {
      key: "productsCount",
      label: "Products",
      align: "right",
      cell: (p) => fmt(p.productsCount),
    },
    {
      key: "status",
      label: "Status",
      cell: (p) => <Badge tone={tone(PL_TONE, p.status)}>{p.status}</Badge>,
    },
  ],

  rowActions: (pl, ctx) => {
    const setStatus = (r: PriceListRow, st: string, msg: string, t?: "info") => {
      r.status = st;
      decoratePLs();
      ctx.refresh();
      ctx.toast(msg, r.code, t);
    };
    return [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("price-list", r) },
      { label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/price-list/${r.code}/edit`) },
      { sep: true },
      ...(pl.status === "Draft"
        ? ([{ label: "Activate", icon: "check", run: (r: PriceListRow) => setStatus(r, "Active", "เปิดใช้งานแล้ว") }] as const)
        : []),
      ...(pl.status === "Active"
        ? ([
            {
              label: "Deactivate",
              icon: "circleSlash",
              run: (r: PriceListRow) => setStatus(r, "Inactive", "ปิดใช้งานแล้ว", "info"),
            },
          ] as const)
        : []),
      ...(pl.status === "Inactive" || pl.status === "Expired"
        ? ([{ label: "Reactivate", icon: "refresh", run: (r: PriceListRow) => setStatus(r, "Active", "กลับมาใช้งานแล้ว") }] as const)
        : []),
      {
        label: "Open Product Pricing",
        icon: "pricing",
        run: () => ctx.goto("/pricing"),
      },
      { sep: true },
      {
        label: "Delete",
        icon: "trash",
        danger: true,
        run: (r) =>
          ctx.confirm({
            title: "Delete this price list?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.name} จะถูกลบถาวร
              </>
            ),
            confirmText: "Delete Price List",
            onConfirm: () => {
              const i = PRICE_LISTS.indexOf(r);
              if (i > -1) PRICE_LISTS.splice(i, 1);
              decoratePLs();
              ctx.refresh();
              ctx.toast("ลบ Price List แล้ว", r.code, "danger");
            },
          }),
      },
    ];
  },
};

export const PL_DETAIL: DetailSchema<PriceListRow> = {
  key: "price-list",
  entityLabel: "Price List",

  identity: (pl) => ({
    image: pl.icon,
    code: pl.code,
    title: pl.name,
    copyFields: [
      { label: "Price list code", value: pl.code },
      { label: "Priority", value: String(pl.priority) },
    ],
    badges: [
      { text: pl.status, tone: tone(PL_TONE, pl.status) },
      { text: pl.type, tone: tone(PL_TYPE_TONE, pl.type) },
    ],
    tags: [pl.currency, pl.custGroup, pl.channel, `${fmt(pl.productsCount)} products`],
  }),

  kpis: (pl) => [
    { icon: "tag", label: "Price Type", value: pl.type, sub: pl.currency, goTab: "overview" },
    { icon: "shield", label: "Priority", value: fmt(pl.priority), sub: "ลำดับ", goTab: "rule" },
    { icon: "box", label: "Products", value: fmt(pl.productsCount), sub: "รายการ", goTab: "overview" },
    { icon: "clock", label: "Valid Until", value: pl.expiry, sub: pl.status, wide: true, goTab: "overview" },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (pl) => [
        {
          type: "fields",
          title: "Price List Information",
          cols: 2,
          items: [
            { label: "Price List Code", value: pl.code },
            { label: "Price List Name", value: pl.name },
            { label: "Price Type", value: <Badge tone={tone(PL_TYPE_TONE, pl.type)}>{pl.type}</Badge> },
            { label: "Status", value: <Badge tone={tone(PL_TONE, pl.status)}>{pl.status}</Badge> },
            { label: "Currency", value: pl.currency },
            { label: "Priority", value: fmt(pl.priority) },
            { label: "Effective Date", value: pl.effective },
            {
              label: "Expiry Date",
              value: pl.isExpiring ? (
                <span className="font-semibold text-warning-text">{pl.expiry}</span>
              ) : (
                pl.expiry
              ),
            },
            { label: "Products Count", value: fmt(pl.productsCount) },
          ],
        },
        { type: "note", title: "Description", text: pl.desc },
        {
          type: "fields",
          title: "Applicability",
          cols: 2,
          items: [
            { label: "Customer Group", value: pl.custGroup },
            { label: "Sales Channel", value: pl.channel },
            { label: "Area / Territory", value: pl.area },
            {
              label: "Allow Override",
              value: pl.rule.allowOverride ? (
                <Badge tone="success">อนุญาต</Badge>
              ) : (
                <Badge tone="neutral">ไม่อนุญาต</Badge>
              ),
            },
          ],
        },
        {
          type: "fields",
          title: "System Information",
          cols: 2,
          items: [
            { label: "Created By", value: pl.createdBy, muted: true },
            { label: "Created Date", value: pl.created, muted: true },
            { label: "Last Updated By", value: pl.updatedBy, muted: true },
            { label: "Last Updated", value: pl.updated, muted: true },
          ],
        },
      ],
    },

    {
      key: "scope",
      label: "Customer Scope",
      blocks: (pl) => [
        {
          type: "fields",
          title: "Scope Definition",
          cols: 2,
          items: [
            { label: "Customer Group", value: pl.custGroup },
            { label: "Sales Channel", value: pl.channel },
            { label: "Area / Territory", value: pl.area },
          ],
        },
        {
          type: "node",
          title: "Applies To",
          node: (
            <div className="flex flex-wrap gap-2">
              {PL_CUSTOMER_SCOPE.map((sc) => {
                const on = (pl.scope ?? []).includes(sc);
                return (
                  <span
                    key={sc}
                    className={
                      on
                        ? "inline-flex items-center gap-1.5 rounded-pill border border-transparent bg-success-soft px-3 py-1.5 text-xs font-semibold text-success-text"
                        : "inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-ink-3"
                    }
                  >
                    <Icon name={on ? "check" : "close"} size={13} strokeWidth={2.2} />
                    {sc}
                  </span>
                );
              })}
            </div>
          ),
        },
        {
          type: "note",
          title: "หมายเหตุ",
          text: `Price List นี้จะถูกนำไปใช้กับลูกค้าในกลุ่ม: ${
            (pl.scope ?? []).join(", ") || "—"
          } เมื่อเงื่อนไขช่องทางและพื้นที่ตรงกัน`,
        },
      ],
    },

    {
      key: "rule",
      label: "Pricing Rule",
      blocks: (pl) => [
        {
          type: "fields",
          title: "Pricing Rule",
          cols: 2,
          items: [
            { label: "Rule Type", value: <Badge tone="info">{pl.rule.ruleType}</Badge> },
            { label: "Rule Summary", value: plRuleSummary(pl.rule) },
            {
              label: "Value",
              value:
                pl.rule.ruleType === "Fixed Price"
                  ? "ตามที่กำหนดต่อสินค้า"
                  : pl.rule.ruleType === "Formula"
                    ? "—"
                    : `${pl.rule.value}%`,
            },
            { label: "Rule Priority", value: fmt(pl.rule.rulePriority) },
            {
              label: "Allow Override",
              value: pl.rule.allowOverride ? (
                <Badge tone="success">อนุญาต</Badge>
              ) : (
                <Badge tone="neutral">ไม่อนุญาต</Badge>
              ),
            },
            { label: "Minimum Margin", value: `${pl.rule.minMargin}%` },
            { label: "Maximum Discount", value: `${pl.rule.maxDiscount}%` },
          ],
        },
        {
          type: "node",
          title: "Pricing Priority Engine",
          node: (
            <>
              <p className="mb-3 text-cap text-ink-2">
                ลำดับการเลือกราคาเมื่อออกใบเสนอราคา/ใบสั่งขาย — ระบบจะไล่จากบนลงล่าง
                และใช้ราคาแรกที่ตรงเงื่อนไข
              </p>
              <PriorityLadder activeKey={pl.priorityKey} />
            </>
          ),
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (pl) => [
        {
          type: "timeline",
          title: "Activity",
          items: pl.history.map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },
  ],
};

export const priceListSchemas: EntitySchemas<PriceListRow> = {
  list: PL_LIST,
  detail: PL_DETAIL,
  form: PRICE_LIST_FORM,
};
