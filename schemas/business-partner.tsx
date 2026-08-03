import {
  BUSINESS_PARTNERS,
  addressLine,
  bpAverageLeadTime,
  bpBillingAddress,
  bpDeliveryAddress,
  bpDaysUntil,
  bpDefaultBank,
  bpExpiringDocs,
  bpValidate,
  canBill,
  canDeliver,
  decorateBPs,
  hasCoordinates,
  mapUrl,
  validThaiTaxId,
  type BpRow,
} from "@/lib/domain/partner";
import {
  bpCustomerKpi,
  bpGoodsReceipts,
  bpLastPurchase,
  bpPurchaseKpi,
  bpPurchaseOrders,
  bpSalesOrders,
  bpTopProducts,
  bpTopPurchasedProducts,
} from "@/lib/domain/partner-analytics";
import {
  BP_ROLE_DEFS,
  BP_STATUS,
  BP_TYPES,
  CREDIT_STATUS,
  CUSTOMER_BIZ_TYPES,
  CUSTOMER_SIZES,
  CUSTOMER_TYPES,
  RISK_LEVELS,
  SALES_REPS,
  SUPPLIER_TYPES,
} from "@/data/partners";
import { BP_TONE, CREDIT_TONE, tone } from "@/lib/badges";
import { DASH, daysUntil, fmt, money0 } from "@/lib/format";
import { checkPermission, maskAccount } from "@/lib/permissions";
import { can } from "@/lib/domain/admin";
import { cn } from "@/lib/utils";
import type {
  ActionCtx,
  BadgeTone,
  DetailSchema,
  EntitySchemas,
  ListSchema,
} from "@/lib/types";
import { Badge, CellSub, Thumb } from "@/components/ui";
import { isPhoto } from "@/components/engine/FormFields";
import { Icon, type IconName } from "@/lib/icons";
import { BP_FORM } from "./forms/business-partner";

/**
 * The logo is an uploaded photograph now, so it can be a data URL rather than
 * an emoji. Anything the browser can display becomes an image; the older
 * emoji records keep rendering as text, and a partner with neither falls back
 * to the generic mark rather than an empty square.
 */
function PartnerAvatar({ value, name }: { value: string; name: string }) {
  if (isPhoto(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt={name} className="h-full w-full rounded-card object-cover" />
    );
  }
  return value ? (
    <>{value}</>
  ) : (
    <Icon name="partner" size={34} className="text-ink-3" />
  );
}

/** Risk reads the same way everywhere it appears. */
const RISK_TONE: Record<string, BadgeTone> = {
  Low: "success",
  Medium: "warning",
  High: "danger",
};

const SUPPLIER_STATUS_TONE: Record<string, BadgeTone> = {
  Preferred: "success",
  Approved: "info",
  Watch: "warning",
  Suspended: "danger",
};

/* ============================================================
   Overview-first helpers.

   Overview shows the DEFAULT address, the PRIMARY contact and the
   DEFAULT bank account. The full lists live behind ctx.panel() —
   a drawer rather than a tab, because a user who wants the second
   delivery address wants it without losing the page they are on.
   ============================================================ */

/** Inline "View All …" affordance inside a field row. */
function LinkAction({
  label,
  icon = "arrowRight",
  onClick,
}: {
  label: string;
  icon?: IconName;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-1 font-medium text-info hover:underline"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

/** Stand-in for the real asset; the gallery stores an emoji today. */
function ImagePreview({ src, name }: { src: string; name: string }) {
  return (
    <div className="mb-4 grid place-items-center rounded-card border border-line bg-surface py-10 text-[64px]">
      <span aria-label={name}>{src}</span>
    </div>
  );
}

function openAddressPanel(b: BpRow, ctx: ActionCtx) {
  ctx.panel({
    title: "All Addresses",
    subtitle: `${b.nameTh} · ${b.addressCount} ที่อยู่`,
    blocks: [
      {
        type: "table",
        rows: b.addresses,
        empty: "ยังไม่มีที่อยู่",
        cols: [
          {
            key: "name",
            label: "Address",
            cell: (a: BpRow["addresses"][number]) => (
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {a.name}
                  <span className="ml-1.5 inline-flex gap-1">
                    {a.billingPrimary && <Badge tone="primary">Billing</Badge>}
                    {a.deliveryPrimary && <Badge tone="info">Delivery</Badge>}
                    {!a.active && <Badge tone="neutral">Inactive</Badge>}
                  </span>
                </span>
                <span className="text-cap text-ink-2">{addressLine(a)}</span>
                <span className="text-cap text-ink-3">
                  {a.type}
                  {a.contact ? ` · ${a.contact}` : ""}
                  {a.phone ? ` · ${a.phone}` : ""}
                  {a.email ? ` · ${a.email}` : ""}
                </span>
                {hasCoordinates(a) && (
                  <button
                    onClick={() => ctx.goto(mapUrl(a))}
                    className="inline-flex items-center gap-1 self-start text-cap font-medium text-info hover:underline"
                  >
                    <Icon name="mapPin" size={13} />
                    {a.lat}, {a.lng}
                  </button>
                )}
                {a.remark && <span className="text-cap text-ink-3">{a.remark}</span>}
              </span>
            ),
          },
        ],
      },
    ],
  });
}

function openContactPanel(b: BpRow, ctx: ActionCtx) {
  ctx.panel({
    title: "All Contacts",
    subtitle: `${b.nameTh} · ${b.contactCount} คน`,
    blocks: [
      {
        type: "table",
        rows: b.contacts,
        empty: "ยังไม่มีผู้ติดต่อ",
        cols: [
          {
            key: "name",
            label: "Contact",
            cell: (c: BpRow["contacts"][number]) => (
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {c.prefix}
                  {c.first} {c.last}
                  {c.primary && (
                    <span className="ml-1.5">
                      <Badge tone="primary">Primary</Badge>
                    </span>
                  )}
                  {!c.active && (
                    <span className="ml-1.5">
                      <Badge tone="neutral">Inactive</Badge>
                    </span>
                  )}
                </span>
                <span className="text-cap text-ink-2">
                  {[c.pos, c.dept].filter(Boolean).join(" · ") || DASH}
                </span>
                <span className="text-cap text-ink-3 tnum">
                  {[c.mobile, c.phone].filter(Boolean).join(" · ") || DASH}
                </span>
                <span className="text-cap text-ink-3">
                  {[c.email, c.line].filter(Boolean).join(" · ") || DASH}
                </span>
                {c.remark && <span className="text-cap text-ink-3">{c.remark}</span>}
              </span>
            ),
          },
        ],
      },
    ],
  });
}

function openBankPanel(b: BpRow, ctx: ActionCtx) {
  ctx.panel({
    title: "All Bank Accounts",
    subtitle: `${b.nameTh} · ${b.bankCount} บัญชี`,
    blocks: [
      !checkPermission("canViewBank") && {
        type: "alert",
        tone: "warn",
        title: "เลขบัญชีถูกปกปิด",
        message: "ต้องมีสิทธิ์ Finance จึงจะเห็นเลขบัญชีเต็ม",
      },
      {
        type: "table",
        rows: b.banks,
        empty: "ยังไม่มีบัญชีธนาคาร",
        cols: [
          {
            key: "bank",
            label: "Account",
            cell: (k: BpRow["banks"][number]) => (
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {k.bank}
                  {k.def && (
                    <span className="ml-1.5">
                      <Badge tone="primary">Default</Badge>
                    </span>
                  )}
                  {!k.active && (
                    <span className="ml-1.5">
                      <Badge tone="neutral">Inactive</Badge>
                    </span>
                  )}
                </span>
                <span className="text-cap text-ink-2">{k.accName}</span>
                <span className="text-cap text-ink-3 tnum">
                  {maskAccount(k.accNo)} · {k.accType} · {k.currency}
                  {k.swift ? ` · SWIFT ${k.swift}` : ""}
                </span>
                <span className="text-cap text-ink-3">{k.branch || DASH}</span>
              </span>
            ),
          },
        ],
      },
    ],
  });
}

/* ============================================================
   BUSINESS PARTNER
   One legal entity = one record. Roles are flags on that record,
   never separate Customer / Supplier rows.
   ============================================================ */

const roleBadges = (bp: BpRow) =>
  bp.roleList.length ? (
    <span className="inline-flex flex-wrap gap-1">
      {bp.roleList.map((r) => (
        <Badge key={r.key} tone={(r.badge.replace("badge--", "") as BadgeTone) ?? "neutral"}>
          {r.label}
        </Badge>
      ))}
    </span>
  ) : (
    <span className="text-ink-2">{DASH}</span>
  );

export const BP_LIST: ListSchema<BpRow> = {
  key: "business-partner",
  entity: "Business Partner",
  entityPlural: "Business Partners",
  title: "Business Partner Master",
  subtitle:
    "จัดการลูกค้า ผู้ขายสินค้า ตัวแทนจำหน่าย และผู้ค้าอื่นในฐานข้อมูลเดียว",
  crumb: "Business Partner",
  primaryLabel: "Create Business Partner",
  searchPlaceholder: "ค้นหารหัส ชื่อ เลขผู้เสียภาษี ผู้ติดต่อ โทรศัพท์ หรืออีเมล...",
  emptyTitle: "ไม่พบผู้ค้าที่ตรงกับเงื่อนไข",

  source: () => BUSINESS_PARTNERS,
  /* Every field the spec lists. contactNames and supplierSkus are flattened
     joins of the child tables, so searching a person or a supplier part
     number finds the partner that holds it. */
  searchFields: [
    "code",
    "nameTh",
    "nameEn",
    "trade",
    "taxId",
    "contactName",
    "contactNames",
    "phone",
    "mobile",
    "email",
    "salesRep",
    "province",
    "customerType",
    "supplierType",
    "businessType",
    "supplierSkus",
  ],

  tabs: [
    { key: "all", label: "All" },
    { key: "cust", label: "Customers", test: (b) => b.roles.customer },
    { key: "sup", label: "Suppliers", test: (b) => b.roles.supplier },
    {
      key: "both",
      label: "Customer & Supplier",
      test: (b) => b.roles.customer && b.roles.supplier,
    },
    { key: "dealer", label: "Dealers", test: (b) => b.roles.dealer },
    { key: "inactive", label: "Inactive", test: (b) => b.status !== "Active" },
  ],

  filters: [
    {
      id: "role",
      label: "BP Role",
      options: () => BP_ROLE_DEFS.map((r) => r.label),
      test: (b, v) => {
        const d = BP_ROLE_DEFS.find((r) => r.label === v);
        return Boolean(d && b.roles[d.key as keyof typeof b.roles]);
      },
    },
    { id: "type", label: "BP Type", options: () => [...BP_TYPES], test: (b, v) => b.type === v },
    { id: "status", label: "Status", options: () => [...BP_STATUS], test: (b, v) => b.status === v },
    {
      id: "province",
      label: "Province",
      options: () =>
        [...new Set(BUSINESS_PARTNERS.map((b) => b.province))].filter((p) => p !== DASH),
      test: (b, v) => b.province === v,
    },
    { id: "rep", label: "Sales Rep", options: () => [...SALES_REPS], test: (b, v) => b.salesRep === v },
    {
      id: "credit",
      label: "Credit Status",
      options: () => [...CREDIT_STATUS],
      test: (b, v) => b.creditStatus === v,
    },
    {
      id: "custType",
      advanced: true,
      label: "Customer Type",
      options: () => [...CUSTOMER_TYPES],
      test: (b, v) => b.customerType === v,
    },
    {
      id: "supType",
      advanced: true,
      label: "Supplier Type",
      options: () => [...SUPPLIER_TYPES],
      test: (b, v) => b.supplierType === v,
    },
    {
      id: "bizType",
      advanced: true,
      label: "Business Type",
      options: () => [...CUSTOMER_BIZ_TYPES],
      test: (b, v) => b.businessType === v,
    },
    {
      id: "size",
      advanced: true,
      label: "Customer Size",
      options: () => [...CUSTOMER_SIZES],
      test: (b, v) => b.customer?.size === v,
    },
    {
      id: "risk",
      advanced: true,
      label: "Risk Level",
      options: () => [...RISK_LEVELS],
      test: (b, v) => b.riskLevel === v,
    },
  ],

  columns: [
    {
      /* No thumbnail: the logo is decorative here and the code is what a
         user scans for. The image still identifies the record on the
         detail page, where there is room for it. */
      key: "code",
      label: "BP Code",
      sortable: true,
      cell: (b) => <span className="font-medium tnum">{b.code}</span>,
    },
    {
      key: "nameTh",
      label: "Business Partner Name",
      sortable: true,
      cell: (b) => (
        <>
          {b.nameTh}
          {b.nameEn && <CellSub>{b.nameEn}</CellSub>}
        </>
      ),
    },
    { key: "type", label: "BP Type", muted: true, cell: (b) => b.type },
    {
      key: "bpMode",
      label: "Customer / Supplier",
      cell: (b) => (
        <Badge tone={b.bpMode === "Both" ? "primary" : b.bpMode === "Supplier" ? "info" : "success"}>
          {b.bpMode}
        </Badge>
      ),
    },
    /* Roles, Tax ID, the primary contact and the phone number are off the
       table — the Customer / Supplier column already carries the role, and
       who to ring is a detail-page fact nobody scans a list for. All of them
       stay searchable. */
    { key: "province", label: "Province", muted: true, cell: (b) => b.province },
    { key: "salesArea", label: "Sale Area", muted: true, cell: (b) => b.salesArea },
    {
      key: "creditStatus",
      label: "Credit Status",
      cell: (b) => <Badge tone={tone(CREDIT_TONE, b.creditStatus)}>{b.creditStatus}</Badge>,
    },
    {
      key: "status",
      label: "Status",
      cell: (b) => <Badge tone={tone(BP_TONE, b.status)}>{b.status}</Badge>,
    },
    /* ---- Optional columns. Off by default: eleven visible columns is
       already a wide table, and these answer questions only some
       departments ask. Column Settings turns them on. ---- */
    {
      key: "customerType",
      label: "Customer Type",
      muted: true,
      defaultHidden: true,
      cell: (b) => b.customerType,
    },
    {
      key: "supplierType",
      label: "Supplier Type",
      muted: true,
      defaultHidden: true,
      cell: (b) => b.supplierType,
    },
    {
      key: "businessType",
      label: "Business Type",
      muted: true,
      defaultHidden: true,
      cell: (b) => b.businessType,
    },
    {
      key: "customerSize",
      label: "Customer Size",
      muted: true,
      defaultHidden: true,
      cell: (b) => b.customer?.size ?? DASH,
    },
    {
      key: "salesRep",
      label: "Sales Rep",
      muted: true,
      defaultHidden: true,
      cell: (b) => b.salesRep,
    },
    {
      key: "creditLimit",
      label: "Credit Limit",
      align: "right",
      defaultHidden: true,
      sortable: true,
      sortValue: (b) => b.creditLimit,
      cell: (b) =>
        checkPermission("canViewCredit") ? (
          <span className="tnum">{money0(b.creditLimit)}</span>
        ) : (
          <span className="text-ink-3">••••</span>
        ),
    },
    {
      key: "creditUsed",
      label: "Credit Used",
      align: "right",
      defaultHidden: true,
      sortable: true,
      sortValue: (b) => b.creditUsed,
      cell: (b) => {
        if (!checkPermission("canViewCredit")) return <span className="text-ink-3">••••</span>;
        /* Over the limit is the one number on this table worth colouring. */
        const over = b.creditLimit > 0 && b.creditUsed > b.creditLimit;
        return (
          <span className={cn("tnum", over && "font-semibold text-danger-text")}>
            {money0(b.creditUsed)}
          </span>
        );
      },
    },
    {
      key: "riskLevel",
      label: "Risk Level",
      defaultHidden: true,
      cell: (b) =>
        b.riskLevel === DASH ? (
          <span className="text-ink-2">{DASH}</span>
        ) : (
          <Badge tone={tone(RISK_TONE, b.riskLevel)}>{b.riskLevel}</Badge>
        ),
    },
    {
      key: "addressCount",
      label: "Addresses",
      align: "right",
      muted: true,
      defaultHidden: true,
      sortable: true,
      sortValue: (b) => b.addressCount,
      cell: (b) => b.addressCount,
    },
    {
      /* Sorts on the parsed date, not the dd/mm/yyyy string — and undated
         partners fall to the bottom rather than sorting as the year zero. */
      key: "lastPurchase",
      label: "Last Purchase",
      sortable: true,
      sortValue: (b) => bpLastPurchase(b).ts,
      cell: (b) => {
        const last = bpLastPurchase(b);
        if (!last.date) return <span className="text-ink-3">{DASH}</span>;
        return (
          <>
            <span className="tnum">{last.date}</span>
            <CellSub>
              {last.doc} · {money0(last.amount)}
            </CellSub>
          </>
        );
      },
    },
  ],

  rowActions: (bp, ctx) => {
    const setStatus = (r: BpRow, st: string, msg: string, t?: "info" | "danger") => {
      r.status = st;
      decorateBPs();
      ctx.refresh();
      ctx.toast(msg, `${r.code} — ${r.nameTh}`, t);
    };
    return [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("business-partner", r) },
      { label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/business-partner/${r.code}/edit`) },
      {
        label: "Duplicate",
        icon: "copy",
        run: (r) => ctx.toast("ทำสำเนาผู้ค้า", `${r.code} — Future support`, "info"),
      },
      { sep: true },
      bp.status === "Active"
        ? {
            label: "Deactivate",
            icon: "circleSlash",
            run: (r) => setStatus(r, "Inactive", "ปิดใช้งานแล้ว", "info"),
          }
        : {
            label: "Activate",
            icon: "checkCircle",
            run: (r) => setStatus(r, "Active", "เปิดใช้งานแล้ว"),
          },
      {
        label: "Put On Hold",
        icon: "clock",
        run: (r) => setStatus(r, "On Hold", "พักการทำธุรกรรมแล้ว", "info"),
      },
      {
        label: "Block",
        icon: "circleSlash",
        run: (r) =>
          ctx.confirm({
            title: "Block this business partner?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.nameTh} จะถูกระงับการทำธุรกรรมทั้งหมด
              </>
            ),
            confirmText: "Block partner",
            onConfirm: () => setStatus(r, "Blocked", "ระงับผู้ค้าแล้ว", "danger"),
          }),
      },
      { sep: true },
      {
        label: "Transaction History",
        icon: "invoice",
        run: (r) => ctx.goto(`/m/business-partner/${r.code}`),
      },
      {
        label: "Delete",
        icon: "trash",
        danger: true,
        // Records with transactions are never hard-deleted.
        disabled: bp.txnCount > 0,
        disabledReason: `มีธุรกรรมอ้างอิงอยู่ ${bp.txnCount} รายการ — ใช้ Deactivate แทน`,
        run: (r) =>
          ctx.confirm({
            title: "Delete this business partner?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.nameTh} จะถูกลบถาวร
              </>
            ),
            confirmText: "Delete partner",
            onConfirm: () => {
              const i = BUSINESS_PARTNERS.indexOf(r);
              if (i > -1) BUSINESS_PARTNERS.splice(i, 1);
              decorateBPs();
              ctx.refresh();
              ctx.toast("ลบผู้ค้าแล้ว", `${r.code} — ${r.nameTh}`, "danger");
            },
          }),
      },
    ];
  },
};

export const BP_DETAIL: DetailSchema<BpRow> = {
  key: "business-partner",
  entityLabel: "Business Partner",

  identity: (b) => ({
    image: <PartnerAvatar value={b.profileImage || b.logo} name={b.nameTh} />,
    code: b.code,
    title: b.nameTh,
    copyFields: [
      { label: "BP code", value: b.code },
      { label: "Tax ID", value: b.taxId },
    ],
    badges: [
      { text: b.status, tone: tone(BP_TONE, b.status) },
      ...b.roleList.map((r) => ({
        text: r.label,
        tone: (r.badge.replace("badge--", "") as BadgeTone) ?? "neutral",
      })),
    ],
    tags: [b.type, b.nameEn || b.trade || "", b.province].filter(Boolean),
  }),

  /* ---------- Sticky KPI summary ---------- */
  kpis: (b) => {
    const cust = b.customer;
    const sup = b.supplier;
    const last = bpLastPurchase(b);
    const credit = checkPermission("canViewCredit");

    return [
      {
        icon: "tag",
        label: "Credit Limit",
        value: cust ? (credit ? money0(cust.creditLimit) : "••••") : DASH,
        sub: cust ? "THB" : "ไม่ใช่ลูกค้า",
        goTab: "business",
      },
      {
        icon: "cart",
        label: "Credit Used",
        value: cust ? (credit ? money0(cust.creditUsed) : "••••") : DASH,
        sub: cust ? `Term ${b.creditTerm}` : "",
        goTab: "business",
      },
      {
        icon: "shield",
        label: "Available Credit",
        value: cust ? (credit ? money0(b.availableCredit) : "••••") : DASH,
        sub: b.creditStatus,
        goTab: "business",
      },
      {
        icon: "clock",
        label: "Last Transaction",
        value: last.date || DASH,
        sub: last.doc || (sup ? "ผู้ขาย" : "ยังไม่มีรายการ"),
        wide: true,
        goTab: "activity",
      },
    ];
  },

  /* ============================================================
     FIVE TABS.

     The eleven this replaced meant a user opened four of them
     just to answer "who is this and can they order?". Overview
     now carries that whole answer; the rest group by intent —
     Business is configuration, Activity is what happened,
     Attachments is files, Audit is the trail.

     Nothing was dropped. Addresses, Contacts and Bank Accounts
     moved into Overview and Business as summaries with a
     "View All" panel behind them.
     ============================================================ */
  tabs: [
    /* ============================================================
       1. OVERVIEW — the whole record at a glance.
       ============================================================ */
    {
      key: "overview",
      label: "Overview",
      aside: (b, ctx) => {
        const last = bpLastPurchase(b);
        const credit = checkPermission("canViewCredit");
        const docs = [
          ...bpSalesOrders(b).slice(0, 3).map((s) => ({
            label: s.code,
            sub: `${s.orderDate} · ${money0(s.total)}`,
            icon: "salesOrder" as IconName,
            run: () => ctx.openEntity("sales-order", s.code),
          })),
          ...(b.txn?.inv ?? []).slice(0, 2).map((i) => ({
            label: i.no,
            sub: `${i.date} · ${money0(i.amount)}`,
            icon: "invoice" as IconName,
            run: () => ctx.openEntity("sales-invoice", i.no),
          })),
        ];

        return {
          title: "Business Partner Summary",
          rows: [
            { icon: "calendar", label: "Customer Since", value: b.customer ? b.since || DASH : DASH },
            { icon: "calendar", label: "Supplier Since", value: b.supplier ? b.since || DASH : DASH },
            { icon: "salesRep", label: "Sales Rep", value: b.salesRep },
            { icon: "tag", label: "Payment Terms", value: b.payTerm },
            { icon: "priceList", label: "Price List", value: b.customer?.priceList ?? DASH },
            { icon: "pricing", label: "Currency", value: b.supplier?.currency ?? "THB" },
            {
              icon: "cart",
              label: "Outstanding",
              value: credit ? money0(b.creditUsed) : "••••",
            },
            {
              icon: "shield",
              label: "Credit Status",
              value: <Badge tone={tone(CREDIT_TONE, b.creditStatus)}>{b.creditStatus}</Badge>,
            },
          ],
          links: [
            {
              label: "View All Addresses",
              icon: "mapPin" as IconName,
              sub: `${b.addressCount} ที่อยู่`,
              run: () => openAddressPanel(b, ctx),
            },
            {
              label: "View All Contacts",
              icon: "users" as IconName,
              sub: `${b.contactCount} คน`,
              run: () => openContactPanel(b, ctx),
            },
            {
              label: "View All Bank Accounts",
              icon: "pricing" as IconName,
              sub: `${b.bankCount} บัญชี`,
              run: () => openBankPanel(b, ctx),
            },
            ...docs,
          ],
        };
      },
      blocks: (b, ctx) => {
        const issues = bpValidate(b);
        const blocking = issues.filter((i) => i.blocking);
        const billing = bpBillingAddress(b);
        const delivery = bpDeliveryAddress(b);
        const contact = b.contacts.find((c) => c.primary) ?? b.contacts[0] ?? null;
        const t = b.tax;
        const taxOk = validThaiTaxId(t.taxId);
        const credit = checkPermission("canViewCredit");
        const salesKpi = b.customer ? bpCustomerKpi(b) : null;
        const purchaseKpi = b.supplier ? bpPurchaseKpi(b) : null;

        return [
          blocking.length > 0 && {
            type: "alert",
            tone: "danger",
            title: `ข้อมูลไม่ครบ ${blocking.length} รายการ`,
            message: blocking.map((i) => i.message).join(" · "),
          },

          /* ---- Row 1: identity, contact, address ---- */
          {
            type: "grid",
            cols: 3,
            items: [
              {
                type: "fields",
                title: "General Information",
                cols: 1,
                items: [
                  { label: "BP Code", value: b.code },
                  { label: "BP Name (TH)", value: b.nameTh },
                  { label: "BP Name (EN)", value: b.nameEn || DASH },
                  { label: "Status", value: <Badge tone={tone(BP_TONE, b.status)}>{b.status}</Badge> },
                  {
                    label: "BP Type",
                    value: (
                      <Badge
                        tone={
                          b.bpMode === "Both" ? "primary" : b.bpMode === "Supplier" ? "info" : "success"
                        }
                      >
                        {b.bpMode}
                      </Badge>
                    ),
                  },
                  { label: "Entity Type", value: b.type },
                  {
                    label: "Tax ID",
                    value: t.taxId ? (
                      <>
                        <span className="tnum">{t.taxId}</span>
                        {taxOk ? (
                          <span className="ml-1 text-success-text">✓</span>
                        ) : (
                          <span className="ml-1 text-danger-text">✕</span>
                        )}
                      </>
                    ) : (
                      DASH
                    ),
                  },
                  {
                    label: "Bill Type",
                    value: <Badge tone={b.billType === "VAT" ? "info" : "neutral"}>{b.billType}</Badge>,
                  },
                  {
                    label: "Credit Term",
                    value: b.creditTerm === "No Credit" ? "No Credit" : `${b.creditTerm} วัน`,
                  },
                  { label: "Starting Date", value: b.since || DASH },
                ],
              },

              {
                type: "fields",
                title: "Primary Contact",
                cols: 1,
                items: [
                  { label: "ชื่อผู้ติดต่อหลัก", value: b.contactName },
                  { label: "ตำแหน่ง", value: contact?.pos || DASH },
                  { label: "Telephone", value: <span className="tnum">{b.phone}</span> },
                  { label: "Mobile Phone", value: <span className="tnum">{b.mobile}</span> },
                  { label: "Email", value: b.email },
                  { label: "Line ID", value: contact?.line || DASH, muted: true },
                  {
                    label: "",
                    value: (
                      <LinkAction
                        label={`View All Contacts (${b.contactCount})`}
                        onClick={() => openContactPanel(b, ctx)}
                      />
                    ),
                    span: true,
                  },
                ],
              },

              {
                type: "fields",
                title: "Address Information",
                cols: 1,
                items: [
                  {
                    label: "ที่อยู่สำหรับออกบิล (Billing)",
                    value: billing ? addressLine(billing) : DASH,
                    span: true,
                  },
                  {
                    label: "ที่อยู่สำหรับจัดส่ง (Delivery)",
                    value: delivery ? addressLine(delivery) : "ใช้ที่อยู่ออกบิล",
                    span: true,
                  },
                  { label: "Province", value: b.province },
                  { label: "Postal Code", value: billing?.zip || DASH },
                  { label: "Country", value: billing?.country || "ประเทศไทย" },
                  {
                    label: "Google Map",
                    value:
                      billing && hasCoordinates(billing) ? (
                        <LinkAction
                          label={`${billing.lat}, ${billing.lng}`}
                          icon="mapPin"
                          onClick={() => ctx.goto(mapUrl(billing))}
                        />
                      ) : (
                        DASH
                      ),
                  },
                  {
                    label: "",
                    value: (
                      <LinkAction
                        label={`View All Addresses (${b.addressCount})`}
                        onClick={() => openAddressPanel(b, ctx)}
                      />
                    ),
                    span: true,
                  },
                ],
              },
            ],
          },

          /* ---- Row 2: business + credit ---- */
          {
            type: "grid",
            cols: 2,
            items: [
              {
                type: "fields",
                title: "Business Summary",
                cols: 2,
                items: [
                  { label: "Sales Representative", value: b.salesRep },
                  { label: "Customer Type", value: b.customerType },
                  { label: "Supplier Type", value: b.supplierType },
                  { label: "Business Type", value: b.businessType },
                  { label: "Customer Size", value: b.customer?.size ?? DASH },
                  {
                    label: "Preferred Supplier",
                    value: b.supplier ? (
                      b.supplier.preferred ? (
                        <Badge tone="success">Preferred</Badge>
                      ) : (
                        "ผู้ขายทั่วไป"
                      )
                    ) : (
                      DASH
                    ),
                  },
                  { label: "Payment Terms", value: b.payTerm },
                  { label: "Price List", value: b.customer?.priceList ?? DASH },
                  { label: "Currency", value: b.supplier?.currency ?? "THB" },
                  { label: "Sale Area", value: b.salesArea },
                ],
              },

              credit
                ? {
                    type: "fields",
                    title: "Credit Summary",
                    cols: 2,
                    items: [
                      { label: "Credit Limit", value: `${money0(b.creditLimit)} THB` },
                      { label: "Credit Used", value: `${money0(b.creditUsed)} THB` },
                      { label: "Available Credit", value: `${money0(b.availableCredit)} THB` },
                      { label: "Outstanding", value: `${money0(b.credit.openInv)} THB` },
                      {
                        label: "Credit Status",
                        value: <Badge tone={tone(CREDIT_TONE, b.creditStatus)}>{b.creditStatus}</Badge>,
                      },
                      { label: "Credit Days", value: `${b.credit.days} วัน` },
                      {
                        label: "Credit Hold",
                        value: b.customer?.creditHold ? (
                          <Badge tone="danger">ระงับ</Badge>
                        ) : (
                          "ปกติ"
                        ),
                      },
                      { label: "Risk Level", value: b.riskLevel },
                    ],
                  }
                : /* Layer 2: a role without credit sight gets no card at all,
                     not a card full of dots. */
                  null,
            ],
          },

          /* ---- Row 3: business KPI ---- */
          {
            type: "cards",
            title: "Business KPI",
            cols: 3,
            items: [
              salesKpi && { label: "Total Sales", value: money0(salesKpi.revenue), unit: "THB", tone: "accent" },
              purchaseKpi && { label: "Total Purchase", value: money0(purchaseKpi.spend), unit: "THB" },
              salesKpi && {
                label: "Last Sales Order",
                value: salesKpi.lastOrderDate || DASH,
                sub: salesKpi.lastOrderAmount ? money0(salesKpi.lastOrderAmount) : "",
              },
              purchaseKpi && {
                label: "Last Purchase Order",
                value: purchaseKpi.lastOrderDate || DASH,
                sub: purchaseKpi.lastOrderAmount ? money0(purchaseKpi.lastOrderAmount) : "",
              },
              salesKpi && { label: "Average Sales", value: money0(salesKpi.avgOrder), unit: "THB" },
              purchaseKpi && { label: "Average Purchase", value: money0(purchaseKpi.avgOrder), unit: "THB" },
            ],
          },

          b.notes ? { type: "note", title: "Remarks", text: b.notes } : null,
        ];
      },
    },

    /* ============================================================
       2. BUSINESS — configuration and the commercial relationship.
       ============================================================ */
    {
      key: "business",
      label: "Business",
      blocks: (b, ctx) => {
        const c = b.customer;
        const s = b.supplier;
        const p = b.purchasing;
        const items = b.supplierItems ?? [];
        const bank = bpDefaultBank(b);
        const credit = checkPermission("canViewCredit");

        return [
          /* ---- Customer ---- */
          c && {
            type: "fields",
            title: "Customer Information",
            cols: 2,
            items: [
              { label: "Customer Type", value: c.custType },
              { label: "Business Type", value: c.bizType },
              {
                label: "Benefit Level",
                value: c.benefit === "Custom" ? `Custom — ${c.benefitPct}%` : c.benefit,
              },
              { label: "Customer Size", value: <Badge tone="neutral">{c.size}</Badge> },
              { label: "Sales Representative", value: c.rep },
              { label: "Default Price List", value: c.priceList },
              { label: "Risk Level", value: <Badge tone={tone(RISK_TONE, c.risk)}>{c.risk}</Badge> },
              { label: "Payment Method", value: c.payMethod },
              credit && { label: "Credit Limit", value: `${money0(c.creditLimit)} THB` },
              credit && { label: "Credit Used", value: `${money0(c.creditUsed)} THB` },
              credit && { label: "Available Credit", value: `${money0(b.availableCredit)} THB` },
              {
                label: "Credit Hold",
                value: c.creditHold ? <Badge tone="danger">ระงับ</Badge> : "ปกติ",
              },
              c.creditHold ? { label: "Hold Reason", value: c.holdReason || DASH, span: true } : null,
            ],
          },

          /* ---- Supplier ---- */
          s && {
            type: "fields",
            title: "Supplier Information",
            cols: 2,
            items: [
              { label: "Supplier Type", value: s.supType },
              {
                label: "Supplier Status",
                value: <Badge tone={tone(SUPPLIER_STATUS_TONE, s.status)}>{s.status}</Badge>,
              },
              {
                label: "Preferred Supplier",
                value: s.preferred ? <Badge tone="success">Preferred</Badge> : "ผู้ขายทั่วไป",
              },
              { label: "Lead Time", value: s.lead ? `${s.lead} วัน` : DASH },
              { label: "Currency", value: s.currency },
              { label: "Payment Method", value: s.payMethod },
              { label: "Payment Term", value: p?.payTerm ?? DASH },
              { label: "Supplier Rating", value: p?.rating ?? DASH },
              { label: "Buyer", value: p?.buyer ?? DASH },
              { label: "Incoterm", value: p?.incoterm ?? DASH },
              { label: "Minimum Order Value", value: p ? `${money0(p.minValue)} ${s.currency}` : DASH },
              { label: "Receiving Warehouse", value: p?.warehouse ?? DASH },
            ],
          },

          /* ---- Supplier items ---- */
          s && {
            type: "table",
            title: `Supplier Items (${items.length})`,
            rows: items,
            empty: "ยังไม่มีรายการสินค้าที่เสนอราคา",
            cols: [
              { key: "product", label: "Product" },
              { key: "productName", label: "Product Name", muted: true },
              { key: "sku", label: "Supplier SKU", cell: (i) => <span className="tnum">{i.sku}</span> },
              { key: "moq", label: "MOQ", align: "right", cell: (i) => fmt(i.moq) },
              { key: "lead", label: "Lead Time", align: "right", cell: (i) => `${i.lead} วัน` },
              { key: "currency", label: "Currency", muted: true },
              { key: "price", label: "Price", align: "right", cell: (i) => money0(i.price) },
              {
                key: "preferred",
                label: "Preferred",
                cell: (i) =>
                  i.preferred ? <Badge tone="success">Preferred</Badge> : <span className="text-ink-3">{DASH}</span>,
              },
              {
                key: "status",
                label: "Status",
                cell: (i) => (
                  <Badge
                    tone={i.status === "Active" ? "success" : i.status === "Expired" ? "danger" : "neutral"}
                  >
                    {i.status}
                  </Badge>
                ),
              },
              { key: "effective", label: "Effective", muted: true },
              { key: "expiry", label: "Expiry", muted: true, cell: (i) => i.expiry || DASH },
            ],
          },

          /* ---- Bank: default only, rest behind the panel ---- */
          !checkPermission("canViewBank") && {
            type: "alert",
            tone: "warn",
            title: "ข้อมูลบัญชีธนาคารถูกปกปิดบางส่วน",
            message: "เลขบัญชีถูกปกปิดตามสิทธิ์ — ต้องมีสิทธิ์ Finance จึงจะเห็นข้อมูลเต็ม",
          },
          {
            type: "fields",
            title: "Default Bank Account",
            cols: 2,
            items: bank
              ? [
                  { label: "Bank Name", value: bank.bank },
                  { label: "Branch", value: bank.branch || DASH },
                  { label: "Account Name", value: bank.accName },
                  { label: "Account Number", value: <span className="tnum">{maskAccount(bank.accNo)}</span> },
                  { label: "Account Type", value: bank.accType },
                  { label: "Currency", value: bank.currency },
                  { label: "SWIFT Code", value: bank.swift || DASH },
                  {
                    label: "",
                    value: (
                      <LinkAction
                        label={`View All Bank Accounts (${b.bankCount})`}
                        onClick={() => openBankPanel(b, ctx)}
                      />
                    ),
                  },
                ]
              : [{ label: "", value: "ยังไม่มีบัญชีธนาคาร", span: true, muted: true }],
          },

          /* ---- Payment information ---- */
          {
            type: "fields",
            title: "Payment Information",
            cols: 2,
            items: [
              { label: "Payment Term", value: b.payTerm },
              { label: "Credit Term", value: b.creditTerm === "No Credit" ? "No Credit" : `${b.creditTerm} วัน` },
              { label: "Bill Type", value: b.billType },
              { label: "Customer Payment Method", value: c?.payMethod ?? DASH },
              { label: "Supplier Payment Method", value: s?.payMethod ?? DASH },
              { label: "Withholding Tax", value: b.tax.wht ? "มีการหัก ณ ที่จ่าย" : "ไม่มี" },
              { label: "VAT Registered", value: b.tax.vatReg ? "ใช่" : "ไม่ใช่" },
              { label: "VAT Registration Date", value: b.tax.vatDate || DASH },
            ],
          },

          /* ---- Classification, kept from the old Roles tab ---- */
          {
            type: "fields",
            title: "Classification",
            cols: 2,
            items: [
              { label: "Roles", value: roleBadges(b) },
              { label: "Customer Group", value: b.cls.custGroup || DASH },
              { label: "Supplier Group", value: b.cls.supGroup || DASH },
              { label: "Customer Level", value: b.cls.custLevel || DASH },
              { label: "Price Group", value: b.cls.priceGroup || DASH },
              { label: "Territory", value: b.cls.territory || DASH },
              { label: "Sales Channel", value: b.cls.channel || DASH },
            ],
          },
        ];
      },
    },

    /* ============================================================
       3. ACTIVITY — sales, purchase and the timeline in one place.
       ============================================================ */
    {
      key: "activity",
      label: "Activity",
      blocks: (b, ctx) => {
        const salesKpi = b.customer ? bpCustomerKpi(b) : null;
        const purchaseKpi = b.supplier ? bpPurchaseKpi(b) : null;
        const orders = b.customer ? bpSalesOrders(b) : [];
        const top = b.customer ? bpTopProducts(b) : [];
        const pos = b.supplier ? bpPurchaseOrders(b) : [];
        const grs = b.supplier ? bpGoodsReceipts(b) : [];
        const topBuy = b.supplier ? bpTopPurchasedProducts(b) : [];
        const recordedPo = b.txn?.po ?? [];

        return [
          {
            type: "cards",
            title: "Document Statistics",
            cols: 4,
            items: [
              { label: "Sales Orders", value: fmt(b.txn.so.length), tone: "accent" },
              { label: "Purchase Orders", value: fmt(b.txn.po.length) },
              { label: "Invoices", value: fmt(b.txn.inv.length) },
              { label: "Attachments", value: fmt(b.docCount) },
            ],
          },

          salesKpi && {
            type: "cards",
            title: "Sales Summary",
            cols: 4,
            items: [
              { label: "Total Sales", value: money0(salesKpi.revenue), unit: "THB", tone: "accent" },
              { label: "Average Order", value: money0(salesKpi.avgOrder), unit: "THB" },
              { label: "Open Orders", value: fmt(salesKpi.openOrders) },
              {
                label: "Outstanding",
                value: money0(salesKpi.outstanding),
                unit: "THB",
                tone: salesKpi.overdue > 0 ? "warn" : undefined,
                sub: salesKpi.overdue > 0 ? `เกินกำหนด ${salesKpi.overdue} ใบ` : "",
              },
            ],
          },

          orders.length > 0 && {
            type: "table",
            title: `Recent Sales Orders (${orders.length})`,
            rows: orders.slice(0, 8),
            empty: "ยังไม่มีใบสั่งขาย",
            cols: [
              {
                key: "code",
                label: "SO No.",
                cell: (s) => (
                  <button
                    onClick={() => ctx.openEntity("sales-order", s.code)}
                    className="font-medium text-info hover:underline"
                  >
                    {s.code}
                  </button>
                ),
              },
              { key: "orderDate", label: "Order Date", muted: true },
              { key: "itemCount", label: "Items", align: "right" },
              { key: "total", label: "Amount", align: "right", cell: (s) => money0(s.total) },
              { key: "status", label: "Status", cell: (s) => <Badge tone="neutral">{s.status}</Badge> },
            ],
          },

          b.txn.inv.length > 0 && {
            type: "table",
            title: `Invoices (${b.txn.inv.length})`,
            rows: b.txn.inv,
            empty: "ไม่มีใบแจ้งหนี้",
            cols: [
              { key: "no", label: "Invoice No." },
              { key: "date", label: "Date", muted: true },
              { key: "amount", label: "Amount", align: "right", cell: (r) => money0(r.amount) },
              {
                key: "status",
                label: "Status",
                cell: (r) => (
                  <Badge tone={r.status === "Overdue" ? "danger" : "neutral"}>{r.status}</Badge>
                ),
              },
            ],
          },

          top.length > 0 && {
            type: "table",
            title: "Top Products Sold",
            rows: top,
            empty: "ยังไม่มีประวัติการซื้อสินค้า",
            cols: [
              { key: "code", label: "Product" },
              { key: "name", label: "Product Name", muted: true },
              { key: "qty", label: "Qty", align: "right", cell: (t) => fmt(t.qty) },
              { key: "amount", label: "Amount", align: "right", cell: (t) => money0(t.amount) },
            ],
          },

          purchaseKpi && {
            type: "cards",
            title: "Purchase Summary",
            cols: 4,
            items: [
              { label: "Total Purchase", value: money0(purchaseKpi.spend), unit: "THB", tone: "accent" },
              { label: "Average Order", value: money0(purchaseKpi.avgOrder), unit: "THB" },
              { label: "Average Lead Time", value: `${purchaseKpi.avgLeadTime}`, unit: "วัน" },
              { label: "Goods Receipts", value: fmt(purchaseKpi.receipts) },
            ],
          },

          purchaseKpi?.fromRecord && {
            type: "alert",
            tone: "info",
            title: "ยอดซื้อมาจากข้อมูลบนระเบียนคู่ค้า",
            message:
              "ใบสั่งซื้อและใบรับสินค้าในระบบยังอ้างอิงผู้ขายด้วยชื่อ ไม่ใช่รหัสคู่ค้า จึงจับคู่อัตโนมัติไม่ได้",
          },

          b.supplier && {
            type: "table",
            title: `Recent Purchase Orders (${pos.length || recordedPo.length})`,
            rows: pos.length ? pos.slice(0, 8) : recordedPo,
            empty: "ยังไม่มีใบสั่งซื้อ",
            cols: pos.length
              ? [
                  {
                    key: "code",
                    label: "PO No.",
                    cell: (p) => (
                      <button
                        onClick={() => ctx.openEntity("purchase-order", p.code)}
                        className="font-medium text-info hover:underline"
                      >
                        {p.code}
                      </button>
                    ),
                  },
                  { key: "orderDate", label: "Order Date", muted: true },
                  { key: "total", label: "Amount", align: "right", cell: (p) => money0(p.total) },
                  { key: "status", label: "Status", cell: (p) => <Badge tone="neutral">{p.status}</Badge> },
                ]
              : [
                  { key: "no", label: "PO No." },
                  { key: "date", label: "Date", muted: true },
                  { key: "amount", label: "Amount", align: "right", cell: (r) => money0(r.amount) },
                  { key: "status", label: "Status", cell: (r) => <Badge tone="neutral">{r.status}</Badge> },
                ],
          },

          grs.length > 0 && {
            type: "table",
            title: `Goods Receipts (${grs.length})`,
            rows: grs.slice(0, 8),
            empty: "",
            cols: [
              { key: "code", label: "GR No." },
              { key: "receiptDate", label: "Receipt Date", muted: true },
              { key: "warehouse", label: "Warehouse", muted: true },
              { key: "totalReceiving", label: "Qty", align: "right", cell: (g) => fmt(g.totalReceiving) },
              { key: "status", label: "Status", cell: (g) => <Badge tone="neutral">{g.status}</Badge> },
            ],
          },

          topBuy.length > 0 && {
            type: "table",
            title: "Top Products Purchased",
            rows: topBuy,
            empty: "",
            cols: [
              { key: "code", label: "Product" },
              { key: "name", label: "Product Name", muted: true },
              { key: "qty", label: "Qty", align: "right", cell: (t) => fmt(t.qty) },
              { key: "amount", label: "Amount", align: "right", cell: (t) => money0(t.amount) },
            ],
          },

          {
            type: "planned",
            title: "Returns & Credit Notes",
            label: "Sales Return / Credit Note",
            message:
              "เอกสารคืนสินค้าและใบลดหนี้ของคู่ค้ารายนี้ยังไม่ผูกด้วยรหัสคู่ค้า — จะแสดงที่นี่เมื่อเชื่อมแล้ว",
          },

          {
            type: "timeline",
            title: `Latest Activities (${b.history.length})`,
            items: b.history.map((e) => ({
              title: e.t,
              detail: e.d,
              user: e.u,
              when: e.when,
              kind: e.kind,
            })),
          },
        ];
      },
    },

    /* ============================================================
       4. ATTACHMENTS — files and images.
       ============================================================ */
    {
      key: "attachments",
      label: "Attachments",
      blocks: (b, ctx) => {
        const expiring = bpExpiringDocs(b, 90);
        const DOC_ICON: Record<string, IconName> = {
          pdf: "file",
          word: "file",
          excel: "reports",
          image: "eye",
          other: "file",
        };
        return [
          expiring.length > 0 && {
            type: "alert",
            tone: "warn",
            title: "เอกสารใกล้หมดอายุหรือหมดอายุแล้ว",
            message: expiring
              .map((x) => `${x.doc.name} (${x.days < 0 ? `เกิน ${-x.days} วัน` : `อีก ${x.days} วัน`})`)
              .join(" · "),
          },

          {
            type: "cards",
            title: "Files",
            cols: 4,
            items: [
              { label: "Attachments", value: fmt(b.docCount), tone: "accent" },
              { label: "Images", value: fmt(b.imageCount) },
              { label: "Expiring", value: fmt(expiring.length), tone: expiring.length ? "warn" : undefined },
              { label: "Document Types", value: fmt(new Set(b.docs.map((d) => d.type)).size) },
            ],
          },

          /* Grid view — the gallery reads as thumbnails. */
          {
            type: "entity",
            title: `Images (${b.imageCount})`,
            empty: "ยังไม่มีรูปภาพ",
            items: (b.images ?? []).map((i) => ({
              name: i.name,
              sub: `${i.kind} · ${i.by} · ${i.date}`,
              avatar: i.src,
              end: i.cover ? <Badge tone="primary">Cover</Badge> : undefined,
              onClick: () =>
                ctx.panel({
                  title: i.name,
                  subtitle: `${i.kind} · อัปโหลดโดย ${i.by} · ${i.date}`,
                  blocks: [
                    { type: "node", node: <ImagePreview src={i.src} name={i.name} /> },
                    {
                      type: "fields",
                      title: "Image",
                      cols: 1,
                      items: [
                        { label: "Name", value: i.name },
                        { label: "Type", value: i.kind },
                        { label: "Uploaded By", value: i.by },
                        { label: "Upload Date", value: i.date },
                        { label: "Cover", value: i.cover ? "ใช่" : "ไม่ใช่" },
                        { label: "Remark", value: i.remark || DASH },
                      ],
                    },
                  ],
                }),
            })),
          },

          /* List view — documents read as a table. */
          {
            type: "table",
            title: `Documents (${b.docCount})`,
            rows: b.docs,
            empty: "ยังไม่มีเอกสารแนบ",
            cols: [
              { key: "type", label: "Document Type", cell: (d) => <Badge tone="neutral">{d.type}</Badge> },
              {
                key: "name",
                label: "Filename",
                cell: (d) => (
                  <span className="inline-flex items-center gap-2">
                    <Icon name={DOC_ICON[d.kind ?? "other"] ?? "file"} size={15} className="text-ink-3" />
                    {d.name}
                  </span>
                ),
              },
              { key: "kind", label: "Format", muted: true, cell: (d) => (d.kind ?? "other").toUpperCase() },
              { key: "by", label: "Uploaded By", muted: true },
              { key: "date", label: "Upload Date", muted: true },
              {
                key: "expiry",
                label: "Expiry",
                cell: (d) => {
                  const dd = bpDaysUntil(d.expiry);
                  if (!d.expiry) return <span className="text-ink-3">{DASH}</span>;
                  return dd !== null && dd <= 90 ? (
                    <span className="font-semibold text-warning-text">{d.expiry}</span>
                  ) : (
                    d.expiry
                  );
                },
              },
              {
                key: "status",
                label: "Status",
                cell: (d) => <Badge tone={d.status === "Active" ? "success" : "warning"}>{d.status}</Badge>,
              },
              {
                key: "open",
                label: "Preview",
                cell: (d) => (
                  <LinkAction
                    label="Preview"
                    icon="eye"
                    onClick={() =>
                      ctx.panel({
                        title: d.name,
                        subtitle: `${d.type} · ${d.by} · ${d.date}`,
                        blocks: [
                          {
                            type: "fields",
                            title: "Document",
                            cols: 1,
                            items: [
                              { label: "Type", value: d.type },
                              { label: "Filename", value: d.name },
                              { label: "Format", value: (d.kind ?? "other").toUpperCase() },
                              { label: "Issue Date", value: d.issue || DASH },
                              { label: "Expiry Date", value: d.expiry || DASH },
                              { label: "Uploaded By", value: d.by },
                              { label: "Upload Date", value: d.date },
                              { label: "Remark", value: d.remark || DASH },
                            ],
                          },
                          {
                            type: "planned",
                            label: "File Preview",
                            message: "ตัวอย่างไฟล์และการดาวน์โหลดจะพร้อมเมื่อเชื่อมต่อที่เก็บไฟล์จริง",
                          },
                        ],
                      })
                    }
                  />
                ),
              },
            ],
          },
        ];
      },
    },

    /* ============================================================
       5. AUDIT — permission-gated.
       ============================================================ */
    {
      key: "audit",
      label: "Audit",
      /* Layer 1 of the Administration framework decides this: the tab is not
         rendered at all for a role without audit access. */
      when: () => can("admin-audit", "view"),
      blocks: (b) => [
        {
          type: "fields",
          title: "Record Lifecycle",
          cols: 2,
          items: [
            { label: "Created", value: b.created, muted: true },
            { label: "Created By", value: b.createdBy, muted: true },
            { label: "Last Updated", value: b.updated, muted: true },
            { label: "Updated By", value: b.updatedBy, muted: true },
          ],
        },
        {
          type: "audit",
          title: "Field Changes",
          items: b.history.map((e) => ({
            event: e.t,
            user: e.u,
            when: e.when,
            field: e.d,
            kind: e.kind,
          })),
        },
        {
          type: "table",
          title: "Approval History",
          rows: b.history.filter((e) => /อนุมัติ|approve/i.test(`${e.t} ${e.d}`)),
          empty: "ยังไม่มีประวัติการอนุมัติของคู่ค้ารายนี้",
          cols: [
            { key: "t", label: "Event" },
            { key: "d", label: "Detail", muted: true },
            { key: "u", label: "By" },
            { key: "when", label: "When", muted: true },
          ],
        },
        {
          type: "planned",
          title: "Login History",
          label: "Login History",
          message: "ประวัติการเข้าใช้งานผูกกับผู้ใช้ ไม่ใช่คู่ค้า — ดูได้ที่ Administration › Audit Log",
        },
      ],
    },
  ],
};

export const bpSchemas: EntitySchemas<BpRow> = {
  list: BP_LIST,
  detail: BP_DETAIL,
  form: BP_FORM,
};
