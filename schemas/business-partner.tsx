import {
  BUSINESS_PARTNERS,
  addressLine,
  bpAverageLeadTime,
  bpBillingAddress,
  bpDeliveryAddress,
  bpDaysUntil,
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
import { cn } from "@/lib/utils";
import type { BadgeTone, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellSub, Thumb } from "@/components/ui";
import { Icon, type IconName } from "@/lib/icons";
import { BP_FORM } from "./forms/business-partner";

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
    /* Roles and Tax ID are off the table — the Customer / Supplier column
       already carries the role, and a tax number is a detail-page fact
       nobody scans a list for. Both stay searchable. */
    { key: "contactName", label: "Primary Contact", muted: true, cell: (b) => b.contactName },
    {
      key: "phone",
      label: "Phone",
      muted: true,
      cell: (b) => <span className="tnum">{b.phone}</span>,
    },
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
    image: b.logo,
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

  kpis: (b) => {
    const cust = b.customer;
    const sup = b.supplier;
    return [
      cust
        ? {
            icon: "tag",
            label: "Credit Limit",
            value: checkPermission("canViewCredit") ? money0(cust.creditLimit) : "••••",
            sub: "THB",
            goTab: "customer",
          }
        : {
            icon: "truck",
            label: "Lead Time",
            value: sup ? `${bpAverageLeadTime(b)}` : DASH,
            sub: "วัน",
            goTab: "supplier",
          },
      cust
        ? {
            icon: "cart",
            label: "Credit Used",
            value: checkPermission("canViewCredit") ? money0(cust.creditUsed) : "••••",
            sub: "THB",
            goTab: "customer",
          }
        : {
            icon: "box",
            label: "Quoted Items",
            value: fmt(b.supplierItemCount),
            sub: "รายการ",
            goTab: "supplier",
          },
      {
        icon: "shield",
        label: cust ? "Available Credit" : "Supplier Status",
        value: cust
          ? checkPermission("canViewCredit")
            ? money0(b.availableCredit)
            : "••••"
          : (sup?.status ?? DASH),
        sub: cust ? `Term ${b.creditTerm}` : (sup?.supType ?? ""),
        goTab: cust ? "customer" : "supplier",
      },
      {
        icon: "partner",
        label: b.bpMode,
        value: cust ? b.salesRep : (sup?.currency ?? DASH),
        sub: b.province,
        wide: true,
        goTab: cust ? "customer" : "supplier",
      },
    ];
  },

  tabs: [
    /* ============================================================
       1. OVERVIEW — General Information, roles, tax and the gallery.
       ============================================================ */
    {
      key: "overview",
      label: "Overview",
      blocks: (b) => {
        const issues = bpValidate(b);
        const blocking = issues.filter((i) => i.blocking);
        const warnings = issues.filter((i) => !i.blocking);
        const billing = bpBillingAddress(b);
        const t = b.tax;
        const taxOk = validThaiTaxId(t.taxId);

        return [
          blocking.length > 0 && {
            type: "alert",
            tone: "danger",
            title: `ข้อมูลไม่ครบ ${blocking.length} รายการ`,
            message: blocking.map((i) => i.message).join(" · "),
          },
          warnings.length > 0 && {
            type: "alert",
            tone: "info",
            title: `ข้อมูลที่ควรเพิ่ม ${warnings.length} รายการ`,
            message: warnings.map((i) => i.message).join(" · "),
          },

          {
            type: "fields",
            title: "General Information",
            cols: 2,
            items: [
              { label: "BP Code", value: b.code },
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
              { label: "BP Name (TH)", value: b.nameTh },
              { label: "BP Name (EN)", value: b.nameEn || DASH },
              { label: "Status", value: <Badge tone={tone(BP_TONE, b.status)}>{b.status}</Badge> },
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
              { label: "Entity Type", value: b.type },
            ],
          },

          {
            type: "fields",
            title: "Key Contact",
            cols: 2,
            items: [
              { label: "Key Contact Person", value: b.contactName },
              { label: "Telephone", value: <span className="tnum">{b.phone}</span> },
              { label: "Mobile Phone", value: <span className="tnum">{b.mobile}</span> },
              { label: "Email", value: b.email },
              { label: "Website", value: b.website || DASH },
              { label: "Primary Province", value: b.province },
              {
                label: "Billing Address",
                value: addressLine(billing),
                span: true,
                muted: true,
              },
            ],
          },

          { type: "note", title: "Remarks", text: b.notes || DASH },

          {
            type: "fields",
            title: "Roles & Classification",
            cols: 2,
            items: [
              { label: "Roles", value: roleBadges(b) },
              { label: "Industry", value: b.cls.industry || DASH },
              { label: "Customer Group", value: b.cls.custGroup || DASH },
              { label: "Supplier Group", value: b.cls.supGroup || DASH },
              { label: "Customer Level", value: b.cls.custLevel || DASH },
              { label: "Price Group", value: b.cls.priceGroup || DASH },
              { label: "Territory", value: b.cls.territory || DASH },
              { label: "Sales Channel", value: b.cls.channel || DASH },
            ],
          },

          {
            type: "fields",
            title: "Tax & Legal",
            cols: 2,
            items: [
              { label: "Legal Entity Type", value: t.entity },
              { label: "Registered Name", value: t.regName || DASH },
              { label: "Branch Type", value: t.branchType },
              { label: "Branch Number", value: t.branchNo },
              { label: "VAT Registered", value: t.vatReg ? "ใช่" : "ไม่ใช่" },
              { label: "VAT Registration Date", value: t.vatDate || DASH },
              { label: "Withholding Tax", value: t.wht ? "มีการหัก ณ ที่จ่าย" : "ไม่มี" },
              { label: "Country of Registration", value: t.country },
            ],
          },

          /* ---- Gallery. Cover first, the rest in upload order. ---- */
          {
            type: "table",
            title: `Images (${b.imageCount})`,
            rows: b.images ?? [],
            empty: "ยังไม่มีรูปภาพ — อัปโหลดได้จากหน้าแก้ไข",
            cols: [
              {
                key: "src",
                label: "Image",
                cell: (i) => (
                  <span className="inline-flex items-center gap-2">
                    <Thumb>{i.src}</Thumb>
                    {i.cover && <Badge tone="primary">Cover</Badge>}
                  </span>
                ),
              },
              { key: "name", label: "Name" },
              { key: "kind", label: "Type", muted: true },
              { key: "by", label: "Uploaded By", muted: true },
              { key: "date", label: "Upload Date", muted: true },
              { key: "remark", label: "Remark", muted: true },
            ],
          },

          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created Date", value: b.created, muted: true },
              { label: "Created By", value: b.createdBy, muted: true },
              { label: "Last Updated", value: b.updated, muted: true },
              { label: "Updated By", value: b.updatedBy, muted: true },
            ],
          },
        ];
      },
    },

    /* ============================================================
       2. ADDRESSES — summary of two, then the full list.
       ============================================================ */
    {
      key: "addresses",
      label: "Addresses",
      blocks: (b, ctx) => {
        const rows = b.addresses;
        const billing = bpBillingAddress(b);
        const delivery = bpDeliveryAddress(b);
        /* The spec shows two on the summary; the rest sit in the table
           below, which is already the "View All" the spec asks for. */
        const summary = rows.slice(0, 2);
        const rest = rows.length - summary.length;

        return [
          !rows.some(canBill) && {
            type: "alert",
            tone: "danger",
            title: "ไม่มีที่อยู่สำหรับออกใบกำกับภาษี",
            message: "ต้องมีที่อยู่ประเภท Billing, Both, Head Office หรือ Branch อย่างน้อย 1 แห่ง",
          },
          !rows.some(canDeliver) && {
            type: "alert",
            tone: "info",
            title: "ยังไม่มีที่อยู่จัดส่ง",
            message: "ระบบจะใช้ที่อยู่ออกบิลเป็นที่อยู่จัดส่งจนกว่าจะกำหนดเพิ่ม",
          },

          {
            type: "cards",
            title: "Default Addresses",
            cols: 2,
            items: [
              {
                label: "Primary Billing",
                value: billing ? billing.name : DASH,
                sub: addressLine(billing),
                tone: "accent",
              },
              {
                label: "Primary Delivery",
                value: delivery ? delivery.name : "ใช้ที่อยู่ออกบิล",
                sub: delivery ? addressLine(delivery) : addressLine(billing),
              },
            ],
          },

          {
            type: "entity",
            title: `Address Summary (${summary.length} จาก ${rows.length})`,
            empty: "ยังไม่มีที่อยู่",
            items: summary.map((a) => ({
              name: a.name,
              sub: `${a.type} · ${addressLine(a)}`,
              avatar: a.image || "📍",
              end: (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {a.billingPrimary && <Badge tone="primary">Billing</Badge>}
                  {a.deliveryPrimary && <Badge tone="info">Delivery</Badge>}
                  {!a.active && <Badge tone="neutral">Inactive</Badge>}
                </span>
              ),
            })),
          },

          rest > 0 && {
            type: "note",
            text: `อีก ${rest} ที่อยู่แสดงในตารางด้านล่าง — View All Addresses`,
          },

          {
            type: "table",
            title: `All Addresses (${rows.length})`,
            rows,
            empty: "ยังไม่มีที่อยู่",
            cols: [
              {
                key: "name",
                label: "Address Name",
                cell: (a) => (
                  <>
                    {a.name}
                    <span className="ml-1.5 inline-flex gap-1">
                      {a.billingPrimary && <Badge tone="primary">Billing</Badge>}
                      {a.deliveryPrimary && <Badge tone="info">Delivery</Badge>}
                    </span>
                  </>
                ),
              },
              { key: "type", label: "Type", cell: (a) => <Badge tone="neutral">{a.type}</Badge> },
              { key: "full", label: "Address Line", cell: (a) => addressLine(a) },
              { key: "sub", label: "Sub District", muted: true },
              { key: "dist", label: "District", muted: true },
              { key: "prov", label: "Province", muted: true },
              { key: "zip", label: "Postal Code", muted: true },
              { key: "country", label: "Country", muted: true },
              { key: "contact", label: "Contact Person", muted: true },
              {
                key: "phone",
                label: "Phone",
                cell: (a) => <span className="tnum">{a.phone || DASH}</span>,
              },
              { key: "email", label: "Email", muted: true, cell: (a) => a.email || DASH },
              {
                key: "geo",
                label: "Map",
                cell: (a) =>
                  hasCoordinates(a) ? (
                    <button
                      onClick={() => ctx.goto(mapUrl(a))}
                      className="inline-flex items-center gap-1 font-medium text-info hover:underline"
                    >
                      <Icon name="mapPin" size={14} />
                      <span className="tnum">
                        {a.lat}, {a.lng}
                      </span>
                    </button>
                  ) : (
                    <span className="text-ink-3">{DASH}</span>
                  ),
              },
              { key: "remark", label: "Remark", muted: true, cell: (a) => a.remark || DASH },
            ],
          },

          /* Coordinates are stored for the mobile app; the embed itself is
             a Phase 2 concern, so the placeholder names what is held. */
          {
            type: "planned",
            title: "Map",
            label: "Embedded Map",
            message: `${rows.filter(hasCoordinates).length} จาก ${rows.length} ที่อยู่มีพิกัดพร้อมใช้งานบนแอปมือถือ`,
          },
        ];
      },
    },

    /* ============================================================
       3. CONTACTS
       ============================================================ */
    {
      key: "contacts",
      label: "Contacts",
      blocks: (b) => [
        {
          type: "table",
          title: `Contact Persons (${b.contactCount})`,
          rows: b.contacts,
          empty: "ยังไม่มีผู้ติดต่อ",
          cols: [
            { key: "code", label: "Code", muted: true },
            {
              key: "name",
              label: "Name",
              cell: (c) => (
                <>
                  {c.prefix}
                  {c.first} {c.last}
                  {c.primary && (
                    <span className="ml-1.5">
                      <Badge tone="primary">Primary</Badge>
                    </span>
                  )}
                </>
              ),
            },
            { key: "pos", label: "Position", muted: true },
            { key: "dept", label: "Department", muted: true },
            {
              key: "phone",
              label: "Phone",
              cell: (c) => <span className="tnum">{c.phone || DASH}</span>,
            },
            {
              key: "mobile",
              label: "Mobile",
              cell: (c) => <span className="tnum">{c.mobile || DASH}</span>,
            },
            { key: "email", label: "Email", muted: true, cell: (c) => c.email || DASH },
            { key: "method", label: "Preferred", muted: true },
            { key: "remark", label: "Remark", muted: true, cell: (c) => c.remark || DASH },
            {
              key: "active",
              label: "Status",
              cell: (c) => (
                <Badge tone={c.active ? "success" : "neutral"}>
                  {c.active ? "Active" : "Inactive"}
                </Badge>
              ),
            },
          ],
        },
      ],
    },

    /* ============================================================
       4. CUSTOMER — only when the partner sells to us.
       ============================================================ */
    {
      key: "customer",
      label: "Customer",
      when: (b) => Boolean(b.customer),
      blocks: (b) => {
        const c = b.customer!;
        if (!checkPermission("canViewCredit")) {
          return [
            {
              type: "fields",
              title: "Customer Information",
              cols: 2,
              items: [
                { label: "Customer Type", value: c.custType },
                { label: "Business Type", value: c.bizType },
                { label: "Benefit Level", value: c.benefit },
                { label: "Customer Size", value: c.size },
                { label: "Sales Representative", value: c.rep },
                { label: "Default Price List", value: c.priceList },
              ],
            },
            { type: "restricted", title: "Credit" },
          ];
        }

        const over = c.creditUsed > c.creditLimit && c.creditLimit > 0;
        return [
          c.creditHold && {
            type: "alert",
            tone: "danger",
            title: "ลูกค้ารายนี้ถูกระงับเครดิต",
            message: c.holdReason || "ติดต่อฝ่ายการเงินก่อนเปิดคำสั่งขายใหม่",
          },
          over && {
            type: "alert",
            tone: "warn",
            title: "ยอดใช้เครดิตเกินวงเงิน",
            message: `เกินวงเงิน ${money0(c.creditUsed - c.creditLimit)} THB`,
          },

          {
            type: "fields",
            title: "Customer Information",
            cols: 2,
            items: [
              { label: "Customer Type", value: c.custType },
              { label: "Business Type", value: c.bizType },
              {
                label: "Benefit Level",
                value:
                  c.benefit === "Custom" ? `Custom — ${c.benefitPct}%` : c.benefit,
              },
              { label: "Customer Size", value: <Badge tone="neutral">{c.size}</Badge> },
              { label: "Sales Representative", value: c.rep },
              { label: "Default Price List", value: c.priceList },
              {
                label: "Risk Level",
                value: <Badge tone={tone(RISK_TONE, c.risk)}>{c.risk}</Badge>,
              },
              { label: "Payment Method", value: c.payMethod },
            ],
          },

          {
            type: "cards",
            title: "Credit",
            items: [
              { label: "Credit Limit", value: money0(c.creditLimit), unit: "THB", tone: "accent" },
              { label: "Current Credit Used", value: money0(c.creditUsed), unit: "THB" },
              {
                label: "Available Credit",
                value: money0(b.availableCredit),
                unit: "THB",
                tone: over ? "warn" : undefined,
              },
              {
                label: "Credit Hold",
                value: c.creditHold ? "ระงับ" : "ปกติ",
                tone: c.creditHold ? "warn" : undefined,
              },
            ],
          },

          {
            type: "fields",
            title: "Credit Terms",
            cols: 2,
            items: [
              { label: "Credit Term", value: b.creditTerm === "No Credit" ? "No Credit" : `${b.creditTerm} วัน` },
              { label: "Payment Term", value: b.credit.payTerm },
              { label: "Credit Status", value: <Badge tone={tone(CREDIT_TONE, b.creditStatus)}>{b.creditStatus}</Badge> },
              { label: "Credit Days", value: `${b.credit.days} วัน` },
              { label: "Open Sales Orders", value: `${money0(b.credit.openSO)} THB` },
              { label: "Open Invoices", value: `${money0(b.credit.openInv)} THB` },
              { label: "Credit Hold Reason", value: c.holdReason || DASH },
              { label: "Approved By", value: b.credit.approvedBy || DASH },
            ],
          },
        ];
      },
    },

    /* ============================================================
       5. SUPPLIER — only when the partner sells to us.
       ============================================================ */
    {
      key: "supplier",
      label: "Supplier",
      when: (b) => Boolean(b.supplier),
      blocks: (b) => {
        const s = b.supplier!;
        const p = b.purchasing;
        const items = b.supplierItems ?? [];

        return [
          {
            type: "fields",
            title: "Supplier Information",
            cols: 2,
            items: [
              { label: "Supplier Type", value: s.supType },
              {
                label: "Supplier Status",
                value: (
                  <Badge tone={tone(SUPPLIER_STATUS_TONE, s.status)}>{s.status}</Badge>
                ),
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

          {
            type: "cards",
            title: "Supplier Items",
            cols: 3,
            items: [
              { label: "Quoted Items", value: fmt(items.length), tone: "accent" },
              { label: "Preferred Items", value: fmt(items.filter((i) => i.preferred).length) },
              { label: "Average Lead Time", value: `${bpAverageLeadTime(b)}`, unit: "วัน" },
            ],
          },

          {
            type: "table",
            title: `Supplier Items (${items.length})`,
            rows: items,
            empty: "ยังไม่มีรายการสินค้าที่เสนอราคา",
            cols: [
              { key: "product", label: "Product" },
              { key: "productName", label: "Product Name", muted: true },
              { key: "sku", label: "Supplier SKU", cell: (i) => <span className="tnum">{i.sku}</span> },
              { key: "supName", label: "Supplier Product Name", muted: true },
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
                    tone={
                      i.status === "Active" ? "success" : i.status === "Expired" ? "danger" : "neutral"
                    }
                  >
                    {i.status}
                  </Badge>
                ),
              },
              { key: "effective", label: "Effective Date", muted: true },
              { key: "expiry", label: "Expiry Date", muted: true, cell: (i) => i.expiry || DASH },
            ],
          },
        ];
      },
    },

    /* ============================================================
       6. BANK ACCOUNTS
       ============================================================ */
    {
      key: "banks",
      label: "Bank Accounts",
      blocks: (b) => [
        !checkPermission("canViewBank") && {
          type: "alert",
          tone: "warn",
          title: "ข้อมูลบัญชีธนาคารถูกปกปิดบางส่วน",
          message: "เลขบัญชีถูกปกปิดตามสิทธิ์ — ต้องมีสิทธิ์ Finance จึงจะเห็นข้อมูลเต็ม",
        },
        {
          type: "table",
          title: `Bank Accounts (${b.bankCount})`,
          rows: b.banks,
          empty: "ยังไม่มีบัญชีธนาคาร",
          cols: [
            { key: "bank", label: "Bank Name" },
            { key: "branch", label: "Branch", muted: true },
            { key: "accName", label: "Account Name" },
            {
              key: "accNo",
              label: "Account Number",
              cell: (a) => <span className="tnum">{maskAccount(a.accNo)}</span>,
            },
            { key: "swift", label: "SWIFT Code", muted: true, cell: (a) => a.swift || DASH },
            { key: "accType", label: "Type", muted: true },
            { key: "currency", label: "Currency", muted: true },
            {
              key: "def",
              label: "Default Account",
              cell: (a) =>
                a.def ? <Badge tone="primary">Default</Badge> : <span className="text-ink-3">{DASH}</span>,
            },
            {
              key: "active",
              label: "Status",
              cell: (a) => (
                <Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Active" : "Inactive"}</Badge>
              ),
            },
          ],
        },
      ],
    },

    /* ============================================================
       7. ATTACHMENTS
       ============================================================ */
    {
      key: "attachments",
      label: "Attachments",
      blocks: (b) => {
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
            type: "table",
            title: `Attachments (${b.docCount})`,
            rows: b.docs,
            empty: "ยังไม่มีเอกสารแนบ",
            cols: [
              {
                key: "type",
                label: "Document Type",
                cell: (d) => <Badge tone="neutral">{d.type}</Badge>,
              },
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
              { key: "issue", label: "Issue Date", muted: true, cell: (d) => d.issue || DASH },
              {
                key: "expiry",
                label: "Expiry Date",
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
                cell: (d) => (
                  <Badge tone={d.status === "Active" ? "success" : "warning"}>{d.status}</Badge>
                ),
              },
              { key: "remark", label: "Remark", muted: true, cell: (d) => d.remark || DASH },
            ],
          },
        ];
      },
    },

    /* ============================================================
       8. SALES REPORT — live, joined on customerCode.
       ============================================================ */
    {
      key: "sales-report",
      label: "Sales Report",
      when: (b) => Boolean(b.customer),
      blocks: (b, ctx) => {
        const kpi = bpCustomerKpi(b);
        const orders = bpSalesOrders(b);
        const top = bpTopProducts(b);
        const recorded = b.txn?.so ?? [];

        return [
          {
            type: "cards",
            title: "Customer KPI",
            items: [
              { label: "Sales Orders", value: fmt(kpi.orders), tone: "accent" },
              { label: "Total Revenue", value: money0(kpi.revenue), unit: "THB" },
              { label: "Average Order", value: money0(kpi.avgOrder), unit: "THB" },
              { label: "Open Orders", value: fmt(kpi.openOrders) },
            ],
          },
          {
            type: "cards",
            title: "Sales Summary",
            cols: 3,
            items: [
              {
                label: "Last Purchase",
                value: kpi.lastOrderDate || DASH,
                sub: kpi.lastOrderAmount ? `${money0(kpi.lastOrderAmount)} THB` : "",
              },
              { label: "Distinct Products", value: fmt(kpi.skus), unit: "SKU" },
              {
                label: "Outstanding",
                value: money0(kpi.outstanding),
                unit: "THB",
                tone: kpi.overdue > 0 ? "warn" : undefined,
                sub: kpi.overdue > 0 ? `เกินกำหนด ${kpi.overdue} ใบ` : "",
              },
            ],
          },
          {
            type: "table",
            title: `Recent Sales Orders (${orders.length})`,
            rows: orders.slice(0, 10),
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
              { key: "deliveryDate", label: "Delivery Date", muted: true },
              { key: "itemCount", label: "Items", align: "right" },
              { key: "total", label: "Amount", align: "right", cell: (s) => money0(s.total) },
              { key: "status", label: "Status", cell: (s) => <Badge tone="neutral">{s.status}</Badge> },
            ],
          },
          {
            type: "table",
            title: "Top Products",
            rows: top,
            empty: "ยังไม่มีประวัติการซื้อสินค้า",
            cols: [
              { key: "code", label: "Product" },
              { key: "name", label: "Product Name", muted: true },
              { key: "qty", label: "Qty", align: "right", cell: (t) => fmt(t.qty) },
              { key: "orders", label: "Orders", align: "right" },
              { key: "amount", label: "Amount", align: "right", cell: (t) => money0(t.amount) },
            ],
          },
          recorded.length > 0 && {
            type: "table",
            title: "Recorded on the Partner",
            rows: recorded,
            empty: "",
            cols: [
              { key: "no", label: "SO No." },
              { key: "date", label: "Date", muted: true },
              { key: "amount", label: "Amount", align: "right", cell: (r) => money0(r.amount) },
              { key: "status", label: "Status", cell: (r) => <Badge tone="neutral">{r.status}</Badge> },
            ],
          },
        ];
      },
    },

    /* ============================================================
       9. PURCHASE HISTORY
       ============================================================ */
    {
      key: "purchase-history",
      label: "Purchase History",
      when: (b) => Boolean(b.supplier),
      blocks: (b, ctx) => {
        const kpi = bpPurchaseKpi(b);
        const pos = bpPurchaseOrders(b);
        const grs = bpGoodsReceipts(b);
        const top = bpTopPurchasedProducts(b);
        const recorded = b.txn?.po ?? [];

        return [
          kpi.fromRecord && {
            type: "alert",
            tone: "info",
            title: "ยอดซื้อมาจากข้อมูลบนระเบียนคู่ค้า",
            message:
              "ใบสั่งซื้อและใบรับสินค้าในระบบยังอ้างอิงผู้ขายด้วยชื่อ ไม่ใช่รหัสคู่ค้า จึงจับคู่อัตโนมัติไม่ได้ — เป็นงาน Master Data ที่ต้องเชื่อมภายหลัง",
          },
          {
            type: "cards",
            title: "Purchase Summary",
            items: [
              { label: "Purchase Orders", value: fmt(kpi.orders), tone: "accent" },
              { label: "Total Spend", value: money0(kpi.spend), unit: "THB" },
              { label: "Average Order", value: money0(kpi.avgOrder), unit: "THB" },
              { label: "Average Lead Time", value: `${kpi.avgLeadTime}`, unit: "วัน" },
            ],
          },
          {
            type: "cards",
            title: "Activity",
            cols: 3,
            items: [
              {
                label: "Last Purchase",
                value: kpi.lastOrderDate || DASH,
                sub: kpi.lastOrderAmount ? `${money0(kpi.lastOrderAmount)} THB` : "",
              },
              { label: "Goods Receipts", value: fmt(kpi.receipts) },
              { label: "Quoted Items", value: fmt(kpi.quotedItems), sub: `Preferred ${kpi.preferredItems}` },
            ],
          },
          {
            type: "table",
            title: `Purchase Orders (${pos.length || recorded.length})`,
            rows: pos.length ? pos : recorded,
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
                  { key: "expectedDate", label: "Expected", muted: true },
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
          {
            type: "table",
            title: `Goods Receipts (${grs.length})`,
            rows: grs.slice(0, 10),
            empty: "ยังไม่มีใบรับสินค้าที่จับคู่กับผู้ขายรายนี้",
            cols: [
              { key: "code", label: "GR No." },
              { key: "receiptDate", label: "Receipt Date", muted: true },
              { key: "warehouse", label: "Warehouse", muted: true },
              { key: "totalReceiving", label: "Qty", align: "right", cell: (g) => fmt(g.totalReceiving) },
              { key: "status", label: "Status", cell: (g) => <Badge tone="neutral">{g.status}</Badge> },
            ],
          },
          {
            type: "table",
            title: "Top Purchased Products",
            rows: top,
            empty: "ยังไม่มีรายการสินค้า",
            cols: [
              { key: "code", label: "Product" },
              { key: "name", label: "Product Name", muted: true },
              { key: "qty", label: "Qty", align: "right", cell: (t) => fmt(t.qty) },
              { key: "amount", label: "Amount", align: "right", cell: (t) => money0(t.amount) },
            ],
          },
          {
            type: "planned",
            title: "Supplier Claims",
            label: "Supplier Claim",
            message: "โมดูล Supplier Claim อยู่ใน Roadmap — เคลมของผู้ขายรายนี้จะแสดงที่นี่",
          },
        ];
      },
    },

    /* ============================================================
       10. ACTIVITY TIMELINE
       ============================================================ */
    {
      key: "activity",
      label: "Activity Timeline",
      blocks: (b) => [
        {
          type: "timeline",
          title: `Activity (${b.history.length})`,
          items: b.history.map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },

    /* ============================================================
       11. AUDIT LOG
       ============================================================ */
    {
      key: "audit",
      label: "Audit Log",
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
          title: "Change Log",
          items: b.history.map((e) => ({
            event: e.t,
            user: e.u,
            when: e.when,
            field: e.d,
            kind: e.kind,
          })),
        },
        {
          type: "note",
          text: "บันทึกการเปลี่ยนแปลงระดับฟิลด์ (ค่าเดิม → ค่าใหม่) จะบันทึกครบเมื่อเชื่อมต่อ API จริง — ปัจจุบันเก็บเป็นเหตุการณ์ระดับเอกสาร",
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
